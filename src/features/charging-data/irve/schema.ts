import { z } from 'zod'

/**
 * Zod schemas for every external payload we consume (spec 33.3).
 *
 * The IRVE row schema is deliberately permissive: the national base is
 * crowd-consolidated and a single malformed field must never drop a whole page.
 * Validation happens again — semantically — during normalisation.
 */

const looseString = z.union([z.string(), z.number(), z.boolean()]).nullish()
const looseNumber = z.union([z.number(), z.string()]).nullish()
const looseBoolean = z.union([z.boolean(), z.string(), z.number()]).nullish()

export const irveRowSchema = z
  .object({
    nom_amenageur: looseString,
    nom_operateur: looseString,
    nom_enseigne: looseString,

    id_station_itinerance: looseString,
    id_station_local: looseString,
    nom_station: looseString,

    implantation_station: looseString,
    adresse_station: looseString,
    code_insee_commune: looseString,

    coordonneesXY: z.union([z.tuple([z.number(), z.number()]), z.string(), z.null()]).optional(),

    nbre_pdc: looseNumber,
    id_pdc_itinerance: looseString,
    id_pdc_local: looseString,
    puissance_nominale: looseNumber,

    prise_type_ef: looseBoolean,
    prise_type_2: looseBoolean,
    prise_type_combo_ccs: looseBoolean,
    prise_type_chademo: looseBoolean,
    prise_type_autre: looseBoolean,

    gratuit: looseBoolean,
    paiement_acte: looseBoolean,
    paiement_cb: looseBoolean,
    paiement_autre: looseBoolean,
    tarification: looseString,

    condition_acces: looseString,
    reservation: looseBoolean,
    horaires: looseString,
    accessibilite_pmr: looseString,

    date_maj: looseString,

    consolidated_longitude: looseNumber,
    consolidated_latitude: looseNumber,
    consolidated_code_postal: looseString,
    consolidated_commune: looseString,
  })
  .passthrough()

export type IrveRowInput = z.infer<typeof irveRowSchema>

/** Response envelope of https://tabular-api.data.gouv.fr */
export const tabularResponseSchema = z.object({
  data: z.array(z.unknown()),
  meta: z
    .object({
      page: z.number().optional(),
      page_size: z.number().optional(),
      total: z.number().optional(),
    })
    .optional(),
  links: z.record(z.unknown()).optional(),
})

export type TabularResponse = z.infer<typeof tabularResponseSchema>

/** Subset of the data.gouv dataset metadata we rely on (spec 6.4). */
export const dataGouvResourceSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  format: z.string().nullish(),
  url: z.string(),
  filesize: z.number().nullish(),
  last_modified: z.string().nullish(),
  schema: z
    .object({
      name: z.string().nullish(),
      version: z.string().nullish(),
    })
    .nullish(),
  extras: z.record(z.unknown()).nullish(),
})

export const dataGouvDatasetSchema = z.object({
  id: z.string(),
  slug: z.string().nullish(),
  title: z.string().nullish(),
  last_update: z.string().nullish(),
  page: z.string().nullish(),
  resources: z.array(dataGouvResourceSchema),
})

export type DataGouvDataset = z.infer<typeof dataGouvDatasetSchema>
export type DataGouvResource = z.infer<typeof dataGouvResourceSchema>
