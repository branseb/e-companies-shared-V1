export type ExchangeRateLookup = { date: string; rates: Record<string, number> }

const NBS_EXPORT_URL = (date: string) => `https://nbs.sk/export/en/exchange-rate/${date}/xml`
const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'

export const parseReferenceRatesXml = (xml: string): ExchangeRateLookup | null => {
    const dayMatch = xml.match(/<Cube[^>]*\stime=['"]([\d-]+)['"][^>]*>/)
    if (!dayMatch) return null
    const rates: Record<string, number> = {}
    const re = /<Cube[^>]*\scurrency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.,]+)['"]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(xml))) {
        rates[m[1]] = Number(m[2].replace(/,/g, ''))
    }
    if (Object.keys(rates).length === 0) return null
    return { date: dayMatch[1], rates }
}

const shiftDate = (isoDate: string, days: number) => {
    const d = new Date(`${isoDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

export const fetchExchangeRates = async (refDate: string, maxLookbackDays = 7): Promise<ExchangeRateLookup | null> => {
    for (let i = 0; i <= maxLookbackDays; i++) {
        const dateStr = shiftDate(refDate, -i)
        try {
            const res = await fetch(NBS_EXPORT_URL(dateStr))
            if (res.ok) {
                const parsed = parseReferenceRatesXml(await res.text())
                if (parsed) return parsed
            }
        } catch {
            // try next fallback date / source
        }
    }
    try {
        const res = await fetch(ECB_DAILY_URL)
        if (res.ok) return parseReferenceRatesXml(await res.text())
    } catch {
        // no network / source unavailable
    }
    return null
}
