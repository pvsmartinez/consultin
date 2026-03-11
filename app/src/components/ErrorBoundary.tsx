// Re-exports shared ErrorBoundary so all existing
// `import ErrorBoundary from './components/ErrorBoundary'`
// continue to work without changes across main.tsx, App.tsx, and AppLayout.tsx.
export { ErrorBoundary as default } from '@pvsmartinez/shared'
export type { ErrorBoundaryProps } from '@pvsmartinez/shared'
