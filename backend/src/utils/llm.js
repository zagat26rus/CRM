/**
 * OpenAI-compatible chat helper (DeepSeek / OpenAI / Groq / Gemini).
 * Deploy to: /var/www/black-crm/back/src/utils/llm.js
 *
 * Env fallback (если в настройках компании ключ пустой):
 *   GROQ_API_KEY | GEMINI_API_KEY | OPENAI_API_KEY | DEEPSEEK_API_KEY | LLM_API_KEY
 *   LLM_BASE_URL | LLM_MODEL | LLM_PROVIDER
 */
const axios = require('axios');

const ENV_PRESETS = {
  groq: {
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    envKeys: ['GROQ_API_KEY', 'LLM_API_KEY'],
  },
  gemini: {
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'LLM_API_KEY'],
  },
  openai: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    envKeys: ['OPENAI_API_KEY', 'LLM_API_KEY'],
  },
  deepseek: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    envKeys: ['DEEPSEEK_API_KEY', 'LLM_API_KEY'],
  },
};

function firstEnv(names) {
  for (const name of names) {
    const v = String(process.env[name] || '').trim();
    if (v) return v;
  }
  return '';
}

/** Merge company LLM settings with process.env fallback. */
function resolveLlmConfig(llmConfig = {}) {
  const fromCompany = {
    provider: String(llmConfig?.provider || '').trim(),
    baseUrl: String(llmConfig?.baseUrl || '').trim(),
    model: String(llmConfig?.model || '').trim(),
    apiKey: String(llmConfig?.apiKey || '').trim(),
  };
  if (fromCompany.apiKey) return fromCompany;

  const preferred = String(process.env.LLM_PROVIDER || fromCompany.provider || 'groq').toLowerCase();
  const order = [preferred, 'groq', 'gemini', 'openai', 'deepseek'].filter(
    (v, i, a) => v && a.indexOf(v) === i && ENV_PRESETS[v],
  );

  for (const id of order) {
    const preset = ENV_PRESETS[id];
    const apiKey = firstEnv(preset.envKeys);
    if (!apiKey) continue;
    return {
      provider: String(process.env.LLM_PROVIDER || preset.provider),
      baseUrl: String(process.env.LLM_BASE_URL || fromCompany.baseUrl || preset.baseUrl),
      model: String(process.env.LLM_MODEL || fromCompany.model || preset.model),
      apiKey,
      fromEnv: true,
    };
  }

  return { ...fromCompany, fromEnv: false };
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

function chatCompletionsUrl(baseUrl) {
  const u = String(baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
  if (u.endsWith('/chat/completions')) return u;
  if (u.endsWith('/v1') || /\/openai(?:\/v1)?$/i.test(u)) return `${u}/chat/completions`;
  return `${u}/v1/chat/completions`;
}

async function chatCompletions(llmConfig, { messages, temperature = 0.2, json = false, timeout = 35000 }) {
  const resolved = resolveLlmConfig(llmConfig);
  const apiKey = String(resolved.apiKey || '').trim();
  if (!apiKey) {
    const err = new Error('no_api_key');
    err.code = 'no_api_key';
    throw err;
  }
  const url = chatCompletionsUrl(resolved.baseUrl);
  const modelName = String(resolved.model || 'deepseek-flash').trim() || 'deepseek-flash';
  const payload = {
    model: modelName,
    temperature,
    messages,
  };
  if (json) payload.response_format = { type: 'json_object' };

  // Groq/Cloudflare режет дефолтный axios UA (error 1010) и часть RU IP.
  // LLM_PROXY / HTTPS_PROXY — опциональный outbound-прокси (http://user:pass@host:port).
  const proxyUrl = String(process.env.LLM_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
  let proxy;
  if (proxyUrl) {
    try {
      const u = new URL(proxyUrl);
      proxy = {
        protocol: u.protocol.replace(':', ''),
        host: u.hostname,
        port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80),
        auth: u.username ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password || '') } : undefined,
      };
    } catch {
      proxy = undefined;
    }
  }

  const doPost = async (body) =>
    axios.post(url, body, {
      timeout,
      proxy: proxy || false,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      validateStatus: () => true,
    });

  let res = await doPost(payload);
  if (res.status >= 400 && json) {
    const { response_format: _jsonFmt, ...plain } = payload;
    res = await doPost(plain);
  }
  if (res.status >= 400) {
    const detail = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
    throw new Error(`LLM HTTP ${res.status}: ${detail.slice(0, 240)}`);
  }
  const content = res.data?.choices?.[0]?.message?.content || '';
  return { content, raw: res.data };
}

async function chatJson(llmConfig, { messages, temperature = 0.2, timeout = 35000 }) {
  const { content } = await chatCompletions(llmConfig, { messages, temperature, json: true, timeout });
  const parsed = extractJson(content);
  if (!parsed) throw new Error('llm_bad_json');
  return parsed;
}

async function chatText(llmConfig, { messages, temperature = 0.3, timeout = 35000 }) {
  const { content } = await chatCompletions(llmConfig, { messages, temperature, json: false, timeout });
  return String(content || '').trim();
}

module.exports = {
  extractJson,
  chatCompletionsUrl,
  chatCompletions,
  chatJson,
  chatText,
  resolveLlmConfig,
};
