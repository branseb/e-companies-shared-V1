import type { StravneRates, StravneRatesEntry } from '../types'

export const TRANSPORT_OPTIONS = [
    { value: 'car',         label: 'Vlastné auto (AUV)', short: 'AUV' },
    { value: 'company_car', label: 'Firemné auto (AUS)',  short: 'AUS' },
    { value: 'train',       label: 'Vlak',                short: 'R/O' },
    { value: 'bus',         label: 'Autobus',             short: 'A'   },
    { value: 'plane',       label: 'Lietadlo',            short: 'L'   },
    { value: 'other',       label: 'Iné',                 short: '—'   },
]

export const COUNTRY_OPTIONS = [
    { code: 'SK', label: 'Slovensko',        currency: 'EUR', borderPrefix: ''     },
    { code: 'CZ', label: 'Česká republika',  currency: 'CZK', borderPrefix: 'CZ'  },
    { code: 'HU', label: 'Maďarsko',         currency: 'HUF', borderPrefix: 'HU'  },
    { code: 'AT', label: 'Rakúsko',          currency: 'EUR', borderPrefix: 'AT'  },
    { code: 'PL', label: 'Poľsko',           currency: 'PLN', borderPrefix: 'PL'  },
    { code: 'DE', label: 'Nemecko',          currency: 'EUR', borderPrefix: 'DE'  },
    { code: 'UA', label: 'Ukrajina',         currency: 'UAH', borderPrefix: 'UA'  },
    { code: 'OTHER', label: 'Iná krajina',   currency: 'EUR', borderPrefix: 'XX'  },
]

export const STATUS_OPTIONS = [
    { value: 'navrh',    label: 'Návrh' },
    { value: 'approved', label: 'Schválený' },
    { value: 'settled',  label: 'Vyúčtovaný' },
]

export const STATUS_MAP: Record<string, { label: string; color: 'default' | 'info' | 'success' | 'warning' }> = {
    draft:    { label: 'Koncept',     color: 'default' },
    navrh:    { label: 'Návrh',       color: 'warning' },
    approved: { label: 'Schválený',   color: 'info' },
    settled:  { label: 'Vyúčtovaný', color: 'success' },
}

export const EXPENSE_TYPES = [
    { value: 'cestovne', label: 'Cestovné' },
    { value: 'noclazne', label: 'Nocľažné' },
    { value: 'nutne',    label: 'Nutné náhrady' },
    { value: 'vreckove', label: 'Vreckové' },
    { value: 'ine',      label: 'Iné náhrady' },
]

export const AMORTIZATION_RATE = 0.313

export const TAX_RATES = [0, 5, 10, 19, 20, 23]

export const DEFAULT_ENTRY: StravneRatesEntry = {
    validFrom: '2025-01-01',
    sk_5: 9.30,
    sk_12: 13.80,
    sk_18: 20.60,
    meals: { ranajky: 0.25, obed: 0.40, vecera: 0.35 },
    amortizationRate: 0.313,
    foreign: Object.fromEntries(
        COUNTRY_OPTIONS.filter(c => c.code !== 'SK').map(c => [
            c.code,
            { rate_12: 0, currency: c.currency },
        ])
    ),
}

export const DEFAULT_STRAVNE_RATES: StravneRates = [DEFAULT_ENTRY]
