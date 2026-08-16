import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Banner, Button, Chip } from '@/components/ui'
import { BottomSheet, type SheetState } from '@/components/BottomSheet'
import { PlaceSearchInput } from '@/features/geocoding/PlaceSearchInput'
import { reverseGeocode } from '@/features/geocoding'
import { useGeolocation } from '@/features/geolocation/use-geolocation'
import { FilterBar } from '@/features/stations/filters/FilterBar'
import { ListPanelHeader } from '@/features/stations/ListPanelHeader'
import { StationList } from '@/features/stations/station-list/StationList'
import { TradeoffCallout } from '@/features/stations/TradeoffCallout'
import { useSearchStore } from '@/features/stations/search-store'
import {
  useBaseRoute,
  useRequestedEnergy,
  useStationSearch,
} from '@/features/stations/use-station-search'
import { decodePolyline } from '@/lib/geo/polyline'
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/hooks/use-media-query'
import { formatDate, formatDistanceKm, pluralize } from '@/lib/format'
import { FEATURE_FLAGS } from '@/config/env'

const MapView = lazy(() => import('@/features/map/MapView'))

/**
 * Main screen (spec 20), designed phone-first: a compact header, then the map,
 * then the results sheet. The destination field and the detailed filters stay
 * out of the way until they are asked for, so the map keeps the screen.
 */
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
  const hoveredStationId = useSearchStore((state) => state.hoveredStationId)

  const [originText, setOriginText] = useState('')
  const [destinationText, setDestinationText] = useState('')
  const [sheetState, setSheetState] = useState<SheetState>('collapsed')
  const [locationAsked, setLocationAsked] = useState(false)
  const [tripOpen, setTripOpen] = useState(false)

  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const requestedKwh = useRequestedEnergy()
  const search = useStationSearch()
  const baseRoute = useBaseRoute(origin, mode === 'trip' ? destination : null)

  const routePoints = useMemo(() => {
    if (mode !== 'trip' || !baseRoute.data?.geometry) return null
    return { points: decodePolyline(baseRoute.data.geometry, baseRoute.data.geometryPrecision ?? 5) }
  }, [mode, baseRoute.data?.geometry, baseRoute.data?.geometryPrecision])

  // `useGeolocation` returns a fresh object on every render, so we depend on the
  // stable `request` callback only — otherwise the effect below would reschedule
  // its timer on each render and the first location request could never fire.
  const requestPosition = geolocation.request

  const locate = useCallback(async () => {
    setLocationAsked(true)
    const position = await requestPosition()
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
  }, [requestPosition, setOrigin])

  /**
   * Geolocation is requested only after the shell has painted (spec 13), and
   * only once.
   */
  useEffect(() => {
    if (locationAsked || origin) return
    const timer = window.setTimeout(() => void locate(), 350)
    return () => window.clearTimeout(timer)
  }, [locationAsked, origin, locate])

  /**
   * The detail screen reads the station from the local cache, which holds no
   * routing metrics. Carrying them in the navigation state keeps the distances
   * consistent with the card the user just tapped, without duplicating server
   * state in a store (spec 40).
   */
  const openDetail = useCallback(
    (id: string) => {
      selectStation(id)
      const station = search.stations.find((candidate) => candidate.id === id)
      navigate(`/station/${encodeURIComponent(id)}`, {
        state: station
          ? {
              straightLineDistanceKm: station.straightLineDistanceKm,
              routeDistanceKm: station.routeDistanceKm,
              routeDurationMin: station.routeDurationMin,
              detourDistanceKm: station.detourDistanceKm,
              detourDurationMin: station.detourDurationMin,
            }
          : undefined,
      })
    },
    [navigate, selectStation, search.stations],
  )

  /** Selecting a pin should reveal the matching card, not hide it. */
  const selectFromMap = useCallback(
    (id: string | null) => {
      selectStation(id)
      if (id && !isDesktop) setSheetState((state) => (state === 'collapsed' ? 'half' : state))
    },
    [selectStation, isDesktop],
  )

  const showTripField = FEATURE_FLAGS.tripSearch && (tripOpen || destination !== null)

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
            Données locales
            {search.fetchedAt
              ? ` du ${formatDate(new Date(search.fetchedAt).toISOString())}`
              : ''}
            . Elles peuvent être anciennes.
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
            chargées. Déplacez la recherche pour en voir d’autres.
          </p>
        </Banner>
      ) : null}
    </>
  )

  /** Rendered once, in the desktop column or in the mobile sheet — never both. */
  const listPanel = (
    <>
      <ListPanelHeader count={search.stations.length} loading={search.isLoading} />
      {notices || search.stations.length > 1 ? (
        <div className="list-panel__notices">
          {notices}
          <TradeoffCallout stations={search.stations} requestedKwh={requestedKwh} />
        </div>
      ) : null}
      <StationList {...listProps} />
    </>
  )

  return (
    <div className="home">
      <header className="home__header">
        <div className="home__search-row">
          <span className="home__brand-mark" aria-hidden="true" />
          <PlaceSearchInput
            label="Ma position ou une adresse de départ"
            placeholder="Où êtes-vous ?"
            value={originText}
            onValueChange={setOriginText}
            onSelect={(place) => setOrigin(place)}
            onClear={() => setOrigin(null)}
            proximity={origin}
            leadingAction={
              <button
                type="button"
                className="place-search__icon-button"
                aria-label="Utiliser ma position actuelle"
                title="Utiliser ma position actuelle"
                onClick={() => void locate()}
              >
                ◎
              </button>
            }
          />
          <nav className="home__menu" aria-label="Navigation secondaire">
            <Link className="home__menu-link" to="/reglages" aria-label="Réglages">
              <span aria-hidden="true">⚙</span>
            </Link>
          </nav>
        </div>

        {showTripField ? (
          <div className="home__search-row home__search-row--secondary">
            <span className="home__row-icon" aria-hidden="true">
              →
            </span>
            <PlaceSearchInput
              label="Destination"
              placeholder="Où allez-vous ?"
              value={destinationText}
              onValueChange={setDestinationText}
              onSelect={(place) => setDestination(place)}
              onClear={() => setDestination(null)}
              proximity={origin}
            />
            <button
              type="button"
              className="home__menu-link"
              aria-label="Masquer la destination"
              onClick={() => {
                setDestination(null)
                setDestinationText('')
                setTripOpen(false)
                setMode('around')
              }}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        ) : null}

        <div className="home__chips">
          {FEATURE_FLAGS.tripSearch && !showTripField ? (
            <Chip onClick={() => setTripOpen(true)}>+ Destination</Chip>
          ) : null}
          {showTripField ? (
            <Chip
              active={mode === 'trip'}
              disabled={!destination}
              title={destination ? undefined : 'Renseignez une destination'}
              onClick={() => setMode(mode === 'trip' ? 'around' : 'trip')}
            >
              Sur mon trajet
            </Chip>
          ) : null}
          <FilterBar />
        </div>
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
                hoveredStationId={hoveredStationId}
                onSelectStation={selectFromMap}
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
                  : `${search.stations.length} ${pluralize(search.stations.length, 'borne')}`
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
