/* NUIT CALME — amorçage */
'use strict';

(async function boot() {
  // Configuration pdf.js
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  }

  try {
    NC.reader.init();
    NC.packs.init();
    NC.goal.init(); // objectif de lecture (V2.24) : câblage de la bannière
    NC.backup.init(); // sauvegarde & restauration (V2.25) : bouton, modale, rappel
    await NC.library.init();
  } catch (err) {
    console.error('Initialisation impossible', err);
    NC.toast('Stockage local inaccessible (IndexedDB). Fermez les autres onglets de Nuit Calme ou autorisez les données de site, puis rechargez la page.', 'error', 9000);
  }

  /* Hook de test (utilisé par la vérification automatisée) :
     permet d'ajouter un fichier depuis une URL locale. */
  window.NC_DEBUG = {
    async addFromUrl(fileUrl) {
      const res = await fetch(fileUrl);
      const blob = await res.blob();
      const name = decodeURIComponent(fileUrl.split('/').pop());
      const file = new File([blob], name, { type: blob.type });
      await NC.library.importFiles([file]);
      const books = await NC.db.allBooks();
      return books.length;
    },
    state() {
      const st = NC.reader._state();
      return {
        books: st.current ? 1 : 0,
        type: st.ctl ? st.ctl.type : null,
        spread: st.ctl ? st.ctl.spread : null,
        page: st.ctl && st.ctl.page ? st.ctl.page : null,
        fontSize: st.ctl && st.ctl.fontSize ? st.ctl.fontSize : null,
        theme: document.body.dataset.bookTheme || null,
        errors: window.__ncErrors.slice(0, 10),
      };
    },
  };
})();

/* ── PWA (V2.23) : installable ──────────────────────────────
   En ligne (GitHub Pages, serveur local), un service worker garde la
   coquille de l'app dans le cache : Nuit Calme démarre même sans
   réseau. Le bouton « Installer l'app » paraît quand le navigateur
   sait installer (Chrome, Edge, Android) ; sur iPhone — où Safari
   installe par le menu Partager — il explique le geste. Ouverte
   déjà comme application, la liseuse se tait. */
(function setupPwa() {
  const btn = document.getElementById('btn-install');
  const isStandalone = () =>
    (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;

  // Service worker : uniquement servi en http(s) — silencieux en
  // fichier local, où le navigateur ne le permet pas.
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' ||
       location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  if (!btn || isStandalone()) return;

  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
  const isSafariIOS = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);

  if (isSafariIOS) {
    btn.hidden = false;
    btn.addEventListener('click', () => {
      NC.toast('Sur iPhone : touchez Partager (le carré surmonté d’une flèche) puis « Sur l’écran d’accueil » pour installer Nuit Calme.', 'info', 9000);
    });
    return;
  }

  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!deferred || typeof deferred.prompt !== 'function') return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (err) { /* choix fermé */ }
    deferred = null;
    btn.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    btn.hidden = true;
    NC.toast('Nuit Calme rejoint votre écran d’accueil — bonne lecture.', 'success', 4200);
  });
})();
