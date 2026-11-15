# Nuit Calme — V2.6 (défilement vertical)

Fonctionnalité 3 de la Phase 2 « liseuse premium », construite sur la V2.5
(notes personnelles). Tout le reste est inchangé.

## Nouveautés

### 1. Un second mode de lecture : défilement vertical
Nouveau bouton dans la barre du lecteur (flèches ↑↓ à côté de la vue
double) : bascule entre **Pages** (comme un livre, comportement historique)
et **Défilement** — le chapitre devient une colonne continue que l'on fait
glisser à la molette, comme une page web. Le réglage est global et
mémorisé d'une session à l'autre (réglage `flow`).

### 2. Enchaînement naturel entre chapitres
En bas d'un chapitre, continuer de défiler charge le chapitre suivant ;
en haut, remonter ramène au précédent — et l'on arrive **en bas** de ce
chapitre (continuité de lecture), pas sous son titre. Un anti-rebond de
900 ms évite les sauts en rafale pendant le chargement. Technique : la
molette ne remonte jamais du livre vers la page, la détection des
extrémités vit donc *dans* chaque iframe (même mécanique que le
tourne-page au bord).

### 3. Clavier adapté au défilement
**↓ / Page↓ / Espace** font défiler d'un écran (~85 % du cadre) et passent
au chapitre suivant en bas de page ; **↑ / Page↑** font l'inverse ;
**→ / ←** sautent de chapitre en chapitre. En mode pages, les raccourcis
historiques sont strictement inchangés (↓/↑ n'y font rien, comme avant).

### 4. Ce qui s'adapte, ce qui s'éteint
- **Vue double** : sans objet en défilement — le bouton s'éteint
  (grisé) et la colonne vertébrale disparaît ; elle revient en mode pages.
- **Tourne-page théâtral** : pas d'animation de feuille en défilement ;
  le changement de chapitre suit le geste, sans théâtre.
- **Affichage « page N du chapitre »** : ce compteur n'a pas de sens dans
  une colonne continue — il n'est affiché qu'en mode pages. Le pourcentage
  global, lui, se met à jour **en direct pendant le défilement**
  (epub.js recalcule la position au scroll).
- **Tranches de pages** du cadre : masquées en défilement (rien n'est
  « tourné ») ; une barre de défilement discrète couleur or les remplace.
- **Bouton masqué pour les PDF** : le défilement vertical est une
  spécificité EPUB (le PDF garde ses pages et son zoom).

### 5. Tout le reste fonctionne dans les deux modes
Soulignages multicolores (n°8), notes personnelles (n°9), sommaire,
recherche, « Aller au passage », mode concentration (n°5), capture PNG,
barre de progression : testés en mode défilement. Les calques de
soulignement sont ré-ancrés à chaque image de défilement (rAF) — vérifié
au pixel : écart de **0 px** entre le trait et le texte avec 380 px de
défilement. La bascule pages ⇄ défilement recrée le rendu **à la position
exacte** où l'on se trouvait, annotations comprises.

## Fichiers touchés
`js/epub-reader.js` (`ctl.flow`, `setFlow()`, `gotoSection()`,
`scrollPage()`, `wireWheelNav()`, `anchorOverlays()`, options de
`renderTo`), `js/reader.js` (réglage `flow`, bouton, UI d'état, clavier,
pas d'animation de feuille en défilement), `index.html` (bouton
`#btn-flow`, meta description), `css/style.css` (barre de défilement
discrète, tranches masquées, bouton désactivé).

## Détail d'implémentation
epub.js est configuré en `flow: 'scrolled-doc'` : chaque section est
rendue dans une iframe étendue à la hauteur de son contenu, le conteneur
`.epub-container` défile verticalement (axe « vertical » géré par la lib).
`next()`/`prev()` de la lib y sautent de section ; nous les remplaçons par
un ciblage déterministe de la section voisine (`gotoSection`) — après
constat que `spineItem.index` est **0-based** dans la version embarquée
(le premier calcul restait sur place : corrigé et testé).

## Tests exécutés (Chromium headless, serveur local)

| Test | Résultat |
| --- | --- |
| État initial : mode pages, bouton visible et inactif | ✅ |
| Bascule → défilement : `flow: 'scrolled'`, iframe étendue (807 px au ch. 3) | ✅ |
| Conteneur scrollable (course 377 px) + barre discrète | ✅ |
| **PageDown** : défilement ~85 %, progression live 67 → 83 % | ✅ |
| PageDown au ras du bas → chapitre suivant | ✅ |
| Molette en bas de section → chapitre suivant | ✅ |
| Molette en haut → chapitre précédent, **arrivée en bas** de celui-ci | ✅ |
| Sélection réelle à la souris + soulignement rose en mode défilement | ✅ |
| Alignement calque/texte après 380 px de scroll : **écart 0 px** | ✅ |
| Note (n°9) en mode défilement : trait bleu, deux styles rendus | ✅ |
| Bascule retour pages : annotations intactes, vue double réactivée | ✅ |
| « Aller au passage » (CFI) en défilement : bonne section, texte visible | ✅ |
| Rechargement : mode défilement restauré + annotations redessinées | ✅ |
| Mode concentration en défilement : classe `nc-focus` posée/retirée | ✅ |
| Barre de progression : saut à 50 % → bon chapitre | ✅ |
| Capture PNG en mode défilement : PNG de 73 Ko (non vide) | ✅ |
| PDF : bouton défilement masqué, lecteur inchangé | ✅ |
| Vue double : bouton inopérant (désactivé) en défilement | ✅ |
| Nav ⟨⟩ en défilement : saut de section, sans animation de feuille | ✅ |
| Journal d'erreurs runtime | ✅ vide |

## Prochaines étapes possibles (Phase 2)
N° 7 signets EPUB+PDF · N° 2 typographie avancée (module `prefs` prêt) ·
N° 10 catégories + recherche dans les annotations (notes et couleurs posent
la base des filtres) · N° 11 export de citations (les notes ont leur place
naturelle dans l'export) · bloc PDF N° 12-13.
