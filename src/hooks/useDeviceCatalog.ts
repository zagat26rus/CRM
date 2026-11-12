import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { sortModelsByRelease } from '../utils/modelSort'

export type CatalogBrand = { id: number; name: string }
export type CatalogModel = { id: number; brandId: number; name: string; deviceType: string; brandName?: string }
export type CatalogIssue = { code: string; name: string }

const FALLBACK_DEVICE_TYPES = ['Смартфон', 'Планшет', 'Ноутбук', 'ПК', 'Часы', 'Наушники', 'Приставка', 'Другое']

function mergeBrands(lists: CatalogBrand[][]): CatalogBrand[] {
  const map = new Map<string, CatalogBrand>()
  for (const list of lists) {
    for (const b of list) {
      const name = String(b.name || '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!map.has(key)) map.set(key, { id: b.id, name })
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

function mergeModels(lists: CatalogModel[][]): CatalogModel[] {
  const map = new Map<string, CatalogModel>()
  for (const list of lists) {
    for (const m of list) {
      const name = String(m.name || '').trim()
      if (!name) continue
      const brandName = String(m.brandName || '').trim()
      const deviceType = String(m.deviceType || 'Смартфон').trim()
      const key = `${brandName.toLowerCase()}|${name.toLowerCase()}|${deviceType.toLowerCase()}`
      if (!map.has(key)) {
        map.set(key, {
          id: m.id,
          brandId: m.brandId,
          name,
          deviceType,
          brandName: brandName || undefined,
        })
      }
    }
  }
  return sortModelsByRelease([...map.values()])
}

export function useDeviceCatalog() {
  const [deviceTypes, setDeviceTypes] = useState<string[]>(FALLBACK_DEVICE_TYPES)
  const [brands, setBrands] = useState<CatalogBrand[]>([])
  const [models, setModels] = useState<CatalogModel[]>([])
  const [contextIssues, setContextIssues] = useState<CatalogIssue[]>([])
  const [subtypeNames, setSubtypeNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [contextLoading, setContextLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [filtersRes, brandsRes, modelsRes] = await Promise.all([
        apiFetch('/catalog/filters'),
        apiFetch('/brands'),
        apiFetch('/brands/models'),
      ])

      let catalogBrands: CatalogBrand[] = []
      let catalogModels: CatalogModel[] = []
      let catalogTypes: string[] = []

      if (filtersRes.ok) {
        const data = await filtersRes.json()
        catalogTypes = Array.isArray(data.deviceTypes) ? data.deviceTypes : []
        catalogBrands = Array.isArray(data.brands) ? data.brands : []
        catalogModels = Array.isArray(data.models) ? data.models : []
      }

      let crmBrands: CatalogBrand[] = []
      let crmModels: CatalogModel[] = []
      if (brandsRes.ok) crmBrands = await brandsRes.json()
      if (modelsRes.ok) crmModels = await modelsRes.json()

      const mergedBrands = mergeBrands([catalogBrands, crmBrands])
      const mergedModels = mergeModels([catalogModels, crmModels])

      const typeSet = new Set<string>(FALLBACK_DEVICE_TYPES)
      for (const t of catalogTypes) if (t) typeSet.add(String(t))
      for (const m of mergedModels) if (m.deviceType) typeSet.add(m.deviceType)

      setBrands(mergedBrands)
      setModels(mergedModels)
      setDeviceTypes([...typeSet].sort((a, b) => a.localeCompare(b, 'ru')))
    } catch (e) {
      console.error(e)
      setError('Не удалось загрузить каталог устройств')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const findBrandId = useCallback(
    (brandName: string) => {
      const bn = brandName.trim().toLowerCase()
      if (!bn) return 0
      return brands.find((b) => b.name.toLowerCase() === bn)?.id || 0
    },
    [brands],
  )

  const findModelId = useCallback(
    (deviceType: string, brandName: string, modelName: string) => {
      const mn = modelName.trim().toLowerCase()
      if (!mn) return 0
      const brandId = findBrandId(brandName)
      const match = models.find((m) => {
        if (m.name.toLowerCase() !== mn) return false
        if (deviceType && m.deviceType !== deviceType) return false
        if (brandName.trim()) {
          const bn = brandName.trim().toLowerCase()
          return (m.brandName || '').toLowerCase() === bn || (brandId > 0 && m.brandId === brandId)
        }
        return true
      })
      return match?.id || 0
    },
    [brands, models, findBrandId],
  )

  const refreshContext = useCallback(
    async (opts: { deviceType?: string; brandName?: string; modelName?: string; issueCode?: string }) => {
      setContextLoading(true)
      try {
        const brandId = findBrandId(opts.brandName || '')
        const modelId = findModelId(opts.deviceType || '', opts.brandName || '', opts.modelName || '')
        const params = new URLSearchParams()
        if (opts.deviceType) params.set('deviceType', opts.deviceType)
        if (brandId > 0) params.set('brandId', String(brandId))
        if (modelId > 0) params.set('modelId', String(modelId))
        if (opts.issueCode) params.set('issueCode', opts.issueCode)

        const res = await apiFetch(`/catalog/filters?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          setContextIssues(Array.isArray(data.issues) ? data.issues : [])
        } else {
          setContextIssues([])
        }

        if (modelId > 0) {
          const priceParams = new URLSearchParams({
            modelId: String(modelId),
            includeMissing: '1',
            limit: '500',
          })
          if (opts.issueCode) priceParams.set('issueCode', opts.issueCode)
          const priceRes = await apiFetch(`/catalog/prices?${priceParams.toString()}`)
          if (priceRes.ok) {
            const priceData = await priceRes.json()
            const names = new Set<string>()
            for (const item of priceData.items || []) {
              const sn = String(item.subtypeName || '').trim()
              if (sn) names.add(sn)
            }
            setSubtypeNames([...names].sort((a, b) => a.localeCompare(b, 'ru')))
          } else {
            setSubtypeNames([])
          }
        } else {
          setSubtypeNames([])
        }
      } catch (e) {
        console.error(e)
      } finally {
        setContextLoading(false)
      }
    },
    [findBrandId, findModelId],
  )

  const brandNames = useCallback(
    (deviceType?: string) => {
      if (!deviceType) return brands.map((b) => b.name)
      const ids = new Set(models.filter((m) => m.deviceType === deviceType).map((m) => m.brandId))
      const names = new Set<string>()
      for (const b of brands) {
        if (ids.has(b.id)) names.add(b.name)
      }
      for (const m of models) {
        if (m.deviceType === deviceType && m.brandName) names.add(m.brandName)
      }
      if (names.size === 0) return brands.map((b) => b.name)
      return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
    },
    [brands, models],
  )

  const modelNames = useCallback(
    (deviceType?: string, brandName?: string) => {
      let list = models
      if (deviceType) list = list.filter((m) => m.deviceType === deviceType)
      if (brandName?.trim()) {
        const bn = brandName.trim().toLowerCase()
        const brand = brands.find((b) => b.name.toLowerCase() === bn)
        list = list.filter((m) => (m.brandName || '').toLowerCase() === bn || (brand && m.brandId === brand.id))
      }
      const names = [...new Set(list.map((m) => m.name).filter(Boolean))]
      return sortModelsByRelease(names.map((name) => ({ name, brandName: brandName || '' }))).map((m) => m.name)
    },
    [brands, models],
  )

  const issueNames = useCallback(
    (extra: string[] = []) => {
      const names = new Set<string>()
      for (const i of contextIssues) if (i.name) names.add(i.name)
      for (const e of extra) if (e?.trim()) names.add(e.trim())
      return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
    },
    [contextIssues],
  )

  const findIssueCode = useCallback(
    (issueName: string) => {
      const n = issueName.trim().toLowerCase()
      return contextIssues.find((i) => i.name.toLowerCase() === n)?.code || ''
    },
    [contextIssues],
  )

  return {
    deviceTypes,
    brands,
    models,
    contextIssues,
    subtypeNames,
    brandNames,
    modelNames,
    issueNames,
    findBrandId,
    findModelId,
    findIssueCode,
    refreshContext,
    loading,
    contextLoading,
    error,
    reload: load,
  }
}
