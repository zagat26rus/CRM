# Telegram-бот для CRM (@fixnetcrm_bot)

Модуль лежит в `back/src/telegram/`, подключается тремя строками в `back/src/index.js` (см. `../index.js`).
Интерфейс настроек: `frontend/TelegramBotModal.tsx` + `frontend/Settings.tsx.patch` (Настройки → Интеграции → Telegram-бот).

## Переменные `back/.env` (токен в git не коммитится)

| Переменная | Назначение |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | токен бота от @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | секрет заголовка `X-Telegram-Bot-Api-Secret-Token` |
| `TELEGRAM_WEBHOOK_URL` | по умолчанию `https://www.fedfix.ru/api/telegram/webhook` |
| `TELEGRAM_BOT_USERNAME` | по умолчанию `fixnetcrm_bot` |
| `TELEGRAM_API_BASE` | адрес ретранслятора (по умолчанию `https://api.telegram.org`) |
| `TELEGRAM_RELAY_KEY` | секрет ретранслятора, уходит заголовком `x-relay-key` |
| `TELEGRAM_TZ` | часовой пояс сводок, по умолчанию `Europe/Moscow` |

Webhook регистрируется запросом `setWebhook` с `secret_token` и `allowed_updates=["message","callback_query"]`.

## Привязка сотрудника

* По коду: CRM → Настройки → Telegram-бот → «Получить код привязки» → открыть ссылку или отправить код боту (8 символов, 15 минут, одноразовый).
* По номеру: сотрудник сохраняет телефон в CRM (или его вводит администратор), в боте жмёт «Отправить мой номер».
  Номер Telegram должен совпасть с номером в CRM, контакт должен быть собственным.

Один сотрудник = один Telegram, один Telegram = один сотрудник. Данные ограничены компанией сотрудника.

## Что умеет бот

Заявки (список, фильтры, поиск, карточка, смена статуса, фото, комментарии, создание), задачи (список, выполнение, создание),
склад (общий остаток и по категориям, поиск), сводка (деньги, оборот, прибыль, заявки, продажи магазина) за сегодня, вчера, неделю, месяц.
Все изменения идут через обычный API CRM от имени сотрудника, поэтому история заявки, СМС и права работают как в самой CRM.

## Права и уведомления (по каждому сотруднику)

Права: видеть/менять/создавать заявки, видеть/создавать задачи, склад, деньги; область заявок — все или только свои.
Уведомления: новые заявки, смена статуса, задачи на мою роль, все новые задачи, вечерняя сводка (час настраивается).
Роли задач: администратор, техник 1, техник 2, менеджер, курьер. Автор действия уведомление о нём не получает.
Администрация (owner/admin/director) настраивает всё в CRM; сотрудник может менять свои уведомления в боте.

## Ретранслятор (обязателен для хостинга 45.8.230.220)

Проверено: хостинг CRM не пропускает трафик в обе стороны. Исходящие запросы к `api.telegram.org` зависают на TLS,
а серверы Telegram не могут достучаться до `fedfix.ru` (`getWebhookInfo`: `Connection timed out`, пакетов с адресов Telegram на сервер нет).
Поэтому нужен посредник вне РФ, который доступен и Telegram, и CRM. Один воркер закрывает оба направления:

* Telegram -> `https://<воркер>/hook` -> CRM `/api/telegram/webhook`;
* CRM -> `https://<воркер>/bot...` -> `api.telegram.org` (с заголовком `x-relay-key`).

1. Cloudflare Worker: создайте воркер с кодом `relay/cloudflare-worker.js` (Workers & Pages -> Create -> Hello World -> Edit code -> Deploy).
   В Settings -> Variables добавьте `RELAY_KEY` (секрет, длинная случайная строка) и `CRM_WEBHOOK_URL=https://www.fedfix.ru/api/telegram/webhook`.
   Либо VPS вне РФ с nginx: `relay/nginx-relay.conf`.
2. В `back/.env` на сервере CRM:
   `TELEGRAM_API_BASE=https://<воркер>`, `TELEGRAM_RELAY_KEY=<тот же секрет>`, `TELEGRAM_WEBHOOK_URL=https://<воркер>/hook`.
3. `pm2 restart black-crm-back`. CRM сама перерегистрирует webhook на адрес воркера (`ensureWebhook`).

## Откат

`index.js.bak-*` лежит рядом с `index.js` на сервере; модуль отключается удалением `TELEGRAM_BOT_TOKEN` из `.env` и рестартом.
