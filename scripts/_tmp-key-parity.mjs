import fs from 'node:fs';

const langs = ['en', 'es', 'zh', 'arn'];
const load = (l) => JSON.parse(fs.readFileSync(`src/i18n/${l}.json`, 'utf8'));

const flat = (obj, path = '', out = new Map()) => {
  if (typeof obj === 'string') out.set(path, obj);
  else if (Array.isArray(obj)) obj.forEach((v, i) => flat(v, `${path}[${i}]`, out));
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) flat(v, path ? `${path}.${k}` : k, out);
  }
  return out;
};

const maps = { en: flat(load('en')), es: flat(load('es')), zh: flat(load('zh')), arn: flat(load('arn')) };

console.log('===== key parity (vs en) =====');
for (const l of ['es', 'zh', 'arn']) {
  const mine = new Set(maps[l].keys());
  const ref = new Set(maps.en.keys());
  const missing = [...ref].filter((k) => !mine.has(k));
  const extra = [...mine].filter((k) => !ref.has(k));
  console.log(`  ${l}: missing ${missing.length} | extra ${extra.length}`);
  if (missing.length) console.log(`     missing: ${missing.slice(0, 25).join(', ')}${missing.length > 25 ? ' …' : ''}`);
  if (extra.length) console.log(`     extra:   ${extra.slice(0, 25).join(', ')}${extra.length > 25 ? ' …' : ''}`);
}

console.log('\n===== values identical to another language (possible untranslated string) =====');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
for (const l of ['es', 'zh', 'arn']) {
  const hits = [];
  for (const [k, v] of maps[l]) {
    if (norm(v).length < 35) continue;
    for (const other of ['en', 'es'].filter((o) => o !== l)) {
      if (maps[other].has(k) && norm(maps[other].get(k)) === norm(v)) {
        hits.push(`${k}  ≡ ${other}`);
      }
    }
  }
  console.log(`  ${l}: ${hits.length}`);
  hits.slice(0, 30).forEach((h) => console.log(`     ${h}`));
}
