export function Skeleton({ width = '100%', height = '20px', rounded = false }: { width?: string; height?: string; rounded?: boolean }) {
  return (
    <div className="skeleton" style={{ width, height, borderRadius: rounded ? '50%' : '4px' }} />
  )
}

export function SkeletonCard() {
  return (
    <div className="card skeleton-card">
      <Skeleton height="24px" width="60%" />
      <div className="skeleton-fields">
        <Skeleton height="16px" width="40%" />
        <Skeleton height="16px" width="80%" />
        <Skeleton height="16px" width="55%" />
      </div>
      <div className="skeleton-fields">
        <Skeleton height="16px" width="70%" />
        <Skeleton height="16px" width="45%" />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-table">
      <div className="skeleton-thead">
        <Skeleton height="16px" width="15%" />
        <Skeleton height="16px" width="25%" />
        <Skeleton height="16px" width="20%" />
        <Skeleton height="16px" width="15%" />
        <Skeleton height="16px" width="10%" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <Skeleton height="14px" width="15%" />
          <Skeleton height="14px" width="25%" />
          <Skeleton height="14px" width="20%" />
          <Skeleton height="14px" width="15%" />
          <Skeleton height="14px" width="10%" />
        </div>
      ))}
    </div>
  )
}