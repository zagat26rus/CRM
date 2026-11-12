import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import ComboInput from '../components/ComboInput'
import DeviceCatalogFields from '../components/DeviceCatalogFields'
import { useDeviceCatalog } from '../hooks/useDeviceCatalog'
import { apiFetch } from '../api'
import { useToast } from '../utils'
import { printRepairReceipt, renderRepairReceiptHtml } from '../repairReceiptTemplate'
import InvoiceTemplatesModal from './InvoiceTemplatesModal'
import DocumentMetaFields from '../components/DocumentMetaFields'
import GenericDocumentForm from '../components/GenericDocumentForm'
import { RECEPTION_ADDRESSES, PICKUP_ADDRESSES } from '../constants/addresses'
import { DOCUMENT_SCHEMAS, calcDocTotal, calcDocCost, emptyGenericDoc, emptyGenericDocForType, type GenericDocData } from '../documentFormSchemas'
import { printDocumentHtml, renderGenericDocumentHtml } from '../documentPrintTemplates'
import { getFixnetLogoDataUrl } from '../utils/fixnetLogo'
import { downloadDocumentPdf } from '../utils/downloadDocumentPdf'
import { notifyBalanceChanged } from '../utils/balanceEvents'
import { DOCUMENT_CATEGORIES, type DocumentType, type DocumentTypeId, findDocumentType, fallbackDocumentNumber, todayDocumentDate } from '../documentTypes'
type Tab = 'new' | 'history' | 'templates'

type HistoryRow = {
  id: number
  source: 'order' | 'document'
  docType: DocumentTypeId
  docTypeLabel?: string
  documentNumber: string
  client: string
  phone: string
  brand?: string
  model?: string
  status?: string
  total?: number
  costTotal?: number
  profit?: number
  price?: number
  costPrice?: number
  createdAt: string
  data?: GenericDocData
  documentDate?: string
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type SavedRecord = {
  kind: 'order' | 'document'
  id: number
  label: string
}

const PICKUP_ADDRESSES_LOCAL = PICKUP_ADDRESSES
const RECEPTION_ADDRESSES_LOCAL = RECEPTION_ADDRESSES

const INSPECTION_OPTS = ['не указано', 'по всей поверхности', 'верхняя часть', 'нижняя часть', 'левая сторона', 'правая сторона', 'точечно'] as const

const emptyForm = () => ({
  client: '', phone: '', email: '', clientAddress: RECEPTION_ADDRESSES_LOCAL[0],
  brand: '', model: '', deviceType: 'Смартфон', color: '', imei: '', serialNumber: '', equipment: '',
  problem: '', receiverNotes: '',
  inspection: {
    dirt: [] as string[], scratches: [] as string[], chips: [] as string[],
    wear: [] as string[], cracks: [] as string[],
    integrity: '', software: '', temperature: '', opErrors: '', other: ''
  },
  wishes: {
    social: '', loaner: '', storage: '',
    pickupAddress: PICKUP_ADDRESSES_LOCAL[0], prepaymentWish: ''
  },
  estimatedPrice: 0,
  costPrice: 0
})

async function attachPublicToken<T extends { id?: number; publicToken?: string | null }>(order: T): Promise<T> {
  if (order.publicToken || !order.id) return order
  try {
    const res = await apiFetch(`/invoices/repair/${order.id}`)
    if (res.ok) {
      const data = await res.json()
      const token = data?.order?.publicToken
      if (token) return { ...order, publicToken: token }
    }
  } catch {
    /* квитанция печатается и без QR */
  }
  return order
}

export default function Documentation() {
  const toast = useToast()
  const deviceCatalog = useDeviceCatalog()
  const [tab, setTab] = useState<Tab>('new')
  const [selectedDocType, setSelectedDocType] = useState<DocumentTypeId | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [orderId, setOrderId] = useState<number | null>(null)
  const [savedDocId, setSavedDocId] = useState<number | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState('')
  const orderIdRef = useRef<number | null>(null)
  const savedDocIdRef = useRef<number | null>(null)
  const savePromiseRef = useRef<Promise<number | null> | null>(null)
  const saveErrorRef = useRef('')
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedHistory, setSelectedHistory] = useState<Set<string>>(new Set())
  const [showTemplates, setShowTemplates] = useState(false)
  const [metaLoading, setMetaLoading] = useState(false)
  const [docMeta, setDocMeta] = useState({ documentNumber: '', documentDate: todayDocumentDate() })
  const [genericDoc, setGenericDoc] = useState(emptyGenericDoc())
  const [savedRecord, setSavedRecord] = useState<SavedRecord | null>(null)

  orderIdRef.current = orderId
  savedDocIdRef.current = savedDocId

  useEffect(() => {
    if (tab === 'history') loadHistory()
    else setSelectedHistory(new Set())
  }, [tab])

  useEffect(() => {
    if (tab !== 'new' || !selectedDocType) return
    if (selectedDocType === 'repair_receipt' && orderId) return
    if (selectedDocType !== 'repair_receipt' && savedDocId) return
    loadDocumentMeta(selectedDocType)
  }, [tab, selectedDocType, orderId, savedDocId])

  useEffect(() => {
    if (tab !== 'new' || !selectedDocType) return
    const timer = setTimeout(() => {
      if (selectedDocType === 'repair_receipt') void autoSaveRepair(true)
      else void autoSaveGeneric(true)
    }, 1200)
    return () => clearTimeout(timer)
  }, [form, genericDoc, docMeta, selectedDocType, tab])

  async function loadDocumentMeta(docType: DocumentTypeId) {
    const today = todayDocumentDate()
    setMetaLoading(true)
    try {
      const res = await apiFetch(`/documents/next-number?type=${encodeURIComponent(docType)}`)
      if (!res.ok) throw new Error('Не удалось получить номер')
      const data = await res.json()
      const date = data.documentDate || (data.date ? String(data.date).slice(0, 10) : today)
      setDocMeta((m) => ({
        documentNumber: data.documentNumber || m.documentNumber || fallbackDocumentNumber(docType),
        documentDate: date
      }))
    } catch (e: any) {
      setDocMeta((m) => ({
        documentNumber: m.documentNumber || fallbackDocumentNumber(docType),
        documentDate: m.documentDate || today
      }))
      toast.push(e?.message || 'Номер и дата подставлены локально — при необходимости измените вручную')
    } finally {
      setMetaLoading(false)
    }
  }

  async function loadHistory() {
    try {
      setLoadingHistory(true)
      const res = await apiFetch('/documents/history')
      if (!res.ok) throw new Error('Ошибка загрузки')
      setHistory(await res.json())
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось загрузить историю')
    } finally {
      setLoadingHistory(false)
    }
  }

  async function loadOrder(id: number) {
    try {
      const res = await apiFetch(`/orders/${id}`)
      if (!res.ok) throw new Error('Заказ не найден')
      const o = await res.json()
      setOrderId(o.id)
      orderIdRef.current = o.id
      setSavedDocId(null)
      savedDocIdRef.current = null
      setSaveStatus('saved')
      setForm({
        client: o.client || '',
        phone: o.phone || '',
        email: o.email || '',
        clientAddress: o.clientAddress || RECEPTION_ADDRESSES_LOCAL[0],
        brand: o.brand || '',
        model: o.model || '',
        deviceType: o.deviceType || 'Смартфон',
        color: o.color || '',
        imei: o.imei || '',
        serialNumber: o.serialNumber || '',
        equipment: o.equipment || '',
        problem: o.problem || o.description || '',
        receiverNotes: o.receiverNotes || '',
        inspection: { ...emptyForm().inspection, ...(o.inspection || {}) },
        wishes: { ...emptyForm().wishes, ...(o.wishes || {}) },
        estimatedPrice: Number(o.price) || 0,
        costPrice: Number(o.costPrice) || 0
      })
      setDocMeta({
        documentNumber: o.documentNumber || '',
        documentDate: o.createdAt ? String(o.createdAt).slice(0, 10) : todayDocumentDate()
      })
      setTab('new')
      setSelectedDocType('repair_receipt')
      toast.push('Квитанция загружена для редактирования')
    } catch (e: any) {
      toast.push(e?.message || 'Ошибка загрузки')
    }
  }

  function toggleInspection(key: keyof typeof form.inspection, opt: string) {
    if (['integrity', 'software', 'temperature', 'opErrors', 'other'].includes(key)) return
    setForm((prev) => {
      const next = { ...prev.inspection }
      const arr = Array.isArray((next as any)[key]) ? [...(next as any)[key]] : []
      const idx = arr.indexOf(opt)
      if (opt === 'не указано') (next as any)[key] = ['не указано']
      else {
        const filtered = arr.filter((x) => x !== 'не указано')
        if (idx >= 0) filtered.splice(idx, 1)
        else filtered.push(opt)
        ;(next as any)[key] = filtered.length ? filtered : ['не указано']
      }
      return { ...prev, inspection: next }
    })
  }

  function problemText() {
    const p = form.problem.trim()
    if (p) return p
    const notes = form.receiverNotes.trim()
    if (notes) return notes
    const device = [form.brand, form.model].filter(Boolean).join(' ')
    return device ? `Приём в ремонт: ${device}` : 'Приём в ремонт'
  }

  function buildRepairPrintOrder() {
    const problem = problemText()
    return {
      id: orderIdRef.current || 0,
      documentNumber: docMeta.documentNumber,
      client: form.client,
      phone: form.phone,
      email: form.email,
      clientAddress: form.clientAddress,
      brand: form.brand,
      model: form.model,
      color: form.color,
      imei: form.imei,
      serialNumber: form.serialNumber,
      equipment: form.equipment,
      problem,
      description: form.receiverNotes,
      receiverNotes: form.receiverNotes,
      inspection: form.inspection,
      wishes: form.wishes,
      problems: [{ problemName: problem, problemDescription: form.receiverNotes }]
    }
  }

  async function parseApiError(res: Response, fallback: string) {
    const err = await res.json().catch(() => ({}))
    const msg = String(err.error || '').trim()
    if (res.status === 401) return 'Сессия истекла — войдите в CRM заново'
    if (msg) return msg
    if (res.status === 404) return 'Сервер устарел или не запущен. Перезапустите backend: npm start в папке back'
    return fallback
  }

  async function autoSaveRepair(silent = true): Promise<number | null> {
    if (!form.client.trim() || !form.phone.trim()) return null
    if (savePromiseRef.current) return savePromiseRef.current

    const problem = problemText()
    const task = (async () => {
      setSaveStatus('saving')
      setSaveError('')
    saveErrorRef.current = ''
      saveErrorRef.current = ''
      try {
        const payload = {
          client: form.client.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          clientAddress: form.clientAddress,
          brand: form.brand,
          model: form.model,
          deviceType: form.deviceType,
          color: form.color,
          imei: form.imei,
          serialNumber: form.serialNumber,
          equipment: form.equipment,
          problem,
          problems: [{ problemName: problem, price: Number(form.estimatedPrice) || 0, costPrice: Number(form.costPrice) || 0 }],
          description: problem,
          receiverNotes: form.receiverNotes,
          inspection: form.inspection,
          wishes: form.wishes,
          documentNumber: docMeta.documentNumber,
          status: 'Создана',
          price: Number(form.estimatedPrice) || 0,
          costPrice: Number(form.costPrice) || 0
        }
        const currentId = orderIdRef.current
        const res = currentId
          ? await apiFetch(`/orders/${currentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          : await apiFetch('/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) throw new Error(await parseApiError(res, 'Ошибка сохранения'))
        const saved = await res.json()
        setOrderId(saved.id)
        orderIdRef.current = saved.id
        if (saved.documentNumber) {
          setDocMeta((m) => ({ ...m, documentNumber: saved.documentNumber }))
        }
        setSaveStatus('saved')
        setSaveError('')
    saveErrorRef.current = ''
        saveErrorRef.current = ''
        setSavedRecord({
          kind: 'order',
          id: saved.id,
          label: `Заказ №${saved.id}, квитанция ${saved.documentNumber || docMeta.documentNumber}`
        })
        if (!silent) toast.push('Квитанция сохранена — заказ создан в разделе «Заказы»')
        return saved.id
      } catch (e: any) {
        const message = e?.message === 'Failed to fetch'
          ? 'Нет связи с сервером. Запустите backend: npm start в папке back'
          : (e?.message || 'Не удалось сохранить')
        setSaveStatus('error')
        setSaveError(message)
        saveErrorRef.current = message
        if (!silent) toast.push(message)
        return null
      } finally {
        savePromiseRef.current = null
      }
    })()

    savePromiseRef.current = task
    return task
  }

  async function autoSaveGeneric(silent = true, force = false, syncPayments = false): Promise<number | null> {
    if (!selectedDocType || selectedDocType === 'repair_receipt') return null
    const hasContent = Boolean(
      genericDoc.client.trim() ||
      genericDoc.phone.trim() ||
      genericDoc.lines.some((l) => l.name.trim())
    )
    if (!force && !hasContent) return null
    if (savePromiseRef.current) return savePromiseRef.current

    const task = (async () => {
      setSaveStatus('saving')
      setSaveError('')
    saveErrorRef.current = ''
      saveErrorRef.current = ''
      try {
        const body = {
          docType: selectedDocType,
          documentNumber: docMeta.documentNumber,
          documentDate: docMeta.documentDate,
          client: genericDoc.client,
          phone: genericDoc.phone,
          total: calcDocTotal(genericDoc),
          costTotal: calcDocCost(genericDoc),
          data: genericDoc,
          syncPayments,
        }
        const currentId = savedDocIdRef.current
        const res = currentId
          ? await apiFetch(`/documents/${currentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          : await apiFetch('/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) throw new Error(await parseApiError(res, 'Ошибка сохранения'))
        const saved = await res.json()
        setSavedDocId(saved.id)
        savedDocIdRef.current = saved.id
        if (saved.documentNumber) {
          setDocMeta((m) => ({ ...m, documentNumber: saved.documentNumber }))
        }
        setSaveStatus('saved')
        setSaveError('')
    saveErrorRef.current = ''
        saveErrorRef.current = ''
        const docTitle = selectedDocType ? findDocumentType(selectedDocType)?.title : 'Документ'
        setSavedRecord({
          kind: 'document',
          id: saved.id,
          label: `${docTitle || 'Документ'} ${saved.documentNumber || docMeta.documentNumber}`
        })
        if (!silent) toast.push('Документ сохранён — см. вкладку «История»')
        return saved.id
      } catch (e: any) {
        const message = e?.message === 'Failed to fetch'
          ? 'Нет связи с сервером. Запустите backend: npm start в папке back'
          : (e?.message || 'Не удалось сохранить')
        setSaveStatus('error')
        setSaveError(message)
        saveErrorRef.current = message
        if (!silent) toast.push(message)
        return null
      } finally {
        savePromiseRef.current = null
      }
    })()

    savePromiseRef.current = task
    return task
  }

  async function printReceipt(id?: number) {
    try {
      let orderData = buildRepairPrintOrder()

      if (!id) {
        if (!form.client.trim() || !form.phone.trim()) {
          toast.push('Заполните ФИО и телефон — документ сохранится в раздел «Заказы»')
          return
        }
        const savedId = await autoSaveRepair(false)
        if (!savedId) {
          toast.push(saveErrorRef.current || 'Не удалось сохранить документ. Печать отменена.')
          return
        }
        orderData = { ...buildRepairPrintOrder(), id: savedId }
        const num = docMeta.documentNumber || `№${savedId}`
        setSavedRecord({ kind: 'order', id: savedId, label: `Заказ №${savedId}, квитанция ${num}` })
      } else {
        const res = await apiFetch(`/orders/${id}`)
        if (!res.ok) throw new Error('Не удалось загрузить данные')
        const o = await res.json()
        orderData = {
          ...o,
          inspection: typeof o.inspection === 'string' ? JSON.parse(o.inspection || '{}') : o.inspection,
          wishes: typeof o.wishes === 'string' ? JSON.parse(o.wishes || '{}') : o.wishes,
          problems: o.problems || []
        }
      }

      const html = renderRepairReceiptHtml({
        order: await attachPublicToken(orderData),
        documentDate: docMeta.documentDate
      })
      if (!printRepairReceipt(html)) {
        toast.push('Разрешите всплывающие окна для печати')
        return
      }

      if (!id) {
        toast.push(`Сохранено в «Заказы» (№${orderData.id}). Документ отправлен на печать.`)
      } else {
        toast.push('Документ отправлен на печать')
      }
      void loadHistory()
    } catch (e: any) {
      toast.push(e?.message || 'Ошибка печати')
    }
  }

  async function printGenericDocument() {
    if (!selectedDocType || selectedDocType === 'repair_receipt') return

    const savedId = await autoSaveGeneric(false, true, true)
    if (!savedId) {
      toast.push(saveErrorRef.current || 'Не удалось сохранить документ. Печать отменена.')
      return
    }

    notifyBalanceChanged()

    const docTitle = findDocumentType(selectedDocType)?.title || 'Документ'
    const num = docMeta.documentNumber || `№${savedId}`
    setSavedRecord({ kind: 'document', id: savedId, label: `${docTitle} ${num}` })

    const logoSrc = selectedDocType === 'cash_receipt' ? await getFixnetLogoDataUrl() : undefined

    const html = renderGenericDocumentHtml({
      docType: selectedDocType,
      documentNumber: docMeta.documentNumber,
      documentDate: docMeta.documentDate,
      data: genericDoc,
      logoSrc,
    })
    if (!printDocumentHtml(html)) {
      toast.push('Разрешите всплывающие окна для печати')
      return
    }

    toast.push(`Сохранено в «История». Проведено в платежи. Документ отправлен на печать.`)
    void loadHistory()
  }

  async function saveGenericDocumentToDevice() {
    if (!selectedDocType || selectedDocType === 'repair_receipt') return

    const savedId = await autoSaveGeneric(false, true, false)
    if (!savedId) {
      toast.push(saveErrorRef.current || 'Не удалось сохранить документ.')
      return
    }

    const docTitle = findDocumentType(selectedDocType)?.title || 'Документ'
    const num = docMeta.documentNumber || `№${savedId}`
    setSavedRecord({ kind: 'document', id: savedId, label: `${docTitle} ${num}` })

    const logoSrc = selectedDocType === 'cash_receipt' ? await getFixnetLogoDataUrl() : undefined
    const html = renderGenericDocumentHtml({
      docType: selectedDocType,
      documentNumber: docMeta.documentNumber,
      documentDate: docMeta.documentDate,
      data: genericDoc,
      logoSrc,
    })

    const fileName = `${docMeta.documentNumber || `doc-${savedId}`}.pdf`
    try {
      toast.push('Формируем PDF…')
      await downloadDocumentPdf(html, fileName)
      toast.push('Документ сохранён в CRM и скачан на устройство (PDF)')
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось сохранить PDF')
      return
    }
    void loadHistory()
  }

  async function saveRepairReceiptToDevice() {
    try {
      if (!form.client.trim() || !form.phone.trim()) {
        toast.push('Заполните ФИО и телефон перед сохранением')
        return
      }

      const savedId = await autoSaveRepair(false)
      if (!savedId) {
        toast.push(saveErrorRef.current || 'Не удалось сохранить документ.')
        return
      }

      const orderData = { ...buildRepairPrintOrder(), id: savedId }
      const html = renderRepairReceiptHtml({
        order: await attachPublicToken(orderData),
        documentDate: docMeta.documentDate,
      })

      const fileName = `${docMeta.documentNumber || `repair-${savedId}`}.pdf`
      try {
        toast.push('Формируем PDF…')
        await downloadDocumentPdf(html, fileName)
      } catch (e: any) {
        toast.push(e?.message || 'Не удалось сохранить PDF')
        return
      }
      const num = docMeta.documentNumber || `№${savedId}`
      setSavedRecord({ kind: 'order', id: savedId, label: `Заказ №${savedId}, квитанция ${num}` })
      toast.push('Квитанция сохранена в CRM и скачана на устройство (PDF)')
      void loadHistory()
    } catch (e: any) {
      toast.push(e?.message || 'Ошибка сохранения')
    }
  }

  async function loadSavedDocument(id: number) {
    try {
      const res = await apiFetch(`/documents/${id}`)
      if (!res.ok) throw new Error('Документ не найден')
      const d = await res.json()
      setSavedDocId(d.id)
      savedDocIdRef.current = d.id
      setSelectedDocType(d.docType)
      setGenericDoc({ ...emptyGenericDoc(), ...(d.data || {}) })
      setDocMeta({
        documentNumber: d.documentNumber || '',
        documentDate: d.documentDate || todayDocumentDate()
      })
      setTab('new')
      toast.push('Документ загружен')
    } catch (e: any) {
      toast.push(e?.message || 'Ошибка загрузки')
    }
  }

  function historyRowKey(row: HistoryRow) {
    return `${row.source}-${row.id}`
  }

  async function buildHistoryPrintPayload(row: HistoryRow): Promise<{ html: string; fileName: string }> {
    if (row.source === 'order') {
      const res = await apiFetch(`/orders/${row.id}`)
      if (!res.ok) throw new Error('Не удалось загрузить квитанцию')
      const o = await res.json()
      const orderData = {
        ...o,
        inspection: typeof o.inspection === 'string' ? JSON.parse(o.inspection || '{}') : o.inspection,
        wishes: typeof o.wishes === 'string' ? JSON.parse(o.wishes || '{}') : o.wishes,
        problems: o.problems || []
      }
      const date = row.createdAt ? String(row.createdAt).slice(0, 10) : todayDocumentDate()
      const html = renderRepairReceiptHtml({ order: await attachPublicToken(orderData), documentDate: date })
      return { html, fileName: `${row.documentNumber || `repair-${row.id}`}.pdf` }
    }

    const res = await apiFetch(`/documents/${row.id}`)
    if (!res.ok) throw new Error('Не удалось загрузить документ')
    const d = await res.json()
    const logoSrc = d.docType === 'cash_receipt' ? await getFixnetLogoDataUrl() : undefined
    const html = renderGenericDocumentHtml({
      docType: d.docType,
      documentNumber: d.documentNumber,
      documentDate: d.documentDate || (row.createdAt ? String(row.createdAt).slice(0, 10) : todayDocumentDate()),
      data: { ...emptyGenericDoc(), ...(d.data || {}) },
      logoSrc,
    })
    return { html, fileName: `${d.documentNumber || `doc-${d.id}`}.pdf` }
  }

  function toggleHistorySelection(row: HistoryRow) {
    const key = historyRowKey(row)
    setSelectedHistory((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelectAllHistory() {
    setSelectedHistory((prev) => (
      prev.size === history.length ? new Set() : new Set(history.map(historyRowKey))
    ))
  }

  async function deleteHistoryRows(rows: HistoryRow[]) {
    if (rows.length === 0) return
    const label = rows.length === 1
      ? `Удалить «${rows[0].documentNumber || rows[0].docTypeLabel}» из истории? Связанные платежи будут удалены.`
      : `Удалить выбранные документы (${rows.length})? Связанные платежи будут удалены.`
    if (!window.confirm(label)) return

    try {
      for (const r of rows) {
        const endpoint = r.source === 'order' ? `/orders/${r.id}` : `/documents/${r.id}`
        const res = await apiFetch(endpoint, { method: 'DELETE' })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || `Не удалось удалить ${r.documentNumber || r.docTypeLabel || 'документ'}`)
        }
      }
      const keys = new Set(rows.map(historyRowKey))
      setSelectedHistory((prev) => {
        const next = new Set(prev)
        keys.forEach((k) => next.delete(k))
        return next
      })
      notifyBalanceChanged()
      toast.push(rows.length === 1 ? 'Документ удалён из истории' : `Удалено документов: ${rows.length}`)
      void loadHistory()
    } catch (e: any) {
      toast.push(e?.message || 'Ошибка удаления')
    }
  }

  async function deleteSelectedHistory() {
    const rows = history.filter((r) => selectedHistory.has(historyRowKey(r)))
    await deleteHistoryRows(rows)
  }

  function openHistoryItem(row: HistoryRow) {
    if (row.source === 'order') loadOrder(row.id)
    else loadSavedDocument(row.id)
  }

  async function printHistoryItem(row: HistoryRow) {
    try {
      const { html } = await buildHistoryPrintPayload(row)
      const ok = row.source === 'order' ? printRepairReceipt(html) : printDocumentHtml(html)
      if (!ok) {
        toast.push('Разрешите всплывающие окна для печати')
        return
      }
      toast.push('Документ отправлен на печать')
    } catch (e: any) {
      toast.push(e?.message || 'Ошибка печати')
    }
  }

  async function saveHistoryItem(row: HistoryRow) {
    try {
      toast.push('Формируем PDF…')
      const { html, fileName } = await buildHistoryPrintPayload(row)
      await downloadDocumentPdf(html, fileName)
      toast.push('PDF сохранён на устройство')
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось сохранить PDF')
    }
  }

  function saveStatusLabel() {
    if (saveStatus === 'saving') return 'Сохранение…'
    if (saveStatus === 'saved') return 'Автосохранено'
    if (saveStatus === 'error') return saveError || 'Ошибка сохранения'
    return ''
  }

  function resetForm() {
    setOrderId(null)
    orderIdRef.current = null
    setSavedDocId(null)
    savedDocIdRef.current = null
    setSaveStatus('idle')
    setSaveError('')
    saveErrorRef.current = ''
    setSavedRecord(null)
    setForm(emptyForm())
    setGenericDoc(emptyGenericDoc())
    if (selectedDocType) loadDocumentMeta(selectedDocType)
  }

  function openNewDocumentTab() {
    setTab('new')
    setSelectedDocType(null)
    setOrderId(null)
    orderIdRef.current = null
    setSavedDocId(null)
    savedDocIdRef.current = null
    setSaveStatus('idle')
    setSaveError('')
    saveErrorRef.current = ''
    setSavedRecord(null)
    setForm(emptyForm())
    setGenericDoc(emptyGenericDoc())
    setDocMeta({ documentNumber: '', documentDate: todayDocumentDate() })
  }

  function selectDocumentType(doc: DocumentType) {
    setSelectedDocType(doc.id)
    setOrderId(null)
    orderIdRef.current = null
    setSavedDocId(null)
    savedDocIdRef.current = null
    setSaveStatus('idle')
    setSaveError('')
    saveErrorRef.current = ''
    setSavedRecord(null)
    setForm(emptyForm())
    setGenericDoc(emptyGenericDocForType(doc.id))
    setDocMeta({ documentNumber: '', documentDate: todayDocumentDate() })
  }

  function backToDocumentPicker() {
    setSelectedDocType(null)
    setOrderId(null)
    orderIdRef.current = null
    setSavedDocId(null)
    savedDocIdRef.current = null
    setSaveStatus('idle')
    setSaveError('')
    saveErrorRef.current = ''
    setSavedRecord(null)
    setForm(emptyForm())
    setGenericDoc(emptyGenericDoc())
    setDocMeta({ documentNumber: '', documentDate: todayDocumentDate() })
  }
  const activeDoc = selectedDocType ? findDocumentType(selectedDocType) : null

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h1 className='text-xl font-bold'>Документация</h1>
        <div className='flex gap-2 flex-wrap'>
          {(['new', 'history', 'templates'] as Tab[]).map((t) => (
            <button
              key={t}
              className={'btn ' + (tab === t ? 'btn-primary' : 'btn-ghost')}
              onClick={() => t === 'templates' ? setShowTemplates(true) : t === 'new' ? openNewDocumentTab() : setTab(t)}
            >
              {t === 'new' ? 'Новый документ' : t === 'history' ? 'История' : 'Шаблоны'}
            </button>
          ))}
          {tab === 'history' && (
            <button
              type='button'
              className='btn btn-ghost'
              disabled={selectedHistory.size === 0 || loadingHistory}
              onClick={() => void deleteSelectedHistory()}
            >
              Удалить выбранное{selectedHistory.size > 0 ? ` (${selectedHistory.size})` : ''}
            </button>
          )}
        </div>
      </div>

      {tab === 'new' && !selectedDocType && (
        <div className='space-y-6'>
          <p className='text-sm text-muted'>
            Выберите вид документа. Список составлен по типовым формам 1С: квитанции, чеки, накладные, акты и др.
          </p>
          {DOCUMENT_CATEGORIES.map((category) => (
            <div key={category.id}>
              <h2 className='text-sm font-semibold text-muted uppercase tracking-wide mb-3'>{category.title}</h2>
              <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'>
                {category.items.map((doc) => (
                  <button
                    key={doc.id}
                    type='button'
                    onClick={() => selectDocumentType(doc)}
                    className='card p-4 text-left transition hover:border-primary/60 hover:bg-surface border-primary/30'
                  >
                    <div className='flex items-start justify-between gap-2 mb-2'>
                      <span className='font-semibold'>{doc.title}</span>
                    </div>                    <p className='text-sm text-muted mb-2'>{doc.description}</p>
                    <p className='text-xs text-muted/80'>{doc.oneCName}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'new' && selectedDocType && (
        <div className='space-y-4'>
          <div className='flex flex-wrap items-center gap-3'>
            <button type='button' className='btn btn-ghost text-sm' onClick={backToDocumentPicker}>
              ← Выбор документа
            </button>
            <span className='text-sm text-muted'>{activeDoc?.title}</span>
            {saveStatusLabel() && (
              <span
                title={saveStatus === 'error' ? saveError : undefined}
                className={`text-xs px-2 py-1 rounded-full max-w-[min(100%,28rem)] truncate ${saveStatus === 'error' ? 'bg-red-500/20 text-red-400' : saveStatus === 'saving' ? 'bg-surface text-muted' : 'bg-primary/15 text-primary'}`}
              >
                {saveStatusLabel()}
              </span>
            )}
          </div>

          <DocumentMetaFields
            documentNumber={docMeta.documentNumber}
            documentDate={docMeta.documentDate}
            onDocumentNumberChange={(documentNumber) => setDocMeta({ ...docMeta, documentNumber })}
            onDocumentDateChange={(documentDate) => setDocMeta({ ...docMeta, documentDate })}            onAutoFill={() => selectedDocType && loadDocumentMeta(selectedDocType)}
            loading={metaLoading}
            extra={orderId && selectedDocType === 'repair_receipt' ? (
              <div>
                <label className='label'>№ заявки (отслеживание на сайте)</label>
                <input className='input' value={String(orderId)} readOnly />
              </div>
            ) : undefined}
          />

          {savedRecord && (
            <div className='card p-3 border-primary/40 bg-primary/10 flex flex-wrap items-center justify-between gap-2'>
              <p className='text-sm'>
                <span className='font-medium'>Сохранено:</span> {savedRecord.label}
              </p>
              <div className='flex flex-wrap gap-2'>
                {savedRecord.kind === 'order' ? (
                  <Link to='/orders' className='btn btn-ghost text-sm'>Открыть «Заказы»</Link>
                ) : (
                  <button type='button' className='btn btn-ghost text-sm' onClick={() => setTab('history')}>Открыть «История»</button>
                )}
                <button
                  type='button'
                  className='btn btn-ghost text-sm'
                  onClick={() => savedRecord.kind === 'order' ? loadOrder(savedRecord.id) : loadSavedDocument(savedRecord.id)}
                >
                  Открыть документ
                </button>
              </div>
            </div>
          )}

          {selectedDocType === 'repair_receipt' ? (
        <div className='space-y-4'>
          <div className='card p-4'>
            <h2 className='font-semibold mb-3'>Клиент</h2>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              <div><label className='label'>ФИО *</label><input className='input' value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} /></div>
              <div><label className='label'>Телефон *</label><input className='input' value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className='label'>Email</label><input className='input' value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className='label'>Соцсеть/мессенджер</label><input className='input' value={form.wishes.social} onChange={(e) => setForm({ ...form, wishes: { ...form.wishes, social: e.target.value } })} /></div>
              <div className='md:col-span-2'>
                <label className='label'>Адрес приемки</label>
                <ComboInput
                  value={form.clientAddress}
                  options={RECEPTION_ADDRESSES_LOCAL}
                  placeholder='Выберите из списка или введите адрес'
                  onChange={(clientAddress) => setForm({ ...form, clientAddress })}
                />
                <p className='text-xs text-muted mt-1'>Можно выбрать из списка или ввести вручную</p>
              </div>
            </div>
          </div>

          <div className='card p-4'>
            <h2 className='font-semibold mb-3'>Устройство</h2>
            <DeviceCatalogFields
              catalog={deviceCatalog}
              deviceType={form.deviceType}
              brand={form.brand}
              model={form.model}
              onDeviceTypeChange={(deviceType) => setForm({ ...form, deviceType })}
              onBrandChange={(brand) => setForm({ ...form, brand })}
              onModelChange={(model) => setForm({ ...form, model })}
            />
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3 mt-3'>
              <div><label className='label'>Цвет</label><input className='input' value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
              <div><label className='label'>Серийный номер</label><input className='input' value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></div>
              <div><label className='label'>IMEI</label><input className='input' value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} /></div>
              <div><label className='label'>Доп. оборудование</label><input className='input' value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} /></div>
              <div className='md:col-span-2'><label className='label'>Проблема со слов клиента</label><textarea className='textarea' rows={2} value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} /></div>
              <div className='md:col-span-2'><label className='label'>Предварительная диагностика</label><textarea className='textarea' rows={2} value={form.receiverNotes} onChange={(e) => setForm({ ...form, receiverNotes: e.target.value })} /></div>
            </div>
          </div>

          <div className='card p-4'>
            <h2 className='font-semibold mb-3'>Состояние устройства</h2>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {(['dirt', 'scratches', 'chips', 'wear', 'cracks'] as const).map((key) => (
                <div key={key}>
                  <div className='label'>{({ dirt: 'Загрязнения', scratches: 'Царапины', chips: 'Сколы', wear: 'Потертости', cracks: 'Трещины' })[key]}</div>
                  <div className='flex flex-wrap gap-1'>
                    {INSPECTION_OPTS.map((opt) => (
                      <label key={opt} className='flex items-center gap-1 text-xs px-2 py-1 rounded border border-border cursor-pointer'>
                        <input type='checkbox' checked={(form.inspection[key] as string[]).includes(opt)} onChange={() => toggleInspection(key, opt)} />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {(['integrity', 'software', 'temperature', 'opErrors', 'other'] as const).map((key) => (
                <div key={key}>
                  <div className='label'>{({ integrity: 'Целостность', software: 'Корректность работы ПО', temperature: 'Температура', opErrors: 'Операционные ошибки', other: 'Иное' })[key]}</div>
                  <input className='input' value={form.inspection[key]} onChange={(e) => setForm({ ...form, inspection: { ...form.inspection, [key]: e.target.value } })} />
                </div>
              ))}
            </div>
          </div>

          <div className='card p-4'>
            <h2 className='font-semibold mb-3'>Пожелания клиента</h2>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              <div><label className='label'>Подменный телефон</label><input className='input' value={form.wishes.loaner} onChange={(e) => setForm({ ...form, wishes: { ...form.wishes, loaner: e.target.value } })} /></div>
              <div><label className='label'>Хранение</label><input className='input' value={form.wishes.storage} onChange={(e) => setForm({ ...form, wishes: { ...form.wishes, storage: e.target.value } })} /></div>
              <div><label className='label'>Адрес выдачи</label>
                <ComboInput
                  value={form.wishes.pickupAddress}
                  options={PICKUP_ADDRESSES_LOCAL}
                  placeholder='Выберите из списка или введите адрес'
                  onChange={(pickupAddress) => setForm({ ...form, wishes: { ...form.wishes, pickupAddress } })}
                />
                <p className='text-xs text-muted mt-1'>Можно выбрать из списка или ввести вручную</p>
              </div>
              <div>
                <label className='label'>Предоплата</label>
                <input className='input' value={form.wishes.prepaymentWish} onChange={(e) => setForm({ ...form, wishes: { ...form.wishes, prepaymentWish: e.target.value } })} />
              </div>
            </div>
          </div>

          <div className='card p-4'>
            <h2 className='font-semibold mb-3'>Стоимость работ (только CRM)</h2>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
              <div>
                <label className='label'>Предварительная стоимость, ₽</label>
                <input
                  type='number'
                  className='input'
                  min={0}
                  step='0.01'
                  value={form.estimatedPrice || ''}
                  onChange={(e) => setForm({ ...form, estimatedPrice: Number(e.target.value) || 0 })}
                  placeholder='0'
                />
              </div>
              <div>
                <label className='label'>Себестоимость / расходы, ₽</label>
                <input
                  type='number'
                  className='input border-primary/30'
                  min={0}
                  step='0.01'
                  value={form.costPrice || ''}
                  onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) || 0 })}
                  placeholder='0'
                />
                <p className='text-xs text-muted mt-1'>Запчасти, закупка — для расчёта чистой прибыли в CRM</p>
              </div>
            </div>
            <div className='mt-4 p-4 bg-surface/50 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm'>
              <div>
                <div className='text-muted'>Оборот</div>
                <div className='font-bold text-lg'>{(Number(form.estimatedPrice) || 0).toLocaleString('ru-RU')} ₽</div>
              </div>
              <div>
                <div className='text-muted'>Расходы</div>
                <div className='font-bold text-lg'>{(Number(form.costPrice) || 0).toLocaleString('ru-RU')} ₽</div>
              </div>
              <div>
                <div className='text-muted'>Чистая прибыль</div>
                <div className={`font-bold text-lg ${(Number(form.estimatedPrice) - Number(form.costPrice)) >= 0 ? 'text-success' : 'text-danger'}`}>
                  {((Number(form.estimatedPrice) || 0) - (Number(form.costPrice) || 0)).toLocaleString('ru-RU')} ₽
                </div>
              </div>
            </div>
            <p className='text-xs text-muted mt-2'>Не попадает в печатную квитанцию. Учитывается в заказе и аналитике CRM.</p>
          </div>

          <div className='flex flex-wrap gap-2'>
            <button type='button' className='btn btn-primary' onClick={() => printReceipt()}>Печать</button>
            <button type='button' className='btn btn-ghost' onClick={() => void saveRepairReceiptToDevice()}>Сохранить на устройство</button>
            <button type='button' className='btn btn-ghost' onClick={resetForm}>Очистить форму</button>
            <button type='button' className='btn btn-ghost' onClick={backToDocumentPicker}>Новый документ</button>
          </div>
        </div>
          ) : selectedDocType && DOCUMENT_SCHEMAS[selectedDocType] ? (
            <>
              <GenericDocumentForm
                schema={DOCUMENT_SCHEMAS[selectedDocType]}
                data={genericDoc}
                onChange={setGenericDoc}
                deviceCatalog={deviceCatalog}
              />
              <div className='flex flex-wrap gap-2'>
                <button type='button' className='btn btn-primary' onClick={() => printGenericDocument()}>Печать</button>
                <button type='button' className='btn btn-ghost' onClick={() => void saveGenericDocumentToDevice()}>Сохранить на устройство</button>
                <button type='button' className='btn btn-ghost' onClick={resetForm}>Очистить форму</button>
                <button type='button' className='btn btn-ghost' onClick={backToDocumentPicker}>Новый документ</button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {tab === 'history' && (
        <div className='card overflow-auto'>
          {loadingHistory ? <div className='p-4 text-muted'>Загрузка…</div> : (
            <table className='table'>
              <thead>
                <tr>
                  <th className='w-10'>
                    <input
                      type='checkbox'
                      aria-label='Выбрать все'
                      checked={history.length > 0 && selectedHistory.size === history.length}
                      onChange={toggleSelectAllHistory}
                    />
                  </th>
                  <th>Тип</th><th>№ док.</th><th>Дата</th><th>Клиент</th><th>Оборот</th><th>Расходы</th><th>Прибыль</th><th>Статус</th><th></th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? <tr><td colSpan={10} className='text-muted p-4'>Документов пока нет</td></tr> : history.map((r) => {
                  const revenue = r.source === 'order' ? (Number(r.price) || 0) : (Number(r.total) || 0)
                  const cost = r.source === 'order' ? (Number(r.costPrice) || 0) : (Number(r.costTotal) || 0)
                  const profit = revenue - cost
                  const rowKey = historyRowKey(r)
                  return (
                  <tr key={rowKey}>
                    <td>
                      <input
                        type='checkbox'
                        aria-label={`Выбрать ${r.documentNumber || r.docTypeLabel}`}
                        checked={selectedHistory.has(rowKey)}
                        onChange={() => toggleHistorySelection(r)}
                      />
                    </td>
                    <td className='text-xs'>{r.docTypeLabel || r.docType}</td>
                    <td>{r.documentNumber || '—'}</td>
                    <td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString('ru-RU') : '—'}</td>
                    <td>{r.client || '—'}</td>
                    <td className='tabular-nums'>{revenue > 0 ? `${revenue.toLocaleString('ru-RU')} ₽` : '—'}</td>
                    <td className='tabular-nums text-muted'>{cost > 0 ? `${cost.toLocaleString('ru-RU')} ₽` : '—'}</td>
                    <td className={`tabular-nums font-medium ${profit > 0 ? 'text-success' : profit < 0 ? 'text-danger' : ''}`}>
                      {revenue > 0 || cost > 0 ? `${profit.toLocaleString('ru-RU')} ₽` : '—'}
                    </td>
                    <td>{r.status || '—'}</td>
                    <td className='space-x-2 whitespace-nowrap'>
                      <button type='button' className='btn btn-ghost text-sm' onClick={() => openHistoryItem(r)}>Открыть</button>
                      <button type='button' className='btn btn-ghost text-sm' onClick={() => void printHistoryItem(r)}>Печать</button>
                      <button type='button' className='btn btn-primary text-sm' onClick={() => void saveHistoryItem(r)}>Сохранить</button>
                      <button type='button' className='btn btn-ghost text-sm' onClick={() => void deleteHistoryRows([r])}>Удалить</button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showTemplates && <InvoiceTemplatesModal onClose={() => setShowTemplates(false)} />}
    </div>
  )
}
