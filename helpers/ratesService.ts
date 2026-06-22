import type { StravneRates, StravneRatesEntry, ForeignStravneRate, CompanyRateConfig, EmployeeRateConfig, EffectiveRates } from '../types'
import { getRatesForDate } from './rates'
import { AMORTIZATION_RATE } from '../constants'
import { MOBILE_FOREIGN_RATES, MOBILE_VALID_FROM } from './mobileRates'

export const RATES_ALGORITHM_VERSION = '1.1'

const pick = <T>(
    employee: T | null | undefined,
    company: T | null | undefined,
    useLegalRates: boolean,
    legal: T,
): { value: T; source: 'employee' | 'company' | 'legal' } => {
    if (employee != null) return { value: employee, source: 'employee' }
    if (!useLegalRates && company != null) return { value: company, source: 'company' }
    return { value: legal, source: 'legal' }
}

const resolveForeign = (
    legalForeign: StravneRatesEntry['foreign'],
    companyForeign?: Record<string, number | null>,
    useLegalRates?: boolean,
    employeeForeign?: Record<string, number | null> | null,
    isMobileWorker?: boolean,
    date?: string,
): Record<string, ForeignStravneRate> => {
    const useMobile = isMobileWorker && date && date >= MOBILE_VALID_FROM
    return Object.fromEntries(
        Object.entries(legalForeign).map(([code, fr]) => {
            const emp = employeeForeign?.[code]
            if (emp != null) return [code, { ...fr, rate_12: emp }]
            if (!useLegalRates && companyForeign) {
                const co = companyForeign[code]
                if (co != null) return [code, { ...fr, rate_12: co }]
            }
            if (useMobile) {
                const mob = MOBILE_FOREIGN_RATES[code]
                if (mob != null) return [code, { ...fr, rate_12: mob.rate_12, currency: mob.currency }]
            }
            return [code, fr]
        })
    )
}

export const resolveRates = (
    travelDate: string,
    legalRates: StravneRates,
    companyRates?: CompanyRateConfig | null,
    employeeRates?: EmployeeRateConfig | null,
    isMobileWorker?: boolean,
): EffectiveRates => {
    const legal = getRatesForDate(legalRates, travelDate)
    const useLegalRates = companyRates?.useLegalRates ?? false

    const km   = pick(employeeRates?.kmRate,     companyRates?.kmRate,     useLegalRates, legal.amortizationRate ?? AMORTIZATION_RATE)
    const sk5  = pick(employeeRates?.meal5_12,   companyRates?.meal5_12,   useLegalRates, legal.sk_5)
    const sk12 = pick(employeeRates?.meal12_18,  companyRates?.meal12_18,  useLegalRates, legal.sk_12)
    const sk18 = pick(employeeRates?.meal18plus, companyRates?.meal18plus, useLegalRates, legal.sk_18)

    return {
        sk_5:             sk5.value,
        sk_12:            sk12.value,
        sk_18:            sk18.value,
        meals:            legal.meals,
        foreign:          resolveForeign(legal.foreign, companyRates?.foreign, useLegalRates, employeeRates?.foreign, isMobileWorker, travelDate),
        kmRate:           km.value,
        algorithmVersion: RATES_ALGORITHM_VERSION,
        resolvedFrom: {
            stravne: sk5.source,
            km:      km.source,
        },
    }
}
