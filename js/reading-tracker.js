'use strict';

NC.readingTracker = (() => {
  const tickMs = 5000;
  const flushMs = 30000;
  const maxGap = 12500;
  const defaultIdle = 180000;
  const clock = () => ({ wall: Date.now(), mono: performance.now(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone });

  function counter({ changed, makeId = () => crypto.randomUUID(), idle = defaultIdle }) {
    let cursor;
    let activity = 0;
    let session;

    function add(slice, pages = 0) {
      if (!session || session.date !== slice.date) {
        session = { id: makeId(), date: slice.date, start: slice.start, end: slice.end, ms: 0, pages: 0, rev: 0 };
      }
      session.ms += slice.ms;
      session.pages += pages;
      session.end = slice.end;
      session.rev++;
      changed({ ...session });
    }

    function stop() { cursor = undefined; session = undefined; }

    function tick(stamp) {
      if (!cursor) return false;
      const elapsed = stamp.wall - cursor.wall;
      const monotonic = stamp.mono - cursor.mono;
      if (elapsed < 0 || monotonic < 0 || elapsed > maxGap || monotonic > maxGap ||
          Math.abs(elapsed - monotonic) > 2000 || cursor.zone !== stamp.zone) {
        stop();
        return false;
      }
      const until = Math.min(stamp.wall, activity + idle);
      for (const slice of NC.readingStats.split(cursor.wall, until)) add(slice);
      if (stamp.wall >= activity + idle) { stop(); return false; }
      cursor = stamp;
      return true;
    }

    function interact(stamp) {
      tick(stamp);
      activity = stamp.wall;
      cursor = stamp;
    }

    function observe(stamp, pages) {
      if (!tick(stamp)) return;
      add({ date: NC.dateKey(stamp.wall), start: stamp.wall, end: stamp.wall, ms: 0 }, pages);
    }

    return { interact, tick, observe, stop, setIdle: (value) => { idle = value; } };
  }

  function create() {
    const pending = new Map();
    let context;
    let owner;
    let claiming = false;
    let retryId;
    let timer;
    let inFlight = Promise.resolve();
    let lastFlush = performance.now();
    let warned = false;
    let pageKey = '';
    let idle = defaultIdle;
    let requestedAt = 0;
    let queuedPages = 0;
    let wantLock = false;
    const engine = counter({ changed(part) {
      if (!context) return;
      const sample = { id: `${context.bookId}|${part.date}`, bookId: context.bookId, date: part.date, part, context };
      pending.set(part.id, sample);
    } });
    const eligible = () => !!context && !document.hidden && document.hasFocus();

    function flush() {
      lastFlush = performance.now();
      inFlight = inFlight.then(async () => {
        const batch = [...pending.values()];
        if (!batch.length) return;
        try {
          await NC.db.commitReadingStats(batch);
          for (const sample of batch) if (pending.get(sample.part.id) === sample) pending.delete(sample.part.id);
        } catch (error) {
          if (!warned) NC.toast('L’activité de lecture n’a pas pu être enregistrée. Une nouvelle tentative sera effectuée.', 'error');
          warned = true;
        }
      });
      return inFlight;
    }

    function pause(sample = true) {
      wantLock = false;
      clearTimeout(retryId);
      queuedPages = 0;
      // Un événement de visibilité marque la frontière juste écoulée.
      if (owner && sample) engine.tick(clock());
      engine.stop();
      owner?.release();
      owner = null;
      return flush();
    }

    function tick() {
      if (owner && (!eligible() || !engine.tick(clock()))) pause(false);
      if (performance.now() - lastFlush >= flushMs) flush();
    }

    async function claim() {
      if (owner || claiming || !eligible() || !wantLock || Date.now() - requestedAt > 1800) return;
      if (!navigator.locks) {
        if (!warned) NC.toast('Le suivi actif requiert la coordination des onglets de ce navigateur.', 'info');
        warned = true;
        return;
      }
      const requested = context;
      claiming = true;
      try {
        await requested.ready;
        if (requested !== context || !eligible() || !wantLock) return;
        await navigator.locks.request(NC.readingStats.lockKey, { ifAvailable: true }, (lock) => {
          claiming = false;
          if (requested !== context || !eligible() || !wantLock || Date.now() - requestedAt > 1800) return;
          if (!lock) {
            retryId = setTimeout(claim, 150);
            return;
          }
          engine.interact(clock());
          if (queuedPages) engine.observe(clock(), queuedPages);
          queuedPages = 0;
          return new Promise((release) => { owner = { release }; });
        });
      } catch (error) {
        if (!warned) NC.toast('Le suivi de cette lecture est momentanément indisponible.', 'error');
        warned = true;
      } finally { claiming = false; }
    }

    function interact() {
      if (!eligible()) return;
      requestedAt = Date.now();
      wantLock = true;
      if (owner) engine.interact(clock());
      else claim();
    }

    function position(key, pages, count) {
      if (!context || !key || pageKey === key) return;
      pageKey = key;
      if (!count || !eligible()) return;
      if (owner) engine.observe(clock(), pages);
      else if (wantLock && Date.now() - requestedAt <= 1800) queuedPages += pages;
    }

    function start(bookId, readerEpoch) {
      const next = { bookId, epoch: undefined };
      context = next;
      pageKey = '';
      next.ready = navigator.locks ? NC.db.prepareReadingStats(NC.todayKey()).then((epoch) => {
        if (readerEpoch !== undefined && readerEpoch !== epoch) { if (context === next) stop(); return; }
        next.epoch = epoch;
      }) : Promise.resolve();
      next.ready.catch(() => {});
      if (!timer) timer = setInterval(tick, tickMs);
    }

    async function stop() {
      const saved = pause();
      context = null;
      pageKey = '';
      clearInterval(timer);
      timer = null;
      await saved;
    }

    return { start, stop, pause, interact, position, flush, tick, state: () => ({ book: context?.bookId ?? null,
      owned: !!owner, key: pageKey, pendingSec: [...pending.values()].reduce((n, row) => n + row.part.ms / 1000, 0),
      pendingPages: [...pending.values()].reduce((n, row) => n + row.part.pages, 0) }),
    setIdle(value) { if (value > 0) { idle = value; engine.setIdle(idle); } } };
  }

  return { counter, create };
})();
