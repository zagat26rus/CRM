// Ретранслятор Telegram для CRM. Хостинг CRM не пропускает трафик ни к Telegram, ни от него,
// поэтому воркер работает в обе стороны:
//   1) Telegram -> воркер (/hook) -> CRM (webhook). Ответ CRM возвращается Telegram как есть.
//   2) CRM -> воркер (/bot..., /file/bot...) -> api.telegram.org. Доступ только с заголовком x-relay-key.
//
// Переменные воркера:
//   RELAY_KEY        секрет (в CRM это TELEGRAM_RELAY_KEY)
//   CRM_WEBHOOK_URL  https://www.fedfix.ru/api/telegram/webhook
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/hook') {
      if (request.method !== 'POST' || !env.CRM_WEBHOOK_URL) return new Response('not found', { status: 404 });
      const headers = new Headers();
      headers.set('content-type', 'application/json');
      const secret = request.headers.get('x-telegram-bot-api-secret-token');
      if (secret) headers.set('x-telegram-bot-api-secret-token', secret);
      const resp = await fetch(env.CRM_WEBHOOK_URL, { method: 'POST', headers, body: request.body });
      return new Response(resp.body, {
        status: resp.status,
        headers: { 'content-type': resp.headers.get('content-type') || 'application/json' },
      });
    }

    if (!env.RELAY_KEY || request.headers.get('x-relay-key') !== env.RELAY_KEY) {
      return new Response('forbidden', { status: 403 });
    }
    if (!/^\/(file\/)?bot[^/]+\//.test(url.pathname)) {
      return new Response('not found', { status: 404 });
    }
    const target = new URL(url.pathname + url.search, 'https://api.telegram.org');
    const headers = new Headers(request.headers);
    headers.delete('x-relay-key');
    headers.delete('host');
    return fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    });
  },
};
