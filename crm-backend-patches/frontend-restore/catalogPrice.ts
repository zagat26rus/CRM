import { apiFetch } from '../api'

export async function fetchCatalogPrice(params: {
  brand: string
  model: string
  problemName: string
  problemId?: number
  partType?: string
}) {
  const brand = params.brand.trim()
  const model = params.model.trim()
  const problemName = params.problemName.trim()
  if (!brand || !model || !problemName) return null

  const qs = new URLSearchParams({
    brand,
    model,
    problemName,
    partType: params.partType === 'copy' ? 'copy' : 'original',
  })
  if (params.problemId) qs.set('problemId', String(params.problemId))

  const res = await apiFetch(`/catalog/price?${qs.toString()}`)
  if (!res.ok) return null
  const data = await res.json()
  if (!data.found || !(Number(data.priceMin) > 0)) return null

  const priceMin = Number(data.priceMin)
  return {
    priceMin,
    costPrice: Math.round(priceMin * 0.6),
    subtypeName: String(data.subtypeName || '').trim(),
  }
}
