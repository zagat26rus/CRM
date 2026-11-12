/**
 * Parse free-text parts query into structured fields.
 * Uses rule-based parser always; optionally refines via OpenAI-compatible LLM.
 */
const axios = require('axios');
const { detectPartKind, normalizeModelKey, PART_DEFS } = require('./relevance');

const PART_KIND_LIST = PART_DEFS.map((p) => p.kind).join('|') + '|any';

function ruleParse(raw) {
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();

  const detected = detectPartKind(lower);
  let partKind = detected.kind;
  let partLabel = detected.label;

  let brand = '';
  let model = '';

  const iphone =
    lower.match(/\biphone\s*([a-z0-9]+(?:\s*(?:pro|max|plus|mini|air))*)\b/i) ||
    text.match(/\bайфон\s*([a-z0-9]+(?:\s*(?:pro|max|plus|mini|air))*)\b/i);
  if (iphone) {
    brand = 'Apple';
    model = `iPhone ${iphone[1].replace(/\s+/g, ' ').trim()}`
      .replace(/\biPhone\s+/i, 'iPhone ')
      .replace(/\biphone\b/i, 'iPhone');
    model = model
      .replace(/\bpro\b/gi, 'Pro')
      .replace(/\bmax\b/gi, 'Max')
      .replace(/\bplus\b/gi, 'Plus')
      .replace(/\bmini\b/gi, 'Mini')
      .replace(/\bair\b/gi, 'Air')
      .replace(/\bxr\b/gi, 'XR')
      .replace(/\bxs\b/gi, 'XS')
      .replace(/\bx\b/gi, 'X');
  } else if (/samsung|galaxy/i.test(lower)) {
    brand = 'Samsung';
    const g = text.match(/galaxy\s+([a-z0-9\s+\-]+)/i);
    model = g ? `Galaxy ${g[1].trim()}` : text;
  } else if (/xiaomi|redmi|poco/i.test(lower)) {
    brand = 'Xiaomi';
  }

  const brandForQuery =
    brand &&
    model &&
    !String(model).toLowerCase().includes(String(brand).toLowerCase()) &&
    !(brand === 'Apple' && /^iphone/i.test(model))
      ? brand
      : '';
  const searchQuery =
    [partLabel || (partKind !== 'any' ? partKind : ''), brandForQuery, model]
      .filter(Boolean)
      .join(' ')
      .trim() || text;

  return {
    raw: text,
    brand,
    model,
    partKind,
    partLabel: partLabel || '',
    searchQuery,
    problemName: detected.crmIssue || '',
    modelKey: normalizeModelKey(brand, model),
    via: 'rules',
  };
}

async function llmParse(raw, llmConfig) {
  const apiKey = String(llmConfig?.apiKey || '').trim();
  const baseUrl = String(llmConfig?.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
  const modelName = String(llmConfig?.model || 'deepseek-chat').trim() || 'deepseek-chat';
  if (!apiKey) return null;

  const system = `Ты помощник сервисного центра. Из запроса на запчасть извлеки JSON:
{"brand":"","model":"","partKind":"${PART_KIND_LIST}","partLabel":"","searchQuery":"краткий поисковый запрос на русском"}
partKind:
battery=АКБ, display=дисплей, touchglass=тачскрин, flex=шлейф, charging=разъём зарядки,
camera=модуль камеры, camera_glass=стекло камеры, backglass=крышка/корпус,
speaker=динамик, microphone=микрофон, button=кнопка, sim=сим-лоток, vibrator=вибро,
antenna=антенна, adhesive=скотч/проклейка, any=неясно
Только JSON, без markdown.`;

  try {
    const res = await axios.post(
      `${baseUrl}/v1/chat/completions`,
      {
        model: modelName,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: String(raw || '') },
        ],
        response_format: { type: 'json_object' },
      },
      {
        timeout: 20000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        validateStatus: (s) => s < 500,
      },
    );
    if (res.status >= 400) return null;
    const content = res.data?.choices?.[0]?.message?.content || '';
    const json = JSON.parse(content);
    const base = ruleParse(raw);
    const partKind = String(json.partKind || base.partKind || 'any').trim();
    const partLabel = String(json.partLabel || base.partLabel || '').trim();
    const detected = detectPartKind(partLabel || partKind);
    return {
      ...base,
      brand: String(json.brand || base.brand || '').trim(),
      model: String(json.model || base.model || '').trim(),
      partKind,
      partLabel,
      searchQuery: String(json.searchQuery || base.searchQuery || raw)
        .replace(/\bApple\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
      problemName: base.problemName || detected.crmIssue || '',
      modelKey: normalizeModelKey(
        String(json.brand || base.brand || '').trim(),
        String(json.model || base.model || '').trim(),
      ),
      via: 'llm',
    };
  } catch {
    return null;
  }
}

async function parsePartsQuery(raw, llmConfig) {
  const rules = ruleParse(raw);
  const llm = await llmParse(raw, llmConfig);
  if (llm && rules.partKind !== 'any' && (!llm.partKind || llm.partKind === 'any')) {
    return { ...llm, partKind: rules.partKind, partLabel: rules.partLabel || llm.partLabel, problemName: rules.problemName };
  }
  // Prefer rules when LLM invents unknown kind
  if (llm && rules.partKind !== 'any' && rules.partKind !== llm.partKind) {
    const known = PART_DEFS.some((p) => p.kind === llm.partKind);
    if (!known) {
      return { ...llm, partKind: rules.partKind, partLabel: rules.partLabel, problemName: rules.problemName };
    }
  }
  return llm || rules;
}

module.exports = { parsePartsQuery, ruleParse };
