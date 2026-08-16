import { describe, expect, it } from 'vitest'
import { parseIrvePrice } from './parse-irve-price'

describe('parseIrvePrice', () => {
  it('parses a comma-decimal price glued to the currency', () => {
    const result = parseIrvePrice('0,40€/kWh')
    expect(result.energyPricePerKwh).toBe(0.4)
    expect(result.confidence).toBe('high')
    expect(result.isFree).toBeUndefined()
  })

  it('parses a dot-decimal price with spaces around the slash', () => {
    expect(parseIrvePrice('0.40 € / kWh').energyPricePerKwh).toBe(0.4)
  })

  it('parses the EUR spelling', () => {
    expect(parseIrvePrice('0,40 EUR/kWh').energyPricePerKwh).toBe(0.4)
  })

  it('parses the "par kWh" wording', () => {
    expect(parseIrvePrice('0,40€ par kWh').energyPricePerKwh).toBe(0.4)
  })

  it('converts cents per kWh', () => {
    const result = parseIrvePrice('40 c€/kWh')
    expect(result.energyPricePerKwh).toBeCloseTo(0.4, 5)
    expect(result.confidence).toBe('high')
  })

  it('parses "centimes" spelled out', () => {
    expect(parseIrvePrice('35 centimes par kWh').energyPricePerKwh).toBeCloseTo(0.35, 5)
  })

  it('parses a session fee combined with an energy price', () => {
    const result = parseIrvePrice('0,50€ + 0,35€/kWh')
    expect(result.energyPricePerKwh).toBe(0.35)
    expect(result.sessionFee).toBe(0.5)
    expect(result.confidence).toBe('medium')
  })

  it('parses an explicit session wording', () => {
    const result = parseIrvePrice('0,50 € la session + 0,35 €/kWh')
    expect(result.energyPricePerKwh).toBe(0.35)
    expect(result.sessionFee).toBe(0.5)
  })

  it('detects a free station', () => {
    const result = parseIrvePrice('gratuit')
    expect(result.isFree).toBe(true)
    expect(result.energyPricePerKwh).toBe(0)
    expect(result.confidence).toBe('high')
  })

  it('detects "Recharge gratuite"', () => {
    expect(parseIrvePrice('Recharge gratuite').isFree).toBe(true)
  })

  it('does not treat free parking as free charging', () => {
    const result = parseIrvePrice('Stationnement gratuit, recharge 0,45 €/kWh')
    expect(result.isFree).toBeUndefined()
    expect(result.energyPricePerKwh).toBe(0.45)
  })

  it('refuses ambiguous subscription-dependent text', () => {
    const result = parseIrvePrice('Tarification selon abonnement opérateur.')
    expect(result.confidence).toBe('low')
    expect(result.energyPricePerKwh).toBeUndefined()
    expect(result.isFree).toBeUndefined()
  })

  it('refuses empty text', () => {
    expect(parseIrvePrice('').confidence).toBe('low')
    expect(parseIrvePrice(null).confidence).toBe('low')
    expect(parseIrvePrice(undefined).confidence).toBe('low')
  })

  it('refuses dataset placeholders', () => {
    for (const placeholder of ['Inconnu', 'Non concerné', 'N/A', '-', 'NC', 'Payant']) {
      expect(parseIrvePrice(placeholder).confidence, placeholder).toBe('low')
      expect(parseIrvePrice(placeholder).energyPricePerKwh, placeholder).toBeUndefined()
    }
  })

  it('refuses two conflicting energy prices', () => {
    const result = parseIrvePrice('0,40 €/kWh pour les abonnés, 0,59 €/kWh sinon')
    expect(result.confidence).toBe('low')
    expect(result.energyPricePerKwh).toBeUndefined()
  })

  it('keeps the raw text on every outcome', () => {
    expect(parseIrvePrice('Tarification selon abonnement').matchedText).toBe(
      'Tarification selon abonnement',
    )
  })

  it('flags a subscriber qualifier as medium confidence', () => {
    const result = parseIrvePrice('0,40€ / kWh pour les non abonnés.')
    expect(result.energyPricePerKwh).toBe(0.4)
    expect(result.confidence).toBe('medium')
  })

  it('rejects implausible energy prices', () => {
    expect(parseIrvePrice('120 €/kWh').confidence).toBe('low')
  })

  // The cases below all come from real rows of the national base.
  describe('formats observed in the published dataset', () => {
    it('parses an energy price combined with a per-minute fee', () => {
      const result = parseIrvePrice('0.299€/kWh+0.0230€/min pour les recharge en roaming')
      expect(result.energyPricePerKwh).toBeCloseTo(0.299, 5)
      expect(result.minuteFee).toBeCloseTo(0.023, 5)
      expect(result.confidence).toBe('medium')
    })

    it('parses the English "Price per kWh ... : 0.5190 EUR" format', () => {
      const result = parseIrvePrice('Price per kWh (billed per 1 Wh): 0.5190 EUR')
      expect(result.energyPricePerKwh).toBeCloseTo(0.519, 5)
    })

    it('parses the inverted "kw/h" unit', () => {
      expect(parseIrvePrice('0.40 kw/h').energyPricePerKwh).toBeCloseTo(0.4, 5)
    })

    it('treats a bare number as an assumed unit, never a published price', () => {
      const result = parseIrvePrice('0.38')
      expect(result.energyPricePerKwh).toBeCloseTo(0.38, 5)
      expect(result.assumedUnit).toBe(true)
      expect(result.confidence).toBe('medium')
    })

    it('refuses a bare zero rather than claiming a free charge', () => {
      const result = parseIrvePrice('0')
      expect(result.confidence).toBe('low')
      expect(result.isFree).toBeUndefined()
      expect(result.energyPricePerKwh).toBeUndefined()
    })

    it('does not read a fractional minute fee as a huge amount', () => {
      const result = parseIrvePrice('0.27€/kWh+0.10€/min pour les non abonnées')
      expect(result.minuteFee).toBeCloseTo(0.1, 5)
      expect(result.energyPricePerKwh).toBeCloseTo(0.27, 5)
    })
  })

  it('parses a minute fee alone without inventing an energy price', () => {
    const result = parseIrvePrice('0,10 € / min')
    expect(result.minuteFee).toBe(0.1)
    expect(result.energyPricePerKwh).toBeUndefined()
    expect(result.confidence).toBe('medium')
  })
})
