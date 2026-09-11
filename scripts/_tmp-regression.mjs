import fs from 'node:fs';

const px = (s) =>
  [...s].reduce((n, ch) => n + (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? 2 : 1), 0);

const one = (html, re) => {
  const m = html.match(re);
  return m ? m[1].trim() : null;
};

let problems = 0;
const fail = (msg) => {
  problems += 1;
  console.log(`   !! ${msg}`);
};

for (const lang of ['es', 'en', 'zh', 'arn']) {
  const file = `dist/${lang}/index.html`;
  console.log(`\n=== /${lang}/ ===`);
  if (!fs.existsSync(file)) {
    fail('missing build output');
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');

  const title = one(html, /<title>([\s\S]*?)<\/title>/);
  const desc = one(html, /<meta name="description" content="([^"]*)"/);
  console.log(`  title ${px(title)}px | desc ${px(desc)}px`);
  if (px(title) > 110) fail('title too long');
  if (px(desc) > 165) fail('description too long');

  // --- JSON-LD parses + block inventory ---
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  );
  const types = [];
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      if (parsed['@graph']) types.push(...parsed['@graph'].map((n) => n['@type']));
      else if (parsed['@type']) types.push(parsed['@type']);
      else if (Array.isArray(parsed)) types.push(...parsed.map((n) => n['@type']));
    } catch {
      fail(`JSON-LD block does not parse`);
    }
  }
  console.log(`  JSON-LD: ${[...new Set(types)].join(', ')}`);

  // --- FAQ parity between page and schema ---
  const graph = JSON.parse(
    (blocks.find((b) => b.includes('FAQPage')) ?? '{}').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
  );
  const schemaQ = (JSON.stringify(graph).match(/"@type":"Question"/g) ?? []).length;
  const visibleQ = [...html.matchAll(/<summary[^>]*>/g)].length;
  console.log(`  FAQ visible ${visibleQ} | schema ${schemaQ}`);
  if (visibleQ !== schemaQ) fail('visible FAQ count != schema Question count');

  // --- section order + background alternation ---
  const bgSeq = [
    ...html.matchAll(/<section[^>]*id="([^"]+)"[^>]*style="background: var\(--bg-([a-z]+)\)/g),
  ].map((m) => `${m[1]}:${m[2]}`);
  const order = [...html.matchAll(/<section[^>]*id="([^"]+)"/g)].map((m) => m[1]);
  console.log(`  order: ${order.join(' > ')}`);
  const expected = ['about', 'quick-facts', 'weather', 'transport', 'map', 'history', 'faq'];
  const idx = expected.map((id) => order.indexOf(id));
  if (idx.some((i) => i < 0) || idx.some((v, i) => i > 0 && v < idx[i - 1])) fail('section order broke');
  for (let i = 1; i < bgSeq.length; i += 1) {
    if (bgSeq[i].split(':')[1] === bgSeq[i - 1].split(':')[1]) {
      fail(`background clash: ${bgSeq[i - 1]} & ${bgSeq[i]}`);
    }
  }

  // --- duplicate headings + hreflang ---
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim(),
  );
  const dup = [...new Set(h2s.filter((h, i) => h2s.indexOf(h) !== i))];
  if (dup.length) fail(`duplicate H2: ${dup.join(' | ')}`);
  console.log(`  H2 count: ${h2s.length}, duplicates: ${dup.length}`);

  const hl = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)"/g)].map((m) => m[1]);
  console.log(`  hreflang: ${hl.sort().join(',')}`);
  if (hl.length !== 5) fail('hreflang count != 5');
}

console.log(problems === 0 ? '\nALL REGRESSION CHECKS PASSED' : `\n${problems} PROBLEM(S)`);
