import { useCallback, useEffect, useMemo, useRef } from 'react'
import maplibregl, { type LngLatBoundsLike, type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LatLng } from '@/lib/geo/coordinates'
import type { StationWithDistance } from '@/types/domain'
import { useTheme } from '@/app/theme'
import { getMapAttribution, getMapStyleUrl } from './map-style'
import { toStationFeatureCollection } from './station-geojson'
import './map.css'

/**
 * Map surface (spec 18).
 *
 * A single GeoJSON source holds every station: MapLibre clusters at low zoom and
 * draws price labels at high zoom. The selected pin is distinguished by size,
 * outline and elevation as well as colour (spec 18.3).
 */

const SOURCE_ID = 'stations'
const CLUSTER_LAYER = 'stations-clusters'
const CLUSTER_COUNT_LAYER = 'stations-cluster-count'
const PIN_LAYER = 'stations-pins'
const PIN_LABEL_LAYER = 'stations-pin-labels'
const ROUTE_SOURCE = 'trip-route'
const ROUTE_LAYER = 'trip-route-line'

export interface MapViewProps {
  stations: readonly StationWithDistance[]
  origin: LatLng | null
  destination: LatLng | null
  selectedStationId: string | null
  onSelectStation: (id: string | null) => void
  /** Encoded route polyline drawn under the pins, when a trip is active. */
  routeGeometry?: { points: LatLng[] } | null
  className?: string
}

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export default function MapView({
  stations,
  origin,
  destination,
  selectedStationId,
  onSelectStation,
  routeGeometry,
  className,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const readyRef = useRef(false)
  const originMarker = useRef<maplibregl.Marker | null>(null)
  const destinationMarker = useRef<maplibregl.Marker | null>(null)
  const { resolvedTheme } = useTheme()

  const collection = useMemo(() => toStationFeatureCollection(stations), [stations])

  const addLayers = useCallback((map: MapLibreMap) => {
    if (map.getSource(SOURCE_ID)) return

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_COLLECTION,
      cluster: true,
      clusterRadius: 55,
      clusterMaxZoom: 12,
    })

    map.addSource(ROUTE_SOURCE, { type: 'geojson', data: EMPTY_COLLECTION })

    map.addLayer({
      id: ROUTE_LAYER,
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#1a63d8',
        'line-width': 4,
        'line-opacity': 0.65,
      },
    })

    map.addLayer({
      id: CLUSTER_LAYER,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#0b6d4d',
        'circle-opacity': 0.9,
        'circle-radius': ['step', ['get', 'point_count'], 18, 25, 24, 100, 30],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    })

    map.addLayer({
      id: CLUSTER_COUNT_LAYER,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    })

    // Pin body. Selection is signalled by radius AND stroke width AND colour.
    map.addLayer({
      id: PIN_LAYER,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          22,
          ['boolean', ['get', 'hasPrice'], false],
          17,
          14,
        ],
        'circle-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          '#0b6d4d',
          '#ffffff',
        ],
        'circle-stroke-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          '#04301f',
          '#14181f',
        ],
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          3,
          1.5,
        ],
      },
    })

    map.addLayer({
      id: PIN_LABEL_LAYER,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          '#ffffff',
          '#14181f',
        ],
      },
    })
  }, [])

  // Map creation — once.
  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const map = new maplibregl.Map({
      container,
      style: getMapStyleUrl(resolvedTheme),
      center: [2.3522, 48.8566],
      zoom: 11,
      attributionControl: false,
    })

    map.addControl(
      new maplibregl.AttributionControl({ compact: true, customAttribution: getMapAttribution() }),
      'bottom-right',
    )
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      readyRef.current = true
      addLayers(map)
      map.getCanvas().setAttribute('aria-label', 'Carte des bornes de recharge')
      map.getCanvas().setAttribute('role', 'application')
    })

    map.on('click', PIN_LAYER, (event) => {
      const feature = event.features?.[0]
      const id = feature?.properties?.id
      if (typeof id === 'string') onSelectStation(id)
    })

    map.on('click', CLUSTER_LAYER, (event) => {
      const feature = event.features?.[0]
      if (!feature) return
      const clusterId = feature.properties?.cluster_id
      const source = map.getSource(SOURCE_ID)
      if (!source || typeof clusterId !== 'number' || !('getClusterExpansionZoom' in source)) return
      void (source as maplibregl.GeoJSONSource)
        .getClusterExpansionZoom(clusterId)
        .then((zoom: number) => {
          const geometry = feature.geometry
          if (geometry.type !== 'Point') return
          map.easeTo({
            center: geometry.coordinates as [number, number],
            zoom,
          })
        })
        .catch(() => undefined)
    })

    for (const layer of [PIN_LAYER, CLUSTER_LAYER]) {
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = ''
      })
    }

    mapRef.current = map

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
    // The map is intentionally created once; theme changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLayers, onSelectStation])

  // Theme switch: swap the basemap style and re-add our layers.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.setStyle(getMapStyleUrl(resolvedTheme))
    map.once('styledata', () => {
      addLayers(map)
      const source = map.getSource(SOURCE_ID)
      if (source && 'setData' in source) {
        ;(source as maplibregl.GeoJSONSource).setData(collection)
      }
    })
    // `collection` is read only to restore data after the style swap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme, addLayers])

  // Station data.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const source = map.getSource(SOURCE_ID)
    if (source && 'setData' in source) {
      ;(source as maplibregl.GeoJSONSource).setData(collection)
    }
  }, [collection])

  // Selected pin highlight via feature-state.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return

    for (const station of stations) {
      map.setFeatureState(
        { source: SOURCE_ID, id: station.id },
        { selected: station.id === selectedStationId },
      )
    }

    if (!selectedStationId) return
    const selected = stations.find((station) => station.id === selectedStationId)
    if (!selected) return
    map.easeTo({
      center: [selected.location.longitude, selected.location.latitude],
      duration: 400,
    })
  }, [selectedStationId, stations])

  // Origin / destination markers.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (origin) {
      const element = originMarker.current ?? new maplibregl.Marker({ color: '#1a63d8' })
      element.setLngLat([origin.longitude, origin.latitude]).addTo(map)
      originMarker.current = element
    } else {
      originMarker.current?.remove()
      originMarker.current = null
    }

    if (destination) {
      const element = destinationMarker.current ?? new maplibregl.Marker({ color: '#a3261f' })
      element.setLngLat([destination.longitude, destination.latitude]).addTo(map)
      destinationMarker.current = element
    } else {
      destinationMarker.current?.remove()
      destinationMarker.current = null
    }
  }, [origin, destination])

  // Trip route line.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const source = map.getSource(ROUTE_SOURCE)
    if (!source || !('setData' in source)) return

    const points = routeGeometry?.points ?? []
    ;(source as maplibregl.GeoJSONSource).setData(
      points.length > 1
        ? {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: points.map((point) => [point.longitude, point.latitude]),
            },
          }
        : EMPTY_COLLECTION,
    )
  }, [routeGeometry])

  // Fit the viewport to what we are showing.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    if (selectedStationId) return

    const points: LatLng[] = [...stations.slice(0, 40).map((station) => station.location)]
    if (origin) points.push(origin)
    if (destination) points.push(destination)
    if (points.length === 0) return

    if (points.length === 1) {
      const only = points[0] as LatLng
      map.easeTo({ center: [only.longitude, only.latitude], zoom: 13, duration: 400 })
      return
    }

    const bounds = points.reduce(
      (accumulator, point) => accumulator.extend([point.longitude, point.latitude]),
      new maplibregl.LngLatBounds(
        [(points[0] as LatLng).longitude, (points[0] as LatLng).latitude],
        [(points[0] as LatLng).longitude, (points[0] as LatLng).latitude],
      ),
    ) as LngLatBoundsLike

    map.fitBounds(bounds, { padding: 64, maxZoom: 14, duration: 500 })
    // Re-fitting on every selection change would fight the user; only data moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations, origin, destination])

  return <div ref={containerRef} className={['map-view', className ?? ''].join(' ')} />
}
