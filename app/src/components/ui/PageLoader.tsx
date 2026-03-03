// ─── Skeleton atom ───────────────────────────────────────────────────────────
// Paste this anywhere: <Skel className="h-4 w-32" /> → shimmering block
export function Skel({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:400%_100%] animate-shimmer ${className}`}
    />
  )
}

// ─── App Shell Skeleton ───────────────────────────────────────────────────────
// Mimics the full app: dark sidebar + dashboard-like content.
// Used for auth loading (FullScreenLoader) so the "first paint" feels instant.
function AppShellSkeleton() {
  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar skeleton */}
      <aside className="w-56 bg-gray-950 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <Skel className="h-5 w-5 rounded-full opacity-20" />
            <Skel className="h-4 w-20 opacity-20" />
          </div>
          <Skel className="h-3 w-24 opacity-10" />
        </div>
        {/* CTA button */}
        <div className="px-3 py-2">
          <Skel className="h-9 w-full rounded-lg opacity-20" />
        </div>
        {/* Nav items */}
        <nav className="flex-1 p-3 space-y-1">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <Skel className="h-4 w-4 rounded opacity-20" />
              <Skel className="h-3 flex-1 opacity-10" />
            </div>
          ))}
        </nav>
        {/* User */}
        <div className="p-3 border-t border-gray-800 flex items-center gap-2">
          <Skel className="h-6 w-6 rounded-full opacity-20" />
          <Skel className="h-3 w-24 opacity-10" />
        </div>
      </aside>
      {/* Main content skeleton */}
      <div className="flex-1 p-6 overflow-hidden">
        <DashboardContentSkeleton />
      </div>
    </div>
  )
}

// ─── Dashboard content skeleton ───────────────────────────────────────────────
function DashboardContentSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1.5">
        <Skel className="h-6 w-40" />
        <Skel className="h-3.5 w-28" />
      </div>
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skel className="h-3.5 w-28" />
              <Skel className="h-8 w-8 rounded-lg" />
            </div>
            <Skel className="h-7 w-16" />
            <Skel className="h-2.5 w-20" />
          </div>
        ))}
      </div>
      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center justify-between">
          <Skel className="h-4 w-36" />
          <Skel className="h-7 w-24 rounded-lg" />
        </div>
        <div className="divide-y divide-gray-50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skel className="h-8 w-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skel className="h-3.5 w-32" />
                <Skel className="h-2.5 w-24" />
              </div>
              <Skel className="h-5 w-16 rounded-full" />
              <Skel className="h-7 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Calendar skeleton ────────────────────────────────────────────────────────
export function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <Skel className="h-7 w-36" />
        <div className="flex gap-2">
          <Skel className="h-8 w-24 rounded-lg" />
          <Skel className="h-8 w-24 rounded-lg" />
          <Skel className="h-8 w-24 rounded-lg" />
        </div>
      </div>
      {/* Calendar grid */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="p-3 text-center border-r border-gray-50 last:border-0">
              <Skel className="h-3 w-10 mx-auto mb-1" />
              <Skel className="h-6 w-6 mx-auto rounded-full" />
            </div>
          ))}
        </div>
        {/* Time slots */}
        <div className="flex">
          {/* Time labels */}
          <div className="w-14 flex-shrink-0 border-r border-gray-50">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-16 flex items-start pt-1 px-2">
                <Skel className="h-2.5 w-8" />
              </div>
            ))}
          </div>
          {/* Event columns */}
          <div className="flex-1 grid grid-cols-7">
            {[...Array(7)].map((_, col) => (
              <div key={col} className="border-r border-gray-50 last:border-0">
                {[...Array(7)].map((_, row) => (
                  <div key={row} className="h-16 border-b border-gray-50 last:border-0 p-0.5">
                    {/* Randomly place fake events */}
                    {(col * 7 + row) % 5 === 0 && (
                      <Skel className="h-12 rounded-md opacity-70" />
                    )}
                    {(col * 7 + row) % 8 === 0 && (
                      <Skel className="h-8 rounded-md opacity-50" />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Table skeleton ──────────────────────────────────────────────────────────
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {/* Search + actions */}
      <div className="flex items-center justify-between">
        <Skel className="h-6 w-32" />
        <div className="flex gap-2">
          <Skel className="h-9 w-48 rounded-lg" />
          <Skel className="h-9 w-28 rounded-lg" />
        </div>
      </div>
      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-b border-gray-100">
          {[60, 100, 80, 80, 60].map((w, i) => (
            <Skel key={i} className={`h-3 w-${w < 80 ? '[60px]' : w < 100 ? '[80px]' : '[100px]'}`} />
          ))}
        </div>
        {/* Rows */}
        <div className="divide-y divide-gray-50">
          {[...Array(rows)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skel className="h-8 w-8 rounded-full flex-shrink-0" />
              <Skel className="h-3.5 w-32" />
              <Skel className="h-3 w-24" />
              <Skel className="h-3 w-20" />
              <Skel className="h-5 w-16 rounded-full" />
              <div className="ml-auto flex gap-2">
                <Skel className="h-7 w-7 rounded-lg" />
                <Skel className="h-7 w-7 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Generic page skeleton ────────────────────────────────────────────────────
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skel className="h-6 w-40" />
          <Skel className="h-3.5 w-24" />
        </div>
        <Skel className="h-9 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <Skel className="h-3.5 w-24" />
            <Skel className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skel className="h-8 w-8 rounded-full flex-shrink-0" />
            <Skel className="h-3.5 flex-1" />
            <Skel className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Exported fallbacks used by Suspense boundaries in App.tsx ───────────────

/** Used inside AppLayout — shows content-area skeleton only (sidebar already rendered). */
export function PageLoader() {
  return <PageSkeleton />
}

/** Used before AppLayout is mounted (auth loading / initial chunk fetch). */
export function FullScreenLoader() {
  return <AppShellSkeleton />
}

