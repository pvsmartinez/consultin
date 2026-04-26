import { sanitizeText, sanitizeAttribution } from './index.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

// ─── sanitizeText ─────────────────────────────────────────────────────────────

Deno.test('sanitizeText returns undefined for non-string inputs', () => {
  assert(sanitizeText(null, 100)      === undefined, 'null')
  assert(sanitizeText(undefined, 100) === undefined, 'undefined')
  assert(sanitizeText(42, 100)        === undefined, 'number')
  assert(sanitizeText({}, 100)        === undefined, 'object')
  assert(sanitizeText([], 100)        === undefined, 'array')
})

Deno.test('sanitizeText returns undefined for blank strings', () => {
  assert(sanitizeText('', 100)    === undefined, 'empty string')
  assert(sanitizeText('   ', 100) === undefined, 'whitespace only')
})

Deno.test('sanitizeText trims surrounding whitespace', () => {
  const result = sanitizeText('  hello  ', 100)
  assert(result === 'hello', `Expected 'hello', got '${result}'`)
})

Deno.test('sanitizeText truncates to maxLength', () => {
  const result = sanitizeText('abcdefghij', 5)
  assert(result === 'abcde', `Expected 'abcde', got '${result}'`)
})

Deno.test('sanitizeText truncates after trim (trim happens before slice)', () => {
  // Trim first → 'abc', then slice to 2 → 'ab'
  const result = sanitizeText('  abc  ', 2)
  assert(result === 'ab', `Expected 'ab', got '${result}'`)
})

Deno.test('sanitizeText preserves strings within maxLength', () => {
  const result = sanitizeText('Clínica Sorria', 255)
  assert(result === 'Clínica Sorria', `Unexpected result: '${result}'`)
})

// ─── sanitizeAttribution ──────────────────────────────────────────────────────

Deno.test('sanitizeAttribution returns empty object for invalid input', () => {
  const cases = [null, undefined, 'string', 42, [], true]
  for (const value of cases) {
    const result = sanitizeAttribution(value)
    assert(
      typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === 0,
      `Expected empty object for input: ${JSON.stringify(value)}`
    )
  }
})

Deno.test('sanitizeAttribution keeps only ATTRIBUTION_KEYS', () => {
  const result = sanitizeAttribution({
    utmSource: 'google',
    utmMedium: 'cpc',
    unknownKey: 'should-be-stripped',
    injected: '<script>alert(1)</script>',
  })
  assert('utmSource' in result,   'utmSource should be present')
  assert('utmMedium' in result,   'utmMedium should be present')
  assert(!('unknownKey' in result), 'unknownKey should be stripped')
  assert(!('injected' in result),   'injected should be stripped')
})

Deno.test('sanitizeAttribution strips blank and non-string values', () => {
  const result = sanitizeAttribution({
    utmSource: '',
    utmMedium: '   ',
    utmCampaign: null,
    utmContent: 42,
    gclid: 'valid-gclid',
  })
  assert(!('utmSource'   in result), 'blank utmSource should be omitted')
  assert(!('utmMedium'   in result), 'whitespace-only utmMedium should be omitted')
  assert(!('utmCampaign' in result), 'null utmCampaign should be omitted')
  assert(!('utmContent'  in result), 'number utmContent should be omitted')
  assert(result.gclid === 'valid-gclid', 'valid gclid should be kept')
})

Deno.test('sanitizeAttribution truncates landingSearch to 512 chars', () => {
  const longValue = 'x'.repeat(600)
  const result = sanitizeAttribution({ landingSearch: longValue })
  const len = result.landingSearch?.length ?? 0
  assert(len === 512, `Expected 512, got ${len}`)
})

Deno.test('sanitizeAttribution truncates standard keys to 255 chars', () => {
  const longValue = 'y'.repeat(300)
  const result = sanitizeAttribution({ utmSource: longValue })
  const len = result.utmSource?.length ?? 0
  assert(len === 255, `Expected 255, got ${len}`)
})

Deno.test('sanitizeAttribution handles all attribution keys without error', () => {
  const input: Record<string, string> = {
    utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'brand',
    utmContent: 'ad1', utmTerm: 'keyword', gclid: 'abc', gbraid: 'def',
    wbraid: 'ghi', fbclid: 'jkl', msclkid: 'mno', ttclid: 'pqr',
    landingPath: '/landing', landingSearch: '?q=1', landingReferrer: 'https://google.com',
    pagePath: '/page', pageSearch: '?p=1', persona: 'dentist',
  }
  const result = sanitizeAttribution(input)
  for (const [key, val] of Object.entries(input)) {
    assert(result[key] === val, `Key '${key}' should be '${val}', got '${result[key]}'`)
  }
})
