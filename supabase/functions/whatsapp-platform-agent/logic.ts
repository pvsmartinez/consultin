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

export function resolvePlatformFastPath(input: {
  buttonReplyId?: string | null
  messageText: string
  pendingJoinCode?: string | null
  siteUrl: string
}): PlatformFastPathResult | null {
  const buttonReplyId = input.buttonReplyId?.trim() ?? ''
  const messageText = input.messageText.trim()
  const pendingJoinCode = input.pendingJoinCode?.trim().toUpperCase() ?? ''

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
  if (wantsCreateClinic) {
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
  if (wantsJoinClinicWithoutCode) {
    return null
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