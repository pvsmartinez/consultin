import { normalizePhone, buildReminderText } from './index.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// ─── normalizePhone ───────────────────────────────────────────────────────────

Deno.test('normalizePhone returns null for invalid/short numbers', () => {
  const invalid = ['', '  ', '999', '119', '5511', '+55 (11)', 'abc']
  for (const raw of invalid) {
    const result = normalizePhone(raw)
    assert(result === null, `Expected null for '${raw}', got '${result}'`)
  }
})

Deno.test('normalizePhone adds 55 prefix for 11-digit local mobile numbers', () => {
  const result = normalizePhone('11987654321')
  assert(result === '5511987654321', `Expected '5511987654321', got '${result}'`)
})

Deno.test('normalizePhone adds 55 prefix for 10-digit local landline numbers', () => {
  const result = normalizePhone('1134567890')
  assert(result === '551134567890', `Expected '551134567890', got '${result}'`)
})

Deno.test('normalizePhone strips formatting and retains full E.164 number', () => {
  const cases: [string, string][] = [
    ['+55 (11) 98765-4321', '5511987654321'],
    ['55 11 98765 4321',    '5511987654321'],
    ['5511987654321',       '5511987654321'],
  ]
  for (const [input, expected] of cases) {
    const got = normalizePhone(input)
    assert(got === expected, `normalizePhone('${input}'): expected '${expected}', got '${got}'`)
  }
})

Deno.test('normalizePhone does not add 55 to already-prefixed numbers', () => {
  const result = normalizePhone('5511987654321')
  assert(result === '5511987654321', `Should not double-prefix: ${result}`)
})

// ─── buildReminderText ────────────────────────────────────────────────────────

Deno.test('buildReminderText replaces all four variables', () => {
  const template = 'Olá {{nome}}, sua consulta é em {{data}} às {{hora}} com {{profissional}}.'
  const result = buildReminderText(template, {
    nome: 'Maria', data: '15/05/2026', hora: '14:30', profissional: 'Dr. Carlos',
  })
  assert(result === 'Olá Maria, sua consulta é em 15/05/2026 às 14:30 com Dr. Carlos.', `Unexpected: ${result}`)
})

Deno.test('buildReminderText replaces all occurrences of each variable (global flag)', () => {
  const template = '{{nome}} confirmado. Lembrete para {{nome}} em {{data}} às {{hora}} com {{profissional}}.'
  const result = buildReminderText(template, {
    nome: 'Ana', data: '01/06/2026', hora: '09:00', profissional: 'Dra. Paula',
  })
  assert(!result.includes('{{nome}}'), `{{nome}} was not fully replaced: ${result}`)
  assert(result.split('Ana').length === 3, `Expected 2 occurrences of 'Ana': ${result}`)
})

Deno.test('buildReminderText returns template unchanged when no variables present', () => {
  const template = 'Consulta confirmada. Até logo!'
  const result = buildReminderText(template, {
    nome: 'João', data: '01/01/2026', hora: '10:00', profissional: 'Dr. X',
  })
  assert(result === template, `Expected unchanged template: ${result}`)
})

Deno.test('buildReminderText leaves unknown placeholders untouched', () => {
  const template = 'Clínica {{clinica}}, paciente {{nome}}.'
  const result = buildReminderText(template, {
    nome: 'Pedro', data: '', hora: '', profissional: '',
  })
  assert(result.includes('{{clinica}}'), 'Unknown placeholder should be preserved')
  assert(!result.includes('{{nome}}'), '{{nome}} should be replaced')
  assert(result.includes('Pedro'), 'Name should appear in output')
})

Deno.test('buildReminderText handles empty string variables without crashing', () => {
  const template = 'Olá {{nome}}, até {{data}} às {{hora}} com {{profissional}}.'
  const result = buildReminderText(template, { nome: '', data: '', hora: '', profissional: '' })
  assert(!result.includes('{{'), `All placeholders should be replaced: ${result}`)
  assert(result === 'Olá , até  às  com .', `Unexpected output: ${result}`)
})

Deno.test('buildReminderText handles special regex characters in values safely', () => {
  // Dollar signs and backslashes in replacement strings are special in JS .replace
  // They should NOT cause issues since we use a string replacement (not a function)
  // However, $& and $1 patterns in the replacement string are special chars.
  // This test documents current behavior — the replaced value goes in literally.
  const template = 'Olá {{nome}}!'
  const result = buildReminderText(template, {
    nome: 'R$ 100,00', data: '', hora: '', profissional: '',
  })
  assert(result.includes('R$'), `Dollar sign should survive: ${result}`)
})
