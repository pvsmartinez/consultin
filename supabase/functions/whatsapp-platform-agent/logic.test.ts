import {
  buildCrossClinicConflictReply,
  evaluateProfileProvisioning,
  findExactClinicNameConflict,
  normalizeClinicNameForMatch,
  resolvePlatformFastPath,
} from './logic.ts'

const SITE_URL = 'https://consultin.pmatz.com'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

Deno.test('normalizeClinicNameForMatch collapses accents and legal suffixes', () => {
  const normalized = normalizeClinicNameForMatch('Clínica Sorriso LTDA')
  assert(normalized === 'sorriso', `Expected normalized clinic name to be "sorriso", got "${normalized}"`)
})

Deno.test('findExactClinicNameConflict catches normalized duplicates', () => {
  const conflict = findExactClinicNameConflict('Clinica Sorriso', [
    { id: 'clinic-1', name: 'Clínica Sorriso Ltda.' },
    { id: 'clinic-2', name: 'Outra Clínica' },
  ])
  assert(conflict?.id === 'clinic-1', 'Expected the normalized duplicate clinic to be detected')
})

Deno.test('evaluateProfileProvisioning allows creating a new profile when none exists', () => {
  const result = evaluateProfileProvisioning(null, 'clinic-1', ['admin'])
  assert(result.kind === 'create_profile', `Expected create_profile, got ${result.kind}`)
})

Deno.test('evaluateProfileProvisioning merges roles in the same clinic', () => {
  const result = evaluateProfileProvisioning({
    clinicId: 'clinic-1',
    clinicName: 'Clínica Sorriso',
    roles: ['admin'],
  }, 'clinic-1', ['professional'])

  assert(result.kind === 'reuse_same_clinic', `Expected reuse_same_clinic, got ${result.kind}`)
  assert(result.mergedRoles?.includes('admin') === true, 'Expected existing admin role to be preserved')
  assert(result.mergedRoles?.includes('professional') === true, 'Expected requested professional role to be added')
})

Deno.test('evaluateProfileProvisioning blocks cross-clinic overwrite', () => {
  const result = evaluateProfileProvisioning({
    clinicId: 'clinic-a',
    clinicName: 'Clínica A',
    roles: ['receptionist'],
  }, 'clinic-b', ['professional'])

  assert(result.kind === 'cross_clinic_conflict', `Expected cross_clinic_conflict, got ${result.kind}`)
})

Deno.test('buildCrossClinicConflictReply explains why unsafe auto-provisioning was blocked', () => {
  const reply = buildCrossClinicConflictReply({
    email: 'joao@clinica.com',
    existingClinicName: 'Clínica A',
    targetClinicName: 'Clínica B',
    operation: 'join_clinic',
  })

  assert(reply.includes('joao@clinica.com'), 'Expected email to be mentioned in conflict reply')
  assert(reply.includes('Clínica A'), 'Expected existing clinic name to be mentioned in conflict reply')
})

Deno.test('scenario: ad CTA default text routes prospect to clinic creation', () => {
  const result = resolvePlatformFastPath({
    messageText: 'Oi, quero cadastrar minha clínica no Consultin',
    siteUrl: SITE_URL,
  })
  assert(result?.mode === 'interactive', 'Expected interactive clinic creation shortcut')
  assert(result?.replyText.includes('nome da clínica') === true, 'Expected clinic creation instructions')
})

Deno.test('scenario: generic first-touch greeting still falls back to the LLM flow', () => {
  const result = resolvePlatformFastPath({ messageText: 'Oi', siteUrl: SITE_URL })
  assert(result === null, 'Expected generic greeting to continue to the LLM flow')
})

Deno.test('scenario: prospect asks for pricing first', () => {
  const result = resolvePlatformFastPath({ messageText: 'quanto custa?', siteUrl: SITE_URL })
  assert(result?.mode === 'interactive', 'Expected interactive pricing response')
  assert(result?.replyText.includes('/precos') === true, 'Expected pricing link in reply')
})

Deno.test('scenario: prospect asks for dashboard link first', () => {
  const result = resolvePlatformFastPath({ messageText: 'manda o link do painel', siteUrl: SITE_URL })
  assert(result?.mode === 'interactive', 'Expected interactive dashboard response')
  assert(result?.replyText.includes(SITE_URL) === true, 'Expected dashboard URL in reply')
})

Deno.test('scenario: prospect wants to create a clinic directly', () => {
  const result = resolvePlatformFastPath({ messageText: 'quero criar minha clínica', siteUrl: SITE_URL })
  assert(result?.replyText.includes('nome da clínica') === true, 'Expected clinic creation shortcut to ask for clinic name')
})

Deno.test('scenario: staff enters with a direct join code', () => {
  const result = resolvePlatformFastPath({ messageText: 'ABC123', siteUrl: SITE_URL })
  assert(result?.nextPendingJoinCode === 'ABC123', 'Expected pending join code to be persisted')
  assert(result?.buttons?.some(button => button.id === 'role_professional') === true, 'Expected professional role button')
})

Deno.test('scenario: staff chooses professional role after providing a join code', () => {
  const result = resolvePlatformFastPath({
    buttonReplyId: 'role_professional',
    messageText: 'Sou profissional',
    pendingJoinCode: 'ABC123',
    siteUrl: SITE_URL,
  })
  assert(result?.mode === 'text', 'Expected plain text follow-up after role selection')
  assert(result?.replyText.includes('ABC123') === true, 'Expected pending join code to be referenced in the follow-up')
})

Deno.test('scenario: staff asks how to enter without a join code', () => {
  const result = resolvePlatformFastPath({
    messageText: 'trabalho na Clínica X, como entro?',
    siteUrl: SITE_URL,
  })
  assert(result === null, 'Expected no-code join request to continue to the LLM membership flow')
})

Deno.test('scenario: existing owner asks an operational question', () => {
  const result = resolvePlatformFastPath({
    messageText: 'tenho consultas amanhã?',
    siteUrl: SITE_URL,
  })
  assert(result === null, 'Expected operational clinic question to continue to the LLM management flow')
})

Deno.test('scenario: user asks for support on the platform number', () => {
  const result = resolvePlatformFastPath({ messageText: 'preciso de suporte', siteUrl: SITE_URL })
  assert(result?.mode === 'interactive', 'Expected support shortcut to stay interactive')
  assert(result?.replyText.includes('Pode me chamar por aqui mesmo') === true, 'Expected support guidance message')
})

Deno.test('scenario: generic clinic name + email still falls back to the LLM flow', () => {
  const result = resolvePlatformFastPath({ messageText: 'Clínica Sorriso, joao@clinica.com', siteUrl: SITE_URL })
  assert(result === null, 'Expected free-form clinic name + email input to continue to the LLM flow')
})