import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import { useToast } from '../utils'
import { apiFetch } from '../api'

type Integration = {
  id: number
  companyId: number
  name: string
  serviceCenterId: number | null
  apiKey: string
  webhookUrl: string
  webhookSecret: string
  isActive: boolean
  lastSyncAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export default function IntegrationsModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Integration | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadIntegrations()
  }, [])

  async function loadIntegrations() {
    try {
      setLoading(true)
      const res = await apiFetch('/integrations')
      if (!res.ok) throw new Error('Ошибка загрузки интеграций')
      const data = await res.json()
      setIntegrations(Array.isArray(data) ? data : [])
    } catch (e: any) {
      toast.push(e.message || 'Не удалось загрузить интеграции')
    } finally {
      setLoading(false)
    }
  }

  async function deleteIntegration(id: number) {
    if (!confirm('Удалить интеграцию? API ключ будет потерян.')) return
    
    try {
      const res = await apiFetch(`/integrations/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка удаления')
      }
      toast.push('Интеграция удалена')
      loadIntegrations()
    } catch (e: any) {
      toast.push(e.message || 'Ошибка удаления интеграции')
    }
  }

  async function toggleActive(id: number, currentStatus: boolean) {
    try {
      const res = await apiFetch(`/integrations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка обновления')
      }
      toast.push(currentStatus ? 'Интеграция отключена' : 'Интеграция включена')
      loadIntegrations()
    } catch (e: any) {
      toast.push(e.message || 'Ошибка обновления')
    }
  }

  async function regenerateKey(id: number) {
    if (!confirm('Регенерировать API ключ? Старый ключ перестанет работать.')) return
    
    try {
      const res = await apiFetch(`/integrations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateApiKey: true })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка регенерации')
      }
      toast.push('API ключ обновлён')
      loadIntegrations()
    } catch (e: any) {
      toast.push(e.message || 'Ошибка регенерации ключа')
    }
  }

  return (
    <>
      <Modal title='Интеграции API и Webhook' onClose={onClose}>
        <div className='space-y-4'>
          <div className='text-sm text-muted'>
            Управление API ключами для проверки статуса заказов и настройка webhook для отправки обновлений на сайт.
          </div>

          <button
            className='btn w-full'
            onClick={() => setCreating(true)}
          >
            + Создать интеграцию
          </button>

          {loading ? (
            <div className='py-10 text-center text-muted'>Загрузка…</div>
          ) : integrations.length === 0 ? (
            <div className='py-10 text-center text-muted'>
              Нет интеграций. Создайте первую для начала работы.
            </div>
          ) : (
            <div className='space-y-3'>
              {integrations.map((integration) => (
                <div key={integration.id} className='card p-4'>
                  <div className='flex items-start justify-between mb-3'>
                    <div className='flex-1'>
                      <div className='font-semibold flex items-center gap-2'>
                        {integration.name}
                        {integration.isActive ? (
                          <span className='text-xs px-2 py-1 rounded bg-success/20 text-success'>Активна</span>
                        ) : (
                          <span className='text-xs px-2 py-1 rounded bg-muted/20 text-muted'>Неактивна</span>
                        )}
                      </div>
                      {integration.lastSyncAt && (
                        <div className='text-xs text-muted mt-1'>
                          Последняя синхронизация: {new Date(integration.lastSyncAt).toLocaleString('ru-RU')}
                        </div>
                      )}
                      {integration.lastError && (
                        <div className='text-xs text-danger mt-1'>
                          Ошибка: {integration.lastError}
                        </div>
                      )}
                    </div>
                    <div className='flex gap-2'>
                      <button
                        className='btn secondary text-xs'
                        onClick={() => setEditing(integration)}
                      >
                        Ред.
                      </button>
                      <button
                        className='btn secondary text-xs'
                        onClick={() => toggleActive(integration.id, integration.isActive)}
                      >
                        {integration.isActive ? 'Выкл.' : 'Вкл.'}
                      </button>
                      <button
                        className='btn secondary text-xs text-danger'
                        onClick={() => deleteIntegration(integration.id)}
                      >
                        Удал.
                      </button>
                    </div>
                  </div>

                  <div className='space-y-2 text-sm'>
                    <div>
                      <div className='text-muted text-xs mb-1'>API ключ:</div>
                      <div className='flex items-center gap-2'>
                        <code className='flex-1 p-2 bg-bg border border-border rounded text-xs break-all'>
                          {integration.apiKey}
                        </code>
                        <button
                          className='btn secondary text-xs'
                          onClick={() => {
                            navigator.clipboard.writeText(integration.apiKey)
                            toast.push('Ключ скопирован')
                          }}
                        >
                          Копир.
                        </button>
                        <button
                          className='btn secondary text-xs'
                          onClick={() => regenerateKey(integration.id)}
                        >
                          Обновить
                        </button>
                      </div>
                      <div className='text-xs text-muted mt-1'>
                        Используйте этот ключ для проверки статуса: 
                        <code className='ml-1'>
                          /api/orders/public/{'{orderId}'}/status?key={integration.apiKey.substring(0, 10)}...
                        </code>
                      </div>
                    </div>

                    {integration.webhookUrl && (
                      <div>
                        <div className='text-muted text-xs mb-1'>Webhook URL:</div>
                        <code className='p-2 bg-bg border border-border rounded text-xs block break-all'>
                          {integration.webhookUrl}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {creating && (
        <IntegrationFormModal
          onClose={() => {
            setCreating(false)
            loadIntegrations()
          }}
        />
      )}

      {editing && (
        <IntegrationFormModal
          integration={editing}
          onClose={() => {
            setEditing(null)
            loadIntegrations()
          }}
        />
      )}
    </>
  )
}

function IntegrationFormModal({ 
  integration, 
  onClose 
}: { 
  integration?: Integration
  onClose: () => void 
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(integration?.name || '')
  const [webhookUrl, setWebhookUrl] = useState(integration?.webhookUrl || '')
  const [webhookSecret, setWebhookSecret] = useState(integration?.webhookSecret || '')
  const [isActive, setIsActive] = useState(integration?.isActive ?? true)

  async function save() {
    if (!name.trim()) {
      return toast.push('Название обязательно')
    }

    try {
      setSaving(true)
      const url = integration 
        ? `/integrations/${integration.id}`
        : '/integrations'
      const method = integration ? 'PUT' : 'POST'

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          webhookUrl: webhookUrl.trim(),
          webhookSecret: webhookSecret.trim(),
          isActive
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Ошибка сохранения')
      }

      toast.push(integration ? 'Интеграция обновлена' : 'Интеграция создана')
      onClose()
    } catch (e: any) {
      toast.push(e.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal 
      title={integration ? 'Редактирование интеграции' : 'Создание интеграции'} 
      onClose={onClose}
    >
      <div className='space-y-4'>
        <div>
          <label className='label'>Название интеграции *</label>
          <input
            className='input w-full'
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='Например: Сайт fixnet.pro'
          />
        </div>

        <div>
          <label className='label'>Webhook URL (опционально)</label>
          <input
            className='input w-full'
            type='url'
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder='https://www.fixnet.pro/api/webhooks/order-status'
          />
          <div className='text-xs text-muted mt-1'>
            URL для отправки обновлений статуса заказа. Если не указан, webhook не будет отправляться.
          </div>
        </div>

        <div>
          <label className='label'>Webhook Secret (опционально)</label>
          <input
            className='input w-full'
            type='password'
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder='Секретный ключ для проверки webhook'
          />
          <div className='text-xs text-muted mt-1'>
            Секретный ключ для проверки подлинности webhook запросов.
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <input
            type='checkbox'
            id='isActive'
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className='rounded border-border'
          />
          <label htmlFor='isActive' className='text-sm cursor-pointer'>
            Интеграция активна
          </label>
        </div>

        {integration && (
          <div className='p-3 bg-bg border border-border rounded'>
            <div className='text-xs text-muted mb-1'>API ключ (не изменяется):</div>
            <code className='text-xs break-all'>{integration.apiKey}</code>
          </div>
        )}

        <div className='flex gap-3 justify-end'>
          <button className='btn secondary' onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button className='btn' onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </Modal>
  )
}




