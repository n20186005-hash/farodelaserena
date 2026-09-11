// One-off asset pipeline: de-duplicate, normalise names, compress + emit WebP.
// Backs up originals outside the repo before touching anything.
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const GALLERY = path.join(ROOT, 'public', 'gallery');
const BACKUP = path.join(os.tmpdir(), 'faro-gallery-originals');

// hero keeps a larger render, gallery shots are cards that never exceed ~700px
const HERO = '/gallery/faro-monumental-de-la-serena-1.jpg';
const PLAN = {
  hero: { width: 1920, jpeg: 80, webp: 76 },
  gallery: { width: 1400, jpeg: 76, webp: 72 },
};

const NAMED = /^faro-monumental-de-la-serena-(\d+)\.jpe?g$/i;

function md5(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}

function human(bytes) {
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

// ---------- 1. backup originals ----------
fs.mkdirSync(BACKUP, { recursive: true });
const originals = fs.readdirSync(GALLERY);
let backedUp = 0;
for (const name of originals) {
  const dest = path.join(BACKUP, name);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(path.join(GALLERY, name), dest);
    backedUp++;
  }
}
console.log(`[backup] ${backedUp} new file(s) -> ${BACKUP}`);

// ---------- 2. de-duplicate ----------
const groups = new Map();
for (const name of fs.readdirSync(GALLERY)) {
  const hash = md5(path.join(GALLERY, name));
  if (!groups.has(hash)) groups.set(hash, []);
  groups.get(hash).push(name);
}

const removed = [];
for (const [, members] of groups) {
  if (members.length < 2) continue;
  // keep the lowest-numbered canonical name; everything else is redundant
  const named = members.filter((m) => NAMED.test(m)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const keep = named[0] ?? members[0];
  for (const m of members) {
    if (m === keep) continue;
    fs.unlinkSync(path.join(GALLERY, m));
    removed.push(m);
  }
}
console.log(`[dedupe] removed ${removed.length} redundant file(s)`);
for (const r of removed) console.log(`         - ${r.length > 46 ? r.slice(0, 46) + '…' : r}`);

// ---------- 3. renumber canonical names so numbering stays contiguous ----------
const remaining = fs
  .readdirSync(GALLERY)
  .filter((n) => NAMED.test(n))
  .sort((a, b) => Number(a.match(NAMED)[1]) - Number(b.match(NAMED)[1]));

const renames = [];
remaining.forEach((name, index) => {
  const target = `faro-monumental-de-la-serena-${index + 1}.jpg`;
  if (name !== target) renames.push([name, target]);
});
for (const [from, to] of renames) {
  fs.renameSync(path.join(GALLERY, from), path.join(GALLERY, to));
}
if (renames.length) console.log(`[rename] normalised ${renames.length} filename(s)`);

// ---------- 4. compress + emit webp ----------
const finalFiles = fs
  .readdirSync(GALLERY)
  .filter((n) => NAMED.test(n))
  .sort((a, b) => Number(a.match(NAMED)[1]) - Number(b.match(NAMED)[1]));

let before = 0;
let afterJpeg = 0;
let afterWebp = 0;

for (const name of finalFiles) {
  const file = path.join(GALLERY, name);
  const isHero = `/${path.posix.join('gallery', name)}` === HERO;
  const plan = isHero ? PLAN.hero : PLAN.gallery;

  const meta = await sharp(file).metadata();
  before += fs.statSync(file).size;

  const pipeline = () =>
    sharp(file).rotate().resize({ width: plan.width, withoutEnlargement: true, fit: 'inside' });

  const jpegBuf = await pipeline()
    .jpeg({ quality: plan.jpeg, mozjpeg: true, progressive: true, chromaSubsampling: '4:2:0' })
    .toBuffer();
  await sharp(jpegBuf).toFile(file + '.tmp');
  fs.renameSync(file + '.tmp', file);

  const webpBuf = await pipeline().webp({ quality: plan.webp, effort: 6 }).toBuffer();
  fs.writeFileSync(file.replace(/\.jpe?g$/i, '.webp'), webpBuf);

  afterJpeg += jpegBuf.length;
  afterWebp += webpBuf.length;
  console.log(
    `[img] ${name}  ${meta.width}x${meta.height} -> ${plan.width}w  ` +
      `${(fs.statSync(file).size / 1024).toFixed(0)}KB jpg / ${(webpBuf.length / 1024).toFixed(0)}KB webp`,
  );
}

console.log('');
console.log(`source total     : ${human(before)}`);
console.log(`optimised jpeg   : ${human(afterJpeg)}`);
console.log(`generated webp   : ${human(afterWebp)}`);
console.log(`paid by browser  : ${human(afterWebp)} (webp) / ${human(afterJpeg)} (jpeg fallback)`);
console.log(`reduction        : ${(100 - (afterWebp / before) * 100).toFixed(1)}% vs originals`);
console.log(`files on disk    : ${finalFiles.length} images (+${finalFiles.length} webp)`);
