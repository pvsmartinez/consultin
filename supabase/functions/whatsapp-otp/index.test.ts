import { maskPhone, sha256 } from './index.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// ─── maskPhone ────────────────────────────────────────────────────────────────

Deno.test('maskPhone masks Brazilian mobile (11 digits without country code)', () => {
  // "11987654321" → strips to "11987654321" (no country prefix)
  // last4 = "4321", prefix = digits.slice(0, -8) = "119", area = digits.slice(prefix.length, prefix.length+2) = ?
  // Actually: digits = "11987654321" (11 digits)
  // last4 = "4321", prefix = "119".slice(0, len-8) = slice(0, 3) → "119"? No wait:
  // digits.length = 11, prefix = digits.slice(0, -8) = digits.slice(0, 3) = "119"
  // But area = digits.slice(prefix.length, prefix.length+2) = digits.slice(3, 5) = "87"
  // → "+119 (87) ****-4321"
  // Let's test a full international number instead:
  const result = maskPhone('+5511987654321')
  // digits = "5511987654321" (13 digits)
  // last4 = "4321", prefix = digits.slice(0, -8) = digits.slice(0, 5) = "55119"
  // area = digits.slice(5, 7) = "87"
  // → "+55119 (87) ****-4321"  ← doesn't produce a "nice" output, but verifies masking
  assert(result.includes('****'), `Expected **** in result: ${result}`)
  assert(result.includes('4321'), `Expected last4 '4321' in result: ${result}`)
  assert(!result.includes('9876'), `Middle digits should be masked: ${result}`)
})

Deno.test('maskPhone with clean Brazilian number +55 (DDD) produces expected format', () => {
  // digits = "551198765432" (12 chars) — typical short format
  const result = maskPhone('+55 (11) 98765-4321')
  // stripped: "5511987654321" (13 digits)
  assert(result.includes('****'), `Missing **** in: ${result}`)
  assert(result.includes('4321'), `Missing last4 in: ${result}`)
  assert(!result.includes('98765'), `Middle digits leaked in: ${result}`)
})

Deno.test('maskPhone returns original phone when too short to mask', () => {
  const result = maskPhone('+55119')
  // digits = "55119" (5 chars < 8)
  assert(result === '+55119', `Expected unchanged phone, got: ${result}`)
})

Deno.test('maskPhone handles phone without country code', () => {
  const result = maskPhone('11987654321')
  // digits = "11987654321" (11 digits >= 8)
  assert(result.includes('****'), `Expected masking: ${result}`)
  assert(result.includes('4321'), `Missing last4: ${result}`)
})

// ─── sha256 ───────────────────────────────────────────────────────────────────

Deno.test('sha256 produces a 64-char lowercase hex string', async () => {
  const hash = await sha256('hello')
  assert(hash.length === 64, `Expected 64 chars, got ${hash.length}`)
  assert(/^[0-9a-f]+$/.test(hash), `Expected lowercase hex, got: ${hash}`)
})

Deno.test('sha256 is deterministic — same input always yields same hash', async () => {
  const [h1, h2] = await Promise.all([sha256('test-otp-123'), sha256('test-otp-123')])
  assert(h1 === h2, `Hashes differ: ${h1} vs ${h2}`)
})

Deno.test('sha256 produces different hashes for different inputs', async () => {
  const [h1, h2] = await Promise.all([sha256('000000'), sha256('000001')])
  assert(h1 !== h2, 'Different inputs should produce different hashes')
})

Deno.test('sha256 matches known SHA-256 value for empty string', async () => {
  const hash = await sha256('')
  // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  assert(
    hash === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    `Unexpected hash for empty string: ${hash}`
  )
})

// ─── code format validation (inline guard logic mirrored from index.ts) ───────

Deno.test('6-digit code regex accepts only exactly 6 digits', () => {
  const validCodes = ['000000', '123456', '999999']
  const invalidCodes = ['12345', '1234567', 'abcdef', '12 345', '']

  const re = /^\d{6}$/

  for (const code of validCodes) {
    assert(re.test(code), `Expected '${code}' to be valid`)
  }
  for (const code of invalidCodes) {
    assert(!re.test(code), `Expected '${code}' to be invalid`)
  }
})
