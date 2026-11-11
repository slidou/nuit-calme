# Packs de livres — mode d'emploi

C'est ici que vivent les packs : un dossier `packs/` par collection,
ou une archive `.zip` — l'app fait le reste.

## Ajouter un pack

1. Déposez votre pack dans ce dossier, au choix :
   - **un dossier** contenant vos `.epub` / `.pdf`
     (ex. `packs/polars-dhiver/le-loup-des-villes.epub`) ;
   - **une archive `.zip`** contenant vos livres
     (ex. `packs/polars-dhiver.zip`) — décompressée dans le
     navigateur au moment de l'import, rien à faire de plus.
2. Poussez sur GitHub (`git add packs/ && git commit && git push`).
3. Le workflow `.github/workflows/packs.yml` reconstruit tout seul
   `packs/index.json` (la liste que lit l'app) et pousse un petit
   commit « packs : … ». Une minute plus tard, le pack est en ligne.

Le titre d'un pack est déduit du nom du dossier ou de l'archive
(`polars-dhiver` → « Polars dhiver »). Pour soigner titres et
descriptions, éditez `packs/index.json` à la main : **vos textes sont
conservés** — le workflow ne recalcule que la liste des fichiers,
jamais vos descriptions.

## Retirer un pack

Supprimez son dossier (ou son `.zip`), poussez : l'index se met à
jour tout seul. Les livres déjà importés par les lecteurs restent
dans *leur* bibliothèque — l'import fait une copie, il ne pointe
jamais vers le site.

## Le pack de démonstration

`classiques-de-la-nuit/` est un pack d'essai (deux petits livres) :
supprimez-le le jour où vous déposez les vrais.

## À savoir

- L'app ne lit que les fichiers `.epub` et `.pdf` d'un pack — les
  autres documents (couvertures, notes, fichiers cachés) sont ignorés.
- Un visiteur qui importe télécharge le livre une fois : des packs de
  taille raisonnable restent les plus agréables.
- Ouvert en fichier local (`file://`), le navigateur refuse de lire
  ce dossier — l'app l'explique poliment à la place de planter.
