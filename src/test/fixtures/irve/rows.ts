import type { IrveRow } from '@/features/charging-data/irve/types'

/**
 * IRVE fixtures (spec 48).
 * Cover the cases the product must handle honestly: free, priced, complex
 * tariff, unknown price, multi-EVSE, and each connector family.
 */

const base: IrveRow = {
  nom_amenageur: 'Aménageur Test',
  nom_operateur: 'Opérateur Test',
  nom_enseigne: 'Réseau Test',
  id_station_itinerance: 'FRTSTP000001',
  id_station_local: 'LOC-1',
  nom_station: 'Station Test',
  implantation_station: 'Voirie',
  adresse_station: '1 rue de Test 75001 Paris',
  coordonneesXY: [2.3522, 48.8566],
  nbre_pdc: 1,
  id_pdc_itinerance: 'FRTSTE000001',
  id_pdc_local: 'PDC-1',
  puissance_nominale: 22,
  prise_type_ef: false,
  prise_type_2: true,
  prise_type_combo_ccs: false,
  prise_type_chademo: false,
  prise_type_autre: false,
  gratuit: false,
  paiement_acte: true,
  paiement_cb: true,
  paiement_autre: false,
  tarification: '0,40 €/kWh',
  condition_acces: 'Accès libre',
  reservation: false,
  horaires: '24/7',
  accessibilite_pmr: 'Accessible mais non réservé PMR',
  date_maj: '2026-08-01',
  consolidated_longitude: 2.3522,
  consolidated_latitude: 48.8566,
  consolidated_code_postal: '75001',
  consolidated_commune: 'Paris',
}

export function makeRow(overrides: Partial<IrveRow> = {}): IrveRow {
  return { ...base, ...overrides }
}

/** Free station, single Type 2 point. */
export const freeStationRow = makeRow({
  id_station_itinerance: 'FRTSTP000010',
  id_pdc_itinerance: 'FRTSTE000010',
  nom_station: 'Mairie — recharge gratuite',
  gratuit: true,
  tarification: 'Recharge gratuite',
  puissance_nominale: 7.4,
})

/** Simple €/kWh tariff on a CCS fast charger. */
export const pricedStationRow = makeRow({
  id_station_itinerance: 'FRTSTP000020',
  id_pdc_itinerance: 'FRTSTE000020',
  nom_station: 'Aire de Test — rapide',
  tarification: '0,49 €/kWh',
  puissance_nominale: 300,
  prise_type_2: false,
  prise_type_combo_ccs: true,
})

/** Composite tariff: session fee plus energy price. */
export const complexPriceRow = makeRow({
  id_station_itinerance: 'FRTSTP000030',
  id_pdc_itinerance: 'FRTSTE000030',
  nom_station: 'Parking Test — tarif composite',
  tarification: '0,50 € la session + 0,35 €/kWh',
  puissance_nominale: 50,
  prise_type_combo_ccs: true,
  prise_type_chademo: true,
})

/** Conditional wording: must stay `unknown`. */
export const unknownPriceRow = makeRow({
  id_station_itinerance: 'FRTSTP000040',
  id_pdc_itinerance: 'FRTSTE000040',
  nom_station: 'Centre commercial Test',
  tarification: 'Tarification selon abonnement opérateur.',
  puissance_nominale: 22,
  paiement_cb: false,
})

/** Three points de charge sharing one station id, different power and plugs. */
export const multiEvseRows: IrveRow[] = [
  makeRow({
    id_station_itinerance: 'FRTSTP000050',
    id_pdc_itinerance: 'FRTSTE000051',
    nom_station: 'Hub Test',
    nbre_pdc: 3,
    puissance_nominale: 22,
    prise_type_2: true,
  }),
  makeRow({
    id_station_itinerance: 'FRTSTP000050',
    id_pdc_itinerance: 'FRTSTE000052',
    nom_station: 'Hub Test',
    nbre_pdc: 3,
    puissance_nominale: 150,
    prise_type_2: false,
    prise_type_combo_ccs: true,
  }),
  makeRow({
    id_station_itinerance: 'FRTSTP000050',
    id_pdc_itinerance: 'FRTSTE000053',
    nom_station: 'Hub Test',
    nbre_pdc: 3,
    puissance_nominale: 50,
    prise_type_2: false,
    prise_type_chademo: true,
  }),
]

/** Domestic socket, no tariff information at all. */
export const domesticRow = makeRow({
  id_station_itinerance: 'FRTSTP000060',
  id_pdc_itinerance: 'FRTSTE000060',
  nom_station: 'Camping Test',
  puissance_nominale: 2.3,
  prise_type_2: false,
  prise_type_ef: true,
  tarification: 'Inconnu',
})

/** Broken coordinates — must be rejected (spec 9.4). */
export const invalidCoordinatesRow = makeRow({
  id_station_itinerance: 'FRTSTP000070',
  id_pdc_itinerance: 'FRTSTE000070',
  coordonneesXY: [0, 0],
  consolidated_latitude: null,
  consolidated_longitude: null,
})

export const allFixtureRows: IrveRow[] = [
  freeStationRow,
  pricedStationRow,
  complexPriceRow,
  unknownPriceRow,
  ...multiEvseRows,
  domesticRow,
]
