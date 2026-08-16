import { Skeleton } from '@/components/ui'

/** Local skeleton used while a lazy route loads — never a full-screen spinner (spec 30). */
export function PageFallback() {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
      <span className="visually-hidden" role="status">
        Chargement de la page
      </span>
      <Skeleton height={28} width="60%" />
      <Skeleton height={16} width="90%" />
      <Skeleton height={16} width="75%" />
      <Skeleton height={120} />
    </div>
  )
}
