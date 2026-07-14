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

// NBS nepublikuje kurz cez víkendy/sviatky, takže sa skúša dozadu až
// `maxLookbackDays` dní - VŠETKY NARAZ (Promise.all), nie postupne. Sekvenčné
// čakanie na až 8 volaní na ten istý server v serverless prostredí (napr.
// Vercel funkcia s časovým limitom) ľahko presiahne timeout.
export const fetchExchangeRates = async (refDate: string, maxLookbackDays = 7): Promise<ExchangeRateLookup | null> => {
    const dates = Array.from({ length: maxLookbackDays + 1 }, (_, i) => shiftDate(refDate, -i))
    const results = await Promise.all(dates.map(async (dateStr): Promise<ExchangeRateLookup | null> => {
        try {
            const res = await fetch(NBS_EXPORT_URL(dateStr))
            if (!res.ok) return null
            return parseReferenceRatesXml(await res.text())
        } catch {
            return null
        }
    }))
    const found = results.find((r): r is ExchangeRateLookup => r !== null)
    if (found) return found

    try {
        const res = await fetch(ECB_DAILY_URL)
        if (res.ok) return parseReferenceRatesXml(await res.text())
    } catch {
        // no network / source unavailable
    }
    return null
}
