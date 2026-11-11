/* NUIT CALME — packs de livres (V2.22, chantier n° 17).
   Un espace où piocher des collections préparées par l'hébergeur du
   site : un dossier packs/ posé à côté de index.html, dont la liste
   (packs/index.json) est reconstruite toute seule par un workflow
   GitHub à chaque poussée. Le lecteur parcourt un pack, voit les
   couvertures extraites à la volée, repère ce qu'il possède déjà
   (« Déjà là »), puis importe un pack entier ou livre par livre —
   des COPIES rejoignent sa bibliothèque ; rien n'est jamais lié au
   site, un pack retiré ne retire rien à personne.

   Deux formats de pack, du plus simple au plus compact :
   • « dossier » — la liste des fichiers vit dans l'index, l'app va
     chercher chaque livre au moment de l'aperçu ;
   • « zip » — l'archive entière est téléchargée puis décompressée
     dans le navigateur (JSZip, déjà embarqué pour les EPUB). */
'use strict';

window.NC = window.NC || {};

NC.packs = (() => {
  const BOOK_RE = /\.(epub|pdf)$/i;
  /* Entrées d'archive à ignorer : métadonnées macOS, fichiers cachés. */
  const JUNK_RE = /(^|\/)(__MACOSX|\.)/;

  /* packs : la liste de l'index ; session : le pack ouvert (fichiers
     aperçus, archive décompressée, jeton d'annulation) ; openPackId :
     le pack affiché — les promesses en vol vérifient les deux avant
     de toucher au DOM (retour en arrière pendant un chargement). */
  let packs = [];
  let openPackId = null;
  let session = null;
  let seqGen = 0;   // jeton global : une promesse en vol d'un pack précédent ne peut plus écrire
  let sigs = []; // signatures pliées de la bibliothèque, pour les doublons

  const $ = (sel) => document.querySelector(sel);
  const stale = (seq, packId) => !session || session.seq !== seq || openPackId !== packId;

  /* ── L'index des packs ──
     Servi par le site (GitHub Pages reconstruit packs/index.json à
     chaque poussée). 404 = pas encore de packs, ce n'est pas une
     erreur. En fichier local (file://), le navigateur interdit la
     lecture — on l'explique au lieu de laisser un échec opaque. */
  async function fetchManifest() {
    if (location.protocol === 'file:') {
      const err = new Error('file://');
      err.amiable = true;
      throw err;
    }
    let res;
    try {
      res = await fetch('packs/index.json', { cache: 'no-store' });
    } catch (e) {
      const err = new Error('réseau');
      err.amiable = true;
      throw err;
    }
    if (res.status === 404) return { packs: [] };
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = await res.json();
    if (!doc || !Array.isArray(doc.packs)) return { packs: [] };
    // Un pack sans source, ou vide sans être une archive, n'a pas de sens.
    doc.packs = doc.packs.filter((p) => p && p.id && p.source &&
      (p.type === 'zip' || (Array.isArray(p.livres) && p.livres.length)));
    return doc;
  }

  /* ── Ouverture / fermeture de la vue ── */
  function openView() {
    $('#view-library').hidden = true;
    $('#view-packs').hidden = false;
    showList();
    loadList();
  }

  function closeView() {
    dropSession();
    openPackId = null;
    $('#view-packs').hidden = true;
    $('#view-library').hidden = false;
  }

  function showList() {
    dropSession();
    $('#packs-detail').hidden = true;
    $('#pack-books').innerHTML = ''; // les cartes du pack quitte, leurs aperçus aussi
    $('#packs-list').hidden = false;
  }

  function dropSession() {
    session = null; // l'archive et les blobs aperçus repartent au GC
  }

  /* ── La liste des packs ── */
  async function loadList() {
    const note = $('#packs-note');
    const noteText = $('#packs-note-text');
    const retry = $('#packs-retry');
    note.hidden = true;
    retry.hidden = true;
    $('#packs-grid').innerHTML = '';
    let doc;
    try {
      doc = await fetchManifest();
    } catch (e) {
      if (!$('#view-packs').hidden && !$('#packs-list').hidden) {
        note.hidden = false;
        if (e.amiable && location.protocol === 'file:') {
          noteText.textContent = 'Les packs vivent sur le site en ligne. Ouvrez Nuit Calme depuis son adresse https pour les parcourir.';
        } else if (e.amiable) {
          noteText.textContent = 'Impossible de joindre le site — vérifiez la connexion, puis réessayez.';
          retry.hidden = false;
        } else {
          noteText.textContent = 'La liste des packs n\u2019a pas pu être lue (' + (e.message || 'erreur') + ').';
          retry.hidden = false;
        }
      }
      return;
    }
    if (!$('#view-packs').hidden && !$('#packs-list').hidden) {
      packs = doc.packs;
      renderList();
    }
  }

  function packSize(p) {
    if (p.type === 'zip') return p.taille || 0;
    return (p.livres || []).reduce((s, l) => s + (l.taille || 0), 0);
  }

  function renderList() {
    const grid = $('#packs-grid');
    const note = $('#packs-note');
    const noteText = $('#packs-note-text');
    grid.innerHTML = '';
    note.hidden = packs.length > 0;
    if (!packs.length) {
      noteText.textContent = 'Aucun pack pour l\u2019instant. Déposez un dossier ou une archive .zip dans packs/ et poussez : la liste se met à jour toute seule.';
      return;
    }
    for (const p of packs) {
      const card = document.createElement('article');
      card.className = 'pack-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Parcourir le pack ${p.titre || p.id}`);

      const icon = document.createElement('div');
      icon.className = 'pack-card-icon';
      icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 4.5h4.4v15H4.5z"/><path d="M10.6 6.8h4.4v12.7h-4.4z"/><path d="M16.7 9.2h3.3v10.3h-3.3z"/></svg>';

      const body = document.createElement('div');
      body.className = 'pack-card-body';
      const h = document.createElement('h3');
      h.className = 'pack-card-title';
      h.textContent = p.titre || p.id;
      body.appendChild(h);
      if (p.description) {
        const d = document.createElement('p');
        d.className = 'pack-card-desc';
        d.textContent = p.description;
        body.appendChild(d);
      }
      const meta = document.createElement('p');
      meta.className = 'pack-card-meta';
      const n = p.type === 'zip' ? null : (p.livres || []).filter((l) => BOOK_RE.test(l.fichier)).length;
      const bits = [];
      bits.push(n != null ? (n > 1 ? n + ' livres' : n + ' livre') : 'Archive .zip');
      const sz = NC.fmtSize(packSize(p));
      if (sz) bits.push(sz);
      meta.textContent = bits.join(' · ');
      body.appendChild(meta);

      const go = document.createElement('span');
      go.className = 'pack-card-go';
      go.textContent = 'Parcourir';
      body.appendChild(go);

      card.append(icon, body);
      card.addEventListener('click', () => openDetail(p));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(p); }
      });
      grid.appendChild(card);
    }
  }

  /* ── Le détail d'un pack ── */
  function openDetail(pack) {
    dropSession();
    openPackId = pack.id;
    sigs = NC.library.librarySignatures();
    session = { pack, entries: new Map(), seq: ++seqGen, zip: null };
    $('#packs-list').hidden = true;
    $('#packs-note').hidden = true;
    $('#packs-detail').hidden = false;
    $('#pack-detail-title').textContent = pack.titre || pack.id;
    $('#pack-detail-desc').textContent = pack.description || '';
    $('#pack-detail-desc').hidden = !pack.description;
    $('#pack-books').innerHTML = '';
    updateDetailSub();
    updateImportAllBtn();
    if (pack.type === 'zip') loadZipPack(pack);
    else loadFolderPack(pack);
  }

  function backToList() {
    openPackId = null;
    showList();
  }

  function updateDetailSub() {
    const el = $('#pack-detail-sub');
    if (!session) return;
    const entries = Array.from(session.entries.values());
    const n = entries.length;
    const sz = entries.reduce((s, e) => s + (e.file ? e.file.size : (e.tailleManifest || 0)), 0)
      || (session.pack.type === 'zip' && !entries.length ? (session.pack.taille || 0) : 0);
    const dupes = entries.filter((e) => e.dupe).length;
    const bits = [n > 1 ? n + ' livres' : n + ' livre'];
    const fsz = NC.fmtSize(sz);
    if (fsz) bits.push(fsz);
    if (dupes) bits.push(dupes + (dupes > 1 ? ' déjà dans votre bibliothèque' : ' déjà dans votre bibliothèque'));
    el.textContent = bits.join(' · ');
  }

  function updateImportAllBtn() {
    const btn = $('#pack-import-all');
    if (!session) return;
    const entries = Array.from(session.entries.values());
    if (!entries.length || entries.some((e) => !e.file && !e.error)) {
      btn.disabled = true;
      btn.textContent = 'Chargement…';
      return;
    }
    const todo = entries.filter((e) => e.file && e.state === 'ready' && !e.dupe).length;
    btn.disabled = todo === 0;
    btn.textContent = todo > 0 ? `Tout importer (${todo})` : 'Tout importer';
  }

  /* Carte d'un livre du pack — la même silhouette que les cartes de
     la bibliothèque (couverture, initiales en repli, badge de format),
     avec « Ajouter » à la place de « Lire ». */
  function addBookCard(key, provisionalTitle) {
    const card = document.createElement('article');
    card.className = 'card pk-card';
    card.dataset.key = key;

    const cover = document.createElement('div');
    cover.className = 'card-cover';
    const gen = document.createElement('div');
    gen.className = 'gen';
    gen.textContent = initials(provisionalTitle);
    cover.appendChild(gen);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = /\.pdf$/i.test(key) ? 'PDF' : 'EPUB';
    cover.appendChild(badge);

    const load = document.createElement('div');
    load.className = 'pk-load';
    cover.appendChild(load);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const h = document.createElement('h3');
    h.className = 'card-title';
    h.textContent = provisionalTitle;
    const p = document.createElement('p');
    p.className = 'card-author';
    p.textContent = 'Lecture…';
    meta.append(h, p);

    const tags = document.createElement('div');
    tags.className = 'card-tags';
    meta.appendChild(tags);

    card.append(cover, meta);
    $('#pack-books').appendChild(card);
    return card;
  }

  function cardOf(key) { return $('#pack-books').querySelector(`.pk-card[data-key="${CSS.escape(key)}"]`); }

  /* La carte passe de l'aperçu prometteur à la fiche réelle :
     jaquette, titre, auteur, taille — et « Déjà là » le cas échéant. */
  function fillBookCard(key, st) {
    const card = cardOf(key);
    if (!card) return;
    const meta = st.meta;
    const cover = card.querySelector('.card-cover');
    cover.querySelector('.gen') && cover.querySelector('.gen').remove();
    if (meta.cover) {
      const img = document.createElement('img');
      img.src = meta.cover;
      img.alt = `Couverture de ${meta.title || key}`;
      cover.insertBefore(img, cover.firstChild);
    } else {
      const gen = document.createElement('div');
      gen.className = 'gen';
      gen.textContent = initials(meta.title || key);
      cover.insertBefore(gen, cover.firstChild);
    }
    card.querySelector('.pk-load').remove();

    const h = card.querySelector('.card-title');
    h.textContent = meta.title || key.replace(/\.(epub|pdf)$/i, '');
    const p = card.querySelector('.card-author');
    const bits = [];
    if (meta.author) bits.push(meta.author);
    const fsz = NC.fmtSize(st.file ? st.file.size : 0);
    if (fsz) bits.push(fsz);
    p.textContent = bits.join(' · ') || (meta.type === 'epub' ? 'EPUB' : 'PDF');

    const tags = card.querySelector('.card-tags');
    tags.innerHTML = '';
    if (st.dupe) {
      const t = document.createElement('span');
      t.className = 'tag pk-inlib';
      t.textContent = 'Déjà là';
      tags.appendChild(t);
    }
    const done = document.createElement('div');
    done.className = 'pk-act';
    cover.appendChild(done);
    refreshAction(key);
  }

  function failBookCard(key, err) {
    const card = cardOf(key);
    if (!card) return;
    card.querySelector('.pk-load') && card.querySelector('.pk-load').remove();
    const p = card.querySelector('.card-author');
    p.textContent = 'Illisible' + (err && err.message ? ' — ' + err.message : '');
    const tags = card.querySelector('.card-tags');
    const t = document.createElement('span');
    t.className = 'tag pk-err';
    t.textContent = 'Échec';
    tags.appendChild(t);
    const done = document.createElement('div');
    done.className = 'pk-act';
    card.querySelector('.card-cover').appendChild(done);
    refreshAction(key);
  }

  /* Le bouton d'ajout, recréé à chaque changement d'état (ajouté,
     occupé, doublon) — la carte reste la source de vérité du visuel. */
  function refreshAction(key) {
    const card = cardOf(key);
    if (!card || !session) return;
    const st = session.entries.get(key);
    const act = card.querySelector('.pk-act');
    if (!act || !st) return;
    act.innerHTML = '';
    act.classList.remove('pk-added', 'pk-busy');
    if (st.state === 'added') {
      act.classList.add('pk-added');
      act.textContent = 'Ajouté ✓';
      return;
    }
    if (st.busy) {
      act.classList.add('pk-busy');
      act.textContent = 'Ajout…';
      return;
    }
    if (st.dupe || st.error) { act.textContent = ''; return; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pk-add';
    btn.textContent = 'Ajouter';
    btn.addEventListener('click', (e) => { e.stopPropagation(); addOne(key); });
    act.appendChild(btn);
  }

  function setBusy(key, busy) {
    const st = session && session.entries.get(key);
    if (!st) return;
    st.busy = busy;
    const card = cardOf(key);
    if (card) card.classList.toggle('pk-busy', !!busy);
    refreshAction(key);
  }

  function markAdded(key) {
    const st = session && session.entries.get(key);
    if (!st) return;
    st.state = 'added';
    const card = cardOf(key);
    if (card && !card.querySelector('.card-tags .pk-inlib')) {
      const tags = card.querySelector('.card-tags');
      const t = document.createElement('span');
      t.className = 'tag pk-inlib';
      t.textContent = 'Dans votre bibliothèque';
      tags.appendChild(t);
    }
    refreshAction(key);
  }

  /* ── Pack « dossier » : les fichiers sont décrits dans l'index ── */
  async function loadFolderPack(pack) {
    const seq = session.seq;
    for (const l of pack.livres || []) {
      if (!BOOK_RE.test(l.fichier) || JUNK_RE.test(l.fichier)) continue;
      const nom = l.fichier;
      const titreProvisoire = nom.split('/').pop().replace(/\.(epub|pdf)$/i, '');
      session.entries.set(nom, { file: null, meta: null, state: 'loading', tailleManifest: l.taille || 0 });
      addBookCard(nom, titreProvisoire);
      try {
        const res = await fetch(pack.source + nom.split('/').map(encodeURIComponent).join('/'));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        const file = new File([blob], nom.split('/').pop(), { type: blob.type });
        const meta = await NC.library.peepFile(file);
        if (stale(seq, pack.id)) return;
        const st = session.entries.get(nom);
        st.file = file; st.meta = meta; st.state = 'ready';
        st.dupe = NC.library.looksKnown(sigs, meta.title, meta.author);
        fillBookCard(nom, st);
      } catch (e) {
        if (stale(seq, pack.id)) return;
        const st = session.entries.get(nom);
        st.error = true; st.state = 'error';
        failBookCard(nom, e);
      }
      updateDetailSub();
      updateImportAllBtn();
    }
  }

  /* ── Pack « zip » : l'archive est téléchargée puis dépliée ── */
  async function loadZipPack(pack) {
    const seq = session.seq;
    const load = addLoadingCard();
    try {
      const res = await fetch(pack.source, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const total = Number(res.headers.get('Content-Length')) || pack.taille || 0;
      let buf;
      if (res.body && total) {
        const reader = res.body.getReader();
        const morceaux = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          morceaux.push(value);
          got += value.length;
          load.progress(got / total);
        }
        buf = new Blob(morceaux);
      } else {
        buf = await res.blob();
      }
      if (stale(seq, pack.id)) return;
      load.label('Décompression…');
      const zip = await JSZip.loadAsync(await buf.arrayBuffer());
      if (stale(seq, pack.id)) return;
      session.zip = zip;
      load.remove();
      const noms = Object.keys(zip.files).filter((n) =>
        !zip.files[n].dir && BOOK_RE.test(n) && !JUNK_RE.test(n));
      noms.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
      if (!noms.length) {
        setPackError('Cette archive ne contient aucun EPUB ni PDF à la racine de ses dossiers.');
        return;
      }
      for (const nom of noms) {
        session.entries.set(nom, { file: null, meta: null, state: 'loading' });
        addBookCard(nom, nom.split('/').pop().replace(/\.(epub|pdf)$/i, ''));
      }
      updateImportAllBtn();
      for (const nom of noms) {
        const base = nom.split('/').pop();
        const blob = await zip.files[nom].async('blob');
        const file = new File([blob], base, { type: /\.pdf$/i.test(nom) ? 'application/pdf' : 'application/epub+zip' });
        const meta = await NC.library.peepFile(file);
        if (stale(seq, pack.id)) return;
        const st = session.entries.get(nom);
        st.file = file; st.meta = meta; st.state = 'ready';
        st.dupe = NC.library.looksKnown(sigs, meta.title, meta.author);
        fillBookCard(nom, st);
        updateDetailSub();
        updateImportAllBtn();
      }
    } catch (e) {
      if (stale(seq, pack.id)) return;
      load.remove();
      setPackError('L\u2019archive n\u2019a pas pu être lue (' + (e.message || 'erreur') + ').');
    }
  }

  function setPackError(msg) {
    const grid = $('#pack-books');
    const note = document.createElement('p');
    note.className = 'pack-detail-err';
    note.textContent = msg;
    grid.appendChild(note);
    updateImportAllBtn();
  }

  /* Carte de progression du téléchargement d'archive. */
  function addLoadingCard() {
    const el = document.createElement('div');
    el.className = 'pk-zipload';
    const lab = document.createElement('span');
    lab.textContent = 'Téléchargement de l\u2019archive…';
    const bar = document.createElement('div');
    bar.className = 'pk-zipbar';
    const fill = document.createElement('div');
    fill.className = 'pk-zipfill';
    bar.appendChild(fill);
    el.append(lab, bar);
    $('#pack-books').appendChild(el);
    return {
      el,
      label(t) { lab.textContent = t; },
      progress(r) { fill.style.width = Math.round(Math.min(1, Math.max(0, r)) * 100) + '%'; },
      remove() { el.remove(); },
    };
  }

  /* ── Imports ── */
  async function addOne(key) {
    if (!session) return;
    const st = session.entries.get(key);
    if (!st || !st.file || st.state !== 'ready' || st.busy || st.dupe) return;
    setBusy(key, true);
    try {
      await NC.library.importOne(st.file, st.meta, { quiet: true });
      sigs.push({ t: NC.foldText(st.meta.title || ''), a: NC.foldText(st.meta.author || '') });
      markAdded(key);
      NC.toast(`« ${st.meta.title || key} » ajouté à la bibliothèque.`, 'success');
      NC.library.refresh();
    } catch (e) {
      NC.toast(`« ${st.meta.title || key} » n\u2019a pas pu être ajouté — ${NC.library.shortReason(e)}.`, 'error');
    }
    setBusy(key, false);
    updateImportAllBtn();
  }

  async function importAll() {
    if (!session) return;
    const todo = Array.from(session.entries.entries())
      .filter(([, st]) => st.file && st.state === 'ready' && !st.dupe && !st.busy);
    if (!todo.length) return;
    const prog = NC.toastHold('Import du pack…');
    let ok = 0;
    const fails = [];
    for (let i = 0; i < todo.length; i++) {
      const [key, st] = todo[i];
      prog.update(`Import du pack — ${i + 1}/${todo.length} : « ${st.meta.title || key} »`);
      setBusy(key, true);
      try {
        await NC.library.importOne(st.file, st.meta, { quiet: true });
        sigs.push({ t: NC.foldText(st.meta.title || ''), a: NC.foldText(st.meta.author || '') });
        ok++;
        markAdded(key);
      } catch (e) {
        fails.push(`${st.meta.title || key} (${NC.library.shortReason(e)})`);
      }
      setBusy(key, false);
    }
    const dupes = Array.from(session.entries.values()).filter((e) => e.dupe).length;
    const bits = [`${ok} ${ok > 1 ? 'livres ajoutés' : 'livre ajouté'}`];
    if (dupes) bits.push(`${dupes} ${dupes > 1 ? 'étaient' : 'était'} déjà dans la bibliothèque`);
    if (fails.length) bits.push(`${fails.length} en échec : ${fails.slice(0, 2).join(' ; ')}${fails.length > 2 ? '…' : ''}`);
    prog.done(bits.join(' · '), fails.length ? 'error' : 'success', 6000);
    await NC.library.refresh();
    updateDetailSub();
    updateImportAllBtn();
  }

  const initials = (title) => {
    const words = String(title).trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'NC';
  };

  /* ── Initialisation ── */
  function init() {
    $('#btn-packs').addEventListener('click', openView);
    $('#empty-packs').addEventListener('click', openView);
    $('#packs-back').addEventListener('click', closeView);
    $('#packs-back-list').addEventListener('click', backToList);
    $('#pack-import-all').addEventListener('click', importAll);
    $('#packs-retry').addEventListener('click', loadList);

    /* Échap : d'abord le détail du pack, puis la vue entière. Les
       modales de la bibliothèque (édition, groupes) passent avant —
       leur propre garde Échap s'applique puis laisse la main. */
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || $('#view-packs').hidden) return;
      if (!$('#packs-detail').hidden) backToList();
      else closeView();
    });
  }

  return { init, openView, closeView, _state: () => ({ packs, openPackId, entries: session ? session.entries.size : 0 }) };
})();
