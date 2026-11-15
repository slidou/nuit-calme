# Nuit Calme — V2.3 (mode concentration)

Fonctionnalité 5 de la Phase 2 « liseuse premium », construite sur la V2.2
(thèmes + préférences). Tout le reste est inchangé.

## Nouveautés

### 1. Mode concentration — lecture épurée
Un clic sur la nouvelle icône (cible) de la barre d'outils, ou la touche
**F**, bascule le lecteur en mode concentration :
- la barre d'outils du haut, la barre de progression du bas et les deux
  flèches latérales **disparaissent** ;
- passé en `position:absolute`, ce chrome ne réapparaît que lorsque la
  souris **effleure le haut ou le bas de l'écran** (il se referme dès que
  la souris revient sur la page) ;
- la page de lecture occupe alors **tout l'écran** : le cadre du livre
  grandit réellement (533 px contre 430 px en vue normale à 1280×577).

Sortie : même bouton (dont l'infobulle devient « Quitter le mode
concentration »), touche **F** ou **Échap**. La touche F reste inerte
quand on tape dans un champ (recherche, etc.).

### 2. EPUB : le « spot » de lecture
Dans le livre lui-même, tout le texte s'atténue (opacité 15 %) et **seul
le paragraphe sous la souris reste pleinement lisible** :
- mise en œuvre sans dépendance : une feuille de style **toujours
  injectée mais inerte** dans chaque iframe (`nuit-calme-focus`), qui ne
  s'active qu'avec la classe `nc-focus` posée sur `<html>` ;
- un suivi de souris minimal allume le bloc survolé (`p, li, titres,
  citations, cellules…`) et **rétablit ses ancêtres de mise en page** sans
  révéler pour autant leurs autres descendants ;
- fonctionne en **vue simple comme en vue double** (chaque iframe est
  câblée à sa création via le hook de contenu epub.js, y compris les
  sections rendues pendant que le mode est actif) ;
- quand la souris quitte la page, le spot s'éteint — double filet :
  `mouseout` du document interne **et** `mouseleave` sur l'élément iframe
  (plus fiable quand le pointeur saute d'un coup).
Le PDF, rendu en canvas, bénéficie du masquage d'interface (un « spot »
paragraphe n'y a pas de sens) ; sa page reste entière et lisible.

### 3. Préférence mémorisée
- Réglage global `focusMode` (magasin `settings` d'IndexedDB), persisté à
  chaque bascule.
- À l'ouverture d'un livre, le mode est **restauré silencieusement** (pas
  de toast inutile) ; en quittant le lecteur, l'affichage revient à la
  normale sans effacer la préférence.

## Petit incident corrigé au passage
La première mouture posait `position:relative` sur `#view-reader` — ce qui
**écrasait son `position:fixed` (inset:0)** : la vue s'effondrait à 44 px,
epub.js redimensionnait l'iframe à 0 et la page devenait invisible. Corrigé
en laissant le `fixed` existant servir de bloc englobant aux barres
absolues (documenté dans le CSS pour ne pas retomber dedans).

## Fichiers touchés
`index.html` (bouton cible), `css/style.css` (bloc « Mode concentration » :
barres absolues, transitions, reveal), `js/reader.js` (applyFocus /
toggleFocus, restauration à l'ouverture, remise à zéro à la fermeture,
clavier F/Échap, reveal aux bords), `js/epub-reader.js` (CSS du spot,
`wireFocusSpot`, `ctl.setFocus`, hook de contenu).

## Tests exécutés (Chromium headless, serveur local)

| Test | Résultat |
| --- | --- |
| Bouton → mode actif (`data-focus="on"`, bouton surligné, barres opacité 0) | ✅ |
| Feuille du spot injectée + classe `nc-focus` dans l'iframe | ✅ |
| Souris réelle sur un paragraphe → opacité 1, autres paragraphes atténués | ✅ |
| Souris quitte la page → spot éteint | ✅ |
| Souris au bord haut → barres révélées puis refermées | ✅ |
| Échap → retour complet à la normale (barres statiques, cadre restauré) | ✅ |
| Persistance : F → rechargement → réouverture → mode restauré sans action | ✅ |
| Vue double : page droite éclairée (2ᵉ iframe) — vérifié par capture | ✅ |
| PDF : barres masquées, page rendue, cadre agrandi, Échap OK | ✅ |
| F pendant la saisie dans la recherche → ne bascule pas | ✅ |
| Retour bibliothèque : 2 livres intacts, aucune régression | ✅ |
| Journal d'erreurs runtime | ✅ vide |

## Prochaines étapes possibles (Phase 2)
N° 7 signets EPUB+PDF · N° 8 soulignages multicolores · N° 2 typographie
avancée (polices, interlignage — le module `prefs` est prêt) ·
N° 3 défilement vertical · bloc PDF N° 12-13.
