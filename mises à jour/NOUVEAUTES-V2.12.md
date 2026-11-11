# Nuit Calme — V2.12 (statistiques de lecture)

Le chantier demandé : **le temps passé et les pages lues par jour**. Un
nouveau tiroir mesure la lecture pendant qu'elle a lieu — sans jamais
vous demander de chronométrer quoi que ce soit — et la restitue en
trois grands chiffres, une courbe et des totaux par période. EPUB et
PDF, évidemment.

## Nouveautés

### 1. Le tiroir Statistiques
Nouveau bouton dans la barre du haut (l'icône en barres), à côté des
Passages : trois grands chiffres en tête — **temps de lecture**, **pages
lues**, **jours de lecture** — puis la **courbe des 14 derniers jours**
(une barre dorée par jour, proportionnelle au temps ; les jours sans
lecture restent discrets), les totaux **Aujourd'hui / 7 jours /
30 jours / depuis le début**, le **total de tous les livres**, la
**série** de jours d'affilée et la moyenne par jour de lecture. Chaque
colonne du graphique porte son libellé complet en infobulle
(Aujourd'hui, Hier, puis la date longue — le même vocabulaire que
l'historique des passages).

### 2. Le temps passé — mesuré honnêtement
Le temps se compte pendant la lecture : **onglet visible**, livre
ouvert, et une activité (tourner une page, souris, clavier) dans les
**trois dernières minutes**. Au-delà, le chrono s'endort — un livre
resté ouvert toute la nuit ne gonfle pas les statistiques. Onglet
caché : rien ne compte, et le compteur repart net au retour, sans
crédit rétroactif. Une mise en veille ou un saut d'horloge ne compte
pas davantage. Le crédit avance par tranches de 5 secondes et rejoint
le stockage toutes les 30 secondes (et à chaque pause) : une fermeture
brutale perd au pire quelques secondes.

### 3. Les pages lues — sans gonflage
Chaque **page affichée** en mode pages compte : une vue double en
compte deux, une vue simple une. Une même page re-rendue par epub.js
(relocation fantôme, zoom, redimensionnement) ne recompte **pas** —
seule une position nouvelle crédite ses pages. Glisser la barre de
progression d'un bout à l'autre du livre ne compte pas trois cents
pages : seul l'endroit d'arrivée est affiché. En **défilement
vertical**, l'unité de page n'existe plus : le temps seul fait foi, et
le tiroir le dit. Les pages comptées le jour J s'inscrivent au jour J,
comme le temps.

### 4. Une mémoire qui reste minuscule
Un **agrégat par livre et par jour** : quelques dizaines d'octets par
jour de lecture, jamais de journal qui grossit. Les sessions d'un même
jour se **cumulent** (fermer et rouvrir le livre additionne, n'écrase
rien). Et tout disparaît avec le livre : supprimer un livre de la
bibliothèque emporte ses statistiques (purge en cascade, comme les
annotations, les signets et l'historique).

## Sous le capot
- Base de données **v6** : un magasin nouveau, `readstats` (index
  `bookId`), enregistrements `{ id: 'livre|2026-11-10', seconds, pages }`.
  Écriture par additions (get → additionner → put) : aucune session
  n'écrase la précédente. La montée de version est automatique pour les
  bibliothèques existantes ; aucune donnée ancienne n'est touchée.
- Le suivi vit dans `reader.js` — un seul point pour les deux formats,
  comme les signets : les contrôleurs EPUB/PDF ne changent pas d'une
  ligne. Le suivi réutilise la position déjà connue du lecteur
  (relocalisations, vue double) et n'ajoute aucun calcul de rendu.
- Le seuil d'inactivité et l'état interne du suivi sont exposés par de
  discrets crochets de diagnostic (`_statsState`, `_statsIdle`,
  `_statsFlush`) : les tests automatisés n'attendent pas trois minutes.
- Aucune dépendance ajoutée ; `vendor/` inchangé.

## Fichiers touchés
`js/idb.js` (v6 : magasin, API, cascade), `js/reader.js` (suivi de
lecture, tiroir Statistiques, câblage du bouton), `js/util.js` (durée
lisible, clés de jour locales), `index.html` (bouton, méta),
`css/style.css` (cartes, graphique, périodes), `README.md`.

## Tests exécutés (Chromium headless, serveur local sans cache)

| Test | Résultat |
| --- | --- |
| Suivi armé à l'ouverture du livre, les deux formats | ✅ |
| Temps accumulé pendant la lecture active (≥ 9 s en 12 s) | ✅ |
| Première page comptée à l'ouverture (PDF et EPUB) | ✅ |
| Agrégat du jour écrit dans le magasin `readstats` | ✅ |
| 3 tourne-pages → +3 pages (vue simple PDF) | ✅ |
| EPUB paginé : tourne-pages comptés | ✅ |
| Fermeture : le reliquat est écrit | ✅ |
| Réouverture : cumul sur la même ligne du jour, sans écrasement | ✅ |
| Après 3 min d'inactivité (seuil ramené à 6 s pour le test) : plus rien ne s'accumule | ✅ |
| Défilement vertical : le temps continue, aucune page comptée | ✅ |
| Tiroir : titre, 3 cartes, 14 colonnes, 4 périodes, total tous livres | ✅ |
| Infobulles des colonnes : libellés de jour complets | ✅ |
| Régressions : tiroirs Passages et Sommaire, pose de signet | ✅ |
| Cascade : supprimer un livre emporte ses statistiques | ✅ |
| Journal d'erreurs runtime + console | ✅ vides |

## Prochaines étapes
N° 6 — zoom ajuster largeur/hauteur + pan. N° 7 — vignettes de
navigation. N° 10 — export des citations.
