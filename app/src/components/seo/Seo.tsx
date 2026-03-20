import { useEffect } from 'react'
import { buildAbsoluteUrl, SEO_DEFAULT_IMAGE, SEO_SITE_NAME } from '../../lib/seo'

type StructuredData = Record<string, unknown>

type SeoProps = {
  title: string
  description: string
  canonicalPath: string
  keywords?: string[]
  image?: string
  type?: 'website' | 'article'
  locale?: string
  lang?: string
  noindex?: boolean
  structuredData?: StructuredData | StructuredData[]
}

const ensureMetaTag = (attribute: 'name' | 'property', key: string) => {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)

  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }

  return element
}

const setMetaContent = (attribute: 'name' | 'property', key: string, value: string) => {
  ensureMetaTag(attribute, key).setAttribute('content', value)
}

const removeMetaTag = (attribute: 'name' | 'property', key: string) => {
  document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove()
}

const setLinkHref = (rel: string, href: string) => {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)

  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', rel)
    document.head.appendChild(element)
  }

  element.setAttribute('href', href)
}

const replaceStructuredData = (items?: StructuredData | StructuredData[]) => {
  document.head
    .querySelectorAll('script[data-consultin-seo="true"]')
    .forEach((element) => element.remove())

  if (!items) return

  const normalizedItems = Array.isArray(items) ? items : [items]

  normalizedItems.forEach((item) => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.consultinSeo = 'true'
    script.text = JSON.stringify(item)
    document.head.appendChild(script)
  })
}

export function Seo({
  title,
  description,
  canonicalPath,
  keywords,
  image = SEO_DEFAULT_IMAGE,
  type = 'website',
  locale = 'pt_BR',
  lang = 'pt-BR',
  noindex = false,
  structuredData,
}: SeoProps) {
  useEffect(() => {
    const canonicalUrl = buildAbsoluteUrl(canonicalPath)

    document.title = title
    document.documentElement.lang = lang

    setMetaContent('name', 'description', description)
    setMetaContent('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    setMetaContent('name', 'theme-color', '#0d9488')

    if (keywords && keywords.length > 0) {
      setMetaContent('name', 'keywords', keywords.join(', '))
    } else {
      removeMetaTag('name', 'keywords')
    }

    setMetaContent('property', 'og:type', type)
    setMetaContent('property', 'og:url', canonicalUrl)
    setMetaContent('property', 'og:title', title)
    setMetaContent('property', 'og:description', description)
    setMetaContent('property', 'og:image', image)
    setMetaContent('property', 'og:site_name', SEO_SITE_NAME)
    setMetaContent('property', 'og:locale', locale)

    setMetaContent('name', 'twitter:card', 'summary_large_image')
    setMetaContent('name', 'twitter:title', title)
    setMetaContent('name', 'twitter:description', description)
    setMetaContent('name', 'twitter:image', image)

    setLinkHref('canonical', canonicalUrl)
    replaceStructuredData(structuredData)
  }, [canonicalPath, description, image, keywords, lang, locale, noindex, structuredData, title, type])

  return null
}