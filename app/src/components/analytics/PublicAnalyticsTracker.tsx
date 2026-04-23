import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { rememberPublicAttributionFromCurrentPage } from '../../lib/publicAttribution'
import { trackPublicPageView } from '../../lib/publicAnalytics'

export default function PublicAnalyticsTracker() {
  const location = useLocation()

  useEffect(() => {
    rememberPublicAttributionFromCurrentPage()
    trackPublicPageView(`${location.pathname}${location.search}`)
  }, [location.pathname, location.search])

  return null
}