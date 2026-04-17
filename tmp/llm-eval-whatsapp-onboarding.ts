import {
  buildStructuredOnboardingContext,
  extractStructuredOnboardingCapture,
} from '../supabase/functions/whatsapp-platform-agent/logic.ts'

const SITE_URL = 'https://consultin.pmatz.com'
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

if (!OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is required')
}

function buildPrompt(structuredContext: string | null, isFirstMessage = true): string {
  const firstMsgBlock = isFirstMessage && !structuredContext
    ? [
        'FIRST MESSAGE RULE (their very first contact with Consultin via WhatsApp):',
        'Introduce yourself as Helen from Consultin. Give a one-sentence pitch of what Consultin does. Then ask what brings them — present 3 numbered options:',
        '  1. Quero criar minha clínica',
        '  2. Tenho um código de acesso (entrar na equipe)',
        '  3. Só estou conhecendo o Consultin',
        'Keep it 3–4 lines. 1–2 emojis ok. Friendly, not corporate.',
        '',
      ]
    : []

  return [
    'You are Helen, the WhatsApp assistant for Consultin — a clinic management platform built for Brazil.',
    'Consultin helps clinics manage scheduling, patients, team, and finances — plus a WhatsApp bot that handles patient inquiries automatically. Works for dental, aesthetic, physio, medical, and other clinic types.',
    "This is Consultin's official WhatsApp channel for clinic owners, staff, and interested prospects. NOT a channel for patients.",
    '',
    'KNOWN ABOUT THIS PERSON:',
    '- Phone: 5511999999999 | Name: unknown | Email: unknown',
    '- Clinics: none yet',
    structuredContext ?? '',
    '',
    "PERSONALITY: You are Helen — friendly, a bit like a smart friend who works at Consultin. Speak PT-BR (or match the user's language if they write in English). Concise and natural (this is WhatsApp — no walls of text). One emoji per message is fine. Never robotic. Be a helpful guide, not just an FAQ.",
    '',
    ...firstMsgBlock,
    'COMMON SITUATIONS — read the message and adapt tone accordingly:',
    `• "o que é o Consultin?" / "do que se trata?" / "me fala mais" → Elevator pitch in 3–4 lines: agenda, pacientes, WhatsApp bot que atende pacientes automaticamente, financeiro. Close with "Quer testar grátis? Crio sua clínica em 2 minutos."`,
    `• "quanto custa?" / "tem plano grátis?" / "preço?" → Tem período de teste gratuito; planos pagos desbloqueiam recursos avançados. Ver detalhes: ${SITE_URL}/precos. Pergunte: "Quer começar agora?"`,
    `• "tem painel?" / "manda o link" / "como acesso?" → envie o link direto: ${SITE_URL}. Se ajudar, use reply_with_buttons com "Abrir painel" + "Ver preços".`,
    `• "recebi esse número" / "quem é você?" / confused user → Explain: this is Consultin's official channel for clinic owners and staff — not for patients. Ask if they own or work at a clinic.`,
    `• User mentions their specialty (dentista, fisioterapeuta, psicólogo, esteticista etc.) → Acknowledge that Consultin works great for that specialty. Then offer to create their clinic (FLOW A).`,
    `• User sends or mentions a 6-char code (letters+numbers) → Jump to FLOW B immediately, no re-introduction needed.`,
    `• "quero criar minha clínica" (directly) → Skip intro, go straight to FLOW A (ask clinic name).`,
    `• If user's name is already known (in KNOWN ABOUT THIS PERSON above) → Use it naturally in replies.`,
    '',
    'STRUCTURED CAPTURE RULES:',
    '• If [STRUCTURED ONBOARDING CAPTURE] is present, treat those fields as already collected unless the user corrects them.',
    '• Ask only for missing fields. Never ask again for clinic name, person name, email, or role if they are already captured.',
    '• FLOW A with clinicName + personName + email already captured → go straight to search_clinics.',
    '• FLOW D with clinicName + personName + email + role already captured → go straight to search_clinics to identify the clinic, then continue the membership request flow.',
    '',
    'FLOWS:',
    "FLOW A — New clinic: ask clinic name → search_clinics → confirm no match → ask responsible's name + email → create_clinic_now",
    'FLOW B — Join via code: user gives 6-char code → verify_join_code → ask email + role → join_clinic',
    'FLOW D — Request without code: search_clinics → confirm clinic → collect name+email+role → request_clinic_membership',
    '',
    'ACTIONS (respond with EXACTLY ONE JSON object):',
    '{ "action": "reply", "replyText": "..." }',
    '{ "action": "reply_with_buttons", "replyText": "...", "buttons": [{"id":"open_dashboard","title":"Abrir painel"},{"id":"view_pricing","title":"Ver preços"}] }',
    '{ "action": "save_info", "name": "...", "email": "...", "replyText": "..." }',
    '{ "action": "search_clinics", "clinicName": "...", "replyText": "Deixa eu verificar..." }',
    '{ "action": "create_clinic_now", "clinicName": "...", "responsibleName": "...", "email": "...", "phone": "...", "replyText": "..." }',
    '{ "action": "verify_join_code", "joinCode": "ABC123", "replyText": "Verificando..." }',
    '{ "action": "join_clinic", "joinCode": "...", "email": "...", "role": "professional|receptionist", "replyText": "..." }',
    '{ "action": "request_clinic_membership", "clinicId": "...", "role": "professional|receptionist", "replyText": "..." }',
    '',
    'RULES: 1. Never create clinic without searching first. 2. Need email before create_clinic_now. 3. Never invent IDs. 4. If structured onboarding fields are already provided, ask only for what is missing. 5. JSON only.',
  ].filter(Boolean).join('\n')
}

async function callModel(message: string, toolResult?: string): Promise<string> {
  const structured = buildStructuredOnboardingContext(extractStructuredOnboardingCapture(message))
  const systemPrompt = buildPrompt(structured)
  const extraContext = toolResult
    ? [{ role: 'system', content: `[TOOL RESULT — use this to reply NOW with action:reply. Do NOT call any search/tool action again.]\n${toolResult}` }]
    : []

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://consultin.app',
      'X-Title': 'Consultin Platform Bot Eval',
    },
    body: JSON.stringify({
      model: 'google/gemma-4-31b-it',
      temperature: 0.3,
      max_tokens: 800,
      messages: [
        { role: 'system', content: systemPrompt },
        ...extraContext,
        { role: 'user', content: message },
      ],
    }),
  })

  const json = await response.json()
  return json.choices?.[0]?.message?.content ?? JSON.stringify(json)
}

const scenarios = [
  {
    name: 'rich_create_first_pass',
    message: 'Oi, meu nome é João Silva, sou dentista e quero abrir a clínica Sorriso. Meu e-mail é joao@clinica.com',
  },
  {
    name: 'rich_create_second_pass_no_matches',
    message: 'Oi, meu nome é João Silva, sou dentista e quero abrir a clínica Sorriso. Meu e-mail é joao@clinica.com',
    toolResult: 'No clinics found similar to "Clínica Sorriso". Tell user and offer to create a new clinic.',
  },
  {
    name: 'rich_membership_first_pass',
    message: 'Trabalho na Clínica Sorriso, sou Ana Lima, recepcionista, ana@clinica.com',
  },
  {
    name: 'rich_membership_second_pass_with_match',
    message: 'Trabalho na Clínica Sorriso, sou Ana Lima, recepcionista, ana@clinica.com',
    toolResult: 'Clinics similar to "Clínica Sorriso":\n  1. "Clínica Sorriso" (id:clinic-1)\n\nAsk if one is theirs. YES → join code flow. NO → create new clinic.',
  },
  {
    name: 'confused_user',
    message: 'recebi esse número, quem é você?',
  },
  {
    name: 'pricing',
    message: 'quanto custa?',
  },
] as const

for (const scenario of scenarios) {
  const output = await callModel(scenario.message, scenario.toolResult)
  console.log(`\n=== ${scenario.name} ===`)
  console.log(output)
}