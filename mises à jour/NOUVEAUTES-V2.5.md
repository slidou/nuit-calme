# Nuit Calme — V2.5 (notes personnelles)

Fonctionnalité 9 de la Phase 2 « liseuse premium », construite sur la V2.4
(soulignages multicolores). Tout le reste est inchangé.

## Nouveautés

### 1. Joindre une note rédigée à un passage
Le menu de sélection gagne un bouton **« Note »** (icône bulle) à côté de
« Souligner » et « Copier ». Un clic ouvre un **éditeur centré** : citation
du passage sélectionné en exergue, zone de saisie multi-lignes (4 000
caractères max), boutons Annuler / Enregistrer. Raccourcis : **Ctrl+Entrée**
(enregistrer — y compris quand la saisie a le focus) et **Échap** (annuler,
sans rien écrire).

### 2. Le passage est repéré « au crayon » dans le livre
Dans l'EPUB, une note se dessine en **trait net sous la ligne** (3–4 px,
opacité 0,8) et non en voile translucide : on distingue d'un coup d'œil un
passage *surligné* d'un passage *noté*. Couleur par défaut des notes :
**bleu** (`NC.NOTE_DEFAULT`), recoloriable comme un surlignage via les
mêmes pastilles (n°8).

### 3. Données : même magasin, nouveau champ
Une note est une annotation `kind:'note'` du magasin `annotations` : elle
porte le passage cité (`text`), la note rédigée (`note`), la couleur, les
repères de repositionnement (sectionIndex + décalages) et un CFI. Les
annotations anciennes — sans `kind` — restent des surlignages
(`NC.isNote()` fait le tri). La modification d'une note pose `updatedAt`.

### 4. La localisation est capturée AVANT la rédaction
À l'ouverture de l'éditeur, le passage est déjà verrouillé
(`ctl.captureSelection()`, extrait du code du surlignage) : fermer le
popup, tourner une page ou sélectionner ailleurs pendant la rédaction ne
peut plus perdre l'endroit. La sauvegarde redessine uniquement la section
concernée.

### 5. Tiroir « Soulignages & notes »
Le tiroir des soulignages devient le registre des deux types : compteur
d'en-tête (« 1 soulignage · 1 note »), badge **Note**, texte rédigé mis en
avant sous la citation, et un bouton **Modifier** qui réouvre l'éditeur
avec le texte existant. « Aller au passage », « Supprimer » et le
recoloriage fonctionnent pour les deux types.

## Fichiers touchés
`js/util.js` (`NC.NOTE_DEFAULT`, `NC.isNote()`), `index.html` (bouton Note,
éditeur `#note-pop`, intitulé du tiroir, meta description),
`js/epub-reader.js` (`captureSelection()`, `addNote()`, `updateNote()`,
`drawRange(…, underline)`, refonte de `addHighlight()` sur le même socle),
`js/reader.js` (éditeur + raccourcis clavier, garde anti-réentrance,
tiroir enrichi), `css/style.css` (éditeur centré, badge, corps de note,
compteur).

## Défauts corrigés au passage
- **Doublon de sauvegarde** : Ctrl+Entrée est vu par deux gestionnaires
  (textarea + document, par propagation). Le premier `saveNote()` se
  suspend sur son `await` avec l'éditeur encore ouvert ; le second
  relançait la sauvegarde → deux notes identiques en base. Corrigé par un
  garde anti-réentrance (`noteSaving`).
- **Échap** : la gestion générale d'Échap passait avant celle de
  l'éditeur ; l'ordre est inversé (Échap ferme d'abord l'éditeur s'il est
  ouvert).

## Tests exécutés (Chromium headless, serveur local)

| Test | Résultat |
| --- | --- |
| Bouton « Note » présent dans le menu de sélection | ✅ |
| Éditeur ouvert : citation du passage, focus dans la zone, popup fermé | ✅ |
| Saisie réelle au clavier + **Ctrl+Entrée** → note en base (`kind:'note'`) | ✅ |
| **Une seule** annotation créée (après correctif anti-réentrance) | ✅ |
| Rendu : trait bleu sous la ligne (SVG `#7fa3d1`, opacité 0,8, hauteur 3,2 px) | ✅ |
| Tiroir : compteur « 0 soulignage · 1 note », badge, texte rédigé, 5 pastilles | ✅ |
| **Modifier** : réouverture avec texte existant, réécriture, `updatedAt` posé | ✅ |
| Recoloriage d'une note rose depuis le tiroir : base + SVG + pastille courante | ✅ |
| **Échap** : annulation, rien n'est enregistré | ✅ |
| Note vide : toast d'erreur, l'éditeur reste ouvert | ✅ |
| Régression surlignage : voile vert pleine ligne (opacité 0,35) intact | ✅ |
| Rechargement + réouverture : note et surlignage restaurés, rendus corrects | ✅ |
| Suppression des deux types, état vide du tiroir | ✅ |
| Retour bibliothèque intact · journal d'erreurs runtime | ✅ vide |

Note de test : un glisser de souris effectué alors que le tiroir était
ouvert a été absorbé par son fond (comportement voulu) → toast « Le
passage n'a pas pu être localisé », aucune donnée écrite. Fermer le tiroir
avant de sélectionner.

## Prochaines étapes possibles (Phase 2)
N° 7 signets EPUB+PDF · N° 2 typographie avancée (module `prefs` prêt) ·
N° 3 défilement vertical · N° 10 catégories + recherche dans les
annotations (notes et couleurs posent la base des filtres) · N° 11 export
de citations (les notes ont leur place naturelle dans l'export) · bloc PDF
N° 12-13.
