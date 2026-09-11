// One-off: emit the small-screen WebP variants used by `srcset`.
// Every photo gets a 640w variant for grid cards; the hero additionally gets 960w.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const GALLERY = path.join(process.cwd(), 'public', 'gallery');
const NAMED = /^faro-monumental-de-la-serena-(\d+)\.jpg$/;
const HERO = 'faro-monumental-de-la-serena-1.jpg';

const files = fs
  .readdirSync(GALLERY)
  .filter((n) => NAMED.test(n))
  .sort((a, b) => Number(a.match(NAMED)[1]) - Number(b.match(NAMED)[1]));

let bytes = 0;
for (const name of files) {
  const widths = name === HERO ? [960, 640] : [640];
  for (const width of widths) {
    const out = path.join(GALLERY, name.replace(/\.jpg$/, `-${width}.webp`));
    await sharp(path.join(GALLERY, name))
      .resize({ width, withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: 70, effort: 6 })
      .toFile(out);
    const size = fs.statSync(out).size;
    bytes += size;
    console.log(`[variant] ${path.basename(out)}  ${(size / 1024).toFixed(0)}KB`);
  }
}

console.log(`\nvariant bytes total: ${(bytes / 1048576).toFixed(2)} MB`);
