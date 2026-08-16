/**
 * Raw IRVE row shape (schema statique v2.3.x).
 *
 * One row = one point de charge (EVSE). Rows sharing `id_station_itinerance`
 * belong to the same station (spec 9.1).
 *
 * https://schema.data.gouv.fr/etalab/schema-irve-statique/latest/documentation.html
 */
export interface IrveRow {
  nom_amenageur?: string | null
  nom_operateur?: string | null
  nom_enseigne?: string | null

  id_station_itinerance?: string | null
  id_station_local?: string | null
  nom_station?: string | null

  implantation_station?: string | null
  adresse_station?: string | null
  code_insee_commune?: string | null

  coordonneesXY?: [number, number] | string | null

  nbre_pdc?: number | null
  id_pdc_itinerance?: string | null
  id_pdc_local?: string | null
  puissance_nominale?: number | null

  prise_type_ef?: boolean | null
  prise_type_2?: boolean | null
  prise_type_combo_ccs?: boolean | null
  prise_type_chademo?: boolean | null
  prise_type_autre?: boolean | null

  gratuit?: boolean | null
  paiement_acte?: boolean | null
  paiement_cb?: boolean | null
  paiement_autre?: boolean | null
  tarification?: string | null

  condition_acces?: string | null
  reservation?: boolean | null
  horaires?: string | null
  accessibilite_pmr?: string | null

  date_mise_en_service?: string | null
  date_maj?: string | null
  observations?: string | null

  consolidated_longitude?: number | null
  consolidated_latitude?: number | null
  consolidated_code_postal?: string | number | null
  consolidated_commune?: string | null
  consolidated_is_lon_lat_correct?: boolean | null
}

/** Column subset requested from the tabular API — smaller payloads, faster search. */
export const IRVE_COLUMNS = [
  'nom_amenageur',
  'nom_operateur',
  'nom_enseigne',
  'id_station_itinerance',
  'id_station_local',
  'nom_station',
  'implantation_station',
  'adresse_station',
  'coordonneesXY',
  'nbre_pdc',
  'id_pdc_itinerance',
  'id_pdc_local',
  'puissance_nominale',
  'prise_type_ef',
  'prise_type_2',
  'prise_type_combo_ccs',
  'prise_type_chademo',
  'prise_type_autre',
  'gratuit',
  'paiement_acte',
  'paiement_cb',
  'paiement_autre',
  'tarification',
  'condition_acces',
  'reservation',
  'horaires',
  'accessibilite_pmr',
  'date_maj',
  'consolidated_longitude',
  'consolidated_latitude',
  'consolidated_code_postal',
  'consolidated_commune',
] as const

export const IRVE_SOURCE_LABEL = 'Base nationale IRVE — transport.data.gouv.fr'

export const IRVE_DATASET_SLUG =
  'base-nationale-des-irve-infrastructures-de-recharge-pour-vehicules-electriques'

export const IRVE_DATASET_PAGE_URL = `https://www.data.gouv.fr/datasets/${IRVE_DATASET_SLUG}`

export const IRVE_TRANSPORT_PAGE_URL = `https://transport.data.gouv.fr/datasets/${IRVE_DATASET_SLUG}`
