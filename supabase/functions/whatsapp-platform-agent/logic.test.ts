import {
  buildStructuredOnboardingContext,
  buildClinicCreatedReply,
  buildClinicJoinedReply,
  buildMembershipRequestReply,
  buildCrossClinicConflictReply,
  evaluateProfileProvisioning,
  extractStructuredOnboardingCapture,
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

Deno.test('buildClinicCreatedReply gives explicit next steps for a new clinic owner', () => {
  const reply = buildClinicCreatedReply({
    name: 'João',
    clinicName: 'Clínica Sorriso',
    email: 'joao@clinica.com',
    joinCode: 'ABC123',
    siteUrl: SITE_URL,
  })

  assert(reply.replyText.includes('ABC123'), 'Expected join code in clinic-created reply')
  assert(reply.buttons?.some(button => button.id === 'invite_team') === true, 'Expected invite_team button')
})

Deno.test('buildClinicJoinedReply gives guided next steps for a professional', () => {
  const reply = buildClinicJoinedReply({
    memberName: 'Ana',
    clinicName: 'Clínica Sorriso',
    email: 'ana@clinica.com',
    role: 'professional',
    siteUrl: SITE_URL,
  })

  assert(reply.buttons?.some(button => button.id === 'professional_examples') === true, 'Expected professional examples button')
  assert(reply.replyText.includes('ana@clinica.com'), 'Expected email in joined-clinic reply')
})

Deno.test('buildMembershipRequestReply explains what happens after a join request', () => {
  const reply = buildMembershipRequestReply({
    staffName: 'Maria Lima',
    clinicName: 'Clínica Sorriso',
    role: 'receptionist',
  })

  assert(reply.replyText.includes('Clínica Sorriso'), 'Expected clinic name in membership request reply')
  assert(reply.buttons?.some(button => button.id === 'what_happens_next') === true, 'Expected what_happens_next button')
})

Deno.test('extractStructuredOnboardingCapture parses clinic creation lead fields from a free-form message', () => {
  const capture = extractStructuredOnboardingCapture('Oi, meu nome é João Silva, quero abrir a clínica Sorriso, meu e-mail é joao@clinica.com')
  assert(capture.intent === 'create_clinic', `Expected create_clinic intent, got ${capture.intent}`)
  assert(capture.personName === 'João Silva', `Expected João Silva, got ${capture.personName}`)
  assert(capture.email === 'joao@clinica.com', `Expected extracted email, got ${capture.email}`)
  assert(capture.clinicName?.includes('Sorriso') === true, `Expected clinic name with Sorriso, got ${capture.clinicName}`)
})

Deno.test('extractStructuredOnboardingCapture parses membership request fields', () => {
  const capture = extractStructuredOnboardingCapture('Trabalho na Clínica Sorriso, sou Ana Lima, recepcionista, ana@clinica.com')
  assert(capture.intent === 'request_membership', `Expected request_membership intent, got ${capture.intent}`)
  assert(capture.role === 'receptionist', `Expected receptionist role, got ${capture.role}`)
  assert(capture.personName === 'Ana Lima', `Expected Ana Lima, got ${capture.personName}`)
})

Deno.test('buildStructuredOnboardingContext tells the model to ask only for missing fields', () => {
  const context = buildStructuredOnboardingContext({
    intent: 'request_membership',
    clinicName: 'Clínica Sorriso',
    personName: 'Ana Lima',
    email: 'ana@clinica.com',
    role: null,
  })

  assert(context?.includes('missing=role') === true, 'Expected missing role marker in onboarding context')
  assert(context?.includes('Ask only for missing fields') === true, 'Expected ask-only-missing-fields instruction')
})

Deno.test('scenario: ad CTA default text routes prospect to clinic creation', () => {
  const result = resolvePlatformFastPath({
    messageText: 'Oi, quero cadastrar minha clínica no Consultin',
    siteUrl: SITE_URL,
  })
  assert(result?.mode === 'interactive', 'Expected interactive clinic creation shortcut')
  assert(result?.replyText.includes('nome da clínica') === true, 'Expected clinic creation instructions')
})

Deno.test('scenario: generic first-touch greeting gets a guided onboarding menu', () => {
  const result = resolvePlatformFastPath({ messageText: 'Oi', siteUrl: SITE_URL })
  assert(result?.mode === 'interactive', 'Expected guided interactive menu for generic greeting')
  assert(result?.buttons?.some(button => button.id === 'join_team') === true, 'Expected team-join option in greeting menu')
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

Deno.test('scenario: rich clinic-creation message bypasses generic fast-path prompt', () => {
  const result = resolvePlatformFastPath({
    messageText: 'Quero criar minha clínica Sorriso, meu nome é João Silva e meu e-mail é joao@clinica.com',
    siteUrl: SITE_URL,
  })
  assert(result === null, 'Expected rich clinic-creation message to continue to the LLM with structured context')
})

Deno.test('scenario: prospect taps guided team-join entrypoint', () => {
  const result = resolvePlatformFastPath({
    buttonReplyId: 'join_team',
    messageText: 'Entrar na equipe',
    siteUrl: SITE_URL,
  })
  assert(result?.mode === 'interactive', 'Expected guided team-join menu to stay interactive')
  assert(result?.buttons?.some(button => button.id === 'join_with_code') === true, 'Expected join_with_code option')
  assert(result?.buttons?.some(button => button.id === 'join_without_code') === true, 'Expected join_without_code option')
})

Deno.test('scenario: owner asks to invite team after clinic creation', () => {
  const result = resolvePlatformFastPath({
    buttonReplyId: 'invite_team',
    messageText: 'Convidar equipe',
    siteUrl: SITE_URL,
  })
  assert(result?.mode === 'text', 'Expected invite_team to return structured invite instructions')
  assert(result?.replyText.includes('nome da pessoa') === true, 'Expected invite fields in invite_team reply')
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
  assert(result?.mode === 'interactive', 'Expected no-code join request to receive guided instructions')
  assert(result?.buttons?.some(button => button.id === 'join_without_code') === true, 'Expected no-code join option')
})

Deno.test('scenario: rich membership request bypasses generic no-code join prompt', () => {
  const result = resolvePlatformFastPath({
    messageText: 'Trabalho na Clínica Sorriso, sou Ana Lima, recepcionista, ana@clinica.com',
    siteUrl: SITE_URL,
  })
  assert(result === null, 'Expected rich membership request to continue to the LLM with structured context')
})

Deno.test('scenario: user chooses guided join without code', () => {
  const result = resolvePlatformFastPath({
    buttonReplyId: 'join_without_code',
    messageText: 'Estou sem código',
    siteUrl: SITE_URL,
  })
  assert(result?.mode === 'text', 'Expected direct instructions after choosing join_without_code')
  assert(result?.replyText.includes('nome da clínica') === true, 'Expected structured data request for no-code join flow')
})

Deno.test('scenario: staff asks what happens next after requesting access', () => {
  const result = resolvePlatformFastPath({
    buttonReplyId: 'what_happens_next',
    messageText: 'E agora?',
    siteUrl: SITE_URL,
  })
  assert(result?.mode === 'text', 'Expected what_happens_next to return a plain-text explanation')
  assert(result?.replyText.includes('aprovar sua entrada') === true, 'Expected approval guidance in what_happens_next reply')
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