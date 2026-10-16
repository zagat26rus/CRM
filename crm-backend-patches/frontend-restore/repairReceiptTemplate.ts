import qrcode from 'qrcode-generator'
import { openPrintWindow } from './printWindow'

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
    problem?: string
    description?: string
    receiverNotes?: string
    inspection?: Record<string, any>
    wishes?: Record<string, any>
    problems?: Array<{ problemName?: string; problemDescription?: string }>
    publicToken?: string | null
  }
  documentDate?: string
  trackBaseUrl?: string
}

export const TRACK_BASE_URL = 'https://fedfix.ru'

function trackQrSvg(url: string) {
  const qr = qrcode(0, 'M')
  qr.addData(url)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true })
}

function trackBlock(o: RepairReceiptInput['order'], baseUrl: string) {
  const token = String(o.publicToken || '').trim()
  if (token) {
    const url = `${baseUrl.replace(/\/+$/, '')}/track/${token}`
    return `<div class="track-block"><div class="track-qr">${trackQrSvg(url)}</div><div class="track-text">Отслеживание ремонта онлайн: отсканируйте QR-код или откройте ссылку<br/><b>${esc(url)}</b><br/>Номер заявки: <b>${val(String(o.id))}</b></div></div>`
  }
  if (o.id) {
    return `<div class="track">Номер заявки для отслеживания на сайте fixnet.pro: <b>${val(String(o.id))}</b></div>`
  }
  return ''
}

function esc(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function val(v: any, fb = '') {
  const s = String(v ?? '').trim()
  return s ? esc(s) : fb
}

function joinArr(v: any) {
  if (!Array.isArray(v)) return val(v)
  const items = v.map((x) => String(x ?? '').trim()).filter(Boolean)
  return items.length ? esc(items.join(', ')) : 'не указано'
}

function row(label: string, value: string, bold = true) {
  return `<tr><td class="lbl">${bold ? `<b>${esc(label)}</b>` : esc(label)}</td><td class="val" colspan="3">${value || '&nbsp;'}</td></tr>`
}

function sectionTitle(text: string) {
  return `<tr><td class="section" colspan="4">${esc(text)}</td></tr>`
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
  workHours: 'с 10:00 до 20:00 (понедельник-пятница), с 10:00 до 17:00 (суббота-воскресенье)'
}

const STUB_TEXT =
  'Данный корешок квитанции подтверждает произведенные ремонт/обслуживание устройства/техники. Устройство/технику (и дополнительное оборудование в случае его наличия) получил, проверил, заявленные при приеме на ремонт/обслуживание неисправности/повреждения устранены, претензий по объему, качеству и срокам оказанных услуг/работ не имею.'

const LEGAL_PARAGRAPHS = [
  'Клиент согласен, что все неисправности и повреждения, которые обнаружены в случае проведения предварительной диагностики в момент обращения либо которые могут быть обнаружены в ходе дальнейшего ремонта/обслуживания принимаемого устройства/техники, возникли до приема устройства/техники по данной квитанции.',
  'Максимальный срок проведения ремонта/обслуживания составляет 45 дней с момента приема устройства/техники.',
  'Клиент согласен, что в случае невозможности проведения ремонта/обслуживания в сервисном центре «ФиксНэт» будет извещен сотрудником сервисного центра (путем направления корреспонденции, мобильной либо иной связью, по данным, указанным в настоящей квитанции).',
  'Моментом окончания ремонта/обслуживания считается дата уведомления клиента (путем направления корреспонденции, мобильной либо иной связью, по данным, указанным в настоящей квитанции).',
  'Срок хранения устройства/техники (и дополнительного оборудования в случае его наличия) в сервисном центре «ФиксНэт» составляет не более 30 дней с момента уведомления клиента об окончании выполненных работ/услуг.',
  'В случае неявки клиента за получением результата выполненной работы или иного уклонения клиента от его приемки сервисный центр «ФиксНэт» вправе письменно предупредив заказчика, по истечении 2 (двух) месяцев со дня такого предупреждения продать устройство/технику (и дополнительное оборудование в случае его наличия) за разумную цену, а вырученную сумму, за вычетом всех причитающихся сервисному центру «ФиксНэт» платежей, внести в депозит в порядке, предусмотренном законодательством Российской Федерации.',
  'По желанию клиента ремонт/обслуживание может быть произведен в срочном порядке, в том числе и в нерабочее время сервисного центра «ФиксНэт». При проведении срочного ремонта, в том числе и в нерабочее время сервисного центра «ФиксНэт», стоимость оказываемых услуг увеличивается на сумму, согласованную с клиентом.',
  'По желанию клиента срок хранения устройства/техники (и дополнительного оборудования в случае его наличия) может быть увеличен, в таком случае стоимость оказываемых услуг увеличивается на 20 рублей в день. Увеличение стоимости хранения устройства/техники (и дополнительного оборудования в случае его наличия) исчисляется с момента истечения максимального срока хранения, составляющего 30 дней.',
  'Клиент согласен на сбор и обработку (систематизацию, хранение, передачу сервисным центрам и изготовителю товара) персональных данных, указанных в настоящей квитанции, получение SMS-сообщений рекламного и информационного характера, а также несет ответственность за достоверность предоставленной информации.',
  'Клиент признает юридическую силу за электронными письмами, направленными по адресам электронной почты, мессенджерам, и контактному номеру и признает их равнозначными документам, подписанным собственноручной подписью на бумажных носителях. Клиент заверяет, что только у него есть доступ к соответствующим мессенджерам/электронным адресам (номерам телефонов), указанным в настоящей квитанции.',
  'Клиент обязуется незамедлительно уведомлять сервисный центр обо всех случаях компрометации его адреса электронной почты, мессенджера (взлом, иной факт несанкционированного доступа посторонних лиц или подозрение на него), о случаях блокировки адреса электронной почты или иного ограничения доступа, а также о невозможности открытия или просмотра файлов по причине их повреждения или иным причинам, не зависящим от адресата. В отсутствие такого уведомления юридически значимые сообщения, направленные посредством электронной почты/мессенджера или номера телефона с учетом имеющейся у адресата информации, признаются надлежащими.',
  'Ремонт/обслуживание производится в части, указываемой клиентом. В случае выявления повреждений или неисправностей в ходе дальнейшей диагностики либо при проведении ремонта/обслуживания сервисный центр «ФиксНэт» может известить об этом клиента и согласовать с ним дальнейший ремонт/обслуживание и стоимость оказываемых услуг.',
  'Клиент вправе забрать устройство/технику до окончания ремонта/обслуживания, в случае чего обязан возместить фактически понесенные сервисным центром «ФиксНэт» расходы на ремонт/обслуживание.',
  'Клиент предупрежден, что при проведении ремонта/обслуживания возможна потеря данных, хранящихся в устройстве/технике.',
  'В случае отсутствия запчастей, материалов, технической документации и т.д., сервисный центр «ФиксНэт» вправе в одностороннем порядке отказаться от проведения ремонта, о чем обязан уведомить клиента в порядке, предусмотренном законодательством Российской Федерации.',
  'Сервисный центр «ФиксНэт» предоставляет гарантию на выполненный ремонт/обслуживание на срок 30 дней. Гарантия предоставляется только на выполненный ремонт/обслуживание (замененную деталь/часть либо на выполненную работу), за исключением, когда устройство/техника были повреждены либо приведены в неисправность не по вине сервисного центра «ФиксНэт» после выполненного ремонта/обслуживания на устройство/технику и принятых клиентом.',
  'Гарантия не распространяется на выполненный ремонт/обслуживание (замененную деталь/часть либо на выполненную работу), если устройство/техника были сданы в сервисный центр «ФиксНэт» после попадания влаги, иной токопроводящей жидкости либо были подвержены термическому воздействию. Гарантийный срок начинает течь с момента приемки выполненного ремонта/обслуживания.',
  'В случае, если сервисный центр «ФиксНэт» не может устранить возникшую в ходе гарантийного срока неисправность, клиенту возмещается стоимость оплаченного ремонта/обслуживания.',
  'По желанию клиента устройство/техника (и дополнительное оборудование в случае его наличия) могут быть доставлены по указываемому клиентом адресу. Также устройство/техника могут быть выданы в нерабочее время. В таком случае стоимость оказываемых услуг увеличивается на сумму, согласованную с клиентом.',
  'Сервисный центр «ФиксНэт» в момент обращения клиента по ремонту/обслуживанию либо в ходе дальнейшей диагностики и ремонта/обслуживания может уведомлять клиента о работах и услугах (иных марках/моделях запчастей), которые будут произведены/установлены в ходе ремонта/обслуживания, в том числе, сервисный центр «ФиксНэт» может предлагать иные работы и услуги (иные марки/модели запчастей), в которых возникнет необходимость либо которые могут быть интересны клиенту. В случае согласия клиента на предложенные сервисным центром «ФиксНэт» работы и услуги (иные марки/модели запчастей) стоимость может быть изменена, о чем уведомляется клиент (путем направления корреспонденции, мобильной либо иной связью, по данным, указанным в настоящей квитанции).',
  'С согласия Потребителя товар принимается на гарантийное обслуживание без разборки, проверки неисправностей, внутренних повреждений и следов попадания жидкости, без оценки последствий имеющихся механических повреждений. Клиент не возражает, что данные в настоящей квитанции заполнены им лично или с его слов и являются его субъективным мнением, требующим подтверждения специалистов.',
  'С комплектацией, описанием неисправностей и повреждений, условиями хранения и обслуживания устройства/техники ознакомлен и согласен.'
]

function wishRow(value: string) {
  return `<tr><td class="val wish-val" colspan="4">${value || '&nbsp;'}</td></tr>`
}

function signLine() {
  return `<div class="sign-row">
    <div class="sign-col"><div class="sign-line"></div><div class="sign-cap">(подпись)</div></div>
    <div class="sign-sep">/</div>
    <div class="sign-col sign-col-mid"><div class="sign-line"></div><div class="sign-cap">(дата)</div></div>
    <div class="sign-sep">/</div>
    <div class="sign-col"><div class="sign-line"></div><div class="sign-cap">(фамилия инициалы)</div></div>
  </div>`
}

function signSection(title: string) {
  return `<div class="sign-item"><div class="sign-title"><b>${esc(title)}</b></div>${signLine()}</div>`
}

export function renderRepairReceiptHtml(input: RepairReceiptInput) {
  const c = { ...DEFAULT_COMPANY, ...(input.company || {}) }
  const o = input.order
  const insp = o.inspection || {}
  const wishes = o.wishes || {}
  const docNum = o.documentNumber || String(o.id)
  const date = input.documentDate
    ? new Date(input.documentDate).toLocaleDateString('ru-RU')
    : new Date().toLocaleDateString('ru-RU')
  const works = (o.problems || []).map((p) => p.problemName || p.problemDescription || '').filter(Boolean).join('; ')
    || o.problem || o.description || ''
  const legalMain = LEGAL_PARAGRAPHS.slice(0, -1)
  const legalClosing = LEGAL_PARAGRAPHS[LEGAL_PARAGRAPHS.length - 1]

  const body = `
<div class="page page-1">
  <div class="letterhead">
    <div class="brand">Фикс<span>Нэт</span></div>
    <div class="brand-sub">${val(c.name)}</div>
    <div class="letterhead-line">${val(c.legalName)}, юридический адрес: ${val(c.legalAddress)}</div>
    <div class="letterhead-line">почтовый адрес: ${val(c.postalAddress)}, ИНН: ${val(c.inn)}, ОГРНИП: ${val(c.ogrnip)}</div>
    <div class="letterhead-line">email: ${val(c.email)}, сайт: ${val(c.website)}, телефон: ${val(c.phone)}</div>
    <div class="letterhead-line">время работы ${val(c.workHours)}</div>
  </div>

  <div class="title">Квитанция о приеме на ремонт/обслуживание № <b>${val(docNum)}</b> &nbsp; дата <b>${val(date)}</b></div>
  ${trackBlock(o, input.trackBaseUrl || TRACK_BASE_URL)}

  <div class="tbl-frame">
  <table class="tbl">
    ${sectionTitle('Сведения о клиенте')}
    ${row('Фамилия, имя, отчество', val(o.client))}
    ${row('Номер телефона', val(o.phone))}
    ${row('Электронная почта', val(o.email))}
    ${row('Социальная сеть/мессенджер', val(wishes.social))}
    ${row('Адрес приемки', val(o.clientAddress))}

    ${sectionTitle('Сведения о принимаемом устройстве/технике')}
    ${row('Категория устройства', val(o.deviceType))}
    ${row('Марка', val(o.brand))}
    ${row('Модель', val(o.model))}
    ${row('Цвет', val(o.color))}
    ${row('Серийный номер', val(o.serialNumber))}
    ${row('IMEI', val(o.imei))}
    ${row('Дополнительное оборудование', val(o.equipment))}
    ${row('Неисправность', val(o.problem))}
    ${row('Уточнение проблемы', val(o.description))}
    ${row('Предварительная диагностика', val(o.receiverNotes))}

    ${sectionTitle('Описание состояния принимаемого устройства/техники по предварительной диагностике')}
    <tr class="cond-h">
      <td><b>Загрязнения</b></td><td><b>Царапины</b></td><td><b>Сколы</b></td><td><b>Потертости</b></td>
    </tr>
    <tr class="cond-v">
      <td>${joinArr(insp.dirt)}</td><td>${joinArr(insp.scratches)}</td><td>${joinArr(insp.chips)}</td><td>${joinArr(insp.wear)}</td>
    </tr>
    <tr class="cond-h"><td colspan="4"><b>Трещины</b></td></tr>
    <tr class="cond-v"><td colspan="4">${joinArr(insp.cracks)}</td></tr>
    <tr class="cond-h">
      <td><b>Целостность</b></td><td><b>Корректность работы ПО</b></td><td><b>Температура</b></td><td><b>Операционные ошибки</b></td>
    </tr>
    <tr class="cond-v">
      <td>${val(insp.integrity, 'не указано')}</td>
      <td>${val(insp.software, 'не указано')}</td>
      <td>${val(insp.temperature, 'не указано')}</td>
      <td>${val(insp.opErrors, 'не указано')}</td>
    </tr>
    <tr class="cond-h"><td colspan="4"><b>Иное</b></td></tr>
    <tr class="cond-v"><td colspan="4">${val(insp.other, 'не указано')}</td></tr>

    ${sectionTitle('Сведения о работах/услугах, которые будут произведены (в случае проведения предварительной диагностики)')}
    ${row('Наименование работ/услуг', val(works), false)}

    ${sectionTitle('Пожелания клиента по выдаче подменного телефона')}
    ${wishRow(val(wishes.loaner))}
    ${sectionTitle('Пожелания клиента по хранению устройства/техники (и дополнительного оборудования в случае его наличия)')}
    ${wishRow(val(wishes.storage))}
    ${sectionTitle('Пожелания клиента по адресу выдачи устройства/техники (и дополнительного оборудования в случае его наличия)')}
    ${wishRow(val(wishes.pickupAddress))}
    ${sectionTitle('Пожелания клиента по предоплате')}
    ${wishRow(val(wishes.prepaymentWish))}

    <tr><td class="section stub-head" colspan="4">Корешок квитанции</td></tr>
    <tr><td class="stub-text" colspan="4">${esc(STUB_TEXT)}</td></tr>
    <tr><td class="sign-cell" colspan="4">${signLine()}</td></tr>
  </table>
  </div>
</div>

<div class="page page-2">
  <div class="legal">
    ${legalMain.map((p) => `<p>${esc(p)}</p>`).join('')}
  </div>
  <p class="legal-closing">${esc(legalClosing)}</p>

  <div class="sign-block">
    ${signSection('Клиент:')}
    ${signSection('Представитель сервисного центра «ФиксНэт»:')}
  </div>
</div>`

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><title>&#160;</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Times New Roman", Times, serif; font-size: 10pt; color: #000; background: #fff; }
  .page-1 { width: 100%; max-width: 194mm; margin: 0 auto; }
  .page-2 { page-break-before: always; }
  .letterhead { text-align: center; margin-bottom: 4px; }
  .brand { font-size: 26pt; font-weight: bold; line-height: 1; }
  .brand span { color: #e6b800; }
  .brand-sub { font-size: 11pt; font-weight: bold; margin: 3px 0 4px; }
  .letterhead-line { font-size: 8pt; line-height: 1.25; }
  .title { text-align: center; font-weight: bold; margin: 4px 0 3px; font-size: 10.5pt; }
  .track { text-align: center; font-size: 8pt; margin-bottom: 4px; color: #333; }
  .track-block { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px; }
  .track-qr { width: 17mm; height: 17mm; flex: 0 0 auto; }
  .track-qr svg { width: 100%; height: 100%; display: block; }
  .track-text { font-size: 8pt; line-height: 1.25; color: #222; text-align: left; }
  .tbl-frame { border: 1px solid #000; width: 100%; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .tbl { border: none; }
  .tbl td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
  .tbl tr > td:last-child { border-right: 1px solid #000 !important; }
  .tbl tr > td:first-child { border-left: 1px solid #000 !important; }
  .section { text-align: center; font-weight: bold; background: #f0f0f0; font-size: 9pt; padding: 3px 5px; }
  .stub-head { border-top: 2px solid #196b24 !important; }
  .lbl { width: 34%; text-align: center; font-size: 9pt; }
  .val { min-height: 7mm; font-size: 9.5pt; vertical-align: top; }
  .wish-val { min-height: 13mm; }
  .cond-h td { text-align: center; font-size: 8.5pt; padding: 2px 4px; }
  .cond-v td { text-align: center; font-size: 8.5pt; min-height: 7mm; padding: 2px 4px; }
  .stub-text { font-size: 9pt; text-align: justify; line-height: 1.2; padding: 5px 6px; vertical-align: top; }
  .sign-cell { text-align: center; padding: 6px 8px; vertical-align: top; }
  .sign-row { display: flex; align-items: flex-start; justify-content: center; max-width: 190mm; margin: 0 auto; }
  .sign-col { flex: 1 1 58mm; min-width: 0; text-align: center; }
  .sign-col-mid { flex: 0 0 42mm; }
  .sign-sep { flex: 0 0 auto; padding: 0 4px; font-size: 9pt; line-height: 14px; }
  .sign-line { border-bottom: 1px solid #000; height: 14px; margin: 0 4px 3px; }
  .sign-cap { font-size: 7.5pt; text-align: center; white-space: nowrap; }
  .legal { font-size: 8pt; text-align: justify; line-height: 1.22; }
  .legal p { margin: 0 0 3px; }
  .legal-closing { font-size: 8pt; line-height: 1.22; text-align: center; margin: 8px 0 10px; }
  .sign-block { text-align: center; }
  .sign-item { margin-bottom: 12px; page-break-inside: avoid; }
  .sign-title { margin-bottom: 4px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-1 { page-break-after: avoid; max-width: none; }
    .page-2 { page-break-before: always; }
    .tbl-frame { border: 1px solid #000 !important; }
    .tbl td { border-color: #000 !important; }
  }
</style></head><body>${body}</body></html>`
}

export function printRepairReceipt(html: string) {
  return openPrintWindow(html)
}
