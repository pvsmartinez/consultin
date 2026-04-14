import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import { FullScreenLoader } from './components/ui/PageLoader'
import './index.css'

const PublicRoutes = lazy(() => import('./routes/PublicRoutes'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,        // 1 min: background refresh after this
      gcTime:    1000 * 60 * 30,   // 30 min: keep data in memory even while not visible
      retry: 1,
    },
  },
})

function RootApp() {
  const location = useLocation()

  if (location.pathname.startsWith('/p/')) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <PublicRoutes />
      </Suspense>
    )
  }

  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <RootApp />
            <Toaster position="top-right" richColors />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
