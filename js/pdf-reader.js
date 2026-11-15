/* NUIT CALME — lecteur PDF (pdf.js) :
   simple/double page, zoom ajusté (page/largeur/hauteur) et pan (n°6),
   sommaire, recherche, reprise, capture,
   couche texte (sélection + copie, n°4). */
'use strict';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

NC.openPdf = async function (rec, opts) {
  const stage = NC.$('#pdf-stage');
  const doc = await pdfjsLib.getDocument({ data: rec.data.slice(0) }).promise;
  /* Surlignages (n°5) : cache des annotations du livre, chargé une
     fois par ouverture — même magasin « annotations » que l'EPUB. */
  const annCache = await NC.db.annotationsFor(rec.id).catch(() => []);

  const ctl = {
    type: 'pdf',
    rec,
    doc,
    /* Serré au nombre de pages réel (V2.26) : une progression parasite
       (fiche ancienne, restauration partielle) au-delà de la dernière
       page rendait le livre inouvrable — render() ne dessinait rien et
       l'ouverture échouait, à chaque essai, sans jamais se réparer. */
    page: Math.max(1, Math.min(doc.numPages, opts.lastPage || 1)),
    zoom: opts.zoom || 1,
    /* Ajustement (n°6) : « page » (tout visible, comportement historique),
       « largeur » ou « hauteur » — la page peut alors dépasser le cadre
       et se déplace à la main (pan). Le zoom reste un multiplicateur du
       base du mode courant : 100 % = ajusté. */
    fit: (opts.fit === 'width' || opts.fit === 'height' || opts.fit === 'page') ? opts.fit : 'page',
    spread: opts.spread, // 'always' | 'none'
    theme: NC.BOOK_THEMES[opts.theme] ? opts.theme : 'paper',
    outline: [],
    _tasks: [],
    _onRelocated: null,
    _pendingSel: null, // { text } — passage sélectionné dans la couche texte
  };

  const isDouble = () => ctl.spread === 'always';
  const pageStep = () => (isDouble() ? 2 : 1);

  /* ── Couche texte (n°4) ──
     Un calque de spans transparents est superposé à chaque canvas : la
     sélection et la copie deviennent possibles, et ce calque servira
     d'ancrage au futur surlignage PDF (n°5). Il est reconstruit à chaque
     rendu (zoom, double page, navigation) — exactement à l'échelle du
     canvas, donc toujours aligné. Le contenu texte de chaque page est
     mis en cache : les re-rendus (zoom, redimensionnement) ne
     redemanderont rien au worker. */
  const textCache = new Map(); // page → getTextContent() de la page
  ctl._tlTasks = [];           // tâches de couche texte en vol (annulables)

  async function buildTextLayer(page, pnum, layer, scale, gen) {
    let tc = textCache.get(pnum);
    if (!tc) {
      tc = await page.getTextContent();
      if (gen !== renderGen) return; // rendu obsolète entre-temps
      textCache.set(pnum, tc);
    }
    /* pdf.js 3.11 dimensionne le calque via --scale-factor (calc sur les
       dimensions papier de la page) : la valeur DOIT précéder le rendu. */
    layer.style.setProperty('--scale-factor', String(scale));
    const tlTask = pdfjsLib.renderTextLayer({
      textContentSource: tc,
      container: layer,
      /* Échelle CSS, SANS devicePixelRatio : le calque vit dans les
         mêmes pixels que le style du canvas (le canvas lui-même est
         rendu plus fin pour la netteté écran). */
      viewport: page.getViewport({ scale }),
    });
    ctl._tlTasks.push(tlTask);
    try { await tlTask.promise; } catch (e) { /* annulé */ }
    if (gen !== renderGen) return;
    /* Marqueur de fin (comme le viewer officiel) : placé SOUS la dernière
       ligne, il permet à une sélection qui démarre dans le texte de
       s'étendre jusqu'au bas de la page (fin de page incluse). */
    const eoc = document.createElement('div');
    eoc.className = 'endOfContent';
    layer.appendChild(eoc);
  }

  /* ── Rendu ──
     Jeton de génération : deux rendus rapprochés (zoom, redimensionnement,
     navigation) ne doivent jamais se mélanger. Un rendu devenu obsolète
     s'arrête net et ne touche NI l'affichage, NI la progression sauvegardée. */
  let renderGen = 0;
  /* Position de lecture (fractions du défilement) à restaurer après le
     re-rendu : zoomer ne doit ni sauter au début, ni sauter à la fin. */
  let scrollKeep = null;
  function keepScroll() {
    const sw = stage.scrollWidth - stage.clientWidth;
    const sh = stage.scrollHeight - stage.clientHeight;
    scrollKeep = {
      x: sw > 0 ? stage.scrollLeft / sw : 0,
      y: sh > 0 ? stage.scrollTop / sh : 0,
    };
  }

  async function render() {
    const gen = ++renderGen;
    ctl._tasks.forEach((t) => { try { t.cancel(); } catch (e) {} });
    ctl._tasks = [];
    ctl._tlTasks.forEach((t) => { try { t.cancel(); } catch (e) {} });
    ctl._tlTasks = [];
    stage.innerHTML = ''; // efface aussi les couches texte de la génération précédente
    /* Les pages vivent dans une enveloppe à la taille de leur contenu,
       centrée par marges auto : quand elle dépasse le cadre, le stage
       défile (pan n°6) SANS couper le début des pages — le piège
       classique du centrage flex dans un conteneur défilant. */
    const lanes = document.createElement('div');
    lanes.className = 'nc-pdf-pages';
    stage.appendChild(lanes);

    const frame = NC.$('#book-frame');
    const availW = frame.clientWidth - 68;
    const availH = frame.clientHeight - 52;
    const pages = isDouble()
      ? [ctl.page, ctl.page + 1].filter((p) => p >= 1 && p <= doc.numPages)
      : [ctl.page];
    /* Filet (V2.26) : jamais un rendu sans page — on repart de la 1re
       plutôt que de laisser getPage(undefined) faire échouer le livre. */
    if (!pages.length) { ctl.page = 1; pages.push(1); }

    const first = await doc.getPage(pages[0]);
    if (gen !== renderGen) return; // rendu obsolète : on n'affiche rien
    const vp1 = first.getViewport({ scale: 1 });
    const perW = isDouble() ? (availW - 22) / pages.length : availW;
    /* Échelle de base selon le mode d'ajustement (n°6) : « page » garde
       tout visible, « largeur » et « hauteur » remplissent une dimension
       quitte à déborder sur l'autre. ctl.zoom multiplie cette base. */
    let base;
    if (ctl.fit === 'width') base = perW / vp1.width;
    else if (ctl.fit === 'height') base = availH / vp1.height;
    else base = Math.min(perW / vp1.width, availH / vp1.height);
    const scale = base * ctl.zoom;

    for (const pnum of pages) {
      const page = await doc.getPage(pnum);
      if (gen !== renderGen) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale: scale * dpr });
      const vpCss = page.getViewport({ scale }); // dimensions PROPRES à chaque page
      /* Chaque page vit dans un enveloppeur positionné : le canvas ET la
         couche texte partagent exactement le même rectangle — les thèmes
         (filtres nuit/sépia) s'appliquent à l'enveloppeur entier, donc
         la sélection reste cohérente avec la page affichée. */
      const wrap = document.createElement('div');
      wrap.className = 'nc-pdf-page';
      wrap.dataset.page = pnum; // repère utilisé par le surlignage (n°5) et la capture
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = Math.floor(vpCss.width) + 'px';
      canvas.style.height = Math.floor(vpCss.height) + 'px';
      canvas.setAttribute('data-page', pnum);
      wrap.appendChild(canvas);
      const layer = document.createElement('div');
      layer.className = 'nc-text-layer';
      layer.dataset.page = pnum;
      wrap.appendChild(layer);
      lanes.appendChild(wrap);
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      ctl._tasks.push(task);
      /* Le texte s'obtient en parallèle du dessin : la couche est prête
         dès que la page l'est, sans temps d'attente perceptible. */
      const tlPromise = buildTextLayer(page, pnum, layer, scale, gen);
      try { await task.promise; } catch (e) { /* annulé */ }
      if (gen !== renderGen) return;
      await tlPromise;
      if (gen !== renderGen) return;
      /* Surlignages (n°5) : voile posé dès que la page est prête. */
      drawAnnotationsFor(pnum, wrap);
    }

    /* Pan (n°6) : l'enveloppe peut dépasser le cadre — on met à jour
       l'état « déplaçable » (curseur main) et on restaure la position de
       lecture gardée par keepScroll() avant un re-rendu de zoom. */
    if (scrollKeep) {
      const k = scrollKeep;
      scrollKeep = null;
      const sw = stage.scrollWidth - stage.clientWidth;
      const sh = stage.scrollHeight - stage.clientHeight;
      stage.scrollLeft = Math.max(0, Math.round(k.x * sw));
      stage.scrollTop = Math.max(0, Math.round(k.y * sh));
    }
    stage.classList.toggle('pannable',
      stage.scrollWidth > stage.clientWidth + 1 || stage.scrollHeight > stage.clientHeight + 1);

    const end = pages[pages.length - 1];
    /* Progression légère (magasin « progress », comme pour l'EPUB) :
       réécrire le livre ENTIER à chaque tourne-page coûtait jusqu'à ~0,6 s
       sur un gros PDF (fichier de 80 Mo mesuré) et martelait le stockage
       du navigateur. Désormais : quelques octets par page. */
    NC.db.putProgress({
      id: rec.id,
      lastPage: ctl.page,
      zoom: ctl.zoom,
      fit: ctl.fit,
      pct: ctl.percent(),
      lastOpened: Date.now(),
    }).catch(() => {});
    if (ctl._onRelocated) ctl._onRelocated({ page: ctl.page, end, numPages: doc.numPages });
  }

  ctl.redisplay = () => render();

  /* Tourne-page au bord de la page, comme pour l'EPUB.
     Les canvas sont dans le DOM parent : les clics remontent normalement.
     On stoppe la propagation, sinon #book-frame (parent) tournerait
     AUSSI la page → double saut.
     Les zones se calculent sur l'aire RÉELLE du papier (union des canvas),
     pas sur toute la largeur du cadre : les marges sombres autour des
     pages tournent aussi la page, comme le bord d'un vrai livre.
     Le handler est remplacé à chaque ouverture : jamais d'accumulation
     de listeners référençant d'anciens contrôleurs détruits. */
  if (stage.__ncEdgeHandler) stage.removeEventListener('click', stage.__ncEdgeHandler);
  stage.__ncEdgeHandler = (ev) => {
    ev.stopPropagation();
    /* Un glissement de pan qui finit par un relâchement n'est PAS un
       tourne-page (le drapeau est posé par endPan, consommé ici). */
    if (stage.__ncPanned) { stage.__ncPanned = false; return; }
    if (ev.defaultPrevented || ev.button !== 0) return;
    if (ev.target.closest && ev.target.closest('button, a, input, select, textarea')) return;
    /* Un clic dans le TEXTE ne tourne plus la page : on y sélectionne,
       on y place le curseur, on y double-clique un mot. Le tourne-page
       reste aux bords sombres, aux flèches latérales et au clavier. */
    if (ev.target.closest && ev.target.closest('.nc-text-layer')) return;
    const boxes = Array.from(stage.querySelectorAll('canvas'))
      .map((c) => c.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height > 0);
    let left, right;
    if (boxes.length) {
      left = Math.min(...boxes.map((b) => b.left));
      right = Math.max(...boxes.map((b) => b.right));
    } else {
      const r = stage.getBoundingClientRect();
      left = r.left; right = r.right;
    }
    const edge = Math.max(70, (right - left) * 0.12);
    if (ev.clientX < left + edge) ctl.prev();
    else if (ev.clientX > right - edge) ctl.next();
  };
  stage.addEventListener('click', stage.__ncEdgeHandler);

  /* ── Pan et zoom molette (n°6) ─────────────────────────────────────
     Quand la page dépasse le cadre (ajustement largeur/hauteur, ou
     zoom avant), la souris la fait glisser — comme une feuille sous la
     main. La sélection de texte reste prioritaire : un appui qui commence
     dans la couche texte ne panne pas. Le tactile, lui, défile
     nativement (overflow:auto) — le pan souris ne s'en mêle pas.
     Handlers remplacés à chaque ouverture (jamais d'accumulation). */
  if (stage.__ncNavHandlers) {
    stage.removeEventListener('pointerdown', stage.__ncNavHandlers.down);
    stage.removeEventListener('pointermove', stage.__ncNavHandlers.move);
    stage.removeEventListener('pointerup', stage.__ncNavHandlers.up);
    stage.removeEventListener('pointercancel', stage.__ncNavHandlers.cancel);
    stage.removeEventListener('wheel', stage.__ncNavHandlers.wheel);
  }
  let pan = null;          // glissement en cours
  let wheelZoom = null;    // zoom cible accumulé pendant un geste molette
  let wheelTimer = null;
  const navHandlers = {
    down: (ev) => {
      stage.__ncPanned = false; // chaque geste repart d'un clic net
      if (ev.button !== 0 || ev.pointerType !== 'mouse') return;
      if (!stage.classList.contains('pannable')) return;
      /* Seul le TEXTE (les spans) garde la priorité de la sélection :
         le calque lui-même et les zones vides entre les lignes panent. */
      if (ev.target.closest && ev.target.closest('.nc-text-layer span')) return;
      pan = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, sl: stage.scrollLeft, st: stage.scrollTop, moved: false };
    },
    move: (ev) => {
      if (!pan || ev.pointerId !== pan.id) return;
      const dx = ev.clientX - pan.x;
      const dy = ev.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) > 4) {
        pan.moved = true;
        stage.classList.add('panning');
        try { stage.setPointerCapture(pan.id); } catch (e) {}
      }
      if (pan.moved) {
        stage.scrollLeft = pan.sl - dx;
        stage.scrollTop = pan.st - dy;
      }
    },
    up: (ev) => {
      if (!pan || ev.pointerId !== pan.id) return;
      if (pan.moved) {
        stage.__ncPanned = true; // le clic qui suit sera ignoré
        /* Un pan ne doit jamais laisser traîner une sélection amorcée
           au passage sur du texte — on la retire net. */
        try {
          const s = document.getSelection();
          if (s && !s.isCollapsed) s.removeAllRanges();
        } catch (e) {}
      }
      pan = null;
      stage.classList.remove('panning');
    },
    cancel: () => { pan = null; stage.classList.remove('panning'); },
    /* Ctrl+molette : zoom progressif, recentré sur la position gardée.
       La molette SANS Ctrl reste le défilement naturel d'une page haute. */
    wheel: (ev) => {
      if (!ev.ctrlKey || !ev.deltaY) return;
      ev.preventDefault(); // sinon c'est le zoom du navigateur
      const step = ev.deltaY < 0 ? 0.08 : -0.08;
      wheelZoom = Math.max(0.6, Math.min(2.2, (wheelZoom === null ? ctl.zoom : wheelZoom) + step));
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(async () => {
        const target = wheelZoom;
        wheelZoom = null;
        wheelTimer = null;
        if (target === null || Math.abs(target - ctl.zoom) < 0.01) return;
        try { await ctl.setZoom(target); } catch (e) { console.error(e); }
      }, 140);
    },
  };
  stage.__ncNavHandlers = navHandlers;
  stage.addEventListener('pointerdown', navHandlers.down);
  stage.addEventListener('pointermove', navHandlers.move);
  stage.addEventListener('pointerup', navHandlers.up);
  stage.addEventListener('pointercancel', navHandlers.cancel);
  stage.addEventListener('wheel', navHandlers.wheel, { passive: false });

  /* ── Sélection et copie (n°4) ──────────────────────────────────────
     Les spans de la couche texte sont des éléments ABSOLUMENT positionnés :
     copier tel quel donnerait un ordre et des espaces aléatoires. On
     reconstruit donc le texte à partir des spans sélectionnés, dans l'ordre
     du DOM (= ordre de lecture pdf.js), en recollant les lignes selon la
     géométrie : même ligne → espace si l'écart entre deux morceaux dépasse
     la largeur d'une espace ; ligne suivante → retour à la ligne.
     Ce même reconstructeur alimente le menu contextuel (bouton Copier de
     #sel-popup) ET l'événement copy (Ctrl+C, menu du navigateur). */
  function selectionInLayer() {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const node = sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || !el.closest || !el.closest('.nc-text-layer')) return null;
    return sel;
  }

  function collectParts(range) {
    const parts = [];
    stage.querySelectorAll('.nc-text-layer span').forEach((sp) => {
      if (!sp.textContent) return;
      if (!range.intersectsNode(sp)) return;
      let s = 0, e = sp.textContent.length;
      if (range.startContainer && range.startContainer.parentNode === sp) {
        s = Math.max(0, Math.min(sp.textContent.length, range.startOffset));
      }
      if (range.endContainer && range.endContainer.parentNode === sp) {
        e = Math.max(s, Math.min(sp.textContent.length, range.endOffset));
      }
      const t = sp.textContent.slice(s, e);
      if (t) parts.push({ t, el: sp, s, e });
    });
    return parts;
  }

  function joinParts(parts) {
    if (!parts.length) return '';
    let out = '';
    let prevRect = null;
    for (const p of parts) {
      const r = p.el.getBoundingClientRect();
      if (prevRect) {
        const overlap = Math.min(prevRect.bottom, r.bottom) - Math.max(prevRect.top, r.top);
        const minH = Math.min(prevRect.height, r.height);
        if (minH > 0 && overlap < minH * 0.5) out += '\n';
        else if (r.left - prevRect.right > Math.max(1.5, minH * 0.22)) out += ' ';
      }
      out += p.t;
      prevRect = r;
    }
    return out;
  }

  function cleanSelectionText(sel) {
    try {
      const out = joinParts(collectParts(sel.getRangeAt(0)));
      return out || String(sel).trim();
    } catch (err) {
      return String(sel).trim();
    }
  }

  /* ── Surlignage PDF (n°5) : découpe de la sélection PAR PAGE ──
     Chaque part porte la page, les rectangles de la sélection (en
     FRACTIONS de la page, 0..1 — indépendants du zoom et de la mise
     en page) et son texte reconstruit. La vue double donne deux
     pages côte à côte : une sélection qui les chevauche produit
     deux parts, donc deux surlignages reliés au bon endroit.
     Les rectangles viennent des MORCEAUX DE SPANS (jamais de la
     plage entière) : Range.getClientRects() ajouterait la boîte des
     conteneurs partiellement contenus — une sélection inter-pages
     aurait glissé un rect pleine page dans le voile. */
  function captureSelectionParts(sel) {
    try {
      const range = sel.getRangeAt(0);
      const wraps = Array.from(stage.querySelectorAll('.nc-pdf-page'));
      if (!wraps.length) return null;
      const boxes = wraps.map((w) => ({ w, b: w.getBoundingClientRect() }));
      const byWrap = new Map();
      const seen = new Set();
      /* Rectangles par MORCEAU DE SPAN : caractère-exact, jamais la
         boîte d'un conteneur (une sélection inter-pages aurait sinon
         glissé un rect pleine page dans le voile). Dédoublonnage sur
         les pixels entiers : les spans adjacents se recouvrent d'un
         poil, inutile de peindre deux fois la même ligne. */
      const parts = collectParts(range);
      for (const p of parts) {
        if (!p.el.firstChild) continue;
        const rr = document.createRange();
        try { rr.setStart(p.el.firstChild, p.s); rr.setEnd(p.el.firstChild, p.e); }
        catch (e) { continue; }
        for (const r of rr.getClientRects()) {
          if (r.width < 0.5 || r.height < 0.5) continue;
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const hit = boxes.find(({ b }) =>
            cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom);
          if (!hit) continue;
          const key = hit.w.dataset.page + '|' + Math.round(r.left) + '|' + Math.round(r.top)
            + '|' + Math.round(r.width) + '|' + Math.round(r.height);
          if (seen.has(key)) continue;
          seen.add(key);
          if (!byWrap.has(hit.w)) {
            byWrap.set(hit.w, { page: Number(hit.w.dataset.page || 0), rects: [] });
          }
          const fr = (v, base, size) => Math.round(Math.max(0, Math.min(1, (v - base) / size)) * 10000) / 10000;
          byWrap.get(hit.w).rects.push({
            l: fr(r.left, hit.b.left, hit.b.width),
            t: fr(r.top, hit.b.top, hit.b.height),
            w: Math.round(Math.max(0, Math.min(1, r.width / hit.b.width)) * 10000) / 10000,
            h: Math.round(Math.max(0, Math.min(1, r.height / hit.b.height)) * 10000) / 10000,
          });
        }
      }
      if (!byWrap.size) return null;
      /* Texte par page : mêmes morceaux que la copie, regroupés par page. */
      const out = [];
      byWrap.forEach((entry, wrap) => {
        out.push({
          page: entry.page,
          rects: entry.rects,
          text: joinParts(parts.filter((p) => p.el.closest('.nc-pdf-page') === wrap)).trim(),
        });
      });
      out.sort((a, b) => a.page - b.page);
      return out;
    } catch (err) {
      return null;
    }
  }

  function showSelPopup(sel) {
    const text = cleanSelectionText(sel);
    if (!text.trim()) { ctl.hideSelPopup(); return; }
    /* Surlignage (n°5) : les parts sont figées ICI. Un clic sur une
       pastille effondre la sélection (elle vit dans le document
       principal) — impossible de la relire au moment du clic. */
    ctl._pendingSel = { text, parts: captureSelectionParts(sel) };
    let x = window.innerWidth / 2, y = 140;
    try {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect) { x = rect.left + rect.width / 2; y = rect.top; }
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
    try { document.getSelection().removeAllRanges(); } catch (e) {}
  };

  /* Handlers remplacés à chaque ouverture (même mécanique que le
     tourne-page de bord) : jamais d'accumulation référençant un ancien
     contrôleur détruit. */
  const detachSelHandlers = () => {
    if (!stage.__ncSelHandlers) return;
    stage.removeEventListener('mousedown', stage.__ncSelHandlers.down);
    document.removeEventListener('mouseup', stage.__ncSelHandlers.up);
    document.removeEventListener('copy', stage.__ncSelHandlers.copy);
    stage.__ncSelHandlers = null;
  };
  detachSelHandlers();
  const selHandlers = {
    down: (ev) => {
      if (!ev.target.closest || !ev.target.closest('.nc-text-layer')) return;
      /* Une nouvelle sélection commence : le popup précédent s'efface. */
      NC.$('#sel-popup').hidden = true;
      ctl._pendingSel = null;
      /* Le marqueur de fin s'active pendant la sélection (comme le
         viewer officiel) : sélectionner depuis le texte jusqu'au bas de
         la page attrape bien la fin de page. */
      stage.querySelectorAll('.nc-text-layer .endOfContent')
        .forEach((eoc) => eoc.classList.add('active'));
    },
    up: (ev) => {
      stage.querySelectorAll('.nc-text-layer .endOfContent.active')
        .forEach((eoc) => eoc.classList.remove('active'));
      /* Un pan qui vient de finir n'est pas une sélection (même si le
         glissement a effleuré des spans) : le popup ne doit pas surgir. */
      if (stage.__ncPanned) return;
      const sel = selectionInLayer();
      if (sel) showSelPopup(sel);
      /* Sélection effondrée (clic simple, clic sur un bouton du popup…) :
         on ne referme pas tant que le relâchement vise le popup — la
         sélection vit dans le document principal, un mousedown sur
         « Copier » l'effondre AVANT le clic, et le bouton a encore
         besoin de _pendingSel. */
      else if (
        ctl._pendingSel &&
        !(ev.target && ev.target.closest && ev.target.closest('#sel-popup'))
      ) ctl.hideSelPopup();
    },
    copy: (ev) => {
      if (!ev.clipboardData) return; // événement synthétique sans presse-papiers
      if (!selectionInLayer()) return;
      const txt = cleanSelectionText(document.getSelection());
      if (!txt) return;
      ev.clipboardData.setData('text/plain', txt);
      ev.preventDefault();
    },
  };
  stage.__ncSelHandlers = selHandlers;
  stage.addEventListener('mousedown', selHandlers.down);
  /* mouseup et copy sur document : une sélection peut FINIR hors du
     cadre (glissement dans les marges), et Ctrl+C ne passe par aucune
     géométrie du stage. */
  document.addEventListener('mouseup', selHandlers.up);
  document.addEventListener('copy', selHandlers.copy);

  /* ── Surlignages persistants (n°5) ──────────────────────────────
     Même magasin « annotations » que l'EPUB, mais repérés par PAGE
     et par rectangles en fractions de page (0..1) : le voile suit le
     zoom, la vue double et les re-rendus sans aucun recalcul. Dessin
     dans un SVG par page, au-dessus de la couche texte —
     pointer-events:none : la sélection et la copie restent intactes. */
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function highlightLayerFor(wrap) {
    let svg = wrap.querySelector('svg.nc-pdf-hl');
    if (svg) return svg;
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'nc-pdf-hl');
    wrap.appendChild(svg);
    return svg;
  }

  function drawAnnotationsFor(pnum, wrap) {
    const svg = highlightLayerFor(wrap);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    for (const a of annCache) {
      if (a.page !== pnum || !Array.isArray(a.rects)) continue;
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('data-nc-ann', a.id);
      g.setAttribute('fill', NC.highlightHex(a.color));
      g.setAttribute('fill-opacity', '0.35');
      for (const r of a.rects) {
        const rc = document.createElementNS(SVG_NS, 'rect');
        rc.setAttribute('x', (r.l * 100).toFixed(3) + '%');
        rc.setAttribute('y', (r.t * 100).toFixed(3) + '%');
        rc.setAttribute('width', (r.w * 100).toFixed(3) + '%');
        rc.setAttribute('height', (r.h * 100).toFixed(3) + '%');
        g.appendChild(rc);
      }
      if (g.firstChild) svg.appendChild(g);
    }
  }

  /* Souligne la sélection figée du popup (pastilles et bouton
     « Souligner »). Une sélection à cheval sur deux pages crée deux
     annotations, une par page. */
  ctl.addHighlight = async (colorKey) => {
    const parts = ctl._pendingSel && ctl._pendingSel.parts;
    if (!parts || !parts.length) {
      ctl.hideSelPopup();
      NC.toast('Le passage n\'a pas pu être souligné.', 'error', 2200);
      return null;
    }
    const color = NC.highlightKey(colorKey);
    const created = parts.map((part) => ({
      id: crypto.randomUUID(),
      bookId: rec.id,
      type: 'pdf',
      page: part.page,
      color,
      text: String(part.text || '').slice(0, 400),
      rects: part.rects,
      createdAt: Date.now(),
    }));
    annCache.push(...created);
    try { await Promise.all(created.map((a) => NC.db.putAnnotation(a))); } catch (e) { console.error(e); }
    NC.db.putSetting('lastHighlightColor', color).catch(() => {});
    stage.querySelectorAll('.nc-pdf-page').forEach((wrap) => {
      if (created.some((a) => a.page === Number(wrap.dataset.page || 0))) {
        drawAnnotationsFor(Number(wrap.dataset.page || 0), wrap);
      }
    });
    ctl.hideSelPopup();
    const lbl = NC.HIGHLIGHT_COLORS[color].label.toLowerCase();
    NC.toast(created.length > 1
      ? 'Passage souligné en ' + lbl + ', sur les deux pages.'
      : 'Passage souligné en ' + lbl + '.', 'success', 2000);
    return color;
  };

  ctl.removeHighlight = async (ann) => {
    const i = annCache.findIndex((a) => a.id === ann.id);
    if (i >= 0) annCache.splice(i, 1);
    stage.querySelectorAll('.nc-pdf-page').forEach((wrap) => {
      if (Number(wrap.dataset.page || 0) !== ann.page) return;
      const svg = wrap.querySelector('svg.nc-pdf-hl');
      if (!svg) return;
      svg.querySelectorAll('g[data-nc-ann="' + CSS.escape(ann.id) + '"]').forEach((g) => g.remove());
    });
    await NC.db.deleteAnnotation(ann.id);
  };

  /* Recolore un surlignage existant (tiroir) : cache, base et <g> SVG
     déjà dessinés — sans re-rendu de la page. */
  ctl.recolorHighlight = async (ann, colorKey) => {
    const key = NC.highlightKey(colorKey);
    const target = annCache.find((a) => a.id === ann.id);
    if (target) target.color = key;
    try { await NC.db.putAnnotation(Object.assign({}, ann, { color: key })); } catch (e) { console.error(e); }
    const hex = NC.highlightHex(key);
    stage.querySelectorAll('.nc-pdf-page').forEach((wrap) => {
      if (Number(wrap.dataset.page || 0) !== ann.page) return;
      const svg = wrap.querySelector('svg.nc-pdf-hl');
      if (!svg) return;
      svg.querySelectorAll('g[data-nc-ann="' + CSS.escape(ann.id) + '"]').forEach((g) => g.setAttribute('fill', hex));
    });
    return key;
  };

  /* Catégorie (ajout n°10) : identique à l'EPUB — ne touche que le
     tiroir, jamais le rendu de la page. */
  ctl.setAnnotationCategory = async (ann, key) => {
    const val = NC.categoryMeta(key) ? key : '';
    const target = annCache.find((a) => a.id === ann.id);
    if (target) target.category = val;
    try { await NC.db.putAnnotation(Object.assign({}, ann, { category: val })); } catch (e) { console.error(e); }
    return val;
  };

  ctl.gotoAnnotation = (ann) => (ann && ann.page) ? ctl.gotoPage(ann.page) : Promise.resolve();

  /* ── Navigation ── */
  ctl.next = async () => {
    const step = pageStep();
    if (ctl.page + step <= doc.numPages) { ctl.page += step; await render(); }
    else if (!isDouble() || ctl.page + 1 <= doc.numPages) { ctl.page = doc.numPages; await render(); }
  };
  ctl.prev = async () => {
    const step = pageStep();
    if (ctl.page - step >= 1) { ctl.page -= step; await render(); }
    else if (ctl.page !== 1) { ctl.page = 1; await render(); }
  };

  ctl.setSpread = async (mode) => {
    ctl.spread = mode;
    await render();
  };

  ctl.setFontSize = null; // non applicable au PDF

  /* Thème du contenu : pour un PDF, le mode nuit est un filtre CSS
     (inversion des pages rendues) — aucun re-rendu nécessaire. */
  ctl.setTheme = (mode) => {
    ctl.theme = NC.BOOK_THEMES[mode] ? mode : 'paper';
    return ctl.theme;
  };

  ctl.setZoom = async (z) => {
    keepScroll(); // zoomer ne doit ni sauter au début, ni sauter à la fin
    ctl.zoom = Math.max(0.6, Math.min(2.2, z));
    await render();
    return ctl.zoom;
  };

  /* Ajustement (n°6) : « page » (tout visible, défaut), « largeur »,
     « hauteur ». Le zoom revient à 100 % — le mode EST l'ajustement,
     +/- et Ctrl+molette le multiplieront ensuite. La position de
     lecture est gardée à travers le re-rendu. */
  ctl.setFit = async (mode) => {
    ctl.fit = (mode === 'width' || mode === 'height') ? mode : 'page';
    ctl.zoom = 1;
    keepScroll();
    await render();
    return ctl.fit;
  };

  /* ── Vignettes de navigation (V2.18) ────────────────────────────
     Miniatures des pages pour le tiroir : chaque cellule demande son
     dessin quand elle approche de la zone visible (IntersectionObserver
     côté tiroir). Le résultat est mis en cache en dataURL JPEG (~quelques
     Ko par page) : rouvrir le tiroir, poser un signet ou changer de
     page ne redessine rien. Une petite file borne les rendus simultanés —
     scroller vite une grille de 500 pages ne doit pas noyer le worker. */
  const THUMB_W = 110;           // largeur CSS visée d'une miniature
  const THUMB_CACHE_MAX = 600;   // pages gardées en vignettes (~2 Mo au pire)
  const THUMB_MAX_PARALLEL = 6;  // rendus simultanés au maximum
  const thumbCache = new Map();  // page → dataURL
  const thumbTasks = new Set();  // rendus en vol (annulables à la fermeture)
  const thumbQueue = [];         // cellules en attente d'un créneau
  let thumbActive = 0;

  function paintThumb(canvas, url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  ctl.renderThumbnail = async (pnum, canvas) => {
    if (thumbActive >= THUMB_MAX_PARALLEL) {
      await new Promise((res) => thumbQueue.push(res));
    }
    thumbActive++;
    try {
      const key = String(pnum);
      const url = thumbCache.get(key);
      if (url) return paintThumb(canvas, url);
      const page = await doc.getPage(pnum);
      if (!canvas.isConnected) return; // tiroir refermé entre-temps : rien à dessiner
      const vp1 = page.getViewport({ scale: 1 });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale: (THUMB_W * dpr) / vp1.width });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      thumbTasks.add(task);
      try { await task.promise; } catch (e) { return; } // annulé
      /* Cache borné : la plus ancienne vignette sort d'abord (FIFO). */
      if (thumbCache.size >= THUMB_CACHE_MAX) {
        thumbCache.delete(thumbCache.keys().next().value);
      }
      try { thumbCache.set(key, canvas.toDataURL('image/jpeg', 0.82)); } catch (e) {}
    } finally {
      thumbActive--;
      const next = thumbQueue.shift();
      if (next) next();
    }
  };

  /* ── Progression ── */
  ctl.percent = () => Math.max(0, Math.min(1, (ctl.page - 0.5) / Math.max(1, doc.numPages)));
  ctl.seekPercent = async (p) => {
    ctl.page = Math.max(1, Math.min(doc.numPages, Math.round(p * (doc.numPages - 1)) + 1));
    await render();
  };
  ctl.saveProgress = () => NC.db.putProgress({
    id: rec.id,
    lastPage: ctl.page,
    zoom: ctl.zoom,
    fit: ctl.fit,
    pct: ctl.percent(),
    lastOpened: Date.now(),
  });
  ctl.chapterLabel = () => '';

  /* ── Signets (n°8) ──
     Instantané de la position courante : le numéro de page EST la
     position (exacte et stable, contrairement au CFI d'un EPUB). */
  ctl.captureBookmark = () => ({
    page: ctl.page,
    pct: Math.round(ctl.percent() * 1000) / 1000,
    label: 'Page ' + ctl.page,
  });

  ctl.gotoBookmark = (bm) => (bm && bm.page) ? ctl.gotoPage(bm.page) : Promise.resolve();

  /* ── Sommaire ── */
  ctl.loadToc = async () => {
    try {
      const outline = await doc.getOutline();
      if (outline && outline.length) {
        ctl.outline = await buildOutline(outline);
        ctl.toc = ctl.outline;
        return ctl.toc;
      }
    } catch (e) {}
    ctl.outline = null; // → grille de pages
    ctl.toc = null;
    return null;
  };

  async function buildOutline(items) {
    const out = [];
    for (const it of items) {
      let page = null;
      try {
        let dest = it.dest;
        if (typeof dest === 'string') dest = await doc.getDestination(dest);
        if (Array.isArray(dest) && dest[0]) page = (await doc.getPageIndex(dest[0])) + 1;
      } catch (e) {}
      const node = { label: it.title || 'Section', page, subitems: [] };
      if (it.items && it.items.length) node.subitems = await buildOutline(it.items);
      out.push(node);
    }
    return out;
  }

  ctl.gotoPage = async (p) => {
    ctl.page = Math.max(1, Math.min(doc.numPages, p));
    await render();
  };

  /* ── Recherche texte ── */
  ctl.search = async function (query, onProgress) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    for (let p = 1; p <= doc.numPages; p++) {
      let text = '';
      try {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        text = tc.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ');
        page.cleanup();
      } catch (e) { continue; }
      const hay = text.toLowerCase();
      let idx = hay.indexOf(q);
      let count = 0;
      while (idx !== -1 && count < 5 && results.length < 80) {
        const start = Math.max(0, idx - 42);
        results.push({
          page: p,
          snippet: text.slice(start, idx + q.length + 46).replace(/^\s+/, ''),
          target: p,
        });
        count++;
        idx = hay.indexOf(q, idx + q.length);
      }
      if (onProgress) onProgress(p, doc.numPages);
      if (p % 8 === 0) await NC.tick();
      if (results.length >= 80) break;
    }
    return results;
  };

  /* ── Capture de la (des) page(s) affichée(s) ──
     Fond identique au cadre du livre (papier ou nuit) et, en mode nuit,
     même filtre que l'écran (sinon la capture montrerait des pages
     blanches pendant que le lecteur affiche des pages sombres). */
  ctl.capture = async function () {
    const canvases = Array.from(stage.querySelectorAll('canvas'));
    if (!canvases.length) throw new Error('aucune page affichée');
    const gap = 22;
    const totalW = canvases.reduce((s, c) => s + c.width, 0) + gap * (canvases.length - 1);
    const totalH = Math.max(...canvases.map((c) => c.height));
    const out = document.createElement('canvas');
    out.width = totalW; out.height = totalH;
    const ctx = out.getContext('2d');
    const meta = NC.BOOK_THEMES[ctl.theme] || NC.BOOK_THEMES.paper;
    const filtersOk = typeof ctx.filter === 'string'; // indéfini sur les vieux navigateurs
    ctx.fillStyle = meta.bg;
    ctx.fillRect(0, 0, totalW, totalH);
    if (meta.dark && filtersOk) {
      /* même filtre que l'écran (style.css) : nuit = inversion chaude,
         OLED = inversion légèrement plus douce pour limiter l'éclat */
      ctx.filter = ctl.theme === 'oled'
        ? 'invert(1) hue-rotate(180deg) contrast(.88) saturate(.85)'
        : 'invert(1) hue-rotate(180deg) contrast(.92) saturate(.9)';
    }
    let x = 0;
    for (const c of canvases) {
      ctx.drawImage(c, x, Math.round((totalH - c.height) / 2));
      x += c.width + gap;
    }
    ctx.filter = 'none';
    if (meta.dark && !filtersOk) {
      // vieux navigateur sans ctx.filter : inversion manuelle (le rendu
      // reste fidèle à l'esprit nuit : fond sombre, texte clair)
      const img = ctx.getImageData(0, 0, totalW, totalH);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
      }
      ctx.putImageData(img, 0, 0);
    }
    const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
    if (!blob || blob.size < 2000) throw new Error('capture vide');
    return blob;
  };

  ctl.captureName = () => `nuit-calme-${NC.slug(rec.title)}-p${ctl.page}.png`;

  ctl.resize = () => { keepScroll(); return render(); };

  /* ── Ouverture ── */
  stage.hidden = false;
  await render();
  await ctl.loadToc();

  ctl.destroy = () => {
    renderGen++; // invalide tout rendu encore en vol
    ctl._tasks.forEach((t) => { try { t.cancel(); } catch (e) {} });
    ctl._tlTasks.forEach((t) => { try { t.cancel(); } catch (e) {} });
    thumbTasks.forEach((t) => { try { t.cancel(); } catch (e) {} }); // vignettes (V2.18)
    thumbTasks.clear();
    thumbCache.clear();
    detachSelHandlers(); // retire mouseup/copy du document et mousedown du stage
    if (stage.__ncNavHandlers) { // retire pan et molette du stage (n°6)
      stage.removeEventListener('pointerdown', stage.__ncNavHandlers.down);
      stage.removeEventListener('pointermove', stage.__ncNavHandlers.move);
      stage.removeEventListener('pointerup', stage.__ncNavHandlers.up);
      stage.removeEventListener('pointercancel', stage.__ncNavHandlers.cancel);
      stage.removeEventListener('wheel', stage.__ncNavHandlers.wheel);
      stage.__ncNavHandlers = null;
    }
    if (wheelTimer) { clearTimeout(wheelTimer); wheelTimer = null; }
    textCache.clear();
    try { doc.destroy(); } catch (e) {}
    stage.innerHTML = '';
  };

  return ctl;
};
