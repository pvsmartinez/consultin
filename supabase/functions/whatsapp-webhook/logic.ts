export interface MetaWebhookPayload {
  entry?: {
    changes?: {
      field: string
      value: {
        metadata?: { phone_number_id: string }
        messages?: MetaMessage[]
        statuses?: { id: string; status: string }[]
        contacts?: MetaContact[]
      }
    }[]
  }[]
}

export interface MetaMessage {
  id: string
  from: string
  type: string
  text?: { body: string }
  audio?: { id: string }
  image?: { id: string; caption?: string }
  document?: { id: string; filename?: string }
  button?: { text: string; payload: string }
  interactive?: { button_reply?: { id: string; title: string } }
}

export interface MetaContact {
  profile: { name: string }
  wa_id: string
}

export interface WebhookMessageBatch {
  route: 'platform' | 'clinic'
  phoneNumberId: string
  messages: MetaMessage[]
  statuses: Array<{ id: string; status: string }>
  contacts: MetaContact[]
}

export interface ParsedPlatformMessageInput {
  fromPhone: string
  msgType: string
  waMessageId: string
  buttonReplyId: string | null
  messageText: string | null
  audioId: string | null
}

export function extractWebhookMessageBatches(
  payload: MetaWebhookPayload,
  platformPhoneId?: string | null,
): WebhookMessageBatch[] {
  const batches: WebhookMessageBatch[] = []

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue

      const phoneNumberId = change.value.metadata?.phone_number_id
      if (!phoneNumberId) continue

      batches.push({
        route: platformPhoneId && phoneNumberId === platformPhoneId ? 'platform' : 'clinic',
        phoneNumberId,
        messages: change.value.messages ?? [],
        statuses: change.value.statuses ?? [],
        contacts: change.value.contacts ?? [],
      })
    }
  }

  return batches
}

export function parsePlatformMessageInput(msg: MetaMessage): ParsedPlatformMessageInput {
  return {
    fromPhone: msg.from,
    msgType: msg.type,
    waMessageId: msg.id,
    buttonReplyId: msg.interactive?.button_reply?.id ?? null,
    messageText:
      msg.text?.body ??
      msg.button?.text ??
      msg.interactive?.button_reply?.title ??
      null,
    audioId: msg.audio?.id ?? null,
  }
}