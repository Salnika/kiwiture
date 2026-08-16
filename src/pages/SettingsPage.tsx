import { Link } from 'react-router-dom'
import { Button, Field, Segmented, TextInput } from '@/components/ui'
import { DEFAULT_REQUESTED_KWH } from '@/config/constants'
import { NAVIGATION_APPS, NAVIGATION_APP_LABELS } from '@/features/navigation/deep-links'
import { useSettingsStore } from '@/features/settings/settings-store'
import { useTheme } from '@/app/theme'
import { irveRepository } from '@/features/charging-data/irve/repository'
import { getDb } from '@/lib/storage/db'
import type { ConnectorType, SortMode } from '@/types/domain'
import { CONNECTOR_LABELS } from '@/types/domain'

const SORTS: Array<{ value: SortMode; label: string }> = [
  { value: 'recommended', label: 'Recommandé' },
  { value: 'price', label: 'Prix' },
  { value: 'detour', label: 'Détour' },
  { value: 'power', label: 'Puissance' },
]

const CONNECTORS: ConnectorType[] = ['CCS', 'TYPE_2', 'CHADEMO', 'DOMESTIC']

/** Local preferences (spec 27). Nothing here leaves the browser. */
export default function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const { preference, setPreference } = useTheme()

  return (
    <div className="page">
      <div className="page__header">
        <Link className="button button--ghost" to="/">
          ← Carte
        </Link>
        <h1>Réglages</h1>
      </div>

      <section className="stack card-surface">
        <h2>Recherche</h2>

        <Field label="Tri par défaut">
          <Segmented
            label="Tri par défaut"
            options={SORTS}
            value={settings.defaultSort}
            onChange={(value) => updateSettings({ defaultSort: value })}
          />
        </Field>

        <Field label="Connecteur préféré">
          <Segmented
            label="Connecteur préféré"
            options={[
              { value: 'none', label: 'Aucun' },
              ...CONNECTORS.map((connector) => ({
                value: connector,
                label: CONNECTOR_LABELS[connector],
              })),
            ]}
            value={settings.defaultConnector ?? 'none'}
            onChange={(value) =>
              updateSettings({
                defaultConnector: value === 'none' ? undefined : (value as ConnectorType),
              })
            }
          />
        </Field>

        <Field
          label="Énergie à ajouter par défaut (kWh)"
          htmlFor="requested-kwh"
          hint="Sert au calcul du coût estimé affiché sur chaque borne."
        >
          <TextInput
            id="requested-kwh"
            type="number"
            min={1}
            max={200}
            value={settings.requestedEnergyKwh ?? DEFAULT_REQUESTED_KWH}
            onChange={(event) =>
              updateSettings({ requestedEnergyKwh: Number(event.target.value) || undefined })
            }
          />
        </Field>

        <Field label="Puissance minimale par défaut (kW)" htmlFor="min-power">
          <TextInput
            id="min-power"
            type="number"
            min={0}
            max={400}
            value={settings.defaultMinPowerKw ?? ''}
            placeholder="Aucune"
            onChange={(event) =>
              updateSettings({ defaultMinPowerKw: Number(event.target.value) || undefined })
            }
          />
        </Field>
      </section>

      <section className="stack card-surface">
        <h2>Navigation</h2>
        <Field label="Application de navigation" hint="Utilisée en premier sur la fiche station.">
          <Segmented
            label="Application de navigation"
            options={NAVIGATION_APPS.map((app) => ({
              value: app,
              label: NAVIGATION_APP_LABELS[app],
            }))}
            value={settings.preferredNavigationApp ?? 'google-maps'}
            onChange={(value) => updateSettings({ preferredNavigationApp: value })}
          />
        </Field>
      </section>

      <section className="stack card-surface">
        <h2>Apparence</h2>
        <Field label="Thème">
          <Segmented
            label="Thème"
            options={[
              { value: 'system', label: 'Système' },
              { value: 'light', label: 'Clair' },
              { value: 'dark', label: 'Sombre' },
            ]}
            value={preference}
            onChange={setPreference}
          />
        </Field>
      </section>

      <section className="stack card-surface">
        <h2>Données locales</h2>
        <p>
          Les bornes, itinéraires et adresses recherchées sont stockés dans votre navigateur
          (IndexedDB) pour accélérer l’application et la rendre utilisable hors ligne.
        </p>
        <div className="row">
          <Button onClick={() => void irveRepository.refresh()}>
            Rafraîchir les données IRVE
          </Button>
          <Button
            onClick={() => {
              const db = getDb()
              void db?.delete().then(() => window.location.reload())
            }}
          >
            Vider le cache local
          </Button>
        </div>
        <p>
          <Link to="/donnees">Sources et limites des données</Link> ·{' '}
          <Link to="/confidentialite">Confidentialité</Link>
        </p>
      </section>
    </div>
  )
}
