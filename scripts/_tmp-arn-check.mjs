import fs from 'node:fs';

/** Mapudungun function words / loanword particles actually used across arn.json. */
const ARN_MARK =
  /\b(ka|guive|peve|rupi|hag̃ua|hagua|mba'e|mba'éichapa|mba'ére|oĩ|oi|térã|tera|ñi|jeguata|yvate|tenda|ehecha|reg̃uahẽ|reguahẽ|reikuaava'erã|ára|ara|ko'ág̃a|kütra|kutra|pewma|pu|kiñe|epu|femgechi|wirari|fey|feymew|tüfachi|tufachi|kom|rume|may|püle|pule|wenu|mapu|küme|kume|wangülen|wangulen)\b/gi;
const ES_STOP =
  /\b(el|la|los|las|del|que|para|con|una|un|en|es|son|está|están|su|sus|se|al|por|cómo|qué|dónde|cuándo|más|desde|hasta|hacia|entre|sobre|este|esta|estos|estas|tiene|tienen|puedes|puede|pero|también|muy|sin|hay|fue|fueron|como|donde|cuando|porque|aunque|mientras|todo|todos|tenemos|estaba|sino|además)\b/gi;
const G_TILDE = /g̃|'g|ñ/;

const walk = (obj, path = '', out = []) => {
  if (typeof obj === 'string') out.push({ path, value: obj });
  else if (Array.isArray(obj)) obj.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) walk(v, path ? `${path}.${k}` : k, out);
  }
  return out;
};

const count = (re, s) => (s.match(re) ?? []).length;

for (const lang of ['arn']) {
  const json = JSON.parse(fs.readFileSync(`src/i18n/${lang}.json`, 'utf8'));
  const entries = walk(json).filter((e) => e.value.length >= 55);

  const spanish = [];
  for (const e of entries) {
    const es = count(ES_STOP, e.value);
    const arn = count(ARN_MARK, e.value) + (G_TILDE.test(e.value) ? 1 : 0);
    if (es >= 3 && arn === 0) spanish.push({ ...e, es, arn });
  }

  console.log(`===== ${lang}: ${entries.length} long entries, ${spanish.length} look purely Spanish =====`);
  for (const s of spanish) {
    console.log(`  [ES stops=${s.es} ARN markers=${s.arn}] ${s.path}`);
    console.log(`      "${s.value.slice(0, 190)}${s.value.length > 190 ? '…' : ''}"`);
  }
}
