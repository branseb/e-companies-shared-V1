import type { StravneRates, StravneRatesEntry, CountryOption } from '../types'
import { COUNTRY_OPTIONS, DEFAULT_ENTRY } from '../constants'

export const getRatesForDate = (history: StravneRates, date: string): StravneRatesEntry => {
    if (!history.length) return DEFAULT_ENTRY
    const sorted = [...history].sort((a, b) => b.validFrom.localeCompare(a.validFrom))
    return sorted.find(e => e.validFrom <= date) ?? sorted[sorted.length - 1]
}

export const getAllCountries = (history: StravneRates): CountryOption[] => {
    const base = COUNTRY_OPTIONS.filter(c => c.code !== 'OTHER') as CountryOption[]
    const baseCodes = new Set(base.map(c => c.code))
    const customCodes = new Set(
        history.flatMap(e => Object.keys(e.foreign))
            .filter(c => c !== 'OTHER' && !baseCodes.has(c))
    )
    const customs: CountryOption[] = [...customCodes].map(code => {
        const fr = history.map(e => e.foreign[code]).find(Boolean)!
        return { code, label: fr.label ?? code, currency: fr.currency, borderPrefix: fr.borderPrefix ?? code }
    })
    return [...base, ...customs]
}
