import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

async function longEpub(title, fixed = false) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const layout = fixed ? '<meta property="rendition:layout">pre-paginated</meta>' : '';
  zip.file('book.opf', `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${title}</dc:identifier><dc:title>${title}</dc:title><dc:language>fr</dc:language>${layout}</metadata><manifest><item id="s1" href="one.xhtml" media-type="application/xhtml+xml"/><item id="s2" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="s1"/><itemref idref="s2"/></spine></package>`);
  for (const [section, name] of ['one', 'two'].entries()) {
    const blocks = Array.from({ length: fixed ? 2 : 160 }, (_, i) => {
      const id = section * 160 + i;
      const words = 'Un chemin longe les jardins sur la colline. Les reflets glissent sur les vitres, puis s’effacent derrière les arbres. ';
      return `<p id="p${id}" data-p="${id}">Passage ${id}. ${words.repeat(2 + i % 4)} Lettre ${id}.</p>`;
    }).join('');
    zip.file(`${name}.xhtml`, `<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr"><head><title>${title}</title>${fixed ? '<meta name="viewport" content="width=800,height=600"/>' : ''}</head><body>${blocks}</body></html>`);
  }
  return new File([await zip.generateAsync({ type: 'arraybuffer' })], `${title}.epub`, { type: 'application/epub+zip' });
}

function visibleText() {
  const { ctl } = NC.reader._state();
  const view = ctl._rendition.views().displayed()[0];
  const doc = view.contents.document;
  const stage = document.querySelector('#epub-host').getBoundingClientRect();
  const frame = view.iframe.getBoundingClientRect();
  const viewport = { left: Math.max(0, stage.left - frame.left), right: Math.min(frame.width, stage.right - frame.left),
    top: Math.max(0, stage.top - frame.top), bottom: Math.min(frame.height, stage.bottom - frame.top) };
  const intersects = (r) => r.width > 0 && r.right > viewport.left && r.left < viewport.right &&
    r.top + r.height / 2 >= viewport.top - 1 && r.bottom - r.height / 2 < viewport.bottom;
  const seen = [];
  const range = doc.createRange();
  for (const p of doc.querySelectorAll('p[data-p]')) {
    const text = p.firstChild;
    range.selectNodeContents(text);
    if (![...range.getClientRects()].some(intersects)) continue;
    for (let offset = 0; offset < text.length; offset++) {
      range.setStart(text, offset);
      range.setEnd(text, offset + 1);
      if (intersects(range.getBoundingClientRect())) {
        seen.push({ id: Number(p.dataset.p), offset });
        break;
      }
    }
  }
  const anchor = window.testAnchor;
  let exact = false;
  if (anchor) {
    const node = doc.querySelector(`#p${anchor.id}`)?.firstChild;
    if (node) {
      range.setStart(node, anchor.offset);
      range.setEnd(node, anchor.offset + 1);
      exact = intersects(range.getBoundingClientRect());
    }
  }
  const mapped = view.contents.range(ctl.location?.start?.cfi);
  const captured = NC.epubAnchor?.capture(ctl._rendition, document.querySelector('#epub-host'), ctl.location);
  const captureRange = captured && view.contents.range(captured.cfi);
  const mapping = (range) => ({ id: range?.startContainer?.parentElement?.dataset.p, offset: range?.startOffset });
  return { first: seen[0], last: seen.at(-1), exact, paragraphs: seen.map(({ id }) => id),
    mapped: mapping(mapped), captured: mapping(captureRange) };
}

export async function testProfiles({ cdp, port, url, openTab, until, makeBooks, baseline }) {
  const reader = 'NC.reader._state().ctl';
  const read = (expression) => cdp.run(`${reader}.${expression}`);
  const click = (selector) => cdp.run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const action = (name) => click(`[data-profile="${name}"]`);
  const input = (name) => cdp.run(`document.querySelector('[data-profile-name]').value = ${JSON.stringify(name)}`);
  const select = (selector, value) => cdp.run(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    node.value = ${JSON.stringify(value)};
    node.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const choose = (id) => select('[data-profile-choice]', id);
  const open = (id) => cdp.run(`NC.reader.open(${JSON.stringify(id)})`);
  const close = () => cdp.run('NC.reader.close()');
  const prefs = (id) => cdp.run(`NC.db.getPrefs(${JSON.stringify(id)})`);
  const catalog = () => cdp.run('NC.profiles.catalog()');
  const profileNamed = async (name) => (await catalog()).profiles.find((profile) => profile.name === name);
  const controlsReady = () => until(() => cdp.run("!document.querySelector('[data-profile=apply]').disabled"));
  const viewport = async (width, height) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500,
      screenOrientation: { type: width > height ? 'landscapePrimary' : 'portraitPrimary', angle: width > height ? 90 : 0 } });
    await delay(470);
    if (!baseline) await cdp.run(`${reader}?.layoutSettled()`);
  };
  const text = () => cdp.run(`(${visibleText})()`);

  await viewport(1240, 870);
  const books = await cdp.run(`(async () => {
    const { pdf } = await (${makeBooks})();
    window.makeLong = ${longEpub};
    await NC.library.importFiles([await makeLong('Longueur'), new File([pdf], 'profil.pdf',{type:'application/pdf'})]);
    const books = await NC.db.allBooks();
    return { epub: books.find(b => b.type === 'epub').id, pdf: books.find(b => b.type === 'pdf').id };
  })()`);
  await cdp.run(`Promise.all([NC.db.putSetting('spread', 'none'), NC.db.patchPrefs(${JSON.stringify(books.epub)},
    { theme: 'sepia', fontSize: 110, typo: {font:'serif', lineHeight:1.62} })])`);
  assert.equal(await open(books.epub), true);
  assert.equal(await read('fontSize'), 110);
  assert.equal(await read('theme'), 'sepia');
  await cdp.run(`(async () => {
    const ctl = ${reader};
    const view = ctl._rendition.getContents()[0];
    const node = view.document.querySelector('#p92').firstChild;
    const range = view.document.createRange();
    range.setStart(node, 40); range.setEnd(node, 55);
    const cfi = view.cfiFromRange(range);
    window.anchorCfi = cfi;
    await NC.db.putAnnotation({ id:'profil-note', bookId:${JSON.stringify(books.epub)}, cfi, text:range.toString(), kind:'highlight', sectionIndex:0 });
    await NC.db.putBookmark({ id:'profil-signet', bookId:${JSON.stringify(books.epub)}, cfi, sectionIndex:0, label:'Passage synthétique' });
    await ctl.gotoCfi(cfi);
  })()`);
  await until(async () => (await text()).paragraphs.includes(92));
  const measurements = [];
  async function measure(label, change, sameAnchor = false) {
    if (!sameAnchor) {
      await cdp.run(`${reader}.gotoCfi(anchorCfi).then(() => true)`);
      await delay(140);
      await until(async () => (await text()).paragraphs.includes(92));
    }
    const initial = await text();
    const before = initial.first;
    assert.ok(before);
    await cdp.run(`window.testAnchor = ${JSON.stringify(before)}`);
    const start = Date.now();
    await change();
    await delay(330);
    if (!baseline) await cdp.run(`${reader}.layoutSettled()`);
    const after = await text();
    const row = { label, before, after: after.first, exact: after.exact,
      shift: after.first ? after.first.id - before.id : null, initial: initial.captured, mapped: initial.mapped,
      last: after.last, totalMs: Date.now() - start };
    measurements.push(row);
    return row;
  }
  await click('#btn-font');
  if (!baseline) await controlsReady();
  await measure('police', () => click('[data-typo-font="sans"]'));
  await measure('taille', () => click('[aria-label="Augmenter la taille du texte"]'));
  await measure('interligne', () => click('[data-typo-lh="2.1"]'));
  await measure('pages → défilement', () => click('#btn-flow'));
  assert.equal(await read('flow'), 'scrolled');
  await measure('défilement → pages', () => click('#btn-flow'));
  assert.equal(await read('flow'), 'paginated');
  await measure('bureau → portrait', () => viewport(390, 844));
  await measure('portrait → paysage', () => viewport(844, 390));
  if (!baseline) {
    await viewport(1240, 870);
    await click('#btn-font');
    await controlsReady();
    await measure('marges', () => select('[data-layout="margin"]', 'generous'));
    await measure('largeur', () => select('[data-layout="width"]', 'narrow'));
    const layout = await cdp.run(`(() => {
      const doc = ${reader}._rendition.getContents()[0].document;
      const style = doc.defaultView.getComputedStyle(doc.body);
      return { width: document.querySelector('#epub-host').clientWidth, gap: style.columnGap };
    })()`);
    assert.equal(layout.width, 670);
    assert.ok(Number.parseFloat(layout.gap) > 100, JSON.stringify(layout));
    await select('[data-layout="paragraph"]', 'generous');
    await until(() => read("typo.paragraph === 'generous'"));
    assert.equal(await cdp.run("document.activeElement.matches('[data-profile-choice]')"), true);
    await choose('lecture-nocturne');
    await measure('application du profil', () => action('apply'));
    assert.equal(await read('theme'), 'night');
    assert.ok(measurements.every(({ exact }) => exact), JSON.stringify(measurements));
  }
  console.log(`REPÈRES ${baseline ? 'phase 5' : 'phase 6'} ${JSON.stringify(measurements)}`);
  if (baseline) return;
  await cdp.run(`${reader}.gotoCfi('two.xhtml')`);
  assert.ok((await text()).paragraphs.includes(160));
  await cdp.run(`${reader}.gotoCfi(anchorCfi)`);
  assert.ok((await text()).paragraphs.includes(92));

  // Le ZIP antérieur au premier profil reste un ZIP v1 ordinaire.
  // Ici on part du premier export et on retire uniquement les données de la phase 6.
  await cdp.run(`(async () => {
    window.savedZip = (await NC.backup.exportAll({silent:true})).blob;
    const zip = await JSZip.loadAsync(savedZip);
    const state = JSON.parse(await zip.file('library.json').async('string'));
    for (const row of state.prefs) delete row.reading;
    state.settings = state.settings.filter(({key}) => key !== NC.profiles.key);
    zip.file('library.json', JSON.stringify(state));
    window.oldZip = await zip.generateAsync({type:'blob'});
  })()`);
  const profilePrefs = await prefs(books.epub);
  assert.equal(profilePrefs.theme, 'sepia');
  assert.equal(profilePrefs.reading.profile.id, 'lecture-nocturne');
  await click('.reading-profiles summary');
  await input('Essai de profil');
  await action('save');
  const personal = await until(() => profileNamed('Essai de profil'));
  assert.equal(personal.settings.theme, 'night');
  await controlsReady();
  await choose(personal.id);
  await input('Profil renommé');
  await action('rename');
  await until(() => profileNamed('Profil renommé'));
  await controlsReady();
  await input('');
  await action('copy');
  const duplicate = await until(() => profileNamed('Profil renommé (copie)'));
  await controlsReady();
  await choose(duplicate.id);
  await action('default');
  await until(async () => (await catalog()).defaultId === duplicate.id);
  await controlsReady();
  await action('apply');
  await until(async () => (await prefs(books.epub)).reading.profile.id === duplicate.id);
  await controlsReady();
  const beforeSession = await prefs(books.epub);
  await click('[data-profile-session]');
  await click('[aria-label="Augmenter la taille du texte"]');
  await until(() => read('fontSize === 120'));
  assert.deepEqual(await prefs(books.epub), beforeSession);
  await until(() => cdp.run("document.querySelector('.profile-current').textContent.includes('session uniquement')"));
  await click('[data-profile-session]');
  await until(() => read('fontSize === 110'));
  await click('[aria-label="Augmenter la taille du texte"]');
  await until(async () => (await prefs(books.epub)).reading.overrides.fontSize === 120);
  assert.equal((await profileNamed('Profil renommé (copie)')).settings.fontSize, 110);
  await until(() => read('fontSize === 120'));
  await action('update');
  await until(async () => (await profileNamed('Profil renommé (copie)')).settings.fontSize === 120);
  await controlsReady();
  await action('reset');
  await until(() => read('fontSize === 110'));
  await controlsReady();
  await action('undo');
  await until(async () => (await prefs(books.epub)).reading.profile.id === 'lecture-nocturne');
  await controlsReady();
  const annotations = await cdp.run(`(async () => {
    const c = ${reader};
    const [ann] = await c.restoreHighlights();
    const [bookmark] = await NC.db.bookmarksFor(c.rec.id);
    await c.gotoBookmark(bookmark);
    const view = c._rendition.getContents()[0];
    const excerpt = view.document.querySelector('#p92').firstChild.data.slice(0, 42);
    const recovered = NC.epubAnchor.recover(c._rendition, { cfi: 'epubcfi(/6/2!/4/2)', index: 0, excerpt, offset: 5 });
    const range = view.range(recovered);
    return { same:ann.cfi === bookmark.cfi && bookmark.cfi === anchorCfi,
      count:(await c.search('Passage 92')).length, recovery: range.startContainer.parentElement.id, offset: range.startOffset };
  })()`);
  assert.deepEqual(annotations, { same: true, count: 1, recovery: 'p92', offset: 5 });
  await until(async () => (await text()).paragraphs.includes(92));
  await close();

  const imports = await cdp.run(`(async () => {
    await NC.library.importFiles([await makeLong('Import postérieur'), await makeLong('Disposition fixe', true)]);
    const books = await NC.db.allBooks();
    return Object.fromEntries(books.filter(b => ['Import postérieur','Disposition fixe'].includes(b.title)).map(b => [b.title,b.id]));
  })()`);
  assert.equal((await prefs(imports['Import postérieur'])).reading.profile.settings.fontSize, 120);
  assert.equal((await prefs(books.pdf))?.reading, undefined);

  assert.equal(await cdp.run(`new Promise((resolve, reject) => {
    const req = indexedDB.open('nuit-calme-db');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const db = req.result; resolve(db.version); db.close(); };
  })`), 7);

  assert.equal(await open(books.pdf), true);
  await click('#btn-font');
  await controlsReady();
  assert.equal(await cdp.run("document.querySelector('#font-pop-body [data-typo-font]') === null"), true);
  await choose('lecture-nocturne');
  await action('apply');
  await until(() => read("theme === 'night'"));
  await cdp.run(`${reader}.gotoPage(2)`);
  assert.equal(await read('page'), 2);
  await cdp.run(`${reader}.setFit('width')`);
  assert.equal(await read('fit'), 'width');
  assert.equal(await cdp.run(`${reader}.search('phare').then(rows=>rows.length)`), 2);
  await close();

  assert.equal(await open(imports['Disposition fixe']), true);
  assert.equal(await read('fixedLayout'), true);
  assert.equal(await cdp.run(`${reader}.flow === 'paginated' && !${reader}._rendition.getContents()[0].document.getElementById('nuit-calme-typo')`), true);
  await click('#btn-font');
  await controlsReady();
  assert.equal(await cdp.run("!document.querySelector('[data-layout]') && document.querySelector('#btn-flow').hidden"), true);
  await close();

  const second = await openTab(cdp, port, url + '?profils-second');
  try {
    await until(() => second.tab.run('Boolean(window.NC?.profiles && NC_DEBUG)'));
    const serialized = JSON.stringify(personal);
    const [one, two] = await Promise.all([cdp, second.tab].map((tab, i) =>
      tab.run(`NC.profiles.save('Onglet ${i + 1}', ${serialized}.settings).then(r=>r.id)`)));
    assert.ok((await catalog()).profiles.some(({ id }) => id === one));
    assert.ok((await catalog()).profiles.some(({ id }) => id === two));
    await second.tab.run(`NC.profiles.catalog().then(s => {window.stale = s.profiles.find(p=>p.id===${JSON.stringify(personal.id)})})`);
    await cdp.run(`NC.profiles.catalog().then(s => { const p=s.profiles.find(p=>p.id===${JSON.stringify(personal.id)}); return NC.profiles.save('Version 2', p.settings, p) })`);
    assert.equal(await second.tab.run("NC.profiles.save('Édition périmée', stale.settings, stale).then(()=>'', e=>e.name)"), 'InvalidStateError');
  } finally {
    await cdp.send('Target.closeTarget', { targetId: second.targetId });
    second.tab.close();
  }

  await open(books.epub);
  await click('#btn-font');
  await controlsReady();
  await click('.reading-profiles summary');
  await cdp.run(`window.profileOriginalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(row) {
      if (this.name === 'settings' && row?.key === NC.profiles.key) throw new DOMException('Quota simulé','QuotaExceededError');
      return profileOriginalPut.apply(this, arguments);
    };`);
  await input('Profil hors quota');
  await action('save');
  await until(() => cdp.run("document.querySelector('.profile-message').textContent.includes('Impossible')"));
  await cdp.run('IDBObjectStore.prototype.put = profileOriginalPut');
  assert.equal(await cdp.run("document.querySelector('[data-profile-name]').value"), 'Profil hors quota');
  assert.equal(await profileNamed('Profil hors quota'), undefined);
  await choose(duplicate.id);
  await action('delete');
  assert.equal(await cdp.run("document.activeElement.dataset.profile"), 'cancel');
  await action('cancel');
  assert.ok(await profileNamed('Profil renommé (copie)'));
  await action('delete');
  await action('confirm');
  await until(async () => !(await profileNamed('Profil renommé (copie)')));
  assert.equal((await catalog()).defaultId, null);
  assert.equal((await prefs(imports['Import postérieur'])).reading.profile.name, duplicate.name);
  await close();

  await cdp.run(`(async () => {
    window.fullZip = (await NC.backup.exportAll({silent:true})).blob;
    await NC.backup.importFile(oldZip, 'replace');
  })()`);
  assert.equal((await catalog()).profiles.length, 4);
  assert.equal((await prefs(books.epub)).reading, undefined);
  await cdp.run(`(async () => {
    const { profiles } = await NC.profiles.catalog();
    await NC.profiles.save('Profil local uniquement', profiles[0].settings);
    await NC.backup.importFile(fullZip, 'merge');
  })()`);
  assert.ok(await profileNamed('Profil local uniquement'));
  assert.ok(await profileNamed('Version 2'));
  await cdp.run("NC.backup.importFile(fullZip, 'replace')");
  assert.ok(await profileNamed('Version 2'));
  assert.equal((await prefs(books.epub)).reading.profile.id, 'lecture-nocturne');
  await cdp.run("NC.backup.importFile(savedZip, 'merge')");
  assert.ok(await profileNamed('Version 2'));
  await cdp.send('Page.navigate', { url: url + '?profils-reprise' });
  await until(() => cdp.run("location.search === '?profils-reprise' && typeof NC_DEBUG !== 'undefined'"));
  assert.ok(await profileNamed('Version 2'));
  assert.equal(await open(books.epub), true);
  assert.equal(await read('theme'), 'night');
  const resumed = await text();
  assert.ok(resumed.paragraphs.includes(92), JSON.stringify({ resumed,
    progress: await cdp.run(`NC.db.getProgress(${JSON.stringify(books.epub)})`) }));
  assert.deepEqual(await cdp.run('window.__ncErrors'), []);
  console.log('OK — profils, préférences, défaut à l’import, ZIP v1, deux onglets, EPUB fixe, PDF, signets et annotations.');
}
