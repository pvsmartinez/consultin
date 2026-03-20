export const SEO_SITE_NAME = 'Consultin'
export const SEO_SITE_URL = 'https://consultin.pmatz.com'
export const SEO_DEFAULT_IMAGE = `${SEO_SITE_URL}/og-consultin.svg`

export const buildAbsoluteUrl = (path: string) => new URL(path, SEO_SITE_URL).toString()