/* Statistiques locales et calculs sur les jours civils. Les anciens cumuls
   restent identifiables à côté des sessions suivies depuis la phase 7. */
'use strict';

NC.readingStats = (() => {
  const sinceKey = 'readingStatsSince';
  const epochKey = 'readingStatsRuntimeEpoch';
  const lockKey = 'nuit-calme-reading-active';
  const positive = (value) => Number.isFinite(value) && value > 0 ? value : 0;
  function civil(key) {
    const [year, month, day] = String(key).split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }
  const validDay = (key) => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && NC.dateKey(civil(key)) === key;
  function shift(key, days) {
    const date = civil(key);
    date.setDate(date.getDate() + days);
    return NC.dateKey(date);
  }
  function period(key, unit) {
    const date = civil(key);
    if (unit === 'week') return shift(key, -((date.getDay() + 6) % 7));
    if (unit === 'month') return key.slice(0, 7) + '-01';
    return key;
  }
  function shiftMonth(key, count) {
    const date = civil(period(key, 'month'));
    date.setMonth(date.getMonth() + count);
    return NC.dateKey(date);
  }

  function split(start, end) {
    const pieces = [];
    while (start < end) {
      const local = new Date(start);
      const next = new Date(local.getFullYear(), local.getMonth(), local.getDate() + 1).getTime();
      const stop = Math.min(next, end);
      pieces.push({ date: NC.dateKey(local), start, end: stop, ms: stop - start });
      start = stop;
    }
    return pieces;
  }

  const partsOf = (row) => Array.isArray(row?.journal?.parts) ? row.journal.parts.filter((part) =>
    typeof part?.id === 'string' && Number.isSafeInteger(part.rev) && Number.isFinite(part.start) && Number.isFinite(part.end)) : [];

  function baseOf(row) {
    // Un ancien exécutable peut avoir ajouté du temps au compteur extérieur.
    const parts = partsOf(row);
    const base = row?.journal;
    const seconds = positive(row?.seconds) - parts.reduce((sum, part) => sum + positive(part.ms) / 1000, 0);
    const pages = positive(row?.pages) - parts.reduce((sum, part) => sum + positive(part.pages), 0);
    return { seconds: Math.max(0, positive(base?.seconds), Number(seconds.toFixed(3))),
      pages: Math.max(0, positive(base?.pages), pages) };
  }

  function withParts(row, base, parts) {
    return { ...row, seconds: Number((base.seconds + parts.reduce((sum, part) => sum + positive(part.ms) / 1000, 0)).toFixed(3)),
      pages: base.pages + parts.reduce((sum, part) => sum + positive(part.pages), 0),
      journal: { ...base, parts } };
  }

  function append(row, sample) {
    const { id, bookId, date, part } = sample;
    const parts = partsOf(row);
    const index = parts.findIndex((previous) => previous.id === part.id);
    if (index >= 0 && parts[index].rev >= part.rev) return row;
    if (index >= 0) parts[index] = part;
    else parts.push(part);
    return withParts({ ...row, id, bookId, date,
      firstAt: Math.min(positive(row?.firstAt) || part.start, part.start), lastAt: Math.max(positive(row?.lastAt), part.end) },
    baseOf(row), parts);
  }

  function merge(local, imported) {
    if (!local.journal && !imported.journal) return local; // règle ZIP v1 historique
    const baseA = baseOf(local);
    const baseB = baseOf(imported);
    const parts = new Map(partsOf(local).map((part) => [part.id, part]));
    for (const part of partsOf(imported)) {
      if (!parts.has(part.id) || parts.get(part.id).rev < part.rev) parts.set(part.id, part);
    }
    const timestamps = [local.firstAt, imported.firstAt].filter((at) => positive(at));
    return withParts({ ...imported, ...local,
      firstAt: timestamps.length ? Math.min(...timestamps) : undefined,
      lastAt: Math.max(positive(local.lastAt), positive(imported.lastAt)) },
    { seconds: Math.max(baseA.seconds, baseB.seconds), pages: Math.max(baseA.pages, baseB.pages) }, [...parts.values()]);
  }

  function summarize(rows, today) {
    const days = new Map();
    const books = new Map();
    const sessions = new Map();
    const unique = new Set();
    for (const row of rows) {
      if (!validDay(row.date) || unique.has(row.id)) continue;
      unique.add(row.id);
      const day = days.get(row.date) || { date: row.date, seconds: 0, pages: 0, sessions: 0 };
      const book = books.get(row.bookId) || { seconds: 0, pages: 0, lastAt: 0 };
      day.seconds += positive(row.seconds);
      day.pages += positive(row.pages);
      book.seconds += positive(row.seconds);
      book.pages += positive(row.pages);
      if (positive(row.seconds) || positive(row.pages)) book.lastAt = Math.max(book.lastAt, positive(row.lastAt));
      for (const part of partsOf(row)) {
        if (!positive(part.ms)) continue;
        const key = JSON.stringify([row.bookId, row.date, part.id]);
        if (sessions.has(key)) continue;
        day.sessions++;
        sessions.set(key, { ...part, date: row.date, bookId: row.bookId });
      }
      days.set(row.date, day);
      books.set(row.bookId, book);
    }
    const dates = [...days.keys()].sort();
    return { days, books, sessions: [...sessions.values()].sort((a, b) => b.end - a.end),
      dates, earliest: dates[0], total: range(days), today };
  }

  function range(days, from = '', through = '\uffff') {
    const result = { seconds: 0, pages: 0, days: 0, sessions: 0 };
    for (const day of days.values()) {
      if (day.date < from || day.date > through) continue;
      result.seconds += day.seconds;
      result.pages += day.pages;
      result.sessions += day.sessions;
      if (day.seconds > 0 || day.pages > 0) result.days++;
    }
    return result;
  }

  function stateFor(day, date, since, today) {
    if (day?.seconds > 0) return 'active';
    if (day) return 'zero';
    if (date > today) return 'future';
    return validDay(since) && date >= since ? 'none' : 'unknown';
  }

  function trend(model, unit, end = model.today) {
    const count = unit === 'day' ? 14 : unit === 'week' ? 8 : 12;
    const step = (key, n) => unit === 'month' ? shiftMonth(key, n) : shift(key, n * (unit === 'week' ? 7 : 1));
    const last = period(end, unit);
    return Array.from({ length: count }, (_, index) => {
      const start = step(last, index + 1 - count);
      const stop = shift(step(start, 1), -1);
      const end = stop > model.today ? model.today : stop;
      let known = false;
      let complete = true;
      for (let key = start; key <= end; key = shift(key, 1)) {
        const covered = model.days.has(key) || (model.since && key >= model.since);
        if (covered) known = true;
        else complete = false;
      }
      return { start, end, ...range(model.days, start, end), known, complete };
    });
  }

  return { sinceKey, epochKey, lockKey, positive, civil, validDay, shift, period, shiftMonth, split,
    append, merge, summarize, range, stateFor, trend };
})();
