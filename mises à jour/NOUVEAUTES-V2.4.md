# Nuit Calme — V2.4 (soulignages multicolores)

Fonctionnalité 8 de la Phase 2 « liseuse premium », construite sur la V2.3
(mode concentration). Tout le reste est inchangé.

## Nouveautés

### 1. Cinq couleurs de soulignement
Palette définie en un seul endroit (`NC.HIGHLIGHT_COLORS` dans `util.js`),
posée en translucide (opacité 0,35), lisible sur les quatre thèmes
de livre (papier, sépia, nuit, OLED) :
**Or** `#d8a93f` (défaut) · **Rose** `#d9899f` · **Vert** `#8fb573` ·
**Bleu** `#7fa3d1` · **Violet** `#a98bc4`.

### 2. Menu de sélection enrichi (1 clic = souligner)
Le menu qui apparaît sur une sélection de texte gagne une **rangée de
pastilles** : un clic sur une pastille souligne immédiatement le passage
avec cette couleur. Le bouton « Souligner » porte désormais une petite
pastille : il réutilise la **dernière couleur employée**, mémorisée dans
les réglages (`lastHighlightColor`) d'une session à l'autre.

### 3. Couleur enregistrée avec l'annotation
Chaque annotation porte sa couleur (`a.color`, clé de la palette).
Aucune migration imposée : une annotation ancienne **sans couleur**
s'affiche en or — repli assuré par `NC.highlightHex()` / `NC.highlightKey()`
(toute valeur inconnue retombe sur le défaut).

### 4. Tiroir Soulignages : changer la couleur d'un passage
Chaque note du tiroir affiche la même rangée de pastilles ; la couleur
courante est cerclée d'or. Un clic **recolore le passage existant** :
cache mémoire, base IndexedDB **et** rectangles SVG déjà dessinés sont
mis à jour sans re-rendu du livre. (Suppression et « Aller au passage »
inchangés.)

## Fichiers touchés
`js/util.js` (palette + replis), `index.html` (rangée de pastilles,
regroupement des boutons, pastille du bouton Souligner),
`js/epub-reader.js` (`addHighlight(color)`, `recolorHighlight()`,
`drawRange(…, hex)`, mémorisation de la dernière couleur),
`js/reader.js` (câblage des pastilles, pastille « dernière couleur »,
recoloriage dans le tiroir), `css/style.css` (popup en colonne,
`.sel-dot`, `.note-colors`, `.color-dot`).

## Tests exécutés (Chromium headless, serveur local)

| Test | Résultat |
| --- | --- |
| 5 pastilles présentes dans le menu de sélection | ✅ |
| Sélection réelle à la souris → popup, soulignement **rose** (SVG `#d9899f`) | ✅ |
| Soulignement **vert** sur la page droite (vue double) | ✅ |
| Bouton « Souligner » → réutilise la dernière couleur (vert) | ✅ |
| 3 annotations en base avec leur couleur (`rose/vert/vert`) | ✅ |
| Recoloriage rose → bleu depuis le tiroir : base + SVG + pastille courante | ✅ |
| Rechargement + réouverture : les 3 couleurs sont restaurées | ✅ |
| Ancienne annotation sans couleur → rendue en **or** (rétrocompatibilité) | ✅ |
| Suppression de l'annotation de test, bibliothèque intacte (1 livre) | ✅ |
| Journal d'erreurs runtime | ✅ vide |

Note de débogage : une fausse alerte « annotations disparues » pendant les
tests venait d'une variable de test perdue au rechargement de la page
(`annotationsFor(undefined)` filtre tout) — la base n'a jamais été touchée.

## Prochaines étapes possibles (Phase 2)
N° 7 signets EPUB+PDF · N° 2 typographie avancée (module `prefs` prêt) ·
N° 3 défilement vertical · N° 10 catégories + recherche dans les
annotations (les couleurs posent la base naturelle des filtres) ·
bloc PDF N° 12-13.
