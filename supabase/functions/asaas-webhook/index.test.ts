import {
  EVENT_TO_STATUS,
  EVENT_TO_SUBSCRIPTION_UPDATE,
  syncClinicSubscriptionStatus,
} from './index.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// ─── EVENT_TO_STATUS mapping ──────────────────────────────────────────────────

Deno.test('EVENT_TO_STATUS maps all known payment events correctly', () => {
  const expected: Record<string, string> = {
    PAYMENT_RECEIVED:  'RECEIVED',
    PAYMENT_CONFIRMED: 'CONFIRMED',
    PAYMENT_OVERDUE:   'OVERDUE',
    PAYMENT_DELETED:   'CANCELLED',
    PAYMENT_REFUNDED:  'REFUNDED',
  }
  for (const [event, status] of Object.entries(expected)) {
    assert(EVENT_TO_STATUS[event] === status, `${event} → expected '${status}', got '${EVENT_TO_STATUS[event]}'`)
  }
})

Deno.test('EVENT_TO_STATUS returns undefined for unknown events', () => {
  const unknown = ['PAYMENT_CREATED', 'SUBSCRIPTION_CREATED', 'TRANSFER_CREATED', '']
  for (const ev of unknown) {
    assert(EVENT_TO_STATUS[ev] === undefined, `'${ev}' should not map to any status`)
  }
})

// ─── EVENT_TO_SUBSCRIPTION_UPDATE mapping ─────────────────────────────────────

Deno.test('RECEIVED and CONFIRMED both activate subscription', () => {
  for (const event of ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']) {
    const upd = EVENT_TO_SUBSCRIPTION_UPDATE[event]
    assert(upd !== undefined, `${event} should have a subscription update`)
    assert(upd!.subscriptionStatus === 'ACTIVE', `${event} should set ACTIVE`)
    assert(upd!.paymentsEnabled === true, `${event} should enable payments`)
  }
})

Deno.test('OVERDUE downgrades subscription and disables payments', () => {
  const upd = EVENT_TO_SUBSCRIPTION_UPDATE['PAYMENT_OVERDUE']
  assert(upd !== undefined, 'PAYMENT_OVERDUE should have a subscription update')
  assert(upd!.subscriptionStatus === 'OVERDUE', 'Expected OVERDUE status')
  assert(upd!.paymentsEnabled === false, 'Expected paymentsEnabled=false')
})

Deno.test('DELETED and REFUNDED do not touch subscription status', () => {
  for (const event of ['PAYMENT_DELETED', 'PAYMENT_REFUNDED']) {
    assert(EVENT_TO_SUBSCRIPTION_UPDATE[event] === undefined, `${event} should not update subscription`)
  }
})

// ─── syncClinicSubscriptionStatus ────────────────────────────────────────────

/** Minimal Supabase mock that intercepts select + update chains */
function buildMockSupabase(opts: {
  clinicBySubscription?: { id: string } | null
  clinicByExternalRef?: { id: string } | null
  updateError?: string | null
}) {
  const updates: Array<{ clinicId: string; subscription_status: string; payments_enabled: boolean }> = []

  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (col: string, _val: string) => {
          const data = col === 'asaas_subscription_id'
            ? (opts.clinicBySubscription ?? null)
            : (opts.clinicByExternalRef ?? null)
          return { maybeSingle: async () => ({ data }) }
        },
      }),
      update: (data: { subscription_status: string; payments_enabled: boolean }) => ({
        eq: (_col: string, id: string) => {
          updates.push({ clinicId: id, ...data })
          return { error: opts.updateError ? { message: opts.updateError } : null }
        },
      }),
    }),
    getUpdates: () => updates,
  }
}

Deno.test('syncClinicSubscriptionStatus returns early for events without subscription update', async () => {
  const mock = buildMockSupabase({})
  await syncClinicSubscriptionStatus(mock as never, 'PAYMENT_DELETED', { subscription: 'sub_abc' })
  await syncClinicSubscriptionStatus(mock as never, 'PAYMENT_REFUNDED', { subscription: 'sub_abc' })
  await syncClinicSubscriptionStatus(mock as never, 'UNKNOWN_EVENT', { subscription: 'sub_abc' })
  assert(mock.getUpdates().length === 0, 'No updates expected for non-subscription events')
})

Deno.test('syncClinicSubscriptionStatus returns early when neither subscription nor externalReference provided', async () => {
  const mock = buildMockSupabase({})
  await syncClinicSubscriptionStatus(mock as never, 'PAYMENT_RECEIVED', {})
  assert(mock.getUpdates().length === 0, 'No update when payment has no subscription or externalReference')
})

Deno.test('syncClinicSubscriptionStatus finds clinic by subscription ID and sets ACTIVE', async () => {
  const mock = buildMockSupabase({ clinicBySubscription: { id: 'clinic-001' } })

  await syncClinicSubscriptionStatus(mock as never, 'PAYMENT_RECEIVED', {
    subscription: 'sub_123',
  })

  const updates = mock.getUpdates()
  assert(updates.length === 1, `Expected 1 update, got ${updates.length}`)
  assert(updates[0].clinicId === 'clinic-001', `Wrong clinicId: ${updates[0].clinicId}`)
  assert(updates[0].subscription_status === 'ACTIVE', `Expected ACTIVE, got ${updates[0].subscription_status}`)
  assert(updates[0].payments_enabled === true, 'Expected payments_enabled=true')
})

Deno.test('syncClinicSubscriptionStatus falls back to externalReference when subscription not found', async () => {
  const mock = buildMockSupabase({
    clinicBySubscription: null,        // not found by subscription
    clinicByExternalRef: { id: 'clinic-002' },
  })

  await syncClinicSubscriptionStatus(mock as never, 'PAYMENT_CONFIRMED', {
    subscription: 'sub_456',
    externalReference: 'clinic-002',
  })

  const updates = mock.getUpdates()
  assert(updates.length === 1, `Expected 1 update, got ${updates.length}`)
  assert(updates[0].clinicId === 'clinic-002', `Wrong clinicId: ${updates[0].clinicId}`)
  assert(updates[0].subscription_status === 'ACTIVE', `Expected ACTIVE`)
  assert(updates[0].payments_enabled === true, 'Expected payments_enabled=true')
})

Deno.test('syncClinicSubscriptionStatus uses only externalReference when subscription absent', async () => {
  const mock = buildMockSupabase({ clinicByExternalRef: { id: 'clinic-003' } })

  await syncClinicSubscriptionStatus(mock as never, 'PAYMENT_OVERDUE', {
    externalReference: 'clinic-003',
  })

  const updates = mock.getUpdates()
  assert(updates.length === 1, `Expected 1 update, got ${updates.length}`)
  assert(updates[0].subscription_status === 'OVERDUE', `Expected OVERDUE, got ${updates[0].subscription_status}`)
  assert(updates[0].payments_enabled === false, 'Expected payments_enabled=false')
})

Deno.test('syncClinicSubscriptionStatus does nothing when clinic not found in DB', async () => {
  const mock = buildMockSupabase({
    clinicBySubscription: null,
    clinicByExternalRef: null,
  })

  await syncClinicSubscriptionStatus(mock as never, 'PAYMENT_RECEIVED', {
    subscription: 'sub_ghost',
    externalReference: 'does-not-exist',
  })

  assert(mock.getUpdates().length === 0, 'No update expected when clinic not found')
})

Deno.test('syncClinicSubscriptionStatus prefers subscription over externalReference', async () => {
  // Both resolve to different clinics — subscription should win
  const mock = buildMockSupabase({
    clinicBySubscription: { id: 'clinic-by-sub' },
    clinicByExternalRef:  { id: 'clinic-by-ext' },
  })

  await syncClinicSubscriptionStatus(mock as never, 'PAYMENT_RECEIVED', {
    subscription: 'sub_win',
    externalReference: 'ext_lose',
  })

  const updates = mock.getUpdates()
  assert(updates.length === 1, `Expected exactly 1 update, got ${updates.length}`)
  assert(updates[0].clinicId === 'clinic-by-sub', `Expected clinic-by-sub, got ${updates[0].clinicId}`)
})
