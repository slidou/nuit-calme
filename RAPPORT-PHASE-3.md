# Nuit Calme · Phase 3

16 novembre 2026 · Stockage IndexedDB et grandes bibliothèques

## Architecture retenue

La v8 ajoute `bookcards`, un magasin indépendant dont la clé est l’identifiant du livre. Il contient les champs utiles à la grille, dont le titre, l’auteur et la couverture. Une fois ce catalogue construit, la bibliothèque lit ses fiches sans charger les enregistrements EPUB/PDF. Le lecteur et la réextraction d’une couverture chargent le livre demandé.

Le magasin historique `books` conserve chaque enregistrement complet, y compris son fichier, ses métadonnées et ses éventuels champs anciens. Les fiches du catalogue sont une projection reconstructible. Déplacer les binaires dans un nouveau magasin et retirer les métadonnées de `books` aurait imposé une réécriture de tous les livres au moment de la migration. Cette architecture conserve un chemin de lecture complet si le catalogue reste partiel. Elle duplique les champs de catalogue et les jaquettes, avec un coût de stockage proportionnel à leur taille.

Le code est livré avec `ENABLE_V8_UPGRADE = false`. Une installation v7 continue d’ouvrir IndexedDB en v7. Le serveur des tests force l’activation v8 dans ses profils isolés. Le code livré peut aussi ouvrir une base v8 existante avec cette option désactivée.

## Migration, interruption et concurrence

1. L’ouverture v8 ajoute uniquement `bookcards` et `catalogstate` dans la transaction de changement de schéma. La création d’une base neuve initialise le catalogue comme prêt. Sur une base historique, la première lecture du catalogue garde le parcours v7 pendant la construction.
2. La construction copie jusqu’à 16 fiches par transaction. La dernière clé validée est enregistrée avec les fiches dans `catalogstate`. Si une écriture échoue, seule la transaction du lot en cours est annulée. Une prochaine actualisation ou ouverture peut reprendre depuis le dernier lot validé.
3. Les transactions de construction relisent le point de reprise en base. Deux onglets peuvent donc construire le catalogue sans s’attribuer le même point de départ en mémoire. Les imports, éditions et suppressions touchent `books` et `bookcards` dans la même transaction, y compris lorsque leur clé précède le point de reprise.
4. Le marqueur final n’est validé qu’après comparaison du nombre de fiches et de livres. L’invariant d’égalité des clés vient de la projection par identifiant et des écritures communes. Si les comptes diffèrent, le code conserve le parcours historique. Les essais comparent aussi les ensembles de clés.
5. Une demande de changement de version bloquée est signalée. Si la connexion bloquante se ferme ensuite, la demande abandonnée annule la transaction de changement de schéma. Une nouvelle ouverture déclenche une nouvelle tentative.

IndexedDB arbitre l’atomicité et l’ordre des transactions sur les magasins communs. BroadcastChannel continue de rafraîchir les vues suite aux écritures validées. [Spécification IndexedDB](https://w3c.github.io/IndexedDB/#transaction-scheduling)

### Sauvegarde, restauration et quotas

- **Export ZIP v1.** Il sérialise les dix magasins d’origine et l’objectif comme auparavant. Le catalogue et son point de reprise restent des données internes.
- **Fusion.** Toute insertion ou mise à jour d’un livre enregistre aussi sa fiche lorsque le catalogue existe. Les règles v1 de résolution de la fusion sont conservées.
- **Remplacement.** La reconstruction du catalogue et son marqueur final sont intégrés à la transaction qui remplace les données. Un échec d’écriture du catalogue annule aussi le remplacement des livres et des données associées.
- **Quota.** Une erreur pendant la construction conserve le lot validé et la lecture des livres d’origine. Une erreur à l’écriture d’une fiche pendant un import, une édition ou une restauration annule l’opération correspondante. L’objectif de lecture conserve son mécanisme existant avec une écriture distincte après le commit IndexedDB.

## Performances mesurées

Edge 157.0.4341.60, Windows, deux profils distincts, serveur local sous `/liseuse/`. La référence est le commit v7 `6295c66c57e474546c5c8986ac937bca921f3807`. Les valeurs sont les médianes de trois navigations par taille. Chaque livre possède un tampon synthétique de 128 Kio, une petite couverture et un rayon. La v8 est mesurée avec un catalogue déjà complet.

| Livres | Première fiche v7 | Première fiche v8 | Gain de temps | Recherche large v7 → v8 |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 60,1 ms | 44,8 ms | 25 % | 150,3 → 150,0 ms |
| 300 | 97,3 ms | 51,4 ms | 47 % | 165,3 → 149,1 ms |
| 1 000 | 223,4 ms | 70,1 ms | 69 % | 152,6 → 147,5 ms |
| 3 000 | 627,2 ms | 143,1 ms | 77 % | 149,1 → 152,1 ms |

La première mesure s’arrête à l’apparition de la première fiche dans le DOM. La recherche porte sur un terme présent dans tous les titres et inclut le délai de saisie de 140 ms. À 3 000 livres, les médianes après ramasse-miettes sont de 5,15 → 5,81 Mo pour le tas JavaScript et de 1,72 → 1,72 Mo pour le stockage associé au tas. La phase 2 libérait déjà les tampons après la lecture. Le gain de la phase 3 porte principalement sur les lectures des livres évitées au démarrage. Ces chiffres ne couvrent ni le pic mémoire, ni la durée de construction d’un catalogue de 3 000 livres existants, ni les grandes couvertures distinctes ou les appareils mobiles.

## Vérifications effectuées

- **Base v7 réelle de test.** Le serveur a servi le code v7 du commit de référence sur une origine locale isolée. Ce code a créé la base et importé un EPUB et un PDF valides. Le scénario a ajouté 44 livres synthétiques et peuplé les magasins de progression, notes, signets, historique, statistiques, préférences, statuts, rayons et réglages.
- **Montée de version bloquée.** Une connexion v7 non coopérative a bloqué la demande. Après fermeture de cette connexion et avant la relance, l’ouverture sans version a encore trouvé la v7.
- **Reprise après interruption.** Une `QuotaExceededError` injectée au deuxième lot a laissé 16 fiches validées. Les enregistrements historiques et les SHA‑256 des 46 fichiers sont restés identiques. Des insertions, modifications et suppressions ont été exercées de part et d’autre du point de reprise. Deux onglets ont ensuite complété le catalogue et laissé des ensembles d’identifiants identiques.
- **Intégrité des écritures.** Deux éditions concurrentes de champs différents ont été conservées. Un échec sur la fiche a annulé l’édition du livre. Un deuxième échec injecté après le début d’une restauration de remplacement a conservé le catalogue, les clés et le marqueur antérieurs.
- **ZIP v1 dans les deux sens.** Fusion et remplacement d’un ZIP exporté par v7 dans la base v8. Restauration d’un ZIP produit en v8 par le code v7 sur une autre origine locale. Comparaison des enregistrements et des SHA‑256 des binaires.
- **Lecture après migration.** Ouverture et recherche EPUB, vérification du CFI enregistré, de la note et de la typographie. Ouverture du PDF à sa page de reprise et contrôle du signet. Démarrage du catalogue avec `books.getAll()` bloqué par le test. Vérification que le code avec le drapeau d’activation désactivé relit une base déjà en v8.
- **Régressions.** Suite Edge sur les chemins habituels, comprenant l’import, la recherche, l’annotation et le signet, le fonctionnement hors ligne et le scénario de mise à jour du service worker.

Le quota a été simulé par injection d’exception aux frontières de transaction. Il reste à tester la saturation physique, une fermeture forcée pendant un commit et les particularités de Firefox, Safari et des appareils mobiles.

### Reproduction

Node.js 22+ et Edge ou Chromium. Le script crée un profil temporaire et sert le site sur une adresse de boucle locale. Exécuter les modes dans des sessions PowerShell distinctes ou retirer les variables après chaque exécution.

```powershell
# Régression en v7 avec le code livré
node tests/smoke.mjs

# Migration réelle d’une base v7 synthétique vers v8
$env:NC_MIGRATION = '1'
node tests/smoke.mjs
Remove-Item Env:NC_MIGRATION

# Référence v7
$env:NC_BENCHMARK = '1'
$env:NC_BASE_REF = '6295c66c57e474546c5c8986ac937bca921f3807'
node tests/smoke.mjs
Remove-Item Env:NC_BASE_REF

# Mesure v8
$env:NC_TEST_V8 = '1'
node tests/smoke.mjs
Remove-Item Env:NC_BENCHMARK

# Régression avec le catalogue v8
node tests/smoke.mjs
Remove-Item Env:NC_TEST_V8
```

## Retour arrière et mise en production

Une version ancienne qui appelle explicitement `indexedDB.open(..., 7)` reçoit `VersionError` après la montée en v8. Ce comportement a été vérifié dans Edge. Remettre le drapeau à `false` dans le code de cette phase empêche de nouvelles montées, tout en gardant la prise en charge de v8. Cette action conserve le numéro de schéma existant. Pour réutiliser le code v7, l’issue vérifiée est d’importer un ZIP v1 dans une base v7 neuve sur une autre origine ou dans un profil distinct. [Ouverture d’une base IndexedDB](https://w3c.github.io/IndexedDB/#opening)

Avant d’autoriser l’activation sur une bibliothèque réelle

1. Créer et relire une sauvegarde ZIP v1. Tester son import dans un profil distinct, et choisir à l’avance la version du code à servir en cas de retour arrière.
2. Rejouer une migration de 3 000 livres sur Firefox, Safari et un appareil mobile. Mesurer la construction initiale, le pic mémoire et l’espace supplémentaire nécessaire aux jaquettes.
3. Rejouer le scénario de manque d’espace réel et d’arrêt du navigateur pendant un lot. Vérifier la reprise, la lecture en repli et le comportement après libération d’espace.
4. Vérifier une mise à jour du véritable paquet PWA avec une ancienne session de lecture ouverte. Valider le blocage des anciennes connexions, le comportement hors ligne et les navigateurs dont le service worker a été désactivé.

## Fichiers

- [js/idb.js](js/idb.js) porte l’activation v8, l’instantané de fiches, le point de reprise et la synchronisation des écritures.
- [sw.js](sw.js) change la version du pré-cache pour charger le module de stockage correspondant.
- [tests/smoke.mjs](tests/smoke.mjs) sert la vraie référence v7, crée les profils isolés, compare l’intégrité des données et mesure jusqu’à 3 000 livres.

Les EPUB, le dossier `mises à jour` et le dépôt distant ont été préservés. Les tests ont utilisé uniquement des données synthétiques.
