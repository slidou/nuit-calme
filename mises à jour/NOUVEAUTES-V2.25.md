# Nuit Calme — V2.25 (sauvegarde & restauration)

Chantier n° 2 de la feuille de route, le dernier pilier : **la
bibliothèque quitte le navigateur quand on le décide, et y revient
d'un geste**. Tout vit dans le navigateur — c'est l'intimité de Nuit
Calme — mais un navigateur purgé, un ordinateur rendu, un pépin de
disque, et les livres s'envolent. Désormais, un bouton « Sauvegarde »
rassemble l'entier du royaume dans un seul fichier daté, et sait tout
rendre : en fusion, sans rien effacer, ou en remplacement, pour
retrouver exactement la bibliothèque du jour de la sauvegarde. Et
parce qu'on n'y pense jamais, un rappel discret veille — ni criard,
ni oubliable.

## Nouveautés

### 1. Le bouton « Sauvegarde »
Dans la bibliothèque, entre « Packs de livres » et « Ajouter un
livre », une nouvelle action ouvre la fiche de sauvegarde : ce que
le fichier contient, l'état de la dernière exportation, et deux
gestes — **Exporter une sauvegarde**, **Restaurer une sauvegarde**.
Le ton de la maison : charbon, filet doré, phrases courtes.

### 2. Le fichier, une seule pièce
Un clic, et `nuit-calme-sauvegarde-AAAA-MM-JJ.zip` glisse dans les
téléchargements : **tous les livres** (fichiers EPUB et PDF tels
quels), leurs couvertures et fiches corrigées, les **soulignages et
notes** avec leurs couleurs et catégories, les **signets**, la
**progression** de chaque lecture, les **passages** et
**statistiques**, les **groupes** et statuts de lecture, les
**réglages** de confort et même **l'objectif de lecture**. Rien n'est
recompressé sans raison — un EPUB est déjà une archive — et le
fichier s'ouvre comme n'importe quel zip pour qui veut regarder
dedans, mais il est fait pour rester entre nos mains : clé USB,
autre disque, nuage à soi. Une bibliothèque de cent livres, c'est
quelques centaines de mégaoctets — la taille du fichier l'affiche.

### 3. Restaurer — fusionner ou remplacer
« Restaurer une sauvegarde… » déplie deux voies posées côte à côte.
**Fusionner** ajoute ce qui manque à la bibliothèque actuelle et ne
supprime rien : le bon geste pour changer d'ordinateur ou ramener un
copain. Les données les plus récentes arbitrent — la progression la
plus avancée, la fiche la plus fraîche — et un récapitulatif raconte
ce qui est arrivé. **Remplacer** efface la bibliothèque actuelle et
rend celle de la sauvegarde, à l'identique ; là, la maison des
gestes irréversibles impose sa règle : le fichier est relu d'abord
(« 23 livres du 11 novembre »), et le bouton demande **une seconde
confirmation**, qui s'efface d'elle-même six secondes plus tard.
Un fichier étranger est refusé poliment, avant tout travail.

### 4. Le rappel qui veille
Le pied de page de la bibliothèque raconte désormais l'état des
lieux : « sauvegarde : aujourd'hui », « il y a 12 jours » — ou
« **aucune sauvegarde** », en or discret. Passés **trente jours**
sans export (ou depuis toujours), une invitation s'assoit au-dessus
de la grille : « Votre bibliothèque ne vit que dans ce navigateur.
Une purge des données du site, et tout s'envole — pensez à exporter
une sauvegarde de temps en temps. » Deux boutons : **Sauvegarder**,
qui fait le travail immédiatement, et **Plus tard**, qui renvoie la
conversation de trois jours — la politesse de qui rappelle sans
importuner. Un clic sur la ligne du pied de page rouvre la fiche.

### 5. Sous le capot
Un magasin n'a pas bougé, il a juste gagné des portes : trois
lectures complètes et une remise à zéro transactionnelle dans
IndexedDB (les dix magasins vidés d'un seul tenant pour le
remplacement). Le service worker emporte le nouveau module dans son
cache — la sauvegarde fonctionne hors-ligne, évidemment.
