# Nuit Calme — V2.13 (zoom ajusté + pan)

Chantier n° 6 de la feuille de route : le PDF passe aux **modes
d'ajustement** — page entière, largeur, hauteur — et la page qui
dépasse le cadre se déplace **à la main**. Le zoom existant en profite
au passage : Ctrl+molette et une position de lecture qui ne saute plus
quand on zoome.

## Nouveautés

### 1. Trois modes d'ajustement
Le popover de zoom (bouton Aa) gagne une rangée **Ajustement** :
- **Page entière** — tout est visible dans le cadre (le comportement
  historique, et le défaut) ;
- **Largeur** — la page remplit la largeur du cadre, la lecture
  défile verticalement ;
- **Hauteur** — la page remplit la hauteur, défilement horizontal.
Le mode posé remet le zoom à 100 % ; les boutons −/+ et la molette
multiplient ensuite la base du mode courant (115 % de la largeur, par
exemple). Le mode est **mémorisé par livre** dans la progression — à la
réouverture, la page se replace exactement comme vous l'aviez laissée.

### 2. Le pan : la page sous la main
Quand la page dépasse le cadre (largeur, hauteur, ou zoom avant), le
stage défile et le curseur devient **main**. Glissez n'importe où sur
une zone vide — marges, entre les lignes, image — la page suit le
geste, comme une feuille sous la paume. La molette seule défile
naturellement ; le tactile défile nativement, sans conflit.

### 3. Le texte reste roi
Un appui qui commence **sur du texte** reste une **sélection** : les
spans de la couche texte gardent la priorité (curseur texte), le pan
ne s'en mêle pas. À l'inverse, un pan qui effleure des spans ne laisse
aucune sélection traînante et ne fait pas surgir le menu Copier. Et un
pan qui finit par un relâchement **ne tourne jamais la page** — le
tourne-page des bords reste opérationnel juste après un pan.

### 4. Zoom molette et position gardée
**Ctrl+molette** zoome progressivement (0,6× à 2,2×), sans déclencher
le zoom du navigateur. Et quel que soit le geste (−/+, molette,
changement de mode, redimensionnement de fenêtre), la **fraction de
page affichée est gardée** à travers le re-rendu : zoomer ne saute ni
au début ni à la fin de la page.

## Sous le capot
- Les pages vivent dans une enveloppe `.nc-pdf-pages` à la taille de
  leur contenu, centrée par marges automatiques dans un stage
  `overflow:auto` : le centrage survit au défilement — le début d'une
  page plus grande que le cadre reste accessible (le piège classique du
  centrage flex dans un conteneur défilant).
- La couche texte passe en `user-select:none` sur le calque ; seuls les
  **spans** portent `user-select:text` : c'est ce qui sépare proprement
  « glisser sur du texte » (sélection) de « glisser ailleurs » (pan).
- Les handlers pan/molette suivent la règle de la maison : posés sur le
  stage, **remplacés à chaque ouverture** et retirés à la destruction —
  jamais d'accumulation référençant un ancien contrôleur.
- Barres de défilement fines dorées (déjà le style du défilement EPUB) ;
  aucune dépendance ajoutée, `vendor/` inchangé.

## Fichiers touchés
`js/pdf-reader.js` (modes d'ajustement, enveloppe défilante, pan,
Ctrl+molette, position gardée, garde du tourne-page, progression avec
`fit`), `js/reader.js` (popover d'ajustement, reprise du mode),
`css/style.css` (stage défilant, enveloppe, curseurs, barres),
`index.html` (méta), `README.md`.

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Ajustement par défaut « page » : tout visible, pas de curseur main | ✅ |
| Largeur : la page remplit la largeur utile (au pixel), débordement verticale, zoom remis à 100 % | ✅ |
| Hauteur : la page remplit la hauteur utile | ✅ |
| Retour « page entière » : overflow évacuée | ✅ |
| Pan : le glissement fait défiler la page (160 px) | ✅ |
| Le relâchement du pan ne tourne pas la page | ✅ |
| Clic net au bord droit après un pan : tourne-page conservé | ✅ |
| Clic net au bord droit : tourne-page conservé (mode page) | ✅ |
| Ctrl+molette : zoom avant appliqué | ✅ |
| Zoom : la fraction de page affichée est gardée (testée en bas de page) | ✅ |
| Glisser sur le texte : pas de pan | ✅ |
| Glisser sur le texte : la sélection et son menu fonctionnent | ✅ |
| Réouverture : le mode « largeur » est restauré depuis la progression | ✅ |
| Popover : trois modes, mode courant marqué, « Page entière » appliqué | ✅ |
| Redimensionnement de fenêtre : la page suit la largeur utile | ✅ |
| Vue double : deux pages rendues, sans erreur | ✅ |
| Régressions V2.12 : suivi de lecture actif | ✅ |
| Régression : EPUB intact | ✅ |
| Journal d'erreurs runtime + console | ✅ vides |

## Prochaines étapes
N° 7 — vignettes de navigation. N° 10 — export des citations.
