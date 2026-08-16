import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Banner, Button, Skeleton } from '@/components/ui'
import { irveRepository } from '@/features/charging-data/irve/repository'
import { StationDetail } from '@/features/stations/station-detail/StationDetail'
import { useSearchStore } from '@/features/stations/search-store'
import { useRequestedEnergy } from '@/features/stations/use-station-search'
import { haversineDistanceKm } from '@/lib/geo/coordinates'
import type { StationWithDistance } from '@/types/domain'

export default function StationPage() {
  const { stationId = '' } = useParams()
  const navigate = useNavigate()
  const origin = useSearchStore((state) => state.origin)
  const requestedKwh = useRequestedEnergy()

  const query = useQuery({
    queryKey: ['station', stationId],
    queryFn: () => irveRepository.getById(decodeURIComponent(stationId)),
    enabled: stationId.length > 0,
  })

  // Distances computed on the previous screen, when the user came from the list.
  const carried = (useLocation().state ?? null) as Partial<StationWithDistance> | null

  const station: StationWithDistance | null = query.data
    ? {
        ...query.data,
        straightLineDistanceKm:
          carried?.straightLineDistanceKm ??
          (origin ? haversineDistanceKm(origin, query.data.location) : Number.NaN),
        routeDistanceKm: carried?.routeDistanceKm,
        routeDurationMin: carried?.routeDurationMin,
        detourDistanceKm: carried?.detourDistanceKm,
        detourDurationMin: carried?.detourDurationMin,
      }
    : null

  return (
    <div className="page">
      <div className="page__header">
        <Button variant="ghost" onClick={() => navigate(-1)} aria-label="Revenir à la liste">
          ← Retour
        </Button>
      </div>

      {query.isLoading ? (
        <div className="stack">
          <span className="visually-hidden" role="status">
            Chargement de la station
          </span>
          <Skeleton height={32} width="70%" />
          <Skeleton height={18} width="40%" />
          <Skeleton height={140} />
        </div>
      ) : null}

      {!query.isLoading && !station ? (
        <Banner tone="warning" title="Station introuvable">
          <p>
            Cette borne n’est pas (ou plus) dans votre cache local. Revenez à la carte pour relancer
            une recherche.
          </p>
          <p>
            <Link to="/">Retour à la carte</Link>
          </p>
        </Banner>
      ) : null}

      {station ? <StationDetail station={station} requestedKwh={requestedKwh} /> : null}
    </div>
  )
}
