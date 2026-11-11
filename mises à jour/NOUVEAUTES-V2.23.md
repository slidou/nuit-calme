# Nuit Calme — V2.23 (application installable)

Chantier n° 15 de la feuille de route : **Nuit Calme devient une
application qu'on emporte**. Le site reste 100 % local et sans
serveur ; mais désormais le navigateur sait le poser sur l'écran
d'accueil du téléphone — icône dédiée, démarrage en plein écran sans
barres d'adresse — et, une fois visité, l'ouvre même sans réseau.
L'installation est une copie chez soi : rien ne change pour qui
préfère le simple onglet.

## Nouveautés

### 1. Une icône à son image
Une vraie icône d'app dessinée dans la maison : **le livre ouvert
doré du favicon, sous une lune fine et trois étoiles**, sur le charbon
de la liseuse. Cinq fichiers, deux coupes — une version aux coins
arrondis pour les présentations classiques, une version pleine page
« masquable » que Android et l'iOS rognent à leur guise sans jamais
couper le livre — plus l'icône 180 px d'Apple pour l'écran d'accueil
de l'iPhone. Le manifeste (`manifest.webmanifest`) décrit l'app en
français, démarre à la racine et demande le mode *standalone* : c'est
ce qui fait disparaître les barres du navigateur au lancement.

### 2. L'invitation, discrète
Dans la bibliothèque, à côté de « Packs de livres », un bouton
**« Installer l'app »** — mais il ne paraît que lorsque le navigateur
sait installer (Chrome, Edge, Android) : le clic ouvre la boîte de
dialogue native, et une fois posé, le bouton se retire avec un
remerciement. Sur **iPhone**, où Safari n'offre pas de boîte de
dialogue, le bouton est là d'emblée et explique le geste (« Partager,
puis Sur l'écran d'accueil ») dans un toast — sur téléphone, il tient
dans un bouton icône pour ne pas écraser ses voisins. Déjà installée,
la liseuse ne montre plus rien du tout : les boutons d'installation
sont pour les nouveaux venus.

### 3. Hors-ligne, vraiment
Un **service worker** (`sw.js`) garde en cache la coquille de l'app —
la page, les styles, les neuf scripts, epub.js, pdf.js et son ouvrier,
html2canvas, les quatorze polices, les icônes : 37 fichiers. Une fois
le site visité, Nuit Calme démarre sans réseau, et les livres — eux
qui vivent déjà dans le navigateur — se lisent normalement : c'est la
liseuse entière qui fonctionne hors-ligne. Les navigations passent
d'abord par le réseau (une recharge suffit à recevoir les mises à
jour, le vieux cache s'efface tout seul), le reste est servi du cache
puis rafraîchi en arrière-plan, et ce qui vient d'ailleurs — les packs
— reste l'affaire du réseau, les importations finissant de toute façon
en IndexedDB.

### 4. Les encoches respectées
En mode installé, la page touche les bords du téléphone : les quatre
inserts de sécurité (encoche en haut, barre de geste en bas, bords
arrondis en paysage) entrent dans le calcul des marges de l'en-tête,
de la grille, des filtres, des barres du lecteur et des toasts —
`viewport-fit=cover` le permet, `env(safe-area-inset-*)` le règle.
Hors mode installé, ces inserts valent zéro : **rien ne bouge** pour
qui lit dans un onglet.

## Sous le capot
- `manifest.webmanifest` (nouveau) : nom, description, `start_url` et
  `scope` relatifs (`./` — l'app marche à la racine comme dans un
  sous-chemin GitHub Pages), `display: standalone`, thème et fond
  `#0d0e10`, quatre icônes référencées.
- `sw.js` (nouveau) : pré-cache de 37 fichiers vérifié fichier à
  fichier, `skipWaiting` + `clients.claim` pour prendre service
  aussitôt, purge des anciens caches à l'activation, réseau-d'abord
  pour les navigations, *stale-while-revalidate* pour le statique,
  passage pur et simple pour tout ce qui est cross-origin.
- `icons/` (nouveau) : `icon-192/512.png`, `icon-maskable-192/512.png`,
  `apple-touch-icon.png` (180) — dessinées par script en 2048 px puis
  rééchantillonnées, trait constant vérifié au pixel.
- `index.html` : `theme-color`, lien manifeste, `apple-touch-icon`,
  méta iOS (`apple-mobile-web-app-*`), `viewport-fit=cover`, bouton
  « Installer l'app » (caché par défaut) et description mise à jour.
- `js/app.js` : enregistrement du service worker (uniquement en
  http(s), silencieux en fichier local), capte de
  `beforeinstallprompt` / `appinstalled`, branche iPhone avec le
  toast d'explication, silence total en mode standalone.
- `css/style.css` : variables `--safe-*` et marges recalculées
  (en-tête, grille, filtres, pied, barres du lecteur, packs, toasts,
  scène) — y compris dans les trois paliers responsives ; le bouton
  d'installation rejoint la règle des petits écrans.
- **Aucune dépendance neuve, aucun changement du schéma de base** —
  les packs et la bibliothèque ne voient rien.

## Fichiers touchés
`manifest.webmanifest` (nouveau), `sw.js` (nouveau), `icons/`
(nouveau, 5 fichiers), `index.html`, `js/app.js`, `css/style.css`,
`README.md`.

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Chargement sans aucune erreur de page ni console | ✅ |
| Méta `theme-color`, lien manifeste, `apple-touch-icon`, `viewport-fit=cover` | ✅ |
| `manifest.webmanifest` servi, JSON valide, `standalone`, `start_url` relatif | ✅ |
| Les 4 icônes du manifeste répondent 200 | ✅ |
| Service worker enregistré et activé | ✅ |
| Cache `nuit-calme-v2.23` créé, 37 fichiers pré-cachés | ✅ |
| Bouton caché au départ, montré sur `beforeinstallprompt` (simulé) | ✅ |
| Clic sans prompt réel : aucune erreur, bouton stable | ✅ |
| `appinstalled` (simulé) : bouton retiré + toast de bienvenue | ✅ |
| **Hors-ligne** : recharge en avion — l'app démarre, bibliothèque interactive | ✅ |
| iPhone (UA Safari, 390×844) : bouton visible d'emblée, icône seule ≤ 720 px | ✅ |
| iPhone : clic → toast « Partager… Sur l'écran d'accueil » | ✅ |
| Icônes : coins transparents (« any »), pleine page (masquable), trait régulier au pixel | ✅ |
| Contrôle visuel : en-tête bureau et mobile, bouton à sa place | ✅ |

## Prochaines étapes
Dans l'ordre de la feuille de route — le minuteur de veille (n° 20)
reste écarté sur décision du lecteur.
