// Ретранслятор Telegram Bot API для серверов, у которых заблокирован api.telegram.org.
// Переменная окружения воркера: RELAY_KEY (секрет; такой же задаётся в CRM как TELEGRAM_RELAY_KEY).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
