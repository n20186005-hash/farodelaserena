import fs from 'node:fs';

const files = {
  es: 'src/i18n/es.json',
  en: 'src/i18n/en.json',
  zh: 'src/i18n/zh.json',
  arn: 'src/i18n/arn.json',
};

const CJK = /[\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
const EN_STOP =
  /\b(the|and|of|to|with|is|are|was|were|you|your|from|for|this|that|these|those|it|its|about|how|when|where|what|which|can|will|would|more|between|over|near|there|their|been|have|has|not|but|also|after|before|during|through|into|out|up|down|on|in|at|by|as|or|if|so|than|then|them|they|we|us|our|be|been|do|does|did)\b/gi;
const ES_STOP =
  /\b(el|la|los|las|del|de|que|para|con|una|unos|unas|un|en|es|son|está|están|su|sus|se|al|por|cómo|qué|dónde|cuándo|más|desde|hasta|hacia|entre|sobre|este|esta|estos|estas|tiene|tienen|puedes|puede|pero|también|muy|sin|hay|fue|fueron|como|donde|cuando|quien|quienes|solo|sólo|con|porque|aunque|mientras)\b/gi;

const walk = (obj, path = '', out = []) => {
  if (typeof obj === 'string') {
    out.push({ path, value: obj });
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) walk(v, path ? `${path}.${k}` : k, out);
  }
  return out;
};

const countMatches = (re, s) => {
  const m = s.match(re);
  return m ? [...new Set(m.map((x) => x.toLowerCase()))] : [];
};

for (const [lang, file] of Object.entries(files)) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = walk(json);
  const flags = [];

  for (const { path, value } of entries) {
    if (value.length < 12) continue;
    const hasCjk = CJK.test(value);
    const en = countMatches(EN_STOP, value);
    const es = countMatches(ES_STOP, value);

    let reason = null;
    if (lang === 'zh' && !hasCjk) {
      // Chinese entry with no Chinese characters at all
      reason = `NO-CJK (latin only)`;
    } else if (lang === 'zh' && hasCjk && en.length >= 2) {
      reason = `EN=${en.join(',')}`;
    } else if (lang !== 'en' && lang !== 'zh' && en.length >= 2 && en.length > es.length) {
      reason = `EN=${en.join(',')}`;
    } else if (lang === 'en' && es.length >= 2 && es.length > en.length) {
      reason = `ES=${es.join(',')}`;
    } else if (lang !== 'zh' && hasCjk) {
      reason = 'CJK in non-Chinese entry';
    }

    if (reason) flags.push({ path, reason, value });
  }

  console.log(`\n===== ${lang} (${file}) — ${flags.length} flag(s) =====`);
  for (const f of flags) {
    console.log(`  [${f.reason}] ${f.path}`);
    console.log(`      "${f.value.slice(0, 150)}${f.value.length > 150 ? '…' : ''}"`);
  }
}
