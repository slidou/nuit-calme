import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
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
const baseline = process.env.NC_BENCHMARK && process.env.NC_BASE_REF;
const baselineFiles = new Map();
let release = 1;
let missingAsset = false;
let missingRequests = 0;

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith('/liseuse/')) { res.writeHead(404).end(); return; }
  const file = resolve(root, path.slice('/liseuse/'.length) || 'index.html');
  if (!file.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
  if (missingAsset && path.endsWith('/css/style.css')) { missingRequests++; res.writeHead(503).end(); return; }
  try {
    let body;
    if (baseline) {
      const relative = file.slice(resolve(root).length + 1).split(sep).join('/');
      if (!baselineFiles.has(relative)) baselineFiles.set(relative, execFileSync(
        'git', ['show', `${baseline}:${relative}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 << 20 }));
      body = baselineFiles.get(relative);
    } else {
      body = await readFile(file);
      if (file === join(root, 'index.html')) {
        body = body.toString().replace('</head>', `<meta name="test-release" content="${release}"></head>`);
      } else if (file === join(root, 'sw.js') && release > 1) {
        body = body.toString().replace(/(const CACHE = .+?)';/, `$1-test-${release}';`);
      }
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const url = `http://127.0.0.1:${server.address().port}/liseuse/`;
const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--disable-features=BackForwardCache',
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

async function benchmark(cdp) {
  await cdp.send('Page.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const observer = new MutationObserver(() => {
      if (document.querySelector('#book-grid .card')) {
        window.firstCardMs = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  ` });
  console.log(JSON.stringify({ source: baseline || 'workspace', bytesPerBook: 131072, iterations: 3 }));
  for (const count of [100, 300, 1000]) {
    await cdp.run(`(async () => {
      const state = await NC.db.backupSnapshot();
      const data = new ArrayBuffer(131072);
      const cover = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="220"%3E%3Crect width="160" height="220" fill="navy"/%3E%3C/svg%3E';
      state.books = Array.from({length: ${count}}, (_, i) => ({
        id: 'perf-' + i, title: 'Volume ' + i, author: 'Autrice ' + (i % 24),
        type: 'epub', cover, addedAt: i + 1, data, size: data.byteLength
      }));
      state.groups = Array.from({length: 24}, (_, i) => ({ id: 'g' + i, name: 'Rayon ' + i, order: i }));
      state.bookmeta = state.books.map((book, i) => ({ id: book.id, groupId: 'g' + (i % 24), status: 'encours' }));
      await NC.db.restoreBackup(state, true);
    })()`);
    const samples = [];
    for (let i = 0; i < 3; i++) {
      await cdp.send('Page.navigate', { url: url + '?perf=' + count + '-' + i });
      await until(() => cdp.run(`location.search === '?perf=${count}-${i}' && typeof NC_DEBUG !== 'undefined'`));
      const sample = await cdp.run(`(async () => {
        const grid = document.querySelector('#book-grid');
        const frame = () => new Promise(requestAnimationFrame);
        await frame();
        const boot = window.firstCardMs;
        while (grid.childElementCount < ${count}) await frame();
        const input = document.querySelector('#lib-search');
        input.value = 'Volume';
        const start = performance.now();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        while (!document.querySelector('#lib-count').textContent.includes(' sur ')) await frame();
        const first = performance.now() - start;
        while (grid.childElementCount < ${count}) await frame();
        return { boot, first, full: performance.now() - start };
      })()`);
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      samples.push({ ...sample, heap: heap.usedSize, backingStorage: heap.backingStorageSize });
    }
    console.log(JSON.stringify({ count, samples }));
  }
}

async function openTab(cdp, port, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const target = await until(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    return (await response.json()).find((tab) => tab.id === targetId);
  });
  return { targetId, tab: await connect(target.webSocketDebuggerUrl) };
}

let cdp;
let other;
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

  if (process.env.NC_BENCHMARK) {
    await benchmark(cdp);
  } else {

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
    check((await NC.reader._state().ctl.search('phare', null, AbortSignal.abort())).length === 0,
      'Recherche EPUB annulée');
    await NC.reader.close();
    await NC.reader.open(paper.id);
    check(NC.reader._state().ctl.type === 'pdf', 'Ouverture PDF');
    check((await NC.reader._state().ctl.search('phare')).length === 2, 'Recherche PDF');
    check((await NC.reader._state().ctl.search('phare', null, AbortSignal.abort())).length === 0,
      'Recherche PDF annulée');
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
    const corrupt = new Uint8Array(await blob.arrayBuffer());
    const directory = new DataView(corrupt.buffer);
    for (let i = 0; i < corrupt.length - 46; i++) {
      if (directory.getUint32(i, true) !== 0x02014b50) continue;
      const name = new TextDecoder().decode(corrupt.subarray(i + 46, i + 46 + directory.getUint16(i + 28, true)));
      if (name === 'books/' + ebook.id + '.epub') {
        corrupt[i + 16] ^= 1;
        break;
      }
    }
    refused = false;
    try { await NC.backup.importFile(new Blob([corrupt]), 'replace'); }
    catch (error) { refused = error.message.includes('Intégrité ZIP'); }
    check(refused && await NC.db.countBooks() === 2, 'CRC erroné rejeté sans perte');

    const traversal = new JSZip();
    traversal.file('../manifest.json', '{}');
    refused = false;
    try { await NC.archive.load(await traversal.generateAsync({ type: 'blob' }), 'backup'); }
    catch (error) { refused = error.message.includes('Chemin invalide'); }
    check(refused, 'Chemin réécrit par JSZip rejeté');

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

  const second = await openTab(cdp, port, url + '?deuxieme');
  other = second.tab;
  await until(() => other.run("typeof NC_DEBUG !== 'undefined' && document.querySelectorAll('.card').length === 2"));
  const bookKey = JSON.stringify(result);
  await cdp.run("NC.db.putGroup({ id: 'rayon-essai', name: 'Rayon essai', order: 1 })");
  await Promise.all([
    cdp.run(`NC.db.changeBookMeta(${bookKey}, {groupId: 'rayon-essai'})`),
    other.run(`NC.db.changeBookMeta(${bookKey}, {status: 'termine'})`),
  ]);
  const metadata = await cdp.run(`NC.db.getBookMeta(${bookKey})`);
  assert.equal(metadata.groupId, 'rayon-essai');
  assert.equal(metadata.status, 'termine');
  await cdp.run(`NC.db.patchBook(${bookKey}, {title: 'Titre partagé'})`);
  await until(() => other.run("Array.from(document.querySelectorAll('.card-title')).some(x => x.textContent === 'Titre partagé')"));
  await cdp.run(`NC.db.putAnnotation({id: 'concurrent-note', bookId: ${bookKey}, note: 'initiale'})`);
  await Promise.all([
    cdp.run(`NC.db.patchAnnotation('concurrent-note', {color: 'or'}, ${bookKey})`),
    other.run(`NC.db.patchAnnotation('concurrent-note', {note: 'mise à jour'}, ${bookKey})`),
  ]);
  const note = await other.run(`NC.db.annotationsFor(${bookKey}).then(rows => rows.find(x => x.id === 'concurrent-note'))`);
  assert.equal(note.color, 'or');
  assert.equal(note.note, 'mise à jour');
  await other.run(`NC.db.putProgress({id: ${bookKey}, lastPage: 1, lastOpened: 1})`);
  assert.equal(await cdp.run(`NC.db.getProgress(${bookKey}).then(row => row.lastPage)`), 2);
  const ids = await Promise.all([cdp, other].map((page, i) => page.run(
    `NC.db.putBookmark({id: 'concurrent-${i}', bookId: ${bookKey}, page: 1}).then(row => row.id)`)));
  assert.equal(ids[0], ids[1]);
  const epubId = JSON.stringify(await cdp.run("NC.db.allBooks().then(rows => rows.find(b => b.type === 'epub').id)"));
  const originalEpub = await other.run(`(async () => {
    window.originalEpub = await NC.db.getBook(${epubId});
    return originalEpub.id;
  })()`);
  assert.equal(JSON.stringify(originalEpub), epubId);
  await cdp.run(`NC.db.deleteBookCascade(${epubId})`);
  assert.equal(await other.run(`NC.db.patchBook(${epubId}, {title:'fantôme'})`), undefined);
  assert.equal(await other.run(`NC.db.putProgress({id:${epubId},lastOpened:Date.now()})`), undefined);
  await other.run("NC.db.putBook(originalEpub)");
  console.log('OK — deux onglets, modifications par champ, notification, progression, signets dédupliqués et suppression.');

  const quota = await cdp.run(`(async () => {
    const state = await NC.db.backupSnapshot();
    const originalPut = IDBObjectStore.prototype.put;
    let writes = 0;
    IDBObjectStore.prototype.put = function (value) {
      if (this.name === 'books' && ++writes === 2) {
        throw new DOMException('Quota de test', 'QuotaExceededError');
      }
      return originalPut.call(this, value);
    };
    try { await NC.db.restoreBackup(state, true); }
    catch (error) { return error.name; }
    finally { IDBObjectStore.prototype.put = originalPut; }
    return 'success';
  })()`);
  assert.equal(quota, 'QuotaExceededError');
  assert.equal(await cdp.run('NC.db.countBooks()'), 2);
  assert.equal(await cdp.run(`NC.db.getBook(${bookKey}).then(b => b.title)`), 'Titre partagé');
  console.log('OK — QuotaExceededError injectée sur le deuxième livre, restauration annulée sans perte.');

  await cdp.send('Page.bringToFront');
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

  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  release = 2;
  missingAsset = true;
  await other.run("navigator.serviceWorker.ready.then(reg => reg.update()).then(() => true)");
  await until(() => missingRequests > 0);
  await until(() => other.run("navigator.serviceWorker.ready.then(reg => !reg.installing && !reg.waiting)"));
  await cdp.send('Page.navigate', { url: url + '?cache-ancienne' });
  await until(() => cdp.run("location.search === '?cache-ancienne' && typeof NC_DEBUG !== 'undefined'"));
  assert.equal(await cdp.run("document.querySelector('meta[name=test-release]').content"), '1');
  missingAsset = false;
  release = 3;
  await other.run("navigator.serviceWorker.ready.then(reg => reg.update()).then(() => true)");
  await until(() => other.run("navigator.serviceWorker.ready.then(reg => Boolean(reg.waiting))"));
  assert.equal(await cdp.run("document.querySelector('meta[name=test-release]').content"), '1');
  await cdp.send('Target.closeTarget', { targetId: second.targetId });
  other.close();
  other = null;
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await delay(800);
  await cdp.send('Page.navigate', { url: url + '?cache-nouveau' });
  await until(() => cdp.run("location.search === '?cache-nouveau' && typeof NC_DEBUG !== 'undefined'"));
  assert.equal(await cdp.run("document.querySelector('meta[name=test-release]').content"), '3');
  assert.equal(await cdp.run('NC.db.countBooks()'), 2);
  console.log('OK — installation incomplète, attente avec deux onglets puis activation et données intactes.');
  }
} catch (error) {
  if (browserLog) console.error(browserLog);
  throw error;
} finally {
  other?.close();
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
