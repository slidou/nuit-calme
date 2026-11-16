import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export async function testNotebook({ cdp, port, url, openTab, until, makeBooks }) {
  const wait = (expression, tab = cdp) => until(() => tab.run(expression));
  const q = (value) => JSON.stringify(value);
  const click = (selector, tab = cdp) => tab.run(`document.querySelector(${q(selector)}).click()`);
  const change = (selector, value, event = 'change', tab = cdp) => tab.run(`(() => {
    const el = document.querySelector(${q(selector)});
    el.value = ${q(value)};
    el.dispatchEvent(new Event(${q(event)}, { bubbles: true }));
  })()`);
  const status = (count, tab = cdp) => wait(`document.querySelector('#notebook-status').textContent.startsWith(${q(count + ' entrée')})`, tab);
  const settings = await cdp.run(`(${async function seed(fixture) {
    const { epubBlob, pdf } = await fixture();
    await NC.library.importFiles([
      new File([epubBlob], 'Source.epub', { type: 'application/epub+zip' }),
      new File([pdf], 'Source.pdf', { type: 'application/pdf' }),
    ]);
    const books = await NC.db.allBooks();
    const epub = books.find((book) => book.type === 'epub');
    const paper = books.find((book) => book.type === 'pdf');
    await NC.db.patchBook(epub.id, { title: 'Écume [I]', author: 'Léa Rivage' });
    await NC.db.patchBook(paper.id, { title: 'Journal PDF', author: 'N. Marin' });
    await NC.library.refresh();
    await NC.db.putSetting('spread', 'none');
    await NC.reader.open(epub.id);
    const controller = NC.reader._state().ctl;
    const content = controller._rendition.getContents()[0];
    const paragraph = content.document.querySelector('p');
    const range = content.document.createRange();
    range.selectNodeContents(paragraph);
    const selection = content.window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const cfi = controller.book.spine.get(0).cfiFromRange(range);
    controller._rendition.emit('selected', cfi, content);
    document.querySelector('#sel-note').click();
    document.querySelector('#note-pop-text').value = 'Méditation [marée]\n\nSeconde ligne *et* <b> &amp;';
    document.querySelector('#note-save').click();
    for (let attempt = 0; attempt < 100 && !document.querySelector('#note-pop').hidden; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const [epubNote] = await NC.db.annotationsFor(epub.id);
    if (!epubNote || !epubNote.cfi) throw new Error('Note EPUB non enregistrée');
    await NC.reader.close();

    await NC.reader.open(paper.id);
    await NC.reader._state().ctl.gotoPage(2);
    const part = [...document.querySelectorAll('.nc-text-layer span')].find((node) => node.textContent.includes('phare'));
    const pdfRange = document.createRange();
    pdfRange.selectNodeContents(part);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(pdfRange);
    document.dispatchEvent(new MouseEvent('mouseup'));
    document.querySelector('#sel-highlight').click();
    for (let attempt = 0; attempt < 100 && !document.querySelector('#sel-popup').hidden; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const [pdfHighlight] = await NC.db.annotationsFor(paper.id);
    if (!pdfHighlight?.rects.length) throw new Error('Surlignage PDF non enregistré');
    document.querySelector('#btn-bookmark').click();
    for (let attempt = 0; attempt < 100 && !(await NC.db.bookmarksFor(paper.id)).length; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await NC.reader.close();
    await NC.db.putProgress({ id: paper.id, lastPage: 1, lastOpened: Date.now(), zoom: 1, fit: 'page' });
    return { epub: epub.id, paper: paper.id, note: epubNote.id, highlight: pdfHighlight.id,
      color: pdfHighlight.color };
  }})(${makeBooks})`);
  const { epub, paper, note, highlight, color } = settings;
  await click('#btn-notebook');
  await status(3);
  assert.deepEqual(await cdp.run(`[...document.querySelectorAll('.notebook-kind')].map(el => el.textContent).sort()`),
    ['Note personnelle', 'Signet', 'Surlignage'].sort());
  assert.equal(await cdp.run("document.querySelectorAll('.notebook-card blockquote').length"), 2);
  assert.equal(await cdp.run("[...document.querySelectorAll('.notebook-card')].find(el => el.textContent.includes('Signet')).querySelector('blockquote')"), null);
  await change('#notebook-search', 'lea ecume meditation', 'input');
  await status(1);
  await change('#notebook-type', 'highlight');
  await status(0);
  await click('#notebook-reset');
  await change('#notebook-type', 'quote');
  await status(2);
  await change('#notebook-color', color);
  await change('#notebook-book', q(paper));
  await change('#notebook-date', 'recent');
  await change('#notebook-sort', 'book');
  await status(1);
  assert.match(await cdp.run("document.querySelector('.notebook-card').textContent"), /Page 2/);

  await cdp.run(`window.downloads = []; NC.downloadBlob = async (blob, name) => downloads.push({ name, text: await blob.text() });`);
  await click('#notebook-export-filtered');
  await click('#notebook-export');
  await wait('downloads.length === 2');
  const downloads = await cdp.run('downloads');
  const full = downloads.find((file) => file.name.endsWith('carnet.md')).text;
  const filtered = downloads.find((file) => file.name.endsWith('resultats.md')).text;
  assert.ok(full.includes('## Écume \\[I\\]'));
  assert.ok(full.includes('Auteur · Léa Rivage'));
  assert.ok(full.includes('#### Citation'));
  assert.ok(full.includes('#### Note personnelle'));
  assert.ok(full.includes('Méditation \\[marée\\]  \n>\n> Seconde ligne \\*et\\* \\<b\\> \\&amp;'));
  assert.match(filtered, /Journal PDF[\s\S]*Page 2/);
  assert.doesNotMatch(filtered, /Écume|### Signet/);
  console.log('OK — note EPUB et surlignage PDF créés dans les lecteurs, signet sans citation, recherche et filtres combinés, exports Markdown.');

  const progress = (id) => cdp.run(`NC.db.getProgress(${q(id)})`);
  const paperProgress = await progress(paper);
  const readingStats = await cdp.run(`NC.db.readStatsFor(${q(paper)})`);
  await click('.notebook-primary');
  await wait("NC.reader._state().ctl?.page === 2 && document.querySelector('#stage').getAttribute('aria-busy') === 'false'");
  assert.equal(await cdp.run("document.querySelector('#btn-back').getAttribute('aria-label')"), 'Retour au carnet');
  assert.equal(await cdp.run('NC.reader._statsState().book'), null);
  await cdp.run('NC.reader._state().ctl.gotoPage(1)');
  await cdp.run('NC.reader._state().ctl.gotoPage(2)');
  await cdp.run('NC.reader.close()');
  await status(1);
  assert.deepEqual(await progress(paper), paperProgress);
  assert.deepEqual(await cdp.run(`NC.db.readStatsFor(${q(paper)})`), readingStats);
  assert.equal(await cdp.run("document.querySelector('#notebook-book').value"), q(paper));
  assert.equal(await cdp.run("document.querySelector('#notebook-type').value"), 'quote');
  assert.equal(await cdp.run("document.activeElement.classList.contains('notebook-primary')"), true);
  await click('#notebook-reset');
  await change('#notebook-type', 'note');
  await status(1);
  const epubProgress = await progress(epub);
  await click('.notebook-primary');
  await wait("NC.reader._state().ctl?.type === 'epub' && document.querySelector('#stage').getAttribute('aria-busy') === 'false'");
  await cdp.run('NC.reader.close()');
  assert.deepEqual(await progress(epub), epubProgress);

  await cdp.run(`NC.db.putAnnotation({ id: 'repere-ancien', bookId: ${q(epub)}, cfi: 'repere-invalide', sectionIndex: 0 })`);
  await cdp.run(`NC.db.putAnnotation({ id: 'page-inconnue', bookId: ${q(paper)}, page: 99, type: 'pdf' })`);
  await cdp.run(`(async () => {
    const state = await NC.db.backupSnapshot();
    state.annotations.push({ id:'orpheline', bookId:'absent' });
    await NC.db.restoreBackup(state, false);
  })()`);
  await click('#notebook-reset');
  await change('#notebook-date', 'unknown');
  await status(3);
  assert.match(await cdp.run("document.querySelector('#notebook-results').textContent"), /Livre indisponible/);
  assert.equal(await cdp.run("document.querySelectorAll('.notebook-primary').length"), 2);
  await change('#notebook-book', q(epub));
  await status(1);
  await click('.notebook-primary');
  await wait("document.querySelector('#toasts').textContent.includes('début de la section')");
  await cdp.run('NC.reader.close()');
  assert.deepEqual(await progress(epub), epubProgress);
  assert.equal(await cdp.run("document.querySelector('#notebook-date').value"), 'unknown');
  await change('#notebook-book', q(paper));
  await click('.notebook-primary');
  await wait("NC.reader._state().ctl?.page === 1 && document.querySelector('#toasts').textContent.includes('Passage introuvable')");
  await cdp.run('NC.reader.close()');
  assert.deepEqual(await progress(paper), paperProgress);
  await click('#notebook-reset');
  await change('#notebook-type', 'note');
  await status(1);
  console.log('OK — retour avec le contexte, page PDF et passage EPUB en consultation sans écrire la progression, entrée orpheline et repli de section.');

  const second = await openTab(cdp, port, url + '?carnet-second');
  let archive;
  try {
    await wait("typeof NC_DEBUG !== 'undefined'", second.tab);
    await click('#btn-notebook', second.tab);
    await status(6, second.tab);
    await click('.notebook-card .mini-btn:not(.notebook-primary)');
    await click('#notebook-entry-edit');
    await change('#notebook-note', 'Brouillon local', 'input');
    await second.tab.run(`NC.db.patchAnnotation(${q(note)}, { note: 'Texte du deuxième onglet', updatedAt: Date.now() }, ${q(epub)})`);
    await click('#notebook-entry-save');
    await wait("!document.querySelector('#notebook-entry-error').hidden && document.querySelector('#notebook-entry-error').textContent.includes('a changé')");
    assert.equal(await cdp.run("document.querySelector('#notebook-note').value"), 'Brouillon local');
    await click('#notebook-entry-close');
    await wait("document.querySelector('.notebook-card').textContent.includes('Texte du deuxième onglet')");
    await click('.notebook-card .mini-btn:not(.notebook-primary)');
    await click('#notebook-entry-edit');
    await change('#notebook-note', 'Note finale', 'input');
    await click('#notebook-entry-save');
    await wait("document.querySelector('#notebook-entry').hidden");
    await wait("document.querySelector('#notebook-results').textContent.includes('Note finale')", second.tab);
    const saved = await cdp.run(`NC.db.annotationsFor(${q(epub)}).then(rows => rows.find(row => row.id === ${q(note)}))`);
    assert.ok(saved.cfi);
    assert.ok(saved.color);
    archive = await cdp.run(`(async () => {
      window.notebookArchive = (await NC.backup.exportAll({silent:true})).blob;
      return notebookArchive.size;
    })()`);
    assert.ok(archive > 0);

    await click('#notebook-back', second.tab);
    await second.tab.run(`NC.reader.open(${q(paper)})`);
    await second.tab.run('NC.reader._state().ctl.gotoPage(2)');
    await wait(`!!document.querySelector(${q('[data-nc-ann="' + highlight + '"]')})`, second.tab);
    await change('#notebook-book', q(paper));
    await change('#notebook-type', 'highlight');
    await change('#notebook-type', 'quote');
    await status(1);
    await click('.notebook-card .mini-btn:not(.notebook-primary)');
    await click('#notebook-entry-delete');
    assert.equal(await cdp.run('document.activeElement.id'), 'notebook-delete-cancel');
    await click('#notebook-delete-cancel');
    assert.equal(await cdp.run(`NC.db.annotationsFor(${q(paper)}).then(rows => rows.length)`), 2);
    await click('#notebook-entry-delete');
    await cdp.run("window.cardBeforeRemoteChange = document.querySelector('.notebook-card')");
    await second.tab.run(`NC.db.patchAnnotation(${q(highlight)}, { category: 'concurrente' }, ${q(paper)})`);
    await click('#notebook-delete-accept');
    await wait("!document.querySelector('#notebook-entry-error').hidden && document.querySelector('#notebook-entry-error').textContent.includes('a changé')");
    await click('#notebook-entry-close');
    await wait("document.querySelector('.notebook-card') !== cardBeforeRemoteChange");
    await click('.notebook-card .mini-btn:not(.notebook-primary)');
    await click('#notebook-entry-delete');
    await click('#notebook-delete-accept');
    await status(0);
    await wait(`!document.querySelector(${q('[data-nc-ann="' + highlight + '"]')})`, second.tab);
    await second.tab.run('NC.reader.close()');
    await second.tab.run(`NC.reader.open(${q(epub)})`);
    await second.tab.run(`(async () => {
      const row = (await NC.db.annotationsFor(${q(epub)})).find(item => item.id === ${q(note)});
      await NC.reader._state().ctl.removeHighlight(row);
    })()`);
    await click('#notebook-reset');
    await status(4);
    await second.tab.run('NC.reader.close()');
  } finally {
    await cdp.send('Target.closeTarget', { targetId: second.targetId });
    second.tab.close();
    await cdp.send('Page.bringToFront');
  }
  await cdp.run("NC.backup.importFile(notebookArchive, 'replace')");
  await status(6);
  assert.match(await cdp.run("document.querySelector('#notebook-results').textContent"), /Note finale/);
  assert.equal(await cdp.run(`NC.db.annotationsFor(${q(paper)}).then(rows => rows.length)`), 2);
  console.log('OK — édition en concurrence protégée, mises à jour et suppressions entre onglets et lecteur, restauration ZIP v1.');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await cdp.run("document.querySelector('#view-notebook').scrollWidth <= 391"));
  if (process.env.NC_NOTEBOOK_OUT) {
    const dir = resolve(process.env.NC_NOTEBOOK_OUT);
    await mkdir(dir, { recursive: true });
    await wait("!document.querySelector('#toasts .toast')");
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(dir, 'carnet-mobile.png'), Buffer.from(data, 'base64'));
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    const desktop = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(dir, 'carnet-ordinateur.png'), Buffer.from(desktop.data, 'base64'));
  } else await cdp.send('Emulation.clearDeviceMetricsOverride');

  await cdp.run("NC.db.backupSnapshot().then(state => { window.notebookBenchmarkBase = state; })");
  for (const count of [10, 100, 1000, 5000]) {
    await click('#notebook-back');
    await cdp.run(`NC.db.restoreBackup({ ...notebookBenchmarkBase, bookmarks: [], annotations:
      Array.from({ length: ${count} }, (_, i) => ({
        id: 'bench-' + i, bookId: ${q(epub)}, text: 'Phrase synthétique à relire. ' + i,
        kind: 'note', note: i === ${count - 1} ? 'aiguille unique' : 'Lecture suivie',
        createdAt: 1700000000000 + i, sectionIndex: 0,
      })) }, true)`);
    const measurements = [];
    for (let run = 0; run < 3; run++) {
      if (run) await click('#notebook-back');
      const sample = await cdp.run(`(async () => {
        const input = document.querySelector('#notebook-search');
        input.value = '';
        document.querySelector('#notebook-sort').dispatchEvent(new Event('change'));
        const status = document.querySelector('#notebook-status');
        status.textContent = '';
        const nextStatus = expected => new Promise(resolve => {
          const observer = new MutationObserver(() => {
            if (status.textContent === expected) { observer.disconnect(); resolve(performance.now()); }
          });
          observer.observe(status, {childList:true});
        });
        const openResult = nextStatus('${count} entrées');
        const nativeGetAll = IDBObjectStore.prototype.getAll;
        IDBObjectStore.prototype.getAll = function (...args) {
          if (this.name === 'books' && !document.querySelector('#view-notebook').hidden) {
            throw new Error('Lecture des binaires depuis le carnet');
          }
          return nativeGetAll.apply(this, args);
        };
        const start = performance.now();
        document.querySelector('#btn-notebook').click();
        const opened = await openResult;
        IDBObjectStore.prototype.getAll = nativeGetAll;
        const cards = document.querySelectorAll('.notebook-card').length;
        const searchResult = nextStatus('1 entrée sur ${count}');
        const searchStart = performance.now();
        input.value = 'aiguille unique';
        input.dispatchEvent(new Event('input', {bubbles:true}));
        return { openMs: opened - start, searchMs: (await searchResult) - searchStart, cards };
      })()`);
      assert.equal(sample.cards, Math.min(count, 40));
      measurements.push(sample);
    }
    if (count > 40) {
      await change('#notebook-search', '', 'input');
      await status(count);
      await click('#notebook-more');
      assert.equal(await cdp.run("document.querySelectorAll('.notebook-card').length"), 80);
    }
    console.log(JSON.stringify({ notebookEntries: count, measurements }));
  }
  assert.deepEqual(await cdp.run('window.__ncErrors'), []);
}
