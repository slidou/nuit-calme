# Nuit Calme — V2.14 (statut de lecture, filtres & groupes)

Chantier n° 13 de la feuille de route : la bibliothèque apprend à
**classer**. Chaque livre porte un statut — À lire, En cours, Terminé —
posé le plus souvent **tout seul**, et la bibliothèque se filtre en un
clic. Et puisque chaque lecteur a sa façon de ranger : des **groupes**
à créer librement, comme des rayons — Polars, SF, À relire… — sans
aucune catégorie imposée.

## Nouveautés

### 1. Le statut de lecture — trois états, posés honnêtement
- **À lire** — le défaut : tout livre importé, jamais ouvert ;
- **En cours** — posé automatiquement dès l'ouverture du livre ;
- **Terminé** — posé automatiquement quand la fin est atteinte :
  dernière page d'un PDF (exacte), fin du dernier passage d'un EPUB
  (`atEnd` d'epub.js, repli sur le pourcentage des locations — fiable,
  sinon on ne s'y risque pas). Un toast discret annonce la fin.
Un livre « Terminé » que l'on rouvre pour consulter un passage **n'est
pas rabaissé** ; et le menu de chaque carte permet de tout reposer à la
main (relire un classique, déplacer un statut mal posé). Chaque carte
porte son étiquette : cercle vide, cercle à moitié plein doré, coche
verte — et le pied de page compte juste (« 1 sur 2 livres » quand un
filtre est actif).

### 2. Les filtres — des compteurs, pas des devinettes
Sous l'en-tête, deux rangées de puces : **Tous / À lire / En cours /
Terminé**, puis les groupes. Chaque puce affiche **ce que l'on verrait
en la cliquant** (compteurs à facettes : les compteurs de statut
respectent le groupe choisi, et réciproquement). Le choix des filtres
**survit au rechargement** ; si aucun livre ne répond, un état vide
proposé de réinitialiser — jamais de grille muette.

### 3. Les groupes — des rayons à soi
Un livre se range dans **au plus un groupe**, créé librement («
Nouveau groupe… », Entrée pour valider) :
- depuis la puce **+ Groupe** de la barre de filtres, ou
- depuis le **menu ⋮ de chaque carte**, qui réunit statut et groupe au
  même endroit (et propose « Nouveau groupe… » qui range le livre dans
  la foulée).
La puce **Gérer** ouvre la fenêtre de gestion : renommer, supprimer
(en deux clics, comme la suppression d'un livre), voir le nombre de
livres de chacun. Supprimer un groupe **rend ses livres** : ils
retournent « Sans groupe », rien n'est jamais perdu. Un doublon de nom
(casse ignorée) est refusé poliment.

### 4. Une mémoire qui reste légère
Base de données **v7** : deux magasins nouveaux — `groups` (les rayons)
et `bookmeta` (UNE fiche légère par livre : statut, groupe, date).
Le fichier du livre n'est **jamais réécrit** pour un changement de
statut — même philosophie que la progression depuis la V2.8.1. Un
livre sans fiche est « À lire », sans groupe : tout livre ancien
s'affiche sans migration. Et la fiche suit le livre dans la tombe :
supprimer un livre emporte son statut et son rangement (purge en
cascade, comme les annotations, les signets, l'historique et les
statistiques).

## Sous le capot
- Les transitions automatiques vivent dans `reader.js` — un seul
  point pour les deux formats, comme les signets et les statistiques.
  Le statut courant est gardé en cache par session de lecture : la
  fin du livre ne réécrit la fiche qu'une fois.
- La bibliothèque garde fiches et groupes en mémoire : changer un
  statut ne relit jamais les fichiers des livres, seulement la fiche.
- Le menu ⋮ reste ouvert d'un choix à l'autre (on range souvent
  statut ET groupe en même temps) et se reconstruit à chaque
  changement ; la grille qui défile le referme — il suivrait mal sa
  carte.
- Filtres mémorisés en `localStorage` avec validation au chargement :
  un groupe supprimé ailleurs retombe sur « Tous les groupes ».
- Aucune dépendance ajoutée ; `vendor/` inchangé.

## Fichiers touchés
`js/idb.js` (v7 : magasins `groups` + `bookmeta`, API, cascade),
`js/library.js` (filtres à compteurs, étiquettes, menu ⋮, modales de
groupes), `js/reader.js` (auto « En cours » / auto « Terminé », toast,
crochet de test), `js/util.js` (états du statut, icônes, filtres
mémorisés), `index.html` (barre de filtres, popover, modales, méta),
`css/style.css` (puces, étiquettes, popover, modales, responsive),
`docs/apercu-bibliotheque.png` (mise à jour), `README.md`.

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Compteurs initiaux : À lire 2, les autres à 0 | ✅ |
| Carte neuve étiquetée « À lire » ; puce « + Créer un groupe » | ✅ |
| PDF ouvert → « En cours » automatique, fiche écrite en base | ✅ |
| Retour bibliothèque : carte et compteurs à jour | ✅ |
| Menu ⋮ : deux sections, « Terminé » posé à la main, coche passée | ✅ |
| Filtre « Terminé » → l'EPUB seul ; « En cours » → le PDF ; pied « 1 sur 2 livres » | ✅ |
| Filtre « À lire » → état vide ; réinitialisation → 2 cartes | ✅ |
| Groupe créé (Entrée), compteur à 0 ; doublon (casse) refusé | ✅ |
| EPUB rangé : fiche + étiquette de groupe + compteurs | ✅ |
| Croisé groupe × statut (présent, puis état vide) ; retour « tous » | ✅ |
| Gestion : ligne, compteur « 1 livre », renommage prérempli | ✅ |
| Renommage répercuté sur la gestion et les puces | ✅ |
| Second groupe créé depuis la gestion ; PDF rangé dedans | ✅ |
| Suppression d'un groupe (2 clics) : livres rendus, filtre ramené | ✅ |
| Rechargement : filtres, statuts et groupes intacts | ✅ |
| PDF dernière page → « Terminé » automatique + toast | ✅ |
| EPUB à la fin (locations) → « Terminé » automatique | ✅ |
| Rouvrir un « Terminé » : statut inchangé | ✅ |
| Cascade : la fiche part avec le livre, le groupe reste | ✅ |
| Régressions : tourne-page, boutons du lecteur | ✅ |
| Journal d'erreurs runtime + console | ✅ vides |

**53/53 vérifications vertes** (suites de `scripts/test-v2.14.js`).

## Prochaines étapes
N° 7 — vignettes de navigation. N° 10 — export des citations.
N° 11 — recherche et tri de la bibliothèque.
