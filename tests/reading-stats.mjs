import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { longEpub } from './reading-profiles.mjs';

export async function testStats({ cdp, port, url, openTab, until, makeBooks }) {
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' });
  const temporal = await cdp.run(`(() => {
    const { split, dateKey } = { ...NC.readingStats, dateKey: NC.dateKey };
    const list = new Map();
    let id = 0;
    const engine = NC.readingTracker.counter({ idle: 12000, makeId: () => String(++id), changed: (part) => list.set(part.id, part) });
    const origin = new Date(2026, 9, 24, 23, 59, 58).getTime();
    const stamp = (ms, zone = 'Europe/Paris', mono = ms) => ({ wall: origin + ms, mono, zone });
    engine.tick(stamp(0));
    const inactive = list.size;
    engine.interact(stamp(0));
    engine.observe(stamp(0), 1);
    engine.tick(stamp(5000));
    engine.tick(stamp(10000));
    engine.tick(stamp(15000));
    engine.interact(stamp(20000));
    engine.tick(stamp(65000)); // suspension
    engine.interact(stamp(70000));
    engine.tick(stamp(75000, 'Asia/Tokyo')); // déplacement du fuseau de la machine
    engine.interact(stamp(80000));
    engine.tick(stamp(85000, 'Europe/Paris', 81000)); // correction de l'horloge
    const dst = [split(+new Date(2026,2,29), +new Date(2026,2,30)), split(+new Date(2026,9,25), +new Date(2026,9,26))].map(a => a[0].ms / 3600000);
    const raw = [...list.values()].map(p => [p.date, p.ms, p.pages]);
    return { inactive, raw, dst, week: NC.readingStats.period('2026-10-25','week'), month: NC.readingStats.period('2026-10-25','month'),
      local: dateKey(Date.parse('2026-06-01T23:00:00Z')) };
  })()`);
  assert.deepEqual(temporal, { inactive: 0, raw: [['2026-10-24', 2000, 1], ['2026-10-25', 10000, 0]], dst: [23, 25],
    week: '2026-10-19', month: '2026-10-01', local: '2026-06-02' });
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Montreal' });
  assert.equal(await cdp.run("NC.dateKey(Date.parse('2026-06-01T23:00:00Z'))"), '2026-06-01');
  assert.equal(await cdp.run("NC.readingStats.shift('2026-11-01', -1)"), '2026-10-31');
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Paris' });
  console.log('OK — horloge contrôlée, inactivité, suspension, horloge corrigée, minuit, jours de 23 h et 25 h, deux fuseaux.');

  const ids = await cdp.run(`(async () => {
    const { pdf } = await (${makeBooks})();
    await NC.library.importFiles([await (${longEpub})('Activité prolongée'),
      new File([pdf], 'activite.pdf', {type:'application/pdf'})]);
    const [epub, paper] = await Promise.all(['epub','pdf'].map(async type => (await NC.db.allBooks()).find(b=>b.type===type)));
    return { epub: epub.id, pdf: paper.id };
  })()`);
  const run = (code) => cdp.run(code.replaceAll('$PDF', JSON.stringify(ids.pdf)).replaceAll('$EPUB', JSON.stringify(ids.epub)));
  const tracking = () => cdp.run('NC.reader._statsState()');
  const flush = () => cdp.run('NC.reader._statsFlush()');
  async function click(selector) {
    const box = await cdp.run(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      node.scrollIntoView({block:'nearest'});
      const {x,y,width,height}=node.getBoundingClientRect();
      return {x:x+width/2,y:y+height/2};
    })()`);
    await cdp.send('Input.dispatchMouseEvent', { ...box, type: 'mousePressed', button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { ...box, type: 'mouseReleased', button: 'left', clickCount: 1 });
  }
  const key = async (key, windowsVirtualKeyCode) => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, windowsVirtualKeyCode });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode });
  };

  await cdp.send('Page.bringToFront');
  await cdp.run(`(() => {
    const wall = +new Date(2026, 10, 16, 14);
    const mono = performance.now();
    window.advance = 0;
    Date.now = () => wall + advance;
    performance.now = () => mono + advance;
  })()`);
  assert.equal(await run("NC.db.putSetting('spread','none').then(() => NC.reader.open($PDF))"), true);
  await cdp.run('advance += 10000');
  await flush();
  assert.equal((await tracking()).owned, false);
  assert.equal((await run('NC.db.readStatsFor($PDF)')).length, 0);
  await cdp.run('NC.reader._statsIdle(8000)');
  await click('#nav-next');
  await until(async () => (await tracking()).owned);
  await until(() => cdp.run('NC.reader._state().ctl.page === 2'));
  await cdp.run('advance += 5000');
  await flush();
  const pdfRows = await run('NC.db.readStatsFor($PDF)');
  assert.equal(pdfRows[0].seconds, 5);
  assert.equal(pdfRows[0].pages, 1);
  assert.equal(pdfRows[0].journal.parts.length, 1);
  await until(() => run("NC.db.getBookMeta($PDF).then(x => x.status === 'termine' && x.finishSource === 'pdf' && x.firstOpenedAt > 0)"));

  const second = await openTab(cdp, port, url + '?activite-second');
  try {
    await second.tab.send('Page.bringToFront');
    await until(() => cdp.run('document.hidden || !document.hasFocus()'));
    await until(async () => !(await tracking()).owned);
    // Une autre instance ne peut créditer pendant qu'un onglet détient le verrou.
    await until(() => second.tab.run('typeof NC_DEBUG !== "undefined"'));
    await second.tab.send('Page.reload');
    await until(() => second.tab.run('typeof NC_DEBUG !== "undefined" && location.search === "?activite-second"'));
    assert.equal(await second.tab.run(`NC.db.readStatsFor(${JSON.stringify(ids.pdf)}).then(rows => rows[0]?.journal.parts[0].ms)`), 5000);
    assert.equal(await second.tab.run(`new Promise(resolve => {
      navigator.locks.request(NC.readingStats.lockKey, lock => {
        resolve(Boolean(lock));
        return new Promise(release => {window.releaseTestLock = release;});
      });
    })`), true);
    await cdp.send('Page.bringToFront');
    await until(() => cdp.run('document.hasFocus() && !document.hidden'));
    await click('#nav-prev');
    await delay(250);
    assert.equal((await tracking()).owned, false);
    await cdp.run('advance += 1900');
    await second.tab.run('releaseTestLock()');
    await flush();
    assert.equal((await run('NC.db.readStatsFor($PDF)'))[0].seconds, 5);
  } finally {
    await cdp.send('Target.closeTarget', { targetId: second.targetId });
    second.tab.close();
  }
  await cdp.send('Page.bringToFront');
  await click('#nav-next');
  await until(async () => (await tracking()).owned);
  await cdp.run('advance += 12000');
  await flush();
  assert.equal((await tracking()).owned, false);
  assert.equal((await run('NC.db.readStatsFor($PDF)'))[0].seconds, 13);
  await cdp.run('NC.reader.close()');

  assert.equal(await run('NC.reader.open($EPUB)'), true);
  await cdp.run("NC.focus(document.querySelector('#stage'))");
  await key('PageDown', 34);
  await until(async () => (await tracking()).owned);
  await until(() => cdp.run('NC.reader._state().ctl.location?.start.displayed.page > 1'));
  await cdp.run('advance += 5000');
  await flush();
  const epubPages = (await run('NC.db.readStatsFor($EPUB)'))[0].pages;
  assert.equal(epubPages, 1);
  await cdp.run('NC.reader.changeFontSize(140)');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(480);
  await cdp.run('NC.reader._state().ctl.layoutSettled()');
  await flush();
  assert.equal((await run('NC.db.readStatsFor($EPUB)'))[0].pages, epubPages);
  await cdp.run('NC.reader.close()');
  assert.equal(await run("NC.library.setBookStatus($EPUB,'alire').then(() => NC.library.setBookStatus($EPUB,'termine')).then(row => row.finishSource)"), 'manual');
  const beforePreview = await run('NC.db.readStatsFor($EPUB)');
  assert.equal(await run("NC.reader.open($EPUB, {target: {sectionIndex:0}})"), true);
  await cdp.run("NC.focus(document.querySelector('#stage'))");
  await key('ArrowDown', 40);
  await cdp.run('advance += 5000');
  await flush();
  assert.equal((await tracking()).book, null);
  await cdp.run('NC.reader.close()');
  assert.deepEqual(await run('NC.db.readStatsFor($EPUB)'), beforePreview);
  await cdp.run("document.querySelector('#notebook-back').click()");
  console.log('OK — lecteur sans geste, activité EPUB/PDF, premier plan, verrou entre onglets, statut, recomposition et consultation Carnet.');

  const expected = await run(`(async () => {
    const today = NC.todayKey();
    const {shift} = NC.readingStats;
    const recent = shift(today,-1);
    const unknown = shift(today,-10);
    const recorded = shift(today,-11);
    const historical = shift(today,-45);
    const old = {...await NC.db.getBook($EPUB), id:'dated-unknown', title:'Fin ancienne non datée'};
    await NC.db.putBook(old);
    await NC.db.putBookMeta({id:old.id, status:'termine', updatedAt:Date.now()});
    localStorage.setItem('nc.reading-goal', JSON.stringify({target:1,start:today,end:today}));
    await NC.library.refresh();
    const goal = NC.goal.summary();
    await NC.db.putSetting(NC.readingStats.sinceKey, shift(today,-3));
    for (const [date,seconds,pages] of [[historical,400,2],[recorded,0,3]]) {
      await NC.db.addReadStat({ id:$EPUB+'|'+date,bookId:$EPUB,date,seconds,pages,firstAt:+NC.readingStats.civil(date),lastAt:+NC.readingStats.civil(date) });
    }
    const model = NC.readingStats.summarize(await NC.db.allReadStats(), today);
    model.since = shift(today,-3);
    const week = NC.readingStats.trend(model,'week');
    const month = NC.readingStats.trend(model,'month');
    const zero = NC.readingStats.stateFor(model.days.get(recorded),recorded,model.since,today);
    const none = NC.readingStats.stateFor(model.days.get(recent),recent,model.since,today);
    const noRecord = NC.readingStats.stateFor(model.days.get(unknown),unknown,model.since,today);
    return {today, recent, unknown, recorded, historical, zero, none, noRecord, weekly:week.length, monthly:month.length,
      weekTotal:week.reduce((n,r)=>n+r.seconds,0), monthlyTotal:month.reduce((n,r)=>n+r.seconds,0), total:model.total.seconds, days:model.total.days,
      goal:[goal.state,goal.done,goal.undated]};
  })()`);
  assert.deepEqual([expected.zero, expected.none, expected.noRecord], ['zero', 'none', 'unknown']);
  assert.deepEqual([expected.weekly, expected.monthly, expected.weekTotal, expected.monthlyTotal, expected.days], [8, 12, expected.total, expected.total, 3]);
  assert.deepEqual(expected.goal, ['depasse', 2, 1]);
  await cdp.run("document.querySelector('#btn-reading-stats').focus(); document.querySelector('#btn-reading-stats').click()");
  await until(() => cdp.run("!!document.querySelector('#stats-pop .stats-calendar-grid button')"));
  assert.equal(await cdp.run("document.activeElement.id"), 'stats-close');
  const activate = (selector) => cdp.run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  assert.equal(await cdp.run("document.querySelector('#stats-pop .stats-calendar-grid [tabindex=\"0\"]').dataset.date"), expected.today);
  await activate(`#stats-pop [data-date="${expected.today}"]`);
  await key('ArrowLeft', 37);
  assert.equal(await cdp.run('document.activeElement.dataset.date'), expected.recent);
  assert.equal(await cdp.run(`document.querySelector('#stats-pop [data-date="${expected.recorded}"]')?.dataset.level`), 'zero');
  assert.equal(await cdp.run(`document.querySelector('#stats-pop [data-date="${expected.unknown}"]')?.dataset.level`), 'unknown');
  assert.equal(await cdp.run(`document.querySelector('#stats-pop [data-date="${expected.recent}"]')?.dataset.level`), 'none');
  await activate('#stats-pop .stats-data summary');
  assert.equal(await cdp.run("document.querySelector('#stats-pop .stats-data[open] table tbody').rows.length"), 14);
  assert.equal(await cdp.run("document.querySelector('#stats-pop .stats-plot').getAttribute('aria-hidden')"), 'true');
  await activate('#stats-pop [aria-label="Mois précédent"]');
  assert.notEqual(await cdp.run("document.querySelector('#stats-pop [aria-pressed=true]').dataset.date.slice(0,7)"), expected.today.slice(0, 7));
  for (const [width, height] of [[320,640], [844,390], [768,1024], [1280,900]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await delay(80);
    assert.equal(await cdp.run(`(() => {
      const node = document.querySelector('#stats-pop');
      const box = node.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.bottom <= (visualViewport?.height || innerHeight) && node.scrollWidth <= node.clientWidth + 1;
    })()`), true, `${width}x${height}`);
  }
  await cdp.run(`(() => {
    const button = [...document.querySelectorAll('#stats-pop button')].find(b => b.textContent === 'Gérer l’objectif');
    button.focus(); button.click();
  })()`);
  assert.equal(await cdp.run("document.activeElement.closest('#goal-pop') !== null"), true);
  await key('Escape', 27);
  assert.equal(await cdp.run("document.activeElement.textContent"), 'Gérer l’objectif');
  await key('Escape', 27);
  assert.equal(await cdp.run('document.activeElement.id'), 'btn-reading-stats');
  console.log('OK — calendrier, trois états des dates, tendances, données accessibles et quatre tailles émulées.');

  const backup = await run(`(async () => {
    const epoch = await NC.db.prepareReadingStats(NC.todayKey());
    const before = await NC.db.backupSnapshot();
    const file = (await NC.backup.exportAll({silent:true})).blob;
    const path = $EPUB+'|'+NC.todayKey();
    const stamp = Date.now();
    const make = (id, rev, ms) => ({id:path,bookId:$EPUB,date:NC.todayKey(),context:{epoch},part:{id,rev,start:stamp,end:stamp+ms,ms,pages:0}});
    const current = make('new-session', 2, 18000);
    await NC.db.commitReadingStats([make('new-session',1,8000),current]);
    await NC.db.commitReadingStats([current]);
    const fork = await JSZip.loadAsync(file);
    const branch = JSON.parse(await fork.file('library.json').async('string'));
    const row = branch.readstats.find(r=>r.id===path);
    Object.assign(row, NC.readingStats.append(NC.readingStats.append(row, make('new-session',1,8000)), make('remote-session',1,11000)));
    fork.file('library.json', JSON.stringify(branch));
    const forked = await fork.generateAsync({type:'blob'});
    await NC.backup.importFile(forked,'merge');
    await NC.backup.importFile(forked,'merge');
    const joined = (await NC.db.readStatsFor($EPUB)).find(r=>r.id===path).journal.parts.filter(p=>p.id.endsWith('-session'));
    await NC.backup.importFile(file,'replace');
    await NC.db.commitReadingStats([current]); // paquet capturé avant le remplacement
    const after = await NC.db.backupSnapshot();
    const restored = JSON.stringify(before.readstats) === JSON.stringify(after.readstats);
    const older = await JSZip.loadAsync(file);
    const library = JSON.parse(await older.file('library.json').async('string'));
    library.settings = library.settings.filter(r=>r.key!==NC.readingStats.sinceKey);
    library.readstats = library.readstats.map(({journal,...row})=>row);
    older.file('library.json',JSON.stringify(library));
    await NC.backup.importFile(await older.generateAsync({type:'blob'}),'replace');
    const legacy = NC.readingStats.summarize(await NC.db.allReadStats(),NC.todayKey());
    const oldTime = legacy.total.seconds;
    const sessions = legacy.sessions.length;
    const currentEpoch = await NC.db.prepareReadingStats(NC.todayKey());
    await NC.db.deleteBookCascade($EPUB);
    await NC.db.commitReadingStats([{...current,context:{epoch:currentEpoch}}]);
    return { joined, restored, oldTime, sessions, remaining:(await NC.db.readStatsFor($EPUB)).length };
  })()`);
  assert.deepEqual(backup.joined.map(({id, ms}) => [id, ms]), [['new-session',18000],['remote-session',11000]]);
  assert.equal(backup.restored, true);
  assert.deepEqual([backup.oldTime, backup.sessions, backup.remaining], [expected.total, 0, 0]);
  assert.deepEqual(await cdp.run('window.__ncErrors'), []);
  console.log('OK — ZIP v1, révision idempotente, invalidation des écritures après restauration, données anciennes et suppression.');
}

export async function benchmarkStats({ cdp, until }) {
  for (const volume of [1000, 5000, 15000]) {
    const data = await cdp.run(`(async () => {
      const volume = ${volume};
      const {shift,civil} = NC.readingStats;
      const today = NC.todayKey();
      const books = Array.from({length:120},(_,i)=>({id:'bench-book-'+i,title:'Livre synthétique '+i,type:'epub',addedAt:0}));
      const dates = Array.from({length:1825},(_,i)=>shift(today,-i));
      const rows = new Map();
      for (let i=0;i<volume;i++) {
        const bookId = books[i%books.length].id;
        const date = dates[i%dates.length];
        const id = bookId+'|'+date;
        const start = +civil(date)+(i%8)*60000;
        const part = {id:'session-'+i,rev:1,start,end:start+90000,ms:90000,pages:1};
        rows.set(id,NC.readingStats.append(rows.get(id),{id,bookId,date,part}));
      }
      const state = {books,readstats:[...rows.values()],settings:[{key:NC.readingStats.sinceKey,value:dates.at(-1)}],
        progress:[],prefs:[],annotations:[],bookmarks:[],history:[],groups:[],bookmeta:[]};
      await NC.db.restoreBackup(state,true);
      await NC.library.refresh();
      const original = IDBObjectStore.prototype.getAll;
      const records = [];
      try {
        IDBObjectStore.prototype.getAll = function (...args) {
          if (this.name === 'books') throw new Error('Les statistiques ont chargé les livres');
          return original.apply(this,args);
        };
        for (let i=0;i<3;i++) {
          const start=performance.now();
          const snapshot=await NC.db.readingStatsSnapshot();
          const loaded=performance.now();
          const model=NC.readingStats.summarize(snapshot.rows,today);
          const computed=performance.now();
          document.querySelector('#btn-reading-stats').click();
          await new Promise((resolve,reject)=>{
            const body=document.querySelector('#stats-pop-body');
            if(!body.hasAttribute('aria-busy')) { resolve(); return; }
            const observer=new MutationObserver(()=>{
              if(!body.hasAttribute('aria-busy')) { observer.disconnect(); resolve(); }
            });
            observer.observe(body,{attributes:true});
          });
          if (!document.querySelector('#stats-pop .stats-calendar-grid')) throw new Error('Tableau de bord absent');
          records.push({load:+(loaded-start).toFixed(1),aggregate:+(computed-loaded).toFixed(1),dashboard:+(performance.now()-computed).toFixed(1),sessions:model.sessions.length,days:model.days.size,rows:rows.size});
          document.querySelector('#stats-close').click();
        }
      } finally { IDBObjectStore.prototype.getAll=original; }
      return records;
    })()`);
    assert.ok(data.every(({ sessions }) => sessions === volume));
    console.log(`VOLUME ${volume} ${JSON.stringify(data)}`);
  }
  await until(() => cdp.run('window.__ncErrors.length === 0'));
}
