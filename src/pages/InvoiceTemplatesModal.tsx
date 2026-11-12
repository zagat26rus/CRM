import { useState, useEffect } from 'react'
import Modal from '../components/Modal'
import Select from '../components/Select'
import { useToast } from '../utils'
import { apiFetch } from '../api'
import { renderInvoiceHtml } from '../invoiceTemplate'

type DisplaySettings = {
  showCostPrice: boolean
  showAdditionalFields: boolean
  showClientInfo: boolean
  showDeviceInfo: boolean
  showDescription: boolean
}

type InvoiceTemplate = {
  id: number
  name: string
  type: 'invoice' | 'receipt' | 'shop_invoice'
  template?: string
  companyName: string
  companyAddress: string
  companyPhone: string
  companyEmail: string
  companyInn: string
  companyKpp: string
  additionalFields: Array<{ label: string; value: string }>
  footerText: string
  displaySettings: DisplaySettings
  isDefault: boolean
  isActive: boolean
}

export default function InvoiceTemplatesModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<InvoiceTemplate | null>(null)
  const [creatingTemplate, setCreatingTemplate] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [])

  async function loadTemplates() {
    try {
      setLoading(true)
      const res = await apiFetch('/invoices/templates')
      if (!res.ok) throw new Error('Ошибка загрузки шаблонов')
      const data = await res.json()
      const templatesWithDefaults = (Array.isArray(data) ? data : []).map((t: any) => ({
        ...t,
        displaySettings: t.displaySettings || {
          showCostPrice: false,
          showAdditionalFields: true,
          showClientInfo: true,
          showDeviceInfo: true,
          showDescription: true
        }
      }))
      setTemplates(templatesWithDefaults)
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось загрузить шаблоны')
    } finally {
      setLoading(false)
    }
  }

  async function deleteTemplate(id: number) {
    if (!confirm('Удалить шаблон?')) return
    try {
      const res = await apiFetch(`/invoices/templates/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Ошибка удаления')
      toast.push('Шаблон удален')
      await loadTemplates()
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось удалить шаблон')
    }
  }

  return (
    <Modal title='Шаблоны квитанций' onClose={onClose}>
      <div className='space-y-4'>
        <div className='flex justify-between items-center'>
          <p className='text-sm text-muted'>Управление шаблонами для печати квитанций и накладных</p>
          <button 
            className='btn' 
            onClick={() => {
              setCreatingTemplate(true)
              setEditingTemplate({
                id: 0,
                name: 'Новый шаблон',
                type: 'invoice',
                template: '',
                companyName: '',
                companyAddress: '',
                companyPhone: '',
                companyEmail: '',
                companyInn: '',
                companyKpp: '',
                additionalFields: [],
                footerText: '',
                displaySettings: {
                  showCostPrice: false,
                  showAdditionalFields: true,
                  showClientInfo: true,
                  showDeviceInfo: true,
                  showDescription: true
                },
                isDefault: false,
                isActive: true
              })
            }}
          >
            + Создать шаблон
          </button>
        </div>

        {loading ? (
          <div className='text-center py-10 text-muted'>Загрузка...</div>
        ) : templates.length === 0 ? (
          <div className='text-center py-10 text-muted'>
            <p>Шаблонов пока нет</p>
            <p className='text-xs mt-2'>Создайте первый шаблон для настройки печати</p>
          </div>
        ) : (
          <div className='space-y-2'>
            {templates.map(template => (
              <div key={template.id} className='card p-4'>
                <div className='flex justify-between items-start'>
                  <div className='flex-1'>
                    <div className='flex items-center gap-2'>
                      <h3 className='font-semibold'>{template.name}</h3>
                      {template.isDefault && (
                        <span className='text-xs px-2 py-1 bg-primary/20 text-primary rounded'>По умолчанию</span>
                      )}
                      <span className='text-xs text-muted'>({template.type === 'invoice' ? 'Квитанция' : template.type === 'shop_invoice' ? 'Накладная магазина' : 'Чек'})</span>
                    </div>
                    <p className='text-sm text-muted mt-1'>{template.companyName || 'Название компании не указано'}</p>
                  </div>
                  <div className='flex gap-2'>
                    <button 
                      className='btn secondary text-xs px-3 py-1'
                      onClick={() => setEditingTemplate(template)}
                    >
                      Редактировать
                    </button>
                    <button 
                      className='btn secondary text-xs px-3 py-1 text-danger'
                      onClick={() => deleteTemplate(template.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(editingTemplate || creatingTemplate) && (
          <TemplateEditor
            template={editingTemplate!}
            onClose={() => {
              setEditingTemplate(null)
              setCreatingTemplate(false)
            }}
            onSave={async () => {
              await loadTemplates()
              setEditingTemplate(null)
              setCreatingTemplate(false)
            }}
          />
        )}
      </div>
    </Modal>
  )
}

function TemplateEditor({ 
  template, 
  onClose, 
  onSave 
}: { 
  template: InvoiceTemplate
  onClose: () => void
  onSave: () => void
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const defaultDisplaySettings: DisplaySettings = {
    showCostPrice: false,
    showAdditionalFields: true,
    showClientInfo: true,
    showDeviceInfo: true,
    showDescription: true
  }
  const [form, setForm] = useState<InvoiceTemplate>({
    ...template,
    displaySettings: template.displaySettings || defaultDisplaySettings
  })
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldValue, setNewFieldValue] = useState('')
  const [activeTab, setActiveTab] = useState<'settings' | 'layout' | 'preview'>('settings')

  // Мок-данные для предпросмотра
  const previewData = {
    order: {
      id: 123,
      client: 'Иванов Иван Иванович',
      phone: '+7 (999) 123-45-67',
      brand: 'Apple',
      model: 'iPhone 14 Pro',
      deviceType: 'Смартфон',
      price: 5000,
      costPrice: 3000,
      inspection: {
        dirt: ['по всей поверхности'],
        scratches: ['левая сторона', 'точечно'],
        chips: ['не указано'],
        wear: ['нижняя часть'],
        cracks: ['не указано'],
        integrity: 'не указано',
        software: 'не указано',
        temperature: 'не указано',
        opErrors: 'не указано',
        other: 'не указано'
      },
      wishes: {
        loaner: 'не указано',
        storage: 'не указано',
        pickupAddress: 'г. Ставрополь, ул. Мимоз, д. 26/1',
        prepaymentWish: 'не указано'
      },
      description: 'Замена экрана, чистка от пыли'
    },
    problems: [
      { problemName: 'Замена экрана', problemDescription: 'Установлен оригинальный дисплей', price: 5000 }
    ],
    date: new Date().toLocaleDateString('ru-RU')
  }

  function updateDisplaySetting(key: keyof DisplaySettings, value: boolean) {
    setForm({
      ...form,
      displaySettings: {
        ...form.displaySettings,
        [key]: value
      }
    })
  }

  function generatePreviewHtml() {
    return renderInvoiceHtml({
      template: form.template || '',
      company: {
        name: form.companyName,
        address: form.companyAddress,
        phone: form.companyPhone,
        email: form.companyEmail,
        inn: form.companyInn,
        kpp: form.companyKpp
      },
      order: {
        ...previewData.order,
        problems: previewData.problems
      },
      invoiceDate: new Date().toISOString(),
      displaySettings: form.displaySettings,
      additionalFields: form.additionalFields,
      footerText: form.footerText,
      title: `Предпросмотр — ${form.name}`
    })
  }

  async function save() {
    if (!form.name.trim()) {
      toast.push('Название шаблона обязательно')
      return
    }

    try {
      setSaving(true)
      const url = template.id > 0 ? `/invoices/templates/${template.id}` : '/invoices/templates'
      const method = template.id > 0 ? 'PUT' : 'POST'
      
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data?.error || 'Ошибка сохранения')
      }

      toast.push(template.id > 0 ? 'Шаблон обновлен' : 'Шаблон создан')
      onSave()
    } catch (e: any) {
      toast.push(e?.message || 'Не удалось сохранить шаблон')
    } finally {
      setSaving(false)
    }
  }

  function addField() {
    if (!newFieldLabel.trim()) {
      toast.push('Укажите название поля')
      return
    }
    setForm({
      ...form,
      additionalFields: [...form.additionalFields, { label: newFieldLabel.trim(), value: newFieldValue.trim() }]
    })
    setNewFieldLabel('')
    setNewFieldValue('')
  }

  function removeField(index: number) {
    setForm({
      ...form,
      additionalFields: form.additionalFields.filter((_, i) => i !== index)
    })
  }

  return (
    <div className='fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
      <div className='card w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col'>
        <div className='card-inner flex-1 overflow-hidden flex flex-col'>
          {/* Заголовок */}
          <div className='flex justify-between items-center mb-4 pb-4 border-b border-border'>
            <h2 className='text-xl font-bold'>{template.id > 0 ? 'Редактирование шаблона' : 'Создание шаблона'}</h2>
            <button onClick={onClose} className='btn secondary'>Закрыть</button>
          </div>

          {/* Вкладки */}
          <div className='flex gap-2 mb-4'>
            <button
              className={`btn secondary ${activeTab === 'settings' ? 'bg-primary text-black' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              Настройки
            </button>
            <button
              className={`btn secondary ${activeTab === 'layout' ? 'bg-primary text-black' : ''}`}
              onClick={() => setActiveTab('layout')}
              title='Расширенный редактор макета'
            >
              Макет (HTML)
            </button>
            <button
              className={`btn secondary ${activeTab === 'preview' ? 'bg-primary text-black' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              Предпросмотр
            </button>
          </div>

          <div className='flex-1 overflow-y-auto'>
            {activeTab === 'settings' ? (
              <div className='space-y-6'>
                {/* Основные настройки */}
                <div>
                  <h3 className='font-semibold mb-3'>Основные настройки</h3>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <label className='label'>Название шаблона *</label>
                      <input 
                        className='input'
                        value={form.name}
                        onChange={e => setForm({...form, name: e.target.value})}
                        placeholder='Например: Квитанция на ремонт'
                      />
                    </div>
                    <div>
                      <label className='label'>Тип шаблона *</label>
                      <Select 
                        className='select'
                        value={form.type}
                        onChange={e => setForm({...form, type: e.target.value as any})}
                      >
                        <option value='invoice'>Квитанция (заказы на ремонт)</option>
                        <option value='shop_invoice'>Накладная (заказы из магазина)</option>
                        <option value='receipt'>Чек</option>
                      </Select>
                    </div>
                    <div className='md:col-span-2 flex items-center gap-2'>
                      <input 
                        type='checkbox'
                        checked={form.isDefault}
                        onChange={e => setForm({...form, isDefault: e.target.checked})}
                        className='w-4 h-4'
                      />
                      <label className='text-sm'>Использовать по умолчанию</label>
                    </div>
                  </div>
                </div>

                {/* Информация о компании */}
                <div>
                  <h3 className='font-semibold mb-3'>Информация о компании</h3>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <label className='label'>Название компании</label>
                      <input 
                        className='input'
                        value={form.companyName}
                        onChange={e => setForm({...form, companyName: e.target.value})}
                        placeholder='ООО "Компания"'
                      />
                    </div>
                    <div>
                      <label className='label'>ИНН</label>
                      <input 
                        className='input'
                        value={form.companyInn}
                        onChange={e => setForm({...form, companyInn: e.target.value})}
                        placeholder='1234567890'
                      />
                    </div>
                    <div>
                      <label className='label'>КПП</label>
                      <input 
                        className='input'
                        value={form.companyKpp}
                        onChange={e => setForm({...form, companyKpp: e.target.value})}
                        placeholder='123456789'
                      />
                    </div>
                    <div>
                      <label className='label'>Телефон</label>
                      <input 
                        className='input'
                        value={form.companyPhone}
                        onChange={e => setForm({...form, companyPhone: e.target.value})}
                        placeholder='+7 (999) 123-45-67'
                      />
                    </div>
                    <div className='md:col-span-2'>
                      <label className='label'>Адрес</label>
                      <input 
                        className='input'
                        value={form.companyAddress}
                        onChange={e => setForm({...form, companyAddress: e.target.value})}
                        placeholder='г. Москва, ул. Примерная, д. 1'
                      />
                    </div>
                    <div className='md:col-span-2'>
                      <label className='label'>Email</label>
                      <input 
                        className='input'
                        type='email'
                        value={form.companyEmail}
                        onChange={e => setForm({...form, companyEmail: e.target.value})}
                        placeholder='info@company.ru'
                      />
                    </div>
                  </div>
                </div>

                {/* Настройки видимости */}
                <div>
                  <h3 className='font-semibold mb-3'>Что показывать в квитанции</h3>
                  <div className='space-y-2'>
                    <label className='flex items-center gap-2 cursor-pointer'>
                      <input 
                        type='checkbox'
                        checked={form.displaySettings.showClientInfo}
                        onChange={e => updateDisplaySetting('showClientInfo', e.target.checked)}
                        className='w-4 h-4'
                      />
                      <span className='text-sm'>Информация о клиенте</span>
                    </label>
                    <label className='flex items-center gap-2 cursor-pointer'>
                      <input 
                        type='checkbox'
                        checked={form.displaySettings.showDeviceInfo}
                        onChange={e => updateDisplaySetting('showDeviceInfo', e.target.checked)}
                        className='w-4 h-4'
                        disabled={!form.displaySettings.showClientInfo}
                      />
                      <span className='text-sm'>Информация об устройстве</span>
                    </label>
                    <label className='flex items-center gap-2 cursor-pointer'>
                      <input 
                        type='checkbox'
                        checked={form.displaySettings.showCostPrice}
                        onChange={e => updateDisplaySetting('showCostPrice', e.target.checked)}
                        className='w-4 h-4'
                      />
                      <span className='text-sm'>Себестоимость (не рекомендуется для клиентов)</span>
                    </label>
                    <label className='flex items-center gap-2 cursor-pointer'>
                      <input 
                        type='checkbox'
                        checked={form.displaySettings.showAdditionalFields}
                        onChange={e => updateDisplaySetting('showAdditionalFields', e.target.checked)}
                        className='w-4 h-4'
                      />
                      <span className='text-sm'>Дополнительные поля</span>
                    </label>
                    <label className='flex items-center gap-2 cursor-pointer'>
                      <input 
                        type='checkbox'
                        checked={form.displaySettings.showDescription}
                        onChange={e => updateDisplaySetting('showDescription', e.target.checked)}
                        className='w-4 h-4'
                      />
                      <span className='text-sm'>Примечания к заказу</span>
                    </label>
                  </div>
                </div>

                {/* Дополнительные поля */}
                <div>
                  <h3 className='font-semibold mb-3'>Дополнительные поля</h3>
                  <div className='space-y-2 mb-3'>
                    {form.additionalFields.map((field, idx) => (
                      <div key={idx} className='flex gap-2 items-center p-3 bg-surface rounded-lg'>
                        <div className='flex-1'>
                          <div className='text-sm font-medium'>{field.label}</div>
                          <div className='text-xs text-muted'>{field.value || '(пусто)'}</div>
                        </div>
                        <button 
                          className='btn secondary text-xs px-2 py-1 text-danger'
                          onClick={() => removeField(idx)}
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className='grid grid-cols-1 md:grid-cols-3 gap-2'>
                    <input 
                      className='input'
                      value={newFieldLabel}
                      onChange={e => setNewFieldLabel(e.target.value)}
                      placeholder='Название поля'
                    />
                    <input 
                      className='input'
                      value={newFieldValue}
                      onChange={e => setNewFieldValue(e.target.value)}
                      placeholder='Значение (опционально)'
                    />
                    <button className='btn secondary' onClick={addField}>
                      Добавить поле
                    </button>
                  </div>
                </div>

                {/* Текст в подвале */}
                <div>
                  <h3 className='font-semibold mb-3'>Текст в подвале</h3>
                  <textarea 
                    className='textarea'
                    value={form.footerText}
                    onChange={e => setForm({...form, footerText: e.target.value})}
                    placeholder='Дополнительная информация, которая будет отображаться внизу квитанции...'
                    rows={3}
                  />
                  <p className='text-xs text-muted mt-1'>Например: "Спасибо за обращение!" или условия гарантии</p>
                </div>
              </div>
            ) : activeTab === 'layout' ? (
              <div className='space-y-4'>
                <div className='p-3 rounded-xl border border-border bg-surface'>
                  <div className='text-sm font-medium'>Плейсхолдеры</div>
                  <div className='text-xs text-muted mt-1'>
                    Вставляйте значения прямо в HTML. Если макет пустой — используется стандартный шаблон.
                  </div>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    {[
                      '{{company.name}}',
                      '{{company.address}}',
                      '{{company.phone}}',
                      '{{company.email}}',
                      '{{company.inn}}',
                      '{{company.kpp}}',
                      '{{invoice.number}}',
                      '{{invoice.date}}',
                      '{{client.name}}',
                      '{{client.phone}}',
                      '{{device.brand}}',
                      '{{device.model}}',
                      '{{device.type}}',
                      '{{order.description}}',
                      '{{order.total}}',
                      '{{order.costPrice}}',
                      '{{problems.tableRows}}'
                    ].map((p) => (
                      <button
                        key={p}
                        className='text-xs px-2 py-1 rounded bg-bg border border-border hover:bg-surface transition'
                        type='button'
                        onClick={() => setForm((prev) => ({ ...prev, template: `${prev.template || ''}${prev.template ? '\n' : ''}${p}` }))}
                        title='Добавить в макет'
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className='label'>HTML-макет (A4)</label>
                  <textarea
                    className='textarea font-mono text-xs'
                    value={form.template || ''}
                    onChange={(e) => setForm({ ...form, template: e.target.value })}
                    placeholder={`Например:\n<div class=\"header\">...</div>\n<table class=\"items\">{{problems.tableRows}}</table>`}
                    rows={18}
                  />
                  <div className='text-xs text-muted mt-2'>
                    Совет: используйте классы из предпросмотра (`header`, `block`, `items`, `totals`, `footer`) — они уже стилизованы.
                  </div>
                </div>
              </div>
            ) : (
              <div className='space-y-4'>
                <div className='text-sm text-muted mb-4'>
                  Предпросмотр квитанции на листе A4. Если документ на 2+ страниц — прокручивайте внутри предпросмотра.
                </div>
                <div className='flex justify-center items-start bg-gray-100 p-4 rounded-lg overflow-auto max-h-[70vh]'>
                  <div 
                    className='bg-white shadow-lg'
                    style={{ 
                      width: '210mm', 
                      minHeight: '297mm',
                      padding: '20mm',
                      transform: 'scale(0.75)',
                      transformOrigin: 'top center'
                    }}
                  >
                    <iframe
                      title='preview'
                      srcDoc={generatePreviewHtml()}
                      className='w-full border-0'
                      style={{ height: '1200px', minHeight: '1200px' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Кнопки */}
          <div className='flex justify-end gap-2 pt-4 border-t border-border mt-4'>
            <button className='btn secondary' onClick={onClose} disabled={saving}>
              Отмена
            </button>
            <button className='btn' onClick={save} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
