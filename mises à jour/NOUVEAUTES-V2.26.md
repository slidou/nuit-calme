# Nuit Calme — V2.26 (audit complet & finitions)

Les deux dernières étapes du projet, en un seul colis : **l'audit
intégral du code** et **les peaufinages qu'il a réclamés**. Les onze
mille lignes de la liseuse ont été relues une à une, puis la bête
entière a repassé une batterie d'épreuves automatisées — import,
lecture EPUB et PDF, recherche, soulignages, signets, capture,
export → fusion → remplacement, packs, bannière d'objectif, modale
de sauvegarde — sans qu'une seule erreur ne s'affiche en console.
L'audit a relevé huit défauts, dont deux qui se voyaient dehors ;
tous sont corrigés, vérifiés, et racontés ici.

## Corrections

### 1. Un PDF ne peut plus devenir inouvrable
La page de reprise était restaurée depuis la progression sans jamais
être comparée au nombre de pages réel du fichier. Une progression
parasite — fiche ancienne, restauration partielle — plaçait le
lecteur au-delà de la dernière page : le rendu ne dessinait rien,
l'ouverture échouait, et comme la progression restait en base, **le
livre échouait à chaque essai, sans jamais se réparer**. Désormais la
page est serrée à la dernière page du fichier au moment de l'ouverture,
et le moteur de rendu a son propre filet : jamais une page vide, et
au pire un retour à la première. Testé avec une progression à la page
999 d'un livre de 4 pages : il s'ouvre, en page 4.

### 2. Plus de promesse qui s'endort
Les deux briques d'accès à IndexedDB n'attrapaient pas une exception
jetée **synchroitement** — un enregistrement avec une clé invalide,
par exemple, jette avant même que la transaction ne commence. La
promesse ne se résolvait jamais : l'attente `await` restait suspendue
à l'infini, en silence, sans erreur en console. Le filet est posé :
l'échec repart comme n'importe quel autre, il est attrapé là où il
doit l'être, l'interface ne peut plus figer. Vérifié avec une clé
invalide : la promesse rejette proprement en quelques millisecondes.

### 3. La taille du texte est bornée dès l'ouverture
Un enregistrement parasite — trois cents pour cent, donnée abîmée —
s'appliquait tel quel à l'ouverture d'un EPUB : les boutons A− / A+
bornent leurs clics, mais l'ouverture ne bornait pas. Désormais la
valeur restaurée est serrée dans ses bornes légales (80–170 %) avant
d'être appliquée.

### 4. Les résultats de recherche restent cliquables
En EPUB, un passage trouvé dont epub.js n'a pas su produire de CFI
restait affiché dans la liste — mais cliquer dessus ne faisait
**rien** (le saut vers un CFI vide était rejeté en silence). Le clic
retombe désormais sur l'adresse de la section : on arrive au
chapitre, ce qui est déjà mieux que pas d'issue.

### 5. Plus aucun panneau qui traîne après la fermeture
Fermer un livre alors que le **mémo des raccourcis clavier** ou le
popover **Catégorie** d'une annotation était ouvert les laissait
survivre au-dessus de la bibliothèque — des panneaux sans livre
derrière eux. La fermeture fait le ménage : plus rien ne flotte.

### 6. Les clics muets racontent pourquoi
Cliquer « Exporter une sauvegarde » ou « Restaurer » pendant qu'un
export ou une restauration était déjà en vol ne faisait tout
simplement **rien** — sans un mot. Le garde existe toujours, mais il
parle : « Une sauvegarde ou une restauration est déjà en cours — un
instant. »

### 7. Le rappel se tait après une restauration réussie
Restaurer une sauvegarde, c'est prouver qu'on **possède** une
sauvegarde ; le rappel pouvait pourtant se relever aussitôt, parce
que la date du dernier export, elle, était vieille. Désormais une
restauration réussie reposonne le rappel trois jours — la même
politesse qu'après « Plus tard ». (Par conception, seul le geste de
l'interface la pose : les vérifications qui appellent la
restauration bas niveau ne touchent pas au rappel.)

### 8. La mise à jour de l'app tient en une recharge
Le service worker remplissait son nouveau cache pendant que l'ancien
était encore en service — et puisait parfois des copies périmées
dans le cache HTTP du navigateur. Conséquence : une mise à jour
tenait parfois en deux ou trois recharges avant d'être réellement
servie. Le pré-cache va désormais toujours chercher le réseau
(`cache: 'reload'`) : une recharge, et l'app installée (ou visitée)
sert le nouveau code.

## Sous le capot

- **Fusion des groupes** : la liste locale des groupes était relue
  dans la base **pour chaque groupe** importé — désormais une seule
  lecture, et les groupes importés s'y ajoutent au fil de l'eau pour
  que les doublons du même fichier ne s'installent pas deux fois.
- **Accessibilité** : le bouton « Restaurer une sauvegarde… » tient
  désormais son `aria-expanded` à jour quand la zone Fusionner /
  Remplacer se déplie et se replie.
- **Menues herbes** : un écouteur d'événement vide dans le réglage
  de l'objectif a été retiré ; en-têtes et numéros de version mis à
  jour (module de sauvegarde V2.26, cache du service worker renommé
  — c'est lui qui déclenche la mise à jour chez les visiteurs déjà
  venus).

## Ce qui a été vérifié, bout à bout

Import en masse et à l'unité · ouverture et lecture EPUB (double
page, tourne-page, recherche plein texte, soulignage multicolore,
tiroir avec filtres et catégories) · ouverture et lecture PDF
(navigation, couche texte, soulignage persistant, recherche, capture
PNG) · signets et retour à l'endroit exact · export des citations ·
bibliothèque : statuts, groupes, filtres à compteurs, recherche et
tri · objectif de lecture : bannière, badge d'état, allure conseillée
· packs : index, aperçu, doublons · sauvegarde : fichier daté,
**export → fusion → remplacement → tout est revenu à l'identique**
(livres, soulignages, signets, groupes, statuts datés, objectif) ·
rappel de sauvegarde : pied de page, bandeau, « Plus tard » · service
worker : pré-cache, mise à jour. Aucune erreur console, du début à
la fin.
