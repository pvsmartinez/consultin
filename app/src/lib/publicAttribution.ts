const STORAGE_KEY = 'consultin-public-attribution'

const QUERY_PARAM_TO_METADATA_KEY = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
  gclid: 'gclid',
  gbraid: 'gbraid',
  wbraid: 'wbraid',
  fbclid: 'fbclid',
  msclkid: 'msclkid',
  ttclid: 'ttclid',
} as const

const TRACKING_QUERY_KEYS = Object.keys(QUERY_PARAM_TO_METADATA_KEY) as Array<keyof typeof QUERY_PARAM_TO_METADATA_KEY>

type MetadataKey = (typeof QUERY_PARAM_TO_METADATA_KEY)[keyof typeof QUERY_PARAM_TO_METADATA_KEY]

export type PublicAttributionMetadata = Partial<Record<MetadataKey, string>> & {
  landingPath?: string
  landingSearch?: string
  landingReferrer?: string
  pagePath?: string
  pageSearch?: string
  persona?: string
}

function cleanValue(value: unknown, maxLength = 255): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

function canUseSessionStorage() {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function readStoredAttribution(): PublicAttributionMetadata {
  if (!canUseSessionStorage()) return {}

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const result: PublicAttributionMetadata = {}

    for (const value of Object.values(QUERY_PARAM_TO_METADATA_KEY)) {
      const cleaned = cleanValue(parsed[value])
      if (cleaned) result[value] = cleaned
    }

    const landingPath = cleanValue(parsed.landingPath, 200)
    const landingSearch = cleanValue(parsed.landingSearch, 512)
    const landingReferrer = cleanValue(parsed.landingReferrer, 512)
    const pagePath = cleanValue(parsed.pagePath, 200)
    const pageSearch = cleanValue(parsed.pageSearch, 512)
    const persona = cleanValue(parsed.persona, 80)

    if (landingPath) result.landingPath = landingPath
    if (landingSearch) result.landingSearch = landingSearch
    if (landingReferrer) result.landingReferrer = landingReferrer
    if (pagePath) result.pagePath = pagePath
    if (pageSearch) result.pageSearch = pageSearch
    if (persona) result.persona = persona

    return result
  } catch {
    return {}
  }
}

function hasAttributionData(metadata: PublicAttributionMetadata) {
  return Object.values(metadata).some((value) => typeof value === 'string' && value.length > 0)
}

function writeStoredAttribution(metadata: PublicAttributionMetadata) {
  if (!canUseSessionStorage() || !hasAttributionData(metadata)) return

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(metadata))
  } catch {
    // Ignore storage errors on public routes.
  }
}

function extractTrackingParams(searchParams: URLSearchParams): PublicAttributionMetadata {
  const result: PublicAttributionMetadata = {}

  for (const queryKey of TRACKING_QUERY_KEYS) {
    const metadataKey = QUERY_PARAM_TO_METADATA_KEY[queryKey]
    const value = cleanValue(searchParams.get(queryKey))
    if (value) result[metadataKey] = value
  }

  const persona = cleanValue(searchParams.get('persona'), 80)
  if (persona) result.persona = persona

  return result
}

export function rememberPublicAttributionFromCurrentPage(): PublicAttributionMetadata {
  if (typeof window === 'undefined') return {}

  const stored = readStoredAttribution()
  const current = extractTrackingParams(new URLSearchParams(window.location.search))
  const landingSearch = cleanValue(window.location.search, 512)
  const landingReferrer = cleanValue(document.referrer, 512)
  const pagePath = cleanValue(window.location.pathname, 200)
  const pageSearch = cleanValue(window.location.search, 512)

  const merged: PublicAttributionMetadata = {
    ...stored,
    ...current,
    landingPath: stored.landingPath ?? pagePath,
    landingSearch: stored.landingSearch ?? landingSearch,
    landingReferrer: stored.landingReferrer ?? landingReferrer,
    pagePath,
    pageSearch,
    persona: current.persona ?? stored.persona,
  }

  writeStoredAttribution(merged)
  return merged
}

export function getPublicAttributionMetadata(overrides?: PublicAttributionMetadata): PublicAttributionMetadata {
  const base = typeof window === 'undefined'
    ? {}
    : rememberPublicAttributionFromCurrentPage()

  return {
    ...base,
    ...overrides,
  }
}

export function buildAttributedPath(targetPath: string): string {
  if (typeof window === 'undefined') return targetPath

  const metadata = rememberPublicAttributionFromCurrentPage()
  const url = new URL(targetPath, window.location.origin)
  const params = new URLSearchParams(url.search)
  const currentSearchParams = new URLSearchParams(window.location.search)

  for (const queryKey of TRACKING_QUERY_KEYS) {
    if (params.has(queryKey)) continue

    const currentValue = cleanValue(currentSearchParams.get(queryKey))
    if (currentValue) {
      params.set(queryKey, currentValue)
      continue
    }

    const metadataKey = QUERY_PARAM_TO_METADATA_KEY[queryKey]
    const storedValue = cleanValue(metadata[metadataKey])
    if (storedValue) params.set(queryKey, storedValue)
  }

  if (!params.has('persona')) {
    const currentPersona = cleanValue(currentSearchParams.get('persona'), 80)
    const storedPersona = cleanValue(metadata.persona, 80)
    if (currentPersona) params.set('persona', currentPersona)
    else if (storedPersona) params.set('persona', storedPersona)
  }

  const query = params.toString()
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`
}