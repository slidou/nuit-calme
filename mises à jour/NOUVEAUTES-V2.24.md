# Nuit Calme — V2.24 (objectif de lecture)

Nouvelle pierre de la liseuse : **se fixer un cap**. Un nombre de
livres, un temps choisi — « 12 en un an », « 4 ce mois-ci », « 2
d'ici samedi » — et la bibliothèque raconte où on en est : barre
dorée, badge d'état, allure conseillée. Le site reste 100 % local et
sans serveur ; l'objectif vit dans le navigateur, comme les filtres
et le tri, et le compte se fait sur les livres vraiment terminés —
à la main depuis le menu d'une carte, ou tout seul quand la dernière
page est atteinte.

## Nouveautés

### 1. Le cap, posé en deux gestes
Dans la bibliothèque, sous les filtres, une invitation discrète en
tirets — « Objectif de lecture — se fixer un cap ». Elle ouvre le
réglage : **le nombre de livres à finir**, puis **l'échéance** au choix
— Cette année, Ce mois-ci, En 1 semaine à En 1 an (à partir
d'aujourd'hui), ou **jusqu'à une date précise**. La période choisie se
recalcule sous les yeux (« du 3 novembre au 2 décembre — 30 jours · le
compte part d'aujourd'hui »), et « Se lancer » pose la bannière.

### 2. La bannière qui suit la lecture
Une fois le cap choisi, la bannière raconte le chemin : **« 7 / 12 »**
en Cormorant, la barre de progression dorée, le pourcentage, et la
ligne du dessous — « Encore 5 livres · 23 jours restants · ≈ 1 livre
tous les 4 jours ». Le **badge d'état** se met à jour à chaque livre :
*En avance*, *Dans les temps*, *Un peu de retard* (comparaison honnête
entre le chemin parcouru et le temps passé), jusqu'au *Objectif
atteint* — alors la barre est pleine, l'or s'éclaircit, et un toast
salue la prouesse **une seule fois**, pas à chaque livre. Échéance
passée sans cap rempli : *Temps écoulé*, avec le bilan — et la bannière
se retire d'un geste si l'on n'en veut plus.

### 3. La fiche, ouverte d'un clic
Un clic sur la bannière ouvre la modale : le gros compte, la barre, la
période (« du 1er janvier au 31 décembre 2026 »), le temps restant, et
**l'allure conseillée** recalculée à chaque fin de livre — « ≈ 1 livre
par jour » quand l'échéance presse, « ≈ 1 livre toutes les 2 semaines »
quand le temps est vaste. Plus la **liste des livres comptés, datés** —
la preuve que le compte est honnête —, le bouton **Modifier** (nouveau
cap, nouvelle échéance ; un objectif changé repart sans crédit de
célébration) et **Retirer l'objectif**, à double confirmation. Échap et
le fond flouté referment, comme partout.

### 4. Un compte qui ne doit rien au hasard
- **Les dates, enfin** : le passage à « Terminé » — à la main OU tout
  seul en atteignant la fin du livre — inscrit désormais `statusAt`
  dans la fiche du livre. C'est cette date que l'objectif lit ; revenir
  en arrière l'efface, refaire « Terminé » la repose.
- **Les anciens livres terminés** (d'avant cette version) n'ont pas de
  date dédiée : leur dernière touche à la fiche fait office de repli —
  sans jamais inventer un jour.
- **Les périodes calendaires repèrent le passé** : « Cette année »
  compte les livres déjà finis depuis le 1er janvier, « Ce mois-ci »
  ceux du mois — à la Goodreads. Les durées (« En 3 mois ») partent
  d'aujourd'hui, le dernier jour compris.
- **Rien quand la bibliothèque est vide** : la bannière n'apparaît
  qu'avec au moins un livre — l'état vide garde son cadre épuré.

## Sous le capot
- `js/goal.js` (nouveau) : tout le module — stockage localStorage
  (`nc.reading-goal`), presets d'échéance avec arithmétique des mois à
  jour fixé (31 janvier + 1 mois → 28/29 février), instantané du
  compte (comptage par période, état, allure), bannière fantôme/carte,
  modale fiche/formulaire, célébration unique.
- `js/library.js` : `setBookStatus` date les passages à « Terminé »
  (`statusAt`) et l'efface en revenant en arrière ; `finishedBooks()`
  sort la liste des livres finis avec leur date (repli `updatedAt` pour
  les anciens) ; `count()` donne le volume — la bannière ne parle qu'à
  du monde ; la bannière et la modale se recalculent après chaque
  changement de statut et chaque retour de lecture ; Échap et le fond
  des modales ferment la fiche objectif.
- `js/reader.js` : la fin atteinte pose `statusAt` en même temps que
  « Terminé » — le compte objectif suit la lecture, pas seulement la
  main du lecteur.
- `index.html` : bannière `#goal-banner` sous les filtres, modale
  `#goal-pop`, chargement de `js/goal.js`, description mise à jour.
- `css/style.css` : la bannière (fantôme et carte), les six états du
  badge, la barre de progression, la modale et sa liste datée —
  responsive jusqu'au téléphone, marges sûres respectées.
- `sw.js` : cache `nuit-calme-v2.24` (38 fichiers, `js/goal.js` compris).
- **Aucune dépendance neuve, aucun changement des livres eux-mêmes** —
  les EPUB et PDF ne voient rien ; la fiche `bookmeta` gagne un champ
  optionnel de plus.

## Fichiers touchés
`js/goal.js` (nouveau), `js/library.js`, `js/reader.js`, `js/app.js`,
`index.html`, `css/style.css`, `sw.js`, `README.md`.

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Chargement sans aucune erreur de page ni console | ✅ |
| Bannière invisible sans livre ; fantôme visible avec un livre | ✅ |
| Réglage : 3 livres, « En 1 semaine » — période calculée sous les yeux | ✅ |
| Bannière : « 0 / 3 », badge « Dans les temps », allure affichée | ✅ |
| Marquage « Terminé » à la main : `statusAt` posé dans la fiche | ✅ |
| Bannière « 1 / 3 » ; modale : période, temps restant, liste datée | ✅ |
| Retour en « En cours » : `statusAt` effacé, compte retombe | ✅ |
| Objectif atteint : badge doré, barre pleine, toast unique | ✅ |
| Modifier l'objectif : formulaire prérempli, nouveau cap repris | ✅ |
| Preset « Cette année » : « 1er janvier → 31 décembre », compte repris | ✅ |
| Badge honnête : « Un peu de retard » à un mois de décembre | ✅ |
| Nouveau cap : célébration repart de zéro | ✅ |
| Date libre : date passée refusée (ramenée à aujourd'hui) | ✅ |
| Retrait à double confirmation : bannière fantôme, stockage vidé | ✅ |
| Échap et fond flouté referment la fiche objectif | ✅ |
| La fin du livre pose « Terminé » daté — et l'objectif le compte | ✅ |
| Téléphone (390 px) : bannière et fiche tiennent, rien ne déborde | ✅ |

## Prochaines étapes
Dans l'ordre de la feuille de route — le minuteur de veille (n° 20)
reste écarté sur décision du lecteur.
