import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Chip, Field, TextInput } from '@/components/ui'
import { SocEnergyPicker } from '@/features/pricing/EnergyInput'
import { useSettingsStore } from '@/features/settings/settings-store'
import { formatEnergyKwh } from '@/lib/format'
import { CONNECTOR_LABELS, type ConnectorType } from '@/types/domain'

const CONNECTORS: ConnectorType[] = ['CCS', 'TYPE_2', 'CHADEMO', 'DOMESTIC']

/** Local vehicles (spec 28). Stored in localStorage only — no account. */
export default function VehiclePage() {
  const vehicles = useSettingsStore((state) => state.vehicles)
  const activeVehicleId = useSettingsStore((state) => state.activeVehicleId)
  const addVehicle = useSettingsStore((state) => state.addVehicle)
  const removeVehicle = useSettingsStore((state) => state.removeVehicle)
  const setActiveVehicle = useSettingsStore((state) => state.setActiveVehicle)
  const setRequestedEnergyKwh = useSettingsStore((state) => state.setRequestedEnergyKwh)

  const [label, setLabel] = useState('')
  const [capacity, setCapacity] = useState('60')
  const [maxDc, setMaxDc] = useState('150')
  const [maxAc, setMaxAc] = useState('11')
  const [connectors, setConnectors] = useState<ConnectorType[]>(['CCS', 'TYPE_2'])

  const [currentSoc, setCurrentSoc] = useState(20)
  const [targetSoc, setTargetSoc] = useState(80)

  const activeVehicle = vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? null

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const batteryCapacityKwh = Number(capacity)
    if (!label.trim() || !Number.isFinite(batteryCapacityKwh) || batteryCapacityKwh <= 0) return

    addVehicle({
      label: label.trim(),
      batteryCapacityKwh,
      maxDcPowerKw: Number(maxDc) || undefined,
      maxAcPowerKw: Number(maxAc) || undefined,
      connectors,
    })
    setLabel('')
  }

  return (
    <div className="page">
      <div className="page__header">
        <Link className="button button--ghost" to="/">
          ← Carte
        </Link>
        <h1>Mon véhicule</h1>
      </div>

      <p>
        Renseigner un véhicule affine deux choses : la puissance réellement utilisable sur chaque
        borne, et l’énergie à recharger à partir d’un pourcentage de batterie. Ces informations
        restent dans votre navigateur.
      </p>

      {vehicles.length > 0 ? (
        <section className="stack card-surface">
          <h2>Véhicules enregistrés</h2>
          <ul className="stack" style={{ padding: 0, listStyle: 'none' }}>
            {vehicles.map((vehicle) => (
              <li key={vehicle.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <strong>{vehicle.label}</strong> · {formatEnergyKwh(vehicle.batteryCapacityKwh)}
                  {vehicle.maxDcPowerKw ? ` · DC ${vehicle.maxDcPowerKw} kW` : ''}
                  {vehicle.maxAcPowerKw ? ` · AC ${vehicle.maxAcPowerKw} kW` : ''}
                </span>
                <span className="row">
                  <Chip
                    active={vehicle.id === activeVehicleId}
                    onClick={() =>
                      setActiveVehicle(vehicle.id === activeVehicleId ? null : vehicle.id)
                    }
                  >
                    {vehicle.id === activeVehicleId ? 'Actif' : 'Activer'}
                  </Chip>
                  <Button variant="ghost" onClick={() => removeVehicle(vehicle.id)}>
                    Supprimer
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeVehicle ? (
        <section className="stack card-surface">
          <h2>Énergie à recharger</h2>
          <SocEnergyPicker
            batteryCapacityKwh={activeVehicle.batteryCapacityKwh}
            currentSoc={currentSoc}
            targetSoc={targetSoc}
            onChange={({ currentSoc: next, targetSoc: nextTarget, kwh }) => {
              setCurrentSoc(next)
              setTargetSoc(nextTarget)
              setRequestedEnergyKwh(Math.round(kwh))
            }}
          />
          <p>
            {currentSoc} % → {targetSoc} % ≈{' '}
            <strong>
              {formatEnergyKwh(
                (activeVehicle.batteryCapacityKwh * (targetSoc - currentSoc)) / 100,
              )}
            </strong>{' '}
            à recharger. Cette valeur est une estimation.
          </p>
        </section>
      ) : null}

      <section className="stack card-surface">
        <h2>Ajouter un véhicule</h2>
        <form className="stack" onSubmit={submit}>
          <Field label="Nom" htmlFor="vehicle-label">
            <TextInput
              id="vehicle-label"
              value={label}
              required
              placeholder="Ma voiture"
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
          <Field label="Capacité batterie (kWh)" htmlFor="vehicle-capacity">
            <TextInput
              id="vehicle-capacity"
              type="number"
              min={5}
              max={250}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
            />
          </Field>
          <Field
            label="Puissance de charge max en courant continu (kW)"
            htmlFor="vehicle-dc"
            hint="Utilisée pour les bornes CCS et CHAdeMO."
          >
            <TextInput
              id="vehicle-dc"
              type="number"
              min={0}
              max={400}
              value={maxDc}
              onChange={(event) => setMaxDc(event.target.value)}
            />
          </Field>
          <Field
            label="Puissance de charge max en courant alternatif (kW)"
            htmlFor="vehicle-ac"
            hint="Utilisée pour les bornes Type 2 et prises domestiques."
          >
            <TextInput
              id="vehicle-ac"
              type="number"
              min={0}
              max={50}
              value={maxAc}
              onChange={(event) => setMaxAc(event.target.value)}
            />
          </Field>
          <Field label="Connecteurs compatibles">
            <div className="row">
              {CONNECTORS.map((connector) => (
                <Chip
                  key={connector}
                  active={connectors.includes(connector)}
                  onClick={() =>
                    setConnectors((current) =>
                      current.includes(connector)
                        ? current.filter((item) => item !== connector)
                        : [...current, connector],
                    )
                  }
                >
                  {CONNECTOR_LABELS[connector]}
                </Chip>
              ))}
            </div>
          </Field>
          <Button type="submit" variant="primary">
            Enregistrer le véhicule
          </Button>
        </form>
      </section>
    </div>
  )
}
