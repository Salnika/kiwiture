/** Tuning constants gathered in one place so the trade-offs stay explicit. */

/** Max stations we ask the routing provider about in one pass (spec 16). */
export const MAX_ROUTING_CANDIDATES = 20

/** Max concurrent routing calls (spec 16). */
export const ROUTING_CONCURRENCY = 4

/** Corridor half-width when searching along a trip (spec 23.1). */
export const ROUTE_CORRIDOR_KM = 5

/** Default search radius around the origin, in km. */
export const DEFAULT_SEARCH_RADIUS_KM = 5

export const MIN_SEARCH_RADIUS_KM = 1
export const MAX_SEARCH_RADIUS_KM = 25

/**
 * Upper bound on IRVE rows (points de charge) pulled from the tabular API for a
 * single search. Dense city centres hold several thousand rows per bbox, so the
 * repository shrinks the radius instead of paginating forever.
 */
export const MAX_IRVE_ROWS_PER_SEARCH = 1200

/** Page size ceiling imposed by the data.gouv tabular API. */
export const TABULAR_PAGE_SIZE = 200

/** Max parallel page requests against the tabular API. */
export const TABULAR_CONCURRENCY = 4

/** Debounce for the geocoding autocomplete (spec 14). */
export const GEOCODING_DEBOUNCE_MS = 300

/** Max geocoding suggestions displayed (spec 14). */
export const GEOCODING_MAX_RESULTS = 5

/** Virtualise the station list past this many rows (spec 35.3). */
export const LIST_VIRTUALIZATION_THRESHOLD = 100

/** TTLs in milliseconds (spec 7.2). */
export const TTL = {
  datasetMetadata: 6 * 60 * 60 * 1000,
  irveLocal: 24 * 60 * 60 * 1000,
  geocoding: 7 * 24 * 60 * 60 * 1000,
  routingShort: 30 * 60 * 1000,
  routingStatic: 24 * 60 * 60 * 1000,
} as const

/** Coordinate rounding used in cache keys (spec 17). */
export const CACHE_COORDINATE_PRECISION = 4

/** Default energy amount for the cost estimator, in kWh. */
export const DEFAULT_REQUESTED_KWH = 30
