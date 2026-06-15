export type UserRole = 'company' | 'accountant'

export type DocumentType =
  | 'invoice'
  | 'invoice_issued'
  | 'invoice_received'
  | 'bank_statement'
  | 'travel'
  | 'receipt'
  | 'other'

export type DocumentStatus = 'uploaded' | 'downloaded' | 'processed'

export type CompanyDocument = {
  id: string
  fileName: string
  type: DocumentType
  status: DocumentStatus
  uploadedAt: Date
  uploadedBy: UserRole
  note?: string
  sizeBytes: number
  contentType?: string
  totalChunks: number
  ekasaData?: Record<string, unknown>
  // Electron-only fields (optional, not present in portal)
  filePath?: string
  invoiceId?: number
  receiptId?: number
}

export const TYPE_LABELS: Record<DocumentType, string> = {
  invoice:           'Neurčené',
  invoice_issued:    'Vydaná faktúra',
  invoice_received:  'Prijatá faktúra',
  bank_statement:    'Výpis z účtu',
  travel:            'Cestovné',
  receipt:           'Blok',
  other:             'Ostatné',
}

export const STATUS_COLOR: Record<DocumentStatus, 'default' | 'warning' | 'success'> = {
  uploaded:   'warning',
  downloaded: 'default',
  processed:  'success',
}

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  uploaded:   'Nahraté',
  downloaded: 'Stiahnuté',
  processed:  'Spracované',
}

export const CHUNK_SIZE = 700_000
