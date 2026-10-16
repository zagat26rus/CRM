const store = require('./store');
const q = require('./queries');
const v = require('./views');
const crm = require('./crmClient');
const tg = require('./tgApi');
const recent = require('./recent');
const { Ctx } = require('./ctx');
const { cfg } = require('./config');
const { normalizePhone } = require('../utils/phone');
const { esc, periodRange, zonedDateKey } = require('./format');

const linkAttempts = new Map();

function tooManyAttempts(chatId) {
  const now = Date.now();
  const rec = linkAttempts.get(chatId) || { count: 0, since: now };
  if (now - rec.since > 60 * 60 * 1000) {
    rec.count = 0;
    rec.since = now;
  }
  rec.count += 1;
  linkAttempts.set(chatId, rec);
  return rec.count > 10;
}

const HELP_TEXT = [
  '<b>Как пользоваться ботом</b>',
  'Кнопки внизу экрана открывают основные разделы. Что видно именно вам, определяют права, которые выставил администратор.',
  '',
  '• <b>Заявки</b> — список, поиск, карточка заявки, смена статуса, фото и комментарии',
  '• <b>Новая заявка</b> — принять устройство прямо из бота',
  '• <b>Задачи</b> — свои задачи, отметка о выполнении, постановка новых',
  '• <b>Склад</b> — остатки по категориям, нехватка товара, поиск',
  '• <b>Сводка</b> — деньги, оборот и заявки за день, вчера, неделю, месяц',
  '• <b>Настройки</b> — какие уведомления получать',
  '',
  'Быстрые действия: отправьте номер заявки (например #8) или часть имени, телефона, модели — бот найдёт заявку. Фото с подписью #8 сразу прикрепится к заявке 8.',
].join('\n');

// ---------- Привязка ----------

function welcomeUnlinked(ctx) {
  ctx.reply(
    [
      '<b>FixNet CRM — бот сотрудника</b>',
      'Чтобы пользоваться ботом, привяжите свой аккаунт CRM. Есть два способа:',
      '',
      '1. Нажмите кнопку ниже и отправьте свой номер телефона — он должен совпадать с номером в профиле CRM.',
      '2. В CRM откройте Настройки → Telegram-бот, нажмите «Получить код привязки» и отправьте сюда этот код (или откройте ссылку из CRM).',
    ].join('\n'),
    {
      keyboard: [[{ text: 'Отправить мой номер', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    }
  );
}

function completeLink(ctx, user, chat, from) {
  const link = store.createLink(user, chat.id, from);
  const prefs = store.getPrefs(user);
  const roleLabel = { owner: 'владелец', admin: 'администратор', director: 'директор', master: 'мастер' }[user.role] || user.role;
  ctx.reply(
    `Готово! Вы вошли как <b>${esc(user.name)}</b> (${roleLabel}).\n\n${HELP_TEXT}`,
    v.mainMenuKeyboard(prefs)
  );
  return link;
}

function handleUnlinked(ctx, msg, cb) {
  if (cb) {
    ctx.answer('Сначала привяжите аккаунт');
    return welcomeUnlinked(ctx);
  }
  const chat = msg.chat;
  const from = msg.from || {};

  if (msg.contact) {
    if (!msg.contact.user_id || String(msg.contact.user_id) !== String(from.id)) {
      ctx.reply('Нужно отправить именно свой номер — используйте кнопку «Отправить мой номер».');
      return;
    }
    const matches = store.findUsersByPhone(msg.contact.phone_number);
    if (matches.length === 1) return completeLink(ctx, matches[0], chat, from);
    if (matches.length > 1) {
      ctx.reply('Этот номер указан у нескольких сотрудников. Привяжитесь по коду: CRM → Настройки → Telegram-бот → «Получить код привязки».');
      return;
    }
    ctx.reply(
      'Не нашёл сотрудника с таким номером. Укажите свой телефон в CRM (Настройки → Telegram-бот) или привяжитесь по коду привязки оттуда же.'
    );
    return;
  }

  const text = String(msg.text || '').trim();
  const startMatch = text.match(/^\/start(?:@\w+)?\s+(\S+)/i);
  const candidate = startMatch ? startMatch[1] : /^[A-Za-z0-9]{8}$/.test(text) ? text : null;
  if (candidate) {
    if (tooManyAttempts(String(chat.id))) {
      ctx.reply('Слишком много попыток. Подождите немного и запросите новый код в CRM.');
      return;
    }
    const user = store.consumeCode(candidate);
    if (!user) {
      ctx.reply('Код недействителен или истёк. Получите новый: CRM → Настройки → Telegram-бот.');
      return;
    }
    return completeLink(ctx, user, chat, from);
  }
  welcomeUnlinked(ctx);
}

// ---------- Вспомогательное ----------

function makeSession(ctx, link, chatId) {
  const S = {
    ctx,
    link,
    user: link.user,
    prefs: store.getPrefs(link.user),
    chatId: String(chatId),
    state: link.state || {},
  };
  S.setState = (next) => {
    S.state = next || {};
    store.setState(S.chatId, S.state);
  };
  S.patchState = (patch) => S.setState({ ...S.state, ...patch });
  S.clearMode = () => {
    const next = { ...S.state };
    for (const key of ['mode', 'step', 'data', 'orderId', 'count', 'lastGroup']) delete next[key];
    S.setState(next);
  };
  return S;
}

function need(S, key, message) {
  if (S.prefs.perms[key]) return true;
  S.ctx.answer('Нет доступа', true);
  S.ctx.reply(message || 'У вас нет доступа к этому разделу. Права выдаёт администратор в CRM: Настройки → Telegram-бот.');
  return false;
}

function show(S, view, edit) {
  if (edit) S.ctx.edit(view.text, view.kb);
  else S.ctx.reply(view.text, view.kb);
}

function showMenu(S) {
  S.clearMode();
  S.ctx.reply(HELP_TEXT, v.mainMenuKeyboard(S.prefs));
}

// ---------- Заявки ----------

const FILTER_KEYS = { a: 'active', n: 'new', w: 'work', r: 'ready' };

function showOrders(S, filterId = 'a', page = 0, edit = false) {
  if (!need(S, 'orders_view')) return;
  const result = q.listOrders(S.user, S.prefs, { filter: FILTER_KEYS[filterId] || 'active', page });
  show(S, v.orderListView(result, { filterId }), edit);
}

function showOrderSearch(S, query, page = 0, edit = false) {
  if (!need(S, 'orders_view')) return;
  const result = q.listOrders(S.user, S.prefs, { q: query, page });
  show(S, v.orderListView(result, { searchQuery: query }), edit);
}

function showOrder(S, id, edit = false) {
  if (!need(S, 'orders_view')) return;
  const detail = q.getOrder(S.user, S.prefs, id);
  if (!detail) {
    S.ctx.answer('Заявка не найдена', true);
    S.ctx.reply(`Заявка #${esc(id)} не найдена или недоступна вам.`);
    return;
  }
  show(S, v.orderCard(detail, { canEdit: S.prefs.perms.orders_edit, finance: S.prefs.perms.finance_view }), edit);
}

async function setOrderStatus(S, id, idx) {
  if (!need(S, 'orders_edit')) return;
  const detail = q.getOrder(S.user, S.prefs, id);
  if (!detail) return S.ctx.reply('Заявка не найдена или недоступна вам.');
  const status = q.orderStatuses(S.user.companyId)[idx];
  if (!status) return S.ctx.answer('Статус не найден', true);
  if (status === detail.order.status) {
    S.ctx.answer('Этот статус уже установлен');
    return;
  }
  await crm.request(S.user, 'PUT', `/orders/${detail.order.id}`, { json: { status } });
  S.ctx.answer('Статус обновлён');
  showOrder(S, id, true);
}

function showStatusMenu(S, id) {
  if (!need(S, 'orders_edit')) return;
  const detail = q.getOrder(S.user, S.prefs, id);
  if (!detail) return S.ctx.reply('Заявка не найдена или недоступна вам.');
  show(S, v.statusMenu(detail.order, q.orderStatuses(S.user.companyId)), true);
}

function startPhoto(S, id) {
  if (!need(S, 'orders_edit')) return;
  const detail = q.getOrder(S.user, S.prefs, id);
  if (!detail) return S.ctx.reply('Заявка не найдена или недоступна вам.');
  S.setState({ ...S.state, mode: 'photo', orderId: detail.order.id, count: 0 });
  S.ctx.answer();
  S.ctx.reply(
    `Заявка #${detail.order.id}: отправьте фото или файлы (можно несколько). Подпись к фото сохранится как комментарий. Когда закончите — нажмите «Готово».`,
    v.inline([[v.btn('Готово', `od:${detail.order.id}`)]])
  );
}

function startComment(S, id) {
  if (!need(S, 'orders_edit')) return;
  const detail = q.getOrder(S.user, S.prefs, id);
  if (!detail) return S.ctx.reply('Заявка не найдена или недоступна вам.');
  S.setState({ ...S.state, mode: 'comment', orderId: detail.order.id });
  S.ctx.answer();
  S.ctx.reply(`Заявка #${detail.order.id}: напишите комментарий одним сообщением.`, v.inline([[v.btn('Отмена', `od:${detail.order.id}`)]]));
}

const IMAGE_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', pdf: 'application/pdf', mp4: 'video/mp4' };

async function handleMedia(S, msg) {
  const { ctx } = S;
  if (!need(S, 'orders_edit')) return;
  const caption = String(msg.caption || '').trim();
  let orderId = S.state.mode === 'photo' ? S.state.orderId : null;
  let comment = caption;
  if (!orderId) {
    const m = caption.match(/#\s*(\d{1,7})/) || caption.match(/^(\d{1,7})\b/);
    if (m) {
      orderId = Number(m[1]);
      comment = caption.replace(m[0], '').trim();
    }
  }
  if (!orderId) {
    ctx.reply('Не понял, к какой заявке относится файл. Откройте заявку и нажмите «Добавить фото» или подпишите фото номером заявки, например: #8');
    return;
  }
  const detail = q.getOrder(S.user, S.prefs, orderId);
  if (!detail) {
    ctx.reply(`Заявка #${orderId} не найдена или недоступна вам.`);
    return;
  }

  let fileId;
  let name;
  let mime;
  if (msg.photo?.length) {
    fileId = msg.photo[msg.photo.length - 1].file_id;
    name = `tg_photo_${Date.now()}.jpg`;
    mime = 'image/jpeg';
  } else if (msg.document) {
    fileId = msg.document.file_id;
    name = msg.document.file_name || `tg_file_${Date.now()}`;
    mime = msg.document.mime_type || 'application/octet-stream';
  } else if (msg.video) {
    fileId = msg.video.file_id;
    name = msg.video.file_name || `tg_video_${Date.now()}.mp4`;
    mime = msg.video.mime_type || 'video/mp4';
  } else {
    return;
  }

  if (!tg.isUp()) {
    ctx.reply(
      'Сейчас сервер CRM не может скачать файл из Telegram (нет исходящего канала до api.telegram.org). Загрузите фото через веб-версию CRM или настройте ретранслятор.'
    );
    return;
  }
  let buffer;
  try {
    const info = await tg.call('getFile', { file_id: fileId });
    const ext = String(info.file_path || '').split('.').pop().toLowerCase();
    if (IMAGE_EXT[ext] && mime === 'application/octet-stream') mime = IMAGE_EXT[ext];
    buffer = await tg.downloadFile(info.file_path);
  } catch (e) {
    ctx.reply(e.network ? 'Не удалось получить файл из Telegram (нет связи). Попробуйте ещё раз чуть позже.' : `Telegram не отдал файл: ${esc(e.message)}`);
    return;
  }

  const form = new FormData();
  form.append('files', new Blob([buffer], { type: mime }), name);
  await crm.request(S.user, 'POST', `/orders/${detail.order.id}/history/files`, { form });
  if (comment) {
    await crm.request(S.user, 'POST', `/orders/${detail.order.id}/history/comment`, { json: { message: comment } });
  }

  const group = msg.media_group_id ? String(msg.media_group_id) : null;
  const count = (S.state.mode === 'photo' ? S.state.count || 0 : 0) + 1;
  const silent = group && S.state.lastGroup === group;
  if (S.state.mode === 'photo') S.patchState({ count, lastGroup: group });
  if (!silent) {
    ctx.reply(
      `Файл добавлен к заявке #${detail.order.id}${S.state.mode === 'photo' ? ` (загружено: ${count})` : ''}.`,
      v.inline([[v.btn('Готово', `od:${detail.order.id}`), v.btn('Открыть заявку', `ov:${detail.order.id}`)]])
    );
  }
}

// ---------- Новая заявка ----------

const NEW_ORDER_STEPS = {
  client: { prompt: 'Шаг 1 из 5. Имя клиента:', next: 'phone' },
  phone: { prompt: 'Шаг 2 из 5. Телефон клиента (например 8 900 123-45-67):', next: 'device' },
  device: { prompt: 'Шаг 3 из 5. Устройство (например: Apple iPhone 13):', next: 'problem' },
  problem: { prompt: 'Шаг 4 из 5. Что не так с устройством:', next: 'price' },
  price: { prompt: 'Шаг 5 из 5. Предварительная стоимость в рублях (или «-», если пока не известна):', next: null },
};

function cancelRow(data) {
  return v.inline([[v.btn('Отмена', data)]]);
}

function startNewOrder(S) {
  if (!need(S, 'orders_create')) return;
  S.setState({ ...S.state, mode: 'order_new', step: 'client', data: {} });
  S.ctx.answer();
  S.ctx.reply(`<b>Новая заявка</b>\n${NEW_ORDER_STEPS.client.prompt}`, cancelRow('onx'));
}

async function newOrderText(S, text) {
  const step = S.state.step;
  const data = { ...(S.state.data || {}) };
  const { ctx } = S;
  if (step === 'client') {
    if (text.length < 2 || text.length > 80) return ctx.reply('Введите имя клиента (2–80 символов).', cancelRow('onx'));
    data.client = text;
  } else if (step === 'phone') {
    const digits = normalizePhone(text);
    if (digits.length < 10 || digits.length > 15) return ctx.reply('Не похоже на телефон. Введите номер, например 8 900 123-45-67.', cancelRow('onx'));
    data.phone = digits;
  } else if (step === 'device') {
    if (text.length < 2 || text.length > 100) return ctx.reply('Введите устройство, например: Apple iPhone 13.', cancelRow('onx'));
    data.device = text;
  } else if (step === 'problem') {
    if (text.length < 2 || text.length > 500) return ctx.reply('Опишите неисправность (до 500 символов).', cancelRow('onx'));
    data.problem = text;
  } else if (step === 'price') {
    if (text === '-' || text === '—') data.price = 0;
    else {
      const n = Number(text.replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 10000000) return ctx.reply('Введите сумму числом или «-».', cancelRow('onx'));
      data.price = n;
    }
    S.setState({ ...S.state, step: 'confirm', data });
    return show(S, v.newOrderConfirm(data), false);
  }
  const next = NEW_ORDER_STEPS[step].next;
  S.setState({ ...S.state, step: next, data });
  ctx.reply(NEW_ORDER_STEPS[next].prompt, cancelRow('onx'));
}

async function createOrderFromState(S) {
  if (!need(S, 'orders_create')) return;
  const d = S.state.data || {};
  if (S.state.mode !== 'order_new' || !d.client || !d.phone) {
    S.ctx.answer('Нет данных для создания', true);
    return;
  }
  const parts = String(d.device).split(/\s+/);
  const brand = parts.length > 1 ? parts[0] : '';
  const model = parts.length > 1 ? parts.slice(1).join(' ') : d.device;
  const body = {
    client: d.client,
    phone: d.phone,
    brand,
    model,
    problems: [{ problemName: d.problem, price: d.price || 0, costPrice: 0 }],
    estimatedPrice: d.price || 0,
    managerName: S.user.name,
    description: 'Создано через Telegram-бота',
  };
  const order = await crm.request(S.user, 'POST', '/orders', { json: body });
  recent.mark('order', order.id, S.user.id);
  S.clearMode();
  S.ctx.answer('Заявка создана');
  S.ctx.reply(`Заявка #${order.id} создана.`);
  showOrder(S, order.id, false);
}

// ---------- Задачи ----------

function showTasks(S, page = 0, edit = false) {
  if (!need(S, 'tasks_view')) return;
  const result = q.listTasks(S.user, S.prefs, { page });
  const view = v.taskListView(result);
  if (!S.prefs.perms.tasks_create) {
    view.kb.inline_keyboard = view.kb.inline_keyboard.map((row) => row.filter((b) => b.callback_data !== 'tn'));
  }
  show(S, view, edit);
}

function showTask(S, id, edit = false) {
  if (!need(S, 'tasks_view')) return;
  const detail = q.getTask(S.user, S.prefs, id);
  if (!detail) {
    S.ctx.answer('Задача не найдена', true);
    return S.ctx.reply('Задача не найдена или недоступна вам.');
  }
  show(S, v.taskCard(detail, { canCreate: S.prefs.perms.tasks_create }), edit);
}

async function completeTask(S, id) {
  if (!need(S, 'tasks_view')) return;
  const detail = q.getTask(S.user, S.prefs, id);
  if (!detail) return S.ctx.reply('Задача не найдена или недоступна вам.');
  await crm.request(S.user, 'PUT', `/tasks/${detail.task.id}`, { json: { isCompleted: true } });
  S.ctx.answer('Задача выполнена');
  showTask(S, id, true);
}

function startNewTask(S) {
  if (!need(S, 'tasks_create')) return;
  S.setState({ ...S.state, mode: 'task_new', step: 'title', data: {} });
  S.ctx.answer();
  S.ctx.reply('<b>Новая задача</b>\nНапишите, что нужно сделать:', cancelRow('tnx'));
}

function taskSlotKeyboard() {
  const rows = v.chunk(store.TASK_SLOTS.map((s) => v.btn(s.name, `tns:${s.id}`)), 2);
  rows.push([v.btn('Отмена', 'tnx')]);
  return v.inline(rows);
}

function newTaskText(S, text) {
  if (S.state.step !== 'title') return S.ctx.reply('Выберите вариант кнопкой выше или нажмите «Отмена».');
  if (text.length < 2 || text.length > 300) return S.ctx.reply('Название задачи: от 2 до 300 символов.', cancelRow('tnx'));
  S.setState({ ...S.state, step: 'slot', data: { ...(S.state.data || {}), title: text } });
  S.ctx.reply('Кому поручить?', taskSlotKeyboard());
}

function addDays(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

async function createTaskFromState(S, dueChoice) {
  const d = S.state.data || {};
  if (S.state.mode !== 'task_new' || !d.title) return S.ctx.answer('Нет данных для создания', true);
  const today = zonedDateKey();
  const dueDate = dueChoice === 't' ? today : dueChoice === 'm' ? addDays(today, 1) : null;
  const task = await crm.request(S.user, 'POST', '/tasks', {
    json: {
      title: d.title,
      assignedTo: d.assignedTo || 'admin',
      priority: d.priority || 'medium',
      dueDate,
      description: `Создано через Telegram: ${S.user.name}`,
    },
  });
  recent.mark('task', task.id, S.user.id);
  S.clearMode();
  S.ctx.answer('Задача создана');
  S.ctx.reply(`Задача #${task.id} создана.`);
  showTask(S, task.id, false);
}

// ---------- Склад ----------

function showStock(S, edit = false) {
  if (!need(S, 'stock_view')) return;
  show(S, v.stockOverviewView(q.stockOverview(S.user.companyId), { finance: S.prefs.perms.finance_view }), edit);
}

function showStockCategory(S, catId, page, edit) {
  if (!need(S, 'stock_view')) return;
  const ov = q.stockOverview(S.user.companyId);
  const cat = ov.categories.find((c) => c.id === catId);
  const title = catId === 0 ? 'Без категории' : cat ? cat.name : 'Категория';
  const result = q.listStockItems(S.user.companyId, { categoryId: catId, page });
  show(S, v.stockItemsView(result, { title: `Склад — ${title}`, prefix: `sc:${catId}`, finance: S.prefs.perms.finance_view }), edit);
}

function showStockFiltered(S, kind, page, edit) {
  if (!need(S, 'stock_view')) return;
  const low = kind === 'l';
  const result = q.listStockItems(S.user.companyId, { filter: low ? 'low' : 'all', page });
  const title = low ? `Склад — мало и нет в наличии (≤${result.threshold})` : 'Склад — все позиции';
  show(S, v.stockItemsView(result, { title, prefix: low ? 'sl' : 'sa', finance: S.prefs.perms.finance_view }), edit);
}

function showStockSearch(S, query, page, edit) {
  if (!need(S, 'stock_view')) return;
  const result = q.listStockItems(S.user.companyId, { q: query, page });
  show(S, v.stockItemsView(result, { title: `Склад — поиск «${query}»`, prefix: 'sqs', finance: S.prefs.perms.finance_view }), edit);
}

// ---------- Сводка ----------

function showSummary(S, kind = 'today', edit = false) {
  if (!need(S, 'finance_view')) return;
  const range = periodRange(kind);
  const { label, dateLabel } = v.summaryRangeLabel(kind);
  const data = q.periodSummary(S.user.companyId, range, { withMoney: true });
  const text = v.summaryText(data, label, { withMoney: true, dateLabel });
  show(S, { text, kb: v.summaryKeyboard(kind) }, edit);
}

// ---------- Настройки ----------

function showSettings(S, edit = false) {
  show(S, v.settingsView(S.link, S.prefs, v.allowedNotifyDefs(S.prefs)), edit);
}

function toggleNotify(S, key) {
  const allowed = v.allowedNotifyDefs(S.prefs).some((d) => d.key === key);
  if (!allowed) return S.ctx.answer('Недоступно', true);
  store.savePrefs(S.user, { notify: { [key]: !S.prefs.notify[key] } });
  S.prefs = store.getPrefs(S.user);
  S.ctx.answer('Сохранено');
  showSettings(S, true);
}

function setSummaryHour(S, hour) {
  if (!S.prefs.perms.finance_view) return S.ctx.answer('Недоступно', true);
  store.savePrefs(S.user, { summaryHour: hour });
  S.prefs = store.getPrefs(S.user);
  S.ctx.answer('Сохранено');
  showSettings(S, true);
}

// ---------- Роутинг ----------

async function handleCallback(S, data) {
  const [cmd, ...a] = String(data || '').split(':');
  const { ctx } = S;
  const n = (i, d = 0) => (a[i] !== undefined && a[i] !== '' ? Number(a[i]) : d);
  ctx.answer();
  switch (cmd) {
    case 'm':
      S.clearMode();
      return ctx.reply('Главное меню.', v.mainMenuKeyboard(S.prefs));
    case 'ol':
      return showOrders(S, a[0] || 'a', n(1), true);
    case 'oq':
      return showOrderSearch(S, S.state.search || '', n(0), true);
    case 'osr':
      if (!need(S, 'orders_view')) return;
      S.setState({ ...S.state, mode: 'order_search' });
      return ctx.reply('Введите номер заявки, имя, телефон или модель устройства:', cancelRow('od:0'));
    case 'ov':
      S.clearMode();
      return showOrder(S, n(0), true);
    case 'ost':
      return showStatusMenu(S, n(0));
    case 'oss':
      return setOrderStatus(S, n(0), n(1));
    case 'oph':
      return startPhoto(S, n(0));
    case 'oc':
      return startComment(S, n(0));
    case 'od':
      S.clearMode();
      return n(0) ? showOrder(S, n(0), true) : ctx.reply('Отменено.', v.mainMenuKeyboard(S.prefs));
    case 'on':
      return startNewOrder(S);
    case 'onok':
      return createOrderFromState(S);
    case 'onx':
      S.clearMode();
      return ctx.reply('Создание заявки отменено.', v.mainMenuKeyboard(S.prefs));
    case 'tl':
      return showTasks(S, n(0), true);
    case 'tv':
      return showTask(S, n(0), true);
    case 'td':
      return completeTask(S, n(0));
    case 'tn':
      return startNewTask(S);
    case 'tns': {
      if (S.state.mode !== 'task_new' || !store.TASK_SLOTS.some((s) => s.id === a[0])) return;
      S.setState({ ...S.state, step: 'priority', data: { ...(S.state.data || {}), assignedTo: a[0] } });
      return ctx.reply(
        'Приоритет?',
        v.inline([
          [v.btn('Высокий', 'tnp:high'), v.btn('Средний', 'tnp:medium'), v.btn('Низкий', 'tnp:low')],
          [v.btn('Отмена', 'tnx')],
        ])
      );
    }
    case 'tnp': {
      if (S.state.mode !== 'task_new' || !['high', 'medium', 'low'].includes(a[0])) return;
      S.setState({ ...S.state, step: 'due', data: { ...(S.state.data || {}), priority: a[0] } });
      return ctx.reply(
        'Срок?',
        v.inline([[v.btn('Сегодня', 'tnd:t'), v.btn('Завтра', 'tnd:m'), v.btn('Без срока', 'tnd:0')], [v.btn('Отмена', 'tnx')]])
      );
    }
    case 'tnd':
      return createTaskFromState(S, a[0]);
    case 'tnx':
      S.clearMode();
      return ctx.reply('Создание задачи отменено.', v.mainMenuKeyboard(S.prefs));
    case 'sk':
      S.clearMode();
      return showStock(S, true);
    case 'sc':
      return showStockCategory(S, n(0), n(1), true);
    case 'sl':
      return showStockFiltered(S, 'l', n(0), true);
    case 'sa':
      return showStockFiltered(S, 'a', n(0), true);
    case 'sq':
      if (!need(S, 'stock_view')) return;
      S.setState({ ...S.state, mode: 'stock_search' });
      return ctx.reply('Введите название или артикул товара:', cancelRow('sk'));
    case 'sqs':
      return showStockSearch(S, S.state.stockQuery || '', n(0), true);
    case 'su':
      return showSummary(S, a[0] || 'today', true);
    case 'st':
      return showSettings(S, true);
    case 'stn':
      return toggleNotify(S, a[0]);
    case 'sth':
      if (a[0]) return setSummaryHour(S, n(0, 21));
      return show(S, v.hourPicker(S.prefs.summaryHour), true);
    case 'stu':
      return ctx.reply(
        'Отвязать этот Telegram от аккаунта CRM? Уведомления приходить перестанут.',
        v.inline([[v.btn('Да, отвязать', 'stuy'), v.btn('Отмена', 'st')]])
      );
    case 'stuy':
      store.deleteLinkByUser(S.user.id);
      return ctx.reply('Telegram отвязан. Чтобы привязать снова, нажмите /start.', { remove_keyboard: true });
    default:
      return undefined;
  }
}

async function handleStateText(S, text) {
  const mode = S.state.mode;
  if (mode === 'order_new') return newOrderText(S, text);
  if (mode === 'task_new') return newTaskText(S, text);
  if (mode === 'comment') {
    if (!need(S, 'orders_edit')) return;
    const detail = q.getOrder(S.user, S.prefs, S.state.orderId);
    if (!detail) {
      S.clearMode();
      return S.ctx.reply('Заявка не найдена или недоступна вам.');
    }
    await crm.request(S.user, 'POST', `/orders/${detail.order.id}/history/comment`, { json: { message: text } });
    S.clearMode();
    S.ctx.reply(`Комментарий добавлен к заявке #${detail.order.id}.`);
    return showOrder(S, detail.order.id, false);
  }
  if (mode === 'order_search') {
    S.setState({ ...S.state, mode: undefined, search: text });
    return showOrderSearch(S, text, 0, false);
  }
  if (mode === 'stock_search') {
    S.setState({ ...S.state, mode: undefined, stockQuery: text });
    return showStockSearch(S, text, 0, false);
  }
  if (mode === 'photo') {
    return S.ctx.reply('Сейчас жду фото. Отправьте файл или нажмите «Готово» под предыдущим сообщением.');
  }
  return undefined;
}

function quickSearch(S, text) {
  if (!S.prefs.perms.orders_view) return showMenu(S);
  const idMatch = text.match(/^[#№]?\s*(\d{1,7})$/);
  if (idMatch && text.length <= 8) {
    const detail = q.getOrder(S.user, S.prefs, Number(idMatch[1]));
    if (detail) return showOrder(S, detail.order.id, false);
  }
  S.patchState({ search: text });
  return showOrderSearch(S, text, 0, false);
}

async function handleCommand(S, text) {
  const cmd = text.split(/[\s@]/)[0].toLowerCase();
  switch (cmd) {
    case '/start':
    case '/menu':
    case '/help':
      return showMenu(S);
    case '/cancel':
      S.clearMode();
      return S.ctx.reply('Отменено.', v.mainMenuKeyboard(S.prefs));
    case '/orders':
      S.clearMode();
      return showOrders(S);
    case '/new':
      return startNewOrder(S);
    case '/tasks':
      S.clearMode();
      return showTasks(S);
    case '/stock':
      S.clearMode();
      return showStock(S);
    case '/summary':
      S.clearMode();
      return showSummary(S);
    case '/settings':
      S.clearMode();
      return showSettings(S);
    case '/unlink':
      return S.ctx.reply('Отвязать этот Telegram от аккаунта CRM?', v.inline([[v.btn('Да, отвязать', 'stuy'), v.btn('Отмена', 'st')]]));
    default:
      return S.ctx.reply('Неизвестная команда. Нажмите /menu, чтобы увидеть возможности.');
  }
}

async function handleMessage(S, msg) {
  if (msg.contact) return S.ctx.reply('Вы уже привязаны. Настройки — в разделе «Настройки».');
  if (msg.photo || msg.document || msg.video) return handleMedia(S, msg);
  const text = String(msg.text || '').trim();
  if (!text) return undefined;
  if (text.startsWith('/')) return handleCommand(S, text);

  const menuActions = {
    [v.MENU.orders]: () => showOrders(S),
    [v.MENU.newOrder]: () => startNewOrder(S),
    [v.MENU.tasks]: () => showTasks(S),
    [v.MENU.stock]: () => showStock(S),
    [v.MENU.summary]: () => showSummary(S),
    [v.MENU.settings]: () => showSettings(S),
  };
  if (menuActions[text]) {
    S.clearMode();
    return menuActions[text]();
  }
  if (S.state.mode) return handleStateText(S, text);
  return quickSearch(S, text);
}

async function processUpdate(update) {
  const msg = update.message || null;
  const cb = update.callback_query || null;
  const chat = msg?.chat || cb?.message?.chat;
  if (!chat || chat.type !== 'private') return {};

  const ctx = new Ctx({
    chatId: chat.id,
    callback: cb ? { id: cb.id, messageId: cb.message?.message_id, data: cb.data || '' } : null,
  });
  try {
    const link = store.getLinkByChat(chat.id);
    if (!link) {
      handleUnlinked(ctx, msg || { chat, from: cb.from }, cb);
    } else if (!link.user.isActive) {
      store.deleteLinkByChat(chat.id);
      ctx.reply('Ваш аккаунт в CRM отключён, доступ к боту закрыт.', { remove_keyboard: true });
    } else {
      const S = makeSession(ctx, link, chat.id);
      if (cb) await handleCallback(S, cb.data);
      else await handleMessage(S, msg);
    }
  } catch (e) {
    console.error('[telegram] handler error:', e?.message || e);
    ctx.reply(e instanceof crm.CrmError ? `Не получилось: ${esc(e.message)}` : 'Что-то пошло не так. Попробуйте ещё раз или откройте /menu.');
  }
  return ctx.flush();
}

const chains = new Map();

/** Обновления одного чата выполняются строго по очереди, чтобы диалоговые шаги не перемешивались. */
function processSerially(update) {
  const chat = update.message?.chat || update.callback_query?.message?.chat;
  const key = chat ? String(chat.id) : 'global';
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => processUpdate(update));
  chains.set(key, next);
  next.finally(() => {
    if (chains.get(key) === next) chains.delete(key);
  }).catch(() => {});
  return next;
}

module.exports = { processUpdate: processSerially, HELP_TEXT, cfg };
