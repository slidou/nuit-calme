# Nuit Calme — V2.7 (typographie avancée)

Fonctionnalité 2 de la Phase 2 « liseuse premium », construite sur la V2.6
(défilement vertical). Tout le reste est inchangé.

## Nouveautés

### 1. Trois nouveaux réglages dans le pop « Aa »
Le popover de taille du texte devient un vrai panneau de typographie,
pour les EPUB :
- **Police** — quatre choix, libellés composés dans leur propre police :
  **Cormorant** Garamond (défaut, embarquée) · **Sérif classique**
  (Georgia / Times) · **Sans moderne** (Inter, embarquée) ·
  **Police du système**.
- **Interlignage** — quatre paliers nommés : **Serré** 1,45 ·
  **Confort** 1,62 (défaut) · **Aéré** 1,85 · **Grand** 2,1.
- **Alignement** — **aligné à gauche** (défaut) ou **justifié** (avec
  césures automatiques quand la langue du livre les autorise).

Chaque clic s'applique **immédiatement** dans le livre, sans re-rendu.

### 2. Mémorisé PAR LIVRE, comme le thème
Le réglage vit dans le module `prefs` (V2.2) : chaque livre garde sa
police, son interlignage et son alignement. Cascade de restauration :
préférence du livre → **dernier réglage utilisé** (global `lastTypo`) →
défaut. Un livre jamais réglé hérite du confort de la session en cours ;
un livre réglé ne bouge plus, quelles que soient les expérimentations sur
les autres.

### 3. Feuille CSS dédiée, repli garanti
La typographie est injectée dans une feuille séparée
(`nuit-calme-typo`), posée après la feuille de thème — les deux se
remplacent indépendamment, comme deux calques. Les valeurs inconnues ou
abîmées sont systématiquement ramenées à des valeurs saines
(`NC.normalizeTypo`) : une donnée ancienne ne peut pas casser l'affichage.

### 4. Les soulignements suivent le reflow
Changer de police ou d'interlignage déplace le texte : les calques de
soulignement sont redessinés après la refonte (même pattern éprouvé que
le changement de taille), et re-vérifié au pixel — le trait reste posé
sur son passage. L'alignement ne vise que les paragraphes : les poèmes et
éléments centrés par l'auteur ne sont pas déplacés.

### 5. Périmètre EPUB
Le panneau typographique n'apparaît que pour les EPUB : le PDF garde son
contrôle de zoom seul (le texte PDF est rendu en image, la police ne
s'applique pas). Tout le reste fonctionne dans les deux modes de lecture
(pages et défilement), en vue simple comme double.

## Fichiers touchés
`js/util.js` (`NC.BOOK_FONTS`, `NC.LINE_HEIGHTS`, `NC.TYPO_DEFAULT`,
`NC.normalizeTypo()`, `NC.typoCss()`, faces Inter ajoutées au CSS injecté
dans les EPUB), `js/epub-reader.js` (`ctl.typo`, feuille
`nuit-calme-typo` dans le hook, `ctl.setTypo()` + redessin des calques),
`js/reader.js` (résolution prefs → lastTypo → défaut, sections du pop,
`chooseTypo()` avec persistance par livre, marquage des pastilles),
`index.html` (titre du bouton « Aa », meta description),
`css/style.css` (`.typo-grid`, `.typo-opt` et état courant cerclé d'or).

## Tests exécutés (Chromium headless, serveur local)

| Test | Résultat |
| --- | --- |
| État initial : Cormorant, 25,92 px (= 1,62 × 16), `start` | ✅ |
| Pop « Aa » : 4 sections, 10 pastilles, valeurs courantes marquées | ✅ |
| « Sans moderne » : `font-family` Inter calculée dans l'iframe | ✅ |
| « Aéré » : interlignage 29,6 px (= 1,85 × 16) | ✅ |
| « Justifié » : `text-align: justify` + césures `auto` sur les ⟨p⟩ | ✅ |
| Persistance : `prefs.typo` + réglage global `lastTypo` en base | ✅ |
| Rechargement page + réouverture : Inter / 1,85 / justifié restaurés | ✅ |
| Isolation : livre 2 en Sérif / 1,45 / gauche, livre 1 intact | ✅ |
| Repli global : prefs.typo effacé → dernier réglage utilisé | ✅ |
| Soulignement après reflow : calque redessiné, trait collé au texte | ✅ |
| Retour aux défauts via l'UI : styles et pastilles reviennent | ✅ |
| Mode défilement : typo appliquée (Inter, 33,6 px), scroll OK | ✅ |
| PDF : pop limité au zoom, aucune pastille typo | ✅ |
| Journal d'erreurs runtime | ✅ vide |

## Prochaines étapes possibles (Phase 2)
N° 7 signets EPUB+PDF · N° 10 catégories + recherche dans les annotations
(notes et couleurs posent la base des filtres) · N° 11 export de citations
(les notes ont leur place naturelle dans l'export) · bloc PDF N° 12-13.
