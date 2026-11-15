# Nuit Calme — V2.19 (raccourcis clavier étendus + mémo)

Chantier n° 19 de la feuille de route : **garder la main sur le
clavier**. Les flèches et la touche B existaient déjà ; désormais,
tout ce que la barre du haut sait faire se commande au clavier — et
un petit mémo rappelle tout cela en permanence, sans quitter le
livre.

## Nouveautés

### 1. Des lettres pour tout faire
Chaque outil de la barre du haut a sa touche, pensée en français :
- **Tiroirs** — `T` Sommaire & signets, `R` Recherche, `N`
  Soulignages & notes, `H` Passages, `S` Statistiques. Ce sont les
  mêmes bascules que les boutons : re-appuyer referme.
- **Affichage** — `M` double page / simple page, `V` défilement
  vertical / pages, `J` thème suivant (papier → sépia → nuit →
  OLED, dans l'ordre du popover), `A` typographie, `F` mode
  concentration, `I` immersion (barres masquées).
- **Outils** — `P` plein écran, `C` capture de la page (PNG),
  `B` signet, `Début` / `Fin` sautent au début et à la fin du
  livre. `Échap` referme le panneau ouvert, comme avant.
- Les flèches, Espace, Page↑/Page↓ gardent leur rôle d'origine ;
  en défilement vertical, ↑/↓ avancent d'un écran.

### 2. Le mémo, toujours sous la main
« ? » ou le **bouton clavier** en bout de barre du haut ouvre un
panneau qui liste tous les raccourcis, groupés par usage (Lecture,
Panneaux, Affichage, Outils) :
- deux colonnes sur un écran large, une seule colonne et
  défilement sur un téléphone ;
- `Échap` le referme, `?` aussi ; tant qu'il est affiché, aucune
  autre touche n'agit derrière lui (panneau modal) ;
- il ne touche ni au contrôleur ni aux réglages : il s'ouvre même
  pendant qu'un livre charge.

### 3. Des garde-fous pour ne rien casser
- **Aucune lettre ne réagit avec Ctrl/Cmd/Alt** : Ctrl+S, Cmd+P,
  Alt+… restent des raccourcis du navigateur.
- **Dans un champ de saisie**, les lettres gardent leur rôle
  normal (chercher, rédiger une note) — pas de tiroir surprise.
- `M` respecte l'état du bouton : inerte en défilement vertical ;
  `V` reste sans effet sur un PDF — exactement comme les clics.
- Au passage, une solidité gagnée : les recréations de rendu EPUB
  sont désormais **sérialisées** — basculer deux fois très vite le
  défilement vertical (V-V pressés de suite, ou deux clics rapides)
  ne fait plus émettre à epub.js d'exception interne (« reading
  'package' ») ; un affichage se dénoue toujours avant que le
  suivant ne détruise sa rendition.

## Sous le capot
- `reader.js` : le gestionnaire clavier est étendu — une carte
  touche→tiroir pour T/R/N/H/S, les actions d'affichage, Début/Fin
  via `seekTo(0/1)`, `?` pour le mémo ; le garde modificateurs est
  placé après les branchements Échap / « ? » / champ de saisie.
  Panneau `#kbd-pop` (ouvert, fermé, bascule) ; `cycleTheme()`
  fait tourner les thèmes dans l'ordre du popover, repli papier si
  le thème courant a disparu ; le bouton clavier rejoint la liste
  des outils qui rendent le focus au document.
- `epub-reader.js` : `createRendition()` passe par une file de
  promesses (`renditionChain`) — plus de destruction d'une
  rendition pendant que son `display()` est en vol ; les appels
  restés en file après une fermeture de livre s'effacent d'eux-mêmes.
- `index.html` : le bouton clavier en fin de barre, le panneau
  mémo, la description mise à jour.
- `css/style.css` : styles du mémo (carte centrée, touches en
  `kbd`, deux colonnes au-delà de 640 px) et animation dédiée
  `popInKbd` — l'ancienne `popInC` écrasait le centrage vertical
  du panneau.

## Fichiers touchés
`js/reader.js` (raccourcis étendus, mémo, cycle de thème),
`js/epub-reader.js` (file de rendu sérialisée), `index.html`
(bouton, panneau, description), `css/style.css` (mémo),
`README.md` (caractéristique).

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| « ? » ouvre le mémo ; Échap et « ? » le referment | ✅ |
| Mémo : 4 sections, 20 raccourcis listés, la touche B y figure | ✅ |
| Le bouton clavier de la barre ouvre le même mémo | ✅ |
| Mémo ouvert : B n'agit pas derrière le panneau | ✅ |
| T R N H S ouvrent puis referment les cinq tiroirs | ✅ |
| B pose puis retire un signet | ✅ |
| F bascule le mode concentration ; I l'immersion | ✅ |
| M bascule la vue double/simple et revient à l'état initial | ✅ |
| V sur un PDF : sans effet ni erreur | ✅ |
| J fait tourner les thèmes (sépia, nuit, OLED, papier) | ✅ |
| A ouvre puis referme la typographie | ✅ |
| C lance la capture (téléchargement PNG) | ✅ |
| P (plein écran) sans exception | ✅ |
| Fin → dernière page ; Début → page 1 | ✅ |
| Ctrl+S / Ctrl+F : rien (raccourcis navigateur préservés) | ✅ |
| Une lettre dans un champ ne referme pas le tiroir | ✅ |
| → / ← tournent les pages | ✅ |
| EPUB : V défilement/pages, T sommaire | ✅ |
| Aucune exception de page sur toute la session | ✅ |

**47/47 vérifications vertes** (suite `scripts/test-v2.19.js`), plus
régressions rejouées : **21/21** (V2.18 vignettes) et **33/33**
(V2.17 tactile). Contrôle visuel : mémo centré, deux colonnes,
lisible en mode nuit comme sur un écran étroit (une colonne).

## Prochaines étapes
Export des citations — dans l'ordre de la feuille de route.
