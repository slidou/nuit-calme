/* NUIT CALME — stockage local (IndexedDB). Tout reste sur l'ordinateur. */
'use strict';
window.NC = window.NC || {};

NC.db = (() => {
  const NAME = 'nuit-calme-db';
  const VERSION = 7;
  const BACKUP_STORES = ['books', 'annotations', 'bookmarks', 'history',
    'readstats', 'progress', 'prefs', 'bookmeta', 'groups', 'settings'];
  const BACKUP_TIMESTAMPS = { progress: 'lastOpened', prefs: 'updatedAt', bookmeta: 'updatedAt' };
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      let blocked = false;
      req.onupgradeneeded = () => {
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
      };
      req.onsuccess = () => {
        const db = req.result;
        if (blocked) { db.close(); return; }
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
    }).catch((err) => {
      // Échec d'ouverture : on réinitialise pour que la prochaine demande
      // retente proprement au lieu de rejouer une promesse rejetée.
      dbPromise = null;
      throw err;
    });
    return dbPromise;
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

  return {
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
      const t = db.transaction(BACKUP_STORES, 'readwrite');
      const counts = { booksAdded: 0, booksKept: 0 };
      t.oncomplete = () => resolve(counts);
      t.onabort = () => reject(t.error || new Error('Restauration annulée'));

      function write(store, row, count) {
        try {
          store.put(row);
          if (count) counts[count]++;
        } catch (err) {
          t.abort();
          reject(err);
        }
      }

      try {
        for (const name of BACKUP_STORES) {
          const store = t.objectStore(name);
          const count = name === 'books' ? 'booksAdded' : name;
          const timestamp = BACKUP_TIMESTAMPS[name];
          counts[count] = 0;
          if (replace) store.clear();
          for (const row of state[name]) {
            if (replace) {
              store.put(row);
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
    putBook: (book) => tx('books', 'readwrite', (s) => s.put(book)),
    deleteBook: (id) => tx('books', 'readwrite', (s) => s.delete(id)),
    /* Suppression transactionnelle du livre ET de toutes ses données
       associées (annotations, progression, signets, historique,
       statistiques) : plus aucune donnée orpheline qui s'accumule
       dans la base. */
    deleteBookCascade: (id) => open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(
        ['books', 'annotations', 'progress', 'prefs', 'bookmarks', 'history', 'readstats', 'bookmeta'], 'readwrite');
      t.objectStore('books').delete(id);
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
      t.oncomplete = () => resolve();
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
    putAnnotation: (a) => tx('annotations', 'readwrite', (s) => s.put(a)),
    deleteAnnotation: (id) => tx('annotations', 'readwrite', (s) => s.delete(id)),
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

    /* ── Progression de lecture (un petit enregistrement par livre) ── */
    getProgress: (id) => reqToPromise('progress', 'readonly', (s) => s.get(id)),
    allProgress: () => reqToPromise('progress', 'readonly', (s) => s.getAll()),
    putProgress: (p) => tx('progress', 'readwrite', (s) => s.put(p)),

    /* ── Signets (n°8) : les repères posés par le lecteur, par livre ── */
    bookmarksFor: (bookId) => reqToPromise('bookmarks', 'readonly', (s) =>
        s.indexNames.contains('bookId') ? s.index('bookId').getAll(bookId) : s.getAll())
      .then((all) => (Array.isArray(all) ? all : []).filter((b) => b.bookId === bookId)),
    putBookmark: (b) => tx('bookmarks', 'readwrite', (s) => s.put(b)),
    deleteBookmark: (id) => tx('bookmarks', 'readwrite', (s) => s.delete(id)),

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
    addHistory: (entry, cap) => tx('history', 'readwrite', (s) => s.put(entry))
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
    addReadStat: (sample) => tx('readstats', 'readwrite', (s) => {
      const r = s.get(sample.id);
      r.onsuccess = () => {
        const row = r.result || sample;
        if (r.result) {
          row.seconds = (row.seconds || 0) + sample.seconds;
          row.pages = (row.pages || 0) + sample.pages;
          row.firstAt = Math.min(row.firstAt || sample.firstAt, sample.firstAt);
          row.lastAt = Math.max(row.lastAt || 0, sample.lastAt);
        }
        s.put(row);
      };
    }),
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

    allGroups: () => reqToPromise('groups', 'readonly', (s) => s.getAll()),
    putGroup: (g) => tx('groups', 'readwrite', (s) => s.put(g)),
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
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    })),
  };
})();
