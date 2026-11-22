// Összerakja a kész webappot a dist/ mappába.
//   node build.mjs
//   dist/index.html       – a telepíthető webapp (GitHub Pages ezt szolgálja ki)
//   dist/standalone.html  – minden kép beágyazva (az Android APK ezt csomagolja)
// A fotok/fordulo-XX mappákban lévő képeket és nyilatkozat.txt fájlokat automatikusan hozzáadja.
// Ha a 'sharp' csomag elérhető (a GitHub Action telepíti), a nagy telefonos fotókat 1600 px-re kicsinyíti.
import { readFile, writeFile, mkdir, cp, readdir, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(ROOT, 'dist');
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* nincs telepítve: a képek változatlanul kerülnek át */ }

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(join(ROOT, 'img'), join(DIST, 'img'), { recursive: true });

// --- fotók és nyilatkozatok fordulónként ---
const auto = { rounds: {} };
const photoFiles = [];                       // dist-beli relatív utak (a beágyazott változathoz)
const fotok = join(ROOT, 'fotok');
if (existsSync(fotok)) {
  for (const dir of (await readdir(fotok, { withFileTypes: true })).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const round = +((dir.name.match(/(\d+)/) || [])[1]);
    if (!round) continue;
    const src = join(fotok, dir.name);
    const files = (await readdir(src)).sort((a, b) => a.localeCompare(b, 'hu'));
    const entry = { photos: [], statement: null };
    for (const f of files) {
      const ext = extname(f).toLowerCase();
      if (IMG_EXT.has(ext)) {
        const outDir = join(DIST, 'fotok', dir.name);
        await mkdir(outDir, { recursive: true });
        let outName = f;
        if (sharp && ext !== '.gif') {
          outName = basename(f, extname(f)) + '.jpg';
          await sharp(join(src, f)).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 82, mozjpeg: true }).toFile(join(outDir, outName));
        } else {
          await copyFile(join(src, f), join(outDir, outName));
        }
        const rel = `fotok/${dir.name}/${outName}`;
        entry.photos.push({ src: rel });
        photoFiles.push(rel);
      } else if (/^nyilatkozat\.(txt|md)$/i.test(f)) {
        const lines = (await readFile(join(src, f), 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/);
        const st = { text: '', author: '', source: '' };
        const body = [];
        for (const l of lines) {
          const a = l.match(/^\s*Szerző:\s*(.+)$/i), s = l.match(/^\s*Forrás:\s*(\S+)/i);
          if (a) st.author = a[1].trim(); else if (s) st.source = s[1].trim(); else body.push(l);
        }
        st.text = body.join('\n').trim();
        if (st.text) entry.statement = st;
      }
    }
    if (entry.photos.length || entry.statement) auto.rounds[round] = entry;
  }
}

// --- oldal összefűzése ---
const app = await readFile(join(ROOT, 'app.html'), 'utf8');
const inline = async (html, file) => {
  const js = await readFile(join(ROOT, file), 'utf8');
  const out = html.replace(`<script src="${file}"></script>`, () => `<script>\n${js}\n</script>`);
  if (out === html) throw new Error(`Nem találom a <script src="${file}"> sort az app.html-ben`);
  return out;
};
let body = await inline(app, 'data.js');
body = await inline(body, 'content.js');
body = `<script>window.HATVAN_AUTO=${JSON.stringify(auto)};</script>\n` + body;

const head = extra => `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#123a80">
${extra}</head>
<body>
`;
const pwaHead = `<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="img/icons/icon-192.png">
<link rel="apple-touch-icon" href="img/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Hatvan U14">
`;
await writeFile(join(DIST, 'index.html'), head(pwaHead) + body + '\n</body>\n</html>\n', 'utf8');
await copyFile(join(ROOT, 'pwa', 'sw.js'), join(DIST, 'sw.js'));
await copyFile(join(ROOT, 'pwa', 'manifest.webmanifest'), join(DIST, 'manifest.webmanifest'));

// --- beágyazott változat (APK) ---
const imgs = {};
const addImg = async (rel, abs) => { const ext = extname(rel).toLowerCase(); if (MIME[ext]) imgs[rel] = `data:${MIME[ext]};base64,` + (await readFile(abs)).toString('base64'); };
for (const f of await readdir(join(ROOT, 'img', 'logos'))) await addImg(`img/logos/${f}`, join(ROOT, 'img', 'logos', f));
for (const rel of photoFiles) await addImg(rel, join(DIST, rel));
await writeFile(join(DIST, 'standalone.html'), head('') + `<script>window.HATVAN_IMG=${JSON.stringify(imgs)};</script>\n` + body + '\n</body>\n</html>\n', 'utf8');

const nPhotos = Object.values(auto.rounds).reduce((s, r) => s + r.photos.length, 0);
const nSt = Object.values(auto.rounds).filter(r => r.statement).length;
console.log(`Kész: dist/ — ${nPhotos} fotó, ${nSt} nyilatkozat${sharp ? ' (képek kicsinyítve)' : ''}`);
