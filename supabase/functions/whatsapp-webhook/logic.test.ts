import {
  extractWebhookMessageBatches,
  parsePlatformMessageInput,
  type MetaWebhookPayload,
} from './logic.ts'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

Deno.test('extractWebhookMessageBatches routes platform payloads before clinic lookup', () => {
  const payload: MetaWebhookPayload = {
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: 'platform-phone-id' },
          messages: [{
            id: 'wamid-1',
            from: '5511999999999',
            type: 'text',
            text: { body: 'Oi, quero cadastrar minha clínica no Consultin' },
          }],
        },
      }],
    }],
  }

  const batches = extractWebhookMessageBatches(payload, 'platform-phone-id')
  assert(batches.length === 1, `Expected 1 batch, got ${batches.length}`)
  assert(batches[0].route === 'platform', `Expected platform route, got ${batches[0].route}`)
  assert(batches[0].phoneNumberId === 'platform-phone-id', 'Expected platform phone number id to be preserved')
})

Deno.test('extractWebhookMessageBatches keeps clinic statuses and contacts together', () => {
  const payload: MetaWebhookPayload = {
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: 'clinic-phone-id' },
          statuses: [{ id: 'status-1', status: 'delivered' }],
          contacts: [{ wa_id: '5511888888888', profile: { name: 'Maria' } }],
          messages: [{
            id: 'wamid-2',
            from: '5511888888888',
            type: 'text',
            text: { body: 'Quero confirmar minha consulta' },
          }],
        },
      }],
    }],
  }

  const batches = extractWebhookMessageBatches(payload, 'platform-phone-id')
  assert(batches.length === 1, `Expected 1 batch, got ${batches.length}`)
  assert(batches[0].route === 'clinic', `Expected clinic route, got ${batches[0].route}`)
  assert(batches[0].statuses.length === 1, 'Expected clinic statuses to be preserved')
  assert(batches[0].contacts[0]?.profile.name === 'Maria', 'Expected clinic contacts to be preserved')
})

Deno.test('extractWebhookMessageBatches ignores non-message changes and missing phone ids', () => {
  const payload: MetaWebhookPayload = {
    entry: [{
      changes: [
        {
          field: 'statuses',
          value: {
            metadata: { phone_number_id: 'clinic-phone-id' },
          },
        },
        {
          field: 'messages',
          value: {
            messages: [],
          },
        },
      ],
    }],
  }

  const batches = extractWebhookMessageBatches(payload, 'platform-phone-id')
  assert(batches.length === 0, `Expected 0 batches, got ${batches.length}`)
})

Deno.test('parsePlatformMessageInput extracts plain text payloads', () => {
  const parsed = parsePlatformMessageInput({
    id: 'wamid-3',
    from: '5511777777777',
    type: 'text',
    text: { body: 'quanto custa?' },
  })

  assert(parsed.messageText === 'quanto custa?', `Expected plain text body, got ${parsed.messageText}`)
  assert(parsed.buttonReplyId === null, 'Expected no button reply id for plain text')
})

Deno.test('parsePlatformMessageInput extracts interactive reply ids and titles', () => {
  const parsed = parsePlatformMessageInput({
    id: 'wamid-4',
    from: '5511666666666',
    type: 'interactive',
    interactive: {
      button_reply: {
        id: 'view_pricing',
        title: 'Ver precos',
      },
    },
  })

  assert(parsed.buttonReplyId === 'view_pricing', `Expected view_pricing button id, got ${parsed.buttonReplyId}`)
  assert(parsed.messageText === 'Ver precos', `Expected interactive title as message text, got ${parsed.messageText}`)
})

Deno.test('parsePlatformMessageInput preserves audio ids for later transcription', () => {
  const parsed = parsePlatformMessageInput({
    id: 'wamid-5',
    from: '5511555555555',
    type: 'audio',
    audio: { id: 'audio-123' },
  })

  assert(parsed.audioId === 'audio-123', `Expected audio id to be preserved, got ${parsed.audioId}`)
  assert(parsed.messageText === null, 'Expected audio payload to wait for transcription before text routing')
})