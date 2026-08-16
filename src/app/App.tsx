import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { TTL } from '@/config/constants'
import { assertEnvSanity } from '@/config/env'
import { pruneExpired } from '@/lib/storage/db'
import { OfflineBanner } from '@/components/OfflineBanner'
import './app.css'

export default function App() {
  useEffect(() => {
    assertEnvSanity()
    void pruneExpired({
      stations: TTL.irveLocal,
      geocoding: TTL.geocoding,
      routing: TTL.routingStatic,
    })
  }, [])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Aller au contenu principal
      </a>
      <OfflineBanner />
      <Outlet />
    </div>
  )
}
