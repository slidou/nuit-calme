/* NUIT CALME — stockage local (IndexedDB). Tout reste sur l'ordinateur. */
'use strict';
window.NC = window.NC || {};

NC.db = (() => {
  const NAME = 'nuit-calme-db';
  const LEGACY_VERSION = 7;
  const CATALOG_VERSION = 8;
  // L’activation sur une bibliothèque existante est une décision de mise en production.
  const ENABLE_V8_UPGRADE = false;
  const CARDS = 'bookcards';
  const CATALOG_STATE = 'catalogstate';
  const BUILD = 'build';
  const CATALOG_BATCH_SIZE = 16;
  const BACKUP_STORES = ['books', 'annotations', 'bookmarks', 'history',
    'readstats', 'progress', 'prefs', 'bookmeta', 'groups', 'settings'];
  const BACKUP_TIMESTAMPS = { progress: 'lastOpened', prefs: 'updatedAt', bookmeta: 'updatedAt' };
  const catalogChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(NAME) : null;
  const catalogChanged = () => catalogChannel?.postMessage('catalog');
  let dbPromise = null;
  let catalogBuild = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = openVersion(ENABLE_V8_UPGRADE ? CATALOG_VERSION : LEGACY_VERSION)
      .catch((error) => {
        // Le code de repli sait ouvrir une base déjà migrée vers v8.
        if (!ENABLE_V8_UPGRADE && error.name === 'VersionError') return openVersion();
        if (ENABLE_V8_UPGRADE && ['AbortError', 'QuotaExceededError'].includes(error.name)) {
          console.warn('Création du catalogue différée, ouverture en v7', error);
          return openVersion(LEGACY_VERSION);
        }
        throw error;
      }).catch((error) => {
        dbPromise = null;
        throw error;
      });
    return dbPromise;
  }

  function openVersion(version) {
    return new Promise((resolve, reject) => {
      const req = version === undefined ? indexedDB.open(NAME) : indexedDB.open(NAME, version);
      let blocked = false;
      req.onupgradeneeded = ({ oldVersion }) => {
        if (blocked || version === undefined) {
          req.transaction.abort();
          return;
        }
        const db = req.result;
        if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('annotations')) db.createObjectStore('annotations', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
        // v2 : progression légère (évite de réécrire le fichier entier à chaque page)
        if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'id' });
        // v3 : index bookId sur annotations (listes et purge par livre efficaces)
        const ann = req.transaction && req.transaction.objectStore('annotations');
        if (ann && !ann.indexNames.contains('bookId')) {
          ann.createIndex('bookId', 'bookId', { unique: false });
        }
        // v4 : préférences de lecture par livre (thème, typographie…) —
        // source unique, séparée des livres et de la progression.
        if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs', { keyPath: 'id' });
        // v5 : signets posés par le lecteur (n°8) — un repère par endroit,
        // retrouvés dans le tiroir Sommaire.
        if (!db.objectStoreNames.contains('bookmarks')) {
          db.createObjectStore('bookmarks', { keyPath: 'id' })
            .createIndex('bookId', 'bookId', { unique: false });
        }
        // v5 : historique des passages (n°9) — les endroits où la lecture
        // s'est posée, inscrits automatiquement, bornés par livre.
        if (!db.objectStoreNames.contains('history')) {
          db.createObjectStore('history', { keyPath: 'id' })
            .createIndex('bookId', 'bookId', { unique: false });
        }
        // v6 : statistiques de lecture — UN agrégat par livre et par jour
        // (temps actif + pages), mis à jour par additions successives.
        // Volontairement compact : quelques dizaines d'octets par jour de
        // lecture, jamais de journal qui grossit.
        if (!db.objectStoreNames.contains('readstats')) {
          db.createObjectStore('readstats', { keyPath: 'id' })
            .createIndex('bookId', 'bookId', { unique: false });
        }
        // v7 (V2.14) : rangement de la bibliothèque — les groupes créés par
        // le lecteur et la fiche légère de chaque livre (statut de lecture,
        // groupe). Séparés des livres : changer un statut ne réécrit jamais
        // le fichier du livre (même philosophie que « progress »).
        if (!db.objectStoreNames.contains('groups')) {
          db.createObjectStore('groups', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('bookmeta')) {
          db.createObjectStore('bookmeta', { keyPath: 'id' });
        }
        if (db.version === CATALOG_VERSION) {
          db.createObjectStore(CARDS, { keyPath: 'id' });
          const state = db.createObjectStore(CATALOG_STATE);
          if (oldVersion === 0) state.put({ done: true }, BUILD);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        if (blocked) { db.close(); return; }
        if (db.version !== LEGACY_VERSION && db.version !== CATALOG_VERSION) {
          db.close();
          reject(new Error('Version IndexedDB inconnue'));
          return;
        }
        // Un autre onglet demande une montée de version : on libère la
        // connexion au lieu de bloquer indéfiniment sa mise à niveau.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => { dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => {
        blocked = true;
        reject(new Error('IndexedDB bloqué par un autre onglet'));
      };
    });
  }

  /* Les deux briques attrapent l'exception SYNCHRONE de fn(s) (V2.26) :
     un put avec clé invalide jette un DataError avant tout événement —
     sans ce filet, la promesse ne se résout jamais et l'await appelant
     reste suspendu en silence (interface figée, aucune erreur en console). */
  function tx(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      try { out = fn(s); }
      catch (e) { t.abort(); reject(e); return; }
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  function reqToPromise(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      let r;
      try { r = fn(t.objectStore(store)); }
      catch (e) { reject(e); return; }
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  }

  function update(name, id, change, bookId) {
    const stores = bookId === undefined ? [name] : ['books', name];
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(stores, 'readwrite');
      const store = t.objectStore(name);
      let result;
      let failure;
      t.oncomplete = () => resolve(result);
      t.onabort = () => reject(failure || t.error || new Error('Écriture annulée'));
      function read() {
        const request = store.get(id);
        request.onsuccess = () => {
          try {
            result = change(request.result);
            if (result && result !== request.result) store.put(result);
          } catch (error) {
            failure = error;
            t.abort();
          }
        };
      }
      if (bookId === undefined) read();
      else {
        const exists = t.objectStore('books').getKey(bookId);
        exists.onsuccess = () => { if (exists.result !== undefined) read(); };
      }
    }));
  }

  function saveForBook(name, rows, bookId, matchesExisting) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(['books', name], 'readwrite');
      const exists = t.objectStore('books').getKey(bookId);
      let failure;
      let saved;
      t.oncomplete = () => resolve(saved);
      t.onabort = () => reject(failure || t.error || new Error('Écriture annulée'));
      function write(work) {
        try {
          work();
        } catch (error) {
          failure = error;
          t.abort();
        }
      }
      const store = t.objectStore(name);
      exists.onsuccess = () => write(() => {
        if (exists.result === undefined) throw new Error('Livre introuvable');
        if (!matchesExisting) {
          for (const row of rows) store.put(row);
          return;
        }
        const request = store.index('bookId').getAll(bookId);
        request.onsuccess = () => write(() => {
          saved = request.result.find(matchesExisting);
          if (!saved) {
            saved = rows[0];
            store.put(saved);
          }
        });
      });
    }));
  }

  function notifyCatalog(promise) {
    return promise.then((result) => {
      catalogChanged();
      return result;
    });
  }

  function notifyReader(promise, bookId) {
    return promise.then((result) => {
      catalogChannel?.postMessage({ bookId });
      return result;
    });
  }

  const hasCatalog = (db) => db.objectStoreNames.contains(CARDS);
  const withCards = (db, stores) => hasCatalog(db) ? [...stores, CARDS] : stores;
  const cardOf = ({ id, title, author, type, cover, size, addedAt, lastOpened }) =>
    ({ id, title, author, type, cover, size, addedAt, lastOpened });

  function putBookRow(transaction, book) {
    transaction.objectStore('books').put(book);
    if (transaction.objectStoreNames.contains(CARDS)) transaction.objectStore(CARDS).put(cardOf(book));
    return book.id;
  }

  function deleteBookRow(transaction, id) {
    transaction.objectStore('books').delete(id);
    if (transaction.objectStoreNames.contains(CARDS)) transaction.objectStore(CARDS).delete(id);
  }

  function backfillBatch(db) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['books', CARDS, CATALOG_STATE], 'readwrite');
      const books = transaction.objectStore('books');
      const cards = transaction.objectStore(CARDS);
      const state = transaction.objectStore(CATALOG_STATE);
      let done = false;
      let failure;
      transaction.oncomplete = () => resolve(done);
      transaction.onabort = () => reject(failure || transaction.error || new Error('Lot de catalogue annulé'));
      function abort(error) {
        failure = error;
        transaction.abort();
      }
      const checkpoint = state.get(BUILD);
      checkpoint.onsuccess = () => {
        if (checkpoint.result?.done) { done = true; return; }
        const after = checkpoint.result?.after;
        const range = after === undefined ? undefined : IDBKeyRange.lowerBound(after, true);
        const request = books.getAll(range, CATALOG_BATCH_SIZE);
        request.onsuccess = () => {
          try {
            const rows = request.result;
            for (const book of rows) cards.put(cardOf(book));
            if (rows.length === CATALOG_BATCH_SIZE) {
              state.put({ after: rows[rows.length - 1].id }, BUILD);
              return;
            }
            const bookCount = books.count();
            const cardCount = cards.count();
            cardCount.onsuccess = () => {
              if (bookCount.result !== cardCount.result) {
                abort(new Error('Le catalogue ne couvre pas tous les livres'));
                return;
              }
              try {
                state.put({ done: true }, BUILD);
                done = true;
              } catch (error) {
                abort(error);
              }
            };
          } catch (error) {
            abort(error);
          }
        };
      };
    });
  }

  function resumeCatalogBuild(db) {
    if (catalogBuild) return;
    catalogBuild = (async () => {
      for (;;) {
        // Rend la main entre les lots et laisse passer les autres transactions.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (await backfillBatch(db)) return;
      }
    })().catch((error) => {
      console.warn('Construction du catalogue interrompue, lecture historique disponible', error);
    }).finally(() => { catalogBuild = null; });
  }

  function readCatalog(db) {
    return new Promise((resolve, reject) => {
      const related = ['progress', 'groups', 'bookmeta'];
      const version8 = hasCatalog(db);
      const stores = ['books', ...related];
      if (version8) stores.push(CARDS, CATALOG_STATE);
      const transaction = db.transaction(stores, 'readonly');
      const result = { books: [] };
      let buildNeeded = false;
      transaction.oncomplete = () => {
        resolve(result);
        if (buildNeeded) resumeCatalogBuild(db);
      };
      transaction.onabort = () => reject(transaction.error || new Error('Lecture du catalogue annulée'));
      for (const name of related) {
        const request = transaction.objectStore(name).getAll();
        request.onsuccess = () => { result[name] = request.result; };
      }
      function scanBooks(range) {
        const request = transaction.objectStore('books').getAll(range, CATALOG_BATCH_SIZE);
        request.onsuccess = () => {
          const rows = request.result;
          for (const book of rows) result.books.push(cardOf(book));
          if (rows.length === CATALOG_BATCH_SIZE) scanBooks(IDBKeyRange.lowerBound(rows[rows.length - 1].id, true));
        };
      }
      if (!version8) { scanBooks(); return; }
      const state = transaction.objectStore(CATALOG_STATE).get(BUILD);
      state.onsuccess = () => {
        if (state.result?.done) {
          const cards = transaction.objectStore(CARDS).getAll();
          cards.onsuccess = () => { result.books = cards.result; };
        } else {
          buildNeeded = true;
          scanBooks();
        }
      };
    });
  }

  function writeBooks(write) {
    return open().then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(withCards(db, ['books']), 'readwrite');
      let result;
      let failure;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure || transaction.error || new Error('Écriture du livre annulée'));
      function apply(operation) {
        try { result = operation(); }
        catch (error) { failure = error; transaction.abort(); }
      }
      apply(() => write(transaction, apply));
    }));
  }

  return {
    onCatalogChange: (listener) => catalogChannel?.addEventListener('message', (event) => {
      if (event.data === 'catalog') listener();
    }),
    onReaderChange: (listener) => catalogChannel?.addEventListener('message', (event) => {
      if (event.data?.bookId !== undefined) listener(event.data.bookId);
    }),
    catalogSnapshot: () => open().then(readCatalog),
    backupSnapshot: () => open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(BACKUP_STORES, 'readonly');
      const state = {};
      t.oncomplete = () => resolve(state);
      t.onabort = () => reject(t.error);
      for (const name of BACKUP_STORES) {
        const request = t.objectStore(name).getAll();
        request.onsuccess = () => { state[name] = request.result; };
      }
    })),
    restoreBackup: (state, replace) => open().then((db) => new Promise((resolve, reject) => {
      const stores = withCards(db, BACKUP_STORES);
      const resetCatalog = replace && hasCatalog(db);
      if (resetCatalog) stores.push(CATALOG_STATE);
      const t = db.transaction(stores, 'readwrite');
      const counts = { booksAdded: 0, booksKept: 0 };
      t.oncomplete = () => { catalogChanged(); resolve(counts); };
      t.onabort = () => reject(t.error || new Error('Restauration annulée'));

      function write(store, row, count) {
        try {
          if (store.name === 'books') putBookRow(t, row);
          else store.put(row);
          if (count) counts[count]++;
        } catch (err) {
          t.abort();
          reject(err);
        }
      }

      try {
        if (resetCatalog) {
          t.objectStore(CARDS).clear();
          t.objectStore(CATALOG_STATE).put({ done: true }, BUILD);
        }
        for (const name of BACKUP_STORES) {
          const store = t.objectStore(name);
          const count = name === 'books' ? 'booksAdded' : name;
          const timestamp = BACKUP_TIMESTAMPS[name];
          counts[count] = 0;
          if (replace) store.clear();
          for (const row of state[name]) {
            if (replace) {
              if (name === 'books') putBookRow(t, row);
              else store.put(row);
              counts[count]++;
              continue;
            }
            const request = store.get(row[store.keyPath]);
            request.onsuccess = () => {
              const local = request.result;
              if (!local || (timestamp && (row[timestamp] || 0) > (local[timestamp] || 0))) {
                write(store, row, count);
              } else if (name === 'books') {
                counts.booksKept++;
                if (!local.cover && row.cover) write(store, { ...local, cover: row.cover });
              }
            };
          }
        }
      } catch (err) {
        t.abort();
        reject(err);
      }
    })),
    countBooks: () => reqToPromise('books', 'readonly', (s) => s.count()),
    allBooks: () => reqToPromise('books', 'readonly', (s) => s.getAll()),
    getBook: (id) => reqToPromise('books', 'readonly', (s) => s.get(id)),
    putBook: (book) => notifyCatalog(writeBooks((t) => putBookRow(t, book))),
    patchBook: (id, fields) => notifyCatalog(writeBooks((t, apply) => {
      const request = t.objectStore('books').get(id);
      request.onsuccess = () => apply(() => {
        if (!request.result) return;
        const book = { ...request.result, ...fields, id };
        putBookRow(t, book);
        return book;
      });
    })),
    deleteBook: (id) => notifyCatalog(writeBooks((t) => deleteBookRow(t, id))),
    /* Suppression transactionnelle du livre ET de toutes ses données
       associées (annotations, progression, signets, historique,
       statistiques) : plus aucune donnée orpheline qui s'accumule
       dans la base. */
    deleteBookCascade: (id) => open().then((db) => new Promise((resolve, reject) => {
      const stores = ['books', 'annotations', 'progress', 'prefs', 'bookmarks', 'history', 'readstats', 'bookmeta'];
      const t = db.transaction(withCards(db, stores), 'readwrite');
      deleteBookRow(t, id);
      t.objectStore('progress').delete(id);
      t.objectStore('prefs').delete(id);
      t.objectStore('bookmeta').delete(id); // statut & groupe du livre (v7)
      const cur = t.objectStore('annotations').index('bookId')
        .openCursor(IDBKeyRange.only(id));
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) { c.delete(); c.continue(); }
      };
      const curb = t.objectStore('bookmarks').index('bookId')
        .openCursor(IDBKeyRange.only(id));
      curb.onsuccess = () => {
        const c = curb.result;
        if (c) { c.delete(); c.continue(); }
      };
      const curh = t.objectStore('history').index('bookId')
        .openCursor(IDBKeyRange.only(id));
      curh.onsuccess = () => {
        const c = curh.result;
        if (c) { c.delete(); c.continue(); }
      };
      const curs = t.objectStore('readstats').index('bookId')
        .openCursor(IDBKeyRange.only(id));
      curs.onsuccess = () => {
        const c = curs.result;
        if (c) { c.delete(); c.continue(); }
      };
      t.oncomplete = () => {
        catalogChanged();
        catalogChannel?.postMessage({ bookId: id });
        resolve();
      };
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    })),

    /* Index bookId si disponible (v3), sinon filtre mémoire (robustesse).
       Même contrat pour les signets et l'historique (v5). */
    annotationsFor: (bookId) => reqToPromise('annotations', 'readonly', (s) =>
        s.indexNames.contains('bookId') ? s.index('bookId').getAll(bookId) : s.getAll())
      .then((all) => (Array.isArray(all) ? all : [])
        .filter((a) => a.bookId === bookId)
        .sort((a, b) => a.createdAt - b.createdAt)),
    putAnnotation: (a) => notifyReader(saveForBook('annotations', [a], a.bookId), a.bookId),
    putAnnotations: (bookId, rows) => notifyReader(saveForBook('annotations', rows, bookId), bookId),
    patchAnnotation: (id, fields, bookId) => notifyReader(
      update('annotations', id, (row) => row && { ...row, ...fields }), bookId),
    deleteAnnotation: (id, bookId) => notifyReader(tx('annotations', 'readwrite', (s) => s.delete(id)), bookId),
    /* Lectures complètes pour la sauvegarde (V2.25) : l'export et la
       restauration parcourent chaque magasin sans se soucier du livre. */
    allAnnotations: () => reqToPromise('annotations', 'readonly', (s) => s.getAll()),
    allBookmarks: () => reqToPromise('bookmarks', 'readonly', (s) => s.getAll()),
    allHistory: () => reqToPromise('history', 'readonly', (s) => s.getAll()),
    allSettings: () => reqToPromise('settings', 'readonly', (s) => s.getAll()),

    getSetting: (key, fallback) => reqToPromise('settings', 'readonly', (s) => s.get(key))
      .then((row) => (row && row.value !== undefined) ? row.value : fallback),
    putSetting: (key, value) => tx('settings', 'readwrite', (s) => s.put({ key, value })),

    /* ── Préférences de lecture, par livre (module centralisé) ──
       Un enregistrement par livre : { id, theme, fontSize?, updatedAt }.
       C'est LA source des réglages de confort — la progression (position)
       reste dans « progress », le fichier dans « books ». */
    getPrefs: (bookId) => reqToPromise('prefs', 'readonly', (s) => s.get(bookId)),
    allPrefs: () => reqToPromise('prefs', 'readonly', (s) => s.getAll()),
    putPrefs: (p) => tx('prefs', 'readwrite', (s) => s.put(p)),
    patchPrefs: (id, fields) => update('prefs', id, (row) => {
      const next = { ...row, ...fields, id, updatedAt: Date.now() };
      if (fields.typo) next.typo = { ...row?.typo, ...fields.typo };
      return next;
    }, id),

    /* ── Progression de lecture (un petit enregistrement par livre) ── */
    getProgress: (id) => reqToPromise('progress', 'readonly', (s) => s.get(id)),
    allProgress: () => reqToPromise('progress', 'readonly', (s) => s.getAll()),
    putProgress: (p) => update('progress', p.id, (row) =>
      row && (row.lastOpened || 0) > p.lastOpened ? row : p, p.id),

    /* ── Signets (n°8) : les repères posés par le lecteur, par livre ── */
    bookmarksFor: (bookId) => reqToPromise('bookmarks', 'readonly', (s) =>
        s.indexNames.contains('bookId') ? s.index('bookId').getAll(bookId) : s.getAll())
      .then((all) => (Array.isArray(all) ? all : []).filter((b) => b.bookId === bookId)),
    putBookmark: (b) => notifyReader(saveForBook('bookmarks', [b], b.bookId, (row) =>
      b.page ? row.page === b.page :
        typeof b.sectionIndex === 'number' && row.sectionIndex === b.sectionIndex &&
        (b.pageInSec == null || row.pageInSec == null || row.pageInSec === b.pageInSec)), b.bookId),
    deleteBookmark: (id, bookId) => notifyReader(tx('bookmarks', 'readwrite', (s) => s.delete(id)), bookId),

    /* ── Historique des passages (n°9) ──
       addHistory écrit puis borne le journal du livre aux « cap »
       passages les plus récents : le plus ancien sort quand le plein
       est atteint, le journal ne grossit jamais sans fin. */
    putHistory: (h) => tx('history', 'readwrite', (s) => s.put(h)),
    historyFor: (bookId) => reqToPromise('history', 'readonly', (s) =>
        s.indexNames.contains('bookId') ? s.index('bookId').getAll(bookId) : s.getAll())
      .then((all) => (Array.isArray(all) ? all : [])
        .filter((h) => h.bookId === bookId)
        .sort((a, b) => b.at - a.at)),
    addHistory: (entry, cap) => saveForBook('history', [entry], entry.bookId)
      .then(() => reqToPromise('history', 'readonly', (s) =>
          s.indexNames.contains('bookId') ? s.index('bookId').getAll(entry.bookId) : s.getAll()))
      .then((all) => {
        const rows = (Array.isArray(all) ? all : []).filter((h) => h.bookId === entry.bookId)
          .sort((a, b) => a.at - b.at); // du plus ancien au plus récent
        const extra = Math.max(0, rows.length - (cap || 150));
        if (!extra) return;
        return tx('history', 'readwrite', (s) => {
          for (let i = 0; i < extra; i++) s.delete(rows[i].id);
        });
      })
      .catch((e) => console.error('historique', e)),
    clearHistoryFor: (bookId) => open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction('history', 'readwrite');
      const cur = t.objectStore('history').index('bookId')
        .openCursor(IDBKeyRange.only(bookId));
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) { c.delete(); c.continue(); }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    })),

    /* ── Statistiques de lecture (V2.12) ──
       Un enregistrement par livre et par jour :
       { id: 'livre|2026-11-10', bookId, date, seconds, pages, firstAt, lastAt }.
       Le suivi de lecture écrit par additions (get → additionner → put) :
       plusieurs sessions le même jour se cumulent, jamais d'écrasement. */
    addReadStat: (sample) => update('readstats', sample.id, (row) => row ? {
      ...row,
      seconds: (row.seconds || 0) + sample.seconds,
      pages: (row.pages || 0) + sample.pages,
      firstAt: Math.min(row.firstAt || sample.firstAt, sample.firstAt),
      lastAt: Math.max(row.lastAt || 0, sample.lastAt),
    } : sample, sample.bookId),
    readStatsFor: (bookId) => reqToPromise('readstats', 'readonly', (s) =>
        s.indexNames.contains('bookId') ? s.index('bookId').getAll(bookId) : s.getAll())
      .then((all) => (Array.isArray(all) ? all : [])
        .filter((r) => r.bookId === bookId)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))),
    allReadStats: () => reqToPromise('readstats', 'readonly', (s) => s.getAll())
      .then((all) => (Array.isArray(all) ? all : [])),

    /* ── Statut de lecture & groupes (V2.14) ──
       bookmeta : UNE fiche légère par livre — { id, status, groupId,
       updatedAt }. Livre sans fiche = « À lire », sans groupe (repli
       assuré côté bibliothèque). groups : les rayons créés par le
       lecteur — { id, name, order, createdAt }. Un livre est rangé
       dans AU PLUS UN groupe (groupId) ; supprimer un groupe rend
       simplement ses livres à la bibliothèque, rien n'est perdu. */
    getBookMeta: (id) => reqToPromise('bookmeta', 'readonly', (s) => s.get(id)),
    allBookMeta: () => reqToPromise('bookmeta', 'readonly', (s) => s.getAll()),
    putBookMeta: (m) => tx('bookmeta', 'readwrite', (s) => s.put(m)),
    changeBookMeta: (id, fields, { keepFinished = false } = {}) =>
      notifyCatalog(update('bookmeta', id, (row) => {
        const previousStatus = NC.normStatus(row?.status);
        if (keepFinished && previousStatus === 'termine') return row;
        const next = { ...row, ...fields, id, updatedAt: Date.now() };
        if (fields.status && fields.status !== previousStatus) {
          next.statusAt = fields.status === 'termine' ? next.updatedAt : null;
        }
        return next;
      }, id)),

    allGroups: () => reqToPromise('groups', 'readonly', (s) => s.getAll()),
    putGroup: (g) => notifyCatalog(tx('groups', 'readwrite', (s) => s.put(g))),
    renameGroup: (id, name) => notifyCatalog(update('groups', id, (row) => row && { ...row, name })),
    /* Supprimer un groupe rend ses livres : la même transaction retire
       le groupe ET démonte groupId sur les fiches concernées — aucun
       livre orphelin référençant un groupe disparu. */
    deleteGroup: (id) => open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(['groups', 'bookmeta'], 'readwrite');
      t.objectStore('groups').delete(id);
      const cur = t.objectStore('bookmeta').openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) {
          if (c.value && c.value.groupId === id) {
            const v = Object.assign({}, c.value, { groupId: null, updatedAt: Date.now() });
            c.update(v);
          }
          c.continue();
        }
      };
      t.oncomplete = () => { catalogChanged(); resolve(); };
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    })),
  };
})();
