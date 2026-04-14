import { describe, expect, it } from 'vitest'
import {
  autoDetectPatientHeader,
  buildFallbackCustomFieldSuggestions,
  inferCustomFieldType,
  normalizeImportedDate,
} from '../utils/patientImport'

describe('patient import heuristics', () => {
  it('auto-detects common patient headers in PT-BR', () => {
    expect(autoDetectPatientHeader('Nome do paciente')).toBe('')
    expect(autoDetectPatientHeader('Nome')).toBe('name')
    expect(autoDetectPatientHeader('Telefone')).toBe('phone')
    expect(autoDetectPatientHeader('Data de nascimento')).toBe('birth_date')
    expect(autoDetectPatientHeader('Observações')).toBe('notes')
  })

  it('normalizes supported date formats', () => {
    expect(normalizeImportedDate('13/04/2026')).toBe('2026-04-13')
    expect(normalizeImportedDate('2026-04-13')).toBe('2026-04-13')
    expect(normalizeImportedDate('13-04-2026')).toBe('2026-04-13')
    expect(normalizeImportedDate('')).toBeNull()
  })

  it('infers boolean, number, date, select and textarea custom fields', () => {
    expect(inferCustomFieldType(['sim', 'não', 'sim'])).toBe('boolean')
    expect(inferCustomFieldType(['10', '12', '15'])).toBe('number')
    expect(inferCustomFieldType(['13/04/2026', '14/04/2026'])).toBe('date')
    expect(inferCustomFieldType(['Bronze', 'Prata', 'Bronze', 'Ouro'])).toBe('select')
    expect(inferCustomFieldType([
      'Paciente relata dor persistente na região lombar há mais de três semanas, com piora progressiva ao longo do dia.',
    ])).toBe('textarea')
  })

  it('builds fallback custom field suggestions for unmapped columns only', () => {
    const suggestions = buildFallbackCustomFieldSuggestions(
      ['Nome', 'Telefone', 'Convênio', 'Plano', 'Observações longas'],
      { name: 'Nome', phone: 'Telefone' },
      [
        ['João', '11999999999', 'Unimed', 'Premium', 'Primeira anotação longa sobre o paciente e seu contexto clínico.'],
        ['Maria', '11888888888', 'Bradesco', 'Premium', 'Segunda anotação extremamente detalhada com histórico completo, sintomas recorrentes, resposta a tratamento anterior e observações adicionais importantes para acompanhamento clínico.'],
      ],
      [],
    )

    expect(suggestions.map(item => item.header)).toEqual(['Convênio', 'Plano', 'Observações longas'])
    expect(suggestions.find(item => item.header === 'Convênio')?.type).toBe('select')
    expect(suggestions.find(item => item.header === 'Observações longas')?.type).toBe('textarea')
  })

  it('avoids reusing keys that already exist in the clinic config', () => {
    const suggestions = buildFallbackCustomFieldSuggestions(
      ['Convênio'],
      {},
      [['Unimed'], ['Bradesco']],
      [{ key: 'convenio', label: 'Convênio', type: 'select', required: false, options: ['Unimed'] }],
    )

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].key).toBe('convenio_2')
  })
})