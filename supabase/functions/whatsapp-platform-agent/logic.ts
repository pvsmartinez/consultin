export interface PlatformFastPathButton {
  id: string
  title: string
}

export interface PlatformFastPathResult {
  mode: 'text' | 'interactive'
  replyText: string
  buttons?: PlatformFastPathButton[]
  nextPendingJoinCode?: string | null
}

export interface GuidedReply {
  replyText: string
  buttons?: PlatformFastPathButton[]
}

export interface OnboardingStructuredCapture {
  intent: 'create_clinic' | 'request_membership' | 'unknown'
  clinicName: string | null
  personName: string | null
  email: string | null
  role: 'professional' | 'receptionist' | null
}

export interface ExistingProfileContext {
  clinicId: string | null
  clinicName?: string | null
  roles?: string[]
}

export interface ProvisioningGuardResult {
  kind: 'create_profile' | 'reuse_same_clinic' | 'cross_clinic_conflict'
  mergedRoles?: string[]
}

const JOIN_CODE_RE = /^[A-Z0-9]{6}$/
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i

function cleanExtractedLabel(value: string): string {
  return value
    .replace(/^[\s,:-]+|[\s,.;:-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikePersonName(value: string): boolean {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  if (!normalized) return false
  if (/(^sou$|^meu nome$|dentista|fisioterapeuta|psicolog|estetic|medic|recepcionista|profissional|clinica|consultorio|email|e-mail)/i.test(normalized)) {
    return false
  }
  const parts = normalized.split(/\s+/).filter(Boolean)
  return parts.length >= 2 && parts.length <= 4
}

function detectRole(messageText: string): 'professional' | 'receptionist' | null {
  if (/(recepcionista|secret[aá]ri[ao]|atendente)/i.test(messageText)) return 'receptionist'
  if (/(profissional|dentista|fisioterapeuta|psic[oó]log|esteticista|m[eé]dic[oa]|nutricionista|fonoaudi[oó]log|terapeuta|dr\.?|dra\.?)/i.test(messageText)) return 'professional'
  return null
}

function detectIntent(messageText: string): 'create_clinic' | 'request_membership' | 'unknown' {
  if (/(quero\s+criar|quero\s+abrir|abrir\s+minha|abrir\s+(uma\s+|a\s+)?cl[ií]nica|cadastrar\s+minha|montar\s+minha|criar\s+(uma\s+)?cl[ií]nica|consult[oó]rio)/i.test(messageText)) {
    return 'create_clinic'
  }
  if (/(trabalho\s+na|fa[cç]o\s+parte\s+da|quero\s+entrar\s+na\s+cl[ií]nica|como\s+entro\s+na\s+cl[ií]nica|como\s+acesso\s+minha\s+cl[ií]nica|entrar\s+na\s+equipe)/i.test(messageText)) {
    return 'request_membership'
  }
  return 'unknown'
}

function detectClinicName(messageText: string): string | null {
  const patterns = [
    /(?:cl[ií]nica|consult[oó]rio)\s+([A-ZÀ-ÿ0-9][^,.;\n]+)/i,
    /(?:abrir|criar|cadastrar|montar)\s+(?:a\s+|uma\s+|minha\s+)?(?:cl[ií]nica|consult[oó]rio)\s+([A-ZÀ-ÿ0-9][^,.;\n]+)/i,
    /(?:na|da|do)\s+(?:cl[ií]nica|consult[oó]rio)\s+([A-ZÀ-ÿ0-9][^,.;\n]+)/i,
  ]

  for (const pattern of patterns) {
    const match = messageText.match(pattern)
    const candidate = cleanExtractedLabel(match?.[1] ?? '')
    if (candidate) {
      return candidate.startsWith('Clínica ') || candidate.startsWith('Clinica ') || candidate.startsWith('Consultório ') || candidate.startsWith('Consultorio ')
        ? candidate
        : `Clínica ${candidate}`
    }
  }

  return null
}

function detectPersonName(messageText: string): string | null {
  const explicitPatterns = [
    /meu nome\s+[ée]\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ' -]{3,60})/i,
    /sou\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ' -]{3,60})(?=,|\s+e[- ]?mail|\s+email|\s+da\s+cl[ií]nica|\s+do\s+consult[oó]rio|$)/i,
  ]

  for (const pattern of explicitPatterns) {
    const match = messageText.match(pattern)
    const candidate = cleanExtractedLabel(match?.[1] ?? '')
    if (looksLikePersonName(candidate)) return candidate
  }

  const commaParts = messageText.split(',').map(part => cleanExtractedLabel(part))
  for (const part of commaParts) {
    if (looksLikePersonName(part)) return part
  }

  return null
}

export function extractStructuredOnboardingCapture(messageText: string): OnboardingStructuredCapture {
  const email = messageText.match(EMAIL_RE)?.[0]?.toLowerCase() ?? null
  return {
    intent: detectIntent(messageText),
    clinicName: detectClinicName(messageText),
    personName: detectPersonName(messageText),
    email,
    role: detectRole(messageText),
  }
}

export function buildStructuredOnboardingContext(capture: OnboardingStructuredCapture): string | null {
  const hasAnySignal = Boolean(capture.clinicName || capture.personName || capture.email || capture.role || capture.intent !== 'unknown')
  if (!hasAnySignal) return null

  const missingFields = [
    !capture.clinicName && 'clinicName',
    !capture.personName && 'personName',
    !capture.email && 'email',
    !capture.role && capture.intent === 'request_membership' && 'role',
  ].filter(Boolean)

  return [
    '[STRUCTURED ONBOARDING CAPTURE]',
    `intent=${capture.intent}`,
    `clinicName=${capture.clinicName ?? 'unknown'}`,
    `personName=${capture.personName ?? 'unknown'}`,
    `email=${capture.email ?? 'unknown'}`,
    `role=${capture.role ?? 'unknown'}`,
    missingFields.length > 0 ? `missing=${missingFields.join(',')}` : 'missing=none',
    'Trust these extracted fields unless the user clearly corrects them.',
    'Ask only for missing fields. Do not ask again for clinic name, email, name, or role if already captured above.',
    'If clinicName is already known in FLOW A or FLOW D, skip the generic question and move to the next step or tool call.',
  ].join('\n')
}

export function normalizeClinicNameForMatch(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(clinica|clínica|consultorio|consultório|ltda|me|eireli|ss|s\/s|sa)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function findExactClinicNameConflict(
  requestedClinicName: string,
  existingClinics: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const requested = normalizeClinicNameForMatch(requestedClinicName)
  if (!requested) return null

  return existingClinics.find(clinic => normalizeClinicNameForMatch(clinic.name) === requested) ?? null
}

export function mergeRoles(existingRoles: string[], requestedRole: string): string[] {
  const merged = new Set([...(existingRoles ?? []), requestedRole])
  return ['admin', 'receptionist', 'professional'].filter(role => merged.has(role))
}

export function evaluateProfileProvisioning(
  existingProfile: ExistingProfileContext | null,
  targetClinicId: string,
  requestedRoles: string[],
): ProvisioningGuardResult {
  if (!existingProfile || !existingProfile.clinicId) {
    return { kind: 'create_profile', mergedRoles: requestedRoles }
  }

  if (existingProfile.clinicId === targetClinicId) {
    let merged = [...(existingProfile.roles ?? [])]
    for (const role of requestedRoles) {
      merged = mergeRoles(merged, role)
    }
    return { kind: 'reuse_same_clinic', mergedRoles: merged }
  }

  return { kind: 'cross_clinic_conflict' }
}

export function buildCrossClinicConflictReply(params: {
  email: string
  existingClinicName?: string | null
  targetClinicName: string
  operation: 'create_clinic' | 'join_clinic'
}): string {
  const existingClinicLabel = params.existingClinicName ?? 'outra clínica'
  const operationLine = params.operation === 'create_clinic'
    ? `Esse e-mail já está ligado à clínica *${existingClinicLabel}*, então eu não vou criar uma nova clínica automaticamente para evitar conflito de acesso.`
    : `Esse e-mail já está ligado à clínica *${existingClinicLabel}*, então eu não vou mover sua conta para *${params.targetClinicName}* automaticamente.`

  return [
    `⚠️ Encontrei uma conta existente para *${params.email}*.`,
    '',
    operationLine,
    '',
    'Para seguir sem bagunçar os acessos, use outro e-mail ou peça para o responsável da clínica ajustar isso pelo painel primeiro.',
  ].join('\n')
}

export function buildClinicCreatedReply(params: {
  name: string
  clinicName: string
  email: string
  joinCode: string
  siteUrl: string
}): GuidedReply {
  return {
    replyText: [
      `✅ Tudo pronto, *${params.name}*! A clínica *${params.clinicName}* foi criada.`,
      '',
      `📧 Você vai receber um e-mail em *${params.email}* para definir sua senha e acessar o painel completo em ${params.siteUrl.replace(/^https?:\/\//, '')}`,
      '',
      `🔑 *Código para sua equipe entrar:* \`${params.joinCode}\``,
      'Compartilhe esse código com quem precisa acessar a clínica.',
      '',
      'Posso te ajudar a convidar a equipe, abrir o painel ou te explicar como configurar o bot da clínica.',
    ].join('\n'),
    buttons: [
      { id: 'invite_team', title: 'Convidar equipe' },
      { id: 'configure_bot', title: 'Configurar bot' },
      { id: 'open_dashboard', title: 'Abrir painel' },
    ],
  }
}

export function buildClinicJoinedReply(params: {
  memberName: string
  clinicName: string
  email: string
  role: 'professional' | 'receptionist'
  siteUrl: string
}): GuidedReply {
  const roleLabel = params.role === 'receptionist' ? 'recepcionista' : 'profissional'
  const examples = params.role === 'professional'
    ? 'Posso te mostrar comandos úteis para agenda e pacientes.'
    : 'Posso te mostrar comandos úteis para agenda, cadastro e agendamento.'

  return {
    replyText: [
      `✅ Pronto, *${params.memberName}*! Você agora faz parte da clínica *${params.clinicName}* como *${roleLabel}*.`,
      '',
      `📧 Verifique seu e-mail *${params.email}* para definir sua senha e acessar o painel em ${params.siteUrl.replace(/^https?:\/\//, '')}`,
      '',
      examples,
    ].join('\n'),
    buttons: [
      {
        id: params.role === 'professional' ? 'professional_examples' : 'reception_examples',
        title: params.role === 'professional' ? 'Ver exemplos' : 'Ver exemplos',
      },
      { id: 'open_dashboard', title: 'Abrir painel' },
      { id: 'support_here', title: 'Preciso de ajuda' },
    ],
  }
}

export function buildMembershipRequestReply(params: {
  staffName: string
  clinicName: string
  role: 'professional' | 'receptionist'
}): GuidedReply {
  const firstName = params.staffName.split(' ')[0] || params.staffName
  const roleLabel = params.role === 'receptionist' ? 'recepcionista' : 'profissional'
  return {
    replyText: [
      `✅ Pedido enviado, *${firstName}*.`,
      '',
      `Avisei a equipe da *${params.clinicName}* que você quer entrar como *${roleLabel}*.`,
      'Assim que aprovarem, eu te aviso por aqui e o acesso segue pelo seu e-mail.',
      '',
      'Se você conseguir o código da clínica antes, também posso acelerar sua entrada.',
    ].join('\n'),
    buttons: [
      { id: 'what_happens_next', title: 'E agora?' },
      { id: 'join_with_code', title: 'Tenho codigo' },
      { id: 'support_here', title: 'Preciso de ajuda' },
    ],
  }
}

export function resolvePlatformFastPath(input: {
  buttonReplyId?: string | null
  messageText: string
  pendingJoinCode?: string | null
  siteUrl: string
}): PlatformFastPathResult | null {
  const buttonReplyId = input.buttonReplyId?.trim() ?? ''
  const messageText = input.messageText.trim()
  const pendingJoinCode = input.pendingJoinCode?.trim().toUpperCase() ?? ''
  const structuredCapture = extractStructuredOnboardingCapture(messageText)

  const genericGreeting = /^(oi+|ol[aá]+|opa+|e ai|e aí|bom dia|boa tarde|boa noite|tudo bem|como funciona|o que voce faz|o que você faz|preciso de ajuda)$/i.test(messageText)
  if (genericGreeting) {
    return {
      mode: 'interactive',
      replyText: [
        'Oi! Eu sou a Helen, assistente do Consultin.',
        '',
        'Posso te ajudar a:',
        '1. Cadastrar uma clínica nova',
        '2. Entrar na equipe de uma clínica existente',
        '3. Ver preços e entender como funciona',
        '',
        'Se preferir, toca em uma opção abaixo.',
      ].join('\n'),
      buttons: [
        { id: 'create_clinic', title: 'Nova clinica' },
        { id: 'join_team', title: 'Entrar na equipe' },
        { id: 'view_pricing', title: 'Ver precos' },
      ],
    }
  }

  if (buttonReplyId === 'open_dashboard') {
    return {
      mode: 'interactive',
      replyText: [
        'Aqui está o painel:',
        input.siteUrl,
        '',
        'Se quiser, também posso te ajudar por aqui no WhatsApp.',
      ].join('\n'),
      buttons: [
        { id: 'view_pricing', title: 'Ver precos' },
        { id: 'create_clinic', title: 'Criar clinica' },
      ],
    }
  }

  if (buttonReplyId === 'view_pricing') {
    return {
      mode: 'interactive',
      replyText: [
        'Claro. Os detalhes dos planos estão aqui:',
        `${input.siteUrl}/precos`,
        '',
        'Se quiser, eu também posso te ajudar a começar sua clínica agora mesmo.',
      ].join('\n'),
      buttons: [
        { id: 'open_dashboard', title: 'Abrir painel' },
        { id: 'create_clinic', title: 'Criar clinica' },
      ],
    }
  }

  if (buttonReplyId === 'create_clinic' || buttonReplyId === 'start_clinic') {
    return {
      mode: 'interactive',
      replyText: [
        'Bora criar sua clínica.',
        'Me manda o *nome da clínica* e seu *e-mail* em uma mensagem só para eu adiantar seu acesso.',
        '',
        'Exemplo: Clínica Sorriso, joao@clinica.com',
      ].join('\n'),
      buttons: [
        { id: 'view_pricing', title: 'Ver precos' },
        { id: 'open_dashboard', title: 'Abrir painel' },
      ],
    }
  }

  if (buttonReplyId === 'join_team') {
    return {
      mode: 'interactive',
      replyText: [
        'Perfeito. Se você já tem o código da clínica, eu acelero seu acesso por aqui.',
        '',
        'Se ainda não tem o código, eu também posso te orientar a pedir entrada na clínica certa.',
      ].join('\n'),
      buttons: [
        { id: 'join_with_code', title: 'Tenho codigo' },
        { id: 'join_without_code', title: 'Estou sem codigo' },
        { id: 'view_pricing', title: 'Ver precos' },
      ],
    }
  }

  if (buttonReplyId === 'join_with_code') {
    return {
      mode: 'text',
      replyText: [
        'Perfeito. Me manda o *código de acesso* de 6 caracteres da clínica.',
        '',
        'Exemplo: ABC123',
      ].join('\n'),
    }
  }

  if (buttonReplyId === 'invite_team') {
    return {
      mode: 'text',
      replyText: [
        'Perfeito. Me mande em uma mensagem só:',
        '• nome da pessoa',
        '• e-mail',
        '• telefone',
        '• função: profissional ou recepcionista',
        '',
        'Exemplo: João Silva, joao@clinica.com, 11 99999-0000, profissional',
      ].join('\n'),
    }
  }

  if (buttonReplyId === 'configure_bot') {
    return {
      mode: 'text',
      replyText: [
        'Para configurar o bot da clínica, você vai precisar conectar o número de WhatsApp da operação no painel.',
        '',
        'Depois disso, eu consigo te ajudar com prompt, confirmações, cancelamentos e agendamento automático.',
        `Painel: ${input.siteUrl}`,
      ].join('\n'),
    }
  }

  if (buttonReplyId === 'professional_examples') {
    return {
      mode: 'text',
      replyText: [
        'Alguns exemplos do que você pode me pedir por aqui:',
        '• minha agenda de hoje',
        '• minhas consultas de amanhã',
        '• buscar paciente Maria',
        '• concluir consulta do João',
      ].join('\n'),
    }
  }

  if (buttonReplyId === 'reception_examples') {
    return {
      mode: 'text',
      replyText: [
        'Alguns exemplos do que você pode me pedir por aqui:',
        '• agenda de hoje',
        '• agendar João às 14h com Dra. Ana',
        '• cadastrar paciente Maria, 11 99999-0000',
        '• remarcar consulta da Paula',
      ].join('\n'),
    }
  }

  if (buttonReplyId === 'what_happens_next') {
    return {
      mode: 'text',
      replyText: [
        'Agora o responsável da clínica precisa aprovar sua entrada.',
        '',
        'Quando isso acontecer, eu te aviso por aqui e o acesso segue pelo seu e-mail.',
        'Se você conseguir o código da clínica antes, me manda o código e eu tento acelerar o processo.',
      ].join('\n'),
    }
  }

  if (buttonReplyId === 'support_here') {
    return {
      mode: 'text',
      replyText: [
        'Pode me explicar por aqui o que travou.',
        'Se você me mandar o nome da clínica e o que está tentando fazer, eu sigo com você sem te jogar para outro canal.',
      ].join('\n'),
    }
  }

  if (buttonReplyId === 'join_without_code') {
    return {
      mode: 'text',
      replyText: [
        'Sem problema. Me mande em uma mensagem só:',
        '• nome da clínica',
        '• seu nome completo',
        '• seu e-mail',
        '• sua função: profissional ou recepcionista',
        '',
        'Exemplo: Clínica Sorriso, Ana Lima, ana@clinica.com, profissional',
      ].join('\n'),
    }
  }

  if (buttonReplyId === 'role_professional' || buttonReplyId === 'role_reception') {
    const roleLabel = buttonReplyId === 'role_professional' ? 'profissional' : 'recepcionista'
    return {
      mode: 'text',
      replyText: pendingJoinCode
        ? [
            `Perfeito, vou te cadastrar como *${roleLabel}* usando o código *${pendingJoinCode}*.`,
            'Agora me mande seu *e-mail* para eu concluir o acesso.',
            '',
            'Exemplo: joao@clinica.com',
          ].join('\n')
        : [
            `Perfeito, vou te cadastrar como *${roleLabel}*.`,
            'Agora me mande seu *e-mail* junto com o *código de acesso* da clínica para eu concluir.',
            '',
            'Exemplo: ABC123, joao@clinica.com',
          ].join('\n'),
    }
  }

  const wantsSupport = /(\bsuporte\b|falar\s+com\s+(algu[eé]m|humano)|atendimento|resolver\s+um\s+problema)/i.test(messageText)
  if (wantsSupport) {
    return {
      mode: 'interactive',
      replyText: [
        'Pode me chamar por aqui mesmo.',
        'Se me mandar em 1 mensagem o que aconteceu, o nome da clínica e o que você quer fazer, eu já te ajudo sem te jogar para outro canal.',
        '',
        'Se preferir, você também pode abrir o painel:',
        input.siteUrl,
      ].join('\n'),
      buttons: [
        { id: 'open_dashboard', title: 'Abrir painel' },
        { id: 'create_clinic', title: 'Criar clinica' },
      ],
    }
  }

  const normalizedMessage = messageText.toUpperCase()
  const directJoinCode = JOIN_CODE_RE.test(normalizedMessage)
    ? normalizedMessage
    : (messageText.match(/\bc[oó]digo\b[^A-Z0-9]*([A-Z0-9]{6})\b/i)?.[1] ?? '').toUpperCase()

  if (directJoinCode) {
    return {
      mode: 'interactive',
      nextPendingJoinCode: directJoinCode,
      replyText: [
        `Perfeito. Vou usar o código *${directJoinCode}*.`,
        'Agora me mande seu *e-mail* e sua função na clínica: *profissional* ou *recepcionista*.',
        '',
        'Exemplo: joao@clinica.com, profissional',
      ].join('\n'),
      buttons: [
        { id: 'role_professional', title: 'Sou profissional' },
        { id: 'role_reception', title: 'Sou recepcionista' },
      ],
    }
  }

  const wantsCreateClinic = /(quero\s+criar|minha\s+clinica|minha\s+cl[ií]nica|criar\s+(uma\s+)?cl[ií]nica|abrir\s+minha\s+cl[ií]nica|come[cç]ar\s+minha\s+cl[ií]nica)/i.test(messageText)
  if (wantsCreateClinic && !(structuredCapture.clinicName && (structuredCapture.email || structuredCapture.personName))) {
    return {
      mode: 'interactive',
      replyText: [
        'Bora criar sua clínica.',
        'Me manda o *nome da clínica* e seu *e-mail* em uma mensagem só para eu adiantar seu acesso.',
        '',
        'Exemplo: Clínica Sorriso, joao@clinica.com',
      ].join('\n'),
      buttons: [
        { id: 'create_clinic', title: 'Criar clinica' },
        { id: 'view_pricing', title: 'Ver precos' },
      ],
    }
  }

  const wantsJoinClinicWithoutCode = /(trabalho\s+na|fa[cç]o\s+parte\s+da|sou\s+(da|do)\s+cl[ií]nica|como\s+entro\s+na\s+cl[ií]nica|como\s+acesso\s+minha\s+cl[ií]nica|quero\s+entrar\s+na\s+cl[ií]nica)/i.test(messageText)
  if (wantsJoinClinicWithoutCode && !(structuredCapture.clinicName && structuredCapture.email && structuredCapture.personName && structuredCapture.role)) {
    return {
      mode: 'interactive',
      replyText: [
        'Consigo te ajudar com isso.',
        '',
        'Se você já tem o código da clínica, me manda o código aqui.',
        'Se ainda não tem, me mande o nome da clínica, seu nome, seu e-mail e sua função para eu direcionar o pedido certo.',
      ].join('\n'),
      buttons: [
        { id: 'join_with_code', title: 'Tenho codigo' },
        { id: 'join_without_code', title: 'Estou sem codigo' },
        { id: 'create_clinic', title: 'Criar clinica' },
      ],
    }
  }

  const wantsPricingLink = /(\bpreco\b|\bprecos\b|\bpreço\b|\bpreços\b|\bplano\b|\bplanos\b|quanto\s+custa|qual\s+o\s+valor|mensalidade)/i.test(messageText)
  if (wantsPricingLink) {
    return {
      mode: 'interactive',
      replyText: [
        'Claro. Você pode ver os detalhes dos planos por aqui:',
        `${input.siteUrl}/precos`,
        '',
        'Se quiser, eu também posso te ajudar a começar sua clínica agora mesmo.',
      ].join('\n'),
      buttons: [
        { id: 'open_dashboard', title: 'Abrir painel' },
        { id: 'start_clinic', title: 'Criar clinica' },
      ],
    }
  }

  const wantsPanelLink = /(\bpainel\b|\bdashboard\b|manda\s+o?\s*link|link\s+de\s+acesso|como\s+(eu\s+)?(acesso|entro))/i.test(messageText)
  if (wantsPanelLink) {
    return {
      mode: 'interactive',
      replyText: [
        'Tem sim! Você pode acessar o painel completo por aqui:',
        input.siteUrl,
        '',
        'Se quiser, também posso te ajudar a configurar tudo por aqui no WhatsApp.',
      ].join('\n'),
      buttons: [
        { id: 'open_dashboard', title: 'Abrir painel' },
        { id: 'view_pricing', title: 'Ver precos' },
      ],
    }
  }

  return null
}