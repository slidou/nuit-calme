import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const browser = process.env.NC_BROWSER || (process.platform === 'win32'
  ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  : 'chromium');
const profile = await mkdtemp(join(tmpdir(), 'nuit-calme-test-'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith('/liseuse/')) { res.writeHead(404).end(); return; }
  const file = resolve(root, path.slice('/liseuse/'.length) || 'index.html');
  if (!file.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const url = `http://127.0.0.1:${server.address().port}/liseuse/`;
const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
{ stdio: ['ignore', 'ignore', 'pipe'] });
let launchError;
let browserLog = '';
proc.on('error', (error) => { launchError = error; });
proc.stderr.on('data', (chunk) => { browserLog = (browserLog + chunk).slice(-4000); });

async function until(check) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error('Délai de vérification dépassé');
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
    AbortSignal.timeout(5000).addEventListener('abort', () => {
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.close();
        reject(new Error('Connexion DevTools impossible'));
      }
    }, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    if (message.error) call.reject(new Error(message.error.message));
    else call.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    const timer = setTimeout(() => {
      pending.delete(callId);
      reject(new Error(`Délai dépassé pour ${method}`));
    }, 25_000);
    pending.set(callId, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  const run = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (exceptionDetails) throw new Error(result.description || exceptionDetails.text);
    return result.value;
  };
  return { send, run, close: () => socket.close() };
}

let cdp;
try {
  const port = await until(async () => {
    if (launchError) throw launchError;
    return readFile(join(profile, 'DevToolsActivePort'), 'utf8').then((s) => s.split('\n')[0], () => null);
  });
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) });
  const [tab] = (await response.json())
    .filter(({ type }) => type === 'page');
  cdp = await connect(tab.webSocketDebuggerUrl);
  await cdp.send('Page.navigate', { url });
  await until(() => cdp.run("typeof NC_DEBUG !== 'undefined' && Boolean(navigator.serviceWorker.controller)"));
  console.log('OK — lancement de la liseuse sous /liseuse/ et activation du service worker.');

  const result = await cdp.run(`(${async function scenario() {
    function check(condition, message) { if (!condition) throw new Error(message); }
    const epub = new JSZip();
    epub.file('mimetype', 'application/epub+zip');
    epub.file('META-INF/container.xml', '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    epub.file('book.opf', '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">epub-essai</dc:identifier><dc:title>EPUB essai</dc:title><dc:language>fr</dc:language></metadata><manifest><item id="page" href="page.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="page"/></spine></package>');
    epub.file('page.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Essai</title></head><body><p>Le phare illumine la nuit.</p></body></html>');
    const epubBlob = await epub.generateAsync({ type: 'blob' });

    const content = 'BT /F1 16 Tf 40 80 Td (Le phare illumine la nuit.) Tj ET\n';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((object, index) => {
      const offset = pdf.length;
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
      return offset;
    });
    const xref = pdf.length;
    pdf += 'xref\n0 7\n0000000000 65535 f \n' +
      offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
      `trailer\n<< /Root 1 0 R /Size 7 >>\nstartxref\n${xref}\n%%EOF\n`;
    await NC.library.importFiles([
      new File([epubBlob], 'essai.epub', { type: 'application/epub+zip' }),
      new File([pdf], 'essai.pdf', { type: 'application/pdf' }),
    ]);
    check(document.querySelectorAll('.card').length === 2, 'Import et grille');
    const books = await NC.db.allBooks();
    const ebook = books.find((b) => b.type === 'epub');
    const paper = books.find((b) => b.type === 'pdf');
    await NC.db.putSetting('spread', 'none');
    await NC.reader.open(ebook.id);
    check(NC.reader._state().ctl.type === 'epub', 'Ouverture EPUB');
    check((await NC.reader._state().ctl.search('phare')).length > 0, 'Recherche EPUB');
    await NC.reader.close();
    await NC.reader.open(paper.id);
    check(NC.reader._state().ctl.type === 'pdf', 'Ouverture PDF');
    check((await NC.reader._state().ctl.search('phare')).length === 2, 'Recherche PDF');
    await NC.reader._state().ctl.gotoPage(2);
    await NC.reader.close();
    await NC.reader.open(paper.id);
    check(NC.reader._state().ctl.page === 2, 'Reprise PDF');
    await NC.reader.close();

    await NC.db.putAnnotation({ id: 'note', bookId: ebook.id, text: 'Phare' });
    await NC.db.putBookmark({ id: 'signet', bookId: paper.id, page: 2 });
    const goal = { target: 3, start: '2026-01-01', end: '2026-12-31' };
    localStorage.setItem('nc.reading-goal', JSON.stringify(goal));
    const { blob } = await NC.backup.exportAll({ silent: true });
    const damaged = await JSZip.loadAsync(blob);
    damaged.remove('books/' + ebook.id + '.epub');
    const incomplete = await damaged.generateAsync({ type: 'blob' });
    let refused = false;
    try { await NC.backup.importFile(incomplete, 'replace'); } catch { refused = true; }
    check(refused && await NC.db.countBooks() === 2, 'Archive incomplète rejetée sans perte');
    check(JSON.parse(localStorage.getItem('nc.reading-goal')).target === 3, 'Objectif conservé après échec');

    const badWrite = { ...await NC.db.backupSnapshot(), annotations: [{ text: 'clé absente' }] };
    refused = false;
    try { await NC.db.restoreBackup(badWrite, true); } catch { refused = true; }
    check(refused && await NC.db.countBooks() === 2 && (await NC.db.allAnnotations()).length === 1,
      'Annulation intégrale après une erreur de transaction');
    await NC.db.deleteBookCascade(ebook.id);
    await NC.db.putSetting('spread', 'always');
    const merge = await NC.backup.importFile(blob, 'merge');
    check(merge.recap.booksAdded === 1 && merge.recap.booksKept === 1, 'Fusion par identifiant');
    check(await NC.db.getSetting('spread') === 'always', 'Fusion et priorité au réglage local');
    await NC.backup.importFile(blob, 'replace');
    check(await NC.db.getSetting('spread') === 'none' && (await NC.db.allBookmarks()).length === 1,
      'Remplacement, réglages et signet');
    check((await NC.db.allAnnotations()).length === 1, 'Note restaurée');

    const sample = { id: ebook.id + '|2026-01-01', bookId: ebook.id, date: '2026-01-01',
      seconds: 5, pages: 1, firstAt: 20, lastAt: 20 };
    await Promise.all(Array.from({ length: 12 }, () => NC.db.addReadStat(sample)));
    const row = (await NC.db.allReadStats()).find((r) => r.id === sample.id);
    check(row.seconds === 60 && row.pages === 12, 'Cumul transactionnel');

    const pack = new JSZip();
    pack.file('a-invalide.epub', 'Fichier EPUB invalide');
    pack.file('b-valide.pdf', pdf);
    const packBlob = await pack.generateAsync({ type: 'blob' });
    const realFetch = window.fetch;
    window.fetch = (url, ...options) => {
      if (url === 'packs/index.json') return Promise.resolve(new Response(JSON.stringify({
        packs: [{ id: 'essai', titre: 'Pack essai', type: 'zip', source: 'packs/essai.zip' }],
      })));
      if (url === 'packs/essai.zip') return Promise.resolve(new Response(packBlob));
      return realFetch(url, ...options);
    };
    async function waitFor(check, message) {
      for (let i = 0; i < 100; i++) {
        if (await check()) return;
        await new Promise((done) => setTimeout(done, 40));
      }
      throw new Error(message);
    }
    NC.packs.openView();
    await waitFor(() => document.querySelector('.pack-card'), 'Liste des packs');
    document.querySelector('.pack-card').click();
    const importPack = document.querySelector('#pack-import-all');
    await waitFor(() => !importPack.disabled, 'Livre valide disponible après un EPUB invalide');
    importPack.click();
    check(importPack.disabled, 'Réservation du lot avant les écritures');
    importPack.click();
    await waitFor(() => document.querySelector('.pk-added'), 'Import du livre valide');
    check(await NC.db.countBooks() === 3, 'Import du pack sans doublon');
    NC.packs.closeView();
    window.fetch = realFetch;
    for (const b of await NC.db.allBooks()) {
      if (b.id !== paper.id && b.id !== ebook.id) await NC.db.deleteBookCascade(b.id);
    }
    await NC.library.refresh();

    const firstCard = document.querySelector('.card');
    firstCard.focus();
    check(getComputedStyle(firstCard.querySelector('.card-edit')).display === 'flex', 'Actions de carte au clavier');
    check(window.__ncErrors.length === 0, JSON.stringify(window.__ncErrors));
    return paper.id;
  }})()`);
  console.log('OK — EPUB et PDF, recherche, reprise PDF, sauvegarde, fusion, remplacement, retour arrière, statistiques.');
  console.log('OK — pack ZIP avec entrée invalide, import sans doublon et actions accessibles au focus.');

  const contents = await cdp.run(`(async () => {
    await caches.open('cache-autre-application');
    await fetch('packs/index.json');
    const keys = await caches.keys();
    const own = keys.find((key) => key.startsWith('nuit-calme:'));
    return (await (await caches.open(own)).keys()).map((request) => request.url);
  })()`);
  assert.ok(contents.length > 30);
  assert.ok(contents.every((asset) => asset.startsWith(url) && !asset.includes('/packs/')));
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
  });
  await cdp.send('Page.navigate', { url: url + '?hors-ligne' });
  await until(() => cdp.run("location.search === '?hors-ligne' && typeof NC_DEBUG !== 'undefined' && document.querySelectorAll('.card').length === 2"));
  assert.equal(await cdp.run(`(async () => {
    await NC.reader.open(${JSON.stringify(result)});
    const page = NC.reader._state().ctl.page;
    await NC.reader.close();
    return page;
  })()`), 2);
  console.log('OK — cache limité à la liseuse et reprise PDF après navigation hors ligne.');
} catch (error) {
  if (browserLog) console.error(browserLog);
  throw error;
} finally {
  cdp?.close();
  if (proc.exitCode === null && !launchError) {
    proc.kill();
    await Promise.race([new Promise((done) => proc.once('exit', done)), delay(2000)]);
  }
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 }).catch((error) =>
    console.warn('Profil temporaire à nettoyer par le système', error.message));
}
