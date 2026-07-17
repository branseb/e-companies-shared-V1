import { isValidIco } from '../utils/skValidators'

// Snímka identifikačných/adresných údajov partnera platná k dátumu vystavenia faktúry.
// Faktúra je vždy primárny zdroj - register (ORSF) dopĺňa iba to, čo sa z faktúry nepodarilo
// prečítať. Snapshot sa ukladá priamo na faktúru (nie ako odkaz na živý záznam partnera), aby
// zostal nemenný aj keď sa firma neskôr premenuje/presťahuje.
export type PartnerSnapshot = {
    name: string
    ico: string
    dic: string
    icDph: string
    street: string
    streetNumber: string
    registrationNumber?: string
    postalCode: string
    city: string
    country: string
    source: 'invoice' | 'historical_registry' | 'current_registry'
    validAt: string
}

export type ExtractedPartner = Partial<{
    name: string
    ico: string
    dic: string
    icDph: string
    street: string
    streetNumber: string
    postalCode: string
    city: string
    country: string
}>

type OrsfPreviousName = { value: string; validFrom: string; validTo: string }
type OrsfPreviousAddress = {
    street?: string
    buildingNumber?: string
    postalCodes?: string[]
    municipality?: { value?: string }
    country?: { value?: string; code?: string }
    validFrom: string
    validTo: string
}
type OrsfCompany = {
    ico: string
    dic?: string
    icdph?: string
    name: string
    street?: string
    city?: string
    psc?: string
    registerNumber?: string
    previousNames?: OrsfPreviousName[]
    previousAddresses?: OrsfPreviousAddress[]
}

const ORSF_BASE = 'https://api.orsf.sk/v1'

// Overené živým volaním api.orsf.sk/v1/companies/{ico} (bezplatné, bez API kľúča, agreguje ORSR/RPO/RÚZ).
// previousNames/previousAddresses obsahujú validFrom/validTo pre každú historickú zmenu.
//
// Celý firemný záznam (so všetkými historickými menami/adresami) sa cachuje podľa IČO na 24h -
// resolveSnapshot sa pre tú istú faktúru bežne volá dvakrát (hneď po parsovaní aj znova pri
// uložení) a pri viacerých faktúrach od toho istého dodávateľa v jednej session by sa inak
// zbytočne opakovane pýtalo cez sieť na tie isté, dávno nemenné údaje. Neúspešné volania sa
// zámerne necachujú, nech dočasný výpadok siete nezablokuje ďalší pokus.
const orsfCache = new Map<string, { company: OrsfCompany; fetchedAt: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export const fetchOrsfCompany = async (ico: string): Promise<OrsfCompany | null> => {
    const cached = orsfCache.get(ico)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.company
    try {
        const res = await fetch(`${ORSF_BASE}/companies/${ico}`)
        if (!res.ok) return null
        const company = await res.json()
        orsfCache.set(ico, { company, fetchedAt: Date.now() })
        return company
    } catch {
        return null
    }
}

const isWithin = (validFrom: string | undefined, validTo: string | undefined, at: string): boolean => {
    if (validFrom && at < validFrom) return false
    if (validTo && at > validTo) return false
    return true
}

// ORSF vracia aktuálnu adresu ako "street" so zlúčeným popisným/orientačným číslom (napr. "Mlynské
// nivy 44/a"), zatiaľ čo historické záznamy v previousAddresses majú street a buildingNumber
// oddelené - pre konzistentný výstup sa aktuálna adresa rozdelí rovnako.
const splitStreet = (combined: string | undefined): { street: string; streetNumber: string } => {
    const m = (combined ?? '').match(/^(.*?)\s+(\d[\w/-]*)$/)
    return m ? { street: m[1].trim(), streetNumber: m[2].trim() } : { street: combined ?? '', streetNumber: '' }
}

const resolveHistoricalName = (company: OrsfCompany, at: string): { name: string; historical: boolean } => {
    const hit = company.previousNames?.find(n => isWithin(n.validFrom, n.validTo, at))
    return hit ? { name: hit.value, historical: true } : { name: company.name, historical: false }
}

const resolveHistoricalAddress = (company: OrsfCompany, at: string) => {
    const hit = company.previousAddresses?.find(a => isWithin(a.validFrom, a.validTo, at))
    if (hit) {
        return {
            street: hit.street ?? '',
            streetNumber: hit.buildingNumber ?? '',
            postalCode: hit.postalCodes?.[0] ?? '',
            city: hit.municipality?.value ?? '',
            country: hit.country?.value ?? 'Slovenská republika',
            historical: true,
        }
    }
    const { street, streetNumber } = splitStreet(company.street)
    return {
        street, streetNumber,
        postalCode: company.psc ?? '',
        city: company.city ?? '',
        country: 'Slovenská republika',
        historical: false,
    }
}

// Doplní chýbajúce polia partnera z ORSF k dátumu vystavenia faktúry (issueDate). Nikdy neprepíše
// hodnotu, ktorá už bola úspešne prečítaná z faktúry - tá má vždy prednosť. Vráti null, ak faktúra
// nemá platné IČO (bez neho sa v registri nedá vyhľadávať) alebo ak sú všetky polia už kompletné
// (v tom prípade netreba volať sieť vôbec).
export const resolvePartnerSnapshot = async (
    extracted: ExtractedPartner,
    issueDate: string,
): Promise<PartnerSnapshot | null> => {
    // Kontrolný súčet IČO sa overuje aj na tejto "rýchlej" ceste - inak by OCR chyba v jedinej
    // číslici IČO (pri inak kompletne vyzerajúcom mene/adrese) prešla bez akejkoľvek kontroly
    // a snímka by sa uložila so source:'invoice', akoby bola dôveryhodná.
    const isComplete = !!(extracted.name && extracted.ico && extracted.street
        && extracted.postalCode && extracted.city && isValidIco(extracted.ico).valid)
    if (isComplete) {
        return {
            name: extracted.name!,
            ico: extracted.ico!,
            dic: extracted.dic ?? '',
            icDph: extracted.icDph ?? '',
            street: extracted.street!,
            streetNumber: extracted.streetNumber ?? '',
            postalCode: extracted.postalCode!,
            city: extracted.city!,
            country: extracted.country ?? 'Slovenská republika',
            source: 'invoice',
            validAt: issueDate,
        }
    }

    if (!extracted.ico || !isValidIco(extracted.ico).valid) return null

    const company = await fetchOrsfCompany(extracted.ico)
    if (!company) return null

    const nameResolved = resolveHistoricalName(company, issueDate)
    const addr = resolveHistoricalAddress(company, issueDate)
    const usedHistorical = nameResolved.historical || addr.historical

    return {
        name: extracted.name || nameResolved.name,
        ico: extracted.ico,
        dic: extracted.dic || company.dic || '',
        icDph: extracted.icDph || company.icdph || '',
        street: extracted.street || addr.street,
        streetNumber: extracted.streetNumber || addr.streetNumber,
        registrationNumber: company.registerNumber,
        postalCode: extracted.postalCode || addr.postalCode,
        city: extracted.city || addr.city,
        country: extracted.country || addr.country,
        source: usedHistorical ? 'historical_registry' : 'current_registry',
        validAt: issueDate,
    }
}
