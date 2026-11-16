# Nuit Calme · Phase 2

16 novembre 2026 · Comparaison avec `bcb0acffa9a9503b23de00a67088902ebdd721fb`

## Résultat

La bibliothèque garde les fiches en mémoire et charge le fichier complet quand le lecteur ou l’éditeur de couverture en a besoin. Sa base IndexedDB reste en v7. Le parcours de démarrage doit encore parcourir les enregistrements complets sur disque, car le format v7 associe les fiches et les fichiers dans le même magasin. La lecture de ces enregistrements par lots évite de garder en mémoire toutes les copies binaires.

Le format ZIP v1 et la restauration transactionnelle sont conservés. Les vérifications supplémentaires peuvent refuser des archives V1 atypiques ou contenant des fichiers au-delà des budgets détaillés ci-dessous. Les livres déjà stockés continuent de suivre les chemins d’ouverture existants.

## Corrections apportées

| Domaine | Correction |
| --- | --- |
| Catalogue | Instantané cohérent de la bibliothèque, des rayons, de la progression et des statuts. Lecture des livres par lots de 16, puis conservation des seules fiches. Les couvertures se chargent à proximité de la zone visible, avec décodage asynchrone. |
| Bibliothèque | Rendu de la grille par tranches. Si une recherche produit exactement les mêmes fiches, la grille reste en place. Le tri réutilise son collateur, les clés de recherche sont calculées à la demande et les compteurs des filtres partagent un seul parcours. Les imports en masse regroupent les mises à jour de la grille. |
| Lecteurs | La recherche dans un livre s’interrompt à la fermeture du tiroir ou du contrôleur, entre deux sections EPUB ou pages PDF. Le lecteur EPUB réutilise le tampon du fichier. Le lecteur PDF continue d’isoler le tampon transféré au worker. |
| Multionglet | Le titre, la couverture, les préférences, le statut, le rayon et le contenu d’une annotation sont modifiés par champ dans la transaction qui relit la fiche. Les transactions qui créent une annotation, un signet ou une progression vérifient la présence du livre. Un signet concurrent à la même position est dédupliqué. Un surlignage PDF sur deux pages utilise une seule transaction. |
| Progression | Une sauvegarde identique n’est pas rejouée en fermant le lecteur ou en masquant l’onglet. La version horodatée la plus récente l’emporte en base. Une position EPUB sans CFI exploitable n’écrase plus une position sauvegardée. |
| Synchronisation locale | BroadcastChannel signale les modifications validées. L’autre onglet recharge les fiches visibles et actualise les annotations et signets du livre ouvert. Les décisions d’écriture restent dans IndexedDB. |
| Quota | Une annotation ou un signet est annoncé comme enregistré après validation de la transaction. Un échec d’enregistrement d’une note laisse le texte dans l’éditeur. Si la restauration rencontre une erreur de quota, le message indique que la bibliothèque précédente reste disponible. |
| Imports | Le contrôle vérifie l’en-tête PDF et le conteneur EPUB. Les ZIP contrôlent les chemins et les tailles déclarées avant extraction. Les entrées de sauvegarde et les livres extraits des packs sont lus avec contrôle de leur taille effective et du CRC32. Les téléchargements de packs sont bornés pendant la lecture du flux. |
| Hors ligne | Le worker actif sert la page et les ressources depuis son pré-cache. Le nouveau worker attend la fermeture des pages qu’il contrôle avant de s’activer. Une ressource manquante lors de l’installation laisse la version précédente disponible. L’app signale qu’une mise à jour attend. |

### Fichiers modifiés

| Fichier | Rôle dans la phase 2 |
| --- | --- |
| [js/idb.js](js/idb.js) | Instantané par lots, mises à jour transactionnelles, vérification de l’existence du livre et notifications interonglets. |
| [js/library.js](js/library.js) | Catalogue en mémoire, filtres et tri, rendu par tranches, images et imports groupés. |
| [js/reader.js](js/reader.js) | Statuts, signets, éditeur de notes, rafraîchissement distant et annulation de recherche. |
| [js/epub-reader.js](js/epub-reader.js), [js/pdf-reader.js](js/pdf-reader.js) | Mémoire et annulation des recherches, progression et modifications ciblées des annotations. |
| [js/util.js](js/util.js) | Lectures ZIP bornées, CRC32, validation de fichier et déduplication de la progression. |
| [js/backup.js](js/backup.js), [js/packs.js](js/packs.js) | Validation des archives et téléchargements, retour sur erreur de quota. |
| [sw.js](sw.js), [js/app.js](js/app.js) | Pré-cache cohérent, activation différée et signalement de mise à jour. |
| [tests/smoke.mjs](tests/smoke.mjs) | Tests Edge, versions PWA simulées et benchmark comparatif. |

## Mesures avant et après

Edge 157 headless sous Windows, serveur local sous `/liseuse/`, profil isolé par version, cache de navigation arrière désactivé. Trois répétitions par taille, médiane affichée. Chaque livre possède un binaire synthétique de 128 Kio, une couverture simple et un rayon parmi 24. Le benchmark évalue le catalogue. Les documents réellement ouverts dans les tests fonctionnels sont générés à part avec des structures EPUB et PDF valides.

| Livres | Première fiche au démarrage, ms | Recherche large, ms | Mémoire de stockage associée au tas, Mo |
| ---: | ---: | ---: | ---: |
| 100 | 65,4 → 58,9 | 161,5 → 149,9 | 14,41 → 1,30 |
| 300 | 114,9 → 97,5 | 175,7 → 151,4 | 40,65 → 1,34 |
| 1 000 | 267,3 → 217,6 | 218,8 → 149,9 | 132,52 → 1,43 |

Le démarrage mesure l’apparition de la première fiche dans le DOM, depuis le début de la navigation. La recherche saisit « Volume », qui correspond à tous les titres, et mesure le délai jusqu’à la mise à jour du compteur. Ce délai inclut l’attente de 140 ms déjà appliquée à la saisie. La grille complète était disponible à environ 219 ms avant et 150 ms après sur le même scénario à 1 000 livres. Une recherche sélective ou un réordonnancement peut encore demander un nouveau rendu.

La mesure mémoire utilise `Runtime.getHeapUsage.backingStorageSize` après ramasse-miettes. Elle inclut notamment les tampons des livres et ne représente ni le pic mémoire ni la mémoire totale du processus. À 1 000 livres, le tas JavaScript proprement dit est passé de 4,04 à 4,17 Mo. Le gain principal porte sur les tampons binaires que la page gardait auparavant après l’affichage. Ces mesures ne caractérisent pas un téléphone, une grande collection d’images uniques ou un disque lent.

Rejouer avec Node.js 22+ et Edge ou Chromium. Les commandes suivantes utilisent PowerShell.

```powershell
node tests/smoke.mjs

$env:NC_BENCHMARK = '1'
$env:NC_BASE_REF = 'bcb0acffa9a9503b23de00a67088902ebdd721fb'
node tests/smoke.mjs
Remove-Item Env:NC_BASE_REF
node tests/smoke.mjs
Remove-Item Env:NC_BENCHMARK
```

`NC_BROWSER` permet de pointer vers un autre binaire Chromium.

## Tests exécutés

- Démarrage Edge sous un sous-chemin, import et recherche EPUB/PDF, stockage des annotations et signets, reprise du PDF et lecture après navigation hors ligne.
- Sauvegarde v1, fusion et remplacement. Rejet d’un livre absent, d’un CRC altéré et d’un chemin ZIP réécrit. Conservation des données après échec et annulation d’une transaction invalide.
- Deux onglets Edge réels sur la même origine. Éditions simultanées de champs différents, notification de titre, progression ancienne ignorée, déduplication d’un signet et impossibilité de recréer le livre supprimé par une édition ou une sauvegarde de position.
- Exception `QuotaExceededError` injectée lors du deuxième `put` d’une restauration. Les livres et le titre antérieurs restent présents. Deux essais de surcharge de quota via DevTools ont accepté l’écriture et restent donc non concluants pour un quota physique ou la décision native de quota.
- Pré-cache PWA. Une installation avec feuille de style manquante échoue en laissant la version précédente utilisable. Une version complète attend avec deux onglets, puis s’active après leur départ. La bibliothèque reste présente.
- Pack ZIP avec une entrée EPUB invalide et un PDF valide, import groupé répété, commandes de carte accessibles au focus et cumul transactionnel des statistiques.
- Syntaxe JavaScript et contrôle du diff Git.

Le corpus fonctionnel et les benchmarks sont synthétiques. Firefox, Safari, la pression mémoire sur mobile, la fermeture forcée du navigateur pendant un commit et les fichiers EPUB/PDF complexes demeurent hors de cette validation.

## Limites et décisions à prendre

**Archives.** Un nouveau livre est limité à 256 Mio. Un EPUB est limité à 128 Mio par entrée et 512 Mio décompressés d’après l’annuaire ZIP. Un pack ZIP est limité à 768 Mio. Pour les sauvegardes, le budget décompressé est d’au moins 768 Mio et peut augmenter en fonction du fichier ZIP source. La limite par entrée reste 256 Mio, avec au plus 30 000 entrées. Les restaurations valident les livres avant de démarrer la transaction, ce qui conserve leur atomicité mais peut exiger beaucoup de mémoire. Le contrôle de la taille annoncée et du CRC dépend de la représentation interne de JSZip 3.10.1 et devra être rejoué à sa mise à niveau. La vérification du conteneur EPUB ne vérifie pas intégralement les ressources internes que le moteur décode ensuite. Les requêtes externes dans les contenus EPUB et les images internes de PDF demandent encore une politique d’isolation et des essais dédiés. [Documentation JSZip](https://stuk.github.io/jszip/documentation/api_jszip/load_async.html)

**Moteurs.** La branche PDF.js actuelle du projet (3.11.174) utilise un script et un worker classiques ainsi que son API de calque texte. Les versions 6.x maintenues introduisent des changements d’API. Un portage doit vérifier le calque texte, la sélection, la capture, les surlignages, les vignettes et le fonctionnement hors ligne. Pour epub.js, les publications GitHub ne suffisent pas à établir une branche de maintenance plus sûre compatible avec les CFI et les surlignages actuels. Cette phase conserve les deux moteurs et le contournement PDF.js déjà en place. [Versions PDF.js](https://github.com/mozilla/pdf.js/releases) · [Publications epub.js](https://github.com/futurepress/epub.js/releases)

**Conflits et PWA.** La dernière action sur le même champ l’emporte. Il faut décider du comportement d’un lecteur déjà ouvert sur un livre réintroduit avec le même identifiant par un remplacement. Un tel lecteur peut encore déposer de nouvelles données après cette restauration. Les notifications dépendent de la prise en charge de BroadcastChannel. Le pré-cache évite qu’un worker actif mélange ses ressources avec une mise à jour réseau, mais un CDN qui servirait différentes révisions pendant l’installation demanderait un manifeste d’empreintes ou des URL versionnées.

## Phase 3 proposée

1. **Migration additive v8, soumise à accord.** Ajouter un magasin de fiches indépendant et conserver `books` et les enregistrements historiques. Construire l’index progressivement depuis v7, avec reprise après interruption et contrôle du nombre et des identifiants. Écrire l’index dans les transactions d’import, d’édition, de suppression et de restauration. Activer la lecture du nouvel index une fois sa couverture vérifiée. Le repli relirait `books` à partir d’une version de l’application capable d’ouvrir v8. Une ancienne version qui demande explicitement v7 ne pourrait plus ouvrir la base mise à niveau.
2. **Valider avant bascule.** Tester la montée v7 → v8 avec deux onglets, une interruption, un quota insuffisant et un catalogue d’au moins 1 000 documents. Comparer les tailles, une sélection de binaires et un aller-retour ZIP v1. Mesurer le premier affichage sans charger les binaires, puis examiner le rendu sur téléphone.
3. **Porter PDF.js séparément.** Préparer le portage et une matrice synthétique d’annotations, de polices, de pages complexes et de zoom. Éprouver l’isolation EPUB avec un corpus de documents à scripts, ressources distantes, polices et médias intégrés. Décider ensuite des restrictions de contenu qui peuvent affecter certains ouvrages.
4. **Étendre les tests de résilience.** Tester l’écriture concurrente pendant un remplacement, documenter le choix de résolution, valider les quotas et fermetures réels, puis mesurer l’export et la restauration sur les appareils cibles.

Les fichiers de `packs/`, le dossier `mises à jour` et le workflow GitHub ont été préservés. La phase 2 est locale.
