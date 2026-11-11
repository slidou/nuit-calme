/* NUIT CALME — orchestrateur du lecteur :
   chrome, tourne-page théâtral, tiroirs (sommaire & signets / recherche /
   soulignages / passages / statistiques), clavier étendu + mémo (n°19),
   reprise de lecture, capture, signets (n°8), historique des passages
   (n°9), statistiques de lecture (V2.12). */
'use strict';

NC.reader = (() => {
  let ctl = null;        // contrôleur epub ou pdf courant
  let current = null;    // enregistrement du livre
  let flipping = false;
  let bookTheme = 'paper'; // thème du CONTENU du livre (papier | nuit) — indépendant du site
  let focusMode = false;   // mode concentration (ajout n°5)
  let lastHighlightColor = NC.HIGHLIGHT_DEFAULT; // dernière couleur de soulignement (n°8)
  let draggingBar = false; // le curseur de progression est tenu : on ne lui reprend pas la main
  let bookmarkCache = [];  // signets du livre courant (n°8), chargés à l'ouverture
  let visit = null;        // position en cours pour l'historique (n°9) : { at, key, snap }
  let statusNow = null;    // statut de lecture du livre courant (V2.14), cache de la fiche
  let chromeHidden = false; // barres masquées par le tap central (V2.17, gestes tactiles)
  let chromeTimer = null;   // retard du re-dessin après bascule des barres
  let pdfTocMode = 'toc';   // tiroir PDF : 'toc' (sommaire) ou 'thumbs' (vignettes, V2.18)

  /* ── Statistiques de lecture (V2.12) : état du suivi ── */
  const STATS_TICK_MS = 5000;       // pas de crédit du temps
  const STATS_FLUSH_TICKS = 6;      // ~30 s entre deux écritures en base
  const STATS_MAX_SLICE_MS = 60000; // au-delà : sommeil ou saut d'horloge — pas de crédit
  const STATS_MAX_PAGES = 4;        // garde-fou contre des positions aberrantes
  let STATS_IDLE_MS = 180000;       // 3 min sans rien : lecture en pause (surchargé par les tests)
  let statsBookId = null;           // livre actuellement chronométré
  let statsTimer = null;            // intervalle de crédit (STATS_TICK_MS)
  let statsLastActivity = 0;        // dernière interaction (tourne-page, souris, clavier…)
  let statsLastTick = 0;            // dernier crédit horaire
  let statsPendingSec = 0;          // secondes accumulées, pas encore écrites en base
  let statsPendingPages = 0;        // pages accumulées, pas encore écrites en base
  let statsPageKey = '';            // dernière position comptée (anti-doublon de re-rendu)
  let statsTickN = 0;               // ticks depuis la dernière écriture

  const $ = NC.$;

  /* ── Ouverture ──
     Verrou : un double-clic ou Entrée répétée ne doit jamais lancer
     deux ouvertures concurrentes (deux contrôleurs vivants = états mélangés).
     Jeton de génération : « Retour à la bibliothèque » ou une nouvelle
     demande pendant que la précédente est encore en vol invalide ses étapes
     suivantes — le contrôleur périmé est détruit au lieu de rester vivant
     en fantôme derrière la bibliothèque (fuite d'écouteurs). */
  let opening = false;
  let openGen = 0;
  async function open(bookId) {
    if (opening) return;
    opening = true;
    const gen = ++openGen;
    try { await openInner(bookId, gen); }
    finally { opening = false; }
  }

  async function openInner(bookId, gen) {
    const rec = await NC.db.getBook(bookId);
    if (!rec) { NC.toast('Livre introuvable.', 'error'); return; }
    if (gen !== openGen) return; // cette ouverture a été dépassée entre-temps
    current = rec;
    /* Filtres du tiroir Soulignages & notes : réinitialisés à CHAQUE
       ouverture de livre — l'état d'un livre ne doit pas teinter le
       suivant (comportement documenté en V2.8, non appliqué jusqu'ici). */
    notesFilter = { q: '', type: 'all', cat: 'all' };
    /* Statut de lecture (V2.14) : ouvrir un livre, c'est le lire — « À
       lire » passe « En cours » tout seul. Un livre « Terminé » n'est
       pas rabaissé (réouverture pour une citation, un passage). */
    statusNow = null;
    initReadStatus(rec.id);

    // Vue
    $('#view-library').hidden = true;
    $('#view-reader').hidden = false;
    $('#reader-book-title').textContent = rec.title;
    $('#reader-loc').textContent = 'Ouverture…';
    $('#progress').value = 0;
    $('#pct-label').textContent = '0 %';
    $('#pos-label').textContent = '…';

    // Préférences
    const spread = await NC.db.getSetting('spread', window.innerWidth >= 1100 ? 'always' : 'none');
    /* Mode de lecture (ajout n°3) : « paginated » (pages) ou « scrolled »
       (défilement vertical) — réglage global, comme la vue double. */
    const flow = await NC.db.getSetting('flow', 'paginated');
    /* Thème du livre : préférence DU LIVRE (prefs) → dernier thème utilisé
       (global) → ancien réglage historique → papier. Quatre thèmes : papier,
       sépia, nuit, OLED. */
    let prefsRec = null;
    try { prefsRec = await NC.db.getPrefs(rec.id); } catch (e) {}
    const legacyTheme = await NC.db.getSetting('bookTheme', null);
    const lastTheme = await NC.db.getSetting('lastBookTheme', null);
    const wantedTheme = (prefsRec && prefsRec.theme) || lastTheme || legacyTheme || 'paper';
    bookTheme = NC.BOOK_THEMES[wantedTheme] ? wantedTheme : 'paper';
    document.body.dataset.bookTheme = bookTheme; // cadre adapté avant même le rendu

    /* Typographie avancée (ajout n°2) : préférence DU LIVRE (prefs.typo)
       → dernier réglage utilisé (global) → défaut. normalizeTypo garantit
       des valeurs saines même si un enregistrement ancien est incomplet. */
    const lastTypo = await NC.db.getSetting('lastTypo', null);
    const wantedTypo = NC.normalizeTypo(Object.assign(
      {},
      (lastTypo && typeof lastTypo === 'object') ? lastTypo : {},
      (prefsRec && prefsRec.typo && typeof prefsRec.typo === 'object') ? prefsRec.typo : {}
    ));

    /* Reprise EPUB : la progression (CFI, taille de police, %) vit dans le
       magasin « progress » — c'est LÀ qu'il faut la relire. rec.lastCfi /
       rec.fontSize ne servent que de repli pour d'anciens enregistrements. */
    let lastCfi = rec.lastCfi || '';
    let epubFont = (rec.type === 'epub' && rec.fontSize) ? rec.fontSize : 100;
    if (rec.type === 'epub') {
      try {
        const prog = await NC.db.getProgress(rec.id);
        if (prog) {
          if (prog.lastCfi) lastCfi = prog.lastCfi;
          if (prog.fontSize) epubFont = prog.fontSize;
        }
      } catch (e) { /* progression absente : première ouverture */ }
      /* Migration : la taille de police a désormais sa place dans prefs
         (module centralisé). L'ancienne valeur y est recopiée une seule fois. */
      if (prefsRec && prefsRec.fontSize) {
        epubFont = prefsRec.fontSize;
      } else if (epubFont !== 100) {
        const p = prefsRec || { id: rec.id };
        p.fontSize = epubFont;
        p.updatedAt = Date.now();
        NC.db.putPrefs(p).catch(() => {});
      }
    }

    $('#epub-host').hidden = rec.type !== 'epub';
    $('#pdf-stage').hidden = rec.type !== 'pdf';
    /* Soulignages & notes (tiroir) : EPUB depuis le début, PDF depuis
       le surlignage PDF (n°5) — le bouton reste visible pour les deux. */

    /* Reprise PDF : la progression légère vit dans « progress » (comme pour
       l'EPUB). rec.lastPage / rec.zoom ne servent que de repli pour les
       livres enregistrés avant la migration — et surtout, plus JAMAIS de
       réécriture du livre entier à chaque tourne-page (voir pdf-reader.js). */
    let pdfLastPage = rec.lastPage || 0;
    let pdfZoom = rec.zoom || 0;
    let pdfFit = 'page'; // ajustement (n°6) : page | largeur | hauteur
    if (rec.type === 'pdf') {
      try {
        const prog = await NC.db.getProgress(rec.id);
        if (prog) {
          if (prog.lastPage) pdfLastPage = prog.lastPage;
          if (prog.zoom) pdfZoom = prog.zoom;
          if (prog.fit) pdfFit = prog.fit;
        }
      } catch (e) { /* progression absente : première ouverture */ }
    }

    if (gen !== openGen) return; // annulé pendant la lecture des préférences

    let newCtl;
    try {
      newCtl = rec.type === 'epub'
        ? await NC.openEpub(rec, { spread, flow, lastCfi, fontSize: epubFont, theme: bookTheme, typo: wantedTypo })
        : await NC.openPdf(rec, { spread, lastPage: pdfLastPage, zoom: pdfZoom, fit: pdfFit, theme: bookTheme });
    } catch (err) {
      console.error(err);
      NC.toast(/password/i.test(String(err)) ? 'Ce PDF est protégé par un mot de passe.' : 'Ce livre n\'a pas pu être ouvert.', 'error');
      await close(true);
      return;
    }
    /* Le livre a été fermé (ou remplacé) pendant son ouverture : on détruit
       ce qui vient d'être créé au lieu de le laisser vivre en fantôme. */
    if (gen !== openGen) { try { newCtl.destroy(); } catch (e) {} return; }
    ctl = newCtl;
    /* Vignettes (V2.18) : à l'ouverture, le tiroir d'un PDF s'affiche
       en sommaire si le livre en fournit un, sinon en vignettes. */
    pdfTocMode = (ctl.type === 'pdf' && ctl.toc && ctl.toc.length) ? 'toc' : 'thumbs';
    /* Menu de sélection : en PDF, « Note » reste masquée (classe
       copy-only) — pastilles et « Souligner » sont actives depuis le
       surlignage PDF (n°5). */
    $('#sel-popup').classList.toggle('copy-only', ctl.type === 'pdf');

    ctl._onRelocated = onRelocated;
    /* Signets (n°8) : cache du livre courant, chargé une fois par
       ouverture ; l'historique (n°9) repart d'une session fraîche. */
    bookmarkCache = await NC.db.bookmarksFor(rec.id).catch(() => []);
    visit = null;
    updateBookmarkBtn();
    trackPosition(); // première position de la session (déjà connue pour le PDF)
    startStatsTracking(rec.id); // chronomètre de lecture (V2.12)
    statsNotePosition();        // la première page compte aussi (déjà affichée à l'ouverture)
    updateSpreadBtn();
    applyBookThemeUi(bookTheme);
    $('#btn-flow').hidden = rec.type !== 'epub'; // défilement vertical : EPUB seulement
    updateFlowUi();

    /* Mode concentration : réglage GLOBAL (préférence de session de
       lecture), restauré silencieusement à chaque ouverture. */
    NC.db.getSetting('focusMode', 'off')
      .then((v) => { if (ctl) applyFocus(v === 'on', { persist: false, quiet: true }); })
      .catch(() => {});

    // Reprise de lecture (basée sur les valeurs réellement restaurées)
    if (rec.type === 'epub' && lastCfi) {
      NC.toast('Reprise de lecture à l\'endroit exact où vous vous étiez arrêté.', 'success');
    } else if (rec.type === 'pdf' && pdfLastPage > 1) {
      NC.toast(`Reprise de lecture à la page ${pdfLastPage}.`, 'success');
    }
    /* « Dernière ouverture » : notée dans l'enregistrement léger de
       progression — plus de réécriture du livre entier à chaque ouverture.
       La bibliothèque fusionne les deux sources au tri ; rec.lastOpened
       reste le repli pour les livres ouverts avant la migration. */

    if (ctl.type === 'pdf') {
      onRelocated({
        page: ctl.page,
        end: Math.min(ctl.page + (ctl.spread === 'always' ? 1 : 0), ctl.doc.numPages),
        numPages: ctl.doc.numPages,
      });
      ctl.saveProgress(); // lastOpened + page courante, quelques octets seulement
    }
  }

  /* ── Événements de position ── */
  function onRelocated(loc) {
    if (!ctl) return;
    if (draggingBar) return; // le lecteur ne pique pas le curseur pendant un glissement
    let label = '';
    let posTxt = '';
    let pct = 0;

    if (ctl.type === 'epub') {
      const chapter = ctl.chapterLabel();
      label = chapter || rec_title();
      const total = ctl.book.spine ? ctl.book.spine.length : 0;
      let idx = 0;
      try { const sec = ctl.book.spine.get(loc.start.cfi); if (sec) idx = sec.index; } catch (e) {}
      posTxt = chapter ? `${chapter}` : (idx ? `Chapitre ${idx}` : '');
      if (ctl.locationsReady && typeof loc.start.percentage === 'number' && isFinite(loc.start.percentage)) {
        pct = loc.start.percentage;
        /* En défilement vertical (n°3), « page N » du chapitre n'a pas
           de sens : le suffixe n'est posé qu'en mode pages. */
        if (ctl.flow !== 'scrolled') {
          const pageInSec = loc.start.displayed ? loc.start.displayed.page : 1;
          posTxt += posTxt ? ` · page ${pageInSec}` : `page ${pageInSec}`;
        }
      } else if (idx) {
        pct = idx / Math.max(1, total);
      }
      ctl.saveProgress();
    } else {
      label = `${loc.page === loc.end ? `Page ${loc.page}` : `Pages ${loc.page}–${loc.end}`} sur ${loc.numPages}`;
      posTxt = label;
      pct = ctl.percent();
    }

    $('#reader-loc').textContent = label;
    $('#pos-label').textContent = posTxt || '—';
    $('#progress').value = Math.round(pct * 1000);
    $('#pct-label').textContent = Math.round(pct * 100) + ' %';
    markCurrentToc();
    /* Historique (n°9) : chaque position tenue laisse une trace.
       Marque-page (n°8) : l'état du bouton suit la position. */
    trackPosition();
    updateBookmarkBtn();
    statsNotePosition(loc); // pages vues → statistiques (V2.12)
    maybeMarkFinished(loc); // fin du livre → « Terminé » (V2.14)
  }

  const rec_title = () => (current ? current.title : '');

  /* ── Statut de lecture (V2.14) ──────────────────────────────
     Deux transitions automatiques, sur la fiche légère « bookmeta »
     (le fichier du livre n'est jamais réécrit pour cela) :
     • l'OUVERTURE fait passer « À lire » → « En cours » — un livre
       « Terminé » reste tel quel (le consulter n'est pas le relire) ;
     • la FIN du livre fait passer → « Terminé » : dernière page d'un
       PDF (exacte), fin du dernier passage d'un EPUB (loc.atEnd,
       repli sur le pourcentage des locations d'epub.js — fiable,
       sinon on ne s'y risque pas).
     Le changement est annoncé d'un toast discret ; le menu de chaque
     carte de la bibliothèque permet de tout reposer à la main. */
  async function initReadStatus(bookId) {
    try {
      const m = await NC.db.getBookMeta(bookId);
      statusNow = NC.normStatus(m && m.status);
      if (statusNow !== 'termine') {
        statusNow = 'encours';
        await NC.db.putBookMeta(Object.assign({ id: bookId }, m || {},
          { status: 'encours', updatedAt: Date.now() }));
      }
    } catch (e) { console.error('statut de lecture', e); }
  }

  function maybeMarkFinished(loc) {
    if (!ctl || !current || statusNow == null || statusNow === 'termine') return;
    let done = false;
    if (ctl.type === 'pdf') {
      done = !!(loc && loc.numPages && loc.end >= loc.numPages);
    } else {
      const pct = ctl.percent();
      done = (ctl.location && ctl.location.atEnd === true)
        || (ctl.locationsReady && isFinite(pct) && pct >= 0.99);
    }
    if (!done) return;
    statusNow = 'termine';
    const bookId = current.id;
    const title = current.title;
    NC.db.getBookMeta(bookId)
      .then((m) => NC.db.putBookMeta(Object.assign({ id: bookId }, m || {},
        { status: 'termine', statusAt: Date.now(), updatedAt: Date.now() })))
      .then(() => NC.toast(`« ${title} » est terminé — marqué comme tel dans la bibliothèque.`, 'success', 3200))
      .catch((e) => { statusNow = 'encours'; console.error('statut de lecture', e); });
  }

  /* ── Mode immersion (V2.17, gestes tactiles) ──
     Un tap au centre de l'écran masque les barres du haut et du bas et
     les boutons latéraux : la page occupe tout, comme en mode
     concentration — mais à la demande, sans réglage. Le tap suivant au
     centre les ramène. C'est un geste, pas une préférence : rien
     n'est mémorisé, l'ouverture d'un tiroir ou la fermeture du livre
     remettent les barres. Le re-dessin suit la transition (les barres
     passent en absolu, le cadre du livre grandit). */
  function toggleChrome() {
    chromeHidden = !chromeHidden;
    if (chromeHidden) document.body.dataset.chrome = 'off';
    else delete document.body.dataset.chrome;
    clearTimeout(chromeTimer);
    chromeTimer = setTimeout(() => {
      if (ctl) { try { ctl.resize(); } catch (e) { console.error(e); } }
    }, 340);
  }

  function showChrome() {
    if (chromeHidden) toggleChrome();
  }

  /* ── Tourne-page théâtral ── */
  function flip(dir, action) {
    if (flipping) return;
    const frame = $('#book-frame');
    const ov = document.createElement('div');
    ov.className = 'flip ' + (dir > 0 ? 'flip-next' : 'flip-prev');
    frame.appendChild(ov);
    flipping = true;
    // On change la page quand la feuille est à moitié soulevée
    setTimeout(() => { try { action(); } catch (e) { console.error(e); } }, 300);
    setTimeout(() => {
      ov.remove();
      flipping = false;
    }, 720);
  }

  /* En défilement vertical (n°3), pas d'animation de feuille : le
     changement de section suit le geste de défilement, sans théâtre. */
  const goNext = () => { if (!ctl) return; hideTransient(); if (ctl.type === 'epub' && ctl.flow === 'scrolled') { ctl.next(); return; } flip(1, () => ctl.next()); };
  const goPrev = () => { if (!ctl) return; hideTransient(); if (ctl.type === 'epub' && ctl.flow === 'scrolled') { ctl.prev(); return; } flip(-1, () => ctl.prev()); };

  function hideTransient() {
    $('#sel-popup').hidden = true;
    $('#font-pop').hidden = true;
    $('#theme-pop').hidden = true;
  }

  /* ── Saut direct via la barre de progression ──
     EPUB : positions précises grâce à l'index des locations (sinon, chapitre
     le plus proche). PDF : numéro de page. Pas de tourne-page théâtral ici :
     un saut doit rester net et immédiat. */
  async function seekTo(p) {
    if (!ctl || typeof ctl.seekPercent !== 'function') return;
    hideTransient();
    try { await ctl.seekPercent(p); }
    catch (e) { console.error(e); }
  }

  /* ── Tiroirs ── */
  let drawerKind = null;

  function openDrawer(kind) {
    if (!ctl) return;
    hideTransient();
    showChrome(); // un tiroir s'ouvre : la barre du haut revient (contexte)
    drawerKind = kind;
    const body = $('#drawer-body');
    body.innerHTML = '';
    $('#drawer').hidden = false;
    $('#drawer-backdrop').hidden = false;
    /* Export des citations (n°11) : le bouton n'existe que dans le
       tiroir Soulignages & notes — renderNotes le retire encore s'il
       n'y a rien à exporter. */
    $('#drawer-export').hidden = kind !== 'notes';
    if (kind === 'toc') { $('#drawer-title').textContent = 'Sommaire & signets'; renderToc(body); }
    if (kind === 'search') { $('#drawer-title').textContent = 'Recherche'; renderSearch(body); }
    if (kind === 'notes') { $('#drawer-title').textContent = 'Soulignages & notes'; renderNotes(body); }
    if (kind === 'history') { $('#drawer-title').textContent = 'Passages'; renderHistory(body); }
    if (kind === 'stats') { $('#drawer-title').textContent = 'Statistiques'; renderStats(body); }
  }

  function closeDrawer() {
    drawerKind = null;
    $('#drawer').hidden = true;
    $('#drawer-backdrop').hidden = true;
    $('#drawer-export').hidden = true;
  }

  /* ── Mémo des raccourcis clavier (n°19) ─────────────────────────
     Un panneau qui rappelle TOUTES les touches, tout le temps :
     ouvert par « ? » ou le bouton clavier de la barre du haut. Il ne
     touche ni au contrôleur ni aux réglages — il peut s'ouvrir même
     pendant qu'un livre charge. Tant qu'il est affiché, le clavier
     de lecture se taire (panneau modal). */
  function openKbdPop() {
    closeDrawer(); // pas de tiroir derrière le mémo
    hideTransient();
    const pop = $('#kbd-pop');
    if (!pop.hidden) return;
    pop.hidden = false;
    try { pop.focus(); } catch (e) {}
  }
  function closeKbdPop() {
    $('#kbd-pop').hidden = true;
  }
  function toggleKbdPop() {
    if ($('#kbd-pop').hidden) openKbdPop();
    else closeKbdPop();
  }

  async function renderToc(body) {
    body.innerHTML = ''; // re-rendus (pose, retrait de signet) : on repart propre
    /* ── Signets (n°8) : section en tête du tiroir, les deux formats ── */
    if (bookmarkCache.length) body.appendChild(buildBookmarksSection());
    else body.appendChild(bookmarkHint());
    const toc = ctl.toc;
    /* ── PDF (V2.18) : sommaire et vignettes des pages ──
       Un PDF qui fournit un sommaire propose les deux vues (bascule
       dans le tiroir) ; sans sommaire, le tiroir ouvre directement
       les vignettes — qui remplacent la vieille grille de numéros. */
    if (ctl.type === 'pdf') {
      const hasOutline = !!(toc && toc.length);
      if (hasOutline) body.appendChild(buildTocModes());
      if (hasOutline && pdfTocMode === 'toc') {
        const ul = document.createElement('ul');
        ul.className = 'toc-list toc-root';
        buildTocItems(toc, ul, 0);
        body.appendChild(ul);
      } else {
        renderThumbs(body);
      }
      markCurrentToc();
      return;
    }
    if (!toc || !toc.length) {
      const empty = document.createElement('p');
      empty.className = 'drawer-empty';
      empty.textContent = 'Ce livre ne fournit pas de sommaire.';
      body.appendChild(empty);
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'toc-list toc-root';
    buildTocItems(toc, ul, 0);
    body.appendChild(ul);
    markCurrentToc();
  }

  /* ── Vignettes de navigation (V2.18) ────────────────────────────
     Miniatures des pages d'un PDF, rendues PARESSEUSEMENT : chaque
     cellule demande son dessin quand elle approche de la zone visible
     du tiroir (IntersectionObserver, marge de 240 px), le moteur PDF
     garde les vignettes en cache. Un clic saute à la page ; le point
     doré marque un signet ; la page courante porte un liseré doré et
     est amenée au centre à l'ouverture du tiroir. */
  function buildTocModes() {
    const bar = document.createElement('div');
    bar.className = 'toc-modes';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Vue du sommaire');
    const mk = (key, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toc-mode' + (pdfTocMode === key ? ' on' : '');
      b.setAttribute('aria-pressed', pdfTocMode === key ? 'true' : 'false');
      b.textContent = label;
      b.addEventListener('click', () => {
        if (pdfTocMode === key) return;
        pdfTocMode = key;
        renderToc($('#drawer-body'));
      });
      return b;
    };
    bar.append(mk('toc', 'Sommaire'), mk('thumbs', 'Vignettes'));
    return bar;
  }

  function renderThumbs(body) {
    const grid = document.createElement('div');
    grid.className = 'thumb-grid';
    const numPages = ctl.doc.numPages;
    const cells = [];
    for (let p = 1; p <= numPages; p++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'thumb-cell' + (p === ctl.page ? ' current' : '');
      if (bookmarkCache.some((bm) => bm.page === p)) cell.classList.add('marked');
      cell.dataset.page = p;
      cell.title = 'Aller à la page ' + p;
      cell.setAttribute('aria-label', 'Aller à la page ' + p);
      const frame = document.createElement('span');
      frame.className = 'thumb-frame';
      const img = document.createElement('canvas');
      img.className = 'thumb-img';
      const num = document.createElement('span');
      num.className = 'thumb-num';
      num.textContent = p;
      frame.append(img, num);
      const label = document.createElement('span');
      label.className = 'thumb-label';
      label.textContent = p;
      cell.append(frame, label);
      cell.addEventListener('click', () => { ctl.gotoPage(p); closeDrawer(); });
      grid.appendChild(cell);
      cells.push({ p, img, cell });
    }
    body.appendChild(grid);
    /* La page où l'on lit arrive au centre : le tiroir s'ouvre LÀ. */
    const cur = grid.querySelector('.thumb-cell.current');
    if (cur) requestAnimationFrame(() => { try { cur.scrollIntoView({ block: 'center' }); } catch (e) {} });

    /* Rendu paresseux : une cellule se peint quand elle entre dans le
       champ ; tiroir refermé, plus rien ne se dessine. */
    const paint = async (c) => {
      try { await ctl.renderThumbnail(c.p, c.img); } catch (e) { return; }
      if (c.img.isConnected) c.cell.classList.add('painted');
    };
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          io.unobserve(en.target);
          const found = cells.find((c) => c.img === en.target);
          if (found) paint(found);
        }
      }, { root: body, rootMargin: '240px' });
      cells.forEach((c) => io.observe(c.img));
    } else {
      cells.forEach(paint); // vieux navigateur sans IntersectionObserver : tout d'un coup
    }
  }

  function buildTocItems(items, ul, depth) {
    for (const it of items) {
      const li = document.createElement('li');
      const hasSub = it.subitems && it.subitems.length;
      let holder = li;
      if (hasSub && depth === 0) {
        const details = document.createElement('details');
        details.open = false;
        li.appendChild(details);
        holder = details;
      }
      if (hasSub && depth === 0) {
        const summary = document.createElement('summary');
        holder.appendChild(summary);
        summary.appendChild(tocButton(it));
        const sub = document.createElement('ul');
        sub.className = 'toc-list toc-sub';
        buildTocItems(it.subitems, sub, depth + 1);
        holder.appendChild(sub);
      } else {
        li.appendChild(tocButton(it));
        if (hasSub) {
          const sub = document.createElement('ul');
          sub.className = 'toc-list toc-sub';
          buildTocItems(it.subitems, sub, depth + 1);
          li.appendChild(sub);
        }
      }
      ul.appendChild(li);
    }
  }

  function tocButton(it) {
    const b = document.createElement('button');
    b.className = 'toc-item';
    b.type = 'button';
    b.textContent = it.label || '—';
    b.setAttribute('data-toc-href', it.href || '');
    b.setAttribute('data-toc-page', it.page != null ? it.page : '');
    b.addEventListener('click', async () => {
      closeDrawer();
      if (ctl.type === 'epub') { await ctl.gotoCfi(it.href); }
      else if (it.page) { await ctl.gotoPage(it.page); }
    });
    return b;
  }

  function markCurrentToc() {
    if (!ctl) return;
    const body = $('#drawer-body');
    if (!body || drawerKind !== 'toc') return;
    const all = Array.from(body.querySelectorAll('.toc-item'));
    all.forEach((b) => b.classList.remove('current'));
    if (ctl.type === 'epub' && ctl.location) {
      const href = String(ctl.location.start.href || '').split('/').pop().toLowerCase();
      const match = all.find((b) => (b.getAttribute('data-toc-href') || '').split('/').pop().toLowerCase() === href);
      if (match) match.classList.add('current');
    } else if (ctl.type === 'pdf') {
      const match = all.find((b) => Number(b.getAttribute('data-toc-page')) === ctl.page);
      if (match) match.classList.add('current');
      /* Vignettes (V2.18) : le liseré suit la page en direct. */
      body.querySelectorAll('.thumb-cell').forEach((c) => {
        c.classList.toggle('current', Number(c.dataset.page) === ctl.page);
      });
    }
  }

  /* ── Signets (n°8) ─────────────────────────────────────────────
     Un marque-page par endroit : le bouton de la barre du haut pose
     et retire (bascule), le tiroir Sommaire liste tout. « Ici » veut
     dire : PDF, même page ; EPUB paginé, même section ET même page
     affichée ; EPUB en défilement, même section. */
  function currentSnapshot() {
    if (!ctl || typeof ctl.captureBookmark !== 'function') return null;
    try { return ctl.captureBookmark() || null; } catch (e) { return null; }
  }

  function bookmarkAtPosition() {
    if (!ctl || !bookmarkCache.length) return null;
    if (ctl.type === 'pdf') return bookmarkCache.find((b) => b.page === ctl.page) || null;
    const snap = currentSnapshot();
    if (!snap || typeof snap.sectionIndex !== 'number') return null;
    /* EPUB paginé : même section ET même page affichée (le pourcentage
       d'epub.js n'est pas assez fiable pour un test au grain fin).
       Défilement : la page affichée n'existe pas — toute la section compte. */
    let best = null;
    for (const b of bookmarkCache) {
      if (b.sectionIndex !== snap.sectionIndex) continue;
      if (snap.pageInSec != null && typeof b.pageInSec === 'number'
          && b.pageInSec !== snap.pageInSec) continue;
      if (!best || (b.createdAt || 0) > (best.createdAt || 0)) best = b;
    }
    return best;
  }

  function updateBookmarkBtn() {
    const btn = $('#btn-bookmark');
    if (!btn) return;
    const here = bookmarkAtPosition();
    btn.classList.toggle('active', !!here);
    btn.setAttribute('aria-pressed', here ? 'true' : 'false');
    btn.title = here ? 'Retirer le signet de cet endroit (B)' : 'Poser un signet ici (B)';
    /* Ruban visuel (V2.27) : la page marquée se repère désormais d'un
       coup d'œil — un ruban doré pend du haut du livre (EPUB et PDF).
       updateBookmarkBtn est appelé à chaque relocation, pose et retrait :
       le ruban ne peut pas rester sur une page sans signet. */
    const ribbon = $('#bookmark-ribbon');
    if (ribbon) ribbon.hidden = !here;
  }

  async function toggleBookmark() {
    if (!ctl || !current) return;
    const snap = currentSnapshot();
    if (!snap) { NC.toast('Position pas encore prête — un instant…', 'info', 1700); return; }
    const here = bookmarkAtPosition();
    if (here) {
      bookmarkCache = bookmarkCache.filter((b) => b.id !== here.id);
      try { await NC.db.deleteBookmark(here.id); } catch (e) { console.error(e); }
      NC.toast('Signet retiré.', 'info', 1600);
    } else {
      const bm = Object.assign({ id: crypto.randomUUID(), bookId: current.id, createdAt: Date.now() }, snap);
      bookmarkCache.push(bm);
      try { await NC.db.putBookmark(bm); } catch (e) { console.error(e); }
      NC.toast('Signet posé — ' + (bm.label || 'ici') + '. Retrouvez-le dans le sommaire.', 'success', 2400);
    }
    updateBookmarkBtn();
    if (drawerKind === 'toc') renderToc($('#drawer-body'));
  }

  async function removeBookmark(bm) {
    bookmarkCache = bookmarkCache.filter((b) => b.id !== bm.id);
    try { await NC.db.deleteBookmark(bm.id); } catch (e) { console.error(e); }
    updateBookmarkBtn();
    if (drawerKind === 'toc') renderToc($('#drawer-body'));
  }

  /* Section « Signets » du tiroir Sommaire : triée dans l'ordre du
     livre (pourcentage croissant), chaque ligne saute à l'endroit
     exact ; une petite croix retire le signet sans quitter le tiroir. */
  function buildBookmarksSection() {
    const sec = document.createElement('div');
    sec.className = 'bm-section';
    const h = document.createElement('h4');
    h.className = 'drawer-sec-title';
    h.textContent = 'Signets · ' + bookmarkCache.length;
    sec.appendChild(h);
    const list = document.createElement('div');
    list.className = 'bm-list';
    const sorted = bookmarkCache.slice().sort((a, b) => (a.pct || 0) - (b.pct || 0));
    for (const bm of sorted) {
      const row = document.createElement('div');
      row.className = 'bm-item';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'bm-go';
      go.title = 'Aller à ce signet';
      go.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4h11v16.5l-5.5-3.8-5.5 3.8z"/></svg>';
      const lab = document.createElement('span');
      lab.className = 'bm-label';
      lab.textContent = bm.label || 'Passage';
      const when = document.createElement('span');
      when.className = 'bm-date';
      when.textContent = NC.fmtDate(bm.createdAt);
      go.append(lab, when);
      go.addEventListener('click', async () => {
        closeDrawer();
        try { await ctl.gotoBookmark(bm); } catch (e) { console.error(e); }
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'bm-del';
      del.title = 'Supprimer ce signet';
      del.setAttribute('aria-label', 'Supprimer ce signet');
      del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      del.addEventListener('click', (e) => { e.stopPropagation(); removeBookmark(bm); });
      row.append(go, del);
      list.appendChild(row);
    }
    sec.appendChild(list);
    return sec;
  }

  /* Astuce discrète tant qu'aucun signet n'existe (découvrabilité). */
  function bookmarkHint() {
    const p = document.createElement('p');
    p.className = 'drawer-hint';
    p.textContent = 'Le marque-page de la barre du haut pose un signet ici (touche B) — il s\'affichera dans ce tiroir.';
    return p;
  }

  /* ── Historique des passages (n°9) ──────────────────────────────
     Chaque position tenue au moins 8 secondes laisse une trace
     (timestamp, libellé, durée du séjour) : le fil de ce que l'on a
     lu, consultable et cliquable. Le journal est borné à 150
     passages par livre, et tout disparaît avec le livre. */
  const VISIT_MIN_MS = 8000;

  function positionKey(s) {
    if (!s) return '';
    if (s.type === 'pdf') return 'p' + s.page;
    return 'e' + (typeof s.sectionIndex === 'number' ? s.sectionIndex : '?')
      + '@' + Math.round((s.pct || 0) * 100);
  }

  function flushVisit() {
    if (!visit || !current) return;
    const dwell = Date.now() - visit.at;
    if (dwell < VISIT_MIN_MS) return; // trop furtif : de la navigation, pas de la lecture
    const entry = Object.assign({
      id: crypto.randomUUID(),
      bookId: current.id,
      at: visit.at,
      dwell,
    }, visit.snap);
    NC.db.addHistory(entry, 150);
  }

  function trackPosition() {
    const snap = currentSnapshot();
    if (!snap) return;
    const key = positionKey(snap);
    if (visit && visit.key === key) return; // même position : le chronomètre continue
    flushVisit(); // clôture la position précédente si elle a vécu assez longtemps
    visit = { at: Date.now(), key, snap };
  }

  function endVisit() { flushVisit(); visit = null; }

  /* Retour à un passage de l'historique : mêmes cibles que les signets
     (CFI exact en EPUB, page en PDF), repli sur la section enregistrée. */
  function jumpToSnapshot(s) {
    if (!ctl || !s) return;
    if (ctl.type === 'pdf') { if (s.page) ctl.gotoPage(s.page); return; }
    if (s.cfi) { ctl.gotoCfi(s.cfi); return; }
    if (typeof s.sectionIndex === 'number' && ctl.book && ctl.book.spine && ctl.book.spine.spineItems) {
      const sec = ctl.book.spine.spineItems[s.sectionIndex];
      if (sec && sec.href) ctl.gotoCfi(sec.href);
    }
  }

  /* ── Statistiques de lecture (V2.12) ────────────────────────────
     Deux compteurs par livre et par jour, écrits en base par petites
     additions (get → additionner → put : les sessions d'un même jour
     se cumulent, jamais d'écrasement) :
     • le TEMPS actif — onglet visible, livre ouvert, et une activité
       (tourne-page, souris, clavier…) dans les trois dernières minutes ;
     • les PAGES LUES — chaque page affichée en mode pages (une vue
       double en compte deux ; en défilement vertical l'unité de page
       n'existe plus : le temps seul fait foi).
     Le crédit avance par tranches de 5 s ; l'écriture en base toutes
     les ~30 s et à chaque pause (onglet caché, fermeture d'un livre,
     fermeture de l'onglet). Rien ne grossit sans fin : un agrégat par
     jour, quelques dizaines d'octets — et tout disparaît avec le livre. */
  function noteActivity() {
    if (statsBookId && !document.hidden) statsLastActivity = Date.now();
  }

  /* Compte les pages de la position courante. Anti-doublon : une même
     page re-rendue par epub.js (relocation fantôme, zoom, resize) ne
     recompte pas — seule une position NOUVELLE crédite ses pages. */
  function statsNotePosition(loc) {
    if (!ctl || !current || !statsBookId) return;
    noteActivity();
    let pages = 0;
    let key = '';
    if (ctl.type === 'pdf') {
      const p = (loc && loc.page) || ctl.page;
      const e = (loc && loc.end) || (ctl.spread === 'always'
        ? Math.min(p + 1, (ctl.doc && ctl.doc.numPages) || p) : p);
      if (p >= 1) { pages = Math.max(1, Math.min(STATS_MAX_PAGES, e - p + 1)); key = 'p' + p + ':' + e; }
    } else if (ctl.flow !== 'scrolled') {
      const L = loc || ctl.location;
      if (L && L.start && L.start.displayed && L.start.displayed.page) {
        const s = L.start.displayed.page;
        const e = (L.end && L.end.displayed && L.end.displayed.page >= s) ? L.end.displayed.page : s;
        pages = Math.max(1, Math.min(STATS_MAX_PAGES, e - s + 1));
        let secIdx = '?';
        try { const sec = ctl.book.spine.get(L.start.cfi); if (sec) secIdx = sec.index; } catch (err) {}
        key = 'e' + secIdx + ':' + s;
      }
    }
    if (key && key !== statsPageKey) {
      statsPageKey = key;
      statsPendingPages += pages;
    }
  }

  function statsTick() {
    const now = Date.now();
    const elapsed = now - statsLastTick;
    statsLastTick = now;
    if (!statsBookId || document.hidden) return; // onglet caché : rien ne compte
    if (elapsed <= 0 || elapsed > STATS_MAX_SLICE_MS) return; // sommeil / saut d'horloge
    if (now - statsLastActivity > STATS_IDLE_MS) return; // livre ouvert, lecteur parti
    statsPendingSec += elapsed / 1000;
    if (++statsTickN % STATS_FLUSH_TICKS === 0) flushStats(statsBookId);
  }

  async function flushStats(bookId) {
    if (!bookId) return;
    /* La lecture du reliquat est SYNCHRONE (avant le premier await) :
       les appels en cascade (fermeture → ouverture d'un autre livre)
       ne mélangent jamais les compteurs de deux livres. */
    const sec = Math.round(statsPendingSec);
    const pg = Math.round(statsPendingPages);
    if (!sec && !pg) return;
    statsPendingSec -= sec;
    statsPendingPages -= pg;
    try {
      const date = NC.todayKey();
      const row = (await NC.db.getReadStat(bookId + '|' + date))
        || { id: bookId + '|' + date, bookId, date, seconds: 0, pages: 0, firstAt: 0 };
      row.seconds = (row.seconds || 0) + sec;
      row.pages = (row.pages || 0) + pg;
      if (!row.firstAt) row.firstAt = Date.now();
      row.lastAt = Date.now();
      await NC.db.putReadStat(row);
    } catch (e) {
      // écriture ratée : remis en attente, le prochain flush réessaie
      statsPendingSec += sec;
      statsPendingPages += pg;
    }
  }

  function startStatsTracking(bookId) {
    if (statsBookId === bookId) return;
    if (statsBookId) {
      const old = statsBookId;
      statsBookId = null; // le tick s'arrête pendant la bascule
      flushStats(old);
    }
    statsBookId = bookId;
    statsPageKey = '';
    statsTickN = 0; // cadence d'écriture alignée sur le début de la session
    statsLastActivity = Date.now();
    statsLastTick = Date.now();
    if (!statsTimer) statsTimer = setInterval(statsTick, STATS_TICK_MS);
  }

  function stopStatsTracking() {
    if (!statsBookId) return;
    const bookId = statsBookId;
    statsBookId = null;
    statsPageKey = '';
    if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
    flushStats(bookId); // écrit le reliquat, même quelques secondes
  }

  async function renderHistory(body) {
    body.innerHTML = '';
    let items = [];
    try { items = await NC.db.historyFor(current.id); } catch (e) { console.error(e); }
    const head = document.createElement('div');
    head.className = 'hist-head';
    const count = document.createElement('p');
    count.className = 'drawer-count';
    count.textContent = items.length
      ? 'Les endroits où la lecture s\'est posée — cliquez pour y retourner.'
      : '';
    head.appendChild(count);
    if (items.length) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'mini-btn danger';
      clear.textContent = 'Effacer';
      clear.title = "Effacer l'historique de ce livre";
      clear.addEventListener('click', async () => {
        if (!clear.classList.contains('confirm')) {
          clear.classList.add('confirm');
          clear.textContent = 'Tout effacer ?';
          setTimeout(() => {
            clear.classList.remove('confirm');
            clear.textContent = 'Effacer';
          }, 2800);
          return;
        }
        try { await NC.db.clearHistoryFor(current.id); } catch (e) { console.error(e); }
        renderHistory($('#drawer-body'));
      });
      head.appendChild(clear);
    }
    body.appendChild(head);
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'drawer-empty';
      empty.append("Aucun passage pour l'instant.", document.createElement('br'));
      empty.append("Les endroits où la lecture se pose (8 secondes ou plus) s'y inscrivent tout seuls.");
      body.appendChild(empty);
      return;
    }
    let lastDay = '';
    const list = document.createElement('div');
    list.className = 'hist-list';
    for (const h of items.slice(0, 80)) {
      const day = NC.dayLabel(h.at);
      if (day !== lastDay) {
        lastDay = day;
        const dh = document.createElement('h4');
        dh.className = 'drawer-sec-title hist-day';
        dh.textContent = day;
        list.appendChild(dh);
      }
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'hist-item';
      const t = document.createElement('span');
      t.className = 'hist-time';
      t.textContent = NC.fmtTime(h.at);
      const lab = document.createElement('span');
      lab.className = 'hist-label';
      lab.textContent = h.label || 'Passage';
      const dw = document.createElement('span');
      dw.className = 'hist-dwell';
      dw.textContent = NC.fmtDwell(h.dwell);
      dw.title = 'Vous êtes resté ici ' + NC.fmtDwell(h.dwell);
      row.append(t, lab, dw);
      row.addEventListener('click', () => { closeDrawer(); jumpToSnapshot(h); });
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  /* ── Tiroir « Statistiques » (V2.12) ──
     Trois grands chiffres (temps, pages, jours), la courbe des 14
     derniers jours, les totaux par période (aujourd'hui / 7 j / 30 j /
     depuis le début) et le total tous livres. Tout est lu dans le
     magasin « readstats » — rien n'est recalculé à la volée. */
  function sumReadStats(rows, fromDate) {
    let sec = 0, pages = 0, days = 0;
    for (const r of rows) {
      if (fromDate && r.date < fromDate) continue; // clés ISO : l'ordre alphabétique est l'ordre du temps
      sec += r.seconds || 0;
      pages += r.pages || 0;
      if ((r.seconds || 0) > 0 || (r.pages || 0) > 0) days++;
    }
    return { sec, pages, days };
  }

  /* Série de jours de lecture d'affilée : aujourd'hui, sinon hier —
     une journée à peine commencée ne casse pas la série d'hier. */
  function statStreak(rows) {
    const set = new Set(rows
      .filter((r) => (r.seconds || 0) > 0 || (r.pages || 0) > 0)
      .map((r) => r.date));
    const d = new Date();
    if (!set.has(NC.dateKey(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (set.has(NC.dateKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  async function renderStats(body) {
    body.innerHTML = '';
    let rows = [];
    try { rows = await NC.db.readStatsFor(current.id); } catch (e) { console.error(e); }
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'drawer-empty';
      empty.append("Aucune statistique pour l'instant.", document.createElement('br'));
      empty.append("Elles s'inscrivent toutes seules dès vos premières pages tournées.");
      body.appendChild(empty);
      return;
    }

    const total = sumReadStats(rows);
    const streak = statStreak(rows);
    const todayKey = NC.todayKey();

    /* Trois grands chiffres */
    const mkCard = (val, key) => {
      const c = document.createElement('div');
      c.className = 'stat-card';
      const v = document.createElement('span');
      v.className = 'stat-val';
      v.textContent = val;
      const k = document.createElement('span');
      k.className = 'stat-key';
      k.textContent = key;
      c.append(v, k);
      return c;
    };
    const cards = document.createElement('div');
    cards.className = 'stat-cards';
    cards.append(
      mkCard(NC.fmtDur(total.sec), 'Temps de lecture'),
      mkCard(String(total.pages), 'Pages lues'),
      mkCard(String(total.days), 'Jours de lecture')
    );
    body.appendChild(cards);

    /* Moyenne par jour de lecture + série */
    const sub = document.createElement('p');
    sub.className = 'stat-sub';
    const bits = [];
    if (total.days) bits.push(`Moyenne ${NC.fmtDur(total.sec / total.days)} et ${Math.max(1, Math.round(total.pages / total.days))} pages par jour de lecture`);
    if (streak > 1) bits.push(`série : ${streak} jours d'affilée`);
    else if (streak === 1) bits.push('série : 1 jour — continuez demain');
    if (bits.length) sub.textContent = bits.join(' · ');
    else sub.hidden = true;
    body.appendChild(sub);

    /* Graphique : les 14 derniers jours (barre = temps du jour) */
    const byDay = new Map(rows.map((r) => [r.date, r]));
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(NC.dateKey(d));
    }
    const maxSec = Math.max(60, ...days.map((k) => (byDay.get(k) || {}).seconds || 0));
    const chart = document.createElement('div');
    chart.className = 'stat-chart';
    for (const k of days) {
      const row = byDay.get(k);
      const col = document.createElement('div');
      col.className = 'stat-col' + (k === todayKey ? ' today' : '');
      const wrap = document.createElement('div');
      wrap.className = 'stat-bar-wrap';
      if (row && (row.seconds || 0) > 0) {
        const bar = document.createElement('div');
        bar.className = 'stat-bar';
        bar.style.height = Math.max(4, Math.round(((row.seconds || 0) / maxSec) * 100)) + '%';
        wrap.appendChild(bar);
      } else {
        const dot = document.createElement('div');
        dot.className = 'stat-dot';
        wrap.appendChild(dot);
      }
      const day = document.createElement('span');
      day.className = 'stat-day';
      day.textContent = NC.dayNum(k); // numéro seul : 14 colonnes tiennent sans se chevaucher
      const pg = document.createElement('span');
      pg.className = 'stat-pages';
      pg.textContent = row && row.pages ? String(row.pages) : '';
      col.title = NC.dayLabelKey(k) + (row
        ? ` — ${NC.fmtDur(row.seconds)} · ${row.pages || 0} page${(row.pages || 0) > 1 ? 's' : ''}`
        : ' — pas de lecture');
      col.append(wrap, day, pg);
      chart.appendChild(col);
    }
    body.appendChild(chart);

    /* Totaux par période */
    const week = new Date(); week.setDate(week.getDate() - 6);
    const month = new Date(); month.setDate(month.getDate() - 29);
    const mkRange = (label, agg) => {
      const c = document.createElement('div');
      c.className = 'stat-range';
      const v = document.createElement('span');
      v.className = 'stat-range-val';
      v.textContent = agg.sec ? NC.fmtDur(agg.sec) : '—';
      const p = document.createElement('span');
      p.className = 'stat-range-pages';
      p.textContent = agg.pages ? agg.pages + ' p.' : ' ';
      const k = document.createElement('span');
      k.className = 'stat-range-key';
      k.textContent = label;
      c.append(v, p, k);
      return c;
    };
    const ranges = document.createElement('div');
    ranges.className = 'stat-ranges';
    ranges.append(
      mkRange("Aujourd'hui", sumReadStats(rows, todayKey)),
      mkRange('7 jours', sumReadStats(rows, NC.dateKey(week))),
      mkRange('30 jours', sumReadStats(rows, NC.dateKey(month))),
      mkRange('Total', total)
    );
    body.appendChild(ranges);

    /* Tous les livres */
    try {
      const agg = sumReadStats(await NC.db.allReadStats());
      if (agg.sec > 0 || agg.pages > 0) {
        const glob = document.createElement('p');
        glob.className = 'stat-global';
        glob.append('Tous les livres : ');
        const b = document.createElement('strong');
        b.textContent = NC.fmtDur(agg.sec);
        glob.appendChild(b);
        glob.append(` · ${agg.pages} pages · ${agg.days} ${agg.days > 1 ? 'jours' : 'jour'} de lecture`);
        body.appendChild(glob);
      }
    } catch (e) { console.error(e); }

    /* Mode d'emploi discret : comment le temps se compte */
    const how = document.createElement('p');
    how.className = 'stat-how';
    how.textContent = "Le temps se compte pendant la lecture — onglet visible, tourne-page, souris ou clavier — et s'endort après trois minutes d'inactivité. En défilement vertical, le temps seul fait foi : l'unité de page n'existe plus.";
    body.appendChild(how);
  }

  /* ── Recherche ── */
  function renderSearch(body) {
    const row = document.createElement('div');
    row.className = 'search-row';
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Rechercher dans le livre…';
    input.setAttribute('aria-label', 'Recherche dans le livre');
    const btn = document.createElement('button');
    btn.className = 'btn btn-gold';
    btn.type = 'button';
    btn.textContent = 'Chercher';
    row.append(input, btn);
    const status = document.createElement('p');
    status.className = 'search-status';
    const list = document.createElement('ul');
    list.className = 'res-list';
    body.append(row, status, list);

    let running = false;
    async function run() {
      if (running) return;
      const q = input.value.trim();
      if (q.length < 2) { NC.toast('Saisissez au moins deux lettres.'); return; }
      running = true;
      list.innerHTML = '';
      status.textContent = 'Recherche en cours…';
      try {
        const results = await ctl.search(q, (done, total) => {
          status.textContent = `Recherche… ${Math.round((done / Math.max(1, total)) * 100)} %`;
        });
        status.textContent = results.length
          ? `${results.length} passage${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''}.`
          : 'Aucun résultat dans ce livre.';
        for (const r of results) {
          const li = document.createElement('li');
          const b = document.createElement('button');
          b.className = 'res-item';
          b.type = 'button';
          const chap = document.createElement('div');
          chap.className = 'res-chapter';
          chap.textContent = ctl.type === 'pdf' ? `Page ${r.page}` : (r.chapter || 'Passage');
          const snip = document.createElement('div');
          snip.className = 'res-snippet';
          snip.innerHTML = NC.esc(r.snippet).replace(
            new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'),
            '<mark>$1</mark>'
          );
          b.append(chap, snip);
          b.addEventListener('click', async () => {
            closeDrawer();
            if (ctl.type === 'epub') await ctl.gotoCfi(r.target);
            else await ctl.gotoPage(r.target);
          });
          li.appendChild(b);
          list.appendChild(li);
        }
      } catch (e) {
        console.error(e);
        status.textContent = 'La recherche a échoué sur ce livre.';
      }
      running = false;
    }
    btn.addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    setTimeout(() => input.focus(), 60);
  }

  /* ── Soulignages & notes ── */

  /* Filtres du tiroir (ajout n°10) : conservés pendant l'ouverture —
     y compris entre les re-rendus déclenchés par une suppression, un
     recoloriage ou une édition. q : texte cherché ; type :
     'all' | 'high' | 'note' ; cat : clé de catégorie ou 'all'. */
  let notesFilter = { q: '', type: 'all', cat: 'all' };
  const notesFilterActive = () =>
    !!(notesFilter.q.trim() || notesFilter.type !== 'all' || notesFilter.cat !== 'all');

  async function renderNotes(body) {
    body.innerHTML = ''; // le tiroir peut être déjà peuplé (suppression → re-rendu)
    const anns = await NC.db.annotationsFor(current.id);
    if (!anns.length) {
      $('#drawer-export').hidden = true; // rien à exporter (n°11)
      body.innerHTML = '<p class="drawer-empty">Aucun soulignage ni note pour l\'instant.<br>Sélectionnez du texte dans le livre, puis « Souligner » ou « Note ».</p>';
      return;
    }
    const count = document.createElement('p');
    count.className = 'drawer-count';
    /* Barre de filtres construite UNE fois par ouverture : taper dans
       la recherche ou cliquer une puce ne redessine QUE la liste — la
       saisie garde le focus. Les re-rendus complets (suppression,
       recoloriage, catégorie) la reconstruisent à l'identique depuis
       notesFilter. */
    const list = document.createElement('div');
    list.className = 'notes-list';
    body.append(count, buildNotesFilterBar(anns, () => renderNotesList(list, anns, count)), list);
    renderNotesList(list, anns, count);
  }

  /* Rangée de puces réutilisable (type, catégorie) : la puce courante
     est marquée d'or, un clic met l'état à jour puis ne rafraîchit
     que la liste. */
  function notesChipRow(defs, getCur, onPick) {
    const row = document.createElement('div');
    row.className = 'notes-chip-row';
    const sync = () => Array.from(row.children).forEach((b) =>
      b.classList.toggle('current', b.dataset.key === getCur()));
    for (const [key, label] of defs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'notes-chip';
      b.dataset.key = key;
      b.textContent = label;
      b.addEventListener('click', () => { onPick(key); sync(); });
      row.appendChild(b);
    }
    sync();
    return row;
  }

  function buildNotesFilterBar(anns, refresh) {
    const wrap = document.createElement('div');
    wrap.className = 'notes-filters';
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'notes-search';
    input.placeholder = 'Rechercher dans les citations et notes…';
    input.setAttribute('aria-label', 'Rechercher dans les soulignages et notes');
    input.value = notesFilter.q;
    input.addEventListener('input', () => { notesFilter.q = input.value; refresh(); });
    input.addEventListener('keydown', (e) => {
      /* Échap efface D'ABORD la recherche — et n'atteint pas le
         gestionnaire global qui fermerait le tiroir ; une deuxième
         frappe, champ vide, ferme le tiroir comme d'habitude. */
      if (e.key === 'Escape' && input.value) {
        e.stopPropagation();
        notesFilter.q = ''; input.value = ''; refresh();
      }
    });
    wrap.appendChild(input);
    wrap.appendChild(notesChipRow(
      [['all', 'Tout'], ['high', 'Soulignages'], ['note', 'Notes']],
      () => notesFilter.type,
      (k) => { notesFilter.type = k; refresh(); }
    ));
    wrap.appendChild(notesChipRow(
      [['all', 'Toutes catégories']].concat(NC.ANNOT_CATEGORIES.map((c) => [c.key, c.label])),
      () => notesFilter.cat,
      (k) => { notesFilter.cat = k; refresh(); }
    ));
    return wrap;
  }

  function renderNotesList(list, anns, count) {
    list.innerHTML = '';
    const nNotes = anns.filter((a) => NC.isNote(a)).length;
    const nHigh = anns.length - nNotes;
    const q = NC.foldText(notesFilter.q.trim());
    const sel = anns.filter((a) => {
      if (notesFilter.type === 'high' && NC.isNote(a)) return false;
      if (notesFilter.type === 'note' && !NC.isNote(a)) return false;
      if (notesFilter.cat !== 'all' && (a.category || '') !== notesFilter.cat) return false;
      if (q && !(NC.foldText(a.text).includes(q) || NC.foldText(a.note).includes(q))) return false;
      return true;
    });
    /* Compteur : totaux du livre, complétés quand un filtre cache des
       passages (sinon, on ne voit pas que la liste est filtrée). */
    count.textContent = `${nHigh} soulignage${nHigh > 1 ? 's' : ''} · ${nNotes} note${nNotes > 1 ? 's' : ''}`
      + (notesFilterActive() ? ` — ${sel.length} affiché${sel.length > 1 ? 's' : ''}` : '');
    if (!sel.length) {
      const empty = document.createElement('div');
      empty.className = 'drawer-empty notes-nores';
      empty.append('Aucun résultat pour ces filtres.', document.createElement('br'));
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'mini-btn';
      reset.textContent = 'Effacer les filtres';
      reset.addEventListener('click', () => {
        notesFilter = { q: '', type: 'all', cat: 'all' };
        renderNotes($('#drawer-body'));
      });
      empty.appendChild(reset);
      list.appendChild(empty);
      return;
    }
    for (const a of sel) {
      const item = document.createElement('div');
      item.className = 'note-item' + (NC.isNote(a) ? ' is-note' : '');
      const txt = document.createElement('blockquote');
      txt.className = 'note-text';
      txt.textContent = a.text;
      item.appendChild(txt);
      /* Texte rédigé de la note (n°9) : mis en avant, sous la citation. */
      if (NC.isNote(a) && a.note) {
        const nb = document.createElement('div');
        nb.className = 'note-body';
        nb.textContent = a.note;
        item.appendChild(nb);
      }
      const foot = document.createElement('div');
      foot.className = 'note-foot';
      const when = document.createElement('div');
      when.className = 'note-when';
      const date = document.createElement('span');
      date.className = 'note-date';
      date.textContent = NC.fmtDate(a.createdAt);
      when.appendChild(date);
      if (NC.isNote(a)) {
        const badge = document.createElement('span');
        badge.className = 'note-badge';
        badge.textContent = 'Note';
        when.appendChild(badge);
      }
      const actions = document.createElement('div');
      actions.className = 'note-actions';
      const go = document.createElement('button');
      go.className = 'mini-btn';
      go.type = 'button';
      go.textContent = 'Aller au passage';
      go.addEventListener('click', async () => {
        closeDrawer();
        await ctl.gotoAnnotation(a); // EPUB : CFI — PDF : page (n°5)
      });
      actions.append(go);
      /* Édition du texte d'une note (n°9) : réouvre l'éditeur avec le
         texte existant ; Enregistrer réécrit la note, sans re-rendu. */
      if (NC.isNote(a)) {
        const edit = document.createElement('button');
        edit.className = 'mini-btn';
        edit.type = 'button';
        edit.textContent = 'Modifier';
        edit.addEventListener('click', () => openNoteEditor({ ann: a }));
        actions.append(edit);
      }
      const del = document.createElement('button');
      del.className = 'mini-btn danger';
      del.type = 'button';
      del.textContent = 'Supprimer';
      del.addEventListener('click', async () => {
        await ctl.removeHighlight(a);
        renderNotes($('#drawer-body'));
      });
      actions.append(del);
      foot.append(when, actions);
      /* Catégorie (ajout n°10) : bouton-étiquette ouvrant le popover
         d'affectation ; « Catégorie… » tant qu'aucune n'est posée. */
      const catMeta = NC.categoryMeta(a.category);
      const catBtn = document.createElement('button');
      catBtn.type = 'button';
      catBtn.className = 'note-cat-btn' + (catMeta ? ' has-cat' : '');
      catBtn.textContent = catMeta ? catMeta.label : 'Catégorie…';
      catBtn.title = 'Choisir la catégorie de cette annotation';
      catBtn.setAttribute('aria-label', catBtn.title);
      catBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!$('#cat-pop').hidden && catPopId === a.id) { closeCatPop(); return; }
        openCatPop(a, catBtn);
      });
      const catRow = document.createElement('div');
      catRow.className = 'note-cat-row';
      catRow.appendChild(catBtn);
      /* Pastilles de recoloriage (ajout n°8) : un clic change la couleur
         du soulignement ou du trait de note existant, sans re-rendu. */
      const colors = document.createElement('div');
      colors.className = 'note-colors';
      Object.entries(NC.HIGHLIGHT_COLORS).forEach(([key, meta]) => {
        const d = document.createElement('button');
        d.type = 'button';
        d.className = 'color-dot' + (NC.highlightKey(a.color) === key ? ' current' : '');
        d.style.background = meta.hex;
        d.title = 'Passer en ' + meta.label.toLowerCase();
        d.setAttribute('aria-label', d.title);
        d.addEventListener('click', async () => {
          try { await ctl.recolorHighlight(a, key); } catch (err) { console.error(err); }
          renderNotes($('#drawer-body'));
        });
        colors.appendChild(d);
      });
      item.append(catRow, colors, foot);
      list.appendChild(item);
    }
  }

  /* Popover d'affectation de catégorie (ajout n°10) : une seule
     instance (#cat-pop dans index.html), repositionnée sous le bouton
     cliqué ; au-dessus si le bas débordait de l'écran. */
  let catPopId = null;
  function openCatPop(ann, btn) {
    const pop = $('#cat-pop');
    catPopId = ann.id;
    pop.innerHTML = '';
    const h = document.createElement('h4');
    h.textContent = 'Catégorie';
    pop.appendChild(h);
    const opts = [{ key: '', label: 'Aucune' }].concat(NC.ANNOT_CATEGORIES);
    for (const c of opts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat-opt' + ((ann.category || '') === c.key ? ' current' : '');
      b.textContent = c.label;
      b.addEventListener('click', async () => {
        closeCatPop();
        if ((ann.category || '') === c.key) return;
        try { await ctl.setAnnotationCategory(ann, c.key); }
        catch (e) { console.error(e); NC.toast('La catégorie n\'a pas pu être enregistrée.', 'error'); }
        if (drawerKind === 'notes') renderNotes($('#drawer-body'));
      });
      pop.appendChild(b);
    }
    $('#font-pop').hidden = true;
    $('#theme-pop').hidden = true;
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const left = Math.max(10, Math.min(r.left, window.innerWidth - pw - 10));
    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - 10) top = Math.max(10, r.top - ph - 6);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function closeCatPop() {
    catPopId = null;
    const pop = $('#cat-pop');
    if (pop) pop.hidden = true;
  }

  /* ── Export des citations (n°11) ─────────────────────────────
     Les soulignages et notes du livre, remis dans l'ordre de la
     lecture (pages pour un PDF, chapitres pour un EPUB), montrés
     une dernière fois dans leur plus bel appareil — puis
     téléchargés en Markdown ou en texte brut. Le fichier est
     généré depuis exactement les mêmes données que l'aperçu :
     rien de plus, rien de moins. */

  const exportState = { bookId: null, groups: [] };

  /* Lieu lisible d'une annotation : « Page N » (PDF) ou le titre du
     chapitre résolu depuis le CFI (EPUB — repli « Chapitre N »). */
  function exportLocation(a) {
    if (ctl && ctl.type === 'pdf') return a.page ? 'Page ' + a.page : '';
    if (ctl && ctl.type === 'epub' && typeof ctl.chapterLabelFor === 'function') {
      return ctl.chapterLabelFor(a.cfi)
        || (typeof a.sectionIndex === 'number' ? 'Chapitre ' + (a.sectionIndex + 1) : '');
    }
    return '';
  }

  /* Ordre de lecture : PDF par page croissante ; EPUB par section puis
     position dans la section (les annotations récentes portent
     start/end ; les autres retombent sur l'ordre de création). */
  function orderForExport(anns) {
    const arr = anns.slice();
    if (ctl && ctl.type === 'pdf') {
      arr.sort((a, b) => ((a.page || 0) - (b.page || 0))
        || ((a.createdAt || 0) - (b.createdAt || 0)));
    } else {
      const secOf = (a) => (typeof a.sectionIndex === 'number' ? a.sectionIndex : Number.MAX_SAFE_INTEGER);
      arr.sort((a, b) => (secOf(a) - secOf(b))
        || (typeof a.start === 'number' && typeof b.start === 'number' ? a.start - b.start : 0)
        || ((a.createdAt || 0) - (b.createdAt || 0)));
    }
    return arr;
  }

  /* Regroupement : l'EPUB annonce le chapitre à chaque changement de
     lieu ; le PDF, sans chapitres, reste un fil continu (un seul
     groupe, sans titre). */
  function groupForExport(ordered) {
    if (ctl && ctl.type === 'epub') {
      const groups = [];
      for (const a of ordered) {
        const label = exportLocation(a) || '';
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.items.push(a);
        else groups.push({ label, items: [a] });
      }
      return groups;
    }
    return [{ label: '', items: ordered }];
  }

  function exportCounts() {
    let total = 0, nNotes = 0;
    for (const g of exportState.groups) {
      total += g.items.length;
      nNotes += g.items.filter((a) => NC.isNote(a)).length;
    }
    return { nHigh: total - nNotes, nNotes };
  }

  /* Ligne d'en-tête commune aux deux formats : comptes et date. */
  function exportHeaderLine() {
    const { nHigh, nNotes } = exportCounts();
    let s = nHigh + ' citation' + (nHigh > 1 ? 's' : '');
    if (nNotes) s += ' · ' + nNotes + ' note' + (nNotes > 1 ? 's' : '');
    return s + ' — exporté le ' + NC.fmtDate(Date.now()) + ' depuis Nuit Calme';
  }

  /* Ligne d'attribution d'une citation : catégorie, lieu, date. */
  function exportAttribution(a) {
    const parts = [];
    const cat = NC.categoryMeta(a.category);
    if (cat) parts.push(cat.label);
    const where = exportLocation(a);
    if (where) parts.push(where);
    parts.push('le ' + NC.fmtDate(a.createdAt));
    return '— ' + parts.join(' · ');
  }

  /* Sur une seule ligne : une note ou un fichier ne doivent jamais
     casser la structure du paragraphe qui les porte. */
  const exportOneLine = (s) => String(s || '').replace(/\s*\n+\s*/g, ' ').trim();

  function buildMarkdown() {
    const title = String((current && current.title) || 'Sans titre');
    const author = String((current && current.author) || '').trim();
    const L = ['# ' + title, ''];
    if (author) L.push('*' + author + '*', '');
    L.push('*' + exportHeaderLine() + '*', '');
    const lastGi = exportState.groups.length - 1;
    exportState.groups.forEach((g, gi) => {
      if (g.label) L.push('## ' + g.label, '');
      for (const a of g.items) {
        String(a.text || '').trim().split('\n').forEach((ln) => L.push('> ' + ln));
        L.push('', exportAttribution(a), '');
        if (NC.isNote(a) && a.note) L.push('**Ma note —** ' + exportOneLine(a.note), '');
      }
      if (g.label && gi < lastGi) L.push('---', '');
    });
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function buildTxt() {
    const title = String((current && current.title) || 'Sans titre');
    const author = String((current && current.author) || '').trim();
    const RULE = '════════════════════════════════════════';
    const THIN = '────────────────────────────────────────';
    const flat = !(ctl && ctl.type === 'epub');
    const L = [title.toUpperCase(), ''];
    if (author) L.push(author, '');
    L.push(exportHeaderLine(), '', RULE, '');
    exportState.groups.forEach((g, gi) => {
      if (g.label) L.push(g.label.toUpperCase(), THIN, '');
      g.items.forEach((a, ii) => {
        L.push('« ' + exportOneLine(a.text) + ' »', '');
        if (NC.isNote(a) && a.note) L.push('Ma note : ' + exportOneLine(a.note), '');
        L.push('   ' + exportAttribution(a), '');
        if ((flat || !g.label) && ii < g.items.length - 1) L.push(THIN, '');
      });
      if (gi < exportState.groups.length - 1) L.push('');
    });
    return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /* L'aperçu : la même matière que le tiroir, mais en repos —
     citations en Cormorant italique, filées à leur couleur. */
  function renderExportPreview() {
    const list = $('#export-list');
    list.innerHTML = '';
    for (const g of exportState.groups) {
      if (g.label) {
        const h = document.createElement('h5');
        h.className = 'xg-title';
        h.textContent = g.label;
        list.appendChild(h);
      }
      for (const a of g.items) {
        const item = document.createElement('div');
        item.className = 'xg-item';
        item.style.borderLeftColor = NC.highlightHex(NC.highlightKey(a.color));
        const q = document.createElement('blockquote');
        q.className = 'xg-quote';
        q.textContent = '« ' + String(a.text || '').trim() + ' »';
        item.appendChild(q);
        if (NC.isNote(a) && a.note) {
          const nb = document.createElement('p');
          nb.className = 'xg-note';
          const b = document.createElement('b');
          b.textContent = 'Ma note — ';
          nb.appendChild(b);
          nb.appendChild(document.createTextNode(String(a.note)));
          item.appendChild(nb);
        }
        const meta = document.createElement('div');
        meta.className = 'xg-meta';
        const dot = document.createElement('span');
        dot.className = 'xg-dot';
        dot.style.background = NC.highlightHex(NC.highlightKey(a.color));
        meta.appendChild(dot);
        const cat = NC.categoryMeta(a.category);
        const where = exportLocation(a);
        const bits = [];
        if (cat) bits.push(cat.label);
        if (where) bits.push(where);
        bits.push('le ' + NC.fmtDate(a.createdAt));
        meta.appendChild(document.createTextNode(bits.join(' · ')));
        item.appendChild(meta);
        list.appendChild(item);
      }
    }
  }

  async function openExportPop() {
    if (!ctl || !current) return;
    const anns = await NC.db.annotationsFor(current.id);
    if (!anns.length) {
      NC.toast('Aucune citation à exporter — soulignez d\'abord un passage du livre.', 'info');
      return;
    }
    exportState.bookId = current.id;
    exportState.groups = groupForExport(orderForExport(anns));
    const { nHigh, nNotes } = exportCounts();
    const title = String(current.title || 'Sans titre');
    $('#export-sub').textContent = title + ' — ' + nHigh + ' citation' + (nHigh > 1 ? 's' : '')
      + (nNotes ? ' · ' + nNotes + ' note' + (nNotes > 1 ? 's' : '') : '');
    renderExportPreview();
    hideTransient();
    $('#export-backdrop').hidden = false;
    $('#export-pop').hidden = false;
  }

  function closeExportPop() {
    $('#export-backdrop').hidden = true;
    $('#export-pop').hidden = true;
  }

  function downloadExport(fmt) {
    if (!current) return;
    const title = String(current.title || 'Sans titre');
    const text = fmt === 'md' ? buildMarkdown() : buildTxt();
    const name = 'citations-' + NC.slug(title) + (fmt === 'md' ? '.md' : '.txt');
    const type = fmt === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
    NC.downloadBlob(new Blob([text], { type }), name);
    NC.toast('Citations exportées — « ' + name + ' ».', 'success');
  }

  /* ── Notes personnelles (ajout n°9) ──
     Éditeur en panneau centré. À l'ouverture depuis le menu de
     sélection, les repères du passage sont DÉJÀ capturés
     (ctl.captureSelection()) : rédiger, tourner une page ou fermer le
     popup ne peut plus perdre la localisation. noteDraft = { cap }
     (création) ou { ann } (édition d'une note existante). */
  let noteDraft = null;

  function openNoteEditor(draft) {
    noteDraft = draft || null;
    if (!noteDraft) return;
    const pop = $('#note-pop');
    const q = $('#note-pop-quote');
    const ta = $('#note-pop-text');
    const quote = noteDraft.ann ? String(noteDraft.ann.text || '') : String((noteDraft.cap && noteDraft.cap.text) || '');
    q.hidden = !quote;
    q.textContent = quote.length > 240 ? quote.slice(0, 240) + '…' : quote;
    ta.value = noteDraft.ann ? String(noteDraft.ann.note || '') : '';
    $('#font-pop').hidden = true;
    $('#theme-pop').hidden = true;
    pop.hidden = false;
    setTimeout(() => {
      try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}
    }, 60);
  }

  function closeNoteEditor() {
    noteDraft = null;
    $('#note-pop').hidden = true;
  }

  let noteSaving = false; // anti-réentrance : Ctrl+Entrée est vu par DEUX
  // handlers (textarea + document, par bulle) ; le premier saveNote se
  // suspend sur son await avec noteDraft encore ouvert — sans ce garde,
  // le second handler relancerait la sauvegarde (doublon en base).
  async function saveNote() {
    if (!noteDraft || noteSaving) return;
    noteSaving = true;
    try {
      const val = String($('#note-pop-text').value || '').trim();
      if (!val) { NC.toast('La note est vide — écrivez quelque chose, ou annulez.', 'error', 2200); return; }
      try {
        if (noteDraft.ann) await ctl.updateNote(noteDraft.ann, val);
        else await ctl.addNote(noteDraft.cap, val);
        NC.toast(noteDraft.ann ? 'Note modifiée.' : 'Note enregistrée — le passage est repéré sous la ligne.', 'success', 2100);
      } catch (e) {
        console.error(e);
        NC.toast('La note n\'a pas pu être enregistrée.', 'error');
      }
      closeNoteEditor();
      if (drawerKind === 'notes') renderNotes($('#drawer-body'));
    } finally {
      noteSaving = false;
    }
  }

  /* ── Taille du texte / zoom ── */
  function toggleFontPop() {
    if (!ctl) return; // bouton visible pendant une ouverture : pas encore de contrôleur
    const pop = $('#font-pop');
    if (!pop.hidden) { pop.hidden = true; return; }
    $('#theme-pop').hidden = true; // un seul popover ouvert à la fois
    const body = $('#font-pop-body');
    body.innerHTML = '';
    if (ctl.type === 'epub') {
      const h = document.createElement('h4');
      h.textContent = 'Taille du texte';
      const row = document.createElement('div');
      row.className = 'font-row';
      const minus = document.createElement('button');
      minus.className = 'font-btn'; minus.type = 'button'; minus.textContent = 'A−';
      minus.title = 'Réduire le texte';
      const val = document.createElement('div');
      val.className = 'font-val'; val.textContent = ctl.fontSize + ' %';
      const plus = document.createElement('button');
      plus.className = 'font-btn'; plus.type = 'button'; plus.textContent = 'A+';
      plus.title = 'Agrandir le texte';
      const update = (v) => { val.textContent = v + ' %'; };
      minus.addEventListener('click', () => update(ctl.setFontSize(ctl.fontSize - 10)));
      plus.addEventListener('click', () => update(ctl.setFontSize(ctl.fontSize + 10)));
      row.append(minus, val, plus);
      body.append(h, row);

      /* ── Typographie avancée (ajout n°2) : police, interlignage,
         alignement. Chaque clic applique immédiatement et mémorise
         le réglage pour CE livre (module prefs). Les libellés de la
         rangée « Police » sont composés dans leur propre police. */
      const hF = document.createElement('h4');
      hF.textContent = 'Police';
      const gF = document.createElement('div');
      gF.className = 'typo-grid typo-fonts';
      for (const [key, meta] of Object.entries(NC.BOOK_FONTS)) {
        const b = document.createElement('button');
        b.className = 'typo-opt'; b.type = 'button';
        b.dataset.typoFont = key;
        b.style.fontFamily = meta.preview;
        b.textContent = meta.label;
        b.title = 'Composer le livre en ' + meta.label;
        b.addEventListener('click', () => chooseTypo({ font: key }));
        gF.appendChild(b);
      }
      const hL = document.createElement('h4');
      hL.textContent = 'Interlignage';
      const gL = document.createElement('div');
      gL.className = 'typo-grid';
      for (const lh of NC.LINE_HEIGHTS) {
        const b = document.createElement('button');
        b.className = 'typo-opt'; b.type = 'button';
        b.dataset.typoLh = String(lh.value);
        b.textContent = lh.label;
        b.title = 'Interlignage ' + String(lh.value).replace('.', ',');
        b.addEventListener('click', () => chooseTypo({ lineHeight: lh.value }));
        gL.appendChild(b);
      }
      const hJ = document.createElement('h4');
      hJ.textContent = 'Alignement';
      const gJ = document.createElement('div');
      gJ.className = 'typo-grid typo-just';
      const justOpts = [['left', 'Aligné à gauche'], ['justify', 'Justifié']];
      for (const [jkey, jlabel] of justOpts) {
        const b = document.createElement('button');
        b.className = 'typo-opt'; b.type = 'button';
        b.dataset.typoJust = jkey;
        b.textContent = jlabel;
        b.addEventListener('click', () => chooseTypo({ justify: jkey }));
        gJ.appendChild(b);
      }
      body.append(hF, gF, hL, gL, hJ, gJ);
      markTypoChips();
    } else {
      const h = document.createElement('h4');
      h.textContent = 'Zoom de la page';
      const row = document.createElement('div');
      row.className = 'font-row';
      const minus = document.createElement('button');
      minus.className = 'font-btn'; minus.type = 'button'; minus.textContent = '−';
      const val = document.createElement('div');
      val.className = 'font-val'; val.textContent = Math.round(ctl.zoom * 100) + ' %';
      const plus = document.createElement('button');
      plus.className = 'font-btn'; plus.type = 'button'; plus.textContent = '+';
      const update = (v) => { val.textContent = Math.round(v * 100) + ' %'; };
      minus.addEventListener('click', () => ctl.setZoom(ctl.zoom - 0.15).then(update));
      plus.addEventListener('click', () => ctl.setZoom(ctl.zoom + 0.15).then(update));
      row.append(minus, val, plus);
      body.append(h, row);

      /* Ajustement (n°6) : le zoom peut remplir la largeur ou la hauteur
         du cadre — la page dépasse alors et se déplace à la main.
         100 % = ajusté au mode courant ; un mode posé remet 100 %. */
      const hF = document.createElement('h4');
      hF.textContent = 'Ajustement';
      const gF = document.createElement('div');
      gF.className = 'typo-grid';
      const fitChips = [];
      for (const [key, label] of [['page', 'Page entière'], ['width', 'Largeur'], ['height', 'Hauteur']]) {
        const b = document.createElement('button');
        b.className = 'typo-opt' + (ctl.fit === key ? ' current' : '');
        b.type = 'button';
        b.textContent = label;
        b.title = key === 'page' ? 'Ajuster la page entière dans le cadre'
          : key === 'width' ? 'Remplir la largeur — défilement vertical'
          : 'Remplir la hauteur — défilement horizontal';
        b.addEventListener('click', async () => {
          try { await ctl.setFit(key); } catch (e) { console.error(e); return; }
          update(ctl.zoom);
          fitChips.forEach(([k, el]) => el.classList.toggle('current', k === ctl.fit));
        });
        fitChips.push([key, b]);
        gF.appendChild(b);
      }
      body.append(hF, gF);
    }
    const btnRect = $('#btn-font').getBoundingClientRect();
    pop.hidden = false;
    pop.style.left = Math.min(window.innerWidth - pop.offsetWidth - 14, btnRect.left) + 'px';
    pop.style.top = (btnRect.bottom + 10) + 'px';
  }

  /* État visuel des pastilles de typographie (n°2) : la valeur courante
     du livre est cerclée d'or. */
  function markTypoChips() {
    if (!ctl || ctl.type !== 'epub') return;
    const t = ctl.typo || NC.TYPO_DEFAULT;
    const root = $('#font-pop-body');
    if (!root) return;
    NC.$$('[data-typo-font]', root).forEach((b) => b.classList.toggle('current', b.dataset.typoFont === t.font));
    NC.$$('[data-typo-lh]', root).forEach((b) => b.classList.toggle('current', parseFloat(b.dataset.typoLh) === t.lineHeight));
    NC.$$('[data-typo-just]', root).forEach((b) => b.classList.toggle('current', b.dataset.typoJust === t.justify));
  }

  /* Choix de typographie (n°2) : application immédiate (ctl.setTypo),
     mémorisation PAR LIVRE (prefs.typo) + repli global (lastTypo) —
     même mécanique que le thème. */
  async function chooseTypo(patch) {
    if (!ctl || ctl.type !== 'epub') return;
    let t;
    try { t = ctl.setTypo(patch); }
    catch (e) { console.error(e); return; }
    markTypoChips();
    try {
      if (current) {
        const p = (await NC.db.getPrefs(current.id).catch(() => null)) || { id: current.id };
        p.typo = t;
        p.updatedAt = Date.now();
        await NC.db.putPrefs(p);
      }
    } catch (e) { console.error(e); }
    NC.db.putSetting('lastTypo', t).catch(() => {});
    const bits = [];
    if (patch && patch.font) bits.push('Police : ' + (NC.BOOK_FONTS[t.font] || NC.BOOK_FONTS.cormorant).label + '.');
    if (patch && patch.lineHeight != null) {
      const lh = NC.LINE_HEIGHTS.find((x) => x.value === t.lineHeight);
      bits.push('Interlignage : ' + (lh ? lh.label.toLowerCase() : String(t.lineHeight).replace('.', ',')) + '.');
    }
    if (patch && patch.justify) bits.push(patch.justify === 'justify' ? 'Texte justifié.' : 'Alignement à gauche.');
    if (bits.length) NC.toast(bits.join(' '), 'info', 1700);
  }

  function updateSpreadBtn() {
    $('#btn-spread').classList.toggle('active', ctl && ctl.spread === 'always');
    $('#btn-spread').title = ctl && ctl.spread === 'always' ? 'Passer en vue simple page' : 'Passer en vue double page';
  }

  /* ── Mode de lecture : pages ⇄ défilement vertical (ajout n°3) ── */
  function updateFlowUi() {
    const scrolled = !!(ctl && ctl.type === 'epub' && ctl.flow === 'scrolled');
    document.body.dataset.flow = scrolled ? 'scrolled' : 'pages';
    const btn = $('#btn-flow');
    if (btn) {
      btn.classList.toggle('active', scrolled);
      btn.setAttribute('aria-pressed', scrolled ? 'true' : 'false');
      btn.title = scrolled ? 'Mode de lecture : défilement vertical — revenir aux pages' : 'Mode de lecture : défilement vertical';
    }
    const spreadBtn = $('#btn-spread');
    if (spreadBtn) {
      spreadBtn.disabled = scrolled; // la vue double n'a pas de sens en défilement
      spreadBtn.title = scrolled ? 'Vue double indisponible en défilement vertical' : (ctl && ctl.spread === 'always' ? 'Passer en vue simple page' : 'Passer en vue double page');
    }
    $('#spine-line').hidden = scrolled || !ctl || ctl.spread !== 'always';
  }

  async function toggleFlow() {
    if (!ctl || ctl.type !== 'epub') return;
    const mode = ctl.flow === 'scrolled' ? 'paginated' : 'scrolled';
    hideTransient();
    try { await ctl.setFlow(mode); } catch (e) { console.error(e); }
    NC.db.putSetting('flow', mode).catch(() => {});
    updateFlowUi();
    NC.toast(mode === 'scrolled' ? 'Mode défilement vertical — faites défiler le texte.' : 'Mode pages — tournez comme un livre.', 'info', 2000);
  }

  /* ── Thème du livre (papier / sépia / nuit / OLED) — par livre ── */
  function applyBookThemeUi(mode) {
    const meta = NC.BOOK_THEMES[mode] || NC.BOOK_THEMES.paper;
    document.body.dataset.bookTheme = mode;
    const btn = $('#btn-theme');
    if (!btn) return;
    btn.classList.toggle('active', !!meta.dark);
    btn.title = 'Thème : ' + meta.label + ' — changer';
    // Soleil sur un thème sombre (indique « repasser en clair »), lune sinon
    btn.innerHTML = meta.dark
      ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  }

  async function chooseTheme(mode) {
    if (!NC.BOOK_THEMES[mode]) return;
    bookTheme = mode;
    document.body.dataset.bookTheme = mode; // immédiat, y compris pour le PDF
    if (current) {
      try {
        const p = (await NC.db.getPrefs(current.id).catch(() => null)) || { id: current.id };
        p.theme = mode;
        p.updatedAt = Date.now();
        await NC.db.putPrefs(p);
        NC.db.putSetting('lastBookTheme', mode).catch(() => {});
      } catch (e) { console.error(e); }
    }
    if (ctl && typeof ctl.setTheme === 'function') ctl.setTheme(mode);
    applyBookThemeUi(mode);
    NC.toast('Thème ' + NC.BOOK_THEMES[mode].label + '.', 'info', 1600);
  }

  /* Popover de choix du thème (même mécanique que le popover de police) */
  function toggleThemePop() {
    const pop = $('#theme-pop');
    if (!pop.hidden) { pop.hidden = true; return; }
    $('#font-pop').hidden = true; // un seul popover ouvert à la fois
    const body = $('#theme-pop-body');
    body.innerHTML = '';
    const h = document.createElement('h4');
    h.textContent = 'Thème du livre';
    body.appendChild(h);
    for (const [key, meta] of Object.entries(NC.BOOK_THEMES)) {
      const b = document.createElement('button');
      b.className = 'theme-opt' + (key === bookTheme ? ' current' : '');
      b.type = 'button';
      b.dataset.theme = key;
      b.setAttribute('aria-pressed', key === bookTheme ? 'true' : 'false');
      const sw = document.createElement('span');
      sw.className = 'theme-swatch';
      sw.style.background = meta.bg;
      const lbl = document.createElement('span');
      lbl.textContent = meta.label;
      b.append(sw, lbl);
      b.addEventListener('click', () => { pop.hidden = true; chooseTheme(key); });
      body.appendChild(b);
    }
    const btnRect = $('#btn-theme').getBoundingClientRect();
    pop.hidden = false;
    pop.style.left = Math.min(window.innerWidth - pop.offsetWidth - 14, btnRect.left) + 'px';
    pop.style.top = (btnRect.bottom + 10) + 'px';
  }

  /* N°19 : J fait tourner les thèmes du livre (même liste que le
     popover, dans le même ordre) — un tourne-page pour les yeux. */
  function cycleTheme() {
    const keys = Object.keys(NC.BOOK_THEMES);
    if (!keys.length) return;
    const i = keys.indexOf(bookTheme); // -1 (thème inconnu) → repart du premier
    const next = keys[(i + 1) % keys.length];
    hideTransient();
    chooseTheme(next);
  }

  async function toggleSpread() {
    if (!ctl) return;
    const mode = ctl.spread === 'always' ? 'none' : 'always';
    await ctl.setSpread(mode);
    NC.db.putSetting('spread', mode).catch(() => {});
    $('#spine-line').hidden = mode !== 'always';
    updateSpreadBtn();
    if (ctl.type === 'pdf') onRelocated({ page: ctl.page, end: Math.min(ctl.page + (mode === 'always' ? 1 : 0), ctl.doc.numPages), numPages: ctl.doc.numPages });
  }

  /* ── Capture ── */
  async function capture() {
    if (!ctl) return;
    try {
      NC.toast('Capture de la page…', 'info', 1600);
      const blob = await ctl.capture();
      NC.downloadBlob(blob, ctl.captureName());
      window.__ncLastCapture = blob.size;
      NC.toast('Capture enregistrée — téléchargement lancé.', 'success');
    } catch (e) {
      console.error(e);
      NC.toast('La capture n\'a pas pu être réalisée sur ce livre.', 'error');
    }
  }

  /* ── Plein écran ── */
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  /* ── Mode concentration (ajout n°5) ──
     Barres et boutons de navigation masqués (réapparition quand la souris
     effleure le haut ou le bas de l'écran) ; sur EPUB, le texte s'atténue
     et seul le paragraphe survolé reste lisible (voir epub-reader.js).
     Le réglage est global et mémorisé ; F ou Échap en sortent. */
  function applyFocus(on, opts) {
    const o = opts || {};
    focusMode = !!on;
    document.body.dataset.focus = focusMode ? 'on' : 'off';
    $('#view-reader').classList.remove('focus-reveal');
    const btn = $('#btn-focus');
    if (btn) {
      btn.classList.toggle('active', focusMode);
      btn.setAttribute('aria-pressed', focusMode ? 'true' : 'false');
      btn.title = focusMode ? 'Quitter le mode concentration (F)' : 'Mode concentration — lecture épurée';
    }
    if (ctl && typeof ctl.setFocus === 'function') { try { ctl.setFocus(focusMode); } catch (e) {} }
    if (o.persist !== false) NC.db.putSetting('focusMode', focusMode ? 'on' : 'off').catch(() => {});
    if (!o.quiet) NC.toast(focusMode ? 'Mode concentration — F ou Échap pour en sortir.' : 'Mode concentration désactivé.', 'info', 1900);
  }
  const toggleFocus = () => applyFocus(!focusMode);

  /* ── Fermeture ── */
  async function close(silent) {
    openGen++; // toute ouverture encore en vol devient périmée
    endVisit(); // clôture le passage en cours (s'il a assez vécu) — n°9
    stopStatsTracking(); // arrête le chronomètre et écrit le reliquat — V2.12
    if (ctl) {
      try { await ctl.saveProgress(); } catch (e) {}
      try { ctl.destroy(); } catch (e) {}
      ctl = null;
    }
    current = null;
    bookmarkCache = [];
    closeCatPop();   // popover de catégorie ouvert depuis le tiroir (V2.26)
    closeKbdPop();   // mémo des raccourcis : panneau sans voile, cliquable derrière (V2.26)
    updateBookmarkBtn(); // le bouton retombe (état neutre) même sans livre
    closeDrawer();
    closeNoteEditor();
    hideTransient();
    /* sortie propre du mode concentration (sans effacer la préférence :
       elle sera restaurée à la prochaine ouverture). */
    focusMode = false;
    document.body.dataset.focus = 'off';
    document.body.dataset.flow = 'pages'; // l'état réel est relu à la prochaine ouverture
    $('#view-reader').classList.remove('focus-reveal');
    const fbtn = $('#btn-focus');
    if (fbtn) fbtn.classList.remove('active');
    /* Mode immersion (V2.17) : les barres reviennent avec la bibliothèque. */
    chromeHidden = false;
    delete document.body.dataset.chrome;
    clearTimeout(chromeTimer);
    $('#view-reader').hidden = true;
    $('#view-library').hidden = false;
    if (!silent) await NC.library.refresh();
  }

  /* ── Câblage ── */
  function init() {
    $('#btn-back').addEventListener('click', () => close());
    $('#nav-next').addEventListener('click', goNext);
    $('#nav-prev').addEventListener('click', goPrev);
    $('#btn-toc').addEventListener('click', () => drawerKind === 'toc' ? closeDrawer() : openDrawer('toc'));
    $('#btn-search').addEventListener('click', () => drawerKind === 'search' ? closeDrawer() : openDrawer('search'));
    $('#btn-notes').addEventListener('click', () => drawerKind === 'notes' ? closeDrawer() : openDrawer('notes'));
    $('#drawer-close').addEventListener('click', closeDrawer);
    $('#drawer-backdrop').addEventListener('click', closeDrawer);
    /* Export des citations (n°11) : bouton du tiroir notes + modale
       d'aperçu (son propre voile — jamais celui de la bibliothèque). */
    $('#drawer-export').addEventListener('click', openExportPop);
    $('#export-cancel').addEventListener('click', closeExportPop);
    $('#export-backdrop').addEventListener('click', closeExportPop);
    $('#export-md').addEventListener('click', () => downloadExport('md'));
    $('#export-txt').addEventListener('click', () => downloadExport('txt'));
    $('#btn-spread').addEventListener('click', toggleSpread);
    $('#btn-flow').addEventListener('click', toggleFlow);
    $('#btn-theme').addEventListener('click', toggleThemePop);
    $('#btn-focus').addEventListener('click', toggleFocus);
    $('#btn-capture').addEventListener('click', capture);
    $('#btn-font').addEventListener('click', toggleFontPop);
    $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('#btn-bookmark').addEventListener('click', toggleBookmark);
    $('#btn-history').addEventListener('click', () => drawerKind === 'history' ? closeDrawer() : openDrawer('history'));
    $('#btn-stats').addEventListener('click', () => drawerKind === 'stats' ? closeDrawer() : openDrawer('stats'));
    $('#btn-kbd').addEventListener('click', toggleKbdPop); // mémo des raccourcis (n°19)

    // Barre de progression : aperçu du pourcentage en glissant, saut au relâchement
    const bar = $('#progress');
    bar.addEventListener('pointerdown', () => { draggingBar = true; });
    window.addEventListener('pointerup', () => { draggingBar = false; });
    bar.addEventListener('input', () => {
      $('#pct-label').textContent = Math.round(bar.value / 10) + ' %';
    });
    bar.addEventListener('change', () => { seekTo(bar.value / 1000); });

    /* Pastilles de couleur du menu de sélection (ajout n°8) : un clic
       souligne DIRECTEMENT avec cette couleur. Le bouton « Souligner »
       réutilise la dernière couleur employée (réglage global). */
    const updateHighlightSwatch = () => {
      const sw = $('#sel-highlight-swatch');
      if (sw) sw.style.background = NC.highlightHex(lastHighlightColor);
    };
    NC.db.getSetting('lastHighlightColor', NC.HIGHLIGHT_DEFAULT)
      .then((v) => { lastHighlightColor = NC.highlightKey(v); updateHighlightSwatch(); })
      .catch(() => {});
    const applyWith = async (key) => {
      /* Garde : les pastilles ne doivent jamais lever si le contrôleur
         courant ne sait pas souligner. */
      if (!ctl || typeof ctl.addHighlight !== 'function') return;
      const used = await ctl.addHighlight(key);
      if (used) { lastHighlightColor = used; updateHighlightSwatch(); }
    };
    const colRow = $('#sel-colors');
    if (colRow) {
      Object.entries(NC.HIGHLIGHT_COLORS).forEach(([key, meta]) => {
        const d = document.createElement('button');
        d.type = 'button';
        d.className = 'sel-dot';
        d.dataset.color = key;
        d.title = 'Souligner en ' + meta.label.toLowerCase();
        d.setAttribute('aria-label', d.title);
        d.style.background = meta.hex;
        d.addEventListener('click', () => applyWith(key));
        colRow.appendChild(d);
      });
    }
    $('#sel-highlight').addEventListener('click', () => applyWith(lastHighlightColor));
    $('#sel-copy').addEventListener('click', async () => {
      if (ctl && ctl._pendingSel) {
        try { await navigator.clipboard.writeText(ctl._pendingSel.text); NC.toast('Copié.', 'success', 1600); }
        catch (e) { NC.toast('Copie impossible.', 'error', 1600); }
        ctl.hideSelPopup();
      }
    });
    /* Note personnelle (ajout n°9) : les repères du passage sont
       capturés AVANT de fermer le popup (la sélection disparaît
       alors), puis l'éditeur s'ouvre — tourner une page pendant la
       rédaction ne perd ni le texte ni la localisation. */
    $('#sel-note').addEventListener('click', () => {
      if (!ctl || ctl.type !== 'epub') return;
      const cap = ctl.captureSelection();
      ctl.hideSelPopup();
      if (!cap) { NC.toast('Le passage n\'a pas pu être localisé.', 'error', 2200); return; }
      openNoteEditor({ cap });
    });
    $('#note-cancel').addEventListener('click', closeNoteEditor);
    $('#note-save').addEventListener('click', saveNote);
    $('#note-pop-text').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNote(); }
    });

    // clic ailleurs → fermer menus
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#sel-popup')) {
        if (!$('#sel-popup').hidden && ctl && ctl._pendingSel) ctl.hideSelPopup();
      }
      if (!e.target.closest('#font-pop') && !e.target.closest('#btn-font')) $('#font-pop').hidden = true;
      if (!e.target.closest('#theme-pop') && !e.target.closest('#btn-theme')) $('#theme-pop').hidden = true;
      if (!e.target.closest('#cat-pop') && !e.target.closest('.note-cat-btn')) closeCatPop();
    });

    // Après un clic sur un outil, le focus retourne au document :
    // Espace/Entrée ne relancent pas l'outil, et les flèches tournent
    // bien la page (sinon, le bouton restait « armé »).
    const toolBlur = (e) => { const b = e.currentTarget; if (b && typeof b.blur === 'function') b.blur(); };
    ['#btn-back', '#btn-toc', '#btn-search', '#btn-notes', '#btn-spread', '#btn-flow', '#btn-theme', '#btn-focus', '#btn-capture', '#btn-font', '#btn-fullscreen', '#sel-highlight', '#sel-note', '#sel-copy', '#btn-bookmark', '#btn-history', '#btn-stats', '#btn-kbd']
      .forEach((sel) => { const b = $(sel); if (b) b.addEventListener('click', toolBlur); });

    // clavier — les flèches/espace tournent la page SAUF quand le focus est
    // dans un champ ou sur un bouton (sinon, cliquer un outil puis appuyer
    // sur Espace relancerait la lecture au lieu d'activer le bouton).
    // closest() et pas matches() : le SVG ou le tracé DANS un bouton
    // ne doit pas compter comme « hors outil ».
    document.addEventListener('keydown', (e) => {
      if ($('#view-reader').hidden) return;
      // e.target peut être document (événements synthétiques) : closest
      // n'existe alors pas — on ne traite que les cibles éléments
      const tgt = e.target;
      const inField = !!(tgt && tgt.closest && tgt.closest('input, textarea, select, button, a, [contenteditable]'));
      /* Éditeur de note ouvert (n°9) : il capte Échap (annuler) et
         Ctrl+Entrée (enregistrer) — y compris quand la saisie a le
         focus — AVANT la gestion générale d'Échap, et bloque les
         raccourcis de lecture le temps de la rédaction. */
      if (noteDraft) {
        if (e.key === 'Escape') { e.preventDefault(); closeNoteEditor(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNote(); }
        return;
      }
      /* Export des citations (n°11) : panneau modal — tant qu'il est
         affiché, Échap le referme et aucune autre touche n'agit
         derrière lui (le livre ne tourne pas de page). */
      if (!$('#export-pop').hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeExportPop(); }
        return;
      }
      /* Mémo des raccourcis (n°19) : panneau modal — tant qu'il est
         affiché, Échap ou « ? » le referme et aucune autre touche ne
         doit agir derrière lui. */
      if (!$('#kbd-pop').hidden) {
        if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); closeKbdPop(); }
        return;
      }
      if (e.key === 'Escape') {
        if (catPopId) { closeCatPop(); return; } // Échap ferme d'abord le popover de catégorie
        closeDrawer(); hideTransient(); if (focusMode) applyFocus(false); return;
      }
      if (inField) return;
      /* Le mémo s'ouvre même pendant qu'un livre charge (il ne touche
         pas au contrôleur) — mais jamais depuis un champ de saisie. */
      if (e.key === '?') { e.preventDefault(); openKbdPop(); return; }
      /* Ouverture en cours : le lecteur est déjà affiché mais le contrôleur
         n'existe pas encore — flèches et Espace ne doivent pas lever
         d'erreur (TypeError sur null relevée par l'audit). */
      if (!ctl) return;
      /* N°19 : jamais de lettre avec Ctrl/Cmd/Alt — Ctrl+S, Cmd+P,
         Alt+… restent des raccourcis du navigateur. (Échap et « ? »
         passent avant, sans modificateur utiles.) */
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFocus(); return; }
      /* Signet (n°8) : la touche B bascule le marque-page, comme le
         bouton — la main reste sur le clavier en train de lire. */
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleBookmark(); return; }
      /* Tiroirs (n°19) : T sommaire, R recherche, N notes, H passages,
         S statistiques — les mêmes bascules que les boutons de la
         barre du haut : re-appuyer referme. */
      const drawerKey = { t: 'toc', r: 'search', n: 'notes', h: 'history', s: 'stats' }[e.key.toLowerCase()];
      if (drawerKey) {
        e.preventDefault();
        if (drawerKind === drawerKey) closeDrawer(); else openDrawer(drawerKey);
        return;
      }
      /* Affichage & outils (n°19) : M double page (indisponible en
         défilement vertical, comme le bouton), V défilement, I
         immersion, J thème suivant, A typographie, P plein écran,
         C capture. Début / Fin : les extrémités du livre. */
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); if (!$('#btn-spread').disabled) toggleSpread(); return; }
      if (e.key === 'v' || e.key === 'V') { e.preventDefault(); toggleFlow(); return; }
      if (e.key === 'i' || e.key === 'I') { e.preventDefault(); toggleChrome(); return; }
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); cycleTheme(); return; }
      if (e.key === 'a' || e.key === 'A') { e.preventDefault(); toggleFontPop(); return; }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); toggleFullscreen(); return; }
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); capture(); return; }
      if (e.key === 'Home') { e.preventDefault(); seekTo(0); return; }
      if (e.key === 'End') { e.preventDefault(); seekTo(1); return; }
      /* Défilement vertical (n°3) : ↓ / Page↓ / Espace avancent d'un
         écran dans la section (et passent à la suivante en bas) ;
         → / ← sautent de section. En mode pages, tout est inchangé. */
      const scrolledEpub = ctl.type === 'epub' && ctl.flow === 'scrolled';
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); return; }
      if (e.key === 'PageDown' || e.key === ' ' || (scrolledEpub && e.key === 'ArrowDown')) {
        e.preventDefault();
        if (scrolledEpub && ctl.scrollPage(1)) return;
        goNext();
        return;
      }
      if (e.key === 'PageUp' || (scrolledEpub && e.key === 'ArrowUp')) {
        e.preventDefault();
        if (scrolledEpub && ctl.scrollPage(-1)) return;
        goPrev();
      }
    });

    // Mode concentration : la souris effleure le haut/bas de l'écran →
    // les barres réapparaissent le temps du réglage, puis se reforment.
    const viewEl = $('#view-reader');
    viewEl.addEventListener('mousemove', (e) => {
      if (!focusMode) return;
      const near = e.clientY < 58 || e.clientY > window.innerHeight - 84;
      viewEl.classList.toggle('focus-reveal', near);
    });
    viewEl.addEventListener('mouseleave', () => viewEl.classList.remove('focus-reveal'));

    // clic sur les bords du livre → tourner la page
    $('#book-frame').addEventListener('click', (e) => {
      if (!ctl || flipping) return;
      // jamais de tourne-page sur un élément d'interface : boutons du haut,
      // popups, liens — un clic d'outil ne doit JAMAIS tourner la page
      if (e.target.closest && e.target.closest('button, a, input, select, textarea, label, #sel-popup, #font-pop')) return;
      // un soulignement est un panneau SVG dans le DOM parent : ses clics
      // (synthétisés par epub.js) remontent jusqu'ici — ne pas tourner la page
      if (e.target.closest && e.target.closest('svg')) return;
      const r = $('#book-frame').getBoundingClientRect();
      const x = e.clientX - r.left;
      const w = r.width;
      const edge = Math.max(70, w * 0.12);
      if (x < edge) goPrev();
      else if (x > w - edge) goNext();
    });

    // redimensionnement
    let rto = null;
    window.addEventListener('resize', () => {
      clearTimeout(rto);
      rto = setTimeout(() => { if (ctl) ctl.resize(); }, 260);
    });

    // sauvegarde à la sortie
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (ctl) ctl.saveProgress();
        /* Historique (n°9) : clôture la visite — le temps passé onglet
           caché ne doit pas compter dans la durée du séjour. */
        endVisit();
        /* Statistiques (V2.12) : écrit le reliquat — le temps onglet
           caché ne comptera pas non plus (les ticks s'arrêtent). */
        flushStats(statsBookId);
      } else if (statsBookId) {
        statsLastTick = Date.now(); // reprise : aucun crédit rétroactif
      }
    });
    window.addEventListener('beforeunload', () => {
      if (ctl) { ctl.saveProgress(); endVisit(); }
      flushStats(statsBookId); // au pire, une perte de ≤ 30 s
    });

    /* Statistiques (V2.12) : toute activité dans la page réarme le
       crédit du temps. Les événements à l'intérieur des iframes EPUB
       n'arrivent pas ici — les tourne-pages les signalent déjà via
       statsNotePosition(). */
    ['pointerdown', 'mousemove', 'wheel', 'touchstart', 'keydown'].forEach((ev) => {
      document.addEventListener(ev, noteActivity, { passive: true });
    });

    /* Gestes tactiles (V2.17) : balayages, zones de tap et pinch sur
       la zone de lecture. Le câblage des iframes EPUB se fait de leur
       côté (hook content → NC.touch.wireContent). */
    if (NC.touch) NC.touch.init();
  }

  return {
    init, open, close, goNext, goPrev,
    toggleChrome, showChrome, // mode immersion (V2.17, tap central du tactile)
    _state: () => ({ ctl, current }),
    /* Crochets de test / diagnostic (V2.12) : état du suivi, seuil
       d'inactivité (les tests ne peuvent pas attendre 3 min), flush
       forcé. Aucun effet de bord en usage normal. */
    _statsState: () => ({
      book: statsBookId,
      pendingSec: Math.round(statsPendingSec),
      pendingPages: statsPendingPages,
      key: statsPageKey,
    }),
    _statsIdle: (ms) => { if (ms > 0) STATS_IDLE_MS = ms; },
    _statsFlush: () => flushStats(statsBookId),
    /* Crochet de test (V2.14) : statut courant du livre ouvert. */
    _statusState: () => ({ status: statusNow }),
  };
})();
