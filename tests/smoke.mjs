import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { testNotebook } from './notebook.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const browser = process.env.NC_BROWSER || (process.platform === 'win32'
  ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  : 'chromium');
const profile = await mkdtemp(join(tmpdir(), 'nuit-calme-test-'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png' };
const baseline = process.env.NC_BENCHMARK && process.env.NC_BASE_REF;
const migration = process.env.NC_MIGRATION === '1';
const enableV8 = process.env.NC_TEST_V8 === '1';
const v7Ref = '6295c66c57e474546c5c8986ac937bca921f3807';
const baselineFiles = new Map();
let release = 1;
let fixtureUpgrade = false;
let missingAsset = false;
let missingRequests = 0;

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (migration && path === '/test-fixture') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<title>IndexedDB de test</title>');
    return;
  }
  if (!path.startsWith('/liseuse/')) { res.writeHead(404).end(); return; }
  const file = resolve(root, path.slice('/liseuse/'.length) || 'index.html');
  if (!file.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
  if (missingAsset && path.endsWith('/css/style.css')) { missingRequests++; res.writeHead(503).end(); return; }
  try {
    let body;
    const legacyOrigin = migration && req.headers.host?.startsWith('localhost:');
    const ref = baseline || (migration && (release === 1 || legacyOrigin) && v7Ref);
    if (ref) {
      const relative = file.slice(resolve(root).length + 1).split(sep).join('/');
      if (!baselineFiles.has(relative)) baselineFiles.set(relative, execFileSync(
        'git', ['show', `${ref}:${relative}`], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 << 20 }));
      body = baselineFiles.get(relative);
    } else {
      body = await readFile(file);
      if (file === join(root, 'index.html')) {
        body = body.toString().replace('</head>', `<meta name="test-release" content="${release}"></head>`);
      } else if (file === join(root, 'sw.js') && release > 1) {
        body = body.toString().replace(/(const CACHE = .+?)';/, `$1-test-${release}';`);
      } else if (file === join(root, 'js', 'idb.js') && (enableV8 || fixtureUpgrade)) {
        const disabled = 'const ENABLE_V8_UPGRADE = false;';
        assert.ok(body.toString().includes(disabled));
        body = body.toString().replace(disabled, 'const ENABLE_V8_UPGRADE = true;');
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
  const browserVersion = await cdp.send('Browser.getVersion');
  console.log(JSON.stringify({ source: baseline || (enableV8 ? 'workspace-v8' : 'workspace-v7'),
    browser: browserVersion.product, bytesPerBook: 131072, iterations: 3 }));
  for (const count of [100, 300, 1000, 3000]) {
    await cdp.run(`(async () => {
      const state = { annotations: [], bookmarks: [], history: [], readstats: [], progress: [],
        prefs: [], settings: [] };
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
        while (grid.childElementCount < ${count}) await frame();
        const input = document.querySelector('#lib-search');
        input.value = 'Volume';
        const start = performance.now();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        while (!document.querySelector('#lib-count').textContent.includes(' sur ')) await frame();
        const first = performance.now() - start;
        while (grid.childElementCount < ${count}) await frame();
        return { boot: window.firstCardMs, first, full: performance.now() - start };
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

async function makeBooks() {
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
  return { epubBlob, pdf };
}

async function rawCatalog() {
  const request = (operation) => new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
  const db = await request(indexedDB.open('nuit-calme-db'));
  try {
    if (db.version === 7) return { version: db.version };
    const transaction = db.transaction(['books', 'bookcards', 'catalogstate']);
    const [bookKeys, cards, checkpoint] = await Promise.all([
      request(transaction.objectStore('books').getAllKeys()),
      request(transaction.objectStore('bookcards').getAll()),
      request(transaction.objectStore('catalogstate').get('build')),
    ]);
    return { version: db.version, bookKeys, cards, checkpoint };
  } finally { db.close(); }
}

async function fingerprint() {
  const snapshot = await NC.db.backupSnapshot();
  snapshot.books = await Promise.all(snapshot.books.map(async ({ data, ...metadata }) => {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    return { metadata, sha256: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('') };
  }));
  return snapshot;
}

async function exportBase64() {
  const { blob, manifest } = await NC.backup.exportAll({ silent: true });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const parts = [];
  for (let i = 0; i < bytes.length; i += 16384) parts.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
  return { archive: btoa(parts.join('')), manifest };
}

function zipExpression(archive) {
  return `new Blob([Uint8Array.from(atob(${JSON.stringify(archive)}), c => c.charCodeAt(0))])`;
}

async function testMigration(cdp, port) {
  const fingerprintExpression = `(${fingerprint})()`;
  const catalogExpression = `(${rawCatalog})()`;
  assert.deepEqual(await cdp.run(catalogExpression), { version: 7 });
  const ids = await cdp.run(`(${async function seed(fixture) {
    const { epubBlob, pdf } = await fixture();
    await NC.library.importFiles([
      new File([epubBlob], 'egalite.epub', { type: 'application/epub+zip' }),
      new File([pdf], 'egalite.pdf', { type: 'application/pdf' }),
    ]);
    const initial = await NC.db.allBooks();
    const epub = initial.find((book) => book.type === 'epub');
    const paper = initial.find((book) => book.type === 'pdf');
    await NC.db.putSetting('spread', 'none');
    await NC.reader.open(epub.id);
    const ctl = NC.reader._state().ctl;
    for (let i = 0; !ctl.location?.start?.cfi && i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await NC.reader.close();
    const cfi = (await NC.db.getProgress(epub.id)).lastCfi;
    await NC.db.putAnnotation({ id: 'note-v7', bookId: epub.id, kind: 'note', text: 'Le phare',
      sectionIndex: 0, start: 0, end: 8, cfi, note: 'Note historique', createdAt: 20 });
    await NC.db.putBookmark({ id: 'signet-v7', bookId: paper.id, page: 2, createdAt: 20 });
    await NC.db.putHistory({ id: 'passage-v7', bookId: paper.id, page: 2, at: 20 });
    await NC.db.putProgress({ id: paper.id, lastOpened: Date.now(), lastPage: 2, fit: 'page', zoom: 1 });
    await NC.db.patchPrefs(epub.id, { theme: 'sepia', fontSize: 125 });
    await NC.db.addReadStat({ id: 'stat-v7', bookId: paper.id, date: '2026-01-01', pages: 3,
      seconds: 15, firstAt: 20, lastAt: 30 });
    await NC.db.putGroup({ id: 'rayon-v7', name: 'Rayon témoin' });
    await NC.db.changeBookMeta(paper.id, { status: 'termine', groupId: 'rayon-v7' });
    localStorage.setItem('nc.reading-goal', JSON.stringify({ target: 5, start: '2026-01-01', end: '2026-12-31' }));
    const snapshot = await NC.db.backupSnapshot();
    snapshot.books.push(...Array.from({ length: 44 }, (_, i) => ({
      ...epub, id: 'temoin-' + String(i).padStart(3, '0'), title: 'Témoin ' + i,
      legacyField: 'champ v7 à préserver',
    })));
    await NC.db.restoreBackup(snapshot, true);
    return { epub: epub.id, pdf: paper.id, cfi };
  }})(${makeBooks})`);
  assert.ok(ids.cfi.startsWith('epubcfi('));
  // L'écriture des statistiques de la session EPUB doit être terminée avant la référence.
  const before = await cdp.run(fingerprintExpression);
  const zipV7 = await cdp.run(`(${exportBase64})()`);
  assert.equal(zipV7.manifest.format, 1);

  const fixtureUrl = new URL('/test-fixture', url).href;
  const lock = await openTab(cdp, port, fixtureUrl);
  try {
    assert.equal(await lock.tab.run(`new Promise((resolve, reject) => {
      const request = indexedDB.open('nuit-calme-db', 7);
      request.onsuccess = () => { window.heldDatabase = request.result; resolve(heldDatabase.version); };
      request.onerror = reject;
    })`), 7);
    release = 2;
    fixtureUpgrade = true;
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setBypassServiceWorker', { bypass: true });
    await cdp.send('Page.navigate', { url: url + '?blocked' });
    await until(() => cdp.run("location.search === '?blocked' && window.__ncErrors?.some(value => /bloqué/.test(value))"));
    await lock.tab.run('heldDatabase.close()');
    assert.deepEqual(await lock.tab.run(catalogExpression), { version: 7 });
    console.log('OK — connexion v7 ouverte, montée bloquée puis annulée.');
  } finally {
    await cdp.send('Target.closeTarget', { targetId: lock.targetId });
    lock.tab.close();
  }

  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (location.search === '?quota-migration') {
      const put = IDBObjectStore.prototype.put;
      let writes = 0;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'bookcards' && ++writes === 17) {
          window.quotaInjected = true;
          throw new DOMException('Échec au deuxième lot', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
    }
    if (location.search === '?migration-verified') {
      const getAll = IDBObjectStore.prototype.getAll;
      IDBObjectStore.prototype.getAll = function (...args) {
        if (this.name === 'books') throw new Error('Relecture interdite des binaires au démarrage');
        return getAll.apply(this, args);
      };
    }
  ` });
  await cdp.send('Page.bringToFront');
  await cdp.send('Page.navigate', { url: url + '?quota-migration' });
  await until(() => cdp.run('window.quotaInjected === true && document.querySelectorAll(".card").length === 46'));
  const partial = await cdp.run(catalogExpression);
  assert.equal(partial.version, 8);
  assert.equal(partial.bookKeys.length, 46);
  assert.equal(partial.cards.length, 16);
  assert.equal(partial.checkpoint.after, partial.cards.at(-1).id);
  assert.deepEqual(await cdp.run(fingerprintExpression), before);
  console.log('OK — v7 → v8, deuxième lot annulé au quota, 16 fiches validées et données historiques identiques.');

  // Écritures effectuées avant et après la clé de reprise.
  await cdp.run(`(async () => {
    const source = await NC.db.getBook('temoin-000');
    await NC.db.deleteBookCascade(source.id);
    await NC.db.putBook({ ...source, id: '0-ajout-pendant-la-migration', title: 'Inséré avant le point de reprise' });
    await NC.db.patchBook('temoin-001', { title: 'Modifié avant le point de reprise' });
    await NC.db.patchBook('temoin-043', { title: 'Modifié après le point de reprise' });
  })()`);
  const interrupted = await cdp.run(fingerprintExpression);

  const second = await openTab(cdp, port, 'about:blank');
  try {
    await second.tab.send('Network.enable');
    await second.tab.send('Network.setBypassServiceWorker', { bypass: true });
    await Promise.all([
      second.tab.send('Page.navigate', { url: url + '?resume-second' }),
      cdp.send('Page.navigate', { url: url + '?resume-first' }),
    ]);
    await until(() => cdp.run("location.search === '?resume-first' && typeof NC_DEBUG !== 'undefined'"));
    const completed = await until(async () => {
      const state = await cdp.run(catalogExpression);
      return state.checkpoint?.done && state;
    });
    assert.deepEqual(completed.cards.map((card) => card.id), completed.bookKeys);
    assert.ok(completed.cards.every((card) => !Object.hasOwn(card, 'data')));
    assert.deepEqual(await cdp.run(fingerprintExpression), interrupted);
    assert.ok(completed.cards.some((card) => card.title === 'Inséré avant le point de reprise'));
    assert.ok(completed.cards.some((card) => card.title === 'Modifié avant le point de reprise'));
    assert.ok(completed.cards.some((card) => card.title === 'Modifié après le point de reprise'));
    assert.ok(!completed.cards.some((card) => card.id === 'temoin-000'));
    console.log('OK — reprise à deux onglets après navigation et bijection des 46 fiches et fichiers.');

    const paper = JSON.stringify(ids.pdf);
    const epub = JSON.stringify(ids.epub);
    await Promise.all([
      cdp.run(`NC.db.patchBook(${paper}, { title: 'PDF v8' })`),
      second.tab.run(`NC.db.patchBook(${paper}, { author: 'Deuxième onglet' })`),
    ]);
    const changed = (await cdp.run(catalogExpression)).cards.find((card) => card.id === ids.pdf);
    assert.equal(changed.title, 'PDF v8');
    assert.equal(changed.author, 'Deuxième onglet');
    const rejected = await cdp.run(`(async () => {
      const nativePut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'bookcards') throw new DOMException('Catalogue plein', 'QuotaExceededError');
        return nativePut.apply(this, args);
      };
      try { await NC.db.patchBook(${paper}, {title:'perdu'}); }
      catch (error) { return error.name; }
      finally { IDBObjectStore.prototype.put = nativePut; }
    })()`);
    assert.equal(rejected, 'QuotaExceededError');
    assert.equal(await cdp.run(`NC.db.getBook(${paper}).then(book => book.title)`), 'PDF v8');
    assert.equal((await cdp.run(catalogExpression)).cards.find((card) => card.id === ids.pdf).title, 'PDF v8');

    await cdp.run(`NC.backup.importFile(${zipExpression(zipV7.archive)}, 'merge')`);
    assert.ok((await cdp.run(catalogExpression)).cards.some((card) => card.id === 'temoin-000'));
    const beforeReject = await cdp.run(catalogExpression);
    const failedReplace = await cdp.run(`(async () => {
      const nativePut = IDBObjectStore.prototype.put;
      let cardWrites = 0;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'bookcards' && ++cardWrites === 2) throw new DOMException('Catalogue plein', 'QuotaExceededError');
        return nativePut.apply(this, args);
      };
      try { await NC.backup.importFile(${zipExpression(zipV7.archive)}, 'replace'); }
      catch (error) { return error.name; }
      finally { IDBObjectStore.prototype.put = nativePut; }
    })()`);
    assert.equal(failedReplace, 'QuotaExceededError');
    assert.deepEqual(await cdp.run(catalogExpression), beforeReject);
    await cdp.run(`NC.backup.importFile(${zipExpression(zipV7.archive)}, 'replace')`);
    assert.deepEqual(await cdp.run(fingerprintExpression), before);
    const restored = await cdp.run(catalogExpression);
    assert.deepEqual(restored.cards.map((card) => card.id), restored.bookKeys);
    assert.equal(await cdp.run("JSON.parse(localStorage.getItem('nc.reading-goal')).target"), 5);
    console.log('OK — édition atomique, annulation au quota, suppression, fusion et remplacement ZIP v1.');

    // La version précédente est incapable d'ouvrir une base déjà montée vers v8.
    assert.equal(await cdp.run(`new Promise((resolve) => {
      const request = indexedDB.open('nuit-calme-db', 7);
      request.onerror = () => resolve(request.error.name);
      request.onsuccess = () => { request.result.close(); resolve('success'); };
    })`), 'VersionError');

    const zipV8 = await cdp.run(`(${exportBase64})()`);
    assert.equal(zipV8.manifest.format, 1);
    fixtureUpgrade = false;
    await cdp.send('Page.bringToFront');
    await cdp.send('Page.navigate', { url: url + '?migration-verified' });
    await until(() => cdp.run("location.search === '?migration-verified' && document.querySelectorAll('.card').length === 46"));
    assert.equal((await cdp.run(catalogExpression)).version, 8);
    assert.equal(await cdp.run(`NC.db.getProgress(${epub}).then(row => row.lastCfi)`), ids.cfi);
    const reading = await cdp.run(`(async () => {
      await NC.reader.open(${epub});
      const reader = NC.reader._state().ctl;
      const result = { theme: reader.theme, size: reader.fontSize,
        results: (await reader.search('phare')).length, notes: (await NC.db.annotationsFor(${epub})).map(note => note.note) };
      await NC.reader.close();
      await NC.reader.open(${paper});
      result.pdfPage = NC.reader._state().ctl.page;
      result.bookmarks = (await NC.db.bookmarksFor(${paper})).map(bookmark => bookmark.page);
      await NC.reader.close();
      return result;
    })()`);
    assert.equal(reading.theme, 'sepia');
    assert.equal(reading.size, 125);
    assert.ok(reading.results > 0);
    assert.deepEqual(reading.notes, ['Note historique']);
    assert.equal(reading.pdfPage, 2);
    assert.deepEqual(reading.bookmarks, [2]);
    console.log('OK — catalogue complet avec lectures de binaires bloquées au démarrage, repli v8, reprise EPUB/PDF.');

    const legacyUrl = url.replace('127.0.0.1', 'localhost');
    await second.tab.send('Page.navigate', { url: legacyUrl });
    await until(() => second.tab.run("location.hostname === 'localhost' && typeof NC_DEBUG !== 'undefined'"));
    assert.deepEqual(await second.tab.run(catalogExpression), { version: 7 });
    await second.tab.run(`NC.backup.importFile(${zipExpression(zipV8.archive)}, 'replace')`);
    assert.deepEqual(await second.tab.run(fingerprintExpression), before);
    console.log('OK — un export du code v8 est restauré par le code v7 sur une autre origine de test.');
  } finally {
    await cdp.send('Target.closeTarget', { targetId: second.targetId });
    second.tab.close();
  }
}

async function testUx(cdp) {
  const active = () => cdp.run("document.activeElement.id || document.activeElement.className");
  const focus = (selector) => cdp.run(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  const click = async (selector) => {
    await focus(selector);
    return cdp.run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const key = async (key, keyCode, modifiers = 0) => {
    const event = { key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key,
      windowsVirtualKeyCode: keyCode, modifiers };
    await cdp.send('Input.dispatchKeyEvent', { ...event, type: 'keyDown',
      ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
    await cdp.send('Input.dispatchKeyEvent', { ...event, type: 'keyUp' });
  };
  const setViewport = (width, height, mobile = false) => cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, mobile, deviceScaleFactor: 1,
    screenOrientation: { type: width > height ? 'landscapePrimary' : 'portraitPrimary',
      angle: width > height ? 90 : 0 },
  });
  const save = async (name) => {
    if (!process.env.NC_UX_OUT) return;
    const folder = resolve(process.env.NC_UX_OUT);
    await mkdir(folder, { recursive: true });
    await delay(300);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(folder, name + '.png'), Buffer.from(data, 'base64'));
  };
  await cdp.send('Page.enable');
  await cdp.send('Page.bringToFront');
  await setViewport(1440, 900);
  await save('01-bibliotheque-vide');
  const ids = await cdp.run(`(${async function seed(fixture) {
    const { epubBlob, pdf } = await fixture();
    const files = new DataTransfer();
    files.items.add(new File([epubBlob], 'Lecture.epub', { type: 'application/epub+zip' }));
    files.items.add(new File([pdf], 'Lecture.pdf', { type: 'application/pdf' }));
    const input = document.querySelector('#file-input');
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    for (let attempt = 0; attempt < 100 && document.querySelectorAll('.card-open').length < 2; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    const books = await NC.db.allBooks();
    const epub = books.find((book) => book.type === 'epub');
    const paper = books.find((book) => book.type === 'pdf');
    await NC.db.putSetting('spread', 'none');
    await NC.db.putAnnotation({ id: 'note-ux', bookId: epub.id, kind: 'note',
      text: 'Le phare', note: 'Note de test', sectionIndex: 0, start: 0, end: 8, createdAt: Date.now() });
    return { epub: epub.id, paper: paper.id };
  }})(${makeBooks})`);

  await focus('#btn-backup');
  await key('Enter', 13);
  assert.equal(await active(), 'backup-pop-title');
  assert.equal(await cdp.run("document.querySelector('#view-library').inert"), true);
  await key('Tab', 9, 8);
  assert.equal(await active(), 'backup-close');
  await key('Tab', 9);
  assert.equal(await active(), 'backup-export');
  await click('#backup-import');
  await cdp.run(`(async () => {
    const archive = await NC.backup.exportAll({ silent: true });
    const data = new DataTransfer();
    data.items.add(new File([archive.blob], 'sauvegarde.zip'));
    const input = document.querySelector('#backup-file-input');
    input.dataset.mode = 'replace';
    input.files = data.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await until(() => cdp.run("!document.querySelector('#backup-replace-cancel').hidden"));
  assert.equal(await active(), 'backup-replace-cancel');
  await key('Enter', 13);
  assert.equal(await active(), 'backup-replace');
  assert.equal(await cdp.run('NC.db.countBooks()'), 2);
  await key('Escape', 27);
  assert.equal(await active(), 'btn-backup');
  assert.equal(await cdp.run("document.querySelector('#view-library').inert"), false);
  await click('#goal-banner [role="button"]');
  assert.equal(await active(), 'goal-num');
  assert.equal(await cdp.run("document.querySelector('#goal-num').labels[0].textContent"), 'Nombre de livres à finir');
  await key('Escape', 27);
  await click('#filter-groups .ghost');
  assert.equal(await active(), 'group-pop-name');
  await cdp.run("document.querySelector('#group-pop-name').value = 'Essai clavier'");
  await key('Enter', 13);
  await until(() => cdp.run("!document.querySelector('#filter-groups .manage')?.closest('[inert]') && !!document.querySelector('#filter-groups .manage')"));
  await click('#filter-groups .manage');
  await click('#groups-manage-new');
  assert.equal(await active(), 'group-pop-name');
  await key('Escape', 27);
  assert.equal(await active(), 'groups-manage-new');
  await key('Escape', 27);
  assert.equal(await active(), 'chip ghost manage');
  await focus(`[data-book-id="${ids.epub}"] .card-open`);
  await click(`[data-book-id="${ids.epub}"] .card-edit`);
  assert.equal(await active(), 'edit-title');
  await key('Escape', 27);
  assert.equal(await active(), 'card-edit');
  console.log('OK — import via le champ de fichiers, focus et retour des dialogues, groupes imbriqués et confirmation de sauvegarde.');

  const epubButton = `[data-book-id="${ids.epub}"] .card-open`;
  await focus(epubButton);
  await key('Enter', 13);
  await until(() => cdp.run("NC.reader._state().ctl?.type === 'epub' && document.querySelector('#stage').getAttribute('aria-busy') === 'false'"));
  assert.equal(await active(), 'stage');
  await save('02-lecture-ordinateur');
  await key('r', 82);
  assert.equal(await active(), '');
  assert.equal(await cdp.run("document.activeElement.matches('#drawer input[type=search]')"), true);
  await cdp.run("document.activeElement.value = 'phare'");
  await key('Enter', 13);
  await until(() => cdp.run("Boolean(document.querySelector('.res-item'))"));
  assert.match(await cdp.run("document.querySelector('#drawer [role=status]').textContent"), /passage/);
  await key('Escape', 27);
  assert.equal(await active(), 'stage');
  await click('#btn-notes');
  await until(() => cdp.run("Boolean(document.querySelector('.note-item'))"));
  await click('#drawer-export');
  await until(() => cdp.run("!document.querySelector('#export-pop').hidden"));
  assert.equal(await active(), 'export-cancel');
  await key('Shift', 16);
  await key('Tab', 9, 8);
  assert.equal(await active(), 'export-md');
  await key('Escape', 27);
  assert.equal(await active(), 'drawer-export');
  await click('.note-cat-btn');
  assert.equal(await cdp.run("document.activeElement.closest('#cat-pop') !== null"), true);
  await key('Escape', 27);
  assert.equal(await active(), 'note-cat-btn');
  await click('.note-actions .mini-btn:nth-child(2)');
  assert.equal(await active(), 'note-pop-text');
  await key('Escape', 27);
  assert.equal(await cdp.run("document.querySelector('#note-pop').hidden && !document.querySelector('#drawer').hidden"), true);
  await key('Escape', 27);
  assert.equal(await active(), 'btn-notes');
  await click('#btn-font');
  assert.equal(await cdp.run("document.activeElement.closest('#font-pop') !== null"), true);
  await key('Escape', 27);
  assert.equal(await active(), 'btn-font');
  await click('#btn-kbd');
  assert.equal(await active(), 'kbd-close');
  await key('Escape', 27);
  assert.equal(await active(), 'btn-kbd');
  await click('#btn-back');
  await until(() => cdp.run("document.activeElement.matches('.card-open')"));
  assert.equal(await cdp.run("document.activeElement.closest('.card').dataset.bookId"), ids.epub);
  console.log('OK — ouverture clavier, recherche, notes, catégorie, export imbriqué, réglages et restitution à la fiche.');

  await cdp.run(`NC.reader.open(${JSON.stringify(ids.paper)})`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await focus('#stage');
  await key('ArrowRight', 39);
  await until(() => cdp.run("NC.reader._state().ctl.page === 2"));
  await until(() => cdp.run("document.querySelector('#progress').getAttribute('aria-valuetext') === '100 %'"));
  assert.equal(await cdp.run("document.querySelector('.flip') === null"), true);
  await click('#btn-bookmark');
  await until(() => cdp.run("document.querySelector('#btn-bookmark').getAttribute('aria-pressed') === 'true'"));
  assert.equal(await active(), 'btn-bookmark');
  await click('#btn-toc');
  assert.equal(await active(), 'drawer-close');
  assert.equal(await cdp.run("Boolean(document.querySelector('.thumb-cell'))"), true);
  await key('Escape', 27);
  await click('#btn-stats');
  await until(() => cdp.run("document.querySelector('#drawer-body').textContent.trim().length > 0"));
  await key('Escape', 27);
  await cdp.run(`(() => {
    const text = Array.from(document.querySelectorAll('.nc-text-layer span')).find((node) => node.textContent.includes('phare'));
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup'));
  })()`);
  assert.equal(await cdp.run("document.querySelector('#sel-popup').hidden"), false);
  await click('#sel-highlight');
  await until(() => cdp.run("document.querySelector('#sel-popup').hidden && Boolean(document.querySelector('#pdf-stage [data-nc-ann]'))"));
  console.log('OK — PDF, navigation sans animation, signets, vignettes, statistiques et menu de sélection.');

  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  for (const [width, height] of [[320, 640], [390, 844], [667, 375], [768, 1024], [1024, 768]]) {
    await setViewport(width, height, true);
    await delay(330);
    const geometry = await cdp.run(`(() => {
      const out = (element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1;
      return { width: document.documentElement.clientWidth, title: document.querySelector('.reader-title').clientWidth,
        out: [...document.querySelectorAll('.reader-actions button:not([hidden])')].filter(out).map(button => button.id),
        stage: document.querySelector('#stage').clientHeight, progress: document.querySelector('#progress').clientHeight };
    })()`);
    assert.equal(geometry.width, width);
    assert.ok(geometry.title >= 95, JSON.stringify(geometry));
    assert.deepEqual(geometry.out, []);
    assert.ok(geometry.stage > 170, JSON.stringify(geometry));
    assert.ok(geometry.progress >= 24);
    await click('#btn-font');
    const panel = await cdp.run(`(() => {
      const pop = document.querySelector('#font-pop');
      const { left, right, top, bottom } = pop.getBoundingClientRect();
      return { left, right, top, bottom, hidden: pop.hidden, viewport: visualViewport.height,
        viewportTop: visualViewport.offsetTop, viewportWidth: visualViewport.width,
        viewportLeft: visualViewport.offsetLeft, visibleHeight: document.documentElement.style.getPropertyValue('--visible-height') };
    })()`);
    assert.ok(!panel.hidden && panel.left >= 0 && panel.right <= width + 1 && panel.bottom <= height + 1,
      JSON.stringify({ width, height, panel }));
    await key('Escape', 27);
    console.log(`OK — ${width} × ${height}, barre complète et réglages visibles, scène ${geometry.stage} px.`);
  }
  await setViewport(390, 844, true);
  await save('03-pdf-telephone');
  await click('#btn-search');
  await save('04-recherche-telephone');
  await setViewport(390, 320, true);
  await until(() => cdp.run("document.querySelector('#drawer').getBoundingClientRect().bottom <= 321"));
  await key('Escape', 27);
  await setViewport(390, 844, true);
  const point = await cdp.run(`(() => {
    const box = document.querySelector('#btn-theme').getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })()`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until(() => cdp.run("!document.querySelector('#theme-pop').hidden"));
  await key('Escape', 27);
  await click('#btn-back');
  await until(() => cdp.run("!document.querySelector('#view-library').hidden"));
  await cdp.run(`window.fetch = ((fetch) => (path, ...args) => path === 'packs/index.json'
    ? Promise.resolve(Response.json({ packs: [{ id:'test', titre:'Pack de test', source:'packs/test/', type:'dossier',
        livres:[{fichier:'absent.epub'}] }] })) : fetch(path,...args))(window.fetch)`);
  await click('#btn-packs');
  assert.equal(await active(), 'packs-back');
  await until(() => cdp.run("Boolean(document.querySelector('.pack-card'))"));
  await click('.pack-card');
  assert.equal(await active(), 'packs-back-list');
  await key('Escape', 27);
  assert.equal(await active(), 'pack-card');
  await key('Escape', 27);
  assert.equal(await active(), 'btn-packs');
  assert.deepEqual(await cdp.run('window.__ncErrors'), []);
  console.log('OK — réduction de hauteur simulée, tap émulé sur un thème et aller-retour clavier des packs.');
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
  } else if (migration) {
    await testMigration(cdp, port);
  } else if (process.env.NC_UX === '1') {
    await testUx(cdp);
  } else if (process.env.NC_NOTEBOOK === '1') {
    await testNotebook({ cdp, port, url, openTab, until, makeBooks });
  } else {

  assert.equal((await cdp.run(`(${rawCatalog})()`)).version, enableV8 ? 8 : 7);
  const result = await cdp.run(`(${async function scenario(fixture) {
    function check(condition, message) { if (!condition) throw new Error(message); }
    const { epubBlob, pdf } = await fixture();
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
    firstCard.querySelector('.card-open').focus();
    check(getComputedStyle(firstCard.querySelector('.card-edit')).display === 'flex', 'Actions de carte au clavier');
    check(window.__ncErrors.length === 0, JSON.stringify(window.__ncErrors));
    return paper.id;
  }})(${makeBooks})`);
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
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'books' && ++writes === 2) {
        throw new DOMException('Quota de test', 'QuotaExceededError');
      }
      return originalPut.apply(this, args);
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
