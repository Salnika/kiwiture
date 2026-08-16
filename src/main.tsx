import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from './app/providers'
import { AppRouter } from './app/router'
import { registerServiceWorker } from './pwa/register-sw'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('Element #root introuvable.')

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
)

registerServiceWorker()
