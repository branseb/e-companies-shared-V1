export type TripSegment = {
    date: string
    fromPlace: string
    fromTime: string
    toPlace: string
    toTime: string
    transport: string
    km: number | null
    stravne: number | null
    currency?: string | null
    country?: string | null
    nbsDate?: string | null
    expenses?: Array<{ type: string; amount: number; currency: string }> | null
}

export type Trip = {
    destination: string
    destinationLat?: number | null
    destinationLon?: number | null
    country?: string | null
    purpose?: string | null
    departureLocation?: string | null
    departureDate: string
    departureTime?: string | null
    returnLocation?: string | null
    returnDate?: string | null
    returnTime?: string | null
    // Pole objektov, nie [number, number][] - Firestore odmieta priamo vnorené polia.
    routeCoordinates?: Array<{ lat: number; lon: number }> | null
    segments: TripSegment[]
}

export type CompanyRateConfig = {
    kmRate?: number | null
    meal5_12?: number | null
    meal12_18?: number | null
    meal18plus?: number | null
    foreign?: Record<string, number | null>
    useLegalRates?: boolean
    approvalMode?: 'preApproval' | 'direct'
}

export type EmployeeRateConfig = {
    kmRate?: number | null
    meal5_12?: number | null
    meal12_18?: number | null
    meal18plus?: number | null
    foreign?: Record<string, number | null>
    isMobileWorker?: boolean | null
}

export type EffectiveRates = {
    sk_5: number
    sk_12: number
    sk_18: number
    meals: StravneMeals
    foreign: Record<string, ForeignStravneRate>
    kmRate: number
    algorithmVersion: string
    resolvedFrom: {
        stravne: 'employee' | 'company' | 'legal'
        km: 'employee' | 'company' | 'legal'
    }
}

export type TravelOrder = {
    id: number | string
    employee: string
    employeeId?: number | null
    employeeAddress?: string | null
    collaborators?: string | null
    destination: string
    purpose?: string | null
    departureLocation?: string | null
    departureDate: string
    departureTime?: string | null
    returnLocation?: string | null
    returnDate?: string | null
    returnTime?: string | null
    arrivalTime?: string | null
    returnDepartureTime?: string | null
    transportType?: string | null
    ecv?: string | null
    distanceKm?: number | null
    fuelConsumption?: number | null
    fuelPricePerLiter?: number | null
    advanceAmount?: number | null
    stravneAmount?: number | null
    stravneMultiplier?: number | null
    actualExpenses?: number | null
    currency: string
    status: string
    notes?: string | null
    freeRanajky?: boolean | null
    freeObed?: boolean | null
    freeVecera?: boolean | null
    includeAccounting?: boolean | null
    includeAdminFields?: boolean | null
    applyAmortization?: boolean | null
    applyFuelCost?: boolean | null
    isElectric?: boolean | null
    fuelType?: string | null
    advances?: Array<{ amount: number; currency: string }> | null
    useExchangeRates?: boolean | null
    exchangeRateDate?: string | null
    exchangeRates?: Record<string, number> | null
    trips?: Trip[] | null
    ratesSnapshot?: EffectiveRates | null
    kmRateUsed?: number | null
    ratesAlgorithmVersion?: string | null
    createdAt: string
}

export type TravelOrderInput = Omit<TravelOrder, 'id' | 'createdAt'>

export type EmployeeRecord = {
    id: number
    name: string
    address?: string | null
    defaultLocation?: string | null
    defaultFuelConsumption?: number | null
    defaultIsElectric?: boolean | null
    defaultEcv?: string | null
    rateKm?: number | null
    rateMeal5_12?: number | null
    rateMeal12_18?: number | null
    rateMeal18plus?: number | null
    foreign?: Record<string, number | null> | null
    isMobileWorker?: boolean | null
}

export type ForeignStravneRate = {
    rate_12: number
    currency: string
    label?: string
    borderPrefix?: string
}

export type StravneMeals = {
    ranajky: number
    obed: number
    vecera: number
}

export type StravneRatesEntry = {
    validFrom: string
    sk_5: number
    sk_12: number
    sk_18: number
    meals: StravneMeals
    foreign: Record<string, ForeignStravneRate>
    amortizationRate?: number
}

export type StravneRates = StravneRatesEntry[]

export type CountryOption = {
    code: string
    label: string
    currency: string
    borderPrefix: string
}

export type {
  UserRole, DocumentType, DocumentStatus, CompanyDocument,
} from './document'
export {
  TYPE_LABELS, STATUS_COLOR, STATUS_LABEL, CHUNK_SIZE,
} from './document'

export type TravelPreferences = {
    customPurposes: string[]
    customPlaces: string[]
}

export const DEFAULT_TRAVEL_PREFERENCES: TravelPreferences = {
    customPurposes: [],
    customPlaces: [],
}

export type EmployeeFormData = {
    name: string
    address?: string
    defaultLocation?: string
    defaultFuelConsumption?: number
    defaultIsElectric?: boolean
    defaultEcv?: string
    isMobileWorker?: boolean
    rateKm?: number | null
    rateMeal5_12?: number | null
    rateMeal12_18?: number | null
    rateMeal18plus?: number | null
    foreign?: Record<string, number | null>
}

export type TravelOrdersWidgetProps = {
    orders: TravelOrder[]
    loading: boolean
    onAdd: (data: TravelOrderInput) => Promise<TravelOrder['id'] | undefined>
    onUpdate: (id: TravelOrder['id'], data: Partial<TravelOrderInput>) => Promise<void>
    onDelete: (id: TravelOrder['id']) => Promise<void>
    onGeneratePdf?: (order: TravelOrder) => void
    readOnly?: boolean
    ratesHistory?: StravneRates | null
    companyRates?: CompanyRateConfig | null
    onCompanyRatesChange?: (rates: CompanyRateConfig) => void
    employees?: EmployeeRecord[]
    onEmployeeCreate?: (data: EmployeeFormData) => Promise<void>
    onEmployeeUpdate?: (id: number, data: EmployeeFormData) => Promise<void>
    onEmployeeDelete?: (id: number) => Promise<void>
    preferences?: TravelPreferences | null
    onPreferencesChange?: (prefs: TravelPreferences) => void
    onGetAttachments?: (orderId: TravelOrder['id']) => Promise<TravelOrderAttachment[]>
    onAddAttachment?: (orderId: TravelOrder['id']) => Promise<TravelOrderAttachment | null>
    onAddAttachmentFromPath?: (orderId: TravelOrder['id'], filePath: string) => Promise<TravelOrderAttachment | null>
    onOpenAttachment?: (orderId: TravelOrder['id'], attachmentId: string) => void
    onDeleteAttachment?: (orderId: TravelOrder['id'], attachmentId: string) => Promise<void>
    onMigrateAttachments?: (tempId: string, realOrderId: TravelOrder['id']) => Promise<void>
    onReadAttachment?: (orderId: TravelOrder['id'], attachmentId: string) => Promise<{ buffer: ArrayBuffer; mimeType: string } | null>
}

export type TravelOrderAttachment = {
    id: string
    filename: string
    storedName: string
    addedAt: string
    size: number
}

export type TravelOrderDetailPanelProps = {
    order: TravelOrder
    ratesHistory: StravneRates
    attachments?: TravelOrderAttachment[]
    onAddAttachment?: () => void
    onOpenAttachment?: (id: string) => void
    onDeleteAttachment?: (id: string) => Promise<void>
    onReadAttachment?: (id: string) => Promise<{ buffer: ArrayBuffer; mimeType: string } | null>
}
