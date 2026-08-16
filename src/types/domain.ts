/** Business model — spec section 8. */

export type ConnectorType = 'CCS' | 'TYPE_2' | 'CHADEMO' | 'DOMESTIC' | 'OTHER'

export const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  CCS: 'CCS',
  TYPE_2: 'Type 2',
  CHADEMO: 'CHAdeMO',
  DOMESTIC: 'Prise domestique',
  OTHER: 'Autre',
}

/**
 * Real-time status model (spec 50). The MVP never fabricates a value: without a
 * trustworthy source every EVSE stays `UNKNOWN`.
 */
export type EVSEStatus = 'AVAILABLE' | 'CHARGING' | 'OCCUPIED' | 'OUT_OF_SERVICE' | 'UNKNOWN'

export interface EVSE {
  id: string
  localId?: string
  powerKw: number
  connectors: ConnectorType[]
  status?: EVSEStatus
}

export interface PaymentCapabilities {
  payAsYouGo: boolean | null
  creditCard: boolean | null
  other: boolean | null
  free: boolean | null
}

export type PriceConfidence = 'exact' | 'parsed' | 'estimated' | 'unknown'

export interface ChargingPrice {
  /** Verbatim IRVE `tarification` text — always kept (spec 6.2 / 22.2). */
  raw?: string
  energyPricePerKwh?: number
  sessionFee?: number
  minuteFee?: number
  parkingMinuteFee?: number
  currency: 'EUR'
  confidence: PriceConfidence
  sourceLabel?: string
  updatedAt?: string
}

export type DataQualityLevel = 'good' | 'partial' | 'unknown'

export interface DataQuality {
  location: DataQualityLevel
  pricing: DataQualityLevel
  availability: DataQualityLevel
  warnings: string[]
}

export interface DataSource {
  id: string
  label: string
  url?: string
  datasetUpdatedAt?: string
  resourceId?: string
}

export interface StationLocation {
  latitude: number
  longitude: number
  address?: string
  city?: string
  postalCode?: string
}

export interface StationAccess {
  condition?: string
  openingHours?: string
  reservation?: boolean
  pmr?: boolean | null
}

export interface ChargingStation {
  id: string

  name: string
  operatorName?: string
  networkName?: string

  location: StationLocation

  evses: EVSE[]

  maxPowerKw: number

  connectors: ConnectorType[]

  payment: PaymentCapabilities

  access: StationAccess

  pricing: ChargingPrice

  source: DataSource

  updatedAt?: string

  dataQuality: DataQuality
}

/** Station enriched with the distances computed for the current search. */
export interface StationWithDistance extends ChargingStation {
  /** Haversine — pre-filtering only, never shown as a road distance (spec 15.1). */
  straightLineDistanceKm: number
  /** Road distance from the origin, when routing succeeded (spec 15.2). */
  routeDistanceKm?: number
  routeDurationMin?: number
  /** Extra distance/time versus the direct origin → destination route (spec 15.3). */
  detourDistanceKm?: number
  detourDurationMin?: number
  /** Distance to the trip polyline when searching along a route (spec 23). */
  corridorDistanceKm?: number
  /** Power actually usable given the selected vehicle (spec 12). */
  effectivePowerKw?: number
  /** Estimated cost of the requested energy, when the price allows it. */
  estimatedCostEur?: number
  /** Ranking score in [0, 1] for the active sort mode (spec 24). */
  score?: number
}

export type SortMode = 'recommended' | 'price' | 'detour' | 'power'

export type NavigationApp = 'google-maps' | 'apple-maps' | 'waze'

export interface VehicleProfile {
  id: string
  name: string
  batteryCapacityKwh: number
  maxDcPowerKw?: number
  maxAcPowerKw?: number
  connectorTypes: ConnectorType[]
}

export interface LocalVehicle {
  id: string
  label: string
  batteryCapacityKwh: number
  maxDcPowerKw?: number
  maxAcPowerKw?: number
  connectors: ConnectorType[]
}

export interface UserSettings {
  defaultConnector?: ConnectorType
  defaultMinPowerKw?: number
  defaultSort: SortMode
  requestedEnergyKwh?: number
  preferredNavigationApp?: NavigationApp
  theme: 'light' | 'dark' | 'system'
}

/** Async lifecycle shared by every network-backed feature (spec 30). */
export type AsyncPhase =
  | 'idle'
  | 'loading'
  | 'success'
  | 'empty'
  | 'error'
  | 'stale'
  | 'offline'
