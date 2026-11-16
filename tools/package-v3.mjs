// Construit uniquement le site à publier, à partir des ressources utilisées.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const JSZip = createRequire(import.meta.url)('../vendor/jszip.min.js');
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root));
const output = process.argv[2];
if (!output?.toLowerCase().endsWith('.zip')) throw new Error('Usage : node tools/package-v3.mjs chemin/nuit-calme-v3.zip');

const worker = (await read('sw.js')).toString();
const entries = worker.match(/const PRECACHE = \[([\s\S]*?)^\];/m)?.[1];
if (!entries) throw new Error('Liste de précache introuvable');
const paths = [...entries.matchAll(/^\s*'([\w./-]+)'[,]?\s*$/gm)].map((match) => match[1]).filter((path) => path !== './');
if (!paths.includes('index.html') || !paths.includes('manifest.webmanifest')) throw new Error('Entrée PWA incomplète');
for (const path of paths) {
  if (path.split('/').includes('..') || !/^(?:index\.html$|manifest\.webmanifest$|(?:css|js|icons|vendor)\/)/.test(path)) {
    throw new Error(`Ressource hors du périmètre de publication : ${path}`);
  }
}

const html = (await read('index.html')).toString();
for (const [, path] of html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css|png|webmanifest))"/g)) {
  if (!paths.includes(path)) throw new Error(`Ressource HTML absente du précache : ${path}`);
}
const manifest = JSON.parse((await read('manifest.webmanifest')).toString());
for (const icon of manifest.icons) {
  if (!paths.includes(icon.src)) throw new Error(`Icône absente du précache : ${icon.src}`);
  const png = await read(icon.src);
  const sizes = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || sizes !== icon.sizes) throw new Error(`Icône invalide : ${icon.src}`);
}

const licenses = ['Cormorant-Garamond-OFL.txt', 'Inter-OFL.txt', 'epub.js-LICENSE.txt', 'html2canvas-LICENSE.txt', 'JSZip-LICENSE.txt', 'PDF.js-LICENSE.txt'];
const files = new Set([...paths, 'sw.js', 'GUIDE-NUIT-CALME.md', 'LICENSE', '.nojekyll', ...licenses.map((name) => 'vendor/licenses/' + name)]);
const zip = new JSZip();
for (const path of files) zip.file(path, await read(path));
zip.file('packs/index.json', JSON.stringify({ packs: [] }, null, 2) + '\n');
const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
await writeFile(output, archive, { flag: 'wx' });
console.log(`${files.size + 1} fichiers, ${archive.length} octets`);
