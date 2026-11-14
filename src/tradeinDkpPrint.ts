import { openPrintWindow } from './printWindow'

export type TradeInDkpData = {
  documentNumber?: string
  documentDate?: string
  buyerCompanyName?: string
  buyerInn?: string
  buyerAddress?: string
  buyerCity?: string
  sellerName?: string
  sellerPhone?: string
  sellerPassport?: string
  sellerAddress?: string
  brand?: string
  model?: string
  color?: string
  memory?: string
  imei?: string
  imei2?: string
  serialNumber?: string
  equipment?: string
  conditionGrade?: string
  conditionNotes?: string
  buyPrice?: number | string
  amount?: number | string
}

function esc(v: unknown) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(v: unknown) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${n.toLocaleString('ru-RU')} ₽`
}

/** Типовой ДКП б/у телефона (trade-in): стороны, IMEI, состояние, цена, гарантии продавца. */
export function renderTradeInDkpHtml(data: TradeInDkpData) {
  const num = esc(data.documentNumber || '—')
  const date = esc(data.documentDate || new Date().toISOString().slice(0, 10))
  const city = esc(data.buyerCity || 'г. ________')
  const device = [data.brand, data.model, data.memory, data.color].filter(Boolean).join(' ')

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>ДКП ${num}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #111; line-height: 1.35; }
    h1 { text-align: center; font-size: 14pt; margin: 0 0 8px; }
    .sub { text-align: center; margin-bottom: 16px; }
    .meta { width: 100%; border-collapse: collapse; margin: 10px 0 14px; }
    .meta td { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
    .meta td.k { width: 34%; background: #f5f5f5; font-weight: 600; }
    p { margin: 8px 0; text-align: justify; }
    .sign { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; }
    .sign > div { width: 48%; }
    .line { margin-top: 28px; border-top: 1px solid #333; padding-top: 4px; font-size: 10pt; }
    .small { font-size: 10pt; color: #333; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <h1>ДОГОВОР КУПЛИ-ПРОДАЖИ<br/>мобильного устройства, бывшего в употреблении</h1>
  <div class="sub">№ ${num} от ${date} · ${city}</div>

  <p>
    <b>Покупатель:</b> ${esc(data.buyerCompanyName || '________________')}${
      data.buyerInn ? `, ИНН ${esc(data.buyerInn)}` : ''
    }${data.buyerAddress ? `, адрес: ${esc(data.buyerAddress)}` : ''},
    именуемый в дальнейшем «Покупатель», с одной стороны, и
  </p>
  <p>
    <b>Продавец:</b> ${esc(data.sellerName || '________________')},
    паспорт: ${esc(data.sellerPassport || '________________')},
    ${data.sellerAddress ? `адрес регистрации: ${esc(data.sellerAddress)}, ` : ''}
    тел.: ${esc(data.sellerPhone || '________________')},
    именуемый в дальнейшем «Продавец», с другой стороны,
    совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем.
  </p>

  <p><b>1. Предмет договора</b></p>
  <p>1.1. Продавец продаёт, а Покупатель принимает и оплачивает следующее мобильное устройство (далее — «Товар»):</p>
  <table class="meta">
    <tr><td class="k">Устройство</td><td>${esc(device || '—')}</td></tr>
    <tr><td class="k">IMEI / IMEI 2</td><td>${esc(data.imei || '—')}${data.imei2 ? ` / ${esc(data.imei2)}` : ''}</td></tr>
    <tr><td class="k">Серийный номер</td><td>${esc(data.serialNumber || '—')}</td></tr>
    <tr><td class="k">Комплектация</td><td>${esc(data.equipment || '—')}</td></tr>
    <tr><td class="k">Состояние / грейд</td><td>${esc(data.conditionGrade || '—')}</td></tr>
    <tr><td class="k">Описание состояния и дефектов</td><td>${esc(data.conditionNotes || '—')}</td></tr>
    <tr><td class="k">Цена выкупа</td><td><b>${money(data.buyPrice ?? data.amount)}</b></td></tr>
  </table>

  <p><b>2. Цена и порядок расчётов</b></p>
  <p>2.1. Стоимость Товара составляет ${money(data.buyPrice ?? data.amount)} и уплачивается Покупателем Продавцу в момент подписания настоящего Договора и передачи Товара.</p>
  <p>2.2. Расчёты производятся наличными денежными средствами и/или иным согласованным способом. Факт оплаты подтверждается подписями Сторон.</p>

  <p><b>3. Передача Товара и переход права собственности</b></p>
  <p>3.1. Товар передаётся Покупателю в момент подписания настоящего Договора. Право собственности и риск случайной гибели переходят к Покупателю с момента передачи.</p>
  <p>3.2. Покупатель вправе осмотреть Товар, проверить IMEI (*#06#) и работоспособность до подписания.</p>

  <p><b>4. Гарантии и заверения Продавца</b></p>
  <p>4.1. Продавец гарантирует, что на момент передачи:</p>
  <p class="small">
    — Товар принадлежит Продавцу на праве собственности;<br/>
    — Товар не находится в залоге, под арестом, в розыске и не является предметом спора;<br/>
    — отсутствуют блокировки учётных записей (включая iCloud / Google FRP), пароли и иные программные ограничения, препятствующие использованию;<br/>
    — указанные IMEI / серийный номер соответствуют передаваемому устройству;<br/>
    — Продавец сообщил о всех известных ему дефектах и повреждениях.
  </p>
  <p>4.2. Товар принимается как бывший в употреблении, «как есть», с учётом описанного состояния. Скрытые дефекты, о которых Продавец не сообщил, дают Покупателю право требовать соразмерного уменьшения цены либо расторжения договора в порядке, предусмотренном законодательством РФ.</p>

  <p><b>5. Прочие условия</b></p>
  <p>5.1. Настоящий Договор составлен в двух экземплярах, имеющих равную юридическую силу — по одному для каждой из Сторон.</p>
  <p>5.2. Во всём, что не урегулировано Договором, Стороны руководствуются законодательством Российской Федерации.</p>

  <div class="sign">
    <div>
      <b>Продавец</b><br/>
      ${esc(data.sellerName || '')}<br/>
      <div class="line">подпись / расшифровка</div>
    </div>
    <div>
      <b>Покупатель</b><br/>
      ${esc(data.buyerCompanyName || '')}<br/>
      <div class="line">подпись / расшифровка / М.П.</div>
    </div>
  </div>
</body>
</html>`
}

export function printTradeInDkp(data: TradeInDkpData) {
  return openPrintWindow(renderTradeInDkpHtml(data))
}
