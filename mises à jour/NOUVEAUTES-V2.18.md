# Nuit Calme — V2.18 (vignettes de navigation)

Chantier n° 8 de la feuille de route : **voir les pages** dans le
tiroir. Là où la grille de numéros alignait des chiffres, le tiroir
affiche maintenant les pages elles-mêmes — des miniatures rendues par
le moteur PDF, feuilletées du regard, cliquées pour s'y rendre.

## Nouveautés

### 1. Les miniatures des pages (PDF)
Le tiroir « Sommaire & signets » d'un PDF affiche une grille de
**miniatures** : chaque page est réellement dessinée (canvas à
l'échelle, netteté adaptée à l'écran), sous son numéro.
- **Un clic sur une miniature y mène** — le tiroir se referme et la
  page s'affiche.
- La **page courante** porte un liseré doré ; à l'ouverture du
  tiroir, elle est amenée au centre : le tiroir s'ouvre LÀ où l'on
  lit. Le liseré suit les tours de page en direct.
- Un **signet** posé sur une page marque sa miniature d'un point
  doré (les signets restent listés en tête de tiroir).
- Les miniatures suivent le **thème du livre** : en mode nuit ou
  OLED, le tiroir n'éblouit pas (mêmes filtres que les pages du
  lecteur) ; en sépia, même voile chaud.

### 2. Sommaire éditeur et vignettes, côte à côte
Quand le PDF fournit un sommaire (signets de l'éditeur), le tiroir
propose une **bascule** : « Sommaire » s'ouvre en premier (le travail
de l'éditeur reste la meilleure carte), « Vignettes » donne la vue
feuilleteuse. Sans sommaire, le tiroir ouvre directement les
vignettes — la vieille grille de numéros disparaît, elle n'avait
aucune grâce. Le choix retenu suit la session du livre, sans réglage
de plus.

### 3. Paresse maîtrisée
Les miniatures se dessinent **au fil du défilement** : seules les
cellules qui approchent de la zone visible (240 px de marge) demandent
leur page au worker pdf.js — ouvrir le tiroir d'un PDF de 500 pages
ne dessine que l'écran. Chaque vignette rendue est **mise en cache**
(dataURL JPEG, quelques Ko par page, cache borné à 600 pages) :
rouvrir le tiroir, poser un signet ou tourner une page ne redessine
rien. Une petite file borne les rendus simultanés à six — scroller
vite ne noie pas le worker — et tout est annulé proprement à la
fermeture du livre.

## Périmètre : le PDF, pas l'EPUB
Les vignettes sont l'affaire des **pages** — un concept que le PDF
possède et pas l'EPUB reflowable (ses « pages » se recomposent selon
l'écran, la police, la taille du texte ; il n'existe pas d'image de
page à miniaturiser). L'EPUB garde son sommaire par chapitres,
inchangé — vérifié par la suite de tests.

## Sous le capot
- `pdf-reader.js` : `ctl.renderThumbnail(page, canvas)` — rendu à la
  largeur visée (110 px CSS × densité d'écran), cache FIFO dataURL,
  file à six créneaux, tâches annulées au `destroy()`.
- `reader.js` : le tiroir PDF restructuré — `pdfTocMode` ('toc' |
  'thumbs') posé à l'ouverture selon la présence d'un sommaire,
  barre de bascule accessible (aria-pressed), grille construite par
  `renderThumbs()` avec IntersectionObserver sur le corps du tiroir,
  repli « tout dessiner » sans IntersectionObserver. Le liseré suit
  la page via `markCurrentToc()`.
- La grille de numéros (`.page-grid` / `.page-cell`) est retirée du
  DOM et du CSS — remplacée, pas doublée.
- Aucune dépendance ajoutée ; `vendor/` inchangé ; aucun changement
  côté bibliothèque ni lecteur.

## Fichiers touchés
`js/pdf-reader.js` (moteur de vignettes : rendu, cache, file,
annulation), `js/reader.js` (tiroir : bascule, grille paresseuse,
liseré vivant), `css/style.css` (grille de vignettes, placeholders,
thèmes nuit/OLED/sépia ; suppression de la grille de numéros),
`index.html` (description), `README.md` (caractéristique).

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| PDF avec sommaire : la bascule Sommaire/Vignettes apparaît, le sommaire s'ouvre d'abord | ✅ |
| Bascule « Vignettes » : grille, une cellule par page, page courante liserée | ✅ |
| Miniatures réellement peintes (canvas ≥ 100 px de large) | ✅ |
| Toutes les pages peintes quand la grille tient à l'écran | ✅ |
| Clic sur une vignette → saut à la page, tiroir refermé | ✅ |
| Réouverture : liseré à jour et page courante visible (centrée) | ✅ |
| Signet posé → point doré sur la bonne miniature | ✅ |
| Bascule retour « Sommaire » : la liste des sections revient | ✅ |
| Mode nuit : filtre d'inversion appliqué aux miniatures | ✅ |
| EPUB : chapitres seuls, ni grille ni bascule | ✅ |
| Aucune exception de page sur toute la session | ✅ |

**21/21 vérifications vertes** (suite `scripts/test-v2.18.js`), plus
contrôle visuel : tiroir doré et lisible, miniatures fidèles, liseré
sur la page 2.

## Prochaines étapes
Export des citations — dans l'ordre de la feuille de route.
