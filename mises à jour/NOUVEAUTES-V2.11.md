# Nuit Calme — V2.11 (surlignage PDF persistant)

Chantier n° 5 de la feuille de route, le plus attendu : les
soulignages multicolores arrivent dans les PDF. La brique de fondation
posée en V2.9 (couche texte) trouve enfin son toit — la sélection de
toutes les pages peut désormais être marquée, retrouvée, recolorée,
catégorisée et supprimée, exactement comme dans les EPUB.

## Nouveautés

### 1. Souligner un passage de PDF
Sélectionnez du texte : le menu de sélection propose désormais les
**cinq teintes** (or, rose, vert, bleu, violet) et « Souligner » en
plus de « Copier ». Un clic pose un voile translucide sur chaque ligne
sélectionnée — le même voile que dans les EPUB. « Souligner » réutilise
la dernière couleur employée (réglage partagé avec l'EPUB). Une
sélection à cheval sur deux pages (vue double) crée deux surlignages,
chacun ancré à sa page.

### 2. Un voile qui suit la mise en page
Les rectangles du surlignage sont stockés en **fractions de la page**
(0 à 1) et dessinés dans un calque SVG en pourcentages : zoom, vue
double, redimensionnement, re-rendu — le voile reste collé au texte
sans aucun recalcul. Le calque est recréé à chaque rendu de la page,
comme la couche texte, et ne gêne ni la sélection ni la copie.

### 3. Le tiroir Soulignages & notes sert les PDF
Le bouton stylo, jusque-là réservé à l'EPUB, liste désormais les
soulignages des PDF : citation, date, **recoloriage** par pastille,
**catégorie** (Idée, Citation, Question, À retenir — avec la recherche
et les filtres du tiroir), **Aller au passage** (retour à la page
exacte) et **Supprimer**. Les notes rédigées restent une affaire
d'EPUB pour l'instant — le bouton « Note » du menu de sélection reste
masqué en PDF.

### 4. Thèmes : le voile vit dans la page
Comme la sélection de texte, le calque de surlignage vit dans
l'enveloppeur de page : les filtres nuit / OLED / sépia s'appliquent
au voile comme au reste — pas de tache fluo qui resterait claire dans
un livre sombre.

## Sous le capot
- Même magasin « annotations » que l'EPUB : les enregistrements PDF
  portent `type:'pdf'`, le numéro de page, la couleur, le texte cité
  et leurs rectangles. Aucun changement de schéma, la base reste en
  v5.
- La sélection est **figée au moment où le popup s'affiche** : en PDF,
  la sélection vit dans le document principal, et cliquer une pastille
  l'effondre avant le clic — impossible de la relire après coup. Le
  texte cité réutilise le reconstructeur de la copie (n°4), découpé
  par page.
- Suppression en cascade inchangée : supprimer un livre emporte ses
  soulignages PDF comme les autres annotations.
- Aucune dépendance ajoutée ; `vendor/` inchangé.

## Fichiers touchés
`js/pdf-reader.js` (découpe de sélection par page, calque SVG,
addHighlight / removeHighlight / recolorHighlight / catégories /
gotoAnnotation, refactor du reconstructeur de texte),
`js/reader.js` (tiroir ouvert aux PDF, « Aller au passage » générique,
popup PDF avec pastilles), `css/style.css` (`.nc-pdf-hl`, copy-only
réduit à « Note »), `index.html` (méta), `README.md`.

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Sélection PDF → menu complet (pastilles visibles, Souligner, Copier ; Note cachée) | ✅ |
| Pastille → voile SVG posé, annotation en base (page, couleur, texte, fractions 0..1) | ✅ |
| Zoom ×1,25 : le voile suit, position relative identique au pixel près | ✅ |
| Tourne-page et retour : voiles redessinés à l'identique | ✅ |
| Vue double : voiles sur les deux pages ; sélection inter-pages → 2 annotations | ✅ |
| Tiroir : citations listées, recoloriage (SVG + base), catégorie posée | ✅ |
| Tiroir : « Aller au passage » → bonne page ; suppression → voile retiré | ✅ |
| Persistance : voiles redessinés seuls après rechargement | ✅ |
| Copie (Ctrl+C) inchangée ; tourne-page au bord inchangé | ✅ |
| EPUB : pose d'un surlignage via le popup toujours fonctionnelle | ✅ |
| Régressions v2.9 + v2.10 rejouées (couche texte, signets, historique) | ✅ |
| Journal d'erreurs runtime + console | ✅ vides |

## Prochaines étapes
N° 6 — zoom ajuster largeur/hauteur + pan. N° 7 — vignettes de
navigation. N° 10 — export des citations (les surlignages PDF entrent
alors dans l'export, même magasin).
