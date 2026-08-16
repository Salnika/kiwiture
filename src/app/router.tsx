import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import HomePage from '@/pages/HomePage'
import { PageFallback } from '@/components/PageFallback'

/**
 * Lazy routes (spec 35.2): the map lives on the home page, everything else is
 * split out so the first paint stays small.
 */
const StationPage = lazy(() => import('@/pages/StationPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const VehiclePage = lazy(() => import('@/pages/VehiclePage'))
const AboutDataPage = lazy(() => import('@/pages/AboutDataPage'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

const withSuspense = (node: React.ReactNode) => (
  <Suspense fallback={<PageFallback />}>{node}</Suspense>
)

/**
 * `import.meta.env.BASE_URL` keeps the router aligned with the deployment path
 * (`/kiwiture/` on GitHub Pages, `/` elsewhere).
 */
export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'station/:stationId', element: withSuspense(<StationPage />) },
        { path: 'reglages', element: withSuspense(<SettingsPage />) },
        { path: 'vehicule', element: withSuspense(<VehiclePage />) },
        { path: 'donnees', element: withSuspense(<AboutDataPage />) },
        { path: 'confidentialite', element: withSuspense(<PrivacyPage />) },
        { path: '*', element: withSuspense(<NotFoundPage />) },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
)

export function AppRouter() {
  return <RouterProvider router={router} />
}
