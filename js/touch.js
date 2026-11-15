/* NUIT CALME — gestes tactiles (V2.17) :
   balayages (tourner la page), zones de tap (bords = pages, centre =
   barres), pinch (zoom PDF, taille du texte EPUB).
   Deux terrains de jeu, une même grammaire de geste :
   • le document principal, sur #stage — les pages PDF (canvas + couche
     texte) et les marges sombres autour d'un EPUB ;
   • l'INTÉRIEUR de chaque iframe EPUB — un toucher sur le papier ne
     remonte jamais au document parent (même origine, mais fenêtre
     distincte) : chaque contenu rendu est câblé par wireContent(),
     appelé depuis le hook content d'epub-reader.js.
   Le tactile coexiste avec tout ce qui existait : le texte reste
   sélectionnable (appui long), les liens cliquables, le défilement
   vertical d'un EPUB en mode défilement et le pan d'un PDF zoomé
   restent natifs — seuls les gestes nets (tap court, balayage
   horizontal dominant, pincement à deux doigts) déclenchent quelque
   chose. Le clic souris garde ses chemins d'origine (#book-frame,
   #pdf-stage, bords des iframes) : rien ne change sur ordinateur. */
'use strict';

NC.touch = (() => {
  /* ── Grammaire du geste ── */
  const TAP_MS = 350;       // durée maximale d'un tap
  const TAP_SLOP = 12;      // déplacement maximal (px) d'un tap
  const SWIPE_MIN = 56;     // distance horizontale minimale d'un balayage
  const SWIPE_RATIO = 1.6;  // un balayage est horizontal : |dx| ≥ 1,6 × |dy|
  const SWIPE_MS = 700;     // durée maximale d'un balayage
  const PINCH_MIN = 0.02;   // variation de zoom minimale pour un commit
  const FONT_MIN = 80, FONT_MAX = 170; // bornes de la taille du texte EPUB
  const FONT_STEP = 5;      // le pinch tombe sur des crans de 5 %

  /* Feuille injectée dans chaque EPUB : le papier ne laisse pas le
     navigateur pincer la page ni zoomer au double-tap (on gère), et
     pas de halo gris sur les taps. pan-y garde le défilement vertical
     natif du mode défilement. */
  const TOUCH_CSS = [
    'html{touch-action:pan-y;-webkit-tap-highlight-color:transparent;}',
    'body{-webkit-tap-highlight-color:transparent;}',
  ].join('\n');

  /* Contrôleur courant (epub ou pdf) — toujours lu à chaud : un geste
     qui s'achève doit viser le livre réellement ouvert. */
  const ctlNow = () => (NC.reader && NC.reader._state ? NC.reader._state().ctl : null);

  /* ── Utilitaires de geste ── */
  function touches2(t1, t2) {
    return {
      dist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
      mid: { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 },
    };
  }

  function fontStep(v) {
    return Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(v / FONT_STEP) * FONT_STEP));
  }

  /* Ferme les menus flottants ouverts (menu de sélection, typographie,
     thème). Retourne true si quelque chose a été fermé — le tap a
     alors servi à ça et ne fait rien d'autre (pas de tourne-page,
     pas de bascule des barres). */
  function closePopups(c) {
    if (!c) return false;
    let closed = false;
    const sel = document.querySelector('#sel-popup');
    if (sel && !sel.hidden && typeof c.hideSelPopup === 'function') { c.hideSelPopup(); closed = true; }
    ['#font-pop', '#theme-pop'].forEach((id) => {
      const el = document.querySelector(id);
      if (el && !el.hidden) { el.hidden = true; closed = true; }
    });
    return closed;
  }

  /* Classe un geste terminé : tap, balayage, pinch (déjà décidé) ou rien. */
  function classify(g) {
    if (!g || g.kind === 'pinch' || g.kind === 'dead') return g ? g.kind : 'dead';
    const dx = g.x - g.x0;
    const dy = g.y - g.y0;
    const dt = Date.now() - g.t0;
    if (dt <= TAP_MS && Math.hypot(dx, dy) <= TAP_SLOP) return 'tap';
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) >= SWIPE_RATIO * Math.abs(dy) && dt <= SWIPE_MS) return 'swipe';
    return 'dead';
  }

  /* ── Pinch PDF : aperçu immédiat, commit rendu ────────────────────
     Re-rendre le canvas à chaque mouvement serait trop lourd : pendant
     le geste, un simple scale CSS sur l'enveloppe des pages (origine
     posée au point de pincement — le point sous les doigts ne bouge
     pas) ; au relâchement, le transform s'efface et setZoom() rend
     les pages à la vraie échelle (keepScroll garde la position). */
  function pdfLanes() { return document.querySelector('#pdf-stage .nc-pdf-pages'); }

  function pdfPreview(k, mid) {
    const lanes = pdfLanes();
    if (!lanes) return;
    const r = lanes.getBoundingClientRect();
    lanes.style.transformOrigin = (mid.x - r.left) + 'px ' + (mid.y - r.top) + 'px';
    lanes.style.transform = 'scale(' + k + ')';
  }

  function pdfPreviewClear() {
    const lanes = pdfLanes();
    if (lanes) { lanes.style.transform = ''; lanes.style.transformOrigin = ''; }
  }

  /* Commit d'un pinch selon le format capturé au DÉBUT du geste
     (le livre peut avoir changé entre-temps — on ne s'y fie pas au
     relâchement). */
  async function pinchCommit(g) {
    pdfPreviewClear();
    if (!g || g.base == null || !g.fmt) return;
    const c = ctlNow();
    if (!c || c.type !== g.fmt) return; // le livre a été fermé ou remplacé
    const k = Math.max(0.6, Math.min(2.2, g.base * (g.dist / g.dist0 || 1)));
    if (g.fmt === 'pdf') {
      if (Math.abs(k - g.base) < PINCH_MIN) return;
      try { await c.setZoom(k); } catch (e) { console.error(e); }
    } else {
      const target = fontStep(g.base * (g.dist / g.dist0 || 1));
      if (Math.abs(target - g.base) < FONT_STEP) return;
      try { c.setFontSize(target); } catch (e) { console.error(e); }
      NC.toast('Taille du texte : ' + target + ' %', 'info', 1500);
    }
  }

  /* Zone visible du papier EPUB, dans les coordonnées de l'iframe :
     epub.js rend une iframe plus LARGE que le cadre (deux colonnes,
     une seule visible) — les tiers se mesurent donc sur la partie
     réellement à l'écran (intersection iframe × #epub-host), pas sur
     la largeur interne. Retourne { w, x } : largeur visible et
     position du tap dans cette partie visible. */
  function visibleZone(contents, clientX) {
    try {
      const fe = contents.window.frameElement;
      const host = document.querySelector('#epub-host');
      if (!fe || !host) return null;
      const fr = fe.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      const left = Math.max(fr.left, hr.left);
      const right = Math.min(fr.right, hr.right);
      if (!(right > left)) return null;
      return { w: right - left, x: (fr.left + clientX) - left };
    } catch (e) { return null; }
  }

  /* ════════════════ Document principal : #stage ════════════════
     PDF entier + marges autour d'un EPUB. Les touchers sur le papier
     EPUB sont absents d'ici (l'iframe les avale) : ils vivent dans
     wireContent(). Les boutons ⟨ ⟩ posés sur le stage gardent la
     priorité : un tap sur eux n'est pas un geste de lecture. */
  let g = null; // geste en cours : { kind, x0, y0, t0, x, y, dist0, base }

  function startOrUpgradePinch(ev) {
    if (ev.touches.length < 2) return false;
    const pair = touches2(ev.touches[0], ev.touches[1]);
    if (!g || !g.pinch) {
      const c = ctlNow();
      g = {
        kind: 'pinch', pinch: true,
        fmt: c ? c.type : null,
        x0: pair.mid.x, y0: pair.mid.y, t0: g ? g.t0 : Date.now(),
        x: pair.mid.x, y: pair.mid.y,
        dist0: pair.dist, dist: pair.dist,
        base: c && c.type === 'pdf' ? c.zoom : (c && c.type === 'epub' ? c.fontSize : null),
      };
    } else {
      g.dist = pair.dist; g.x = pair.mid.x; g.y = pair.mid.y;
    }
    return true;
  }

  function attachStage() {
    const stage = document.querySelector('#stage');
    if (!stage || stage.__ncTouchWired) return;
    stage.__ncTouchWired = true;

    stage.addEventListener('touchstart', (ev) => {
      if (startOrUpgradePinch(ev)) return;
      if (g) return; // doigt résiduel d'un pinch : ignoré
      const t = ev.changedTouches[0];
      g = { kind: 'pending', x0: t.clientX, y0: t.clientY, t0: Date.now(), x: t.clientX, y: t.clientY };
    }, { passive: true });

    stage.addEventListener('touchmove', (ev) => {
      if (!g) return;
      if (startOrUpgradePinch(ev)) {
        if (g.fmt === 'pdf') ev.preventDefault(); // le navigateur ne pincera pas la page
        pdfPreview(Math.max(0.6, Math.min(2.2, g.base * (g.dist / g.dist0 || 1))), g);
        return;
      }
      const t = ev.changedTouches[0];
      g.x = t.clientX; g.y = t.clientY;
      /* Une seule touche : rien à bloquer — le défilement natif du PDF
         (pan/scroll) doit vivre, un balayage se juge au relâchement. */
    }, { passive: false });

    stage.addEventListener('touchend', (ev) => {
      if (!g) return;
      /* Les doigts se posent et se lèvent presque toujours L'UN APRÈS
         L'AUTRE (touchstart à 1 puis 2 touches, touchend à 1 puis 0) :
         le pinch s'achève au PREMIER relâchement — l'intention est
         claire — et le doigt restant est ignoré jusqu'au bout. */
      if (g.pinch) {
        const done = g; g = null;
        pdfPreviewClear();
        pinchCommit(done);
        return;
      }
      if (ev.touches.length > 0) { g.kind = 'dead'; return; }
      const done = g; g = null;
      const kind = classify(done);
      if (kind === 'tap') {
        const c = ctlNow();
        if (!c) return;
        const t = ev.changedTouches[0];
        const el = t.target && t.target.closest
          ? t.target.closest('button, a, input, select, textarea, label')
          : null;
        if (el) return; // un outil reste un outil : le clic fera son office
        ev.preventDefault(); // pas de clic fantôme, pas de double-tap
        if (closePopups(c)) return;
        const r = stage.getBoundingClientRect();
        const x = t.clientX - r.left;
        if (x < r.width / 3) NC.reader.goPrev();
        else if (x > (r.width * 2) / 3) NC.reader.goNext();
        else NC.reader.toggleChrome();
        return;
      }
      if (kind === 'swipe') {
        const c = ctlNow();
        if (!c) return;
        /* PDF zoomé au-delà du cadre : le balayage horizontal fait
           défiler la page (natif), il ne tourne pas — tourner, c'est
           pour quand la page tient dans la largeur. */
        const st = document.querySelector('#pdf-stage');
        if (c.type === 'pdf' && st && st.scrollWidth > st.clientWidth + 1) return;
        ev.preventDefault();
        if (done.x < done.x0) NC.reader.goNext();
        else NC.reader.goPrev();
      }
    }, { passive: false });

    stage.addEventListener('touchcancel', () => { pdfPreviewClear(); g = null; }, { passive: true });
    /* iOS Safari : filet supplémentaire contre le zoom page — l'événement
       gesture est bloqué d'office sur la zone de lecture. */
    stage.addEventListener('gesturestart', (ev) => ev.preventDefault());
  }

  /* ════════════════ Intérieur d'une iframe EPUB ════════════════
     Même grammaire, mesurée sur la fenêtre intérieure (le papier).
     En mode défilement, le geste vertical reste ENTIEREMENT natif :
     on ne preventDefault jamais un mouvement à une main — seuls les
     taps et les balayages horizontaux déclenchent quelque chose. */
  function wireContent(contents) {
    try {
      const doc = contents.document;
      if (!doc || doc.__ncTouchWired) return;
      doc.__ncTouchWired = true;
      try { contents.addStylesheetCss(TOUCH_CSS, 'nuit-calme-touch'); } catch (e) { /* déjà posée */ }
      const win = contents.window;

      let ig = null; // geste interne

      const pinchBase = () => {
        const c = ctlNow();
        return c && c.type === 'epub' ? c.fontSize : null;
      };

      doc.addEventListener('touchstart', (ev) => {
        if (ev.touches.length >= 2) {
          const pair = touches2(ev.touches[0], ev.touches[1]);
          if (!ig || !ig.pinch) {
            ig = { kind: 'pinch', pinch: true, fmt: 'epub', x0: pair.mid.x, y0: pair.mid.y, t0: ig ? ig.t0 : Date.now(),
                   x: pair.mid.x, y: pair.mid.y, dist0: pair.dist, dist: pair.dist, base: pinchBase() };
          } else { ig.dist = pair.dist; ig.x = pair.mid.x; ig.y = pair.mid.y; }
          return;
        }
        if (ig) return; // doigt résiduel d'un pinch
        const t = ev.changedTouches[0];
        ig = { kind: 'pending', x0: t.clientX, y0: t.clientY, t0: Date.now(), x: t.clientX, y: t.clientY };
      }, { passive: true });

      doc.addEventListener('touchmove', (ev) => {
        if (!ig) return;
        if (ev.touches.length >= 2) {
          const pair = touches2(ev.touches[0], ev.touches[1]);
          if (!ig || !ig.pinch) {
            ig = { kind: 'pinch', pinch: true, fmt: 'epub', x0: pair.mid.x, y0: pair.mid.y, t0: ig ? ig.t0 : Date.now(),
                   x: pair.mid.x, y: pair.mid.y, dist0: pair.dist, dist: pair.dist, base: pinchBase() };
          } else { ig.dist = pair.dist; ig.x = pair.mid.x; ig.y = pair.mid.y; }
          ev.preventDefault(); // ni zoom page, ni déformation du papier
          return;
        }
        const t = ev.changedTouches[0];
        ig.x = t.clientX; ig.y = t.clientY;
        /* En mode pages, un balayage horizontal net prend la main dès
           qu'il se dessine (le papier n'a rien à défiler horizontalement) ;
           en défilement vertical, on ne touche jamais au geste natif. */
        const c = ctlNow();
        if (c && c.type === 'epub' && c.flow !== 'scrolled') {
          const dx = ig.x - ig.x0;
          const dy = ig.y - ig.y0;
          if (Math.abs(dx) > 18 && Math.abs(dx) > 1.6 * Math.abs(dy)) ev.preventDefault();
        }
      }, { passive: false });

      doc.addEventListener('touchend', (ev) => {
        if (!ig) return;
        /* Pinch : commit au premier relâchement (doigts levés l'un
           après l'autre), le doigt restant est ignoré. */
        if (ig.pinch) {
          const done = ig; ig = null;
          pinchCommit(done);
          return;
        }
        if (ev.touches.length > 0) { ig.kind = 'dead'; return; }
        const done = ig; ig = null;
        const kind = classify(done);
        const c = ctlNow();
        if (!c || c.type !== 'epub') return;

        if (kind === 'tap') {
          const t = ev.changedTouches[0];
          const el = t.target && t.target.closest
            ? t.target.closest('a, button, video, audio, [role="button"]')
            : null;
          if (el) return; // lien ou média : le clic naturel agit
          try {
            const sel = contents.window.getSelection
              ? contents.window.getSelection() : win.getSelection();
            if (sel && !sel.isCollapsed) return; // un tap qui replie une sélection n'est pas un ordre
          } catch (e) {}
          ev.preventDefault(); // pas de clic fantôme : wireEdgeTurn ne doublera pas
          if (closePopups(c)) return;
          /* Tiers mesurés sur la partie VISIBLE du papier (l'iframe
             interne est plus large que le cadre — deux colonnes epub.js).
             Repli : la fenêtre intérieure, si le cadre est introuvable. */
          const z = visibleZone(contents, t.clientX)
            || { w: win.innerWidth || 0, x: t.clientX };
          if (!z.w) return;
          if (z.x < -4 || z.x > z.w + 4) return; // hors papier visible
          if (z.x < z.w / 3) NC.reader.goPrev();
          else if (z.x > (z.w * 2) / 3) NC.reader.goNext();
          else NC.reader.toggleChrome();
          return;
        }
        if (kind === 'swipe') {
          ev.preventDefault();
          if (done.x < done.x0) NC.reader.goNext();
          else NC.reader.goPrev();
        }
      }, { passive: false });

      doc.addEventListener('touchcancel', () => { ig = null; }, { passive: true });
      doc.addEventListener('gesturestart', (ev) => ev.preventDefault());
    } catch (e) { console.error('tactile epub', e); }
  }

  function init() { attachStage(); }

  return { init, wireContent };
})();
