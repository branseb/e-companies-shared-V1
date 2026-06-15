import jsQR from 'jsqr'

export type QrKind = 'ekasa' | 'payment' | 'unknown'

export const detectKind = (text: string): QrKind => {
  if (/^[0-9O]-[0-9a-fA-F]+$/i.test(text.trim())) return 'ekasa'
  if (text.includes('IBAN:') || text.includes('VS:'))  return 'payment'
  return 'unknown'
}

export type PaymentFields = { IBAN?: string; BIC?: string; AMOUNT?: string; CURRENCY?: string; VS?: string }

export const parsePaymentQr = (text: string): PaymentFields => {
  const fields: Record<string, string> = {}
  text.split(';').forEach(part => {
    const idx = part.indexOf(':')
    if (idx > 0) fields[part.slice(0, idx).trim()] = part.slice(idx + 1).trim()
  })
  return fields as PaymentFields
}

export type EkasaData = Record<string, unknown>

export const fetchEkasaReceipt = async (receiptId: string): Promise<EkasaData> => {
  const res = await fetch('https://ekasa.financnasprava.sk/mdu/api/v1/opd/receipt/find', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiptId }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const r = json.receipt ?? json
  return {
    receiptId:        r.receiptId,
    ico:              r.ico ?? r.organization?.ico,
    dic:              r.dic ?? r.organization?.dic,
    organizationName: r.organization?.name,
    shopName:         r.unit?.name,
    cashRegisterCode: r.cashRegisterCode,
    receiptNumber:    r.receiptNumber,
    createDate:       r.createDate ?? r.issueDate,
    totalPrice:       r.totalPrice,
    vatAmount:        (r.vatAmountBasic ?? 0) + (r.vatAmountReduced ?? 0),
    paidByCard:       r.paidByCard ??
      (Array.isArray(r.payments)
        ? r.payments.some((p: any) =>
            /kart|card/i.test(String(p.paymentType ?? p.type ?? ''))
          )
        : false),
    address: [r.organization?.streetName, r.organization?.municipality].filter(Boolean).join(', ') || undefined,
    items:   r.items,
  }
}

const tryDecodeQrAtAngle = (img: HTMLImageElement, angle: number): string | null => {
  const swap = angle === 90 || angle === 270
  const canvas = document.createElement('canvas')
  canvas.width  = swap ? img.height : img.width
  canvas.height = swap ? img.width  : img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((angle * Math.PI) / 180)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return jsQR(data, width, height)?.data ?? null
}

export const decodeQrFromFile = (file: File): Promise<string | null> =>
  new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      for (const angle of [0, 90, 180, 270]) {
        const result = tryDecodeQrAtAngle(img, angle)
        if (result) { URL.revokeObjectURL(url); resolve(result); return }
      }
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })

export const decodeQrFromBase64 = (base64: string, mime: string): Promise<string | null> =>
  new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      for (const angle of [0, 90, 180, 270]) {
        const result = tryDecodeQrAtAngle(img, angle)
        if (result) { resolve(result); return }
      }
      resolve(null)
    }
    img.onerror = () => resolve(null)
    img.src = `data:${mime};base64,${base64}`
  })

const fmtDateParts = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

export const buildReceiptFileName = (
  ekasaData: EkasaData | null | undefined,
  fallback: string,
  ekasaId?: string,
): string => {
  const sanitize = (s: string) => s.replace(/[/\\:*?"<>|,]/g, '').replace(/\s+/g, '-').trim()
  const ext  = fallback.split('.').pop()?.toLowerCase() ?? 'jpg'
  const org  = ekasaData?.organizationName as string | undefined
  const date = ekasaData?.createDate as string | undefined

  let datePart = ''
  if (date) {
    const m = String(date).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
    datePart = m
      ? `${m[3]}-${m[2]}-${m[1]}-${m[4]}-${m[5]}${m[6] ? `-${m[6]}` : ''}`
      : String(date).replace(/[T\s]/g, '-').replace(/:/g, '-')
  }

  if (org || datePart) {
    return ['blok', org ? sanitize(org) : '', datePart].filter(Boolean).join('-') + `.${ext}`
  }

  const num = ekasaData?.receiptNumber as string | undefined
  if (num) return `blok-${sanitize(num)}.${ext}`

  if (ekasaId) return `blok-${fmtDateParts(new Date())}-${ekasaId.slice(-8)}.${ext}`

  const tsMatch = fallback.match(/^blok-(\d{10,13})\.(.+)$/)
  if (tsMatch) return `blok-${fmtDateParts(new Date(Number(tsMatch[1])))}.${tsMatch[2]}`

  return fallback
}
