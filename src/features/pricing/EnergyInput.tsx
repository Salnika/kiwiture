import { useId } from 'react'
import { DEFAULT_REQUESTED_KWH } from '@/config/constants'
import { useActiveVehicle, useSettingsStore } from '@/features/settings/settings-store'
import { energyForSocRange } from './calculate-charge-cost'

/**
 * Amount of energy to price (spec 11.1).
 * With an active vehicle, a second control derives the kWh from a state-of-charge
 * range instead (spec 11.2).
 */
export function EnergyInput() {
  const inputId = useId()
  const requestedKwh = useSettingsStore(
    (state) => state.settings.requestedEnergyKwh ?? DEFAULT_REQUESTED_KWH,
  )
  const setRequestedEnergyKwh = useSettingsStore((state) => state.setRequestedEnergyKwh)
  const vehicle = useActiveVehicle()

  const socHint = vehicle
    ? `≈ ${Math.round((requestedKwh / vehicle.batteryCapacityKwh) * 100)} % de la batterie de ${vehicle.label}`
    : null

  return (
    <div className="energy-input">
      <label className="energy-input__label" htmlFor={inputId}>
        Énergie à ajouter
      </label>
      <div className="energy-input__control">
        <input
          id={inputId}
          className="energy-input__field"
          type="number"
          inputMode="numeric"
          min={1}
          max={200}
          step={1}
          value={requestedKwh}
          aria-describedby={socHint ? `${inputId}-hint` : undefined}
          onChange={(event) => {
            const value = Number(event.target.value)
            if (Number.isFinite(value)) setRequestedEnergyKwh(value)
          }}
        />
        <span className="energy-input__unit">kWh</span>
      </div>
      {socHint ? (
        <span id={`${inputId}-hint`} className="energy-input__hint">
          {socHint}
        </span>
      ) : null}
    </div>
  )
}

/** Battery-percentage variant used on the vehicle screen (spec 11.2). */
export function SocEnergyPicker({
  batteryCapacityKwh,
  currentSoc,
  targetSoc,
  onChange,
}: {
  batteryCapacityKwh: number
  currentSoc: number
  targetSoc: number
  onChange: (next: { currentSoc: number; targetSoc: number; kwh: number }) => void
}) {
  const currentId = useId()
  const targetId = useId()

  const emit = (nextCurrent: number, nextTarget: number) => {
    const safeCurrent = Math.max(0, Math.min(100, nextCurrent))
    const safeTarget = Math.max(safeCurrent, Math.min(100, nextTarget))
    onChange({
      currentSoc: safeCurrent,
      targetSoc: safeTarget,
      kwh: energyForSocRange(batteryCapacityKwh, safeCurrent, safeTarget),
    })
  }

  return (
    <div className="soc-picker">
      <div className="field">
        <label className="field__label" htmlFor={currentId}>
          Niveau actuel : {currentSoc} %
        </label>
        <input
          id={currentId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={currentSoc}
          onChange={(event) => emit(Number(event.target.value), targetSoc)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={targetId}>
          Niveau souhaité : {targetSoc} %
        </label>
        <input
          id={targetId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={targetSoc}
          onChange={(event) => emit(currentSoc, Number(event.target.value))}
        />
      </div>
    </div>
  )
}
