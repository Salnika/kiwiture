import type { NavigationApp } from '@/types/domain'

/** External navigation deep links (spec 29). */

export interface NavigationTarget {
  latitude: number
  longitude: number
  name?: string
}

export const NAVIGATION_APP_LABELS: Record<NavigationApp, string> = {
  'google-maps': 'Google Maps',
  'apple-maps': 'Apple Plans',
  waze: 'Waze',
}

export function buildNavigationUrl(app: NavigationApp, target: NavigationTarget): string {
  const latitude = target.latitude.toFixed(6)
  const longitude = target.longitude.toFixed(6)

  switch (app) {
    case 'google-maps': {
      const params = new URLSearchParams({
        api: '1',
        destination: `${latitude},${longitude}`,
        travelmode: 'driving',
      })
      return `https://www.google.com/maps/dir/?${params.toString()}`
    }
    case 'apple-maps': {
      const params = new URLSearchParams({ daddr: `${latitude},${longitude}`, dirflg: 'd' })
      if (target.name) params.set('q', target.name)
      return `https://maps.apple.com/?${params.toString()}`
    }
    case 'waze': {
      const params = new URLSearchParams({ ll: `${latitude},${longitude}`, navigate: 'yes' })
      return `https://waze.com/ul?${params.toString()}`
    }
    default:
      return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}`
  }
}

export function isAppleDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
}

/** Apple Plans on Apple devices, Google Maps elsewhere (spec 29). */
export function defaultNavigationApp(): NavigationApp {
  return isAppleDevice() ? 'apple-maps' : 'google-maps'
}

export const NAVIGATION_APPS: NavigationApp[] = ['google-maps', 'apple-maps', 'waze']
