import fs from 'node:fs';

/** Pull the visible body text out of a built page and flag foreign-language sentences. */
const CJK = /[\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
const EN_STOP =
  /\b(the|and|of|to|with|is|are|was|were|you|your|from|for|this|that|these|those|its|about|how|when|where|what|which|can|will|would|more|between|over|near|there|their|been|have|has|not|but|also|after|before|during|through|into|at|by|as|or|if|so|than|then|them|they)\b/gi;
const ES_STOP =
  /\b(el|la|los|las|del|que|para|con|una|un|en|es|son|está|su|se|al|por|cómo|qué|dónde|más|desde|hasta|hacia|entre|sobre|este|esta|tiene|puede|pero|también|sin|hay|fue|como|donde|cuando|porque|mientras)\b/gi;

const unique = (re, s) => [...new Set((s.match(re) ?? []).map((x) => x.toLowerCase()))];

for (const lang of ['es', 'en', 'zh', 'arn']) {
  const html = fs.readFileSync(`dist/${lang}/index.html`, 'utf8');
  const langAttr = (html.match(/<html[^>]*\slang="([^"]+)"/) ?? [])[1];
  const ogLocale = (html.match(/property="og:locale"\s+content="([^"]+)"/) ?? [])[1];
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');

  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 25);

  const flagged = [];
  for (const line of lines) {
    const hasCjk = CJK.test(line);
    const en = unique(EN_STOP, line);
    const es = unique(ES_STOP, line);

    if (lang === 'zh' && !hasCjk && en.length >= 2) {
      flagged.push({ line, why: `EN=${en.join(',')}` });
    } else if (lang === 'en' && !hasCjk && es.length >= 3 && es.length > en.length) {
      flagged.push({ line, why: `ES=${es.join(',')}` });
    } else if (lang === 'es' && en.length >= 3 && en.length > es.length) {
      flagged.push({ line, why: `EN=${en.join(',')}` });
    } else if (lang === 'arn' && en.length >= 3 && en.length > es.length) {
      flagged.push({ line, why: `EN=${en.join(',')}` });
    }
  }

  console.log(
    `\n===== dist/${lang}/index.html — <html lang="${langAttr}">, og:locale=${ogLocale} — ${flagged.length} suspicious line(s) =====`,
  );
  for (const f of flagged) {
    console.log(`  [${f.why}]`);
    console.log(`      "${f.line.slice(0, 170)}${f.line.length > 170 ? '…' : ''}"`);
  }
}
