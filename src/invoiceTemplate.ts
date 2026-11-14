type DisplaySettings = {
  showCostPrice: boolean
  showAdditionalFields: boolean
  showClientInfo: boolean
  showDeviceInfo: boolean
  showDescription: boolean
}

export type InvoiceRenderInput = {
  template?: string
  company: { name?: string; address?: string; phone?: string; email?: string; inn?: string; kpp?: string }
  order: {
    id: number
    client: string
    phone: string
    clientAddress?: string
    brand?: string
    model?: string
    color?: string
    deviceType?: string
    imei?: string
    serialNumber?: string
    equipment?: string
    devicePassword?: string
    managerName?: string
    executorName?: string
    dueAt?: string | null
    isUrgent?: boolean | number
    prepayment?: number
    estimatedPrice?: number
    receiverNotes?: string
    inspection?: any
    wishes?: any
    description?: string
    problem?: string
    price?: number
    costPrice?: number
    problems?: Array<{ problemName: string; problemDescription?: string; price?: number; costPrice?: number }>
  }
  invoiceDate?: string
  displaySettings?: DisplaySettings
  additionalFields?: Array<{ label: string; value: string }>
  footerText?: string
  title?: string
}

function escHtml(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatMoney(n: any) {
  const v = Number(n) || 0
  return `${Math.round(v).toLocaleString('ru-RU')} ₽`
}

function formatDate(d: any) {
  const dt = d ? new Date(d) : new Date()
  return Number.isNaN(dt.getTime()) ? new Date().toLocaleDateString('ru-RU') : dt.toLocaleDateString('ru-RU')
}

function formatDateTime(d: any) {
  if (!d) return ''
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleString('ru-RU')
}

function notSpecified(v: any) {
  const s = String(v ?? '').trim()
  return s ? s : 'не указано'
}

function joinOrDefault(arr: any, fallback = 'не указано') {
  if (!Array.isArray(arr)) return fallback
  const clean = arr.map((x) => String(x ?? '').trim()).filter(Boolean)
  return clean.length ? clean.join(', ') : fallback
}

function isPlaceholderProblemName(name: unknown) {
  const n = String(name || '').trim().toLowerCase()
  return !n || n === 'приём в ремонт' || n === 'прием в ремонт'
}

/** Синхронизирует строки таблицы с актуальными полями заказа (problem, price, description). */
export function normalizeInvoiceProblems(order: InvoiceRenderInput['order']) {
  const rows = Array.isArray(order.problems) ? order.problems.map((p) => ({ ...p })) : []
  const totalPrice = Number(order.price) || 0
  const totalCost = Number(order.costPrice) || 0
  const mainProblem = String(order.problem || '').trim()
  const notes = String(order.description || order.receiverNotes || '').trim()
  const sumRowPrices = rows.reduce((s, p) => s + (Number(p.price) || 0), 0)

  if (rows.length === 0) {
    if (!mainProblem && totalPrice === 0) return []
    return [{
      problemName: mainProblem || 'Ремонт',
      problemDescription: notes,
      price: totalPrice,
      costPrice: totalCost,
    }]
  }

  const allPlaceholder = rows.every((p) => isPlaceholderProblemName(p.problemName) && !(Number(p.price)))
  if (allPlaceholder && (mainProblem || totalPrice > 0)) {
    const rowNotes = rows.map((p) => String(p.problemDescription || '').trim()).filter(Boolean).join('; ')
    return [{
      problemName: mainProblem || rows[0]?.problemName || 'Ремонт',
      problemDescription: rowNotes || notes,
      price: totalPrice,
      costPrice: totalCost,
    }]
  }

  if (sumRowPrices === 0 && totalPrice > 0) {
    return rows.map((p, i) => ({
      problemName: isPlaceholderProblemName(p.problemName) && mainProblem ? mainProblem : (p.problemName || mainProblem || 'Ремонт'),
      problemDescription: String(p.problemDescription || '').trim() || (i === 0 ? notes : ''),
      price: i === 0 ? totalPrice : Number(p.price) || 0,
      costPrice: i === 0 ? totalCost : Number(p.costPrice) || 0,
    }))
  }

  return rows.map((p, i) => ({
    problemName: isPlaceholderProblemName(p.problemName) && mainProblem ? mainProblem : (p.problemName || mainProblem || 'Ремонт'),
    problemDescription: String(p.problemDescription || '').trim() || (rows.length === 1 ? notes : ''),
    price: Number(p.price) || 0,
    costPrice: Number(p.costPrice) || 0,
  }))
}

function problemsTableRows(problems: Array<{ problemName: string; problemDescription?: string; price?: number }>) {
  if (problems.length === 0) {
    return `<tr><td colspan="4" class="c muted">Не указано</td></tr>`
  }
  return problems
    .map((p, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td>${escHtml(p.problemName || '')}</td>
        <td>${escHtml(p.problemDescription || '—')}</td>
        <td class="r">${formatMoney(p.price)}</td>
      </tr>
    `)
    .join('')
}

function defaultBody(input: Required<Pick<InvoiceRenderInput, 'company' | 'order'>> & InvoiceRenderInput) {
  const ds: DisplaySettings = {
    showCostPrice: false,
    showAdditionalFields: true,
    showClientInfo: true,
    showDeviceInfo: true,
    showDescription: false,
    ...(input.displaySettings || {}),
  }
  const problems = normalizeInvoiceProblems(input.order)
  const date = formatDate(input.invoiceDate)
  const deviceLine = `${input.order.brand || ''} ${input.order.model || ''}`.trim()
  const deviceType = input.order.deviceType ? ` (${input.order.deviceType})` : ''

  return `
  <div class="header">
    <div class="company-info">
      <div class="company-name">${escHtml(input.company.name || 'Сервисный центр')}</div>
      ${input.company.address ? `<div class="company-meta">${escHtml(input.company.address)}</div>` : ''}
      ${input.company.phone ? `<div class="company-meta">Тел.: ${escHtml(input.company.phone)}</div>` : ''}
      ${input.company.inn ? `<div class="company-meta">ИНН: ${escHtml(input.company.inn)}</div>` : ''}
    </div>
    <div class="invoice-info">
      <div class="doc-title">Квитанция № ${escHtml(input.order.id)}</div>
      <div class="doc-date">от ${escHtml(date)}</div>
    </div>
  </div>

  ${ds.showClientInfo ? `
    <table class="meta">
      <tr><td class="lbl">Клиент</td><td class="val"><strong>${escHtml(input.order.client)}</strong></td></tr>
      <tr><td class="lbl">Телефон</td><td class="val">${escHtml(input.order.phone)}</td></tr>
      ${ds.showDeviceInfo && deviceLine ? `<tr><td class="lbl">Устройство</td><td class="val">${escHtml(deviceLine)}${escHtml(deviceType)}</td></tr>` : ''}
      ${input.order.serialNumber ? `<tr><td class="lbl">S/N</td><td class="val">${escHtml(input.order.serialNumber)}</td></tr>` : ''}
      ${input.order.imei ? `<tr><td class="lbl">IMEI</td><td class="val">${escHtml(input.order.imei)}</td></tr>` : ''}
    </table>
  ` : ''}

  <table class="items">
    <thead>
      <tr>
        <th class="c" style="width:36px">№</th>
        <th>Работа / услуга</th>
        <th>Неисправность / описание</th>
        <th class="r" style="width:110px">Сумма</th>
      </tr>
    </thead>
    <tbody>
      ${problemsTableRows(problems)}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row">
      <span>Итого к оплате</span>
      <span>${formatMoney(input.order.price)}</span>
    </div>
    ${ds.showCostPrice ? `<div class="total-sub muted"><span>Себестоимость</span><span>${formatMoney(input.order.costPrice)}</span></div>` : ''}
    ${Number(input.order.prepayment) > 0 ? `<div class="total-sub muted"><span>Предоплата</span><span>${formatMoney(input.order.prepayment)}</span></div>` : ''}
  </div>

  ${ds.showAdditionalFields && (input.additionalFields || []).length > 0 ? `
    <table class="meta meta-compact">
      ${(input.additionalFields || [])
        .filter((f) => String(f.value || '').trim())
        .map((f) => `<tr><td class="lbl">${escHtml(f.label)}</td><td class="val">${escHtml(f.value)}</td></tr>`)
        .join('')}
    </table>
  ` : ''}

  ${input.footerText ? `<div class="footer">${escHtml(input.footerText).replace(/\n/g, '<br/>')}</div>` : ''}
  `
}

function replaceAll(html: string, dict: Record<string, string>) {
  let out = html
  for (const [k, v] of Object.entries(dict)) {
    out = out.split(k).join(v)
  }
  return out
}

export function renderInvoiceHtml(input: InvoiceRenderInput) {
  const ds: DisplaySettings = {
    showCostPrice: false,
    showAdditionalFields: true,
    showClientInfo: true,
    showDeviceInfo: true,
    showDescription: false,
    ...(input.displaySettings || {}),
  }
  const normalizedOrder = { ...input.order, problems: normalizeInvoiceProblems(input.order) }
  const problems = normalizedOrder.problems || []

  const dict: Record<string, string> = {
    '{{company.name}}': escHtml(input.company.name || ''),
    '{{company.address}}': escHtml(input.company.address || ''),
    '{{company.phone}}': escHtml(input.company.phone || ''),
    '{{company.email}}': escHtml(input.company.email || ''),
    '{{company.inn}}': escHtml(input.company.inn || ''),
    '{{company.kpp}}': escHtml(input.company.kpp || ''),
    '{{invoice.number}}': escHtml(input.order.id),
    '{{invoice.date}}': escHtml(formatDate(input.invoiceDate)),
    '{{client.name}}': escHtml(input.order.client),
    '{{client.phone}}': escHtml(input.order.phone),
    '{{client.address}}': escHtml(input.order.clientAddress || ''),
    '{{device.brand}}': escHtml(input.order.brand || ''),
    '{{device.model}}': escHtml(input.order.model || ''),
    '{{device.color}}': escHtml(input.order.color || ''),
    '{{device.type}}': escHtml(input.order.deviceType || ''),
    '{{device.imei}}': escHtml(input.order.imei || ''),
    '{{device.sn}}': escHtml(input.order.serialNumber || ''),
    '{{order.equipment}}': escHtml(input.order.equipment || ''),
    '{{order.password}}': escHtml(input.order.devicePassword || ''),
    '{{order.manager}}': escHtml(input.order.managerName || ''),
    '{{order.executor}}': escHtml(input.order.executorName || ''),
    '{{order.dueAt}}': escHtml(formatDateTime(input.order.dueAt)),
    '{{order.urgent}}': String(input.order.isUrgent ? 'Да' : 'Нет'),
    '{{order.prepayment}}': formatMoney(input.order.prepayment),
    '{{order.estimatedPrice}}': formatMoney(input.order.estimatedPrice),
    '{{order.receiverNotes}}': escHtml(input.order.receiverNotes || '').replace(/\n/g, '<br/>'),
    '{{order.description}}': escHtml(input.order.description || '').replace(/\n/g, '<br/>'),
    '{{order.problem}}': escHtml(input.order.problem || ''),
    '{{inspection.dirt}}': escHtml(joinOrDefault(input.order.inspection?.dirt)),
    '{{inspection.scratches}}': escHtml(joinOrDefault(input.order.inspection?.scratches)),
    '{{inspection.chips}}': escHtml(joinOrDefault(input.order.inspection?.chips)),
    '{{inspection.wear}}': escHtml(joinOrDefault(input.order.inspection?.wear)),
    '{{inspection.cracks}}': escHtml(joinOrDefault(input.order.inspection?.cracks)),
    '{{inspection.integrity}}': escHtml(notSpecified(input.order.inspection?.integrity)),
    '{{inspection.software}}': escHtml(notSpecified(input.order.inspection?.software)),
    '{{inspection.temperature}}': escHtml(notSpecified(input.order.inspection?.temperature)),
    '{{inspection.opErrors}}': escHtml(notSpecified(input.order.inspection?.opErrors)),
    '{{inspection.other}}': escHtml(notSpecified(input.order.inspection?.other)),
    '{{wishes.loaner}}': escHtml(notSpecified(input.order.wishes?.loaner)),
    '{{wishes.storage}}': escHtml(notSpecified(input.order.wishes?.storage)),
    '{{wishes.pickupAddress}}': escHtml(notSpecified(input.order.wishes?.pickupAddress)),
    '{{wishes.prepaymentWish}}': escHtml(notSpecified(input.order.wishes?.prepaymentWish)),
    '{{order.total}}': formatMoney(input.order.price),
    '{{order.costPrice}}': formatMoney(input.order.costPrice),
    '{{problems.tableRows}}': problemsTableRows(problems),
  }

  const body = input.template && input.template.trim()
    ? replaceAll(input.template, dict)
    : defaultBody({ ...input, order: normalizedOrder, displaySettings: ds })

  const title = input.title ?? ''

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 11pt;
      color: #000;
      margin: 0;
      padding: 14mm;
      line-height: 1.35;
    }
    .muted { color: #555; }
    .c { text-align: center; }
    .r { text-align: right; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1.5px solid #000;
    }
    .company-name { font-size: 12pt; font-weight: bold; margin-bottom: 4px; }
    .company-meta { font-size: 10pt; color: #333; }
    .invoice-info { text-align: right; flex-shrink: 0; }
    .doc-title { font-size: 12pt; font-weight: bold; }
    .doc-date { font-size: 10pt; margin-top: 2px; }
    table.meta { width: 100%; border-collapse: collapse; margin: 10px 0 14px; }
    table.meta td { padding: 3px 6px; vertical-align: top; font-size: 10.5pt; }
    table.meta-compact { margin-top: 16px; }
    .lbl { width: 30%; font-weight: bold; }
    table.items { width: 100%; border-collapse: collapse; margin: 12px 0 8px; }
    table.items th, table.items td {
      border: 1px solid #000;
      padding: 6px 8px;
      vertical-align: top;
      font-size: 10.5pt;
    }
    table.items th { background: #f2f2f2; font-weight: bold; text-align: left; }
    .totals { margin-top: 4px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .total-row, .total-sub {
      width: min(280px, 100%);
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 4px 0;
    }
    .total-row { font-size: 12pt; font-weight: bold; padding-top: 4px; margin-top: 4px; }
    .total-sub { font-size: 10pt; }
    .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9pt; color: #444; text-align: center; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
${body}
</body>
</html>`
}
