/* NUIT CALME — sauvegarde & restauration de la bibliothèque (V2.25,
   auditée et peaufinée en V2.26 : récit des clics muets, rappel
   reposonné après une restauration, fusion des groupes relue une fois).
   Tout vit dans le navigateur (IndexedDB) : une purge des données du
   site, et tout s'envole. Ce module rassemble la bibliothèque entière
   — livres, couvertures, soulignages & notes, signets, passages,
   progression, réglages de lecture, statuts, groupes, statistiques et
   objectif — dans UN fichier daté, et sait tout restituer, en fusion
   (rien n'est effacé) ou en remplacement (la bibliothèque redevient
   exactement celle de la sauvegarde).
   Un rappel discret veille : pied de page à l'état de la dernière
   sauvegarde, invitation douce passés trente jours (renvoyable).
   Le fichier est une archive .zip (JSZip, déjà embarquée) :
   manifest.json + library.json + books/<id>.<ext> — lisible par
   n'importe quel outil zip, mais fait pour rester entre nos mains. */
'use strict';
window.NC = window.NC || {};

NC.backup = (() => {
  const APP = 'nuit-calme';
  const FORMAT = 1;                       // version du format de sauvegarde
  const APP_VERSION = 'V2.27';
  const LS_LAST = 'nc.last-backup';       // { at, books } — dernière exportation (cet appareil)
  const LS_SNOOZE = 'nc.backup-snooze';   // ts — « Plus tard » du rappel
  const OVERDUE_DAYS = 30;                // le rappel se lève passé ce délai
  const SNOOZE_DAYS = 3;                  // …et attend autant après « Plus tard »
  const DAY = 86400000;

  let busy = false;        // un export ou une restauration en vol
  let armedReplace = null; // { file, manifest, timer } — remplacement en attente de confirmation
  let escBound = null;     // gestionnaire Échap le temps que la modale est ouverte

  const $ = (sel) => NC.$(sel);

  /* ══════════════ Rappel : état de la dernière sauvegarde ══════════════ */

  function readLast() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_LAST) || 'null');
      return (raw && Number.isFinite(raw.at)) ? raw : null;
    } catch (e) { return null; }
  }
  function markBackedUp(books) {
    try { localStorage.setItem(LS_LAST, JSON.stringify({ at: Date.now(), books: books || 0 })); }
    catch (e) { /* tant pis — le rappel dira simplement « aucune » */ }
  }
  function snoozed() {
    const t = Number(localStorage.getItem(LS_SNOOZE) || 0);
    return (t && (Date.now() - t) < SNOOZE_DAYS * DAY) ? t : 0;
  }
  function isOverdue(last) {
    return !last || (Date.now() - last.at) > OVERDUE_DAYS * DAY;
  }
  /* « aujourd'hui », « hier », « il y a N jours », puis la date posée. */
  function lastLabel(at) {
    const days = Math.floor((Date.now() - at) / DAY);
    if (days <= 0) return 'aujourd\u2019hui';
    if (days === 1) return 'hier';
    if (days < 14) return `il y a ${days} jours`;
    return NC.fmtDate(at);
  }

  /* Le pied de page raconte l'état ; le bandeau n'aime que l'oubli :
     des livres, aucune sauvegarde récente, et pas de « Plus tard »
     qui tienne encore. Rien de tout cela pendant la restauration. */
  async function refreshNotice() {
    const foot = $('#foot-backup');
    try {
      const last = readLast();
      if (foot) {
        foot.textContent = last
          ? `sauvegarde : ${lastLabel(last.at)}`
          : 'aucune sauvegarde';
        foot.classList.toggle('overdue', isOverdue(last));
        foot.hidden = false;
      }
      const notice = $('#backup-notice');
      if (notice) {
        const books = await NC.db.countBooks().catch(() => 0);
        notice.hidden = !(books > 0 && isOverdue(last) && !snoozed());
      }
    } catch (e) { /* un rappel ne doit jamais faire tomber la page */ }
  }

  /* ══════════════ Instantané de la bibliothèque ══════════════
     La même matière sert à l'export et à la restauration : les
     enregistrements tels quels (leurs horodatages font foi), les
     fichiers des livres à part — ce sont eux qui pèsent. */

  async function buildState(onStep) {
    /* Les livres partent d'une seule lecture de la base : leurs
       fichiers (les `data`) voyagent à part dans l'archive, leurs
       fiches (sans `data`) tiennent dans library.json. */
    const { books: rawBooks, ...stores } = await NC.db.backupSnapshot();
    const metas = [];
    for (let i = 0; i < rawBooks.length; i++) {
      const { data, ...meta } = rawBooks[i];
      metas.push(meta);
      if (onStep && (i % 4 === 0 || i === rawBooks.length - 1)) {
        onStep(`Lecture de la bibliothèque — ${i + 1}/${rawBooks.length}…`);
        await NC.tick();
      }
    }
    let goal = null;
    try { goal = JSON.parse(localStorage.getItem('nc.reading-goal') || 'null'); } catch (e) {}
    return {
      manifest: {
        app: APP, format: FORMAT, appVersion: APP_VERSION,
        createdAt: new Date().toISOString(),
        counts: {
          books: metas.length, annotations: stores.annotations.length,
          bookmarks: stores.bookmarks.length, groups: stores.groups.length,
        },
      },
      data: {
        books: metas,
        ...stores,
        goal: (goal && typeof goal === 'object') ? goal : null,
      },
      rawBooks, // avec les fichiers — ne quitte jamais la mémoire de l'export
    };
  }

  /* ══════════════ Export ══════════════ */

  async function exportAll(opts) {
    const silent = opts && opts.silent;
    const prog = silent ? null : NC.toastHold('Préparation de la sauvegarde…');
    try {
      const state = await buildState((m) => { if (prog) prog.update(m); });
      if (!state.data.books.length && !silent) {
        prog.done('La bibliothèque est vide — il n\u2019y a rien à sauvegarder pour l\u2019instant.');
        return null;
      }
      if (prog) prog.update('Assemblage du fichier…');
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify(state.manifest, null, 2), { compression: 'DEFLATE' });
      zip.file('library.json', JSON.stringify(state.data), { compression: 'DEFLATE' });
      /* Les fichiers des livres : tels quels, sans recompression — un
         EPUB est déjà une archive, un PDF ne se laisse pas dégonfler. */
      for (const b of state.rawBooks) {
        if (!b.data) throw new Error('Fichier de livre absent de la bibliothèque');
        zip.file(`books/${b.id}.${b.type === 'pdf' ? 'pdf' : 'epub'}`, b.data, { compression: 'STORE' });
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const d = new Date();
      const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
        + '-' + String(d.getDate()).padStart(2, '0');
      const filename = `nuit-calme-sauvegarde-${day}.zip`;
      if (silent) return { blob, filename, manifest: state.manifest };
      NC.downloadBlob(blob, filename);
      markBackedUp(state.manifest.counts.books);
      refreshNotice();
      prog.done(`Sauvegarde prête — ${state.manifest.counts.books} livre${state.manifest.counts.books > 1 ? 's' : ''}, soulignages et progression compris (${NC.fmtSize(blob.size)}).`, 'success', 5200);
      return { blob, filename, manifest: state.manifest };
    } catch (err) {
      console.error('Sauvegarde échouée', err);
      if (prog) prog.done('La sauvegarde complète n’a pas pu être créée. Vérifiez que les livres s’ouvrent et réessayez après avoir fermé les autres onglets.', 'error', 8000);
      throw err;
    }
  }

  /* ══════════════ Restauration ══════════════ */

  /* Un coup d'œil au manifeste sans rien écrire : la modale l'affiche
     avant la confirmation du remplacement ; un fichier étranger est
     refusé ici plutôt qu'à mi-chemin. */
  async function peek(file) {
    const zip = await NC.archive.load(file, 'backup');
    const mf = zip.file('manifest.json');
    const lib = zip.file('library.json');
    if (!mf || !lib) throw new Error('incomplet');
    const manifest = JSON.parse(new TextDecoder().decode(await NC.archive.read(mf, 1024 * 1024)));
    if (!manifest || manifest.app !== APP) throw new Error('étranger');
    if (manifest.format !== FORMAT) throw new Error('version incompatible');
    return { manifest, zip };
  }

  const OPTIONAL_STORES = ['annotations', 'bookmarks', 'history', 'readstats',
    'progress', 'prefs', 'bookmeta', 'groups', 'settings'];

  function validateRows(rows, key) {
    if (!Array.isArray(rows)) throw new Error('incomplet');
    const keys = new Set();
    for (const row of rows) {
      const id = row && row[key];
      if (!row || Array.isArray(row) ||
          !((typeof id === 'string' && id.length) || Number.isFinite(id)) ||
          keys.has(id)) throw new Error('incomplet');
      keys.add(id);
    }
  }

  async function importFile(file, mode, onStep) {
    const step = (message) => { if (onStep) onStep(message); };
    if (mode !== 'merge' && mode !== 'replace') throw new Error('Mode de restauration inconnu');
    const { manifest, zip } = await peek(file);
    const data = JSON.parse(new TextDecoder().decode(
      await NC.archive.read(zip.file('library.json'), 256 * 1024 * 1024)));
    if (!data || typeof data !== 'object') throw new Error('incomplet');
    validateRows(data.books, 'id');
    if (manifest.counts && manifest.counts.books !== undefined &&
        manifest.counts.books !== data.books.length) throw new Error('incomplet');

    const state = { books: [] };
    for (const name of OPTIONAL_STORES) {
      const rows = data[name] === undefined ? [] : data[name];
      validateRows(rows, name === 'settings' ? 'key' : 'id');
      state[name] = rows;
    }

    for (const [index, book] of data.books.entries()) {
      if (book.type !== 'pdf' && book.type !== 'epub') throw new Error('incomplet');
      const entry = zip.file(`books/${book.id}.${book.type}`);
      if (!entry) throw new Error('incomplet');
      step(`Vérification des fichiers — ${index + 1}/${data.books.length}…`);
      const { buffer } = await NC.archive.read(entry, NC.archive.maxBook);
      if (!buffer.byteLength || (book.size > 0 && book.size !== buffer.byteLength)) {
        throw new Error('incomplet');
      }
      await NC.archive.validateBook(book.type, buffer);
      state.books.push({ ...book, data: buffer });
    }

    const replace = mode === 'replace';
    step('Enregistrement de la bibliothèque…');
    const recap = await NC.db.restoreBackup(state, replace);
    recap.goal = false;
    try {
      const key = 'nc.reading-goal';
      const goal = data.goal;
      const hasGoal = goal && typeof goal === 'object' && Number.isFinite(goal.target) && goal.target >= 1;
      if (hasGoal && (replace || !JSON.parse(localStorage.getItem(key) || 'null'))) {
        localStorage.setItem(key, JSON.stringify(goal));
        recap.goal = true;
      } else if (replace) {
        localStorage.removeItem(key);
      }
    } catch (err) {
      recap.goalError = true;
      console.warn('Objectif de lecture non restauré', err);
    }

    return { manifest, recap };
  }

  /* Le récit final, en français : ce qui est arrivé, ce qui était déjà là. */
  function recapMessage(recap) {
    const bits = [];
    if (recap.booksAdded) bits.push(`${recap.booksAdded} livre${recap.booksAdded > 1 ? 's' : ''} restauré${recap.booksAdded > 1 ? 's' : ''}`);
    if (recap.booksKept) bits.push(`${recap.booksKept} déjà ${recap.booksKept > 1 ? 'présents' : 'présent'}`);
    if (recap.annotations) bits.push(`${recap.annotations} soulignage${recap.annotations > 1 ? 's' : ''} & note${recap.annotations > 1 ? 's' : ''}`);
    if (recap.bookmarks) bits.push(`${recap.bookmarks} signet${recap.bookmarks > 1 ? 's' : ''}`);
    if (recap.progress) bits.push('progression à jour');
    if (recap.groups) bits.push(`${recap.groups} groupe${recap.groups > 1 ? 's' : ''}`);
    if (recap.history) bits.push('passages');
    if (recap.readstats) bits.push('statistiques');
    if (recap.goal) bits.push('objectif de lecture');
    return `Sauvegarde restaurée${bits.length ? ' — ' + bits.join(', ') : ''}.${
      recap.goalError ? ' Le navigateur a refusé la mise à jour de l’objectif de lecture.' : ''}`;
  }

  /* ══════════════ Interface ══════════════ */

  function openModal() {
    disarmReplace();
    const zone = $('#backup-import-zone');
    if (zone) zone.hidden = true;
    const last = readLast();
    const el = $('#backup-last');
    if (el) {
      el.textContent = last
        ? `Dernière sauvegarde : ${lastLabel(last.at)} — ${last.books} livre${last.books > 1 ? 's' : ''} à l\u2019époque.`
        : 'Aucune sauvegarde pour l\u2019instant — un seul fichier suffit à tout garder.';
    }
    const pop = $('#backup-pop'), back = $('#backup-backdrop');
    if (pop) pop.hidden = false;
    if (back) back.hidden = false;
    escBound = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', escBound);
  }
  function closeModal() {
    disarmReplace();
    const pop = $('#backup-pop'), back = $('#backup-backdrop');
    if (pop) pop.hidden = true;
    if (back) back.hidden = true;
    if (escBound) { document.removeEventListener('keydown', escBound); escBound = null; }
  }

  /* Le remplacement ne part jamais d'un clic distrait : le bouton
     s'arme (texte + teinte), et seul un second clic dans les six
     secondes exécute — la maison des suppressions. */
  function disarmReplace() {
    if (armedReplace) {
      clearTimeout(armedReplace.timer);
      armedReplace = null;
    }
    const btn = $('#backup-replace');
    if (btn) {
      btn.classList.remove('confirm');
      btn.textContent = 'Remplacer…';
    }
  }
  function armReplace(file, manifest) {
    disarmReplace();
    const btn = $('#backup-replace');
    if (!btn) return;
    const n = (manifest.counts && manifest.counts.books) || 0;
    const when = manifest.createdAt ? new Date(manifest.createdAt).toLocaleDateString('fr-FR') : '';
    armedReplace = { file, manifest, timer: setTimeout(disarmReplace, 6000) };
    btn.classList.add('confirm');
    btn.textContent = `Confirmer : ${n} livre${n > 1 ? 's' : ''} du ${when} écraseront tout`;
  }

  async function runImport(file, mode) {
    if (busy) { NC.toast('Une sauvegarde ou une restauration est déjà en cours — un instant.', 'info', 2400); return; }
    busy = true;
    const prog = NC.toastHold('Lecture de la sauvegarde…');
    try {
      const res = await importFile(file, mode, (m) => prog.update(m));
      prog.done(recapMessage(res.recap), res.recap.goalError ? 'error' : 'success', 7000);
      /* La restauration vient de prouver qu'une sauvegarde existe :
         le rappel se tait trois jours (V2.26), comme après « Plus tard »
         — au lieu de ressasser un oubli que l'on vient de démentir. */
      try { localStorage.setItem(LS_SNOOZE, String(Date.now())); } catch (e) {}
      closeModal();
      if (NC.library && NC.library.refresh) await NC.library.refresh();
      if (NC.goal && NC.goal.refresh) NC.goal.refresh();
      refreshNotice();
    } catch (err) {
      console.error('Restauration échouée', err);
      const msg = err?.name === 'QuotaExceededError'
        ? 'Espace de stockage insuffisant. La bibliothèque précédente est toujours disponible.'
        : /étranger/.test(String(err && err.message))
        ? 'Ce fichier n\u2019est pas une sauvegarde Nuit Calme.'
        : /incomplet/.test(String(err && err.message))
          ? 'Cette sauvegarde est incomplète ou contient des données invalides.'
          : /version incompatible/.test(String(err && err.message))
            ? 'Cette version du format de sauvegarde est incompatible.'
            : /volume hors limites/i.test(String(err && err.message))
              ? 'La sauvegarde dépasse les limites de taille de cette liseuse.'
              : 'La restauration a échoué. Vérifiez le fichier et l’espace de stockage disponible.';
      prog.done(msg, 'error', 8000);
    } finally {
      busy = false;
    }
  }

  async function exportAndDownload() {
    if (busy) { NC.toast('Une sauvegarde ou une restauration est déjà en cours — un instant.', 'info', 2400); return; }
    busy = true;
    try {
      await exportAll();
    } catch (e) { /* le récit est déjà fait */ }
    finally { busy = false; }
  }

  /* ══════════════ Câblage ══════════════ */

  function init() {
    const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener('click', fn); };

    on('#btn-backup', () => openModal());
    on('#backup-close', () => closeModal());
    on('#backup-backdrop', () => closeModal());
    on('#backup-export', () => exportAndDownload());
    on('#backup-import', () => {
      const zone = $('#backup-import-zone');
      const btn = $('#backup-import');
      if (zone) {
        zone.hidden = !zone.hidden;
        if (btn) btn.setAttribute('aria-expanded', zone.hidden ? 'false' : 'true');
        if (!zone.hidden) disarmReplace();
      }
    });
    on('#backup-merge', () => { const i = $('#backup-file-input'); if (i) { i.dataset.mode = 'merge'; i.click(); } });
    on('#backup-replace', () => {
      if (armedReplace) { // second clic : on y va vraiment
        const f = armedReplace.file;
        disarmReplace();
        runImport(f, 'replace');
        return;
      }
      const i = $('#backup-file-input');
      if (i) { i.dataset.mode = 'replace'; i.click(); }
    });
    const input = $('#backup-file-input');
    if (input) input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file || busy) return;
      const mode = input.dataset.mode === 'replace' ? 'replace' : 'merge';
      if (mode === 'merge') { runImport(file, 'merge'); return; }
      try { // remplacement : un coup d'œil d'abord, la confirmation ensuite
        const { manifest } = await peek(file);
        armReplace(file, manifest);
      } catch (err) {
        NC.toast(/étranger/.test(String(err && err.message))
          ? 'Ce fichier n\u2019est pas une sauvegarde Nuit Calme.'
          : 'Cette sauvegarde n\u2019a pas pu être lue — fichier incomplet ?', 'error');
      }
    });
    on('#backup-notice-go', async () => { await exportAndDownload(); refreshNotice(); });
    on('#backup-notice-later', () => {
      try { localStorage.setItem(LS_SNOOZE, String(Date.now())); } catch (e) {}
      const n = $('#backup-notice'); if (n) n.hidden = true;
    });
    if ($('#foot-backup')) on('#foot-backup', () => openModal());

    refreshNotice();
  }

  return {
    init, refreshNotice,
    exportAll, exportAndDownload, importFile, peek,
    openModal, closeModal,
    _buildState: buildState, _recapMessage: recapMessage,
  };
})();
