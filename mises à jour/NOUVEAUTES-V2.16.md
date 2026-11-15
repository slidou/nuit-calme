# Nuit Calme — V2.16 (recherche & tri de la bibliothèque)

Chantier n° 12 de la feuille de route : **retrouver un livre**. Une
frappe pour l'isoler, une liste pour choisir l'ordre — la bibliothèque
devient navigable quand elle grandit, sans rien changer à ce qui
existait : le tri par défaut EST l'ordre d'aujourd'hui.

## Nouveautés

### 1. La recherche — titre et auteur, sans se soucier des accents
Une barre « Rechercher un titre ou un auteur… » au-dessus des filtres.
- Le texte tapé est comparé au **titre ET à l'auteur**, plié : la casse
  et les accents sont ignorés des deux côtés (« écla » trouve
  « Éclats d'ambre », « ECLAT » aussi).
- La recherche **affine tout** : la grille, le pied de page (« 2 sur
  5 livres ») et les compteurs des puces — chaque puce continue
  d'afficher ce que l'on verrait en la cliquant, recherche comprise.
- Aucun résultat → le bloc « Aucun livre ne correspond à… » cite la
  requête (« …ne correspond à « zzzz » ») ; « Réinitialiser les
  filtres » remet filtres ET recherche à zéro.
- **Échap** dans le champ la vide d'un geste.
- Une courte temporisation (140 ms) évite de re-rendre la grille à
  chaque lettre d'une frappe rapide.

### 2. Le tri — quatre clés, un sens à retourner
À côté de la recherche, une liste et un bouton de sens :
- **Dernière lecture** (défaut — l'ordre historique de la
  bibliothèque, inchangé) ;
- **Ajout** ;
- **Titre** ;
- **Auteur**.
Le bouton de sens se relibelle pour ne jamais deviner : « Récent
d'abord » / « Ancien d'abord » pour les dates, « A → Z » / « Z → A »
pour les textes. Choisir une clé remet son sens naturel (A → Z,
récent d'abord) ; le bouton inverse ensuite.

Détails qui comptent :
- les comparaisons de textes se font en français, **sur la base**
  (É == e) et avec les nombres dans l'ordre (tome 2 avant tome 10) ;
- « Dernière lecture » retombe sur la date d'ajout pour les livres
  jamais ouverts (ils ne s'empilent pas sur 1970) ;
- un livre **sans auteur** passe après les autres en ordre croissant
  (et premier en décroissant), au lieu de se perdre au milieu des « A » ;
- le tri ne change que l'affichage : la grille se re-trie sur une
  copie, le tableau des livres garde son ordre de base.

### 3. Mémorisé, mais avec mesure
La clé et le sens du tri survivent au rechargement (localStorage,
même contrat que les filtres V2.14 — toute valeur inconnue retombe
sur le défaut). La **recherche**, elle, n'est pas mémorisée : c'est
un geste de consultation, pas un état qu'on garde ouvert. Tant que
la bibliothèque est vide, la barre entière reste masquée — rien à
chercher ni trier.

## Sous le capot
- `visibleBooks()` devient le passage unique : recherche PUIS filtres
  (statut ET groupe), puis le tri courant ; `facetCounts()` intègre
  la requête dans ses deux prédicats (compteurs à facettes honnêtes).
- `compareBooks()` — un comparateur, quatre clés, un sens ; le tri de
  base de `refresh()` est conservé comme départage stable à égalité.
- `NC.libSortLoad` / `NC.libSortSave` (util.js) : mémorisation locale
  « nc.lib-sort », même grammaire que `nc.lib-filter`.
- « Dernière lecture » ne lit **aucune nouvelle donnée** : la valeur
  fraîche vit déjà dans l'enregistrement léger de progression
  (`lastOpened`, estampillé à chaque ouverture depuis la V2.8) —
  aucun écrit supplémentaire à l'ouverture, aucune migration.
- « Réinitialiser les filtres » vide aussi la recherche ; le message
  d'état vide s'adapte (requête citée, mention « dans ce filtre »
  quand un filtre de statut ou de groupe est actif).
- Aucune dépendance ajoutée ; `vendor/` inchangé ; aucun changement
  du lecteur.

## Fichiers touchés
`js/library.js` (recherche pliée, comparateur de tri, câblage,
compteurs affinés, messages d'état vide), `js/util.js` (clé de
mémorisation du tri), `index.html` (barre recherche & tri, message
d'état vide adressable, description), `css/style.css` (bloc
V2.16 + replis mobiles), `README.md` (caractéristique).

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Sans livre : barre présente mais masquée, état vide affiché | ✅ |
| Ordre par défaut identique à l'avant-V2.16 (dernière lecture, repli ajout) | ✅ |
| Tri Titre A → Z puis Z → A (base : « À » avant « ambre », « É » en E) | ✅ |
| Tri Auteur A → Z : sans auteur après les autres ; Z → A inversé | ✅ |
| Tri Ajout récent d'abord puis ancien d'abord | ✅ |
| Recherche « ambre » : 2 livres, « 2 sur 5 livres », puce « Tous » à 2 | ✅ |
| Recherche « ÉCLAT » : casse et accents ignorés des deux côtés | ✅ |
| Recherche « hugo » : trouvé par auteur | ✅ |
| Recherche « ambre » × filtre « Terminé » : 1 livre, « 1 sur 5 livres » | ✅ |
| Recherche « zzzz » : bloc d'état vide avec la requête citée | ✅ |
| « Réinitialiser les filtres » : recherche vidée, 5 livres reviennent, puce « Tous » active | ✅ |
| Échap dans le champ : recherche vidée, grille restaurée | ✅ |
| Rechargement : clé et sens du tri conservés, recherche non mémorisée | ✅ |
| Aucune exception de page sur toute la session, journal `__ncErrors` vide | ✅ |

**40/40 vérifications vertes** (suite `scripts/test-v2.16.js`,
5 livres injectés en base avec dates décalées, statuts et un livre
sans auteur), plus contrôle visuel : barre intégrée aux filtres,
compteurs et pied de page à jour en recherche.

## Prochaines étapes
Vignettes de navigation, export des citations — dans l'ordre de la
feuille de route.
