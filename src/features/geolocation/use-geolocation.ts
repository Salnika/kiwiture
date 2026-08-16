import { useCallback, useState } from 'react'
import type { LatLng } from '@/lib/geo/coordinates'

/** Geolocation with every documented failure mode handled (spec 13). */

export type GeolocationErrorKind =
  | 'unsupported'
  | 'permission-denied'
  | 'unavailable'
  | 'timeout'
  | 'unknown'

export interface GeolocationFailure {
  kind: GeolocationErrorKind
  message: string
}

export interface GeolocationState {
  status: 'idle' | 'loading' | 'success' | 'error'
  position: LatLng | null
  accuracyMeters?: number
  error: GeolocationFailure | null
}

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 60_000,
}

const MESSAGES: Record<GeolocationErrorKind, string> = {
  unsupported: "Votre navigateur ne permet pas la géolocalisation. Recherchez une adresse.",
  'permission-denied': 'Autorisez votre position ou recherchez une adresse.',
  unavailable: 'Position indisponible pour le moment. Recherchez une adresse.',
  timeout: "La localisation a pris trop de temps. Réessayez ou recherchez une adresse.",
  unknown: 'Impossible de vous localiser. Recherchez une adresse.',
}

function toFailure(error: GeolocationPositionError): GeolocationFailure {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return { kind: 'permission-denied', message: MESSAGES['permission-denied'] }
    case error.POSITION_UNAVAILABLE:
      return { kind: 'unavailable', message: MESSAGES.unavailable }
    case error.TIMEOUT:
      return { kind: 'timeout', message: MESSAGES.timeout }
    default:
      return { kind: 'unknown', message: MESSAGES.unknown }
  }
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    status: 'idle',
    position: null,
    error: null,
  })

  /**
   * Requests the position. Called from a user gesture or right after the shell
   * is painted — never before the UI is visible (spec 13).
   */
  const request = useCallback((): Promise<LatLng | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        status: 'error',
        position: null,
        error: { kind: 'unsupported', message: MESSAGES.unsupported },
      })
      return Promise.resolve(null)
    }

    setState((previous) => ({ ...previous, status: 'loading', error: null }))

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const value: LatLng = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }
          setState({
            status: 'success',
            position: value,
            accuracyMeters: position.coords.accuracy,
            error: null,
          })
          resolve(value)
        },
        (error) => {
          setState({ status: 'error', position: null, error: toFailure(error) })
          resolve(null)
        },
        OPTIONS,
      )
    })
  }, [])

  const reset = useCallback(() => {
    setState({ status: 'idle', position: null, error: null })
  }, [])

  return { ...state, request, reset }
}
