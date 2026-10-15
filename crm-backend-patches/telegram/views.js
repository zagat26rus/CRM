const { esc, money, num, formatDateTime, formatDate, phonePretty, clip, periodRange } = require('./format');
const { TASK_SLOTS, PERM_DEFS, NOTIFY_DEFS } = require('./store');
const { PAGE_SIZE, ITEMS_PAGE_SIZE } = require('./queries');

const MENU = {
  orders: 'Заявки',
  newOrder: 'Новая заявка',
  tasks: 'Задачи',
  stock: 'Склад',
  summary: 'Сводка',
  settings: 'Настройки',
};

const PRIORITY_LABEL = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
const METHOD_LABEL = { cash: 'Наличные', card: 'Карта', bank: 'Перевод', transfer: 'Перевод', online: 'Онлайн', other: 'Другое' };

const btn = (text, data) => ({ text: clip(text, 60), callback_data: data });
const urlBtn = (text, url) => ({ text, url });
const inline = (rows) => ({ inline_keyboard: rows.filter((r) => r.length) });

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function pager(prefix, page, total, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const row = [];
  if (page > 0) row.push(btn('« Назад', `${prefix}:${page - 1}`));
  if (pages > 1) row.push(btn(`${page + 1}/${pages}`, `${prefix}:${page}`));
  if (page + 1 < pages) row.push(btn('Вперёд »', `${prefix}:${page + 1}`));
  return row;
}

function mainMenuKeyboard(prefs) {
  const p = prefs.perms;
  const buttons = [];
  if (p.orders_view) buttons.push(MENU.orders);
  if (p.orders_create) buttons.push(MENU.newOrder);
  if (p.tasks_view) buttons.push(MENU.tasks);
  if (p.stock_view) buttons.push(MENU.stock);
  if (p.finance_view) buttons.push(MENU.summary);
  buttons.push(MENU.settings);
  return { keyboard: chunk(buttons, 2).map((r) => r.map((text) => ({ text }))), resize_keyboard: true, is_persistent: true };
}

// ---------- Заявки ----------

const ORDER_FILTERS = [
  { id: 'a', key: 'active', label: 'Активные' },
  { id: 'n', key: 'new', label: 'Новые' },
  { id: 'w', key: 'work', label: 'В работе' },
  { id: 'r', key: 'ready', label: 'Готовы' },
];

function orderLine(o) {
  const device = [o.brand, o.model].filter(Boolean).join(' ');
  return `#${o.id} ${o.client}${device ? ` · ${device}` : ''} · ${o.status}`;
}

function orderListView(result, { filterId = 'a', searchQuery = '' } = {}) {
  const { rows, total, page, pageSize } = result;
  const filter = ORDER_FILTERS.find((f) => f.id === filterId) || ORDER_FILTERS[0];
  const title = searchQuery ? `Поиск: «${esc(searchQuery)}»` : filter.label;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const text = total
    ? `<b>Заявки — ${title}</b>\nНайдено: ${total} · стр. ${page + 1}/${pages}`
    : `<b>Заявки — ${title}</b>\nНичего не найдено.`;
  const rowsKb = rows.map((o) => [btn(orderLine(o), `ov:${o.id}`)]);
  rowsKb.push(pager(searchQuery ? 'oq' : `ol:${filter.id}`, page, total, pageSize));
  rowsKb.push(ORDER_FILTERS.map((f) => btn(f.id === filter.id && !searchQuery ? `• ${f.label}` : f.label, `ol:${f.id}:0`)));
  rowsKb.push([btn('Поиск', 'osr'), btn('Меню', 'm')]);
  return { text, kb: inline(rowsKb) };
}

function orderCard(detail, { canEdit, finance }) {
  const { order: o, problems, history, files } = detail;
  const device = [o.brand, o.model].filter(Boolean).join(' ') || o.deviceType || '';
  const problemText = problems.length ? problems.map((p) => p.problemName).filter(Boolean).join('; ') : o.problem;
  const lines = [`<b>Заявка #${o.id}</b>${o.isUrgent ? ' (срочно)' : ''}`, `Статус: <b>${esc(o.status)}</b>`];
  lines.push(`Клиент: ${esc(o.client)}`);
  if (o.phone) lines.push(`Телефон: ${esc(phonePretty(o.phone))}`);
  if (device) lines.push(`Устройство: ${esc(device)}`);
  if (o.imei) lines.push(`IMEI: ${esc(o.imei)}`);
  if (problemText) lines.push(`Неисправность: ${esc(clip(problemText, 300))}`);
  const price = [`Стоимость: ${money(o.price)}`];
  if (Number(o.prepayment) > 0) price.push(`предоплата ${money(o.prepayment)}`);
  lines.push(price.join(' · '));
  if (finance && Number(o.costPrice) > 0) lines.push(`Себестоимость: ${money(o.costPrice)}`);
  if (o.executorName) lines.push(`Исполнитель: ${esc(o.executorName)}`);
  if (o.managerName) lines.push(`Принял: ${esc(o.managerName)}`);
  if (o.dueAt) lines.push(`Срок: ${esc(formatDateTime(o.dueAt))}`);
  lines.push(`Создана: ${esc(formatDateTime(o.createdAt))}`);
  if (files > 0) lines.push(`Файлов в заявке: ${files}`);
  if (history.length) {
    lines.push('', '<b>Последние события</b>');
    for (const h of history.slice(0, 3)) {
      lines.push(`• ${esc(formatDateTime(h.createdAt))} — ${esc(clip(h.message, 120))}`);
    }
  }
  const rows = [];
  if (canEdit) {
    rows.push([btn('Сменить статус', `ost:${o.id}`)]);
    rows.push([btn('Добавить фото', `oph:${o.id}`), btn('Комментарий', `oc:${o.id}`)]);
  }
  rows.push([btn('К списку', 'ol:a:0'), btn('Меню', 'm')]);
  return { text: lines.join('\n'), kb: inline(rows) };
}

function statusMenu(order, statuses) {
  const rows = chunk(
    statuses.map((s, idx) => btn(s === order.status ? `• ${s}` : s, `oss:${order.id}:${idx}`)),
    2
  );
  rows.push([btn('Назад к заявке', `ov:${order.id}`)]);
  return {
    text: `<b>Заявка #${order.id}</b> — выберите новый статус.\nСейчас: ${esc(order.status)}`,
    kb: inline(rows),
  };
}

function newOrderConfirm(data) {
  const text = [
    '<b>Новая заявка — проверьте данные</b>',
    `Клиент: ${esc(data.client)}`,
    `Телефон: ${esc(phonePretty(data.phone))}`,
    `Устройство: ${esc(data.device)}`,
    `Неисправность: ${esc(data.problem)}`,
    `Стоимость: ${data.price ? money(data.price) : 'не указана'}`,
  ].join('\n');
  return { text, kb: inline([[btn('Создать заявку', 'onok'), btn('Отмена', 'onx')]]) };
}

// ---------- Задачи ----------

function slotName(id) {
  return TASK_SLOTS.find((s) => s.id === id)?.name || id || 'Не назначена';
}

function taskListView(result) {
  const { rows, total, page, pageSize } = result;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const text = total
    ? `<b>Открытые задачи</b>\nВсего: ${total} · стр. ${page + 1}/${pages}`
    : '<b>Открытые задачи</b>\nОткрытых задач нет.';
  const rowsKb = rows.map((t) => {
    const mark = t.priority === 'high' ? '! ' : '';
    return [btn(`${mark}#${t.id} ${t.title} · ${slotName(t.assignedTo)}`, `tv:${t.id}`)];
  });
  rowsKb.push(pager('tl', page, total, pageSize));
  return { text, kb: inline([...rowsKb, [btn('Новая задача', 'tn'), btn('Меню', 'm')]]), canCreateRow: true };
}

function taskCard({ task, order }, { canCreate }) {
  const lines = [
    `<b>Задача #${task.id}</b>${task.isCompleted ? ' (выполнена)' : ''}`,
    esc(task.title),
  ];
  if (task.description) lines.push(esc(clip(task.description, 500)));
  lines.push(`Кому: ${esc(slotName(task.assignedTo))}`);
  lines.push(`Приоритет: ${PRIORITY_LABEL[task.priority] || task.priority}`);
  if (task.dueDate) lines.push(`Срок: ${esc(formatDate(task.dueDate))}`);
  if (order) lines.push(`Заявка: #${order.id} ${esc(order.client)}`);
  const rows = [];
  if (!task.isCompleted) rows.push([btn('Выполнено', `td:${task.id}`)]);
  if (order) rows.push([btn(`Открыть заявку #${order.id}`, `ov:${order.id}`)]);
  const nav = [btn('К задачам', 'tl:0')];
  if (canCreate) nav.push(btn('Новая задача', 'tn'));
  rows.push(nav);
  return { text: lines.join('\n'), kb: inline(rows) };
}

// ---------- Склад ----------

function stockOverviewView(ov, { finance }) {
  const t = ov.totals;
  const lines = ['<b>Склад</b>', `Позиций: ${t.skus} · единиц всего: ${num(t.qty)}`];
  if (finance) lines.push(`Стоимость по закупке: ${money(t.costValue)}`);
  lines.push(`Стоимость по продаже: ${money(t.saleValue)}`);
  lines.push(`Нет в наличии: ${t.zero} · заканчивается (≤${ov.threshold}): ${t.low}`);
  lines.push('', '<b>По категориям</b>');
  const cats = [...ov.categories];
  if (ov.uncategorized.skus > 0) cats.push({ id: 0, name: 'Без категории', ...ov.uncategorized });
  if (!cats.length) lines.push('Категорий нет.');
  for (const c of cats) lines.push(`${esc(c.name)} — ${num(c.qty)} шт (${c.skus} поз.)`);
  const catButtons = cats.map((c) => btn(`${c.name} · ${num(c.qty)}`, `sc:${c.id}:0`));
  const rows = chunk(catButtons, 2);
  rows.push([btn('Мало и нет в наличии', 'sl:0'), btn('Все позиции', 'sa:0')]);
  rows.push([btn('Поиск по складу', 'sq'), btn('Меню', 'm')]);
  return { text: lines.join('\n'), kb: inline(rows) };
}

function stockItemsView(result, { title, prefix, finance }) {
  const { rows, total, page, pageSize } = result;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const lines = [`<b>${esc(title)}</b>`, total ? `Позиций: ${total} · стр. ${page + 1}/${pages}` : 'Ничего не найдено.'];
  for (const r of rows) {
    const price = finance ? `${money(r.purchasePrice)} / ${money(r.salePrice)}` : money(r.salePrice);
    lines.push(`• ${esc(clip(r.name, 60))} — <b>${num(r.quantity)} ${esc(r.unit || 'шт')}</b> · ${price}`);
  }
  if (finance && rows.length) lines.push('', 'Цены: закупка / продажа');
  const kbRows = [];
  if (prefix) kbRows.push(pager(prefix, page, total, pageSize));
  kbRows.push([btn('Склад', 'sk'), btn('Меню', 'm')]);
  return { text: lines.join('\n'), kb: inline(kbRows) };
}

// ---------- Сводка ----------

function summaryText(s, label, { withMoney, dateLabel }) {
  const lines = [`<b>Сводка — ${esc(label)}</b>${dateLabel ? ` (${esc(dateLabel)})` : ''}`];
  if (withMoney) {
    lines.push('', '<b>Деньги</b>');
    lines.push(`Оборот (поступления): <b>${money(s.income)}</b> · оплат: ${s.incomeCount}`);
    for (const src of s.bySource.slice(0, 5)) lines.push(`   ${esc(src.label)}: ${money(src.total)}`);
    if (s.byMethod.length) {
      lines.push(
        '   По способам: ' +
          s.byMethod.map((m) => `${METHOD_LABEL[m.method] || 'Другое'} ${money(m.total)}`).join(', ')
      );
    }
    lines.push(`Расходы (в т.ч. себестоимость): <b>${money(s.expense)}</b> · записей: ${s.expenseCount}`);
    lines.push(`Прибыль (оборот минус расходы): <b>${money(s.profit)}</b>`);
    lines.push(`Остаток по кассе за всё время: ${money(s.balance)}`);
  }
  lines.push('', '<b>Заявки</b>');
  lines.push(`Принято: ${s.ordersCreated} · выдано/закрыто: ${s.ordersIssued}`);
  lines.push(`Сейчас в работе: ${s.ordersOpen} · готово к выдаче: ${s.ordersReady} · просрочено: ${s.ordersOverdue}`);
  if (s.shopSales !== undefined) {
    lines.push('', '<b>Магазин</b>', `Продаж: ${s.shopSales}${withMoney ? ` на ${money(s.shopTotal)}` : ''}`);
  }
  lines.push('', '<b>Задачи</b>', `Открытых: ${s.tasksOpen} · просрочено: ${s.tasksOverdue}`);
  lines.push('', '<b>Склад</b>', `Нет в наличии: ${s.stockZero} · заканчивается: ${s.stockLow}`);
  if (s.stockLowItems.length) {
    for (const i of s.stockLowItems.slice(0, 5)) lines.push(`   ${esc(clip(i.name, 50))} — ${num(i.quantity)} ${esc(i.unit || 'шт')}`);
  }
  return lines.join('\n');
}

function summaryKeyboard(active) {
  const periods = [
    ['today', 'Сегодня'],
    ['yesterday', 'Вчера'],
    ['week', '7 дней'],
    ['month', 'Месяц'],
  ];
  return inline([
    periods.map(([id, label]) => btn(id === active ? `• ${label}` : label, `su:${id}`)),
    [btn('Меню', 'm')],
  ]);
}

function summaryRangeLabel(kind) {
  const range = periodRange(kind);
  const last = new Date(range.to.getTime() - 1000);
  const f = formatDate(range.from.toISOString());
  const t = formatDate(last.toISOString());
  return { label: range.label, dateLabel: f === t ? f : `${f} – ${t}` };
}

// ---------- Настройки ----------

function settingsView(link, prefs, allowedNotify) {
  const u = link.user;
  const p = prefs.perms;
  const roleLabel = { owner: 'Владелец', admin: 'Администратор', director: 'Директор', master: 'Мастер' }[u.role] || u.role;
  const lines = [
    '<b>Настройки бота</b>',
    `Аккаунт CRM: ${esc(u.name)} (${esc(roleLabel)}), ${esc(link.companyName)}`,
    '',
    '<b>Доступные функции</b>',
    ...PERM_DEFS.filter((d) => p[d.key]).map((d) => `• ${d.label}`),
  ];
  if (p.orders_view) lines.push(`• Заявки: ${p.orders_scope === 'all' ? 'все' : 'только мои'}`);
  lines.push('', '<b>Уведомления</b> (нажмите, чтобы включить или выключить)');
  const rows = allowedNotify.map((d) => [btn(`${prefs.notify[d.key] ? 'Вкл' : 'Выкл'} — ${d.label}`, `stn:${d.key}`)]);
  if (prefs.perms.finance_view) {
    rows.push([btn(`Вечерняя сводка в ${String(prefs.summaryHour).padStart(2, '0')}:00 (изменить)`, 'sth')]);
  }
  rows.push([btn('Отвязать Telegram', 'stu'), btn('Меню', 'm')]);
  lines.push('', 'Права доступа настраивает администратор в CRM: Настройки → Telegram-бот.');
  return { text: lines.join('\n'), kb: inline(rows) };
}

function hourPicker(current) {
  const hours = [18, 19, 20, 21, 22, 23];
  return {
    text: '<b>Во сколько присылать вечернюю сводку?</b> (время компании)',
    kb: inline([
      hours.map((h) => btn(h === current ? `• ${h}:00` : `${h}:00`, `sth:${h}`)),
      [btn('Назад', 'st')],
    ]),
  };
}

function allowedNotifyDefs(prefs) {
  const p = prefs.perms;
  return NOTIFY_DEFS.filter((d) => {
    if (d.key === 'new_order' || d.key === 'order_status') return p.orders_view;
    if (d.key === 'task_assigned' || d.key === 'task_all') return p.tasks_view;
    if (d.key === 'daily_summary') return p.finance_view;
    return false;
  });
}

module.exports = {
  MENU,
  PRIORITY_LABEL,
  btn,
  urlBtn,
  inline,
  chunk,
  mainMenuKeyboard,
  ORDER_FILTERS,
  orderListView,
  orderCard,
  orderLine,
  statusMenu,
  newOrderConfirm,
  slotName,
  taskListView,
  taskCard,
  stockOverviewView,
  stockItemsView,
  summaryText,
  summaryKeyboard,
  summaryRangeLabel,
  settingsView,
  hourPicker,
  allowedNotifyDefs,
  PAGE_SIZE,
  ITEMS_PAGE_SIZE,
};
