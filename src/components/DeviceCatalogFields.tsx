import ComboInput from './ComboInput'
import Select from './Select'
import type { useDeviceCatalog } from '../hooks/useDeviceCatalog'

type Catalog = ReturnType<typeof useDeviceCatalog>

type Props = {
  catalog: Catalog
  deviceType: string
  brand: string
  model: string
  issue?: string
  issueSubtype?: string
  issueOptions?: string[]
  subtypeOptions?: string[]
  partType?: 'original' | 'copy' | string
  onDeviceTypeChange: (value: string) => void
  onBrandChange: (value: string) => void
  onModelChange: (value: string) => void
  onIssueChange?: (value: string) => void
  onIssueSubtypeChange?: (value: string) => void
  onPartTypeChange?: (value: string) => void
  showDeviceType?: boolean
  showIssueFields?: boolean
  showPartType?: boolean
  compact?: boolean
}

export default function DeviceCatalogFields({
  catalog,
  deviceType,
  brand,
  model,
  issue = '',
  issueSubtype = '',
  issueOptions = [],
  subtypeOptions = [],
  partType = 'original',
  onDeviceTypeChange,
  onBrandChange,
  onModelChange,
  onIssueChange,
  onIssueSubtypeChange,
  onPartTypeChange,
  showDeviceType = true,
  showIssueFields = true,
  showPartType = true,
  compact = false,
}: Props) {
  const brandOptions = catalog.brandNames(deviceType || undefined)
  const modelOptions = catalog.modelNames(deviceType || undefined, brand || undefined)
  const issues = issueOptions.length ? issueOptions : catalog.issueNames()
  const subtypes = subtypeOptions.length ? subtypeOptions : catalog.subtypeNames

  const hint = catalog.loading
    ? 'Загрузка каталога с сайта…'
    : catalog.contextLoading
      ? 'Обновление списка неисправностей…'
      : catalog.brands.length || catalog.models.length
        ? 'Выберите из списка или введите вручную'
        : 'Справочник пуст — синхронизируйте каталог в разделе «Услуги»'

  const gridClass = compact ? 'contents' : 'grid grid-cols-1 md:grid-cols-2 gap-3'

  return (
    <div className={gridClass}>
      {showDeviceType && (
        <div>
          <label className='label'>Категория устройства</label>
          <ComboInput
            value={deviceType}
            options={catalog.deviceTypes}
            placeholder='Смартфон, планшет…'
            onChange={onDeviceTypeChange}
          />
        </div>
      )}
      <div>
        <label className='label'>Бренд</label>
        <ComboInput
          value={brand}
          options={brandOptions}
          placeholder='Apple, Samsung…'
          onChange={onBrandChange}
        />
      </div>
      <div>
        <label className='label'>Модель</label>
        <ComboInput
          value={model}
          options={modelOptions}
          placeholder='iPhone 15, Galaxy S24…'
          onChange={onModelChange}
        />
      </div>
      {showIssueFields && onIssueChange && (
        <div>
          <label className='label'>Неисправность</label>
          <ComboInput
            value={issue}
            options={issues}
            placeholder='Замена дисплея, не включается…'
            onChange={onIssueChange}
          />
        </div>
      )}
      {showPartType && onPartTypeChange && (
        <div>
          <label className='label'>Тип запчасти</label>
          <Select
            className='select'
            value={partType || 'original'}
            onChange={(e) => onPartTypeChange(e.target.value)}
          >
            <option value='original'>Оригинал</option>
            <option value='copy'>Копия</option>
          </Select>
        </div>
      )}
      {showIssueFields && onIssueSubtypeChange && subtypes.length > 0 && (
        <div>
          <label className='label'>Уточнение (экран / комплектация)</label>
          <ComboInput
            value={issueSubtype}
            options={subtypes}
            placeholder='Выберите из прайса…'
            onChange={onIssueSubtypeChange}
          />
        </div>
      )}
      {!compact && <p className='text-xs text-muted md:col-span-2'>{hint}</p>}
    </div>
  )
}
