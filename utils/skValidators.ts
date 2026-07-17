export type ValidationResult = { valid: boolean; message?: string }

const ok: ValidationResult = { valid: true }
const fail = (message: string): ValidationResult => ({ valid: false, message })

export const isValidIco = (icoRaw: string | undefined | null): ValidationResult => {
  const ico = (icoRaw ?? '').replace(/\s/g, '')
  if (!ico) return ok
  if (!/^\d{8}$/.test(ico)) return fail('IČO musí mať 8 číslic')
  const digits = ico.split('').map(Number)
  const weights = [8, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0)
  const remainder = sum % 11
  const expected = remainder === 0 ? 1 : remainder === 1 ? 0 : 11 - remainder
  if (expected === digits[7]) return ok
  return fail('Neplatný kontrolný súčet IČO')
}

export const isValidDic = (dicRaw: string | undefined | null): ValidationResult => {
  const dic = (dicRaw ?? '').replace(/\s/g, '').toUpperCase()
  if (!dic) return ok
  if (!/^\d{8,10}$/.test(dic)) return fail('DIČ musí mať 8 až 10 číslic')
  return ok
}

export const isValidIcDph = (icDphRaw: string | undefined | null, dic?: string | null): ValidationResult => {
  const icDph = (icDphRaw ?? '').replace(/\s/g, '').toUpperCase()
  if (!icDph) return ok
  if (!/^(SK|CZ)\d{8,10}$/.test(icDph)) return fail('IČ DPH musí byť v tvare SK/CZ + 8 až 10 číslic')
  const dicNorm = (dic ?? '').replace(/\s/g, '')
  if (dicNorm && icDph.slice(2) !== dicNorm) return fail('IČ DPH nesedí s DIČ')
  return ok
}

export const isValidIban = (ibanRaw: string | undefined | null): ValidationResult => {
  const iban = (ibanRaw ?? '').replace(/\s/g, '').toUpperCase()
  if (!iban) return ok
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban) || iban.length < 15 || iban.length > 34) {
    return fail('Neplatný formát IBAN')
  }
  if ((iban.startsWith('SK') || iban.startsWith('CZ')) && iban.length !== 24) {
    return fail(`IBAN ${iban.slice(0, 2)} musí mať 24 znakov`)
  }
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55))
  let remainder = 0
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + Number(numeric[i])) % 97
  }
  if (remainder !== 1) return fail('Neplatný kontrolný súčet IBAN')
  return ok
}

export const checkVatTotals = (
  base: number | undefined | null,
  vat: number | undefined | null,
  total: number | undefined | null,
  rate?: number | null,
  tolerance = 0.02,
): ValidationResult => {
  const b = base ?? 0, v = vat ?? 0, t = total ?? 0
  if (!t) return ok
  if (Math.abs(b + v - t) > tolerance) return fail(`Základ + DPH (${(b + v).toFixed(2)}) nesedí s celkovou sumou (${t.toFixed(2)})`)
  if (rate != null && b > 0) {
    const expectedVat = (b * rate) / 100
    if (Math.abs(expectedVat - v) > Math.max(tolerance, expectedVat * 0.01)) {
      return fail(`DPH ${v.toFixed(2)} nesedí so sadzbou ${rate}% zo základu (očakávané ${expectedVat.toFixed(2)})`)
    }
  }
  return ok
}

export const checkDates = (
  issueDate?: string | null,
  dueDate?: string | null,
  deliveryDate?: string | null,
): ValidationResult => {
  const issue = issueDate ? new Date(issueDate) : null
  const due = dueDate ? new Date(dueDate) : null
  const delivery = deliveryDate ? new Date(deliveryDate) : null
  if (issue && due && due.getTime() < issue.getTime()) return fail('Splatnosť je pred dátumom vystavenia')
  if (issue && delivery) {
    const diffDays = Math.abs(delivery.getTime() - issue.getTime()) / 86_400_000
    if (diffDays > 60) return fail('Dátum dodania je príliš vzdialený od dátumu vystavenia')
  }
  return ok
}
