export type SaleCategoryId = 'repair' | 'parts' | 'accessories' | 'tech'

export const SALE_CATEGORIES: Array<{ id: SaleCategoryId; label: string }> = [
  { id: 'repair', label: 'Ремонты' },
  { id: 'parts', label: 'Продажа запчастей' },
  { id: 'accessories', label: 'Продажа аксессуаров' },
  { id: 'tech', label: 'Продажа техники' },
]

export function saleCategoryLabel(id?: string | null) {
  return SALE_CATEGORIES.find((c) => c.id === id)?.label || 'Продажа техники'
}

export function defaultSaleCategoryForDocType(docType?: string | null): SaleCategoryId {
  if (docType === 'work_completion_act') return 'repair'
  if (docType === 'material_release') return 'parts'
  return 'tech'
}
