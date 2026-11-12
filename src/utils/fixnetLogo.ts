import { FIXNET_RECEIPT_LOGO_SRC } from '../fixnetReceiptLogo'

let cachedLogoDataUrl: string | null = null

export async function getFixnetLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl

  try {
    const base = import.meta.env.BASE_URL || '/'
    const url = `${base}fixnet-receipt-logo.png`
    const res = await fetch(url)
    if (res.ok) {
      const blob = await res.blob()
      cachedLogoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || FIXNET_RECEIPT_LOGO_SRC))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
      return cachedLogoDataUrl
    }
  } catch {
    // fallback below
  }

  cachedLogoDataUrl = FIXNET_RECEIPT_LOGO_SRC
  return cachedLogoDataUrl
}
