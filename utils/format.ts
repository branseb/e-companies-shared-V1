export const fmtCurrency = (n: number, currency: string): string =>
  new Intl.NumberFormat('sk-SK', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n)
