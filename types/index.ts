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
    country?: string | null
    purpose?: string | null
    departureLocation?: string | null
    departureDate: string
    departureTime?: string | null
    returnLocation?: string | null
    returnDate?: string | null
    segments: TripSegment[]
}

export type TravelOrder = {
    id: number | string
    employee: string
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
    advances?: Array<{ amount: number; currency: string }> | null
    useExchangeRates?: boolean | null
    exchangeRateDate?: string | null
    exchangeRates?: Record<string, number> | null
    trips?: Trip[] | null
    createdAt: string
}

export type TravelOrderInput = Omit<TravelOrder, 'id' | 'createdAt'>

export type EmployeeRecord = {
    id: number
    name: string
    address?: string | null
    defaultLocation?: string | null
    defaultFuelConsumption?: number | null
    defaultEcv?: string | null
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

export type TravelOrdersWidgetProps = {
    orders: TravelOrder[]
    loading: boolean
    onAdd: (data: TravelOrderInput) => Promise<void>
    onUpdate: (id: TravelOrder['id'], data: Partial<TravelOrderInput>) => Promise<void>
    onDelete: (id: TravelOrder['id']) => Promise<void>
    onGeneratePdf?: (order: TravelOrder) => void
    readOnly?: boolean
    ratesHistory?: StravneRates | null
    onRatesChange?: (history: StravneRates) => void
    employees?: EmployeeRecord[]
    onEmployeeCreate?: (data: { name: string; address?: string; defaultLocation?: string; defaultFuelConsumption?: number; defaultEcv?: string }) => Promise<void>
    onEmployeeUpdate?: (id: number, data: { name: string; address?: string; defaultLocation?: string; defaultFuelConsumption?: number; defaultEcv?: string }) => Promise<void>
    onEmployeeDelete?: (id: number) => Promise<void>
}

export type TravelOrderDetailPanelProps = {
    order: TravelOrder
    ratesHistory: StravneRates
}
