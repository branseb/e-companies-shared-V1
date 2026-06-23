import type { StravneRates, StravneRatesEntry, CountryOption } from '../types'
import { COUNTRY_OPTIONS, DEFAULT_ENTRY } from '../constants'

export const getRatesForDate = (history: StravneRates, date: string): StravneRatesEntry => {
    if (!history.length) return DEFAULT_ENTRY
    const sorted = [...history].sort((a, b) => b.validFrom.localeCompare(a.validFrom))
    return sorted.find(e => e.validFrom <= date) ?? sorted[sorted.length - 1]
}

const NEARBY_CODES = ['CZ', 'AT', 'HU', 'PL', 'DE', 'UA']

export const getAllCountries = (history: StravneRates): CountryOption[] => {
    const sk = COUNTRY_OPTIONS.find(c => c.code === 'SK')!
    if (!history.length) return COUNTRY_OPTIONS.filter(c => c.code !== 'OTHER')
    const latest = getRatesForDate(history, new Date().toISOString().slice(0, 10))
    const all: CountryOption[] = Object.entries(latest.foreign)
        .filter(([code]) => code !== 'OTHER')
        .map(([code, fr]) => {
            const base = COUNTRY_OPTIONS.find(c => c.code === code)
            return {
                code,
                label:        fr.label        ?? base?.label        ?? code,
                currency:     fr.currency,
                borderPrefix: base?.borderPrefix ?? fr.borderPrefix ?? code,
            }
        })
    const nearby = NEARBY_CODES.map(code => all.find(c => c.code === code)).filter((c): c is CountryOption => !!c)
    const rest   = all.filter(c => !NEARBY_CODES.includes(c.code)).sort((a, b) => a.label.localeCompare(b.label, 'sk'))
    return [sk, ...nearby, ...rest]
}
