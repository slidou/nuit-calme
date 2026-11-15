/* NUIT CALME — utilitaires */
'use strict';
window.NC = window.NC || {};

NC.$ = (sel, root) => (root || document).querySelector(sel);
NC.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

NC.esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

NC.slug = (s) => String(s || 'page').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page';

NC.fmtDate = (ts) => {
  try {
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) { return ''; }
};

/* ── Historique des passages (n°9) : libellés de temps ── */
NC.fmtTime = (ts) => {
  try {
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
};

/* Durée d'un séjour : « 45 s », « 3 min », « 1 h 05 » — celle affichée
   à côté de chaque passage de l'historique. */
NC.fmtDwell = (ms) => {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
};

/* En-tête de jour dans l'historique : Aujourd'hui / Hier, puis la date
   longue (avec l'année seulement si ce n'est pas l'année courante). */
NC.dayLabel = (ts) => {
  try {
    const d = new Date(ts);
    const now = new Date();
    const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((dayStart(now) - dayStart(d)) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Hier';
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString('fr-FR', sameYear
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return ''; }
};

/* ── Statistiques de lecture (V2.12) : helpers ── */

/* Durée de lecture en secondes : « < 1 min », « 42 min », « 4 h 12 ». */
NC.fmtDur = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return '< 1 min';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
};

/* Clé de jour locale « YYYY-MM-DD » : la base des agrégats de lecture.
   Construite sur l'heure LOCALE (pas UTC) : minuit de l'ordinateur. */
NC.dateKey = (ts) => {
  const d = (ts instanceof Date) ? ts : new Date(ts || Date.now());
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
};
NC.todayKey = () => NC.dateKey(Date.now());

/* Jour abrégé pour l'axe du graphique : le numéro du jour seul (« 3 »,
   « 28 ») — la place manque sur 14 colonnes ; le libellé complet
   (Aujourd'hui, Hier, date longue) va dans l'infobulle de la colonne. */
NC.dayNum = (key) => String(Number(String(key).slice(-2)) || '');

/* Libellé long d'une clé de jour — même vocabulaire que l'historique
   (Aujourd'hui / Hier / date longue), réutilisé par les infobulles. */
NC.dayLabelKey = (key) => {
  try {
    const [y, m, d] = key.split('-').map(Number);
    return NC.dayLabel(new Date(y, m - 1, d).getTime());
  } catch (e) { return key; }
};

NC.fmtSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
};

/* ── Statut de lecture (V2.14) ──
   Trois états, posés sur une fiche légère par livre (magasin
   « bookmeta ») — jamais sur le fichier lui-même :
   • « À lire » — le défaut : tout livre importé, jamais ouvert ;
   • « En cours » — posé tout seul à l'ouverture du livre ;
   • « Terminé » — posé tout seul quand la fin est atteinte (dernière
     page PDF, fin du dernier passage EPUB), ou à la main.
   Toute valeur absente ou inconnue — livres anciens, fiche amputée —
   retombe sur « À lire » (repli assuré, même philosophie que les
   couleurs et les catégories). */
NC.READ_STATUS = {
  alire:   { label: 'À lire' },
  encours: { label: 'En cours' },
  termine: { label: 'Terminé' },
};
NC.READ_DEFAULT = 'alire';
NC.normStatus = (s) => (NC.READ_STATUS[s] ? s : NC.READ_DEFAULT);

/* Icônes du statut (tracés inline, la palette du site fait le reste) :
   cercle vide (à lire), cercle à moitié plein (en cours), coche (terminé). */
NC.STATUS_ICON = {
  alire:   '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/></svg>',
  encours: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><path class="fill" d="M12 4.5a7.5 7.5 0 0 1 0 15z"/></svg>',
  termine: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 6.5L9.8 16.2 4.5 10.9"/></svg>',
};

/* ── Filtres de bibliothèque (V2.14) : mémorisation locale ──
   Le choix des filtres survit au rechargement (localStorage) ; toute
   valeur invalide — groupe supprimé ailleurs, vieille donnée — est
   écartée au chargement. */
NC.libFilterLoad = function () {
  let f = { status: 'all', group: 'all' };
  try {
    const raw = JSON.parse(localStorage.getItem('nc.lib-filter') || '{}');
    if (raw && typeof raw === 'object') {
      if (raw.status === 'all' || NC.READ_STATUS[raw.status]) f.status = raw.status;
      if (typeof raw.group === 'string') f.group = raw.group;
    }
  } catch (e) { /* stockage indisponible : filtres par défaut */ }
  return f;
};
NC.libFilterSave = function (f) {
  try { localStorage.setItem('nc.lib-filter', JSON.stringify(f || {})); } catch (e) {}
};

/* ── Tri de la bibliothèque (V2.16) : mémorisation locale ──
   Même contrat que les filtres : la clé et le sens choisis survivent
   au rechargement ; toute valeur inconnue — vieille donnée, clé
   retirée — retombe sur le défaut, qui est l'ordre historique de la
   bibliothèque (« Dernière lecture », du plus récent au plus ancien). */
NC.LIB_SORTS = {
  lastread: { label: 'Dernière lecture' },
  added:    { label: 'Ajout' },
  title:    { label: 'Titre' },
  author:   { label: 'Auteur' },
};
NC.libSortLoad = function () {
  let s = { by: 'lastread', dir: 'desc' };
  try {
    const raw = JSON.parse(localStorage.getItem('nc.lib-sort') || '{}');
    if (raw && typeof raw === 'object') {
      if (NC.LIB_SORTS[raw.by]) s.by = raw.by;
      if (raw.dir === 'asc' || raw.dir === 'desc') s.dir = raw.dir;
    }
  } catch (e) { /* stockage indisponible : tri par défaut */ }
  return s;
};
NC.libSortSave = function (s) {
  try { localStorage.setItem('nc.lib-sort', JSON.stringify(s || {})); } catch (e) {}
};

/* ── Toasts ── */
NC.toast = function (msg, type = 'info', ms = 3400) {
  const box = NC.$('#toasts');
  if (!box) return;
  while (box.children.length >= 3) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (type !== 'info' ? ' ' + type : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  }, ms);
};

/* ── Toast persistant (V2.15 : import en masse) ──
   Même apparence qu'un toast ordinaire, mais il ne s'efface pas tout
   seul : update() rafraîchit son texte en place — et le replace en
   queue du bac pour ne jamais être évincé par d'autres toasts —,
   done() le transforme en récapitulatif final puis le laisse
   s'effacer comme les autres. Rien de nouveau côté CSS. */
NC.toastHold = function (msg, type = 'info') {
  const box = NC.$('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (type !== 'info' ? ' ' + type : '');
  el.textContent = msg;
  if (box) box.appendChild(el);
  const vanish = () => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  };
  return {
    update(m) { el.textContent = m; if (box) box.appendChild(el); },
    done(m, doneType = 'info', ms = 3400) {
      if (m != null) el.textContent = m;
      el.className = 'toast' + (doneType !== 'info' ? ' ' + doneType : '');
      setTimeout(vanish, ms);
    },
    remove() { el.remove(); },
  };
};

/* ── Téléchargement automatique ── */
NC.downloadBlob = function (blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 800);
};

NC.tick = () => new Promise((r) => setTimeout(r, 0));

/* ── Polices embarquées : CSS partagé, injecté aussi dans les EPUB ──
   Les URLs sont absolues (calculées depuis la page) : dans une iframe
   créée sur une URL blob:, les chemins relatifs ne se résolvent pas.
   Deux familles embarquées : Cormorant Garamond (livre, défaut) et
   Inter (UI + option « Sans moderne » du choix de police, ajout n°2). */
NC.FONT_CSS = (() => {
  const base = new URL('vendor/fonts/', location.href).href;
  const rangeLatin = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  const rangeExt = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
  const faces = [
    ['Cormorant Garamond', 'cormorant-garamond-latin-500-normal.woff2', 500, 'normal', rangeLatin],
    ['Cormorant Garamond', 'cormorant-garamond-latin-600-normal.woff2', 600, 'normal', rangeLatin],
    ['Cormorant Garamond', 'cormorant-garamond-latin-700-normal.woff2', 700, 'normal', rangeLatin],
    ['Cormorant Garamond', 'cormorant-garamond-latin-500-italic.woff2', 500, 'italic', rangeLatin],
    ['Cormorant Garamond', 'cormorant-garamond-latin-ext-500-normal.woff2', 500, 'normal', rangeExt],
    ['Cormorant Garamond', 'cormorant-garamond-latin-ext-600-normal.woff2', 600, 'normal', rangeExt],
    ['Cormorant Garamond', 'cormorant-garamond-latin-ext-700-normal.woff2', 700, 'normal', rangeExt],
    ['Cormorant Garamond', 'cormorant-garamond-latin-ext-500-italic.woff2', 500, 'italic', rangeExt],
    ['Inter', 'inter-latin-400-normal.woff2', 400, 'normal', rangeLatin],
    ['Inter', 'inter-latin-500-normal.woff2', 500, 'normal', rangeLatin],
    ['Inter', 'inter-latin-600-normal.woff2', 600, 'normal', rangeLatin],
    ['Inter', 'inter-latin-ext-400-normal.woff2', 400, 'normal', rangeExt],
    ['Inter', 'inter-latin-ext-500-normal.woff2', 500, 'normal', rangeExt],
    ['Inter', 'inter-latin-ext-600-normal.woff2', 600, 'normal', rangeExt],
  ];
  return faces.map(([family, file, weight, style, range]) =>
    `@font-face{font-family:'${family}';src:url('${base}${file}') format('woff2');font-weight:${weight};font-style:${style};font-display:swap;unicode-range:${range};}`
  ).join('\n');
})();

/* ── Thèmes du CONTENU du livre (papier, sépia, nuit, OLED) ──
   Le chrome du site reste toujours sombre : seules les pages du livre
   changent. Chaque palette : fond, encre, titres, liens, citations. */
NC.BOOK_THEMES = {
  paper: {
    label: 'Papier', dark: false,
    bg: '#f5eedc', ink: '#26221a', head: '#77571b', link: '#96731f',
    quote: '#56503f', quoteBar: 'rgba(150,115,31,.55)', rule: 'rgba(150,115,31,.4)',
  },
  sepia: {
    label: 'Sépia', dark: false,
    bg: '#d9d1bd', ink: '#3a3222', head: '#6b5616', link: '#7c6417',
    quote: '#514834', quoteBar: 'rgba(122,98,26,.6)', rule: 'rgba(122,98,26,.45)',
  },
  night: {
    label: 'Nuit', dark: true,
    bg: '#191a1f', ink: '#eae5d8', head: '#e2c88c', link: '#c8a24b',
    quote: '#cfc8b6', quoteBar: 'rgba(200,162,75,.5)', rule: 'rgba(210,182,112,.3)',
  },
  oled: {
    label: 'OLED', dark: true,
    bg: '#000000', ink: '#d9d4c7', head: '#d9b96a', link: '#c8a24b',
    quote: '#b9b4a7', quoteBar: 'rgba(200,162,75,.45)', rule: 'rgba(210,182,112,.26)',
  },
};

NC.isDarkTheme = (theme) => !!(NC.BOOK_THEMES[theme] || NC.BOOK_THEMES.paper).dark;

/* ── Palette des soulignages (ajout n°8) ──
   Teintes posées en translucide (fill-opacity .35 côté SVG) : lisibles
   sur les quatre thèmes de livre. « or » reste la couleur par défaut
   et sert de repli aux anciennes annotations sans couleur enregistrée. */
NC.HIGHLIGHT_COLORS = {
  or:     { label: 'Or',     hex: '#d8a93f' },
  rose:   { label: 'Rose',   hex: '#d9899f' },
  vert:   { label: 'Vert',   hex: '#8fb573' },
  bleu:   { label: 'Bleu',   hex: '#7fa3d1' },
  violet: { label: 'Violet', hex: '#a98bc4' },
};
NC.HIGHLIGHT_DEFAULT = 'or';
NC.highlightHex = (key) => (NC.HIGHLIGHT_COLORS[key] || NC.HIGHLIGHT_COLORS[NC.HIGHLIGHT_DEFAULT]).hex;
NC.highlightKey = (key) => (NC.HIGHLIGHT_COLORS[key] ? key : NC.HIGHLIGHT_DEFAULT);

/* ── Notes personnelles (ajout n°9) ──
   Une note est une annotation `kind:'note'` : elle porte un texte
   rédigé (`a.note`) en plus du passage cité (`a.text`). Les
   annotations anciennes — sans `kind` — restent des surlignages.
   Rendu distinct : trait sous la ligne (note) vs voile translucide
   (surlignage). Couleur par défaut « bleu », pour ne pas confondre
   d'un coup d'œil notes et surlignages. */
NC.NOTE_DEFAULT = 'bleu';
NC.isNote = (a) => !!(a && a.kind === 'note');

/* ── Catégories + recherche dans les annotations (ajout n°10) ──
   Une annotation peut porter une catégorie (`a.category`, clé de la
   liste ci-dessous). Liste VOLONTAIREMENT prédéfinie : aucun écran
   de gestion, aucune donnée à migrer. Toute valeur absente ou
   inconnue — toutes les annotations anciennes — retombe sur
   « Aucune » (repli assuré, même philosophie que les couleurs). */
NC.ANNOT_CATEGORIES = [
  { key: 'idee',     label: 'Idée' },
  { key: 'citation', label: 'Citation' },
  { key: 'question', label: 'Question' },
  { key: 'aretenir', label: 'À retenir' },
];
NC.categoryMeta = (key) => NC.ANNOT_CATEGORIES.find((c) => c.key === key) || null;

/* Recherche insensible à la casse ET aux accents : les deux côtés de
   la comparaison sont « repliés » avant test (É == e, À == a…). */
NC.foldText = (s) => String(s == null ? '' : s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/* CSS injecté dans chaque document EPUB rendu (voie fiable epub.js).
   Le mode OLED garde une encre un peu plus douce que nuit : noir absolu
   sous texte très clair = halo désagréable sur écran OLED. */
NC.bookThemeCss = function (theme) {
  const t = NC.BOOK_THEMES[theme] || NC.BOOK_THEMES.paper;
  return NC.FONT_CSS + `
    :root{ color-scheme: ${t.dark ? 'dark' : 'light'} !important; }
    html{ background:${t.bg} !important; }
    body{
      background:transparent !important;
      color:${t.ink} !important;
      font-family:'Cormorant Garamond', Georgia, 'Times New Roman', serif !important;
      line-height:1.62 !important;
    }
    h1,h2,h3,h4{ color:${t.head} !important; font-weight:600 !important; line-height:1.25 !important; }
    a{ color:${t.link} !important; text-decoration:none !important; }
    blockquote{
      border-left:2px solid ${t.quoteBar};
      padding-left:.8em;
      color:${t.quote} !important; font-style:italic;
    }
    hr{ border:none; border-top:1px solid ${t.rule}; width:40%; margin:1.4em auto; }
    img,svg{ max-width:100% !important; }
    ::selection{ background:rgba(200,162,75,.42); }
    p{ margin:0 0 .8em 0 !important; }
  `;
};

/* ── Typographie avancée (ajout n°2) ──
   Trois axes réglables par livre : la police, l'interlignage et
   l'alignement du texte. Le module `prefs` (V2.2) mémorise le réglage
   par livre ; « lastTypo » sert de repli global pour un livre jamais
   ouvert (comme le thème). Le CSS est injecté dans une feuille dédiée
   « nuit-calme-typo », posée APRÈS la feuille de thème : elle l'emporte
   sur les valeurs par défaut (Cormorant, 1,62) sans les effacer — si
   l'injection échoue un jour, le livre reste lisible avec le défaut. */
NC.BOOK_FONTS = {
  cormorant: { label: 'Cormorant', preview: "'Cormorant Garamond', serif", stack: "'Cormorant Garamond', Georgia, 'Times New Roman', serif" },
  serif:     { label: 'Sérif classique', preview: "Georgia, 'Times New Roman', serif", stack: "Georgia, 'Times New Roman', Times, serif" },
  sans:      { label: 'Sans moderne', preview: "'Inter', system-ui, sans-serif", stack: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  system:    { label: 'Police du système', preview: "system-ui, sans-serif", stack: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" },
};

NC.LINE_HEIGHTS = [
  { value: 1.45, label: 'Serré' },
  { value: 1.62, label: 'Confort' },
  { value: 1.85, label: 'Aéré' },
  { value: 2.1,  label: 'Grand' },
];

NC.TYPO_DEFAULT = { font: 'cormorant', lineHeight: 1.62, justify: 'left' };

/* Repli assuré sur toute valeur inconnue (vieille donnée, enregistrement
   incomplet) : la typographie ne peut jamais « casser » un livre. */
NC.normalizeTypo = function (t) {
  const src = (t && typeof t === 'object') ? t : {};
  const font = NC.BOOK_FONTS[src.font] ? src.font : NC.TYPO_DEFAULT.font;
  let lh = Number(src.lineHeight);
  if (!isFinite(lh)) lh = NC.LINE_HEIGHTS[1].value; // « Confort »
  else lh = Math.max(1.2, Math.min(2.4, lh));
  const justify = src.justify === 'justify' ? 'justify' : 'left';
  return { font, lineHeight: lh, justify };
};

/* CSS injecté dans chaque document EPUB rendu (clé « nuit-calme-typo »).
   L'alignement ne vise que les paragraphes : les titres et les éléments
   déjà centrés par l'auteur (poèmes, dédicaces) ne sont pas déplacés. */
NC.typoCss = function (typo) {
  const t = NC.normalizeTypo(typo);
  const stack = (NC.BOOK_FONTS[t.font] || NC.BOOK_FONTS.cormorant).stack;
  return `
    body{ font-family:${stack} !important; line-height:${t.lineHeight} !important; }
    p{
      text-align:${t.justify === 'justify' ? 'justify' : 'start'} !important;
      ${t.justify === 'justify' ? 'hyphens:auto; -webkit-hyphens:auto; -ms-hyphens:auto;' : ''}
    }
  `;
};

/* ── Collecte des erreurs (diagnostic) ──
   Le journal est borné à 200 entrées : une boucle d'erreurs dans une
   longue session ne doit pas faire croître la mémoire sans fin. */
window.__ncErrors = [];
const _pushErr = (line) => { if (window.__ncErrors.length < 200) window.__ncErrors.push(line); };
window.addEventListener('error', (e) => {
  const msg = String(e.message || e);
  if (/ResizeObserver/.test(msg)) return; // bruit bénin d'epub.js
  _pushErr(msg);
});
const _origErr = console.error.bind(console);
console.error = (...args) => {
  try {
    const line = args.map(a => (a && a.message) ? a.message : String(a)).join(' ');
    if (!/ResizeObserver/.test(line)) _pushErr(line);
  } catch (e) {}
  _origErr(...args);
};
/* Promesses rejetées sans gestionnaire : sinon invisibles (un handler
   async qui jette ne déclenche ni « error » ni console.error). */
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  const line = (r && r.stack) ? String(r.stack).split('\n')[0] : String((r && r.message) || r);
  _pushErr('rejet non géré: ' + line);
});
