import { Skeleton } from './Skeleton'

export function DashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Alert banner skeleton */}
      <div className="mb-4"><Skeleton height="48px" /></div>

      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-1">
          <Skeleton width="200px" height="28px" />
          <Skeleton width="300px" height="16px" />
        </div>
        <Skeleton width="100px" height="32px" />
      </div>

      {/* KPIs skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-surface-panel border border-border p-4 min-h-[100px] flex flex-col justify-between">
            <div>
              <Skeleton width="60%" height="30px" />
              <Skeleton width="40%" height="12px" />
            </div>
            <Skeleton width="30%" height="14px" />
          </div>
        ))}
      </div>

      {/* Quick links skeleton */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} width="140px" height="32px" />
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4">
            <Skeleton width="120px" height="14px" />
            <div className="mt-3">
              <Skeleton height="120px" />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs skeleton */}
      <div>
        <div className="flex gap-1 mb-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} width="90px" height="32px" />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="56px" />
          ))}
        </div>
      </div>
    </div>
  )
}