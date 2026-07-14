export type FuelPriceLookup = { price: number; weekCode: string; weekLabel: string }

const FUEL_TYPE_TO_UKAZ: Record<string, string> = {
    petrol: 'UKAZ01',
    diesel: 'UKAZ04',
    lpg: 'UKAZ03',
    cng: 'UKAZ05',
    hydrogen: 'UKAZ08',
    electric: 'UKAZ09',
}

const DATASET_URL = (week: string, ukaz: string) =>
    `https://data.statistics.sk/api/v2/dataset/sp0207ts/${week}/${ukaz}?lang=sk&type=json`

const shiftDate = (isoDate: string, days: number) => {
    const d = new Date(`${isoDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

const isoWeekCode = (isoDate: string): string => {
    const d = new Date(`${isoDate}T00:00:00Z`)
    const dayNum = (d.getUTCDay() + 6) % 7 // Monday=0 .. Sunday=6
    d.setUTCDate(d.getUTCDate() - dayNum + 3) // Thursday of this ISO week
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
    const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3)
    const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000))
    return `${d.getUTCFullYear()}${String(week).padStart(2, '0')}`
}

// ŠÚ SR zvykne mať aktuálny aj predošlý týždeň ešte nezverejnený (prázdne
// `value`) - reálne dáta sú spravidla dostupné až spred 2 týždňov. Napriek
// tomu sa NEDOPĹŇA staršou cenou - taká by nebola platná pre deň začiatku
// cesty, len najbližšia dostupná aproximácia. Ak týždeň odchodu ešte nemá
// zverejnenú cenu, vráti sa null a používateľ ju zadá ručne (`maxLookbackWeeks`
// necháva možnosť volajúcemu vedome povoliť lookback, ale predvolene je 0).
// Prípadné viacnásobné volania (maxLookbackWeeks > 0) idú VŠETKY NARAZ
// (Promise.all), nie postupne - sekvenčné čakanie na viacero volaní na ten
// istý externý server v serverless prostredí (napr. Vercel funkcia s časovým
// limitom) ľahko presiahne timeout, kým to v Electrone bez limitu prejde v pohode.
export const fetchFuelPrice = async (
    fuelType: string, refDate: string, maxLookbackWeeks = 0
): Promise<FuelPriceLookup | null> => {
    const ukaz = FUEL_TYPE_TO_UKAZ[fuelType]
    if (!ukaz) return null

    const weekCodes = Array.from({ length: maxLookbackWeeks + 1 }, (_, i) => isoWeekCode(shiftDate(refDate, -7 * i)))
    const results = await Promise.all(weekCodes.map(async (weekCode): Promise<FuelPriceLookup | null> => {
        try {
            const res = await fetch(DATASET_URL(weekCode, ukaz))
            if (!res.ok) return null
            const json = await res.json()
            const value = json?.value?.[0]
            if (typeof value !== 'number') return null
            const weekLabel = json?.dimension?.sp0207ts_tyz?.category?.label?.[weekCode] ?? weekCode
            return { price: value, weekCode, weekLabel }
        } catch {
            return null
        }
    }))
    // Zoradené od najnovšieho týždňa po najstarší - ber prvý, ktorý má hodnotu.
    return results.find((r): r is FuelPriceLookup => r !== null) ?? null
}
