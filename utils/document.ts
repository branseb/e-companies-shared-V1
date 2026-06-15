export const sanitize = <T>(obj: T): T => {
  if (obj === undefined) return null as unknown as T
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sanitize) as unknown as T
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, sanitize(v)])
  ) as T
}

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

export const base64ToBlob = (base64: string, contentType: string): Blob => {
  const byteChars = atob(base64)
  const byteArrays: BlobPart[] = []
  for (let i = 0; i < byteChars.length; i += 1024) {
    const slice = byteChars.slice(i, i + 1024)
    byteArrays.push(new Uint8Array(Array.from(slice).map(c => c.charCodeAt(0))))
  }
  return new Blob(byteArrays, { type: contentType || 'application/octet-stream' })
}
