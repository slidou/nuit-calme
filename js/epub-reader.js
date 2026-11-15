/* NUIT CALME — lecteur EPUB (epub.js) :
   thème papier / nuit, typographie avancée (police, interlignage, alignement),
   double/simple page, mode défilement vertical,
   sommaire, recherche, soulignages persistants et multicolores,
   notes personnelles, reprise de lecture, capture de page,
   taille du texte. */
'use strict';

/* ── Thèmes du livre (papier, sépia, nuit, OLED) : définis dans util.js ──
   NC.BOOK_THEMES (palettes) + NC.bookThemeCss() (CSS injecté dans les EPUB). */

/* ── Mode concentration (ajout n°5) : CSS injectée dans chaque EPUB ──
   Le texte s'atténue ; le bloc sous la souris (et ses ancêtres de mise
   en page) retrouve une opacité pleine. La feuille est toujours présente
   mais INERTE : elle ne s'active qu'avec la classe nc-focus sur <html>. */
const NC_FOCUS_SEL = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, dd, dt, td, th, figcaption, div';
const NC_FOCUS_CSS = [
  'html.nc-focus p, html.nc-focus li, html.nc-focus h1, html.nc-focus h2, html.nc-focus h3,',
  'html.nc-focus h4, html.nc-focus h5, html.nc-focus h6, html.nc-focus blockquote,',
  'html.nc-focus pre, html.nc-focus dd, html.nc-focus dt, html.nc-focus td, html.nc-focus th,',
  'html.nc-focus figcaption, html.nc-focus div { opacity:.15; transition:opacity .18s ease; }',
  'html.nc-focus .nc-focus-open, html.nc-focus .nc-focus-now { opacity:1 !important; }',
  'html.nc-focus .nc-focus-now, html.nc-focus .nc-focus-now * { opacity:1 !important; transition:none; }',
].join('\n');

NC.openEpub = async function (rec, opts) {
  const host = NC.$('#epub-host');
  const book = ePub(rec.data.slice(0));

  const ctl = {
    type: 'epub',
    rec,
    book,
    spread: opts.spread,                    // 'always' | 'none'
    flow: opts.flow === 'scrolled' ? 'scrolled' : 'paginated', // mode de lecture (ajout n°3)
    /* Borna à l'ouverture (V2.26) : une valeur parasite enregistrée
       (fiche ancienne, donnée abîmée) s'appliquait telle quelle —
       setFontSize borne, l'ouverture ne le faisait pas. */
    fontSize: Math.max(80, Math.min(170, Math.round(opts.fontSize || 100))),
    theme: NC.BOOK_THEMES[opts.theme] ? opts.theme : 'paper',
    typo: NC.normalizeTypo(opts.typo),      // police / interlignage / alignement (ajout n°2)
    lastCfi: opts.lastCfi || '',
    focus: false,                           // mode concentration (ajout n°5)
    _wheelNavAt: 0,                         // anti-rebond du changement de section à la molette
    location: null,
    toc: [],
    locationsReady: false,
    _rendition: null,
    _onRelocated: null,
    _pendingSel: null,
    _destroyed: false,
  };

  /* Cache des annotations du livre courant (avec start/end/sectionIndex) */
  let annCache = [];

  /* ── Création de la rendition ──
     Les recréations (ouverture, défilement vertical, redisplay) sont
     SÉRIALISÉES (n°19) : détruire une rendition pendant que son
     display() est en vol fait nourrir à epub.js une rejeton non
     géré (« reading 'package' ») — deux V pressés vite, ou deux
     clics rapides sur le bouton, suffisaient. La file garantit
     qu'un display() se dénoue avant que le suivant ne détruise. */
  let renditionChain = Promise.resolve();
  function createRendition(target) {
    const run = () => {
      if (ctl._destroyed) return Promise.resolve(); // livre fermé entre-temps
      try {
        return doCreateRendition(target);
      } catch (e) {
        console.error(e);
        return Promise.resolve();
      }
    };
    const out = renditionChain.then(run, run);
    renditionChain = out.then(() => {}, () => {}); // la file survit aux erreurs
    return out;
  }
  function doCreateRendition(target) {
    if (ctl._rendition) { try { ctl._rendition.destroy(); } catch (e) {} }
    host.innerHTML = '';
    /* Mode défilement vertical (ajout n°3) : flow « scrolled-doc » = la
       section entière dans une iframe haute, le conteneur défile. La
       vue double n'a pas de sens ici (spread forcé à none). */
    const scrolled = ctl.flow === 'scrolled';
    const r = book.renderTo(host, {
      width: '100%',
      height: '100%',
      flow: scrolled ? 'scrolled-doc' : 'paginated',
      spread: scrolled ? 'none' : ctl.spread,
      allowScriptedContent: false,
      minSpreadWidth: 700,
    });
    // Thème courant injecté dans chaque contenu rendu (voie fiable epub.js)
    r.hooks.content.register((contents) => {
      try { contents.addStylesheetCss(NC.bookThemeCss(ctl.theme), 'nuit-calme'); } catch (e) { console.error(e); }
      /* Typographie avancée (n°2) : feuille DÉDIÉE posée après celle du
         thème — même mécanisme de remplacement par clé. */
      try { contents.addStylesheetCss(NC.typoCss(ctl.typo), 'nuit-calme-typo'); } catch (e) { console.error(e); }
      try { contents.addStylesheetCss(NC_FOCUS_CSS, 'nuit-calme-focus'); } catch (e) { console.error(e); }
      try { wireFocusSpot(contents); } catch (e) { console.error(e); }
      // nouvelle section rendue PENDANT que le mode est actif : classe immédiate
      try { if (ctl.focus) contents.document.documentElement.classList.add('nc-focus'); } catch (e) {}
      try { wireWheelNav(contents); } catch (e) { console.error(e); }
      wireEdgeTurn(contents);
      /* Gestes tactiles (V2.17) : balayages, zones de tap et pinch à
         l'intérieur du papier — un toucher sur l'iframe n'arrive jamais
         au document parent. Échoue doucement si le module est absent. */
      try { if (NC.touch) NC.touch.wireContent(contents); } catch (e) { console.error(e); }
    });
    r.themes.fontSize(ctl.fontSize + '%');
    /* V2.27 : les rects des soulignages sont cuits au moment du dessin.
       En paginé, tourner la page DANS UNE MÊME SECTION ne re-rend pas
       l'iframe (l'ancien « rendered » ne suffit plus) : les voiles
       restaient aux coordonnées de l'ancienne page et semblaient « se
       poser sur un autre passage » — surtout visible en concentration.
       Chaque relocation redessine donc les calques (débattu). */
    let reTimer = null;
    const scheduleRedraw = () => {
      clearTimeout(reTimer);
      reTimer = setTimeout(() => {
        if (!ctl._destroyed) { try { redrawAll(); } catch (e) {} }
      }, 140);
    };
    r.on('relocated', (loc) => {
      ctl.location = loc;
      if (ctl._onRelocated) ctl._onRelocated(loc);
      scheduleRedraw();
    });
    r.on('selected', onSelected);
    // Chaque vue rendue reçoit son calque de soulignements (et les anciennes
    // annotations y sont migrées si besoin).
    r.on('rendered', (section, view) => {
      try { redrawView(view); } catch (e) { console.error(e); }
    });
    // Reflow (redimensionnement, taille du texte) : les rects suivent.
    let rrTimer = null;
    r.on('resized', () => {
      clearTimeout(rrTimer);
      rrTimer = setTimeout(() => { try { redrawAll(); } catch (e) { console.error(e); } }, 200);
    });
    if (scrolled) wireScrollExtras();
    ctl._rendition = r;
    return r.display(target || undefined).catch(() => r.display());
  }

  ctl.redisplay = (target) => createRendition(target);

  /* ── Tourne-page au bord de la page elle-même ──
     Les clics À L'INTÉRIEUR de l'iframe ne remontent jamais au document
     parent : sans ce relais, cliquer le bord du papier ne fait rien
     (et seuls les boutons ⟨ ⟩ restent). Les zones d'extrémité déclenchent
     le tourne-page, le reste du texte reste cliquable (liens, sélection). */
  function wireEdgeTurn(contents) {
    try {
      const doc = contents.document;
      if (!doc || doc.__ncEdgeWired) return;
      doc.__ncEdgeWired = true;
      doc.addEventListener('click', (ev) => {
        if (ev.defaultPrevented || ev.button !== 0) return;
        const t = ev.target;
        if (t && t.closest && t.closest('a, button, video, audio, [role="button"]')) return;
        try {
          const sel = contents.window.getSelection();
          if (sel && !sel.isCollapsed) return; // une sélection n'est pas un tourne-page
        } catch (e) {}
        const w = contents.window.innerWidth || 0;
        if (!w) return;
        const edge = Math.max(70, w * 0.12);
        if (ev.clientX < edge && NC.reader && NC.reader.goPrev) NC.reader.goPrev();
        else if (ev.clientX > w - edge && NC.reader && NC.reader.goNext) NC.reader.goNext();
      });
    } catch (e) { console.error(e); }
  }

  /* ── Défilement vertical (ajout n°3) ─────────────────────────────
     La molette au-dessus d'une iframe ne remonte JAMAIS au document
     parent : c'est donc à l'intérieur de chaque section qu'on détecte
     les extrémités, pour enchaîner sur la section voisine quand le
     lecteur continue de défiler au-delà du bas (ou du haut). */
  function wireWheelNav(contents) {
    try {
      const w = contents.window;
      if (!w || w.__ncWheelWired) return;
      w.__ncWheelWired = true;
      w.addEventListener('wheel', (ev) => {
        if (!ctl || ctl._destroyed || ctl.flow !== 'scrolled') return;
        const c = host.querySelector('.epub-container');
        if (!c) return;
        const now = Date.now();
        if (now - ctl._wheelNavAt < 900) return;
        const max = c.scrollHeight - c.clientHeight;
        if (ev.deltaY > 0 && c.scrollTop >= max - 2) {
          ev.preventDefault();
          ctl._wheelNavAt = now;
          if (NC.reader && NC.reader.goNext) NC.reader.goNext();
        } else if (ev.deltaY < 0 && c.scrollTop <= 2) {
          ev.preventDefault();
          ctl._wheelNavAt = now;
          if (NC.reader && NC.reader.goPrev) NC.reader.goPrev();
        }
      }, { passive: false });
    } catch (e) { console.error(e); }
  }

  /* Les calques de soulignements sont ancrés sur l'iframe via des
     rectangles mesurés ; au défilement du conteneur on les replace en
     continu (léger : deux getBoundingClientRect par vue, rAF). */
  function anchorOverlays() {
    if (!ctl._rendition) return;
    let views = [];
    try { ctl._rendition.views().forEach((v) => views.push(v)); } catch (e) { return; }
    views.forEach((v) => {
      const svg = v.__ncOverlay;
      if (!svg || !v.iframe || !v.element) return;
      try {
        const fb = v.iframe.getBoundingClientRect();
        const hb = v.element.getBoundingClientRect();
        svg.style.setProperty('top', (fb.top - hb.top) + 'px', 'important');
        svg.style.setProperty('left', (fb.left - hb.left) + 'px', 'important');
      } catch (e) {}
    });
  }

  function wireScrollExtras() {
    const c = host.querySelector('.epub-container');
    if (!c || c.__ncScrollWired) return;
    c.__ncScrollWired = true;
    let ticking = false;
    c.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        try { anchorOverlays(); } catch (e) {}
      });
    }, { passive: true });
  }

  /* ── Navigation ──
     En défilement vertical, next()/prev() d'epub.js sautent déjà de
     section en section ; on les remplace par un ciblage déterministe
     de la section voisine (même résultat, moins d'états internes). */
  ctl.next = () => {
    if (!ctl._rendition) return;
    if (ctl.flow === 'scrolled') return gotoSection(1);
    return ctl._rendition.next();
  };
  ctl.prev = () => {
    if (!ctl._rendition) return;
    if (ctl.flow === 'scrolled') return gotoSection(-1);
    return ctl._rendition.prev();
  };

  async function gotoSection(dir) {
    if (!ctl._rendition) return;
    const items = book.spine.spineItems || [];
    if (!items.length) return;
    /* ATTENTION : spineItem.index est 0-based dans epub.js
       (chap1 = 0, chap2 = 1, …) — le voisin est donc items[idx + dir]. */
    let idx = 0;
    try {
      const sec = book.spine.get(ctl.location.start.cfi);
      if (sec && typeof sec.index === 'number') idx = sec.index;
    } catch (e) {}
    const target = items[Math.min(items.length - 1, Math.max(0, idx + dir))];
    if (!target) return;
    try { await ctl._rendition.display(target.href); } catch (e) {}
    /* En remontant d'une section, on arrive en BAS de la précédente
       (continuité de lecture naturelle) au lieu de retomber sous son
       titre. display() repositionne lui-même : on corrige après coup. */
    if (dir < 0) {
      setTimeout(() => {
        const c = host.querySelector('.epub-container');
        if (c && c.scrollHeight > c.clientHeight && c.scrollTop < 40) {
          c.scrollTop = c.scrollHeight;
          try { anchorOverlays(); } catch (e) {}
        }
      }, 160);
    }
  }

  /* Page clavier en défilement : ~85 % du cadre. Aux extrémités on
     rend la main (le clavier passera alors à la section voisine).
     Retourne true si un défilement a eu lieu. */
  ctl.scrollPage = (dir) => {
    const c = host.querySelector('.epub-container');
    if (!c) return false;
    const max = c.scrollHeight - c.clientHeight;
    if (dir > 0 && c.scrollTop >= max - 4) return false;
    if (dir < 0 && c.scrollTop <= 4) return false;
    const step = Math.max(220, c.clientHeight * 0.85);
    try { c.scrollBy({ top: dir * step, behavior: 'smooth' }); }
    catch (e) { c.scrollTop += dir * step; }
    return true;
  };

  ctl.setSpread = async (mode) => {
    ctl.spread = mode;
    const loc = ctl.location;
    const target = loc ? loc.start.cfi : (ctl.lastCfi || undefined);
    await createRendition(target);
    await ctl.restoreHighlights();
    return target;
  };

  /* Bascule pages ⇄ défilement vertical (ajout n°3) : la rendition est
     recréée avec l'autre flow, à la position exacte où l'on se trouvait. */
  ctl.setFlow = async (mode) => {
    ctl.flow = mode === 'scrolled' ? 'scrolled' : 'paginated';
    const loc = ctl.location;
    const target = loc ? loc.start.cfi : (ctl.lastCfi || undefined);
    await createRendition(target);
    await ctl.restoreHighlights();
    return ctl.flow;
  };

  /* Changement de thème à chaud : on remplace simplement la feuille
     « nuit-calme » dans chaque document déjà rendu (pas de re-rendu). */
  ctl.setTheme = (mode) => {
    ctl.theme = NC.BOOK_THEMES[mode] ? mode : 'paper';
    const css = NC.bookThemeCss(ctl.theme);
    if (ctl._rendition) {
      ctl._rendition.getContents().forEach((c) => {
        try { c.addStylesheetCss(css, 'nuit-calme'); } catch (e) { console.error(e); }
      });
    }
    return ctl.theme;
  };

  /* ── Typographie avancée (ajout n°2) : changement à chaud ──
     Même principe que setTheme : on remplace la feuille
     « nuit-calme-typo » dans chaque document déjà rendu. Changer la
     police ou l'interlignage reflowe le texte : les calques de
     soulignement sont redessinés en deux temps (même pattern que
     setFontSize). */
  ctl.setTypo = (patch) => {
    ctl.typo = NC.normalizeTypo(Object.assign({}, ctl.typo, patch || {}));
    const css = NC.typoCss(ctl.typo);
    if (ctl._rendition) {
      ctl._rendition.getContents().forEach((c) => {
        try { c.addStylesheetCss(css, 'nuit-calme-typo'); } catch (e) { console.error(e); }
      });
      clearTimeout(ctl._typoTimer);
      ctl._typoTimer = setTimeout(() => { try { redrawAll(); } catch (e) {} }, 260);
      clearTimeout(ctl._typoTimer2);
      ctl._typoTimer2 = setTimeout(() => { try { redrawAll(); } catch (e) {} }, 900);
    }
    return ctl.typo;
  };

  /* ── Mode concentration : activé/désactivé à chaud ──
     On se contente de poser/retirer la classe nc-focus sur le <html> de
     chaque iframe déjà rendue (les suivantes la reçoivent via le hook).
     Au passage, on éteint tout « spot » laissé par la souris. */
  ctl.setFocus = (on) => {
    ctl.focus = !!on;
    const list = ctl._rendition ? ctl._rendition.getContents() : [];
    list.forEach((c) => {
      try {
        const doc = c.document;
        const html = doc && doc.documentElement;
        if (!html) return;
        if (ctl.focus) html.classList.add('nc-focus');
        else html.classList.remove('nc-focus');
        (doc.querySelectorAll('.nc-focus-now, .nc-focus-open') || []).forEach((el) => {
          el.classList.remove('nc-focus-now');
          el.classList.remove('nc-focus-open');
        });
      } catch (e) { console.error(e); }
    });
    return ctl.focus;
  };

  /* Suivi de souris DANS l'iframe : le bloc survolé s'allume, le reste
     reste atténué. Les ancêtres de mise en page (div enveloppants) sont
     rétablis sans pour autant révéler leurs autres descendants. */
  function wireFocusSpot(contents) {
    const doc = contents.document;
    if (!doc || doc.__ncFocusWired) return;
    doc.__ncFocusWired = true;
    let lit = null;   // bloc éclairé
    let opens = [];   // ancêtres rétablis
    const clear = () => {
      if (lit) { try { lit.classList.remove('nc-focus-now'); } catch (e) {} lit = null; }
      opens.forEach((el) => { try { el.classList.remove('nc-focus-open'); } catch (e) {} });
      opens = [];
    };
    doc.addEventListener('mousemove', (ev) => {
      if (!ctl.focus) { clear(); return; }
      const t = ev.target;
      if (!t || !t.closest) { clear(); return; }
      const blk = t.closest(NC_FOCUS_SEL);
      if (blk === lit) return; // même bloc : rien à faire
      clear();
      if (!blk) return;
      lit = blk;
      try { blk.classList.add('nc-focus-now'); } catch (e) {}
      let el = blk.parentElement;
      while (el && el !== doc.body && el !== doc.documentElement) {
        if (el.matches && el.matches(NC_FOCUS_SEL)) {
          try { el.classList.add('nc-focus-open'); } catch (e) {}
          opens.push(el);
        }
        el = el.parentElement;
      }
    }, { passive: true });
    // la souris quitte l'iframe : tout s'éteint. Deux filets :
    // 1) mouseout du document interne (relatedTarget null) ;
    // 2) mouseleave sur l'élément <iframe> côté parent — plus fiable,
    //    notamment quand le pointeur « saute » d'un coup (l'événement
    //    de frontière interne n'est alors pas toujours émis).
    doc.addEventListener('mouseout', (ev) => { if (!ev.relatedTarget) clear(); });
    try {
      const fe = contents.window.frameElement;
      if (fe) fe.addEventListener('mouseleave', clear);
    } catch (e) {}
  }

  ctl.setFontSize = (pct) => {
    ctl.fontSize = Math.max(80, Math.min(170, pct));
    /* prefs est la source des préférences : sauvegarde différée pour
       absorber les rafales de clics sur A− / A+ sans marteler la base. */
    clearTimeout(ctl._fsPrefsTimer);
    ctl._fsPrefsTimer = setTimeout(() => {
      NC.db.getPrefs(rec.id)
        .then((p) => NC.db.putPrefs(Object.assign(p || { id: rec.id }, { fontSize: ctl.fontSize, updatedAt: Date.now() })))
        .catch(() => {});
    }, 400);
    if (ctl._rendition) {
      ctl._rendition.themes.fontSize(ctl.fontSize + '%');
      // la refonte du texte est asynchrone : on redessine en deux temps
      clearTimeout(ctl._fsTimer);
      ctl._fsTimer = setTimeout(() => { try { redrawAll(); } catch (e) {} }, 260);
      clearTimeout(ctl._fsTimer2);
      ctl._fsTimer2 = setTimeout(() => { try { redrawAll(); } catch (e) {} }, 900);
    }
    return ctl.fontSize;
  };

  /* ── Progression ── */
  ctl.percent = () => {
    const loc = ctl.location;
    if (!loc || !loc.start) return 0;
    if (typeof loc.start.percentage === 'number' && isFinite(loc.start.percentage)) return loc.start.percentage;
    try {
      const sec = book.spine.get(loc.start.cfi);
      if (sec) return (sec.index - 1) / Math.max(1, book.spine.length);
    } catch (e) {}
    return 0;
  };

  ctl.seekPercent = async (p) => {
    p = Math.max(0, Math.min(1, p));
    if (ctl.locationsReady) {
      const cfi = book.locations.cfiFromPercentage(p);
      if (cfi) { await ctl._rendition.display(cfi); return; }
    }
    const items = book.spine.spineItems || [];
    if (!items.length) return;
    const idx = Math.min(items.length - 1, Math.max(0, Math.floor(p * items.length)));
    await ctl._rendition.display(items[idx].href);
  };

  ctl.saveProgress = () => {
    const loc = ctl.location;
    const entry = {
      id: rec.id,
      lastOpened: Date.now(),
      fontSize: ctl.fontSize,
      lastCfi: '',
      pct: Math.round(ctl.percent() * 1000) / 1000,
    };
    if (loc && loc.start) entry.lastCfi = loc.start.cfi;
    return NC.db.putProgress(entry);
  };

  /* Index des positions (pour la barre de progression) */
  book.ready.then(() => book.locations.generate(1200)).then(() => {
    if (ctl._destroyed) return;
    ctl.locationsReady = true;
    // Recalcule la position courante maintenant que les locations existent
    if (ctl.location && ctl._onRelocated) ctl._onRelocated(ctl.location);
  }).catch(() => {});

  /* ── Sommaire ── */
  ctl.loadToc = async () => {
    try {
      const nav = await book.loaded.navigation;
      ctl.toc = (nav && nav.toc) ? nav.toc : [];
    } catch (e) { ctl.toc = []; }
    return ctl.toc;
  };

  ctl.chapterLabel = () => {
    const loc = ctl.location;
    if (!loc || !loc.start) return '';
    const href = String(loc.start.href || '');
    const item = flatToc().find((t) => samePage(t.href, href));
    if (item) return item.label;
    try {
      const sec = book.spine.get(loc.start.cfi);
      if (sec && sec.index) return 'Chapitre ' + sec.index;
    } catch (e) {}
    return '';
  };

  /* Libellé de chapitre pour l'endroit d'UNE annotation (export des
     citations, n°11) : même résolution que chapterLabel — le sommaire
     de l'éditeur d'abord, repli « Chapitre N » — mais pour un CFI
     quelconque, pas la position courante. Hors sommaire, la
     numérotation reste humaine (le premier feuillet = chapitre 1). */
  ctl.chapterLabelFor = (cfi) => {
    try {
      const sec = cfi ? book.spine.get(cfi) : null;
      if (!sec) return '';
      const href = String(sec.href || '');
      const item = flatToc().find((t) => samePage(t.href, href));
      if (item && item.label) return item.label;
      if (typeof sec.index === 'number') return 'Chapitre ' + (sec.index + 1);
    } catch (e) {}
    return '';
  };

  function flatToc() {
    const out = [];
    const walk = (items) => items.forEach((it) => { out.push(it); if (it.subitems && it.subitems.length) walk(it.subitems); });
    walk(ctl.toc);
    return out;
  }
  ctl.flatToc = flatToc;

  function samePage(a, b) {
    const strip = (s) => String(s || '').split('#')[0].split('/').pop().toLowerCase();
    return strip(a) === strip(b) && strip(a) !== '';
  }

  /* ── Sélection → menu Souligner ── */
  function onSelected(cfi) {
    if (ctl._destroyed) return;
    if (!ctl._rendition) return;
    // En vue double, deux sections peuvent être affichées côte à côte :
    // on prend le document qui porte RÉELLEMENT la sélection, et l'iframe
    // qui va avec (sinon le popup serait positionné avec le rect du
    // premier cadre).
    let sel = null;
    let selFrame = null;
    for (const c of ctl._rendition.getContents()) {
      try {
        const s = c.window.getSelection();
        if (s && s.rangeCount && !s.isCollapsed) {
          sel = s;
          selFrame = (c.document.defaultView && c.document.defaultView.frameElement) || null;
          break;
        }
      } catch (e) {}
    }
    const text = sel ? String(sel).trim() : '';
    if (!text) return;
    ctl._pendingSel = { cfi, text };

    let x = window.innerWidth / 2, y = 140;
    try {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const frameEl = selFrame || host.querySelector('iframe');
      if (rect && frameEl) {
        const fr = frameEl.getBoundingClientRect();
        /* #sel-popup est en position:fixed → coordonnées VIEWPORT.
           rect est relatif à l'iframe ; fr le repositionne dans la page.
           (Avant, on soustrayait #stage → popup décalé de la hauteur du header.) */
        x = fr.left + rect.left + rect.width / 2;
        y = fr.top + rect.top;
      }
    } catch (e) {}
    const pop = NC.$('#sel-popup');
    pop.hidden = false;
    const pw = pop.offsetWidth || 190;
    x = Math.max(12, Math.min(window.innerWidth - pw - 12, x - pw / 2));
    y = Math.max(60, y - 48);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }

  ctl.hideSelPopup = () => {
    NC.$('#sel-popup').hidden = true;
    ctl._pendingSel = null;
    /* Vue double = deux iframes : nettoyer la sélection PARTOUT,
       pas seulement sur la première. */
    try {
      (ctl._rendition ? ctl._rendition.getContents() : []).forEach((c) => {
        try { c.window.getSelection().removeAllRanges(); } catch (e) {}
      });
    } catch (e) {}
  };

  /* ── Soulignages — calque maison ─────────────────────────────────
     Pourquoi ne pas passer par rendition.annotations ?
     1) epub.js ne sait pas relire certains CFI de plage qu'il génère
        lui-même (sélection finissant sur un élément, nœuds de texte
        intercalés) : view.highlight() reçoit un range nul, le panneau
        SVG reste vide → soulignement invisible.
     2) Le placement des <rect> de la lib dépend du rectangle d'un <g>
        encore vide au moment du calcul, ce qui peut décaler tout le
        calque selon le navigateur.
     Nous stockons donc avec chaque annotation des repères robustes :
     l'index de section + les décalages absolus du texte dans la
     section (stables, le DOM est reconstruit à l'identique à chaque
     rendu), puis nous dessinons nous-mêmes les rects dans un SVG
     calé exactement sur l'iframe. Le CFI reste enregistré pour
     « Aller au passage » (il suffit à retrouver la bonne section). */
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* Décalage absolu (en caractères) du point (nœud, offset) dans le corps. */
  function offsetAt(doc, container, off) {
    const body = doc.body || doc.documentElement;
    if (!body) return null;
    const probe = doc.createRange();
    probe.selectNodeContents(body);
    try { probe.setEnd(container, off); } catch (e) { return null; }
    return probe.toString().length;
  }

  function offsetsOfRange(doc, range) {
    if (!range) return null;
    const start = offsetAt(doc, range.startContainer, range.startOffset);
    const end = offsetAt(doc, range.endContainer, range.endOffset);
    if (start == null || end == null || end < start) return null;
    return { start, end };
  }

  /* Recrée un range DOM à partir de décalages absolus. */
  function rangeFromOffsets(doc, start, end) {
    const body = doc.body || doc.documentElement;
    if (!body || !(end > start)) return null;
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
    let pos = 0, node, startNode = null, startOff = 0, endNode = null, endOff = 0;
    let lastNode = null, lastLen = 0;
    while ((node = walker.nextNode())) {
      const len = (node.nodeValue || '').length;
      const nodeEnd = pos + len;
      lastNode = node; lastLen = len;
      if (!startNode && start < nodeEnd) { startNode = node; startOff = Math.max(0, start - pos); }
      if (start >= nodeEnd) { pos = nodeEnd; continue; }
      if (end <= nodeEnd) { endNode = node; endOff = Math.max(0, end - pos); break; }
      pos = nodeEnd;
    }
    if (!startNode) return null;
    if (!endNode) { endNode = lastNode || startNode; endOff = lastLen; }
    try {
      const r = doc.createRange();
      r.setStart(startNode, startOff);
      r.setEnd(endNode, endOff);
      return r;
    } catch (e) { return null; }
  }

  /* Recherche du texte sélectionné dans la section (migration des
     anciennes annotations dont le CFI est illisible). */
  function textSearchRange(doc, text) {
    if (!text || text.length < 2) return null;
    const body = doc.body || doc.documentElement;
    if (!body) return null;
    let hay;
    try {
      const probe = doc.createRange();
      probe.selectNodeContents(body);
      hay = probe.toString();
    } catch (e) { return null; }
    let at = hay.indexOf(text);
    if (at === -1) {
      const head = text.slice(0, Math.min(48, Math.max(8, Math.floor(text.length / 2))));
      at = hay.indexOf(head);
      if (at === -1) return null;
    }
    return rangeFromOffsets(doc, at, at + text.length);
  }

  /* SVG superposé à l'iframe d'une vue — même ancrage que le Pane de
     la lib, mais calculé par nous et ré-ancré à chaque redessin. */
  function overlayFor(view) {
    try {
      const frame = view.iframe;
      const holder = view.element;
      if (!frame || !holder || !holder.appendChild) return null;
      if (view.__ncOverlay && view.__ncOverlay.isConnected) return view.__ncOverlay;
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'nc-ann');
      svg.style.setProperty('position', 'absolute', 'important');
      svg.style.setProperty('pointer-events', 'none', 'important');
      svg.style.setProperty('overflow', 'hidden', 'important');
      svg.style.setProperty('margin', '0', 'important');
      svg.style.setProperty('padding', '0', 'important');
      holder.appendChild(svg);
      view.__ncOverlay = svg;
      return svg;
    } catch (e) { console.error('calque soulignages', e); return null; }
  }

  /* ── Métriques d'encre (V2.27) ──
     Les rects de getClientRects() suivent la MÉTRIQUE de la police
     (ascende/descende déclarés par le fichier de police), pas l'encre
     réellement dessinée : avec Cormorant Garamond, l'ascendeur déclaré
     dépasse largement les capitales — le voile « flotte » au-dessus du
     texte et le trait de note coupe les mots. On mesure donc la VRAIE
     boîte d'encre via canvas (actualBoundingBox*) et on replace
     baseline et bande visible à partir de là. Un résultat par document
     (iframe) et par police, recalculé si la typo change. */
  const inkMemo = new WeakMap();
  function inkMetricsFor(range, doc) {
    try {
      let el = range.startContainer;
      if (el && el.nodeType === Node.TEXT_NODE) el = el.parentElement;
      if (!el) el = doc.body;
      const view = doc.defaultView;
      const cs = view && view.getComputedStyle(el);
      if (!cs || !cs.fontSize) return null;
      const fs = parseFloat(cs.fontSize);
      if (!isFinite(fs) || fs <= 0) return null;
      const font = `${cs.fontStyle} ${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
      let m = inkMemo.get(doc);
      if (m && m.font === font) return m;
      const cvs = doc.createElement('canvas');
      const ctx = cvs.getContext && cvs.getContext('2d');
      if (!ctx || !ctx.measureText) return null;
      ctx.font = font;
      const probe = ctx.measureText('Hxdplgy');
      if (!probe) return null;
      const fbA = probe.fontBoundingBoxAscent, fbD = probe.fontBoundingBoxDescent;
      const asc = probe.actualBoundingBoxAscent, desc = probe.actualBoundingBoxDescent;
      if (![fbA, fbD, asc, desc].every((v) => typeof v === 'number' && isFinite(v))) return null;
      /* asc/desc mesurés sur « Hxdplgy » : capitales, ascendantes et
         descendantes — repli généreux si la police ment sur ses bornes. */
      m = {
        font, fs, fbA, fbD,
        asc: Math.max(asc, fs * 0.62),
        desc: Math.max(desc, fs * 0.22),
        /* Le rect d'une ligne peut inclure l'interlignage (Chrome) ou
           non : la moitié excédentaire est répartie au-dessus/en-dessous
           de la boîte de métrique — on la redistribue pour retrouver la
           baseline quelle que soit l'implémentation. */
        baselineFor: (rc) => rc.bottom - fbD - Math.max(0, (rc.height - fbA - fbD)) / 2,
      };
      inkMemo.set(doc, m);
      return m;
    } catch (e) { return null; }
  }

  /* Dessine une annotation dans le calque :
     - surlignage (défaut) = voile translucide SUR L'ENCRE de chaque
       ligne (V2.27 : calé sur les glyphes, plus sur la boîte de
       métrique — ne touche plus la ligne du dessus) ;
     - note = voile fin + trait net SOUS la ligne, façon crayon :
       impossible à rater, distinct du surlignage (couleur bleue par
       défaut), et qui ne « barre » plus le mot. */
  function drawRange(svg, range, annId, hex, note) {
    const doc = (range.startContainer && range.startContainer.ownerDocument)
      || (range.commonAncestorContainer && range.commonAncestorContainer.ownerDocument)
      || document;
    const ink = inkMetricsFor(range, doc);
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-nc-ann', annId);
    g.setAttribute('fill', hex || NC.highlightHex(NC.HIGHLIGHT_DEFAULT));
    const veil = document.createElementNS(SVG_NS, 'g');
    veil.setAttribute('fill-opacity', note ? '0.28' : '0.38'); // voile fin vs voile plein
    g.appendChild(veil);
    let bars = null;
    if (note) {
      bars = document.createElementNS(SVG_NS, 'g');
      bars.setAttribute('fill-opacity', '0.9'); // trait dense, lisible au premier coup d'œil
      g.appendChild(bars);
    }
    const seen = new Set();
    const rects = range.getClientRects();
    for (const rc of rects) {
      const w = Math.round(rc.width), h = Math.round(rc.height);
      if (w < 1 || h < 1) continue;
      const key = Math.round(rc.left) + '|' + Math.round(rc.top) + '|' + w + '|' + h;
      if (seen.has(key)) continue;
      seen.add(key);
      /* bande verticale de l'encre de la ligne */
      let top, bottom;
      if (ink) {
        const base = ink.baselineFor(rc);
        top = base - ink.asc;
        bottom = base + ink.desc;
      } else {
        /* repli (métriques indisponibles) : encadré au jugé, centré bas */
        top = rc.top + rc.height * 0.30;
        bottom = rc.bottom - rc.height * 0.06;
      }
      const pad = ink ? Math.max(1.5, ink.fs * 0.07) : 2;
      const vh = Math.max(4, (bottom - top) + pad * 2);
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('x', rc.left);
      r.setAttribute('y', Math.max(rc.top - 2, top - pad));
      r.setAttribute('width', rc.width);
      r.setAttribute('height', vh);
      veil.appendChild(r);
      if (bars) {
        const bh = Math.max(2.5, Math.min(4.5, (ink ? ink.fs : h) * 0.14));
        const b = document.createElementNS(SVG_NS, 'rect');
        b.setAttribute('x', rc.left);
        b.setAttribute('y', bottom + 1.6); // SOUS l'encre, plus jamais dans le mot
        b.setAttribute('width', rc.width);
        b.setAttribute('height', bh);
        bars.appendChild(b);
      }
    }
    if (g.firstChild && (veil.firstChild || (bars && bars.firstChild))) svg.appendChild(g);
  }

  /* Migration des annotations de l'ancien format (CFI seul) :
     on tente le CFI, sinon la recherche du texte, puis on écrit les
     décalages dans la base pour ne plus jamais y revenir. */
  function migrateAnn(a, view) {
    const doc = view.contents && view.contents.document;
    if (!doc) return false;
    let range = null;
    try {
      if (a.cfi && typeof ePub.CFI === 'function') {
        const pos = new ePub.CFI(a.cfi).spinePos;
        if (pos === view.index) range = view.contents.range(a.cfi);
      }
    } catch (e) {}
    if (!range) range = textSearchRange(doc, a.text || '');
    if (!range) return false;
    const off = offsetsOfRange(doc, range);
    if (!off) return false;
    a.sectionIndex = view.index;
    a.start = off.start;
    a.end = off.end;
    NC.db.putAnnotation(a).catch(() => {});
    return true;
  }

  /* Redessine les soulignements d'une vue (et ré-ancre le calque). */
  function redrawView(view) {
    if (!view || !view.contents || !view.contents.document || !view.iframe || !view.element) return;
    const doc = view.contents.document;
    const secIdx = view.index;
    // anciennes annotations (CFI seul) : migration dès que leur section s'affiche
    for (const a of annCache) {
      if (a.bookId !== rec.id || typeof a.start === 'number') continue;
      if (typeof a.sectionIndex === 'number' && a.sectionIndex !== secIdx) continue;
      try { migrateAnn(a, view); } catch (e) { console.error('migration soulignage', e); }
    }
    const svg = overlayFor(view);
    if (!svg) return;
    try {
      const fb = view.iframe.getBoundingClientRect();
      const hb = view.element.getBoundingClientRect();
      svg.style.setProperty('top', (fb.top - hb.top) + 'px', 'important');
      svg.style.setProperty('left', (fb.left - hb.left) + 'px', 'important');
      svg.style.setProperty('width', (view.iframe.scrollWidth || fb.width) + 'px', 'important');
      svg.style.setProperty('height', (view.iframe.scrollHeight || fb.height) + 'px', 'important');
    } catch (e) {}
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    for (const a of annCache) {
      if (a.bookId !== rec.id) continue;
      if (a.sectionIndex !== secIdx || typeof a.start !== 'number') continue;
      const range = rangeFromOffsets(doc, a.start, a.end);
      if (!range) continue;
      drawRange(svg, range, a.id, NC.highlightHex(a.color), NC.isNote(a));
    }
  }

  function redrawAll() {
    if (!ctl._rendition) return;
    const views = [];
    try { ctl._rendition.views().forEach((v) => views.push(v)); } catch (e) { return; }
    views.forEach((v) => { try { redrawView(v); } catch (e) { console.error(e); } });
  }

  /* Retrouve la sélection live et ses repères de repositionnement
     (vue double : la vue qui porte RÉELLEMENT la sélection). Aucun
     effet de bord : sert au surlignage (n°8) ET aux notes (n°9), qui
     capturent ainsi les coordonnées AVANT toute action ultérieure
     (fermeture du popup, tourne-page pendant la rédaction…).
     Retour : { sectionIndex, start, end, text, cfi } — ou null. */
  ctl.captureSelection = () => {
    if (!ctl._rendition) return null;
    let view = null, range = null, selText = (ctl._pendingSel && ctl._pendingSel.text) || '';
    const views = [];
    try { ctl._rendition.views().forEach((v) => views.push(v)); } catch (e) {}
    for (const v of views) {
      try {
        const w = v.contents && v.contents.window;
        const s = w && w.getSelection();
        if (s && s.rangeCount && !s.isCollapsed) {
          view = v;
          range = s.getRangeAt(0);
          const live = String(s).trim();
          if (live) selText = live;
          break;
        }
      } catch (e) {}
    }
    let start = null, end = null;
    if (view && range) {
      start = offsetAt(view.contents.document, range.startContainer, range.startOffset);
      end = offsetAt(view.contents.document, range.endContainer, range.endOffset);
    }
    // filet de sécurité : localisation par le texte
    if (view && (start == null || end == null || !(end > start))) {
      const off = offsetsOfRange(view.contents.document, textSearchRange(view.contents.document, selText));
      if (off) { start = off.start; end = off.end; }
    }
    if (!view || start == null || end == null || !(end > start)) return null;
    return {
      sectionIndex: view.index,
      start,
      end,
      text: String(selText).slice(0, 400),
      cfi: (ctl._pendingSel && ctl._pendingSel.cfi) || '',
    };
  };

  /* Souligne la sélection courante. `colorKey` : clé de NC.HIGHLIGHT_COLORS
     (ajout n°8) — « or » par défaut, repli pour toute valeur inconnue.
     La dernière couleur utilisée est mémorisée (réglage global). */
  ctl.addHighlight = async (colorKey) => {
    if (!ctl._rendition) return null;
    const cap = ctl.captureSelection();
    if (!cap) {
      ctl.hideSelPopup();
      NC.toast('Le passage n\'a pas pu être souligné.', 'error', 2200);
      return null;
    }
    const ann = {
      id: crypto.randomUUID(),
      bookId: rec.id,
      sectionIndex: cap.sectionIndex,
      start: cap.start,
      end: cap.end,
      text: cap.text,
      cfi: cap.cfi,
      color: NC.highlightKey(colorKey),
      createdAt: Date.now(),
    };
    annCache.push(ann);
    try { await NC.db.putAnnotation(ann); } catch (e) { console.error(e); }
    NC.db.putSetting('lastHighlightColor', ann.color).catch(() => {});
    redrawSection(ann.sectionIndex);
    ctl.hideSelPopup();
    NC.toast('Passage souligné en ' + NC.HIGHLIGHT_COLORS[ann.color].label.toLowerCase() + '.', 'success', 2000);
    return ann.color;
  };

  /* Redessine proprement la vue qui affiche une section donnée. */
  function redrawSection(secIdx) {
    try { ctl._rendition.views().forEach((v) => { if (v.index === secIdx) redrawView(v); }); } catch (e) { console.error(e); }
  }

  /* ── Notes personnelles (ajout n°9) ──
     Une note est une annotation `kind:'note'` : passage cité (text)
     + note rédigée (note), repérée comme un surlignage (sectionIndex
     + décalages absolus), rendue en trait sous la ligne. */
  ctl.addNote = async (cap, noteText) => {
    if (!cap || !ctl._rendition) return null;
    const ann = {
      id: crypto.randomUUID(),
      bookId: rec.id,
      sectionIndex: cap.sectionIndex,
      start: cap.start,
      end: cap.end,
      text: cap.text,
      cfi: cap.cfi,
      color: NC.NOTE_DEFAULT,
      kind: 'note',
      note: String(noteText || '').slice(0, 4000),
      createdAt: Date.now(),
    };
    annCache.push(ann);
    try { await NC.db.putAnnotation(ann); } catch (e) { console.error(e); }
    redrawSection(ann.sectionIndex);
    return ann;
  };

  /* Réécrit le texte d'une note existante (édition depuis le tiroir ou
     réouverture de l'éditeur) : cache + base ; le trait ne bouge pas. */
  ctl.updateNote = async (ann, noteText) => {
    const val = String(noteText || '').slice(0, 4000);
    const target = annCache.find((a) => a.id === ann.id);
    if (target) { target.note = val; target.updatedAt = Date.now(); }
    try { await NC.db.putAnnotation(Object.assign({}, ann, { note: val, updatedAt: Date.now() })); } catch (e) { console.error(e); }
    return true;
  };

  /* Change la couleur d'un soulignement EXISTANT (tiroir Soulignages) :
     mise à jour du cache, de la base, et des <g> SVG déjà dessinés —
     sans re-rendu du livre. */
  ctl.recolorHighlight = async (ann, colorKey) => {
    const key = NC.highlightKey(colorKey);
    const target = annCache.find((a) => a.id === ann.id);
    if (target) target.color = key;
    try { await NC.db.putAnnotation(Object.assign({}, ann, { color: key })); } catch (e) { console.error(e); }
    const hex = NC.highlightHex(key);
    const views = [];
    try { ctl._rendition.views().forEach((v) => views.push(v)); } catch (e) {}
    views.forEach((v) => {
      const svg = v.__ncOverlay;
      if (!svg) return;
      svg.querySelectorAll('g[data-nc-ann="' + CSS.escape(ann.id) + '"]').forEach((g) => g.setAttribute('fill', hex));
    });
    return key;
  };

  /* Affecte (ou retire, key = '') une catégorie à une annotation
     (ajout n°10) : cache + base. Aucun rendu dans le livre n'est
     touché — la catégorie ne vit que dans le tiroir. La valeur est
     normalisée (clé inconnue → '') pour qu'aucune donnée abîmée ne
     s'installe dans la base. */
  ctl.setAnnotationCategory = async (ann, key) => {
    const val = NC.categoryMeta(key) ? key : '';
    const target = annCache.find((a) => a.id === ann.id);
    if (target) target.category = val;
    try { await NC.db.putAnnotation(Object.assign({}, ann, { category: val })); } catch (e) { console.error(e); }
    return val;
  };

  ctl.removeHighlight = async (ann) => {
    annCache = annCache.filter((a) => a.id !== ann.id);
    const views = [];
    try { ctl._rendition.views().forEach((v) => views.push(v)); } catch (e) {}
    views.forEach((v) => {
      const svg = v.__ncOverlay;
      if (!svg) return;
      svg.querySelectorAll('g[data-nc-ann="' + CSS.escape(ann.id) + '"]').forEach((g) => g.remove());
    });
    await NC.db.deleteAnnotation(ann.id);
  };

  ctl.restoreHighlights = async () => {
    annCache = await NC.db.annotationsFor(rec.id);
    redrawAll();
    return annCache;
  };

  ctl.gotoCfi = (cfi) => ctl._rendition.display(cfi).catch(() => {});

  /* ── Signets (n°8) ──
     Instantané de la position courante : CFI (saut exact), index de
     section et page affichée (test « un signet est-il ici ? », repli
     de saut), pourcentage (tri de la liste, borné au CAS OÙ epub.js
     rend une valeur incohérente) et libellé lisible (chapitre · page)
     figé à la pose. Retourne null tant qu'aucune position n'est connue. */
  ctl.captureBookmark = () => {
    const loc = ctl.location;
    if (!loc || !loc.start) return null;
    let sectionIndex = null;
    try {
      const sec = book.spine.get(loc.start.cfi);
      if (sec) sectionIndex = sec.index;
    } catch (e) {}
    let label = ctl.chapterLabel();
    if (!label && sectionIndex != null) label = 'Section ' + (sectionIndex + 1);
    /* Page affichée de la section : repère STABLE pour le test « ici »
       (le pourcentage d'epub.js peut varier d'un relocaté à l'autre au
       même endroit). En défilement vertical, « page N » n'a pas de sens
       (même règle que l'affichage de position). */
    let pageInSec = null;
    if (ctl.flow !== 'scrolled' && loc.start.displayed && loc.start.displayed.page) {
      pageInSec = loc.start.displayed.page;
      label += (label ? ' · ' : '') + 'page ' + pageInSec;
    }
    return {
      cfi: loc.start.cfi,
      sectionIndex,
      pageInSec,
      pct: Math.max(0, Math.round(ctl.percent() * 1000) / 1000),
      label: label || 'Passage',
    };
  };

  /* Retourne à un signet : le CFI d'abord (position exacte), sinon la
     section enregistrée — même stratégie que « Aller au passage ». */
  ctl.gotoBookmark = async (bm) => {
    if (!ctl._rendition || !bm) return;
    if (bm.cfi) { try { await ctl._rendition.display(bm.cfi); return; } catch (e) {} }
    if (typeof bm.sectionIndex === 'number') {
      const sec = book.spine.spineItems[bm.sectionIndex];
      if (sec && sec.href) { try { await ctl._rendition.display(sec.href); return; } catch (e) {} }
    }
  };

  /* « Aller au passage » : le CFI suffit à retrouver la bonne section
     même quand ses pas terminaux sont imparfaits ; sinon, la section. */
  ctl.gotoAnnotation = async (ann) => {
    if (!ctl._rendition) return;
    if (ann && ann.cfi) {
      try { await ctl._rendition.display(ann.cfi); return; } catch (e) {}
    }
    if (ann && typeof ann.sectionIndex === 'number') {
      try {
        const sec = book.spine.spineItems[ann.sectionIndex];
        if (sec && sec.href) { await ctl._rendition.display(sec.href); return; }
      } catch (e) {}
    }
  };

  /* ── Recherche plein texte ── */
  ctl.search = async function (query, onProgress) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    const items = book.spine.spineItems || [];
    const labels = {};
    flatToc().forEach((t) => { const k = String(t.href || '').split('/').pop().toLowerCase(); if (k && !labels[k]) labels[k] = t.label; });

    // Ne pas décharger la section actuellement affichée
    let currentSection = null;
    try { currentSection = ctl.location ? book.spine.get(ctl.location.start.cfi) : null; } catch (e) {}

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let doc;
      try {
        await item.load(book.load.bind(book));
        doc = item.document;
      } catch (e) { continue; }
      try {
        const root = doc.body || doc.documentElement;
        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let node;
        while ((node = walker.nextNode()) && results.length < 80) {
          const text = node.nodeValue || '';
          const hay = text.toLowerCase();
          let idx = hay.indexOf(q);
          while (idx !== -1 && results.length < 80) {
            let cfi = null;
            try {
              const range = doc.createRange();
              range.setStart(node, idx);
              range.setEnd(node, idx + q.length);
              cfi = item.cfiFromRange(range);
            } catch (e) {}
            if (!cfi) { try { cfi = item.cfiFromElement(node.parentElement); } catch (e) {} }
            const start = Math.max(0, idx - 42);
            const snippet = text.slice(start, idx + q.length + 46).replace(/\s+/g, ' ').trim();
            const fileKey = String(item.href || '').split('/').pop().toLowerCase();
            /* Sans CFI exploitable, la section reste atteignable par son
               href (V2.26) : le clic va au chapitre au lieu de ne rien
               faire — display() d'un CFI nul était rejeté en silence. */
            results.push({ cfi, snippet, chapter: labels[fileKey] || '', target: cfi || item.href });
            idx = hay.indexOf(q, idx + q.length);
          }
          if (results.length >= 80) break;
        }
      } finally {
        if (item !== currentSection) { try { item.unload(); } catch (e) {} }
      }
      if (onProgress) onProgress(i + 1, items.length);
      if (i % 4 === 3) await NC.tick();
      if (results.length >= 80) break;
    }
    return results;
  };

  /* ── Capture de la page visible (PNG téléchargé) ──
     Principe : la page affichée vit dans une iframe dont le corps est
     mis en colonnes qui DÉBORDENT (epub.js pagine en défilant le
     conteneur). html2canvas reclonne le document dans sa propre iframe
     de rendu ; sans réglage, l'overflow du corps CLIPPE ces colonnes et
     la capture ne montre que la première colonne (page quasi vide).
     D'où :
       1. chaque iframe affichée est capturée séparément (vue double =
          deux iframes) avec un recadrage sur la zone RÉELLEMENT visible
          (conteneur ∩ iframe) ;
       2. onclone force overflow:visible dans le clone pour laisser
          peindre les colonnes paginées ;
       3. les pages sont recomposées à leur place exacte dans le cadre,
          puis les soulignages (calques SVG hors iframe) par-dessus. */
  ctl.capture = async function () {
    const views = [];
    try {
      ctl._rendition.views().forEach((v) => {
        if (v && v.iframe && v.contents && v.contents.document && v.contents.document.body) views.push(v);
      });
    } catch (e) {}
    if (!views.length) throw new Error('aucune page affichée');

    const container = host.querySelector('.epub-container') || host;
    const cRect = container.getBoundingClientRect();
    const themeBg = (NC.BOOK_THEMES[ctl.theme] || NC.BOOK_THEMES.paper).bg;
    const scale = Math.min(2, window.devicePixelRatio || 1);

    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cRect.width * scale));
    out.height = Math.max(1, Math.round(cRect.height * scale));
    const ctx = out.getContext('2d');
    ctx.fillStyle = themeBg;
    ctx.fillRect(0, 0, out.width, out.height);

    let painted = 0;
    for (const view of views) {
      const frame = view.iframe;
      const doc = view.contents.document;
      const body = doc.body;
      const fRect = frame.getBoundingClientRect();

      /* zone visible de CETTE iframe, dans ses coordonnées document */
      const visX = Math.max(0, cRect.left - fRect.left);
      const visY = Math.max(0, cRect.top - fRect.top);
      const visW = Math.min(fRect.width - visX, cRect.width);
      const visH = Math.min(fRect.height - visY, cRect.height);
      if (visW < 10 || visH < 10) continue;

      const bodyRect = body.getBoundingClientRect();
      const sx = (view.contents.window && view.contents.window.pageXOffset) || 0;
      const sy = (view.contents.window && view.contents.window.pageYOffset) || 0;

      let page = null;
      try {
        page = await html2canvas(body, {
          backgroundColor: null, // le fond du cadre est peint sous la page
          scale,
          useCORS: true,
          logging: false,
          imageTimeout: 8000,
          /* mêmes conditions de mise en page que l'iframe du livre */
          windowWidth: Math.max(1, body.offsetWidth),
          windowHeight: Math.max(1, body.offsetHeight),
          x: sx + visX - bodyRect.left,
          y: sy + visY - bodyRect.top,
          width: Math.ceil(visW),
          height: Math.ceil(visH),
          onclone: (d) => {
            /* sans ceci, les colonnes paginées (au-delà de la première
               page du corps) sont clippées par overflow:hidden/auto du
               clone → capture vide ; la page affichée vit dans ce
               débordement, il faut le laisser peindre. */
            try {
              d.body.style.setProperty('overflow', 'visible', 'important');
              d.documentElement.style.setProperty('overflow', 'visible', 'important');
            } catch (e) {}
          },
        });
      } catch (e) { console.error('capture vue', e); continue; }
      if (!page || !page.width || !page.height) continue;

      const dx = Math.round((fRect.left - cRect.left + visX) * scale);
      const dy = Math.round((fRect.top - cRect.top + visY) * scale);
      ctx.drawImage(page, dx, dy);
      painted++;
    }
    if (!painted) throw new Error('capture vide');

    const withMarks = await compositeHighlights(out, cRect, scale);
    const blob = await new Promise((res) => withMarks.toBlob(res, 'image/png'));
    if (!blob || blob.size < 2000) throw new Error('capture vide');
    return blob;
  };

  /* Recompose les soulignages (calques SVG hors iframe) sur la capture,
     à leur place exacte, découpés sur la zone visible (le calque couvre
     toute la section : ne jamais le rasteriser en entier). */
  async function compositeHighlights(canvas, cRect, scale) {
    const panes = Array.from(host.querySelectorAll('.epub-view > svg'))
      .filter((svg) => svg.getBoundingClientRect().width > 0 && svg.querySelector('g[data-nc-ann]'));
    if (!panes.length) return canvas;

    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(canvas, 0, 0);

    for (const pane of panes) {
      const pr = pane.getBoundingClientRect();
      if (!pr.width || !pr.height) continue;
      const vx = Math.max(0, cRect.left - pr.left);
      const vy = Math.max(0, cRect.top - pr.top);
      const vw = Math.min(pr.width - vx, cRect.width);
      const vh = Math.min(pr.height - vy, cRect.height);
      if (vw < 2 || vh < 2) continue;
      try {
        const clone = pane.cloneNode(true);
        clone.setAttribute('xmlns', SVG_NS);
        clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
        clone.setAttribute('width', String(Math.round(vw * scale)));
        clone.setAttribute('height', String(Math.round(vh * scale)));
        clone.setAttribute('preserveAspectRatio', 'none');
        const xml = new XMLSerializer().serializeToString(clone);
        const img = await svgToImage(xml);
        const dx = (pr.left + vx - cRect.left) * scale;
        const dy = (pr.top + vy - cRect.top) * scale;
        /* source-over, comme à l'écran : le calque a déjà son
           fill-opacity ; « multiply » écraserait les surlignages sur
           fond sombre (mode nuit) — invisible. */
        ctx.drawImage(img, Math.round(dx), Math.round(dy));
      } catch (e) { console.error('recomposition soulignages', e); }
    }
    return out;
  }

  function svgToImage(xml) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('svg illisible'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    });
  }

  ctl.captureName = () => {
    const loc = ctl.location;
    let what = 'page';
    try {
      const sec = book.spine.get(loc.start.cfi);
      if (sec && sec.index) what = 'ch' + sec.index;
    } catch (e) {}
    return `nuit-calme-${NC.slug(rec.title)}-${what}.png`;
  };

  /* ── Redimensionnement : epub.js refait la mise en page, on
     réaffiche ensuite l'endroit exact où l'on se trouvait, puis on
     replace les soulignements. ── */
  ctl.resize = () => {
    if (!ctl._rendition || ctl._destroyed) return;
    const loc = ctl.location;
    try { ctl._rendition.resize(); } catch (e) {}
    if (loc && loc.start) {
      setTimeout(() => {
        if (!ctl._destroyed) {
          ctl._rendition.display(loc.start.cfi).catch(() => {});
          setTimeout(() => { try { redrawAll(); } catch (e) {} }, 420);
        }
      }, 80);
    } else {
      setTimeout(() => { try { redrawAll(); } catch (e) {} }, 260);
    }
  };

  /* ── Ouverture ── */
  await createRendition(ctl.lastCfi || undefined);
  await ctl.restoreHighlights();
  await ctl.loadToc();

  ctl.destroy = () => {
    ctl._destroyed = true;
    /* Les minuteries de re-redessin ne doivent plus viser une rendition
       détruite (fenêtre de 900 ms après un changement de police). */
    clearTimeout(ctl._fsTimer);
    clearTimeout(ctl._fsTimer2);
    clearTimeout(ctl._typoTimer);
    clearTimeout(ctl._typoTimer2);
    clearTimeout(ctl._fsPrefsTimer);
    /* rendition.destroy() démonte le manager et RETIRE ses écouteurs
       globaux (« resize » de la fenêtre) : sans lui, chaque cycle
       ouverture/fermeture laissait un écouteur fantôme derrière lui
       (fuite lente — relevée par l'audit V2.8.1). */
    if (ctl._rendition) { try { ctl._rendition.destroy(); } catch (e) {} }
    try { book.destroy(); } catch (e) {}
    host.innerHTML = '';
  };

  return ctl;
};
