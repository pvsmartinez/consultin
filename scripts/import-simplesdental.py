#!/usr/bin/env python3
"""Reconcile a Simples Dental export into a Consultin clinic.

The original migration was a one-off that is no longer around, and it left the clinic
with two problems this script exists to fix:

  * it dropped every cancelled / no-show appointment (~1.9k rows, 35% of the history),
    so cancellation and no-show rates were impossible to report on;
  * it was a snapshot with no update path, so appointments whose status later changed in
    Simples Dental stayed frozen at whatever they were on import day.

So this is a reconciler, not an importer: it is idempotent on
`appointments.external_ref` (unique per clinic) and can be re-run to pick up changes.

Dry-run by default — it prints a plan and writes SQL, and never touches the database
itself. Apply the generated file with:

    supabase db query --linked -f <out>.sql

Inputs
------
--dump      JSON produced by the browser-side extractor: {consultas, compromissos,
            profissionais, cadeiras}. Simples Dental's API is session-authenticated, so
            extraction runs in the browser and this script consumes its output.
--snapshot  JSON of the clinic's current state: {clinic_id, appointments, patients,
            professionals, service_types}.

Nested entities in the dump are JSON-LD-ish: the API expands an object the first time it
appears and afterwards emits only its "@id" string, so references are resolved against a
table built from the expanded occurrences.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

# Verified against the Simples Dental UI by cross-referencing 11 appointments whose
# labels were read off the rendered agenda. Codes 2 and 4 were never observed with a
# label (8 rows total) and are deliberately absent: unknown codes are reported, not
# guessed, because a wrong guess silently rewrites clinical history.
STATUS_MAP = {
    0: 'scheduled',   # Agendada
    1: 'confirmed',   # Confirmada
    3: 'completed',   # Finalizada
    5: 'cancelled',   # Cancelada pelo profissional
    6: 'cancelled',   # Cancelada pelo paciente
    7: 'no_show',     # Falta
}

# Cancellation reason is not representable in Consultin's single `cancelled` status, so
# it is preserved in the notes instead of being thrown away.
CANCEL_NOTE = {5: 'Cancelada pelo profissional', 6: 'Cancelada pelo paciente'}


# external_ref convention already in the database from the first migration. Matching it
# is what makes a re-run an update instead of 3.4k duplicates.
def ref_consulta(sd_id) -> str:
    return f'sd-consulta-{sd_id}'


def ref_paciente(sd_id) -> str:
    return f'sd-paciente-{sd_id}'


def ref_profissional(sd_id) -> str:
    return f'sd-profissional-{sd_id}'


def sql_str(value) -> str:
    if value is None:
        return 'null'
    return "'" + str(value).replace("'", "''") + "'"


class Resolver:
    """Resolves the dump's "@id" references back to their expanded objects."""

    def __init__(self, root):
        self.table: dict[str, dict] = {}
        self._index(root)

    def _index(self, node):
        if isinstance(node, dict):
            aid = node.get('@id')
            if isinstance(aid, str) and len(node) > 1:
                self.table.setdefault(aid, node)
            for v in node.values():
                self._index(v)
        elif isinstance(node, list):
            for v in node:
                self._index(v)

    def get(self, value):
        if isinstance(value, str):
            return self.table.get(value)
        if isinstance(value, dict):
            if len(value) == 1 and '@id' in value:
                return self.table.get(value['@id'])
            return value
        return None


def parse_dt(raw: str) -> datetime:
    # e.g. "2026-08-03T12:00:00.000+00:00"
    return datetime.fromisoformat(raw.replace('Z', '+00:00')).astimezone(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.strftime('%Y-%m-%dT%H:%M:%S+00:00')


def emit_blocks(dump, snap, res: Resolver, clinic_id: str, out_path: str) -> int:
    """Map Simples Dental 'compromissos' onto agenda_blocks.

    A compromisso has no patient — it is the clinic saying "no appointments here". Before
    agenda_blocks existed the only way to represent one was a fake appointment against a
    real patient, which is how full-day 09:00–18:00 "consultations" ended up in the data.
    """
    profs = snap['professionals']
    prof_by_ref = {p['external_ref']: p['id'] for p in profs if p.get('external_ref')}

    rows, skipped = [], 0
    # The extractor walks the API in date windows, so a period spanning two of them comes
    # back once per window (a year-end holiday shows up in Q4 and Q1). Dedupe by id so the
    # reported count matches what actually lands.
    seen_ids: set = set()
    for c in dump['compromissos']:
        if c.get('excluido'):
            continue
        if c['id'] in seen_ids:
            continue
        seen_ids.add(c['id'])
        start = parse_dt(c['dataInicial'])
        end = parse_dt(c['dataFinal'])
        if end <= start:
            skipped += 1
            continue
        prof = res.get(c.get('profissional')) or {}
        # An unresolvable professional becomes a clinic-wide block rather than being
        # dropped: losing the period entirely is worse than widening it.
        target = prof_by_ref.get(ref_profissional(prof.get('id'))) if prof.get('id') else None
        all_day = bool(c.get('diaInteiro')) or (end - start).total_seconds() >= 8 * 3600
        rows.append({
            'external_ref': f"sd-compromisso-{c['id']}",
            'professional_id': target,
            'starts_at': iso(start),
            'ends_at': iso(end),
            'all_day': all_day,
            'reason': (c.get('descricao') or '').strip() or None,
        })

    sql = ['-- Generated by scripts/import-simplesdental.py --blocks-only',
           '-- Idempotent on agenda_blocks.external_ref.', 'begin;']
    for r in rows:
        sql.append(
            'insert into agenda_blocks (clinic_id, professional_id, starts_at, ends_at, '
            'all_day, reason, external_ref) values ('
            f"{sql_str(clinic_id)}, {sql_str(r['professional_id'])}, {sql_str(r['starts_at'])}, "
            f"{sql_str(r['ends_at'])}, {'true' if r['all_day'] else 'false'}, "
            f"{sql_str(r['reason'])}, {sql_str(r['external_ref'])}) "
            'on conflict (clinic_id, external_ref) where external_ref is not null do update set '
            'professional_id = excluded.professional_id, starts_at = excluded.starts_at, '
            'ends_at = excluded.ends_at, all_day = excluded.all_day, reason = excluded.reason;')
    sql.append('commit;')
    with open(out_path, 'w') as fh:
        fh.write('\n'.join(sql) + '\n')

    por_prof = Counter('clínica toda' if not r['professional_id'] else 'profissional' for r in rows)
    print(f'compromissos -> agenda_blocks: {len(rows)}  (ignorados: {skipped})')
    print(f'  dia inteiro: {sum(1 for r in rows if r["all_day"])}')
    print(f'  escopo: {dict(por_prof)}')
    print(f'  sem motivo: {sum(1 for r in rows if not r["reason"])}')
    print(f'SQL escrito em {out_path}. Aplicar com:')
    print(f'  supabase db query --linked -f {out_path}')
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--dump', required=True)
    ap.add_argument('--snapshot', required=True)
    ap.add_argument('--out', default='simplesdental-reconcile.sql')
    ap.add_argument('--blocks-only', action='store_true',
                    help="migrate Simples Dental 'compromissos' into agenda_blocks. They all "
                         "carry disponivelAtendimento=false, i.e. 'no appointments in this "
                         "period' — the clinic's way of marking a holiday, trip or lunch.")
    ap.add_argument('--service-types-only', action='store_true',
                    help='emit only service_type_id backfills for rows that have none. '
                         'Touches nothing else — used to fill in the procedure the first '
                         'import dropped, without rewriting notes or times.')
    ap.add_argument('--apply', action='store_true',
                    help='only flips the wording of the report; this script never writes '
                         'to the database. Apply the emitted SQL yourself.')
    args = ap.parse_args()

    dump = json.load(open(args.dump))
    snap = json.load(open(args.snapshot))
    clinic_id = snap['clinic_id']
    res = Resolver(dump)

    if args.blocks_only:
        return emit_blocks(dump, snap, res, clinic_id, args.out)

    # ── existing state, keyed for lookup ──────────────────────────────────────
    existing = {a['external_ref']: a for a in snap['appointments'] if a.get('external_ref')}
    patients_by_ref = {p['external_ref']: p['id'] for p in snap['patients'] if p.get('external_ref')}
    service_by_name = {s['name']: s['id'] for s in snap['service_types']}
    profs = snap['professionals']
    prof_by_ref = {p['external_ref']: p['id'] for p in profs if p.get('external_ref')}

    def norm(name: str) -> str:
        return ' '.join((name or '').split()).lower()

    prof_by_name = {norm(p['name']): p['id'] for p in profs}

    # ── map SD professionals onto Consultin professionals ─────────────────────
    sd_profs = dump['profissionais']
    sd_profs = sd_profs if isinstance(sd_profs, list) else sd_profs.get('content', [])
    prof_map: dict[int, str] = {}
    unmatched_profs = []
    for p in sd_profs:
        sd_id, sd_name = p.get('id'), (p.get('nome') or '').strip()
        target = prof_by_ref.get(ref_profissional(sd_id)) or prof_by_name.get(norm(sd_name))
        if target:
            prof_map[sd_id] = target
        else:
            unmatched_profs.append((sd_id, sd_name))

    # ── walk the appointments and build a plan ───────────────────────────────
    inserts: list[dict] = []
    updates: list[dict] = []
    unchanged = 0
    skipped_status: Counter = Counter()
    skipped_rows: list[str] = []
    missing_patients: dict[str, str] = {}   # external_ref -> name
    needed_services: set[str] = set()
    blocked_by_prof: Counter = Counter()

    for c in dump['consultas']:
        if c.get('excluido'):
            continue
        code = c.get('status')
        if code not in STATUS_MAP:
            skipped_status[code] += 1
            skipped_rows.append(f"id={c.get('id')} status={code} "
                                f"data={c.get('dataFormatada')} {c.get('horaFormatada')}")
            continue

        sd_prof = res.get(c.get('profissional')) or {}
        prof_target = prof_map.get(sd_prof.get('id'))
        if not prof_target:
            blocked_by_prof[sd_prof.get('id')] += 1
            continue

        pac = res.get(c.get('paciente')) or {}
        pac_ref = ref_paciente(pac['id']) if pac.get('id') is not None else None
        if not pac_ref:
            skipped_rows.append(f"id={c.get('id')} sem paciente")
            continue
        patient_target = patients_by_ref.get(pac_ref)
        if not patient_target:
            missing_patients[pac_ref] = (pac.get('nome') or '').strip()

        rot = res.get(c.get('rotulo')) or {}
        service_name = (rot.get('nome') or '').strip() or None
        if service_name and service_name not in service_by_name:
            needed_services.add(service_name)

        start = parse_dt(c['data'])
        end = start + timedelta(minutes=int(c.get('tempoEstimado') or 30))
        status = STATUS_MAP[code]
        note_bits = [(c.get('descricao') or '').strip()]
        reason = CANCEL_NOTE.get(code)
        if reason:
            note_bits.append(reason)
        obs = (c.get('obsRetorno') or '').strip()
        if obs:
            note_bits.append(f'Retorno: {obs}')
        notes = ' · '.join([b for b in note_bits if b]) or None

        row = {
            'external_ref': ref_consulta(c['id']),
            'starts_at': iso(start),
            'ends_at': iso(end),
            'status': status,
            'patient_ref': pac_ref,
            'professional_id': prof_target,
            'service_name': service_name,
            'notes': notes,
        }

        prev = existing.get(row['external_ref'])
        if prev is None:
            inserts.append(row)
            continue

        prev_start = iso(parse_dt(prev['starts_at']))
        prev_end = iso(parse_dt(prev['ends_at']))
        # service_type is part of the comparison: the first import dropped the procedure
        # entirely, so rows that match on status and time can still be missing it.
        wants_service = service_name is not None
        has_service = prev.get('service_type_id') is not None
        if (prev['status'] != status or prev_start != row['starts_at']
                or prev_end != row['ends_at'] or (wants_service and not has_service)):
            row['was'] = f"{prev['status']} {prev_start}"
            updates.append(row)
        else:
            unchanged += 1

    orphans = [ref for ref in existing if ref not in
               {ref_consulta(c['id']) for c in dump['consultas']}]

    # ── report ───────────────────────────────────────────────────────────────
    print('=' * 66)
    print(f'clinica              {clinic_id}')
    print(f'origem (dump)        {len(dump["consultas"])} consultas, '
          f'{len(dump["compromissos"])} compromissos')
    print(f'destino (hoje)       {len(snap["appointments"])} consultas '
          f'({len(existing)} com external_ref)')
    print('-' * 66)
    print(f'INSERIR              {len(inserts)}')
    print(f'ATUALIZAR            {len(updates)}   (status/horario divergente)')
    print(f'ja iguais            {unchanged}')
    print(f'pacientes a criar    {len(missing_patients)}')
    print(f'service_types criar  {len(needed_services)}  {sorted(needed_services)}')
    if skipped_status:
        print(f'PULADAS status desconhecido  {dict(skipped_status)}')
        for r in skipped_rows[:12]:
            print(f'    {r}')
    if unmatched_profs:
        print(f'profissional SEM par no Consultin: {unmatched_profs}')
    if blocked_by_prof:
        print(f'consultas bloqueadas por profissional nao mapeado: {dict(blocked_by_prof)}')
    if orphans:
        print(f'no Consultin mas nao no dump: {len(orphans)} '
              f'(nao serao tocadas)')
    by_status = Counter(r['status'] for r in inserts)
    print(f'status dos INSERIR   {dict(by_status)}')
    print('=' * 66)

    # ── SQL ──────────────────────────────────────────────────────────────────
    out = [
        '-- Generated by scripts/import-simplesdental.py — review before applying.',
        '-- Idempotent: keyed on appointments.external_ref (unique per clinic).',
        'begin;',
        f"create temp table _sd_patient (external_ref text primary key, name text) on commit drop;",
    ]
    for ref, name in sorted(missing_patients.items()):
        out.append(f'insert into _sd_patient values ({sql_str(ref)}, {sql_str(name or "Paciente sem nome")});')
    out.append(f"""
insert into patients (clinic_id, name, external_ref)
select {sql_str(clinic_id)}, name, external_ref from _sd_patient
on conflict (clinic_id, external_ref) where external_ref is not null do nothing;""")

    for name in sorted(needed_services):
        out.append(
            f"insert into service_types (clinic_id, name, duration_minutes, active) "
            f"select {sql_str(clinic_id)}, {sql_str(name)}, 30, true "
            f"where not exists (select 1 from service_types where clinic_id={sql_str(clinic_id)} "
            f"and name={sql_str(name)});")

    def upsert(row: dict) -> str:
        service = ('(select id from service_types where clinic_id=' + sql_str(clinic_id)
                   + ' and name=' + sql_str(row['service_name']) + ' limit 1)'
                   ) if row['service_name'] else 'null'
        return (
            'insert into appointments (clinic_id, patient_id, professional_id, starts_at, '
            'ends_at, status, notes, service_type_id, source, external_ref) values ('
            f"{sql_str(clinic_id)}, "
            f"(select id from patients where clinic_id={sql_str(clinic_id)} and external_ref={sql_str(row['patient_ref'])} limit 1), "
            f"{sql_str(row['professional_id'])}, {sql_str(row['starts_at'])}, {sql_str(row['ends_at'])}, "
            f"{sql_str(row['status'])}::appointment_status, {sql_str(row['notes'])}, {service}, "
            f"'simplesdental', {sql_str(row['external_ref'])}) "
            # idx_appointments_clinic_external_ref is a plain unique index (unlike the
            # partial one on patients), so no predicate here or inference fails.
            'on conflict (clinic_id, external_ref) do update set '
            'starts_at = excluded.starts_at, ends_at = excluded.ends_at, '
            'status = excluded.status, notes = excluded.notes, '
            'service_type_id = coalesce(excluded.service_type_id, appointments.service_type_id);')

    if args.service_types_only:
        out = ['-- Generated by scripts/import-simplesdental.py --service-types-only',
               '-- Fills service_type_id where it is missing. Changes nothing else.',
               'begin;']
        for name in sorted(needed_services):
            out.append(
                f"insert into service_types (clinic_id, name, duration_minutes, active) "
                f"select {sql_str(clinic_id)}, {sql_str(name)}, 30, true "
                f"where not exists (select 1 from service_types where clinic_id={sql_str(clinic_id)} "
                f"and name={sql_str(name)});")
        touched = 0
        for row in inserts + updates:
            if not row['service_name']:
                continue
            touched += 1
            out.append(
                'update appointments set service_type_id = (select id from service_types where '
                f'clinic_id={sql_str(clinic_id)} and name={sql_str(row["service_name"])} limit 1) '
                f'where clinic_id={sql_str(clinic_id)} and external_ref={sql_str(row["external_ref"])} '
                'and service_type_id is null;')
        out.append('commit;')
        print(f'modo service-types-only: {touched} linhas de backfill')
    else:
        for row in inserts + updates:
            out.append(upsert(row))
        out.append('commit;')

    with open(args.out, 'w') as fh:
        fh.write('\n'.join(out) + '\n')
    print(f'SQL escrito em {args.out} ({len(inserts) + len(updates)} upserts)')
    print('NADA foi escrito no banco. Para aplicar:')
    print(f'  supabase db query --linked -f {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
