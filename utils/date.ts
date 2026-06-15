export const today = (): string => new Date().toISOString().split('T')[0]

export const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
