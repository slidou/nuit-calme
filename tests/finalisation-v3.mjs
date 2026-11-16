import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function testV3({ cdp, port, url, openTab, until, makeBooks, activate, remoteProbes }) {
  const run = (command) => cdp.run(command);
  const version = () => run(`new Promise((resolve,reject) => {
    const request = indexedDB.open('nuit-calme-db');
    request.onsuccess = () => { const db = request.result; resolve(db.version); db.close(); };
    request.onerror = () => reject(request.error);
  })`);
  assert.equal(await version(), 7);
  assert.equal(await run('typeof NC.readingStats'), 'undefined');
  const old = await run(`(async () => {
    const {epubBlob, pdf} = await (${makeBooks})();
    await NC.library.importFiles([new File([epubBlob],'ancien.epub'),new File([pdf],'ancien.pdf')]);
    const books = await NC.db.allBooks();
    const epub = books.find(b=>b.type==='epub').id;
    const paper = books.find(b=>b.type==='pdf').id;
    await NC.db.patchPrefs(epub,{theme:'sepia',fontSize:120,typo:{font:'serif'}});
    await NC.db.putProgress({id:paper,lastOpened:100,lastPage:1,pct:0});
    await NC.db.putAnnotation({id:'note-v3',bookId:epub,kind:'note',note:'Note avant mise à jour',text:'Citation ancienne'});
    await NC.db.putBookmark({id:'signet-v3',bookId:paper,page:1});
    await NC.db.addReadStat({id:paper+'|2025-12-01',bookId:paper,date:'2025-12-01',seconds:97,pages:2});
    const {blob,manifest} = await NC.backup.exportAll({silent:true});
    const zip = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
    return {epub,paper,zip,manifest};
  })()`);
  activate();
  await run('navigator.serviceWorker.ready.then(reg => reg.update()).then(() => true)');
  await until(() => run('navigator.serviceWorker.ready.then(reg => Boolean(reg.waiting))'));
  assert.equal(await run('typeof NC.readingStats'), 'undefined');
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await delay(700);
  await cdp.send('Page.navigate', { url: url + '?v3' });
  await until(() => run("location.search === '?v3' && typeof NC_DEBUG !== 'undefined' && typeof NC.readingStats === 'object'"));
  assert.equal(await version(), 7);
  const epubId = JSON.stringify(old.epub);
  const pdfId = JSON.stringify(old.paper);
  const archive = `fetch(${JSON.stringify(old.zip)}).then(res => res.blob())`;
  const original = () => run(`(async () => {
    const p=await NC.db.getPrefs(${epubId});
    const [a]=await NC.db.annotationsFor(${epubId});
    return [p.theme,p.fontSize,p.typo.font,a.note,a.text,(await NC.db.getProgress(${pdfId})).lastPage,
      (await NC.db.bookmarksFor(${pdfId})).length,(await NC.db.readStatsFor(${pdfId}))[0].seconds];
  })()`);
  const preserved = ['sepia',120,'serif','Note avant mise à jour','Citation ancienne',1,1,97];
  assert.deepEqual(await original(), preserved);
  const manifest = await cdp.send('Page.getAppManifest');
  const parsed = JSON.parse(manifest.data);
  assert.equal(parsed.scope, './');
  assert.equal(parsed.start_url, './');
  assert.equal(parsed.display, 'standalone');
  assert.equal(parsed.icons.length, 4);
  assert.deepEqual(manifest.errors, []);
  const install = await cdp.send('Page.getInstallabilityErrors');
  console.log(`PWA — erreurs d’installabilité Chromium ${JSON.stringify(install.installabilityErrors)}`);
  assert.deepEqual(install.installabilityErrors, []);
  console.log('OK — mise à jour réelle du service worker, ancienne base v7 et conservation des données.');

  const second = await openTab(cdp, port, url + '?ancien-lecteur');
  try {
    await until(() => second.tab.run("typeof NC_DEBUG !== 'undefined'"));
    assert.equal(await second.tab.run(`NC.reader.open(${pdfId})`), true);
    const staleEpoch = await second.tab.run(`NC.db.getBookForReading(${pdfId}).then(x=>x.epoch)`);
    await run(`${archive}.then(blob => NC.backup.importFile(blob,'replace')).then(() => true)`);
    await second.tab.run(`Promise.all([
      NC.db.putProgress({id:${pdfId},lastOpened:Date.now(),lastPage:2,pct:1},${JSON.stringify(staleEpoch)}),
      NC.db.patchPrefs(${epubId},{theme:'oled'},${JSON.stringify(staleEpoch)}),
      NC.db.putAnnotation({id:'retard',bookId:${epubId},note:'écriture périmée'},${JSON.stringify(staleEpoch)}),
      NC.db.addHistory({id:'retard',bookId:${pdfId},at:Date.now()},150,${JSON.stringify(staleEpoch)})
    ]).then(() => true)`);
    await until(() => second.tab.run('NC.reader._state().current === null'));
    assert.deepEqual(await original(), preserved);
    assert.equal(await run(`NC.db.historyFor(${pdfId}).then(rows=>rows.length)`), 0);
    assert.equal(await run(`NC.db.annotationsFor(${epubId}).then(rows=>rows.length)`), 1);
    assert.equal(await second.tab.run(`NC.reader.open(${pdfId})`), true);
    await second.tab.run('NC.reader._state().ctl.gotoPage(2).then(() => NC.reader.close())');
    assert.equal(await run(`NC.db.getProgress(${pdfId}).then(p=>p.lastPage)`), 2);
  } finally {
    await cdp.send('Target.closeTarget', { targetId: second.targetId });
    second.tab.close();
  }
  console.log('OK — restauration ZIP v1, fermeture du lecteur périmé, écritures tardives neutralisées puis reprise normale.');

  const cases = await run(`(async () => {
    const zip=await JSZip.loadAsync((await NC.db.getBook(${epubId})).data);
    const css = 'http://localhost:${port}/v3-probe?css';
    const img = 'http://localhost:${port}/v3-probe?img';
    const script = 'http://localhost:${port}/v3-probe?script';
    zip.file('page.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Isolement</title><link rel="stylesheet" href="'+css+'"/></head><body><p>Texte local</p><img id="external" src="'+img+'"/><script src="'+script+'"></script><script>parent.__epubScriptRan = true;</script></body></html>');
    const src=await NC.db.getBook(${epubId});
    await NC.db.putBook({...src,id:'v3-csp',data:await zip.generateAsync({type:'arraybuffer'})});
    zip.remove('page.xhtml');
    await NC.db.putBook({...src,id:'v3-absent-chapter',data:await zip.generateAsync({type:'arraybuffer'})});
    zip.remove('book.opf');
    await NC.db.putBook({...src,id:'v3-absent-package',data:await zip.generateAsync({type:'arraybuffer'})});
    return NC.reader.open('v3-csp');
  })()`);
  assert.equal(cases, true);
  const frame = await run(`(() => {
    const f=document.querySelector('#epub-host iframe');
    const image=f.contentDocument.querySelector('#external');
    return { sandbox:f.sandbox.contains('allow-scripts'), ran:!!window.__epubScriptRan,
      externalWidth:image.naturalWidth, text:f.contentDocument.body.textContent.includes('Texte local') };
  })()`);
  assert.deepEqual(frame, { sandbox: false, ran: false, externalWidth: 0, text: true });
  assert.equal(remoteProbes(), 0);
  await run('NC.reader.close()');
  for (const malformed of ['v3-absent-chapter','v3-absent-package']) {
    assert.equal(await run(`NC.reader.open(${JSON.stringify(malformed)})`), undefined);
    assert.equal(await run("document.querySelector('#view-reader').hidden && NC.reader._state().current === null"), true);
  }
  assert.equal(await run(`NC.reader.open(${epubId})`), true);
  assert.equal(await run('NC.reader._state().ctl.fontSize'), 120);
  await run('NC.reader.close()');
  console.log('OK — contenu EPUB isolé, deux fichiers incomplets rejetés et retour à une lecture valide.');
}

export async function testV3Package({ cdp, url, until, makeBooks, entries }) {
  assert.ok(entries.every((name) => /^(?:css\/|js\/|vendor\/|icons\/|packs\/(?:index\.json)?$|(?:index\.html|manifest\.webmanifest|sw\.js|LICENSE|\.nojekyll|GUIDE-NUIT-CALME\.md)$)/.test(name)));
  assert.ok(!entries.some((name) => /\.(?:epub|pdf|zip)$/i.test(name)));
  assert.equal(await cdp.run("fetch('packs/index.json').then(r=>r.json()).then(x=>x.packs.length)"), 0);
  const id = await cdp.run(`(async () => {
    const {epubBlob} = await (${makeBooks})();
    await NC.library.importFiles([new File([epubBlob],'hors-ligne.epub')]);
    const [book] = await NC.db.allBooks();
    return book.id;
  })()`);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp.send('Page.navigate', { url: url + '?publication-hors-ligne' });
  await until(() => cdp.run("location.search === '?publication-hors-ligne' && typeof NC_DEBUG !== 'undefined'"));
  assert.equal(await cdp.run(`NC.reader.open(${JSON.stringify(id)})`), true);
  assert.equal(await cdp.run("NC.reader._state().ctl.type === 'epub' && document.querySelector('#epub-host iframe').contentDocument.body.textContent.includes('phare')"), true);
  assert.deepEqual(await cdp.run('window.__ncErrors'), []);
  console.log('OK — contenu du ZIP public, import local et lecture EPUB hors ligne sous /liseuse/.');
}
