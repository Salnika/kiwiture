/**
 * Parser for the free-text IRVE `tarification` field (spec 10).
 *
 * Hard rule: the parser never invents a value. When the text is ambiguous it
 * returns `confidence: 'low'` with no numbers, and the caller keeps the price as
 * `unknown` while still displaying the raw text (spec 10.4 / 22.2 / 44).
 */

export interface ParsedTariff {
  energyPricePerKwh?: number
  sessionFee?: number
  minuteFee?: number
  isFree?: boolean
  /**
   * True when the value came from a bare number with no unit (e.g. `0.38`).
   * The caller must downgrade such a price to `estimated`, never `parsed`.
   */
  assumedUnit?: boolean
  confidence: 'high' | 'medium' | 'low'
  matchedText?: string
}

const EMPTY: ParsedTariff = { confidence: 'low' }

/**
 * Placeholder values that pepper the national dataset. They carry no tariff
 * information whatsoever.
 */
const PLACEHOLDERS = new Set([
  '',
  '-',
  '--',
  '/',
  'na',
  'n/a',
  'nc',
  'inconnu',
  'inconnue',
  'non renseigne',
  'non renseignee',
  'non concerne',
  'non concernee',
  'non communique',
  'non defini',
  'a definir',
  'null',
  'none',
  'sans objet',
  'payant',
  'gratuite ou payante',
])

/** Wording that makes any number in the text conditional and unusable. */
const AMBIGUITY_MARKERS = [
  'selon abonnement',
  'selon le contrat',
  'selon contrat',
  'selon operateur',
  "selon l'operateur",
  'selon la formule',
  'selon votre',
  'variable',
  'depend de',
  'voir sur place',
  'voir application',
  'voir le site',
  'nous consulter',
  'sur devis',
  'a partir de',
]

/** Strips accents, collapses whitespace, normalises currency spellings. */
function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toNumber(raw: string): number | null {
  const value = Number.parseFloat(raw.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

/** Plausibility guard: a public charge above 3 €/kWh is a parsing accident. */
function isPlausibleEnergyPrice(value: number): boolean {
  return value > 0 && value <= 3
}

/** A session fee above 50 € is a misread, not a tariff. */
function isPlausibleSessionFee(value: number): boolean {
  return value > 0 && value <= 50
}

/** Per-minute fees live in cents; anything above 2 €/min is a misread. */
function isPlausibleMinuteFee(value: number): boolean {
  return value > 0 && value <= 2
}

const CURRENCY = '(?:€|eur(?:os?)?)'
const CENTS = '(?:c€|c\\s?eur|cts?|centimes?|centime)'
// Up to four decimals: operators do publish prices such as `0.5190 EUR`.
const NUMBER = '(\\d{1,3}(?:[.,]\\d{1,4})?)'
// `kWh`, and the inverted `kw/h` / `kw.h` spellings seen in the national base.
const KWH = '(?:kwh|kw\\s*[/.]\\s*h)'

/** `0,40 €/kWh`, `0.40 € / kWh`, `0,40 EUR par kWh`, `0,40€ le kWh` */
const EURO_PER_KWH = new RegExp(
  `${NUMBER}\\s*${CURRENCY}\\s*(?:\\/|par|le|la|du|pour|\\s)?\\s*${KWH}`,
  'g',
)

/** `kWh : 0,40 €`, `kWh = 0,40 EUR` */
const KWH_THEN_EURO = new RegExp(`${KWH}\\s*(?:[:=]|a|:)\\s*${NUMBER}\\s*${CURRENCY}`, 'g')

/**
 * `Price per kWh (billed per 1 Wh): 0.5190 EUR` — the unit comes first, then a
 * short qualifier, then the amount. The gap is bounded so an unrelated amount
 * further down the text cannot be captured.
 */
const KWH_THEN_EURO_LOOSE = new RegExp(`${KWH}.{0,40}?${NUMBER}\\s*${CURRENCY}`, 'g')

/** `40 c€/kWh`, `40 centimes par kWh`, `40 cts/kWh` */
const CENTS_PER_KWH = new RegExp(
  `${NUMBER}\\s*${CENTS}\\s*(?:\\/|par|le|la|\\s)?\\s*${KWH}`,
  'g',
)

/**
 * `0.40 kw/h` — the unit is stated but the currency is omitted. Requires a
 * decimal separator so a power rating such as `22 kWh` cannot be read as a price.
 */
const KWH_WITHOUT_CURRENCY = new RegExp(
  `(\\d{1,3}[.,]\\d{1,4})\\s*(?:\\/|par|le|la|\\s)?\\s*${KWH}`,
  'g',
)

/** A tariff field holding nothing but a number, e.g. `0,38`. */
const BARE_NUMBER = /^(\d{1,3}(?:[.,]\d{1,4})?)$/

/** `0,50 € la session`, `1 € par recharge`, `frais de session 0,50 €` */
const SESSION_FEE = new RegExp(
  `${NUMBER}\\s*${CURRENCY}\\s*(?:\\/|par|la|le|de|pour)?\\s*(?:session|recharge|charge|transaction|acte|connexion|activation|demarrage|branchement)`,
  'g',
)
const SESSION_FEE_REVERSED = new RegExp(
  `(?:frais|cout|prix|forfait)\\s+(?:de\\s+)?(?:session|recharge|mise en service|connexion|activation)\\s*(?:[:=de]*)\\s*${NUMBER}\\s*${CURRENCY}`,
  'g',
)

/** `0,10 €/min`, `0,10 € par minute` */
const MINUTE_FEE = new RegExp(
  `${NUMBER}\\s*${CURRENCY}\\s*(?:\\/|par|la|le)?\\s*(?:min\\b|minute)`,
  'g',
)

/** A bare amount followed by `+`, as in `0,50 € + 0,35 €/kWh`. */
const LEADING_FLAT_FEE = new RegExp(`^${NUMBER}\\s*${CURRENCY}\\s*\\+`, '')

function collectMatches(text: string, pattern: RegExp, transform: (n: number) => number): number[] {
  const values: number[] = []
  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const parsed = toNumber(match[1] ?? '')
    if (parsed !== null) values.push(transform(parsed))
  }
  return values
}

/** Distinct values at cent precision — `0,40` and `0,400` are the same price. */
function distinct(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))]
}

function detectFree(text: string): boolean {
  // "Stationnement gratuit" says nothing about the charge itself.
  const withoutParking = text
    .replace(/(?:stationnement|parking|place|acces au parking)[^.,;]*gratuit\w*/g, ' ')
    .replace(/gratuit\w*\s*(?:pour le |le )?(?:stationnement|parking)/g, ' ')

  if (!/\bgratuit\w*\b|\boffert\w*\b|\bsans frais\b|\b0\s*€\s*\/\s*kwh\b/.test(withoutParking)) {
    return false
  }
  // "Non gratuit", "recharge non gratuite" must not be read as free.
  if (/\bnon\s+gratuit\w*/.test(withoutParking)) return false
  return true
}

/**
 * Parses an IRVE tariff string.
 *
 * @param input raw `tarification` value, possibly empty.
 */
export function parseIrvePrice(input: string | null | undefined): ParsedTariff {
  if (input === null || input === undefined) return EMPTY

  const text = normalizeText(input)
  if (text.length === 0) return EMPTY

  const alphanumeric = text.replace(/[^a-z0-9/]/g, '')
  if (PLACEHOLDERS.has(text) || PLACEHOLDERS.has(alphanumeric)) return EMPTY

  const isAmbiguous = AMBIGUITY_MARKERS.some((marker) => text.includes(marker))

  // A field holding only a number: the unit is missing, so the value is an
  // assumption rather than a published price (spec 58 — "Prix estimé").
  const bare = BARE_NUMBER.exec(text)
  if (bare) {
    const value = toNumber(bare[1] ?? '')
    // A bare `0` is far more likely a placeholder than a free charge: claiming
    // "recharge gratuite" on that basis would be inventing a fact.
    if (value !== null && isPlausibleEnergyPrice(value)) {
      return {
        energyPricePerKwh: value,
        assumedUnit: true,
        confidence: 'medium',
        matchedText: input,
      }
    }
    return { confidence: 'low', matchedText: input }
  }

  const energyFromEuros = collectMatches(text, EURO_PER_KWH, (n) => n)
  const energyFromReversed = collectMatches(text, KWH_THEN_EURO, (n) => n)
  const energyFromCents = collectMatches(text, CENTS_PER_KWH, (n) => n / 100)

  let energyCandidates = distinct(
    [...energyFromEuros, ...energyFromReversed, ...energyFromCents].filter(isPlausibleEnergyPrice),
  )

  // Last resorts, tried only when the strict patterns found nothing:
  // an amount stated without its currency, then a loosely attached amount as in
  // `Price per kWh (billed per 1 Wh): 0.5190 EUR`.
  if (energyCandidates.length === 0) {
    energyCandidates = distinct(
      collectMatches(text, KWH_WITHOUT_CURRENCY, (n) => n).filter(isPlausibleEnergyPrice),
    )
  }
  if (energyCandidates.length === 0) {
    energyCandidates = distinct(
      collectMatches(text, KWH_THEN_EURO_LOOSE, (n) => n).filter(isPlausibleEnergyPrice),
    )
  }

  const sessionCandidates = distinct([
    ...collectMatches(text, SESSION_FEE, (n) => n),
    ...collectMatches(text, SESSION_FEE_REVERSED, (n) => n),
  ]).filter(isPlausibleSessionFee)
  const minuteCandidates = distinct(collectMatches(text, MINUTE_FEE, (n) => n)).filter(
    isPlausibleMinuteFee,
  )

  // `0,50 € + 0,35 €/kWh`: the leading bare amount is the session fee.
  const leadingFlat = LEADING_FLAT_FEE.exec(text)
  if (sessionCandidates.length === 0 && leadingFlat && energyCandidates.length === 1) {
    const value = toNumber(leadingFlat[1] ?? '')
    if (value !== null && value > 0) sessionCandidates.push(value)
  }

  const free = detectFree(text)

  // Free and explicitly priced at the same time: contradictory, refuse to guess.
  if (free && energyCandidates.length > 0 && energyCandidates.some((value) => value > 0)) {
    return { confidence: 'low', matchedText: input }
  }

  if (free) {
    return {
      isFree: true,
      energyPricePerKwh: 0,
      confidence: isAmbiguous ? 'medium' : 'high',
      matchedText: input,
    }
  }

  if (energyCandidates.length === 0) {
    // A lone session or minute fee tells us nothing about the energy price:
    // keep it, but never let the caller believe the total is computable.
    if (!isAmbiguous && sessionCandidates.length === 1 && minuteCandidates.length === 0) {
      return { sessionFee: sessionCandidates[0], confidence: 'medium', matchedText: input }
    }
    if (!isAmbiguous && minuteCandidates.length === 1 && sessionCandidates.length === 0) {
      return { minuteFee: minuteCandidates[0], confidence: 'medium', matchedText: input }
    }
    return { confidence: 'low', matchedText: input }
  }

  // Several different €/kWh values (subscriber vs non-subscriber, per power
  // tier…): we cannot pick one on the user's behalf.
  if (energyCandidates.length > 1) {
    return { confidence: 'low', matchedText: input }
  }

  const energyPricePerKwh = energyCandidates[0] as number

  const result: ParsedTariff = { energyPricePerKwh, matchedText: input, confidence: 'high' }

  if (sessionCandidates.length === 1) result.sessionFee = sessionCandidates[0]
  if (minuteCandidates.length === 1) result.minuteFee = minuteCandidates[0]

  const hasExtraComponents =
    sessionCandidates.length > 0 || minuteCandidates.length > 0 || /abonn|adherent|membre/.test(text)

  if (isAmbiguous) return { confidence: 'low', matchedText: input }
  if (sessionCandidates.length > 1 || minuteCandidates.length > 1) {
    return { confidence: 'low', matchedText: input }
  }
  if (hasExtraComponents) result.confidence = 'medium'

  return result
}
