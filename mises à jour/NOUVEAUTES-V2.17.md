# Nuit Calme — V2.17 (tactile sur le téléphone)

Chantier n° 14 de la feuille de route : **le lecteur à la main**, sur
un téléphone. Balayer pour tourner la page, toucher les bords pour
naviguer, pincer pour zoomer — la liseuse se lit maintenant aux
doigts, sans rien changer pour ceux qui la lisent à la souris ou au
clavier.

## Nouveautés

### 1. Le balayage — tourner la page d'un geste
Un glissement horizontal net (au moins 56 px, plus horizontal que
vertical, moins d'une seconde) tourne la page, avec le tourne-page
théâtral habituel :
- balayage **vers la gauche** → page suivante ; **vers la droite** →
  page précédente — dans les deux formats, en vue simple ;
- en **défilement vertical** (EPUB), le geste vertical reste
  entièrement natif : seul le balayage horizontal saute de section ;
- dans un **PDF zoomé** qui dépasse le cadre, le balayage horizontal
  fait défiler la page (pan) au lieu de tourner — tourner, c'est pour
  quand la page tient dans la largeur.

### 2. Les zones de tap — bords pour les pages, centre pour les barres
Un tap court (moins de 350 ms, moins de 12 px) répartit l'écran en
trois tiers :
- **tiers gauche / droit** → page précédente / suivante (plus
  généreux que les bords cliquables d'aujourd'hui : un tiers chacun) ;
- **tiers central** → **mode immersion** : les barres du haut et du
  bas et les boutons latéraux s'effacent, la page occupe tout
  l'écran ; un second tap au centre les ramène. Un geste, pas un
  réglage : rien n'est mémorisé, l'ouverture d'un tiroir ou le retour
  à la bibliothèque remettent les barres en place.
Un tap sur un bouton, un lien ou un média reste ce qu'il est ; un tap
qui replie une sélection ne tourne pas la page ; un appui long (pour
sélectionner du texte) et un glissement vertical ne déclenchent rien.

### 3. Le pinch — zoom PDF, taille du texte EPUB
Deux doigts qui s'écartent ou se rapprochent :
- **PDF** : le zoom suit le geste **avec aperçu immédiat** — un simple
  scale CSS posé au point de pincement (le point sous les doigts ne
  bouge pas) — puis, au relâchement, les pages sont rendues à la
  vraie échelle, la position de lecture gardée. Bornes : 60 % à
  220 %, comme les boutons +/− et Ctrl+molette ;
- **EPUB** : le pincement règle la **taille du texte** (80 à 170 %,
  sur des crans de 5 %), annoncée d'un toast discret. Comme sur une
  vraie liseuse.
Le navigateur, lui, ne pince plus la page : le geste est capté sur la
zone de lecture (`touch-action` posé, `gesturestart` bloqué en filet
sur iOS), et uniquement là — en dehors du livre, le zoom du
navigateur reste disponible.

## Sous le capot
- Nouveau module `js/touch.js` (`NC.touch`) : une grammaire de geste
  (tap, balayage, pinch) et deux terrains — le document principal
  (#stage : PDF entier + marges EPUB) et **l'intérieur de chaque
  iframe EPUB** (un toucher sur le papier ne remonte jamais au
  document parent), câblé depuis le hook content d'epub-reader.js.
- Les tiers de tap EPUB se mesurent sur la partie **visible** du
  papier (intersection iframe × #epub-host) : epub.js rend une iframe
  plus large que le cadre (deux colonnes, une seule à l'écran), une
  zone calculée sur la largeur interne aurait été fausse d'un cran.
- Le pinch s'achève au **premier doigt levé** : les doigts se posent
  et se lèvent presque toujours l'un après l'autre, un commit attendu
  « à la dernière touche » ne serait jamais déclenché ; le doigt
  restant est ignoré jusqu'au bout.
- `NC.reader.toggleChrome` / `showChrome` : la bascule d'immersion
  réutilise la mécanique du mode concentration (barres en absolu) et
  re-taille le livre après la transition (rendition EPUB re-fluée,
  PDF re-rendu, position gardée).
- Le tactile s'ajoute aux chemins existants sans les remplacer : clic
  des bords (#book-frame, #pdf-stage, iframes), boutons ⟨ ⟩, clavier,
  molette — tout est intact. Un tap intercepté fait `preventDefault`
  sur le touchend : jamais de « clic fantôme » qui doublerait un
  tourne-page.
- Détails de confort : plus d'élastique ni de « tirez pour
  rafraîchir » pendant la lecture (`overscroll-behavior`), plus de
  halo gris sous les doigts, double-tap neutralisé sur la zone de
  lecture.
- Aucune dépendance ajoutée ; `vendor/` inchangé.

## Fichiers touchés
`js/touch.js` (nouveau — grammaire de gestes, zones de tap visibles,
pinch avec aperçu PDF), `js/reader.js` (mode immersion toggleChrome /
showChrome, init tactile, remise à zéro à la fermeture),
`js/epub-reader.js` (branchement wireContent dans le hook content),
`index.html` (script touch.js), `css/style.css` (immersion
data-chrome, touch-action, overscroll, tap-highlight), `README.md`
(caractéristique).

## Tests exécutés (Chromium headless, gestes tactiles réels via CDP, viewport téléphone 390 × 844)

| Test | Résultat |
| --- | --- |
| EPUB — swipe gauche → page suivante, swipe droit → retour | ✅ |
| EPUB — tap tiers droit → suivante, tiers gauche → précédente, barres intactes | ✅ |
| EPUB — tap central : barres et boutons effacés (opacité 0) puis restaurés | ✅ |
| EPUB — appui long et glissement vertical : aucune action | ✅ |
| EPUB — pinch : texte 100 → 80 % puis borné à 170 % | ✅ |
| PDF — swipe gauche → page 2, taps droite/gauche, swipe droit → page 1 | ✅ |
| PDF — pinch : zoom 1 → 0,6 (borne basse) puis 2,2 (borne haute) | ✅ |
| PDF zoomé — le swipe pane au lieu de tourner (page inchangée) | ✅ |
| PDF — tap central : immersion et retour | ✅ |
| Tiroir sommaire : s'ouvre au clic, remet les barres si masquées | ✅ |
| Souris : clic bord droit tourne la page, clic centre ne masque rien | ✅ |
| Clavier : flèches inchangées | ✅ |
| Aucune exception de page (session tactile et desktop), `__ncErrors` vide | ✅ |

**33/33 vérifications vertes** (suite `scripts/test-v2.17.js`), plus
contrôle visuel : page re-composée plein écran en immersion, aperçu
de pinch PDF au point de pincement.

## Prochaines étapes
Vignettes de navigation, export des citations — dans l'ordre de la
feuille de route.
