import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { LIST_VIRTUALIZATION_THRESHOLD } from '@/config/constants'
import { Banner, Skeleton } from '@/components/ui'
import type { StationWithDistance } from '@/types/domain'
import { StationCard } from '../station-card/StationCard'
import './station-list.css'

/**
 * Station list, synchronised with the map.
 * Virtualised past 100 rows (spec 35.3).
 */

export interface StationListProps {
  stations: readonly StationWithDistance[]
  requestedKwh: number
  selectedStationId: string | null
  routedStationIds: Set<string>
  isLoading: boolean
  error: unknown
  emptyMessage?: string
  onSelect: (id: string) => void
  onOpenDetail: (id: string) => void
  onHover?: (id: string | null) => void
}

function ListSkeleton() {
  return (
    <div className="station-list__skeletons" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="station-list__skeleton-card">
          <Skeleton height={18} width="70%" />
          <Skeleton height={26} width="40%" />
          <Skeleton height={14} width="55%" />
          <Skeleton height={14} width="80%" />
        </div>
      ))}
    </div>
  )
}

export function StationList({
  stations,
  requestedKwh,
  selectedStationId,
  routedStationIds,
  isLoading,
  error,
  emptyMessage,
  onSelect,
  onOpenDetail,
  onHover,
}: StationListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const shouldVirtualize = stations.length > LIST_VIRTUALIZATION_THRESHOLD

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? stations.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 210,
    overscan: 6,
  })

  if (isLoading) {
    return (
      <div className="station-list" ref={parentRef}>
        <span className="visually-hidden" role="status">
          Recherche des bornes en cours
        </span>
        <ListSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="station-list station-list--message">
        <Banner tone="error" title="Données indisponibles">
          <p>Les données de bornes sont temporairement indisponibles.</p>
        </Banner>
      </div>
    )
  }

  if (stations.length === 0) {
    return (
      <div className="station-list station-list--message">
        <Banner tone="info" title="Aucune borne trouvée">
          <p>{emptyMessage ?? 'Élargissez la zone ou assouplissez vos filtres.'}</p>
        </Banner>
      </div>
    )
  }

  return (
    <div className="station-list" ref={parentRef} data-testid="station-list">
      <h2 className="visually-hidden">Bornes de recharge trouvées</h2>
      {shouldVirtualize ? (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const station = stations[item.index]
            if (!station) return null
            return (
              <div
                key={station.id}
                ref={virtualizer.measureElement}
                data-index={item.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <StationCard
                  station={station}
                  requestedKwh={requestedKwh}
                  selected={station.id === selectedStationId}
                  routed={routedStationIds.has(station.id)}
                  onSelect={onSelect}
                  onOpenDetail={onOpenDetail}
                  onHover={onHover}
                />
              </div>
            )
          })}
        </div>
      ) : (
        stations.map((station) => (
          <StationCard
            key={station.id}
            station={station}
            requestedKwh={requestedKwh}
            selected={station.id === selectedStationId}
            routed={routedStationIds.has(station.id)}
            onSelect={onSelect}
            onOpenDetail={onOpenDetail}
            onHover={onHover}
          />
        ))
      )}
    </div>
  )
}
