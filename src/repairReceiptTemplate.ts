import { openPrintWindow } from './printWindow'
import { PUBLIC_SITE_URL } from './config'

export type RepairReceiptInput = {
  company?: {
    name?: string
    legalName?: string
    legalAddress?: string
    postalAddress?: string
    phone?: string
    email?: string
    website?: string
    inn?: string
    ogrnip?: string
    workHours?: string
  }
  order: {
    id: number
    documentNumber?: string
    publicToken?: string
    clientSignatureUrl?: string
    clientSignedAt?: string | null
    client: string
    phone: string
    email?: string
    clientAddress?: string
    deviceType?: string
    brand?: string
    model?: string
    color?: string
    imei?: string
    serialNumber?: string
    equipment?: string
    devicePassword?: string
    problem?: string
    description?: string
    receiverNotes?: string
    dueAt?: string | null
    estimatedPrice?: number | null
    prepayment?: number | null
    inspection?: Record<string, any>
    wishes?: Record<string, any>
    problems?: Array<{ problemName?: string; problemDescription?: string }>
  }
  documentDate?: string
  trackUrl?: string
}

function esc(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function val(v: any, fb = '—') {
  const s = String(v ?? '').trim()
  return s ? esc(s) : fb
}

function money(v: any) {
  const n = Number(v)
  if (!n) return '—'
  return `${n.toLocaleString('ru-RU')} ₽`
}

function fmtDateTime(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const DEFAULT_COMPANY = {
  name: 'Сервисный центр «ФиксНэт»',
  legalName: 'ИП «Сторожук Ф.Д.»',
  legalAddress: '366013, Респ. Чечня, с. Толстой-Юрт, ул. Поселок 3-я',
  postalAddress: '355013, г. Ставрополь, ул. Мимоз, д. 26/1',
  inn: '263509629143',
  ogrnip: '326200000019682',
  email: 'fixnet@mail.ru',
  website: 'www.фикснэт.рф',
  phone: '+7 (993) 309-08-28',
  workHours: 'пн–пт 10:00–20:00, сб–вс 10:00–17:00'
}

/** Сокращённые условия — защита сервиса, всё на 1 странице */
const LEGAL_TERMS = [
  '1. Сведения в квитанции указаны клиентом / с его слов. Устройство принято в описанном состоянии; дефекты, следы влаги, вскрытия и повреждения возникли до передачи в «ФиксНэт» (Сервис). Приёмная диагностика неполная; скрытые неисправности могут быть выявлены позже — работы и цена согласовываются с клиентом (телефон / SMS / мессенджер / e-mail).',
  '2. Ориентир цены и срока предварительные. Макс. срок работ — 45 дней (может продлеваться: запчасти, согласование, сложность). Готовность — с даты уведомления. Возможна потеря данных; бэкап — обязанность клиента. Сервис не отвечает за сохранность информации на устройстве.',
  '3. Гарантия — 30 календарных дней с выдачи только на выполненные работы / установленный узел. Не действует при: физ./мех. повреждениях, падении, ударах, трещинах/сколах, влаге/жидкости/конденсате, коррозии, перегреве, вскрытии/ремонте третьими лицами, нештатных ЗУ, ПО-вмешательстве, износе, нарушении эксплуатации.',
  '4. После попадания влаги (в т.ч. следы влаги / окисления) гарантия на работы и устройство по данному обращению не предоставляется. Риск повторных неисправностей после залития разъяснён. Восстановление не гарантируется при критическом повреждении платы, влаге, отсутствии ЗЧ.',
  '5. Хранение готового — 30 дней с уведомления; далее — плата за хранение и/или распоряжение по закону РФ. Отказ от ремонта после начала работ — оплата факт. расходов. Ответственность Сервиса ограничена суммой оплаченных работ (кроме императивных норм). Косвенные убытки / данные — не возмещаются.',
  '6. Согласие на обработку персональных данных для исполнения договора и связи по ремонту. Подпись / сообщение с контакта клиента = ознакомление с состоянием при приёме, согласие с условиями, понимание отсутствия гарантии при влаге и физ. повреждениях.',
]

export function renderRepairReceiptHtml(input: RepairReceiptInput) {
  const c = { ...DEFAULT_COMPANY, ...(input.company || {}) }
  const o = input.order
  const insp = o.inspection || {}
  const docNum = o.documentNumber || String(o.id)
  const date = input.documentDate
    ? new Date(input.documentDate).toLocaleDateString('ru-RU')
    : new Date().toLocaleDateString('ru-RU')
  const works =
    (o.problems || []).map((p) => p.problemName || '').filter(Boolean).join('; ') ||
    o.problem ||
    '—'
  const partType =
    (o.problems || []).map((p) => p.problemDescription || '').filter(Boolean).join('; ') ||
    o.description ||
    ''
  const condition = [
    o.receiverNotes,
    insp.other,
    Array.isArray(insp.tags) ? insp.tags.join(', ') : '',
  ]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ') || 'без особых отметок'

  const trackUrl =
    input.trackUrl ||
    (o.publicToken
      ? `${PUBLIC_SITE_URL}/track/${o.publicToken}`
      : '')
  const qrSrc = trackUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=6&data=${encodeURIComponent(trackUrl)}`
    : ''
  const clientSignature = String(o.clientSignatureUrl || '').trim()
  const signedAt = o.clientSignedAt ? fmtDateTime(o.clientSignedAt) : ''

  const body = `
<div class="sheet">
  <header class="head">
    <div class="brand-block">
      <div class="brand">Фикс<span>Нэт</span></div>
      <div class="brand-sub">${val(c.name, '')}</div>
      <div class="meta-line">${val(c.postalAddress, '')} · ${val(c.phone, '')}</div>
      <div class="meta-line">${val(c.workHours, '')}</div>
    </div>
    ${
      qrSrc
        ? `<div class="qr-block">
            <img class="qr" src="${esc(qrSrc)}" alt="QR статус" />
            <div class="qr-cap">Статус ремонта<br/>по QR</div>
          </div>`
        : ''
    }
  </header>

  <div class="title-row">
    <div>
      <div class="doc-label">Квитанция о приёме на ремонт</div>
      <div class="doc-num">№ ${val(docNum)} <span>· ${val(date)}</span></div>
    </div>
    <div class="due">
      <div class="due-label">Ориентир. срок</div>
      <div class="due-val">${val(fmtDateTime(o.dueAt))}</div>
    </div>
  </div>

  <section class="card">
    <h2>Клиент</h2>
    <div class="grid2">
      <div><span>ФИО</span><b>${val(o.client)}</b></div>
      <div><span>Телефон</span><b>${val(o.phone)}</b></div>
    </div>
  </section>

  <section class="card">
    <h2>Устройство</h2>
    <div class="grid2">
      <div><span>Устройство</span><b>${val([o.brand, o.model].filter(Boolean).join(' ') || o.deviceType)}</b></div>
      <div><span>Цвет</span><b>${val(o.color)}</b></div>
      <div><span>IMEI / S/N</span><b>${val(o.imei || o.serialNumber)}</b></div>
      <div><span>Комплектация</span><b>${val(o.equipment)}</b></div>
      <div class="full"><span>Заявленная неисправность</span><b>${val(works)}</b></div>
      ${partType ? `<div class="full"><span>Тип запчасти / уточнение</span><b>${val(partType)}</b></div>` : ''}
      <div class="full"><span>Состояние при приёме</span><b>${val(condition)}</b></div>
    </div>
  </section>

  <section class="card money-card">
    <div class="grid2">
      <div><span>Ориентировочная стоимость</span><b>${esc(money(o.estimatedPrice))}</b></div>
      <div><span>Предоплата</span><b>${esc(money(o.prepayment))}</b></div>
    </div>
  </section>

  ${
    trackUrl
      ? `<section class="track-note">Отслеживание статуса: <b>${esc(trackUrl)}</b></section>`
      : ''
  }

  <section class="legal">
    <div class="legal-title">Условия приёма, ремонта и гарантии</div>
    ${LEGAL_TERMS.map((p) => `<p>${esc(p)}</p>`).join('')}
    <p class="legal-ack"><b>С условиями ознакомлен, согласен. Претензий к описанию состояния при приёме не имею.</b></p>
  </section>

  <section class="signs">
    <div class="sign">
      <div class="sign-title">Клиент</div>
      ${
        clientSignature
          ? `<div class="signature-image-wrap"><img class="signature-image" src="${esc(clientSignature)}" alt="Подпись клиента" /></div>
             <div class="sign-cap">${val(o.client)} · ${val(signedAt)}</div>`
          : `<div class="sign-line"></div>
             <div class="sign-cap">подпись / расшифровка / дата</div>`
      }
    </div>
    <div class="sign">
      <div class="sign-title">Представитель «ФиксНэт»</div>
      <div class="sign-line"></div>
      <div class="sign-cap">подпись / расшифровка / дата</div>
    </div>
  </section>

  <footer class="foot">
    ${val(c.legalName, '')}, ИНН ${val(c.inn, '')}, ОГРНИП ${val(c.ogrnip, '')}
  </footer>
</div>`

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><title>Квитанция ${esc(docNum)}</title>
<style>
  @page { size: A4; margin: 7mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", "PT Sans", Arial, sans-serif;
    color: #0f172a;
    background: #fff;
    font-size: 10pt;
  }
  .sheet { max-width: 196mm; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; margin-bottom: 8px; }
  .brand { font-size: 22pt; font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
  .brand span { color: #ca8a04; }
  .brand-sub { font-weight: 700; margin-top: 3px; font-size: 10pt; }
  .meta-line { color: #475569; font-size: 8pt; margin-top: 1px; }
  .qr-block { text-align: center; }
  .qr { width: 22mm; height: 22mm; border: 1px solid #e2e8f0; border-radius: 8px; }
  .qr-cap { font-size: 7pt; color: #64748b; margin-top: 2px; line-height: 1.15; }
  .title-row { display: flex; justify-content: space-between; gap: 12px; align-items: flex-end; margin-bottom: 8px; border-bottom: 2px solid #0f172a; padding-bottom: 6px; }
  .doc-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
  .doc-num { font-size: 14pt; font-weight: 800; }
  .doc-num span { font-size: 10pt; font-weight: 600; color: #475569; }
  .due { text-align: right; }
  .due-label { font-size: 7.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }
  .due-val { font-size: 11pt; font-weight: 800; color: #0f766e; }
  .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 7px 10px; margin-bottom: 6px; }
  .card h2 { margin: 0 0 5px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 12px; }
  .grid2 .full { grid-column: 1 / -1; }
  .grid2 span { display: block; font-size: 7.5pt; color: #94a3b8; margin-bottom: 1px; }
  .grid2 b { font-weight: 700; font-size: 9.5pt; }
  .money-card { background: #f8fafc; }
  .track-note { font-size: 7.5pt; color: #334155; margin: 0 0 6px; word-break: break-all; }
  .legal { font-size: 7pt; color: #334155; line-height: 1.25; margin-bottom: 8px; text-align: justify; }
  .legal-title { font-weight: 800; font-size: 8pt; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .legal p { margin: 0 0 2.5px; }
  .legal-ack { margin-top: 4px !important; text-align: center; font-size: 7.5pt; }
  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 4px; }
  .sign-title { font-weight: 700; margin-bottom: 12px; font-size: 9pt; }
  .sign-line { border-bottom: 1px solid #0f172a; height: 14px; }
  .signature-image-wrap { height: 18mm; border-bottom: 1px solid #0f172a; display: flex; align-items: flex-end; justify-content: center; overflow: hidden; }
  .signature-image { max-width: 95%; max-height: 17mm; object-fit: contain; }
  .sign-cap { font-size: 7pt; color: #94a3b8; margin-top: 3px; text-align: center; }
  .foot { margin-top: 8px; font-size: 7pt; color: #94a3b8; text-align: center; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { page-break-after: avoid; page-break-inside: avoid; }
  }
</style></head><body>${body}</body></html>`
}

export function printRepairReceipt(html: string) {
  return openPrintWindow(html)
}
