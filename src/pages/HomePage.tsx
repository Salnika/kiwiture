import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Banner, Button, Chip } from '@/components/ui'
import { BottomSheet, type SheetState } from '@/components/BottomSheet'
import { PlaceSearchInput } from '@/features/geocoding/PlaceSearchInput'
import { reverseGeocode } from '@/features/geocoding'
import { useGeolocation } from '@/features/geolocation/use-geolocation'
import { FilterBar } from '@/features/stations/filters/FilterBar'
import { StationList } from '@/features/stations/station-list/StationList'
import { TradeoffCallout } from '@/features/stations/TradeoffCallout'
import { EnergyInput } from '@/features/pricing/EnergyInput'
import { useSearchStore } from '@/features/stations/search-store'
import { useBaseRoute, useRequestedEnergy, useStationSearch } from '@/features/stations/use-station-search'
import { decodePolyline } from '@/lib/geo/polyline'
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/hooks/use-media-query'
import { formatDate, formatDistanceKm } from '@/lib/format'
import { FEATURE_FLAGS } from '@/config/env'

const MapView = lazy(() => import('@/features/map/MapView'))

/** Main screen (spec 20). Map + list, always in sync. */
export default function HomePage() {
  const navigate = useNavigate()
  const geolocation = useGeolocation()

  const origin = useSearchStore((state) => state.origin)
  const destination = useSearchStore((state) => state.destination)
  const setOrigin = useSearchStore((state) => state.setOrigin)
  const setDestination = useSearchStore((state) => state.setDestination)
  const mode = useSearchStore((state) => state.mode)
  const setMode = useSearchStore((state) => state.setMode)
  const selectedStationId = useSearchStore((state) => state.selectedStationId)
  const selectStation = useSearchStore((state) => state.selectStation)
  const hoverStation = useSearchStore((state) => state.hoverStation)

  const [originText, setOriginText] = useState('')
  const [destinationText, setDestinationText] = useState('')
  const [sheetState, setSheetState] = useState<SheetState>('half')
  const [locationAsked, setLocationAsked] = useState(false)

  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const requestedKwh = useRequestedEnergy()
  const search = useStationSearch()
  const baseRoute = useBaseRoute(origin, mode === 'trip' ? destination : null)

  const routePoints = useMemo(() => {
    if (mode !== 'trip' || !baseRoute.data?.geometry) return null
    return { points: decodePolyline(baseRoute.data.geometry, baseRoute.data.geometryPrecision ?? 5) }
  }, [mode, baseRoute.data?.geometry, baseRoute.data?.geometryPrecision])

  const locate = useCallback(async () => {
    setLocationAsked(true)
    const position = await geolocation.request()
    if (!position) return
    setOrigin({ ...position, label: 'Ma position' })
    setOriginText('Ma position')
    // Best effort: a readable label is nicer, but a failure changes nothing.
    try {
      const place = await reverseGeocode(position.latitude, position.longitude)
      setOriginText(place.context ? `${place.label}, ${place.context}` : place.label)
    } catch {
      /* keep "Ma position" */
    }
  }, [geolocation, setOrigin])

  /**
   * Geolocation is requested only after the shell has painted (spec 13), and
   * only once.
   */
  useEffect(() => {
    if (locationAsked || origin) return
    const timer = window.setTimeout(() => void locate(), 350)
    return () => window.clearTimeout(timer)
  }, [locationAsked, origin, locate])

  const openDetail = useCallback(
    (id: string) => {
      selectStation(id)
      navigate(`/station/${encodeURIComponent(id)}`)
    },
    [navigate, selectStation],
  )

  const listProps = {
    stations: search.stations,
    requestedKwh,
    selectedStationId,
    routedStationIds: search.routedStationIds,
    isLoading: search.isLoading,
    error: search.error,
    emptyMessage:
      search.allStations.length > 0
        ? 'Aucune borne ne correspond à vos filtres. Assouplissez-les pour voir plus de résultats.'
        : 'Aucune borne publique n’est répertoriée dans cette zone.',
    onSelect: selectStation,
    onOpenDetail: openDetail,
    onHover: hoverStation,
  }

  const notices = (
    <>
      {geolocation.error && !origin ? (
        <Banner tone="warning" title="Position indisponible">
          <p>{geolocation.error.message}</p>
        </Banner>
      ) : null}

      {search.origin === 'cache' && search.stations.length > 0 ? (
        <Banner tone="info" title="Affichage des dernières données disponibles">
          <p>
            Données locales{search.fetchedAt ? ` du ${formatDate(new Date(search.fetchedAt).toISOString())}` : ''}.
            Elles peuvent être anciennes.
          </p>
        </Banner>
      ) : null}

      {search.routingUnavailable && search.stations.length > 0 ? (
        <Banner tone="warning" title="Distance routière indisponible">
          <p>Les distances affichées sont à vol d’oiseau.</p>
        </Banner>
      ) : null}

      {search.truncated ? (
        <Banner tone="info" title="Zone très dense">
          <p>
            Seules les bornes dans un rayon de {formatDistanceKm(search.effectiveRadiusKm)} sont
            chargées. Zoomez ou déplacez la recherche pour en voir d’autres.
          </p>
        </Banner>
      ) : null}
    </>
  )

  /** Rendered once, in the desktop column or in the mobile sheet — never both. */
  const listPanel = (
    <>
      <div className="stack" style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
        {notices}
        <TradeoffCallout stations={search.stations} requestedKwh={requestedKwh} />
      </div>
      <StationList {...listProps} />
    </>
  )

  return (
    <div className="home">
      <header className="home__header">
        <div className="home__title-row">
          <p className="home__brand">
            <span className="home__brand-mark" aria-hidden="true" />
            Kiwiture
          </p>
          <nav className="home__header-actions" aria-label="Navigation secondaire">
            {FEATURE_FLAGS.vehicleProfile ? (
              <Link className="button button--ghost" to="/vehicule">
                Véhicule
              </Link>
            ) : null}
            <Link className="button button--ghost" to="/reglages">
              Réglages
            </Link>
          </nav>
        </div>

        <div className="search-fields">
          <PlaceSearchInput
            label="Ma position ou une adresse de départ"
            placeholder="Ma position"
            value={originText}
            onValueChange={setOriginText}
            onSelect={(place) => setOrigin(place)}
            onClear={() => setOrigin(null)}
            proximity={origin}
            leadingAction={
              <button
                type="button"
                className="place-search__clear"
                aria-label="Utiliser ma position actuelle"
                title="Utiliser ma position actuelle"
                onClick={() => void locate()}
              >
                ◎
              </button>
            }
          />

          {FEATURE_FLAGS.tripSearch ? (
            <PlaceSearchInput
              label="Destination (facultatif)"
              placeholder="Destination (facultatif)"
              value={destinationText}
              onValueChange={setDestinationText}
              onSelect={(place) => setDestination(place)}
              onClear={() => setDestination(null)}
              proximity={origin}
            />
          ) : null}
        </div>

        <div className="quick-actions" role="group" aria-label="Mode de recherche">
          <Chip active={mode === 'around'} onClick={() => setMode('around')}>
            Autour de moi
          </Chip>
          {FEATURE_FLAGS.tripSearch ? (
            <Chip
              active={mode === 'trip'}
              disabled={!destination}
              title={destination ? undefined : 'Renseignez une destination'}
              onClick={() => setMode('trip')}
            >
              Sur mon trajet
            </Chip>
          ) : null}
          <EnergyInput />
        </div>

        <FilterBar />
      </header>

      <main className="home__body" id="main">
        {isDesktop ? (
          <aside className="home__list" aria-label="Liste des bornes">
            {listPanel}
          </aside>
        ) : null}

        <div className="home__map">
          {origin ? (
            <Suspense fallback={<div className="map-placeholder">Chargement de la carte…</div>}>
              <MapView
                stations={search.stations}
                origin={origin}
                destination={mode === 'trip' ? destination : null}
                selectedStationId={selectedStationId}
                onSelectStation={selectStation}
                routeGeometry={routePoints}
              />
            </Suspense>
          ) : (
            <div className="map-placeholder">
              <p>Autorisez votre position ou recherchez une adresse pour afficher les bornes.</p>
              <Button variant="primary" onClick={() => void locate()}>
                Utiliser ma position
              </Button>
            </div>
          )}

          {!isDesktop ? (
            <BottomSheet
              className="home__sheet"
              state={sheetState}
              onStateChange={setSheetState}
              title={
                search.isLoading
                  ? 'Recherche…'
                  : `${search.stations.length} borne${search.stations.length > 1 ? 's' : ''}`
              }
            >
              {listPanel}
            </BottomSheet>
          ) : null}
        </div>
      </main>
    </div>
  )
}
