import {
  normalizeHeader,
  autoDetect,
  normalizeSex,
  normalizeDate,
  normalizeCpf,
  normalizePhone,
  safeString,
  isEmpty,
} from './index.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// ---------------------------------------------------------------------------
// normalizeHeader
// ---------------------------------------------------------------------------

Deno.test('normalizeHeader lowercases and strips accents', () => {
  assert(normalizeHeader('Nascimento') === 'nascimento', 'lowercase')
  assert(normalizeHeader('Gênero') === 'genero', 'strips ê accent')
  assert(normalizeHeader('  Endereço  ') === 'endereco', 'trims and strips ç')
  assert(normalizeHeader('Observações') === 'observacoes', 'strips ções')
})

// ---------------------------------------------------------------------------
// autoDetect
// ---------------------------------------------------------------------------

Deno.test('autoDetect maps common Portuguese/English headers to field keys', () => {
  assert(autoDetect('nome') === 'name', 'nome → name')
  assert(autoDetect('Paciente') === 'name', 'Paciente (case-insensitive) → name')
  assert(autoDetect('Data de Nascimento') === 'birth_date', 'Data de Nascimento → birth_date')
  assert(autoDetect('Gênero') === 'sex', 'Gênero (accented) → sex')
  assert(autoDetect('Celular') === 'phone', 'Celular → phone')
  assert(autoDetect('WhatsApp') === 'phone', 'WhatsApp → phone')
  assert(autoDetect('E-mail') === 'email', 'E-mail → email')
  assert(autoDetect('CEP') === 'address_zip', 'CEP → address_zip')
  assert(autoDetect('UF') === 'address_state', 'UF → address_state')
  assert(autoDetect('Bairro') === 'address_neighborhood', 'Bairro → address_neighborhood')
  assert(autoDetect('observações') === 'notes', 'observações → notes')
})

Deno.test('autoDetect returns empty string for unknown headers', () => {
  assert(autoDetect('codigo_interno') === '', 'unknown returns empty')
  assert(autoDetect('') === '', 'empty string returns empty')
})

// ---------------------------------------------------------------------------
// normalizeSex
// ---------------------------------------------------------------------------

Deno.test('normalizeSex maps all masculine variants to M', () => {
  assert(normalizeSex('m') === 'M', 'm')
  assert(normalizeSex('Masc') === 'M', 'Masc')
  assert(normalizeSex('masculino') === 'M', 'masculino')
  assert(normalizeSex('Male') === 'M', 'Male')
})

Deno.test('normalizeSex maps all feminine variants to F', () => {
  assert(normalizeSex('f') === 'F', 'f')
  assert(normalizeSex('Fem') === 'F', 'Fem')
  assert(normalizeSex('feminino') === 'F', 'feminino')
  assert(normalizeSex('female') === 'F', 'female')
})

Deno.test('normalizeSex maps other/na variants to O', () => {
  assert(normalizeSex('o') === 'O', 'o')
  assert(normalizeSex('outro') === 'O', 'outro')
  assert(normalizeSex('na') === 'O', 'na')
  assert(normalizeSex('N/A') === 'O', 'N/A')
})

Deno.test('normalizeSex returns null for unrecognized values', () => {
  assert(normalizeSex('x') === null, 'x')
  assert(normalizeSex('') === null, 'empty')
  assert(normalizeSex('sim') === null, 'sim')
})

// ---------------------------------------------------------------------------
// normalizeDate
// ---------------------------------------------------------------------------

Deno.test('normalizeDate accepts ISO format unchanged', () => {
  assert(normalizeDate('2000-03-15') === '2000-03-15', 'ISO passthrough')
})

Deno.test('normalizeDate converts Brazilian DD/MM/YYYY format', () => {
  assert(normalizeDate('15/03/2000') === '2000-03-15', 'DD/MM/YYYY with slash')
  assert(normalizeDate('5/3/2000') === '2000-03-05', 'D/M/YYYY single digit')
  assert(normalizeDate('15-03-2000') === '2000-03-15', 'DD-MM-YYYY with dash')
})

Deno.test('normalizeDate handles 2-digit year by prepending 20', () => {
  assert(normalizeDate('15/03/00') === '2000-03-15', '2-digit year → 2000')
  assert(normalizeDate('1/1/99') === '2099-01-01', '2-digit year 99 → 2099')
})

Deno.test('normalizeDate returns null for empty or unparseable input', () => {
  assert(normalizeDate('') === null, 'empty string')
  assert(normalizeDate('not-a-date') === null, 'garbage')
  assert(normalizeDate('hello world') === null, 'free text')
})

// ---------------------------------------------------------------------------
// normalizeCpf
// ---------------------------------------------------------------------------

Deno.test('normalizeCpf strips formatting and returns digits for valid CPF', () => {
  assert(normalizeCpf('123.456.789-09') === '12345678909', 'formatted CPF')
  assert(normalizeCpf('12345678909') === '12345678909', 'raw digits')
})

Deno.test('normalizeCpf returns null for CPFs that are not exactly 11 digits', () => {
  assert(normalizeCpf('12345') === null, 'too short')
  assert(normalizeCpf('123456789012') === null, '12 digits')
  assert(normalizeCpf(null) === null, 'null input')
  assert(normalizeCpf('') === null, 'empty string')
})

// ---------------------------------------------------------------------------
// normalizePhone
// ---------------------------------------------------------------------------

Deno.test('normalizePhone strips formatting and accepts ≥ 10 digits', () => {
  assert(normalizePhone('(11) 91234-5678') === '11912345678', 'formatted mobile')
  assert(normalizePhone('11912345678') === '11912345678', 'raw 11 digits')
  assert(normalizePhone('1198765432') === '1198765432', '10-digit landline')
})

Deno.test('normalizePhone returns null for short or null input', () => {
  assert(normalizePhone('123456789') === null, '9 digits')
  assert(normalizePhone(null) === null, 'null')
  assert(normalizePhone('') === null, 'empty')
})

// ---------------------------------------------------------------------------
// safeString
// ---------------------------------------------------------------------------

Deno.test('safeString returns trimmed string for string input', () => {
  assert(safeString('  hello  ') === 'hello', 'trims')
  assert(safeString('ok') === 'ok', 'no change')
})

Deno.test('safeString returns empty string for non-string input', () => {
  assert(safeString(null) === '', 'null')
  assert(safeString(undefined) === '', 'undefined')
  assert(safeString(42) === '', 'number')
  assert(safeString({}) === '', 'object')
})

// ---------------------------------------------------------------------------
// isEmpty
// ---------------------------------------------------------------------------

Deno.test('isEmpty returns true for null, undefined, empty string, and whitespace', () => {
  assert(isEmpty(null) === true, 'null')
  assert(isEmpty(undefined) === true, 'undefined')
  assert(isEmpty('') === true, 'empty string')
  assert(isEmpty('   ') === true, 'whitespace only')
})

Deno.test('isEmpty returns false for strings with content', () => {
  assert(isEmpty('a') === false, 'single char')
  assert(isEmpty('  hello  ') === false, 'padded string')
})
