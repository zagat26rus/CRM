const tg = require('./tgApi');
const store = require('./store');
const { cfg } = require('./config');

const MAX_TEXT = 4000;

function clipText(text) {
  const s = String(text || '');
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s;
}

/**
 * Собирает ответы на одно обновление. Если Telegram API с сервера доступен — отправляет обычными запросами.
 * Если нет (блокировка исходящих соединений) — отвечает прямо в HTTP-ответ webhook'а: Telegram умеет
 * выполнять один метод из тела ответа, поэтому несколько сообщений склеиваются в одно.
 */
class Ctx {
  constructor({ chatId, callback = null }) {
    this.chatId = String(chatId);
    this.callback = callback;
    this.items = [];
    this.cbAnswer = null;
  }

  reply(text, kb) {
    this.items.push({ kind: 'send', text: clipText(text), kb });
  }

  edit(text, kb) {
    if (this.callback?.messageId) this.items.push({ kind: 'edit', text: clipText(text), kb, messageId: this.callback.messageId });
    else this.reply(text, kb);
  }

  answer(text = '', alert = false) {
    if (this.callback) this.cbAnswer = { text, alert };
  }

  async performItem(item) {
    if (item.kind === 'send') {
      await tg.call('sendMessage', this.sendPayload(item));
      return;
    }
    try {
      await tg.call('editMessageText', {
        chat_id: this.chatId,
        message_id: item.messageId,
        text: item.text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: item.kb && item.kb.inline_keyboard ? item.kb : { inline_keyboard: [] },
      });
    } catch (e) {
      if (e.network) throw e;
      if (/not modified/i.test(e.message)) return;
      await tg.call('sendMessage', this.sendPayload(item));
    }
  }

  sendPayload(item) {
    const payload = {
      chat_id: this.chatId,
      text: item.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (item.kb) payload.reply_markup = item.kb;
    return payload;
  }

  inlineResponse() {
    const texts = this.items.filter((i) => i.kind === 'send' || i.kind === 'edit');
    if (!texts.length) {
      if (this.callback) return { method: 'answerCallbackQuery', callback_query_id: this.callback.id, text: this.cbAnswer?.text || '' };
      return {};
    }
    const last = texts[texts.length - 1];
    const body = clipText(texts.map((t) => t.text).join('\n\n'));
    const base = { chat_id: this.chatId, text: body, parse_mode: 'HTML', disable_web_page_preview: true };
    if (last.kind === 'edit') {
      return {
        method: 'editMessageText',
        ...base,
        message_id: last.messageId,
        reply_markup: last.kb && last.kb.inline_keyboard ? last.kb : { inline_keyboard: [] },
      };
    }
    const resp = { method: 'sendMessage', ...base };
    if (last.kb) resp.reply_markup = last.kb;
    return resp;
  }

  requeue(items) {
    for (const item of items) store.enqueue(this.chatId, { text: item.text, kb: item.kb || null });
    return {};
  }

  /** Возвращает объект для тела HTTP-ответа webhook'а (пустой, если всё отправлено напрямую). */
  async flush() {
    const polling = cfg().mode === 'polling';
    if (!tg.isUp()) return polling ? this.requeue(this.items) : this.inlineResponse();
    const pending = [...this.items];
    try {
      if (this.callback) {
        await tg
          .call('answerCallbackQuery', {
            callback_query_id: this.callback.id,
            text: this.cbAnswer?.text || undefined,
            show_alert: this.cbAnswer?.alert || undefined,
          })
          .catch((e) => {
            if (e.network) throw e;
          });
      }
      while (pending.length) {
        try {
          await this.performItem(pending[0]);
        } catch (e) {
          if (e.network) throw e;
          console.error('[telegram] send error:', e.message);
        }
        pending.shift();
      }
      return {};
    } catch (e) {
      if (!e.network) throw e;
      this.items = pending;
      return polling ? this.requeue(pending) : this.inlineResponse();
    }
  }
}

module.exports = { Ctx };
