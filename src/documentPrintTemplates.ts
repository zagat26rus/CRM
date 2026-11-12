import { openPrintWindow } from './printWindow'

import type { DocumentTypeId } from './documentTypes'
import type { GenericDocData } from './documentFormSchemas'
import { calcLinesTotal } from './documentFormSchemas'
import { FIXNET_RECEIPT_LOGO_SRC } from './fixnetReceiptLogo'

const COMPANY = {
  name: 'Сервисный центр «ФиксНэт»',
  legalName: 'ИП Сторожук Ф.Д.',
  address: '355013, г. Ставрополь, ул. Мимоз, д. 26/1',
  inn: '263509629143',
  ogrnip: '326200000019682',
  phone: '+7-993-309-08-28',
  email: 'fixnet@mail.ru'
}

function esc(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(n: unknown) {
  return `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₽`
}

function amount(n: unknown) {
  return Math.round(Number(n) || 0).toLocaleString('ru-RU')
}

function signField(value: string, caption: string, opts?: { blank?: boolean; narrow?: boolean }) {
  const inner = opts?.blank ? '&nbsp;' : esc(value || '\u00a0')
  const cap = caption === 'подпись' ? 'подпись' : `(${caption})`
  return `
    <div class="sign-field${opts?.narrow ? ' sign-field-narrow' : ''}">
      <div class="sign-value">${inner}</div>
      <div class="sign-line"></div>
      <div class="sign-caption">${cap}</div>
    </div>`
}

function fmtDate(d?: string) {
  if (!d) return new Date().toLocaleDateString('ru-RU')
  const p = String(d).slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d
}

function row2(l: string, v: string) {
  return `<tr><td class="lbl">${esc(l)}</td><td class="val">${v || '&nbsp;'}</td></tr>`
}

function linesTable(data: GenericDocData, withVat = false, plainAmount = false) {
  const fmt = plainAmount ? amount : money
  const rows = data.lines
    .filter((l) => l.name.trim())
    .map((l, i) => {
      const sum = (Number(l.qty) || 0) * (Number(l.price) || 0)
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${esc(l.name)}</td>
        <td class="c">${esc(l.unit)}</td>
        <td class="r">${esc(l.qty)}</td>
        <td class="r">${fmt(l.price)}</td>
        ${withVat ? `<td class="c">${esc(l.vat || data.vatRate)}</td>` : ''}
        <td class="r">${fmt(sum)}</td>
      </tr>`
    })
    .join('')
  const total = calcLinesTotal(data.lines) || Number(data.amount) || Number(data.total) || 0
  const cols = withVat ? 7 : 6
  return `
    <table class="items">
      <thead><tr>
        <th>№</th><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена</th>
        ${withVat ? '<th>НДС</th>' : ''}
        <th>Сумма</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="' + cols + '" class="c">—</td></tr>'}</tbody>
      <tfoot><tr><td colspan="${cols - 1}" class="r"><b>Итого:</b></td><td class="r"><b>${fmt(total)}</b></td></tr></tfoot>
    </table>`
}

const BASE_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; margin: 0; padding: 16mm; }
  .page { max-width: 210mm; margin: 0 auto; }
  h1 { text-align: center; font-size: 14pt; margin: 0 0 4px; text-transform: uppercase; }
  .sub { text-align: center; font-size: 10pt; margin-bottom: 12px; }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .meta td { padding: 3px 6px; vertical-align: top; }
  .lbl { width: 32%; font-weight: bold; }
  .items { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
  .items th, .items td { border: 1px solid #000; padding: 4px 6px; }
  .items th { background: #f0f0f0; font-weight: bold; }
  .c { text-align: center; } .r { text-align: right; }
  .sign { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; font-size: 10pt; }
  .sign div { border-top: 1px solid #000; padding-top: 4px; margin-top: 28px; }
  .sign-block { margin-top: 28px; margin-bottom: 4px; font-size: 10pt; }
  .sign-row { display: grid; grid-template-columns: 56px 1fr 0.62fr 1fr; gap: 0 4px; align-items: start; margin-bottom: 8px; }
  .sign-row:last-child { margin-bottom: 0; }
  .sign-row-received .sign-col-narrow { grid-column: 3; }
  .sign-row-received .sign-col:last-child { grid-column: 4; }
  .sign-role { font-weight: bold; white-space: nowrap; padding-right: 6px; align-self: center; }
  .sign-col-narrow { justify-self: center; width: 100%; max-width: 120px; }
  .sign-field { display: flex; flex-direction: column; align-items: stretch; text-align: center; overflow: visible; }
  .sign-field-narrow { max-width: 120px; margin: 0 auto; width: 100%; }
  .sign-value { min-height: 1.25em; font-size: 10pt; line-height: 1.25; padding: 0 4px 6px; }
  .sign-line { height: 1px; min-height: 1px; background: #000; border: none; margin: 0 4px; flex-shrink: 0; width: calc(100% - 8px); align-self: center; }
  .sign-caption { font-size: 8pt; text-align: center; color: #000; padding: 4px 2px 2px; line-height: 1.3; min-height: 1.3em; overflow: visible; }
  .legal { font-size: 9pt; margin-top: 12px; }
  .section-title { text-align: center; font-size: 12pt; font-weight: bold; margin: 20px 0 10px; }
  .doc-section-break { margin-top: 32px; padding-top: 24px; border-top: 2px dashed #999; }
  @media print { body { padding: 0; } .doc-section-break { page-break-before: always; border: none; margin-top: 0; padding-top: 16mm; } }
`

const CASH_RECEIPT_STYLES = `
  * { box-sizing: border-box; }
  html, body { background: #fff; color: #000; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; margin: 0; padding: 16mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 190mm; margin: 0 auto; }
  .doc-head { position: relative; margin-bottom: 8px; padding-right: 124px; min-height: 108px; }
  .doc-head h1 { text-align: center; font-size: 14pt; margin: 0 0 4px; text-transform: uppercase; }
  .doc-head .sub { text-align: center; font-size: 10pt; margin-bottom: 10px; }
  .doc-logo { position: absolute; top: 0; right: 0; width: 112px; height: auto; object-fit: contain; display: block; }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .meta td { padding: 3px 6px; vertical-align: top; }
  .lbl { width: 32%; font-weight: bold; }
  .items { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; table-layout: fixed; }
  .items th, .items td { border: 1px solid #000; padding: 4px 6px; }
  .items th { background: #f0f0f0; font-weight: bold; }
  .items th:nth-child(1), .items td:nth-child(1) { width: 4%; }
  .items th:nth-child(3), .items td:nth-child(3) { width: 7%; }
  .items th:nth-child(4), .items td:nth-child(4) { width: 9%; }
  .items th:nth-child(5), .items td:nth-child(5) { width: 13%; }
  .items th:nth-child(6), .items td:nth-child(6) { width: 13%; }
  .c { text-align: center; } .r { text-align: right; }
  .sign-block { margin-top: 28px; margin-bottom: 4px; font-size: 10pt; }
  .sign-row { display: grid; grid-template-columns: 56px 1fr 0.62fr 1fr; gap: 0 4px; align-items: start; margin-bottom: 8px; }
  .sign-row:last-child { margin-bottom: 0; }
  .sign-row-received .sign-col-narrow { grid-column: 3; }
  .sign-row-received .sign-col:last-child { grid-column: 4; }
  .sign-role { font-weight: bold; white-space: nowrap; padding-right: 6px; align-self: center; }
  .sign-col-narrow { justify-self: center; width: 100%; max-width: 120px; }
  .sign-field { display: flex; flex-direction: column; align-items: stretch; text-align: center; overflow: visible; }
  .sign-field-narrow { max-width: 120px; margin: 0 auto; width: 100%; }
  .sign-value { min-height: 1.25em; font-size: 10pt; line-height: 1.25; padding: 0 4px 6px; }
  .sign-line { height: 1px; min-height: 1px; background: #000; border: none; margin: 0 4px; flex-shrink: 0; width: calc(100% - 8px); align-self: center; }
  .sign-caption { font-size: 8pt; text-align: center; color: #000; padding: 4px 2px 2px; line-height: 1.3; min-height: 1.3em; overflow: visible; }
  .doc-title, .section-title { text-align: center; font-size: 12pt; font-weight: bold; line-height: 1.35; }
  .doc-title { margin: 0 0 4px; }
  .section-title { margin: 20px 0 10px; }
  .sub { text-align: center; font-size: 10pt; margin-bottom: 12px; }
  @media print { body { padding: 0; } }
`

function wrap(body: string, opts: { narrow?: boolean; cashReceipt?: boolean } = {}) {
  const styles = opts.cashReceipt
    ? CASH_RECEIPT_STYLES
    : BASE_STYLES.replace(
        '.page { max-width: 210mm; margin: 0 auto; }',
        `.page { max-width: ${opts.narrow ? '80mm' : '210mm'}; margin: 0 auto; }`
      )

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/>${
    opts.cashReceipt ? '<meta name="color-scheme" content="light"/>' : ''
  }<title></title>
<style>${styles}</style></head><body><div class="page">${body}</div></body></html>`
}

export type PrintInput = {
  docType: DocumentTypeId
  documentNumber: string
  documentDate: string
  data: GenericDocData
  logoSrc?: string
}

export function renderGenericDocumentHtml({ docType, documentNumber, documentDate, data, logoSrc: logoSrcInput }: PrintInput): string {
  const num = esc(documentNumber)
  const date = fmtDate(documentDate)
  const total = calcLinesTotal(data.lines) || Number(data.amount) || Number(data.total) || 0

  const headerStandard = (printTitle: string) => `
    <h1>${esc(printTitle)}</h1>
    <div class="sub">№ ${num} от ${date}</div>
    <table class="meta">
      ${row2('Организация', esc(COMPANY.legalName) + ', ИНН ' + esc(COMPANY.inn))}
      ${row2('Адрес', esc(COMPANY.address))}
    </table>`

  const headerCompact = (printTitle: string) => `
    <div class="doc-title">${esc(printTitle)}</div>
    <div class="sub">№ ${num} от ${date}</div>
    <table class="meta">
      ${row2('Организация', esc(COMPANY.legalName) + ', ИНН ' + esc(COMPANY.inn))}
      ${row2('Адрес', esc(COMPANY.address))}
    </table>`

  const headerCashReceipt = (printTitle: string) => {
    const logoSrc = logoSrcInput || FIXNET_RECEIPT_LOGO_SRC
    return `
    <div class="doc-head">
      <div>
        <h1>${esc(printTitle)}</h1>
        <div class="sub">№ ${num} от ${date}</div>
      </div>
      <img class="doc-logo" src="${logoSrc}" alt="ФиксНэт" width="112" height="112" />
    </div>
    <table class="meta">
      ${row2('Организация', esc(COMPANY.legalName) + ', ИНН ' + esc(COMPANY.inn))}
      ${row2('Адрес', esc(COMPANY.address))}
      ${row2('Телефон', esc(COMPANY.phone))}
    </table>`
  }

  const party = `
    <table class="meta">
      ${data.client ? row2('Контрагент', esc(data.client)) : ''}
      ${data.clientInn ? row2('ИНН/КПП', esc(data.clientInn) + (data.clientKpp ? ' / ' + esc(data.clientKpp) : '')) : ''}
      ${data.clientAddress ? row2('Адрес', esc(data.clientAddress)) : ''}
      ${data.phone ? row2('Телефон', esc(data.phone)) : ''}
    </table>`

  const signs = (a = 'Ответственный', b = 'Получатель') => `
    <div class="sign">
      <div>${esc(a)}: ${esc(data.passedBy || '_______________')}</div>
      <div>${esc(b)}: ${esc(data.receivedBy || '_______________')}</div>
    </div>`

  const cashReceiptSigns = () => {
    const receiverName = data.receivedBy || data.client || ''
    return `
    <div class="sign-block">
      <div class="sign-row">
        <div class="sign-role">Выдал</div>
        <div class="sign-col">${signField(data.issuedByPosition || '', 'Должность')}</div>
        <div class="sign-col sign-col-narrow">${signField('', 'подпись', { blank: true, narrow: true })}</div>
        <div class="sign-col">${signField(data.passedBy || '', 'Расшифровка')}</div>
      </div>
      <div class="sign-row sign-row-received">
        <div class="sign-role">Получил</div>
        <div class="sign-col sign-col-narrow">${signField('', 'подпись', { blank: true, narrow: true })}</div>
        <div class="sign-col">${signField(receiverName, 'Расшифровка')}</div>
      </div>
    </div>`
  }

  switch (docType) {
    case 'cash_receipt_kkm':
      return wrap(`
        ${headerStandard('КАССОВЫЙ ЧЕК (ККМ)')}
        ${data.client ? `<p><b>Покупатель:</b> ${esc(data.client)}</p>` : ''}
        ${linesTable(data)}
        <p><b>Итого к оплате:</b> ${money(total)}</p>
        <p><b>Оплата:</b> ${esc(data.paymentMethod)}</p>
        ${data.cashier ? `<p><b>Кассир:</b> ${esc(data.cashier)}</p>` : ''}
      `, { narrow: true })

    case 'cash_receipt':
      return wrap(`
        ${headerCashReceipt('КАССОВЫЙ ЧЕК')}
        ${data.client ? `<p><b>Покупатель:</b> ${esc(data.client)}</p>` : ''}
        ${linesTable(data, false, true)}
        <p><b>Итого к оплате:</b> ${amount(total)}</p>
        <p><b>Оплата:</b> ${esc(data.paymentMethod)}</p>
        ${data.cashier ? `<p><b>Кассир:</b> ${esc(data.cashier)}</p>` : ''}
        ${cashReceiptSigns()}
      `, { cashReceipt: true })

    case 'torg12':
      return wrap(`
        ${headerStandard('ТОВАРНАЯ НАКЛАДНАЯ (ТОРГ-12)')}
        <p><b>Грузоотправитель:</b> ${esc(COMPANY.legalName)}</p>
        <p><b>Грузополучатель:</b> ${esc(data.client)}</p>
        <p><b>Склад:</b> ${esc(data.warehouse)}</p>
        ${data.basis ? `<p><b>Основание:</b> ${esc(data.basis)}</p>` : ''}
        ${linesTable(data)}
        ${signs('Отпустил', 'Получил')}
      `)

    case 'material_release':
      return wrap(`
        ${headerStandard('ТРЕБОВАНИЕ-НАКЛАДНАЯ')}
        <p><b>Со склада:</b> ${esc(data.warehouse)}</p>
        <p><b>Кому / куда:</b> ${esc(data.purpose)}</p>
        ${data.basis ? `<p><b>Основание:</b> ${esc(data.basis)}</p>` : ''}
        ${linesTable(data)}
        ${signs('Отпустил', 'Получил')}
      `)

    case 'upd':
      return wrap(`
        ${headerStandard('УНИВЕРСАЛЬНЫЙ ПЕРЕДАТОЧНЫЙ ДОКУМЕНТ')}
        ${party}
        ${data.basis ? `<p><b>Основание:</b> ${esc(data.basis)}</p>` : ''}
        ${linesTable(data, true)}
        ${signs('Передал', 'Получил')}
      `)

    case 'payment_invoice':
      return wrap(`
        ${headerStandard('СЧЁТ НА ОПЛАТУ')}
        ${party}
        ${data.bankName ? `<p><b>Банк:</b> ${esc(data.bankName)}, БИК ${esc(data.bankBik)}</p>` : ''}
        ${data.bankAccount ? `<p><b>Р/с:</b> ${esc(data.bankAccount)}</p>` : ''}
        ${data.purpose ? `<p><b>Назначение:</b> ${esc(data.purpose)}</p>` : ''}
        ${linesTable(data)}
        <p class="legal">Оплатить не позднее 5 банковских дней. Счёт действителен в течение 3 рабочих дней.</p>
      `)

    case 'work_completion_act':
      return wrap(`
        ${headerStandard('АКТ ОБ ОКАЗАНИИ УСЛУГ')}
        ${party}
        ${data.basis ? `<p><b>Основание:</b> ${esc(data.basis)}</p>` : ''}
        <p>Исполнитель оказал, а Заказчик принял следующие услуги:</p>
        ${linesTable(data)}
        <p><b>Итого:</b> ${money(total)} — услуги выполнены в полном объёме, стороны претензий не имеют.</p>
        ${signs('Исполнитель', 'Заказчик')}
      `)

    case 'vat_invoice':
      return wrap(`
        ${headerStandard('СЧЁТ-ФАКТУРА')}
        ${party}
        ${linesTable(data, true)}
        <p><b>Сумма НДС:</b> ${money(data.vatAmount || 0)}</p>
        ${signs('Руководитель', 'Главный бухгалтер')}
      `)

    case 'cash_in_order':
      return wrap(`
        ${headerStandard('ПРИХОДНЫЙ КАССОВЫЙ ОРДЕР (ПКО)')}
        <table class="meta">
          ${row2('Принято от', esc(data.fromWhom))}
          ${row2('Основание', esc(data.basis))}
          ${row2('Сумма', money(data.amount || total))}
          ${row2('Вид оплаты', esc(data.paymentMethod))}
        </table>
        <div class="sign">
          <div>Кассир: ${esc(data.cashier || '_______________')}</div>
          <div>Гл. бухгалтер: ${esc(data.chiefAccountant || '_______________')}</div>
        </div>
      `)

    case 'cash_out_order':
      return wrap(`
        ${headerStandard('РАСХОДНЫЙ КАССОВЫЙ ОРДЕР (РКО)')}
        <table class="meta">
          ${row2('Выдать', esc(data.toWhom))}
          ${row2('Основание', esc(data.basis))}
          ${row2('Сумма', money(data.amount || total))}
        </table>
        <div class="sign">
          <div>Руководитель: ${esc(data.passedBy || '_______________')}</div>
          <div>Кассир: ${esc(data.cashier || '_______________')}</div>
          <div>Получил: ${esc(data.receivedBy || '_______________')}</div>
        </div>
      `)

    case 'warranty_card':
      return wrap(`
        ${headerStandard('ГАРАНТИЙНЫЙ ТАЛОН')}
        <table class="meta">
          ${row2('Клиент', esc(data.client))}
          ${row2('Телефон', esc(data.phone))}
          ${row2('Устройство', esc([data.brand, data.model].filter(Boolean).join(' ')))}
          ${row2('S/N', esc(data.serialNumber))}
          ${row2('IMEI', esc(data.imei))}
          ${row2('Срок гарантии', esc(data.warrantyMonths) + ' мес.')}
        </table>
        <p class="legal">${esc(data.warrantyTerms)}</p>
        <p>Дата выдачи: ${date}</p>
      `)

    case 'acceptance_act':
      return wrap(`
        ${headerStandard('АКТ ПРИЁМА-ПЕРЕДАЧИ')}
        <table class="meta">
          ${row2('Клиент', esc(data.client))}
          ${row2('Устройство', esc([data.brand, data.model].filter(Boolean).join(' ')))}
          ${row2('S/N', esc(data.serialNumber))}
          ${row2('Состояние', esc(data.condition))}
        </table>
        ${data.notes ? `<p><b>Примечание:</b> ${esc(data.notes)}</p>` : ''}
        <p>Устройство передано клиенту в исправном состоянии, клиент претензий не имеет.</p>
        ${signs('Исполнитель', 'Клиент')}
      `)

    case 'acceptance_warranty':
      return wrap(`
        ${headerCompact('АКТ ПРИЁМА-ПЕРЕДАЧИ И ГАРАНТИЙНЫЙ ТАЛОН')}
        <table class="meta">
          ${row2('Клиент', esc(data.client))}
          ${row2('Телефон', esc(data.phone))}
          ${row2('Устройство', esc([data.brand, data.model].filter(Boolean).join(' ')))}
          ${row2('S/N', esc(data.serialNumber))}
          ${row2('Состояние', esc(data.condition))}
        </table>
        <p>Устройство передано клиенту в исправном состоянии, клиент претензий не имеет.</p>
        <div class="section-title">Гарантийные условия</div>
        <table class="meta">
          ${row2('Срок гарантии', esc(data.warrantyMonths) + ' мес.')}
          ${row2('Гарантия предоставляется на', esc(data.warrantyTerms))}
        </table>
        ${cashReceiptSigns()}
      `, { cashReceipt: true })

    default:
      return wrap(`<h1>Документ</h1><p>№ ${num} от ${date}</p>`)
  }
}

export function printDocumentHtml(html: string) {
  return openPrintWindow(html)
}
