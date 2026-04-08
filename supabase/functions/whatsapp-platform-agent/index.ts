/**
 * Edge Function: whatsapp-platform-agent
 *
 * Conversational onboarding bot for Consultin's own WhatsApp number.
 * Helps prospective and existing clinic owners/staff to:
 *   - Create a new clinic on the platform
 *   - Learn about their existing clinic / account
 *   - Understand the product and get a signup link
 *   - Configure their clinic's WhatsApp AI bot (personality, features, model)
 *
 * Memory: wa_platform_users (per phone) + wa_platform_messages (rolling history).
 * Called by whatsapp-webhook when phone_number_id === PLATFORM_PHONE_NUMBER_ID.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — auto-injected by Supabase
 *   OPENROUTER_API_KEY                       — AI model
 *   PLATFORM_PHONE_NUMBER_ID                 — Meta phone_number_id of Consultin's WA
 *   PLATFORM_WA_TOKEN                        — Meta access token for that number
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SRK       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!
const PLATFORM_PHONE_ID  = Deno.env.get('PLATFORM_PHONE_NUMBER_ID') ?? ''
const PLATFORM_WA_TOKEN  = Deno.env.get('PLATFORM_WA_TOKEN') ?? ''

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformAgentRequest {
  fromPhone:    string
  messageText:  string
  waMessageId?: string
}

interface PlatformUser {
  id:             string
  phone:          string
  name:           string | null
  email:          string | null
  linked_user_id: string | null
  notes:          string | null
}

interface ClinicInfo {
  id:   string
  name: string
  role: string
}

interface ClinicBotConfig {
  wa_ai_model:          string | null
  wa_ai_custom_prompt:  string | null
  wa_ai_allow_schedule: boolean
  wa_ai_allow_confirm:  boolean
  wa_ai_allow_cancel:   boolean
}

interface PlatformAction {
  action:              string
  replyText:           string
  // save_info
  name?:               string
  email?:              string
  // submit_clinic_signup
  clinicName?:         string
  responsibleName?:    string
  phone?:              string
  // configure_bot — updates wa_ai_* on the user's clinic
  clinicId?:           string   // which clinic to update (defaults to first linked)
  customPrompt?:       string   // new personality instructions (null = clear)
  clearCustomPrompt?:  boolean  // set to true to remove custom prompt
  allowSchedule?:      boolean
  allowConfirm?:       boolean
  allowCancel?:        boolean
  aiModel?:            string
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SRK, { auth: { persistSession: false } })

  let body: PlatformAgentRequest
  try { body = await req.json() }
  catch { return new Response('Bad JSON', { status: 400 }) }

  const { fromPhone, messageText } = body
  if (!fromPhone?.trim() || !messageText?.trim()) return new Response('Bad Request', { status: 400 })

  // ── Find or create platform user ──────────────────────────────────────────
  const { data: existingUser } = await supabase
    .from('wa_platform_users')
    .select('id, phone, name, email, linked_user_id, notes')
    .eq('phone', fromPhone)
    .maybeSingle()

  let user: PlatformUser
  if (existingUser) {
    user = existingUser as PlatformUser
  } else {
    const { data: newUser, error } = await supabase
      .from('wa_platform_users')
      .insert({ phone: fromPhone })
      .select('id, phone, name, email, linked_user_id, notes')
      .single()
    if (error || !newUser) {
      console.error('[platform-agent] Failed to create user:', error)
      return new Response('Internal error', { status: 500 })
    }
    user = newUser as PlatformUser
  }

  // ── Save the incoming message ─────────────────────────────────────────────
  await supabase.from('wa_platform_messages').insert({
    platform_user_id: user.id,
    role:             'user',
    content:          messageText,
  })

  // ── Cross-reference phone against user_profiles (all clinics) ────────────
  let linkedClinics: ClinicInfo[] = []

  if (!user.linked_user_id) {
    // Try to identify this person by phone (last 9 digits to handle country code variants)
    const last9 = fromPhone.replace(/\D/g, '').slice(-9)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, name, role, clinic_id, clinics(name)')
      .ilike('phone', `%${last9}`)
      .maybeSingle()

    if (profile) {
      const pr = profile as {
        id: string; name: string; role: string
        clinic_id: string | null
        clinics: { name: string } | null
      }
      // Auto-link their account
      await supabase
        .from('wa_platform_users')
        .update({ linked_user_id: pr.id, name: user.name ?? pr.name })
        .eq('id', user.id)
      user = { ...user, linked_user_id: pr.id, name: user.name ?? pr.name }
      if (pr.clinic_id && pr.clinics?.name) {
        linkedClinics = [{ id: pr.clinic_id, name: pr.clinics.name, role: pr.role }]
      }
    }
  } else {
    // Already linked — fetch their clinics
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('role, clinic_id, clinics(name)')
      .eq('id', user.linked_user_id)

    linkedClinics = ((profiles ?? []) as {
      role: string; clinic_id: string | null; clinics: { name: string } | null
    }[])
      .filter(p => p.clinic_id && p.clinics?.name)
      .map(p => ({ id: p.clinic_id!, name: p.clinics!.name, role: p.role }))
  }

  // ── Load bot config for the first admin clinic (if any) ──────────────────
  const adminClinic = linkedClinics.find(c => c.role === 'admin') ?? linkedClinics[0] ?? null
  let botConfig: ClinicBotConfig | null = null

  if (adminClinic) {
    const { data: cfg } = await supabase
      .from('clinics')
      .select('wa_ai_model, wa_ai_custom_prompt, wa_ai_allow_schedule, wa_ai_allow_confirm, wa_ai_allow_cancel')
      .eq('id', adminClinic.id)
      .single()
    if (cfg) botConfig = cfg as ClinicBotConfig
  }

  // ── Load recent conversation history (last 16 messages, excluding current) ─
  const { data: msgRows } = await supabase
    .from('wa_platform_messages')
    .select('role, content')
    .eq('platform_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(16)

  // Reverse to chronological, drop the last item (the user message we just inserted)
  const history = ((msgRows ?? []) as { role: string; content: string }[])
    .reverse()
    .slice(0, -1)

  // ── Build system prompt ───────────────────────────────────────────────────
  const userInfoLines = [
    `- Phone: ${fromPhone}`,
    user.name  ? `- Name: ${user.name}`  : `- Name: not known yet`,
    user.email ? `- Email: ${user.email}` : `- Email: not known yet`,
    user.linked_user_id
      ? `- Platform account: found ✓`
      : `- Platform account: not found`,
    linkedClinics.length > 0
      ? `- Clinics on Consultin: ${linkedClinics.map(c => `${c.name} (${c.role}, id:${c.id})`).join(', ')}`
      : `- Clinics on Consultin: none`,
  ]

  // Bot config block — shown only when user has a clinic they can configure
  const botConfigLines: string[] = []
  if (adminClinic && botConfig) {
    const modelLabel = botConfig.wa_ai_model ?? 'google/gemini-2.0-flash-001'
    botConfigLines.push(
      ``,
      `CURRENT BOT CONFIG for clinic "${adminClinic.name}" (id:${adminClinic.id}):`,
      `- AI model: ${modelLabel}`,
      `- Custom personality: ${botConfig.wa_ai_custom_prompt ? `"${botConfig.wa_ai_custom_prompt}"` : '(none)'}`,
      `- Can schedule new appointments: ${botConfig.wa_ai_allow_schedule ? 'yes' : 'no'}`,
      `- Can confirm appointments: ${botConfig.wa_ai_allow_confirm ? 'yes' : 'no'}`,
      `- Can cancel appointments: ${botConfig.wa_ai_allow_cancel ? 'yes' : 'no'}`,
      ``,
      `The user can ask to change any of these. Use configure_bot to apply changes.`,
      `Available models: google/gemini-2.0-flash-001, openai/gpt-4o-mini, google/gemma-3-27b-it:free`,
    )
  }

  const systemPrompt = [
    `You are the WhatsApp assistant for Consultin — a clinic management SaaS for Brazil.`,
    `You help people create a clinic account, manage their clinic, or join a clinic team.`,
    `You also let clinic admins configure their WhatsApp AI bot directly through this chat.`,
    ``,
    `YOUR PERSONALITY:`,
    `- Warm, natural, concise — like a helpful human on WhatsApp, not a form or a robot.`,
    `- Respond in the SAME language the user writes in (Portuguese or English).`,
    `- One topic at a time. Keep it conversational.`,
    `- Don't repeat yourself. Keep the conversation moving forward.`,
    ``,
    `WHAT YOU KNOW ABOUT THIS PERSON:`,
    ...userInfoLines,
    ...botConfigLines,
    ``,
    `CONVERSATION STRATEGY:`,
    ...(user.name
      ? [`- Their name is ${user.name}. Don't ask for it again.`]
      : [`- You don't know their name yet. Get it naturally early in the conversation.`]),
    ...(adminClinic
      ? [
          `- They are admin of "${adminClinic.name}". Offer bot configuration help proactively if relevant.`,
          `- When they ask about the bot, show the current config and offer to change things.`,
        ]
      : linkedClinics.length > 0
        ? [`- They're on Consultin but not as admin. Help them understand features.`]
        : [`- They're not linked to any clinic yet. Help them get started.`]),
    ``,
    `ABOUT CONSULTIN (use to answer product questions):`,
    `Complete clinic management: scheduling, patient records, billing, WhatsApp integration.`,
    `Made for Brazilian clinics (dental, medical, aesthetic, physio, etc.). Simple setup.`,
    `14-day free trial. Plans from R$97/month. Website: consultin.app`,
    ``,
    `─── AVAILABLE ACTIONS ───────────────────────────────────────────────────────`,
    `Return EXACTLY one of these JSON objects. No other text.`,
    ``,
    `{ "action": "reply", "replyText": "..." }`,
    `  → General responses: greetings, questions, info, asking for data`,
    ``,
    `{ "action": "save_info", "name": "...", "email": "...", "replyText": "..." }`,
    `  → When the user just told you their name or email. Only include the fields you just learned.`,
    ``,
    `{ "action": "submit_clinic_signup", "clinicName": "...", "responsibleName": "...", "email": "...", "phone": "...", "replyText": "..." }`,
    `  → Use ONLY when you have ALL: clinic name, responsible person name, email.`,
    `  → After this, tell the user they'll receive access details by email within 24h.`,
    ``,
    `{ "action": "configure_bot", "clinicId": "...", "replyText": "...", ...fields }`,
    `  → Update the clinic's WhatsApp AI bot settings. Only include fields that changed.`,
    `  → Allowed optional fields:`,
    `     "customPrompt": "new text"   — sets personality instructions (write exactly what the user said)`,
    `     "clearCustomPrompt": true    — removes custom personality (back to default)`,
    `     "allowSchedule": true/false  — whether the bot can book new appointments`,
    `     "allowConfirm":  true/false  — whether the bot can confirm appointments`,
    `     "allowCancel":   true/false  — whether the bot can cancel appointments`,
    `     "aiModel": "model-id"        — change the AI model`,
    `  → IMPORTANT: only use this if the user is admin of a clinic (clinicId must be valid).`,
    `  → Confirm what you changed in replyText.`,
    ``,
    `{ "action": "escalate", "replyText": "..." }`,
    `  → When the question is beyond your scope or needs a human.`,
    ``,
    `─── RULES ───────────────────────────────────────────────────────────────────`,
    `1. Know their name before asking for email or clinic details.`,
    `2. Know their email before submitting clinic signup.`,
    `3. Confirm the clinic info with the user before submitting (brief summary).`,
    `4. For configure_bot: always echo back what changed so the user sees the update.`,
    `5. Never invent data. Only use what the user tells you.`,
    `6. Keep replies short — max 4 lines for WhatsApp.`,
    `7. Respond ONLY with valid JSON. Nothing outside the JSON.`,
  ].join('\n')

  // ── Call the AI ───────────────────────────────────────────────────────────
  const model = 'google/gemini-2.0-flash-001'

  const orRes = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://consultin.app',
      'X-Title':      'Consultin Platform Bot',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: messageText },
      ],
      temperature: 0.3,
      max_tokens:  512,
    }),
  })

  // Default fallback
  let action: PlatformAction = {
    action:    'reply',
    replyText: '😅 Tive um problema aqui. Pode tentar de novo em instantes?',
  }

  if (orRes.ok) {
    const orBody     = await orRes.json()
    const rawContent = orBody?.choices?.[0]?.message?.content ?? ''
    // Strip markdown fences in case the model wraps JSON in ```json...```
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()
    try {
      action = JSON.parse(cleaned) as PlatformAction
    } catch {
      console.error('[platform-agent] Failed to parse AI JSON:', rawContent)
    }
  } else {
    console.error('[platform-agent] OpenRouter error:', await orRes.text())
  }

  // ── Save the assistant reply to history ───────────────────────────────────
  if (action.replyText) {
    await supabase.from('wa_platform_messages').insert({
      platform_user_id: user.id,
      role:             'assistant',
      content:          action.replyText,
    })
  }

  // ── Execute action side-effects ───────────────────────────────────────────

  if (action.action === 'save_info') {
    const updates: Record<string, unknown> = {}
    if (action.name?.trim())  updates.name  = action.name.trim()
    if (action.email?.trim()) updates.email = action.email.trim().toLowerCase()
    if (Object.keys(updates).length > 0) {
      await supabase
        .from('wa_platform_users')
        .update(updates)
        .eq('id', user.id)
    }
  }

  if (action.action === 'configure_bot') {
    const targetClinicId = action.clinicId ?? adminClinic?.id ?? null
    if (targetClinicId) {
      // Security: ensure the linked user is actually admin of that clinic
      const isAuthorised = linkedClinics.some(
        c => c.id === targetClinicId && (c.role === 'admin'),
      )
      if (isAuthorised) {
        const updates: Record<string, unknown> = {}
        if (action.clearCustomPrompt === true) {
          updates.wa_ai_custom_prompt = null
        } else if (typeof action.customPrompt === 'string') {
          updates.wa_ai_custom_prompt = action.customPrompt.trim() || null
        }
        if (typeof action.allowSchedule === 'boolean') updates.wa_ai_allow_schedule = action.allowSchedule
        if (typeof action.allowConfirm  === 'boolean') updates.wa_ai_allow_confirm  = action.allowConfirm
        if (typeof action.allowCancel   === 'boolean') updates.wa_ai_allow_cancel   = action.allowCancel
        if (typeof action.aiModel === 'string' && action.aiModel.trim()) {
          updates.wa_ai_model = action.aiModel.trim()
        }
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase
            .from('clinics')
            .update(updates)
            .eq('id', targetClinicId)
          if (error) {
            console.error('[platform-agent] configure_bot update error:', error)
          }
        }
      } else {
        console.warn('[platform-agent] configure_bot: user not authorised for clinic', targetClinicId)
      }
    }
  }

  if (action.action === 'submit_clinic_signup') {
    const clinicName      = action.clinicName?.trim() ?? ''
    const responsibleName = (action.responsibleName ?? user.name ?? '').trim()
    const email           = (action.email ?? user.email ?? '').trim().toLowerCase()
    const phone           = (action.phone ?? fromPhone).trim()

    if (clinicName && responsibleName && email) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-clinic-signup`, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${SUPABASE_SRK}`,
          },
          body: JSON.stringify({
            clinicName,
            responsibleName,
            email,
            phone,
            message: `Via WhatsApp. Telefone: ${fromPhone}`,
          }),
        })
        if (!res.ok) {
          console.error('[platform-agent] submit-clinic-signup failed:', await res.text())
        }
      } catch (e) {
        console.error('[platform-agent] submit-clinic-signup exception:', e)
      }
    } else {
      console.warn('[platform-agent] submit_clinic_signup missing required fields:', {
        clinicName, responsibleName, email,
      })
    }
  }

  // ── Send WhatsApp reply ───────────────────────────────────────────────────
  if (action.replyText) {
    await sendWA(fromPhone, action.replyText)
  }

  return new Response('OK', { status: 200 })
})

// ─── WhatsApp send helper (uses platform phone credentials) ───────────────────

async function sendWA(toPhone: string, text: string): Promise<void> {
  if (!PLATFORM_PHONE_ID || !PLATFORM_WA_TOKEN) {
    console.warn('[platform-agent] PLATFORM_PHONE_NUMBER_ID or PLATFORM_WA_TOKEN not set — skipping send')
    return
  }
  const res = await fetch(`${META_GRAPH_BASE}/${PLATFORM_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${PLATFORM_WA_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to:                toPhone,
      type:              'text',
      text:              { body: text, preview_url: false },
    }),
  })
  if (!res.ok) {
    console.error('[platform-agent] WA send error:', await res.text())
  }
}
