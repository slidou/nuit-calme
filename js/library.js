/* NUIT CALME — bibliothèque : import, couvertures, grille, suppression.
   V2.14 : statut de lecture (À lire / En cours / Terminé), filtres à
   compteurs et groupes personnels (les « rayons » du lecteur).
   V2.15 : import en masse — plusieurs fichiers ou un dossier entier
   d'un coup, progression en place, récapitulatif final, grille qui
   se remplit au fil des succès.
   V2.16 : recherche (titre / auteur, pliée : casse et accents
   ignorés) et tri (dernière lecture, ajout, titre, auteur) — le
   choix est mémorisé d'une session à l'autre.
   V2.20 : édition des métadonnées — le crayon de chaque carte corrige
   titre, auteur et couverture (image choisie, initiales, ou jaquette
   d'origine réextraite du fichier stocké).
   V2.22 : packs de livres — l'aperçu (peepFile) et l'import isolé
   (importOne) sortent de l'import classique pour servir la vue packs,
   avec repérage des doublons (librarySignatures / looksKnown).
   V2.24 : objectif de lecture — le passage à « Terminé » se date
   désormais (statusAt dans la fiche) ; finishedBooks() sort la liste
   des livres finis avec leur date pour le compte de l'objectif. */
'use strict';

NC.library = (() => {
  let books = [];
  /* ── Rangement (V2.14) ──
     metas : la fiche légère de chaque livre (statut, groupe), chargée
     du magasin « bookmeta » — un livre sans fiche est « À lire », sans
     groupe. groups : les rayons créés par le lecteur, triés à la main
     (ordre de création). filter : le choix des puces, mémorisé. */
  let metas = new Map();
  let groups = [];
  let filter = NC.libFilterLoad();
  /* ── Recherche & tri (V2.16) ──
     query : le texte tapé, comparé aux titres ET aux auteurs (plié).
     sortState : la clé et le sens choisis — mémorisés, repliés sur
     « Dernière lecture / récent d'abord » (l'ordre historique) si la
     donnée est absente ou inconnue. */
  let query = '';
  let foldedQuery = '';
  const searchKeys = new WeakMap();
  const titleCollator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
  let renderTimer;
  let renderedBooks = [];
  let renderedMeta = [];
  let bookToFocus = null;
  let sortState = NC.libSortLoad();
  let dragDepth = 0;        // profondeur du glisser-déposer en cours (overlay)
  let cardPopBook = null;   // livre affiché par le menu de rangement ouvert
  let cardPopAnchor = null; // position figée du menu (fixe, même après re-rendu)
  let groupPopMode = null;  // { mode:'create'|'rename', groupId?, assignBookId?, returnTo? }
  /* ── Édition des métadonnées (V2.20) ──
     editBookId : le livre ouvert dans la modale ; editCoverState : la
     couverture n'a pas été touchée ('untouched'), a été remplacée
     ('set', dataURL dans editCoverData) ou retirée ('removed') ;
     editExtractSeq annule une réextraction en vol à la fermeture. */
  let editBookId = null;
  let editCoverState = 'untouched';
  let editCoverData = null;
  let editExtractSeq = 0;

  /* ── Import (V2.15 : en masse) ──
     Un seul fichier → messages individuels, comme avant. Plusieurs
     d'un coup (dépôt multi-fichiers, dossier entier glissé,
     sélection multiple dans la boîte de dialogue) → UNE pastille de
     progression mise à jour en place (« Import en masse — 3/12 »),
     aucun toast par livre, la grille se remplit au fil des succès,
     et un récapitulatif final dit ce qui a échoué — et pourquoi. */
  const BOOK_EXT_RE = /\.(epub|pdf)$/i;
  const validatedFiles = new WeakSet();

  async function importFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const batch = files.length > 1;
    const prog = batch ? NC.toastHold('Import en masse…') : null;
    let added = 0;
    let paintedAt = performance.now();
    const fails = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (batch) prog.update(`Import en masse — ${i + 1}/${files.length} : « ${file.name} »`);
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      let rec = null;
      try {
        if (ext === 'epub' || file.type === 'application/epub+zip') {
          rec = await importEpub(file, { quiet: batch });
        } else if (ext === 'pdf' || file.type === 'application/pdf') {
          rec = await importPdf(file, { quiet: batch });
        } else if (batch) {
          fails.push(`${file.name} (format non pris en charge)`);
        } else {
          NC.toast(`« ${file.name} » : seul un fichier EPUB ou PDF est pris en compte.`, 'error');
        }
      } catch (err) {
        console.error('Import échoué', err);
        if (batch) fails.push(`${file.name} (${shortReason(err)})`);
        else NC.toast(failMessage(file, err), 'error');
      }
      if (!rec) continue;
      added++;
      /* En masse, la bibliothèque vit au fil de l'eau : chaque succès
         apparaît aussitôt (étiquette « À lire », compteurs suivis). */
      if (batch) {
        const { data, ...metadata } = rec;
        books.unshift(metadata);
        if (performance.now() - paintedAt >= 150) {
          paintedAt = performance.now();
          renderFilters(); render();
        }
      }
    }

    if (batch) {
      const n = added, k = fails.length;
      const liste = `${fails.slice(0, 3).join(' ; ')}${k > 3 ? '…' : ''}`;
      if (!k) prog.done(`Import en masse terminé — ${n} ${n > 1 ? 'livres ajoutés' : 'livre ajouté'}.`, 'success');
      else if (!n) prog.done(`Aucun livre ajouté — ${k} échec${k > 1 ? 's' : ''} : ${liste}`, 'error', 8000);
      else prog.done(`${n} ${n > 1 ? 'livres ajoutés' : 'livre ajouté'} — ${k} en échec : ${liste}`, 'error', 8000);
    }
    await refresh();
  }

  /* Raison courte d'un échec, pour le récapitulatif de l'import en masse. */
  function shortReason(err) {
    const m = String((err && err.message) || err || '');
    if ((err && err.name === 'QuotaExceededError') || /quota/i.test(m)) return 'stockage saturé';
    if (/password|encrypt|drm/i.test(m)) return 'protégé (DRM ou mot de passe)';
    if (/délai/i.test(m)) return 'délai dépassé';
    if (/volume hors limites/i.test(m)) return 'fichier trop volumineux';
    return 'fichier illisible';
  }

  /* Message complet d'un échec à l'unité (import d'un seul fichier).
     Reprise mot pour mot des messages d'avant la V2.15. */
  function failMessage(file, err) {
    if (/volume hors limites/i.test(err?.message)) return `« ${file.name} » dépasse la limite de taille d’import.`;
    return (err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err && err.message))))
      ? `Stockage du navigateur saturé — « ${file.name} » n'a pas pu être enregistré. Supprimez des livres ou libérez de l'espace.`
      : `« ${file.name} » n'a pas pu être ouvert${/encrypt|password|drm/i.test(String(err && err.message)) ? ' — EPUB protégé (DRM) non pris en charge' : ''}.`;
  }

  /* ── Découverte d'un fichier (V2.22) ──
     peepEpub / peepPdf extraient titre, auteur et couverture SANS
     rien stocker : c'est le socle commun de l'import classique et
     de l'aperçu des packs (l'aperçu d'un pack lit chaque livre pour
     montrer sa vraie jaquette avant tout ajout). */
  async function peepEpub(buf) {
    let title = '', author = '', cover = null;
    const book = ePub();
    let deadline;
    try {
      await Promise.race([
        Promise.all([book.open(buf), book.ready, book.opened]),
        new Promise((_, reject) => {
          deadline = setTimeout(() => reject(new Error('délai dépassé')), 15000);
        }),
      ]);
      const meta = await book.loaded.metadata;
      if (meta && meta.title) title = meta.title;
      if (meta && meta.creator) author = meta.creator;
      try {
        const coverUrl = await book.coverUrl();
        if (coverUrl) {
          const blobCover = await (await fetch(coverUrl)).blob();
          cover = await blobToDataUrl(blobCover);
        }
      } catch (e) { /* pas de couverture */ }
    } finally {
      clearTimeout(deadline);
      try { book.destroy(); } catch (e) {}
    }
    return { title, author, cover };
  }

  async function peepPdf(buf) {
    let title = '', author = '', cover = null;
    const task = pdfjsLib.getDocument({ data: buf.slice(0), isEvalSupported: false });
    try {
      const doc = await task.promise;
      try {
        const info = await doc.getMetadata();
        if (info && info.info) {
          if (info.info.Title) title = info.info.Title;
          if (info.info.Author) author = info.info.Author;
        }
      } catch (e) {}
      try { cover = await renderPdfCover(doc); } catch (e) {}
    } finally {
      await task.destroy().catch(() => {});
    }
    return { title, author, cover };
  }

  /* Le type d'un fichier d'après son extension (ou son type MIME),
     ou null — la police des décisions d'import et d'aperçu. */
  function fileTypeOf(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'epub' || file.type === 'application/epub+zip') return 'epub';
    if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
    return null;
  }

  async function readBookFile(file, type) {
    if (file.size > NC.archive.maxBook) throw new Error('Volume hors limites');
    const buffer = await file.arrayBuffer();
    if (!validatedFiles.has(file)) {
      await NC.archive.validateBook(type, buffer);
      validatedFiles.add(file);
    }
    return buffer;
  }

  /* Titre, auteur, couverture d'un fichier épars (packs) : le même
     travail que l'import, sans toucher à la bibliothèque. Jette si
     le fichier est illisible — l'appelant fait le récit. */
  async function peepFile(file) {
    const type = fileTypeOf(file);
    if (!type) throw new Error('format non pris en charge');
    const buf = await readBookFile(file, type);
    const meta = type === 'epub' ? await peepEpub(buf) : await peepPdf(buf);
    return Object.assign(meta, { type });
  }

  /* Import d'un fichier isolé, avec méta déjà extraite ou pas — le
     chemin des packs (V2.22) : le livre a été aperçu juste avant,
     autant ne pas relire deux fois ses métadonnées. */
  async function importOne(file, meta, opts) {
    const type = fileTypeOf(file);
    if (type === 'epub') return importEpub(file, opts, meta);
    if (type === 'pdf') return importPdf(file, opts, meta);
    throw new Error('format non pris en charge');
  }

  async function importEpub(file, opts, pre) {
    const quiet = opts && opts.quiet; // en masse : la pastille de progression fait le récit
    if (!quiet) NC.toast(`Import de « ${file.name} »…`);
    const buf = await readBookFile(file, 'epub');
    const meta = pre || await peepEpub(buf);
    const rec = makeRecord({
      title: meta.title || file.name.replace(/\.epub$/i, ''),
      author: meta.author || '',
      type: 'epub', cover: meta.cover || null,
      data: buf, size: buf.byteLength,
    });
    await NC.db.putImportedBook(rec);
    if (!quiet) NC.toast(`« ${rec.title} » ajouté à la bibliothèque.`, 'success');
    return rec;
  }

  async function importPdf(file, opts, pre) {
    const quiet = opts && opts.quiet; // en masse : la pastille de progression fait le récit
    if (!quiet) NC.toast(`Import de « ${file.name} »…`);
    const buf = await readBookFile(file, 'pdf');
    let meta;
    if (pre) meta = pre;
    else {
      try { meta = await peepPdf(buf); }
      catch (err) {
        if (/password/i.test(String(err && err.name + err.message))) {
          throw new Error('PDF protégé par mot de passe');
        }
        throw err;
      }
    }
    const rec = makeRecord({
      title: meta.title || file.name.replace(/\.pdf$/i, ''),
      author: meta.author || '',
      type: 'pdf', cover: meta.cover || null,
      data: buf, size: buf.byteLength,
    });
    await NC.db.putImportedBook(rec);
    if (!quiet) NC.toast(`« ${rec.title} » ajouté à la bibliothèque.`, 'success');
    return rec;
  }

  /* Première page d'un PDF rendue en JPEG 320 px — la couverture posée
     à l'import, et la « jaquette d'origine » du modale d'édition. */
  async function renderPdfCover(doc) {
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const scale = 320 / vp.width;
    const v2 = page.getViewport({ scale });
    const cnv = document.createElement('canvas');
    cnv.width = Math.ceil(v2.width); cnv.height = Math.ceil(v2.height);
    await page.render({ canvasContext: cnv.getContext('2d'), viewport: v2 }).promise;
    return cnv.toDataURL('image/jpeg', 0.75);
  }

  /* Jaquette d'origine, réextraite du fichier stocké (EPUB : la
     couverture déclarée par le livre ; PDF : la première page).
     Renvoie null quand le fichier n'en propose pas ; jette quand le
     fichier lui-même est illisible — l'appelant fait le récit. */
  async function extractOriginalCover(book) {
    if (book.type === 'pdf') {
      const task = pdfjsLib.getDocument({ data: book.data.slice(0), isEvalSupported: false });
      try { return await renderPdfCover(await task.promise); }
      finally { await task.destroy().catch(() => {}); }
    }
    return (await peepEpub(book.data)).cover;
  }

  function makeRecord({ title, author, type, cover, data, size }) {
    return {
      id: crypto.randomUUID(),
      title: String(title || 'Sans titre').trim() || 'Sans titre',
      author: String(author || '').trim(),
      type, cover, data, size,
      addedAt: Date.now(),
      lastOpened: 0,
      lastCfi: '', lastPage: 0,
      fontSize: 0, zoom: 0,
    };
  }

  const blobToDataUrl = (blob) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });

  /* ── Doublons (V2.22) ──
     Signature pliée (casse et accents ignorés) titre + auteur : les
     packs s'en servent pour montrer ce que la bibliothèque possède
     déjà. Un auteur inconnu d'un côté ne casse pas la comparaison —
     les fichiers de pack sont parfois avares en métadonnées. */
  function librarySignatures() {
    return books.map((b) => ({ t: NC.foldText(b.title), a: NC.foldText(b.author || '') }));
  }
  function looksKnown(sigs, title, author) {
    const t = NC.foldText(title || '');
    const a = NC.foldText(author || '');
    if (!t) return false;
    return sigs.some((s) => s.t === t && (!a || !s.a || a === s.a));
  }

  /* ── Rangement : helpers (V2.14) ── */
  const metaOf = (id) => metas.get(id) || { id, status: NC.READ_DEFAULT, groupId: null };
  const statusOf = (id) => NC.normStatus(metaOf(id).status);
  const groupOf = (gid) => (gid ? groups.find((g) => g.id === gid) || null : null);

  const sortGroups = () => groups.sort((a, b) =>
    ((a.order || 0) - (b.order || 0)) || String(a.name).localeCompare(String(b.name), 'fr'));

  async function applyRange(bookId, patch) {
    try {
      const row = await NC.db.changeBookMeta(bookId, patch);
      if (!row) throw new Error('Livre introuvable');
      metas.set(bookId, row);
      renderFilters();
      render();
      if (cardPopBook === bookId) buildCardPop();
      if (NC.goal) NC.goal.refresh();
      return row;
    } catch (error) {
      NC.toast('La fiche n’a pas pu être enregistrée.', 'error');
      return null;
    }
  }

  const setBookStatus = (bookId, status) => applyRange(bookId, { status: NC.normStatus(status) });
  const assignGroup = (bookId, groupId) => applyRange(bookId, { groupId: groupId || null });

  /* ── Grille ──
     « Dernière ouverture » : la valeur fraîche vit dans l'enregistrement
     léger de progression (elle n'est plus recopiée dans le livre à chaque
     ouverture) ; rec.lastOpened reste le repli historique. Le tri affiché
     est celui choisi (visibleBooks) ; celui-ci, conservé, sert d'ordre
     de base et de départage pour les clés à égalité. */
  let refreshGeneration = 0;
  async function refresh() {
    const generation = ++refreshGeneration;
    const snapshot = await NC.db.catalogSnapshot();
    if (generation !== refreshGeneration) return;
    books = snapshot.books;
    groups = snapshot.groups;
    sortGroups();
    metas = new Map(snapshot.bookmeta.map((m) => [m.id, m]));
    if (filter.group !== 'all' && filter.group !== 'none' && !groupOf(filter.group)) {
      filter.group = 'all';
      NC.libFilterSave(filter);
    }
    const opened = new Map(snapshot.progress.map((p) => [p.id, p.lastOpened || 0]));
    for (const b of books) b.lastOpened = Math.max(b.lastOpened || 0, opened.get(b.id) || 0);
    books.sort((a, b) => (b.lastOpened || b.addedAt) - (a.lastOpened || a.addedAt));
    renderFilters();
    render();
    if (NC.goal) NC.goal.refresh();
    if (NC.backup) NC.backup.refreshNotice();
    NC.notebook?.refreshIfVisible();
  }

  /* ── Objectif de lecture (V2.24) : les « Terminé », datés ──
     statusAt porte la date du geste (posée à V2.24) ; les fiches
     antérieures n'ont que updatedAt — la dernière fois que la fiche a
     bougé — : le meilleur repli connu, sans jamais inventer une date.
     La modale de l'objectif filtre ces livres par sa propre période. */
  function finishedBooks() {
    const out = [];
    for (const b of books) {
      const m = metas.get(b.id);
      if (!m || NC.normStatus(m.status) !== 'termine') continue;
      const at = m.statusAt || m.updatedAt || null;
      if (at) out.push({ id: b.id, title: b.title, at });
    }
    out.sort((a, z) => a.at - z.at);
    return out;
  }

  /* La recherche compare le texte PLIÉ (NC.foldText : casse et accents
     ignorés — « écla » trouve « Éclats ») au titre ET à l'auteur. */
  const matchesQuery = (b) => {
    if (!foldedQuery) return true;
    if (!searchKeys.has(b)) searchKeys.set(b, [NC.foldText(b.title), NC.foldText(b.author)]);
    return searchKeys.get(b).some((text) => text.includes(foldedQuery));
  };

  /* Comparateur du tri courant. « Dernière lecture » retombe sur la
     date d'ajout pour les livres jamais ouverts (sinon ils s'empileraient
     sur 1970) ; titres et auteurs comparent en français, sur la base
     (É == e), nombres compris dans l'ordre (tome 2 avant tome 10) ;
     un livre sans auteur passe après les autres en ordre croissant. */
  function compareBooks(a, b) {
    const dir = sortState.dir === 'asc' ? 1 : -1;
    const alpha = (va, vb) => titleCollator.compare(String(va || ''), String(vb || ''));
    switch (sortState.by) {
      case 'title':
        return dir * alpha(a.title, b.title);
      case 'author': {
        const na = a.author ? 0 : 1, nb = b.author ? 0 : 1;
        if (na !== nb) return dir * (na - nb);
        return dir * alpha(a.author, b.author);
      }
      case 'added':
        return dir * ((a.addedAt || 0) - (b.addedAt || 0));
      default: // 'lastread'
        return dir * ((a.lastOpened || a.addedAt || 0) - (b.lastOpened || b.addedAt || 0));
    }
  }

  /* Livres visibles : recherche (titre / auteur) PUIS filtres (statut
     ET groupe), puis le sens et la clé du tri choisis. La copie
     renvoyée appartient à l'appelant — le tri ne touche pas « books ». */
  function visibleBooks() {
    const vis = books.filter((b) => {
      if (!matchesQuery(b)) return false;
      const m = metaOf(b.id);
      if (filter.status !== 'all' && NC.normStatus(m.status) !== filter.status) return false;
      if (filter.group === 'none') { if (m.groupId) return false; }
      else if (filter.group !== 'all' && m.groupId !== filter.group) return false;
      return true;
    });
    vis.sort(compareBooks);
    return vis;
  }

  /* Compteurs à facettes : chaque puce affiche ce que l'on verrait en
     la cliquant, l'autre dimension restant telle quelle — la recherche
     comprise (elle affine tout le monde). */
  function facetCounts() {
    const st = { all: 0, ...Object.fromEntries(Object.keys(NC.READ_STATUS).map((key) => [key, 0])) };
    const gr = Object.assign(Object.create(null), { all: 0, none: 0 });
    for (const g of groups) gr[g.id] = 0;
    for (const book of books) {
      if (!matchesQuery(book)) continue;
      const meta = metaOf(book.id);
      const status = NC.normStatus(meta.status);
      const group = meta.groupId || 'none';
      if (filter.group === 'all' || filter.group === group) {
        st.all++;
        st[status]++;
      }
      if (filter.status === 'all' || filter.status === status) {
        gr.all++;
        if (Object.hasOwn(gr, group) && group !== 'all') gr[group]++;
      }
    }
    return { st, gr };
  }

  function chip(label, count, active, onClick, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (active ? ' on' : '') + (cls ? ' ' + cls : '');
    const lab = document.createElement('span');
    lab.className = 'chip-label';
    lab.textContent = label;
    b.appendChild(lab);
    if (count != null) {
      b.setAttribute('aria-pressed', String(active));
      const n = document.createElement('span');
      n.className = 'chip-n';
      n.textContent = String(count);
      b.appendChild(n);
    }
    b.addEventListener('click', onClick);
    return b;
  }

  const setStatusFilter = (s) => {
    filter.status = s;
    NC.libFilterSave(filter);
    renderFilters(); render();
  };
  const setGroupFilter = (g) => {
    filter.group = g;
    NC.libFilterSave(filter);
    renderFilters(); render();
  };
  /* Réinitialiser : filtres ET recherche remis à zéro (le bouton de
     l'état « aucun résultat » ramène à la bibliothèque complète). */
  const resetFilters = () => {
    filter = { status: 'all', group: 'all' };
    NC.libFilterSave(filter);
    query = '';
    foldedQuery = '';
    const si = NC.$('#lib-search');
    if (si) si.value = '';
    renderFilters(); render();
  };

  function renderFilters() {
    const stRow = NC.$('#filter-status');
    const grRow = NC.$('#filter-groups');
    if (!stRow || !grRow) return;
    const active = document.activeElement;
    const activeRow = [stRow, grRow].find((row) => row.contains(active));
    const activeLabel = activeRow && active.querySelector('.chip-label')?.textContent;
    const c = facetCounts();
    stRow.innerHTML = '';
    stRow.appendChild(chip('Tous', c.st.all, filter.status === 'all', () => setStatusFilter('all')));
    Object.entries(NC.READ_STATUS).forEach(([key, meta]) => {
      stRow.appendChild(chip(meta.label, c.st[key], filter.status === key, () => setStatusFilter(key), 'st-' + key));
    });
    grRow.innerHTML = '';
    grRow.appendChild(chip('Tous les groupes', c.gr.all, filter.group === 'all', () => setGroupFilter('all')));
    grRow.appendChild(chip('Sans groupe', c.gr.none, filter.group === 'none', () => setGroupFilter('none')));
    for (const g of groups) {
      grRow.appendChild(chip(g.name, c.gr[g.id], filter.group === g.id, () => setGroupFilter(g.id)));
    }
    grRow.appendChild(chip(groups.length ? '+ Groupe' : '+ Créer un groupe', null, false,
      () => openGroupPop({ mode: 'create' }), 'ghost'));
    if (groups.length) {
      grRow.appendChild(chip('Gérer', null, false, () => openManage(), 'ghost manage'));
    }
    if (activeLabel) {
      const match = [...activeRow.children].find((button) => button.querySelector('.chip-label')?.textContent === activeLabel);
      NC.focus(match, activeRow.firstElementChild);
    }
  }

  function focusListedBook() {
    if (bookToFocus === null) return;
    if (document.activeElement !== document.body && document.activeElement !== NC.$('#btn-back')) {
      bookToFocus = null;
      return;
    }
    const button = NC.$(`#book-grid [data-book-id="${CSS.escape(String(bookToFocus))}"] .card-open`);
    if (!button) return;
    bookToFocus = null;
    button.focus();
  }

  function focusBook(id) {
    bookToFocus = id;
    focusListedBook();
    if (bookToFocus !== null && !renderedBooks.some((book) => book.id === id)) {
      bookToFocus = null;
      NC.focus(NC.$('#lib-search'), NC.$('#btn-add'));
    }
  }

  function render() {
    clearTimeout(renderTimer);
    const grid = NC.$('#book-grid');
    const empty = NC.$('#empty-state');
    const count = NC.$('#lib-count');
    const vis = visibleBooks();
    const total = books.length;
    const narrowed = filter.status !== 'all' || filter.group !== 'all' || !!query;
    count.textContent = narrowed
      ? `${vis.length} sur ${total} ${total > 1 ? 'livres' : 'livre'}`
      : total + (total > 1 ? ' livres' : ' livre');
    empty.hidden = total > 0;
    grid.hidden = total === 0;
    const toolsBar = NC.$('#lib-filters');
    if (toolsBar) toolsBar.hidden = total === 0; // rien à chercher ni trier sans livre
    const fe = NC.$('#filter-empty');
    if (fe) {
      fe.hidden = !(total > 0 && vis.length === 0);
      const fet = NC.$('#filter-empty-text');
      if (fet) {
        const filtered = filter.status !== 'all' || filter.group !== 'all';
        fet.textContent = query
          ? `Aucun livre ne correspond à « ${query} »${filtered ? ' dans ce filtre' : ''}.`
          : 'Aucun livre ne correspond à ce filtre.';
      }
    }

    const currentMeta = vis.map((book) => metas.get(book.id));
    if (renderedBooks.length === vis.length && grid.childElementCount === vis.length &&
        vis.every((book, index) => book === renderedBooks[index] && currentMeta[index] === renderedMeta[index])) return;
    renderedBooks = vis;
    renderedMeta = currentMeta;
    grid.replaceChildren();
    let offset = 0;
    function appendBatch() {
      const fragment = document.createDocumentFragment();
      const start = offset;
      const deadline = performance.now() + 8;
      while (offset < vis.length && (offset < start + 60 || performance.now() < deadline)) {
        fragment.appendChild(createCard(vis[offset++]));
      }
      grid.appendChild(fragment);
      focusListedBook();
      if (offset < vis.length) renderTimer = setTimeout(appendBatch, 0);
    }
    appendBatch();

    function createCard(book) {
      const card = document.createElement('article');
      card.className = 'card' + (statusOf(book.id) === 'termine' ? ' is-done' : '');
      card.dataset.bookId = book.id;

      const cover = document.createElement('div');
      cover.className = 'card-cover';
      if (book.cover) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = book.cover;
        img.alt = '';
        cover.appendChild(img);
      } else {
        const gen = document.createElement('div');
        gen.className = 'gen';
        gen.textContent = initials(book.title);
        cover.appendChild(gen);
      }
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = book.type.toUpperCase();
      cover.appendChild(badge);
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'card-open';
      open.setAttribute('aria-label', `Lire ${book.title}`);
      open.textContent = 'Lire';
      cover.appendChild(open);

      const del = document.createElement('button');
      del.className = 'card-del';
      del.type = 'button';
      del.title = 'Supprimer de la bibliothèque';
      del.setAttribute('aria-label', `Supprimer ${book.title}`);
      del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2m-8 0l1 13h8l1-13"/></svg>';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!del.classList.contains('confirm')) {
          del.classList.add('confirm');
          del.title = 'Cliquer à nouveau pour confirmer';
          setTimeout(() => { del.classList.remove('confirm'); del.title = 'Supprimer de la bibliothèque'; }, 2600);
          return;
        }
        NC.db.deleteBookCascade(book.id).then(() => {
          NC.toast(`« ${book.title} » retiré de la bibliothèque (soulignages et progression compris).`);
          refresh();
        }).catch((err) => {
          console.error('Suppression échouée', err);
          NC.toast(`« ${book.title} » n'a pas pu être supprimé.`, 'error');
        });
      });

      /* Menu de rangement (V2.14) : statut de lecture et groupe. */
      const menu = document.createElement('button');
      menu.className = 'card-menu';
      menu.type = 'button';
      menu.title = 'Statut de lecture et groupe';
      menu.setAttribute('aria-label', `Ranger ${book.title}`);
      menu.setAttribute('aria-controls', 'card-pop');
      menu.setAttribute('aria-expanded', String(cardPopBook === book.id));
      menu.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5.4" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18.6" r="1.5"/></svg>';
      menu.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cardPopBook === book.id && !NC.$('#card-pop').hidden) { closeCardPop(); return; }
        openCardPop(book, menu);
      });

      /* Crayon (V2.20) : corriger titre, auteur et couverture. */
      const edit = document.createElement('button');
      edit.className = 'card-edit';
      edit.type = 'button';
      edit.title = 'Modifier le titre, l\u2019auteur ou la couverture';
      edit.setAttribute('aria-label', `Modifier la fiche de ${book.title}`);
      edit.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 17l9.5-9.5a2.1 2.1 0 0 1 3 3L8 20l-4 1z"/></svg>';
      edit.addEventListener('click', (e) => {
        e.stopPropagation();
        openBookEdit(book);
      });

      const meta = document.createElement('div');
      meta.className = 'card-meta';
      const h = document.createElement('h3');
      h.className = 'card-title';
      h.textContent = book.title;
      const p = document.createElement('p');
      p.className = 'card-author';
      p.textContent = book.author || (book.type === 'epub' ? 'EPUB' : 'PDF');
      meta.append(h, p);

      /* Étiquettes sous le titre : statut de lecture + groupe. */
      const tags = document.createElement('div');
      tags.className = 'card-tags';
      const st = statusOf(book.id);
      const stTag = document.createElement('span');
      stTag.className = 'tag st-' + st;
      stTag.innerHTML = NC.STATUS_ICON[st];
      const stLab = document.createElement('span');
      stLab.textContent = NC.READ_STATUS[st].label;
      stTag.appendChild(stLab);
      tags.appendChild(stTag);
      const g = groupOf(metaOf(book.id).groupId);
      if (g) {
        const gTag = document.createElement('span');
        gTag.className = 'tag st-group';
        gTag.textContent = g.name;
        tags.appendChild(gTag);
      }
      meta.appendChild(tags);

      card.append(cover, del, menu, edit, meta);
      card.addEventListener('click', () => NC.reader.open(book.id));
      return card;
    }
  }

  const initials = (title) => {
    /* \p{L}/\p{N} avec le drapeau u : toutes lettres et chiffres Unicode —
       les titres en cyrillique, grec ou chinois donnent bien des initiales
       au lieu de retomber sur « NC » (filtre latin-limité auparavant). */
    const words = String(title).trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'NC';
  };

  /* ── Menu de rangement d'une carte (V2.14) ──
     Popover fixe ancré sur le bouton ⋮ : statut de lecture, groupe
     existant ou nouveau. Il reste ouvert d'un choix à l'autre (on
     range souvent statut ET groupe en même temps) et se reconstruit
     après chaque changement — la position, elle, ne bouge pas. */
  function openCardPop(book, btn) {
    cardPopBook = book.id;
    const pop = NC.$('#card-pop');
    buildCardPop();
    pop.hidden = false;
    NC.placePopover(pop, btn.getBoundingClientRect());
    cardPopAnchor = { x: parseFloat(pop.style.left), y: parseFloat(pop.style.top) };
    btn.setAttribute('aria-expanded', 'true');
    NC.focus(pop.querySelector('button'));
  }

  function buildCardPop() {
    const pop = NC.$('#card-pop');
    if (!cardPopBook) return;
    const book = books.find((b) => b.id === cardPopBook);
    if (!book) { closeCardPop(); return; }
    const cur = metaOf(book.id);
    const focused = [...pop.querySelectorAll('button')].indexOf(document.activeElement);
    pop.innerHTML = '';

    const h1 = document.createElement('h4');
    h1.className = 'pop-title';
    h1.textContent = 'Statut de lecture';
    pop.appendChild(h1);
    Object.entries(NC.READ_STATUS).forEach(([key, meta]) => {
      pop.appendChild(popItem(meta.label, NC.STATUS_ICON[key], NC.normStatus(cur.status) === key,
        () => { setBookStatus(book.id, key); }));
    });

    const h2 = document.createElement('h4');
    h2.className = 'pop-title';
    h2.textContent = 'Groupe';
    pop.appendChild(h2);
    const scroll = document.createElement('div');
    scroll.className = 'pop-scroll';
    scroll.appendChild(popItem('Sans groupe', null, !cur.groupId, () => { assignGroup(book.id, null); }));
    for (const g of groups) {
      scroll.appendChild(popItem(g.name, null, cur.groupId === g.id, () => { assignGroup(book.id, g.id); }));
    }
    pop.appendChild(scroll);
    pop.appendChild(popItem('Nouveau groupe…', null, false, () => {
      openGroupPop({ mode: 'create', assignBookId: book.id, returnTo: 'cardpop' });
    }, 'ghost'));
    if (focused >= 0) NC.focus(pop.querySelectorAll('button')[focused], pop.querySelector('button'));
  }

  function popItem(label, iconSvg, active, onClick, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pop-item' + (active ? ' on' : '') + (cls ? ' ' + cls : '');
    if (iconSvg) {
      const ic = document.createElement('span');
      ic.className = 'pop-ic';
      ic.innerHTML = iconSvg;
      b.appendChild(ic);
    }
    const lab = document.createElement('span');
    lab.className = 'pop-label';
    lab.textContent = label;
    b.appendChild(lab);
    const mark = document.createElement('span');
    mark.className = 'pop-mark';
    mark.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19.5 6.5L9.8 16.2 4.5 10.9"/></svg>';
    b.appendChild(mark);
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function closeCardPop() {
    const id = cardPopBook;
    cardPopBook = null;
    cardPopAnchor = null;
    const pop = NC.$('#card-pop');
    if (!pop || pop.hidden) return;
    const restore = pop.contains(document.activeElement);
    pop.hidden = true;
    const menu = NC.$(`#book-grid [data-book-id="${CSS.escape(String(id))}"] .card-menu`);
    menu?.setAttribute('aria-expanded', 'false');
    if (restore) {
      const card = menu?.closest('.card');
      NC.focus(card?.querySelector('.card-open'), NC.$('#lib-search'));
      NC.focus(menu);
    }
  }

  /* ── Modale « groupe » : création et renommage (V2.14) ── */
  function nextOrder() {
    return groups.reduce((m, g) => Math.max(m, g.order || 0), 0) + 1;
  }

  function openGroupPop(opts) {
    groupPopMode = opts || { mode: 'create' };
    const pop = NC.$('#group-pop');
    const input = NC.$('#group-pop-name');
    NC.$('#group-pop-title').textContent = groupPopMode.mode === 'rename' ? 'Renommer le groupe' : 'Nouveau groupe';
    NC.$('#group-save').textContent = groupPopMode.mode === 'rename' ? 'Renommer' : 'Créer';
    input.value = groupPopMode.mode === 'rename' ? (groupOf(groupPopMode.groupId) || {}).name || '' : '';
    const opener = document.activeElement;
    NC.$('#groups-manage').hidden = true; // si on vient de la gestion
    NC.modal.show(pop, { backdrop: NC.$('#modal-backdrop'), initial: input, opener,
      dismiss: closeGroupPop, fallback: () => groupPopMode?.returnTo === 'manage'
        ? NC.$('#groups-manage-new') : NC.$('#card-pop button') || NC.$('#filter-groups .ghost') });
    input.select();
  }

  function closeGroupPop(backToManage) {
    const fromManage = backToManage === 'manage' || groupPopMode?.returnTo === 'manage';
    if (groupPopMode && groupPopMode.returnTo === 'cardpop' && !backToManage && cardPopBook) {
      /* Le menu de rangement reprend la main, à jour, à sa place. */
      buildCardPop();
      const pop = NC.$('#card-pop');
      if (cardPopAnchor) { pop.style.left = cardPopAnchor.x + 'px'; pop.style.top = cardPopAnchor.y + 'px'; }
    }
    if (fromManage) {
      NC.$('#groups-manage').hidden = false;
      renderManageList();
    }
    NC.modal.hide(NC.$('#group-pop'));
    groupPopMode = null;
  }

  async function saveGroupPop() {
    const mode = groupPopMode || { mode: 'create' };
    const input = NC.$('#group-pop-name');
    const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) { input.focus(); return; }
    const dup = groups.find((g) => g.name.toLowerCase() === name.toLowerCase() && g.id !== mode.groupId);
    if (dup) { NC.toast(`Un groupe porte déjà ce nom.`, 'error', 2200); input.focus(); input.select(); return; }
    try {
      if (mode.mode === 'rename') {
        const saved = await NC.db.renameGroup(mode.groupId, name);
        if (!saved) throw new Error('Groupe introuvable');
        groups = groups.map((group) => group.id === saved.id ? saved : group);
        renderedBooks = [];
        NC.toast(`Groupe renommé en « ${name} ».`);
      } else {
        const g = { id: crypto.randomUUID(), name, order: nextOrder(), createdAt: Date.now() };
        await NC.db.putGroup(g);
        groups.push(g);
        if (mode.assignBookId) await assignGroup(mode.assignBookId, g.id);
        NC.toast(`Groupe « ${name} » créé.`, 'success');
      }
      sortGroups();
    } catch (error) {
      NC.toast('Le groupe n’a pas pu être enregistré.', 'error');
      return;
    }
    renderFilters();
    render();
    closeGroupPop(mode.returnTo === 'manage' ? 'manage' : undefined);
  }

  /* ── Modale « Gérer les groupes » (V2.14) ── */
  function openManage() {
    renderManageList();
    NC.modal.show(NC.$('#groups-manage'), { backdrop: NC.$('#modal-backdrop'),
      initial: NC.$('#groups-manage-close'), dismiss: closeManage,
      fallback: () => NC.$('#filter-groups .manage') || NC.$('#filter-groups .ghost') });
  }

  function closeManage() {
    NC.modal.hide(NC.$('#groups-manage'));
  }

  function renderManageList() {
    const list = NC.$('#groups-manage-list');
    list.innerHTML = '';
    NC.$('#groups-manage-empty').hidden = groups.length > 0;
    for (const g of groups) {
      const row = document.createElement('div');
      row.className = 'group-row';
      const name = document.createElement('span');
      name.className = 'group-name';
      name.textContent = g.name;
      const n = books.filter((b) => metaOf(b.id).groupId === g.id).length;
      const cnt = document.createElement('span');
      cnt.className = 'group-count';
      cnt.textContent = n + (n > 1 ? ' livres' : ' livre');
      const ren = document.createElement('button');
      ren.type = 'button';
      ren.className = 'group-act';
      ren.title = 'Renommer ce groupe';
      ren.setAttribute('aria-label', `Renommer ${g.name}`);
      ren.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 17l9.5-9.5a2.1 2.1 0 0 1 3 3L8 20l-4 1z"/></svg>';
      ren.addEventListener('click', () => openGroupPop({ mode: 'rename', groupId: g.id, returnTo: 'manage' }));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'group-act danger';
      del.title = 'Supprimer ce groupe';
      del.setAttribute('aria-label', `Supprimer ${g.name}`);
      del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2m-8 0l1 13h8l1-13"/></svg>';
      del.addEventListener('click', () => deleteGroupFlow(g, del));
      row.append(name, cnt, ren, del);
      list.appendChild(row);
    }
  }

  /* Suppression en deux clics (même grammaire que la suppression de
     livre) : le groupe disparaît, ses livres retournent « sans
     groupe » — aucun livre n'est supprimé. */
  async function deleteGroupFlow(g, btn) {
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.title = 'Cliquer à nouveau pour confirmer';
      setTimeout(() => { btn.classList.remove('confirm'); btn.title = 'Supprimer ce groupe'; }, 2600);
      return;
    }
    try {
      await NC.db.deleteGroup(g.id);
    } catch (error) {
      NC.toast('Le groupe n’a pas pu être supprimé.', 'error');
      return;
    }
    groups = groups.filter((x) => x.id !== g.id);
    for (const [id, m] of Array.from(metas)) {
      if (m.groupId === g.id) metas.set(id, Object.assign({}, m, { groupId: null, updatedAt: Date.now() }));
    }
    if (filter.group === g.id) { filter.group = 'all'; NC.libFilterSave(filter); }
    renderManageList();
    renderFilters();
    render();
    if (cardPopBook) buildCardPop();
    NC.toast(`Groupe « ${g.name} » supprimé — ses livres restent dans la bibliothèque.`);
  }

  /* ── Édition des métadonnées d'un livre (V2.20) ──
     Titre, auteur et couverture se corrigent depuis le crayon de la
     carte : les métadonnées des PDF sont souvent bancales (titre
     « microsoft word - … », auteur vide, première page sans grâce).
     Trois gestes pour la couverture : une image choisie (contenue en
     640 px, JPEG), le retour aux initiales élégantes, ou la jaquette
     d'origine réextraite du fichier stocké. Enregistrer écrit UNE
     fiche ; le fichier du livre, lui, n'est jamais retouché. */
  const normTitle = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Sans titre';
  const editTitleValue = () => {
    const t = NC.$('#edit-title');
    return t ? t.value : '';
  };

  function openBookEdit(book) {
    editBookId = book.id;
    editCoverState = 'untouched';
    editCoverData = null;
    editExtractSeq++; // une extraction abandonnée ne rattrapera pas la modale
    closeCardPop();
    NC.$('#edit-title').value = book.title;
    NC.$('#edit-author').value = book.author || '';
    renderEditCover();
    const t = NC.$('#edit-title');
    NC.modal.show(NC.$('#book-edit'), { backdrop: NC.$('#modal-backdrop'), initial: t,
      dismiss: closeBookEdit, fallback: () => {
        const card = NC.$(`#book-grid [data-book-id="${CSS.escape(String(book.id))}"]`);
        NC.focus(card?.querySelector('.card-open'));
        return card?.querySelector('.card-edit') || NC.$('#lib-search');
      } });
    t.select();
  }

  function closeBookEdit() {
    editBookId = null;
    editCoverState = 'untouched';
    editCoverData = null;
    editExtractSeq++;
    NC.modal.hide(NC.$('#book-edit'));
  }

  /* Aperçu de couverture : l'image de remplacement, celle de la fiche
     actuelle, ou les initiales du titre tapé (suivi à la frappe). */
  function renderEditCover() {
    const box = NC.$('#edit-cover-box');
    if (!box) return;
    let data = null;
    if (editCoverState === 'set') data = editCoverData;
    else if (editCoverState === 'removed') data = null; // retirée : aperçu aux initiales
    else if (editBookId) {
      const b = books.find((x) => x.id === editBookId);
      data = b ? (b.cover || null) : null;
    }
    box.innerHTML = '';
    if (data) {
      const img = document.createElement('img');
      img.src = data;
      img.alt = 'Couverture du livre';
      box.appendChild(img);
    } else {
      const gen = document.createElement('div');
      gen.className = 'gen';
      gen.textContent = initials(editTitleValue());
      box.appendChild(gen);
    }
    NC.$('#edit-cover-remove').hidden = !data;
  }

  /* Image choisie : décodée, contenue dans 640 px (JPEG 0.82) — une
     couverture est décorative, pas archivistique. Le fond du canevas
     est posé avant le dessin : un PNG transparent ne devient pas noir
     mais prend la matière des cartes sans image. */
  function shrinkImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 640;
          const long = Math.max(img.naturalWidth, img.naturalHeight) || 1;
          const k = Math.min(1, MAX / long);
          const w = Math.max(1, Math.round(img.naturalWidth * k));
          const h = Math.max(1, Math.round(img.naturalHeight * k));
          const cnv = document.createElement('canvas');
          cnv.width = w; cnv.height = h;
          const ctx = cnv.getContext('2d');
          ctx.fillStyle = '#1d1e24';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          res(cnv.toDataURL('image/jpeg', 0.82));
        } catch (e) { URL.revokeObjectURL(url); rej(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image illisible')); };
      img.src = url;
    });
  }

  async function loadEditCoverFile(file) {
    if (!editBookId) return;
    if (!/^image\//.test(file.type || '')) {
      NC.toast('Ce fichier n\u2019est pas une image.', 'error');
      return;
    }
    try {
      const data = await shrinkImage(file);
      editCoverState = 'set';
      editCoverData = data;
      renderEditCover();
    } catch (e) {
      NC.toast('Image illisible — essayez un PNG ou un JPEG.', 'error');
    }
  }

  /* « Rétablir l'origine » : la jaquette revient du fichier lui-même.
     Le bouton raconte ce qu'il fait pendant l'extraction, et une
     fermeture de modale rend le résultat inoffensif (compteur). */
  async function restoreOrigCover() {
    const book = books.find((b) => b.id === editBookId);
    const btn = NC.$('#edit-cover-orig');
    if (!book || !btn || btn.disabled) return;
    const seq = ++editExtractSeq;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Extraction…';
    try {
      const stored = await NC.db.getBook(book.id);
      if (!stored) throw new Error('Livre introuvable');
      const data = await extractOriginalCover(stored);
      if (seq !== editExtractSeq || !editBookId) return; // modale fermée entre-temps
      if (!data) {
        NC.toast('Aucune jaquette trouvée dans le fichier du livre.', 'error');
        return;
      }
      editCoverState = 'set';
      editCoverData = data;
      renderEditCover();
    } catch (e) {
      console.error('Réextraction de couverture', e);
      if (seq === editExtractSeq) NC.toast('La couverture du fichier n\u2019a pas pu être extraite.', 'error');
    } finally {
      if (seq === editExtractSeq) { btn.disabled = false; btn.textContent = prev; }
    }
  }

  async function saveBookEdit() {
    const book = books.find((b) => b.id === editBookId);
    if (!book) { closeBookEdit(); return; }
    const title = normTitle(NC.$('#edit-title').value);
    const author = String(NC.$('#edit-author').value || '')
      .replace(/\s+/g, ' ').trim().slice(0, 120);
    const oldTitle = book.title;
    const patch = { title, author };
    if (editCoverState === 'set') patch.cover = editCoverData;
    else if (editCoverState === 'removed') patch.cover = null;
    try {
      const saved = await NC.db.patchBook(book.id, patch);
      if (!saved) throw new Error('Livre introuvable');
      const { data, ...metadata } = saved;
      books = books.map((row) => row.id === book.id ? { ...metadata, lastOpened: row.lastOpened } : row);
    } catch (e) {
      console.error('Fiche livre', e);
      NC.toast('La fiche n\u2019a pas pu être enregistrée (stockage saturé ?).', 'error');
      return;
    }
    closeBookEdit();
    render(); // grille, recherche, tri et compteurs suivent la fiche corrigée
    NC.toast(oldTitle !== title
      ? `« ${oldTitle} » s\u2019appelle désormais « ${title} » — fiche mise à jour.`
      : `Fiche de « ${title} » mise à jour.`, 'success');
  }

  /* ── Glisser-déposer (V2.15 : les dossiers aussi) ──
     dataTransfer n'est vivant que PENDANT l'événement : on saisit
     alors les entrées (webkitGetAsEntry — fichiers et dossiers). Un
     dossier glissé est parcouru en profondeur et seuls ses EPUB/PDF
     remontent ; sans l'API d'entrées, repli sur la liste plate des
     fichiers, exactement comme avant. */
  function wireDnD() {
    const overlay = NC.$('#drop-overlay');
    window.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault(); dragDepth++; overlay.hidden = false;
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('dragleave', (e) => {
      e.preventDefault(); dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) overlay.hidden = true;
    });
    window.addEventListener('drop', onDrop);
  }

  function onDrop(e) {
    e.preventDefault();
    dragDepth = 0;
    const overlay = NC.$('#drop-overlay');
    if (overlay) overlay.hidden = true;
    const dt = e.dataTransfer;
    if (!dt) return;
    /* Saisie des entrées pendant l'événement — dataTransfer est
       neutralisé dès que le gestionnaire rend la main. */
    const entries = Array.from(dt.items || []).map((it) => {
      try { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; }
      catch (err) { return null; }
    }).filter(Boolean);
    if (entries.some((en) => en.isDirectory)) {
      walkEntries(entries).then((files) => {
        if (files.length) importFiles(files);
        else NC.toast('Aucun fichier EPUB ni PDF dans ce dépôt.', 'error');
      }).catch((err) => console.error('Parcours du dépôt', err));
    } else if (dt.files && dt.files.length) {
      importFiles(dt.files);
    }
  }

  /* Parcours récursif des entrées déposées, borné : une arborescence
     immense ne doit pas figer la page (profondeur max 8, 600 livres).
     Les dossiers se lisent par lots — les navigateurs les rendent par
     100 entrées — on enchaîne jusqu'au lot vide. Seuls les EPUB/PDF
     remontent : le reste de l'arborescence (jaquettes, calibre,
     fichiers système) est ignoré en silence. */
  function walkEntries(entries) {
    const out = [];
    const MAX_FILES = 600, MAX_DEPTH = 8;
    const readBatch = (reader) => new Promise((res) => reader.readEntries(res, () => res([])));
    async function walk(list, d) {
      for (const en of list) {
        if (out.length >= MAX_FILES) return;
        if (!en) continue;
        if (en.isFile) {
          if (!BOOK_EXT_RE.test(en.name)) continue;
          try { out.push(await new Promise((res, rej) => en.file(res, rej))); }
          catch (err) { /* fichier injoignable : ignoré */ }
        } else if (en.isDirectory && d < MAX_DEPTH) {
          const reader = en.createReader();
          for (let lot = await readBatch(reader);
               lot.length && out.length < MAX_FILES;
               lot = await readBatch(reader)) {
            await walk(lot, d + 1);
          }
        }
      }
    }
    return walk(entries, 0).then(() => out);
  }

  /* ── Recherche & tri : câblage (V2.16) ──
     La recherche part après une courte temporisation (une frappe
     rapide ne relance pas le rendu à chaque lettre) ; Échap la vide.
     Le tri applique la clé choisie — avec son sens naturel (A → Z
     pour les textes, récent d'abord pour les dates) — et le bouton
     de sens s'inverse et se relibelle ensuite. */
  function syncSortDir() {
    const btn = NC.$('#lib-sort-dir');
    if (!btn) return;
    const alpha = sortState.by === 'title' || sortState.by === 'author';
    const label = alpha
      ? (sortState.dir === 'asc' ? 'A → Z' : 'Z → A')
      : (sortState.dir === 'asc' ? 'Ancien d’abord' : 'Récent d’abord');
    btn.textContent = label;
    btn.title = 'Inverser le sens du tri';
    btn.setAttribute('aria-label', 'Sens du tri : ' + label + '. Cliquer pour inverser.');
  }

  function wireSearchSort() {
    const search = NC.$('#lib-search');
    const sel = NC.$('#lib-sort');
    const dirBtn = NC.$('#lib-sort-dir');
    if (!search || !sel || !dirBtn) return;
    sel.value = sortState.by;
    syncSortDir();
    let deb = null;
    search.addEventListener('input', () => {
      clearTimeout(deb);
      deb = setTimeout(() => {
        query = search.value.trim();
        foldedQuery = NC.foldText(query);
        renderFilters(); render();
      }, 140);
    });
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // Échap vide la recherche sans toucher aux popovers
      search.value = '';
      query = '';
      foldedQuery = '';
      renderFilters(); render();
    });
    sel.addEventListener('change', () => {
      sortState.by = sel.value;
      sortState.dir = (sel.value === 'title' || sel.value === 'author') ? 'asc' : 'desc';
      NC.libSortSave(sortState);
      syncSortDir(); render();
    });
    dirBtn.addEventListener('click', () => {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      NC.libSortSave(sortState);
      syncSortDir(); render();
    });
  }

  /* ── Initialisation ── */
  function init() {
    let needsRefresh = false;
    let refreshTimer;
    function refreshFromOtherTab() {
      if (!needsRefresh || document.hidden || NC.$('#view-library').hidden) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        needsRefresh = false;
        refresh().catch((error) => console.warn('Actualisation de la bibliothèque', error));
      }, 150);
    }
    NC.db.onCatalogChange(() => { needsRefresh = true; refreshFromOtherTab(); });
    document.addEventListener('visibilitychange', refreshFromOtherTab);
    NC.$('#btn-add').addEventListener('click', () => NC.$('#file-input').click());
    NC.$('#empty-add').addEventListener('click', () => NC.$('#file-input').click());
    const input = NC.$('#file-input');
    input.addEventListener('change', () => { importFiles(input.files); input.value = ''; });
    wireDnD();

    /* Filtres : le bouton de réinitialisation de l'état vide.
       Recherche & tri (V2.16) : leur propre câblage. */
    NC.$('#filter-reset').addEventListener('click', resetFilters);
    wireSearchSort();

    /* Édition des métadonnées (V2.20) : boutons, Entrée = valider,
       l'aperçu suit le titre tapé tant qu'il n'y a pas d'image. */
    NC.$('#edit-save').addEventListener('click', saveBookEdit);
    NC.$('#edit-cancel').addEventListener('click', closeBookEdit);
    NC.$('#edit-cover-change').addEventListener('click', () => NC.$('#edit-cover-input').click());
    NC.$('#edit-cover-orig').addEventListener('click', restoreOrigCover);
    NC.$('#edit-cover-remove').addEventListener('click', () => {
      editCoverState = 'removed';
      editCoverData = null;
      renderEditCover();
    });
    NC.$('#edit-cover-input').addEventListener('change', () => {
      const f = NC.$('#edit-cover-input').files && NC.$('#edit-cover-input').files[0];
      NC.$('#edit-cover-input').value = '';
      if (f) loadEditCoverFile(f);
    });
    ['#edit-title', '#edit-author'].forEach((sel) => {
      NC.$(sel).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveBookEdit(); }
      });
    });
    NC.$('#edit-title').addEventListener('input', () => {
      if (!NC.$('#edit-cover-box img')) renderEditCover();
    });

    /* Menu de rangement : clic ailleurs → fermer. La grille qui
       défile détache le popover de sa carte : on le referme. */
    document.addEventListener('click', (e) => {
      const pop = NC.$('#card-pop');
      if (pop && !pop.hidden && !e.target.closest('#card-pop') && !e.target.closest('.card-menu')) closeCardPop();
    });
    NC.$('#book-grid').addEventListener('scroll', closeCardPop, { passive: true });
    NC.$('#view-library').addEventListener('scroll', closeCardPop, { passive: true });

    /* Modales de groupes : boutons, Entrée = valider, Échap = annuler. */
    NC.$('#group-save').addEventListener('click', saveGroupPop);
    NC.$('#group-cancel').addEventListener('click', () => {
      const back = groupPopMode && groupPopMode.returnTo === 'manage';
      closeGroupPop(back ? 'manage' : undefined);
    });
    NC.$('#group-pop-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveGroupPop(); }
    });
    NC.$('#groups-manage-new').addEventListener('click', () => openGroupPop({ mode: 'create', returnTo: 'manage' }));
    NC.$('#groups-manage-close').addEventListener('click', closeManage);
    NC.$('#modal-backdrop').addEventListener('click', () => {
      if (editBookId) closeBookEdit();
      else if (!NC.$('#goal-pop').hidden) NC.goal.close(); // objectif (V2.24)
      else if (groupPopMode) { const back = groupPopMode.returnTo === 'manage'; closeGroupPop(back ? 'manage' : undefined); }
      else closeManage();
    });

    /* Échap referme d'abord les fenêtres de la bibliothèque. Le
       raccourci global du lecteur ne s'applique qu'à sa propre vue. */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCardPop();
    });

    return refresh();
  }

  /* _onDrop et _walkEntries : crochets de vérification (dépôt simulé
     avec entrées factices), même philosophie que NC.reader._state(). */
  return {
    init, refresh, importFiles, focusBook,
    notebookBooks: () => books.map(({ id, title, author, type }) => ({ id, title, author, type })),
    /* Packs (V2.22) : aperçu d'un fichier sans l'ajouter, import
       d'un fichier avec méta déjà lue, doublons, raison d'échec. */
    importOne, peepFile, librarySignatures, looksKnown, shortReason,
    /* Objectif de lecture (V2.24) : les « Terminé » datés, le volume de
       la bibliothèque (la bannière ne parle qu'à du monde) — et le
       changement de statut, exposé pour les vérifications automatisées. */
    finishedBooks, count: () => books.length, setBookStatus,
    _onDrop: onDrop, _walkEntries: walkEntries,
  };
})();
