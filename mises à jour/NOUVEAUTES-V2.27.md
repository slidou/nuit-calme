# Nuit Calme — V2.27 (le papier à l'encre : soulignages, notes, signets)

Une passe de corrections née de vos essais sur un vrai livre — un
gros chapitre paginé, des soulignages, une note, un signet, une
capture. Tout ce que vous avez signalé est corrigé, et une seule
cause racine expliquait les trois quarts des symptômes.

## Corrections

### 1. Le soulignage ne flotte plus au-dessus du texte
Sur votre capture, le voile montait trop haut : il mangeait
l'interligne et frôlait la ligne du dessus. La cause est subtile :
les rectangles fournis par le navigateur suivent les **métriques
déclarées par la police** (son ascendant, son descendant), pas
l'encre réellement dessinée. Or Cormorant Garamond déclare un
ascendant bien plus grand que ses capitales — le voile, posé sur la
boîte de métrique, « flottait » au-dessus des mots. Désormais la
liseuse **mesure la vraie boîte d'encre** (canvas, `actualBoundingBox`)
et pose le voile sur les glyphes : il enveloppe le texte, sans
toucher à la ligne voisine. La mesure est faite par police et par
taille, recalculée quand vous changez la typographie.

### 2. Les notes se voient enfin — et ne barrent plus les mots
Une note était rendue comme un simple trait pris dans la boîte de
métrique : il traversait le mot, on le confondait avec une biffure
et on ne savait « pas où va la note ». Le rendu des notes est
redessiné : un **voile fin bleu** sur le passage + un **trait net
sous la ligne**, façon crayon — impossible à rater, impossible à
confondre avec un surlignage (qui garde son voile or/rose/vert… plein).
Le trait passe désormais **sous** les descendantes, plus jamais dans
le mot. Vérifié à l'écran et sur la capture PNG.

### 3. Fin du soulignage « posé sur un autre passage » en concentration
Le plus déroutant : en mode concentration, vos soulignages semblaient
se déplacer seuls sur un autre passage, puis revenir à leur place
après une réouverture. Ce n'était pas le mode concentration lui-même :
en vue paginée, **tourner la page à l'intérieur d'un même chapitre ne
re-rend pas la page** — et les voiles, dessinés avec les coordonnées
du moment, restaient figées là où la page précédente les avait posés.
Ils se retrouvaient peints sur le texte qui occupait ces coordonnées
ensuite — un autre passage, donc. Surtout visible en concentration,
où le reste du texte est atténué. Désormais **chaque changement de
position redessine les calques** (à cadence calmée, c'est léger) :
les voiles suivent le papier, page après page, dans tous les modes.

### 4. La capture repart avec les soulignages au bon endroit
La capture PNG recompose les calques de soulignages tels quels :
elle hérite donc des deux corrections ci-dessus — voile sur l'encre,
trait de note sous la ligne. Re-testé sur la même page que votre
capture : le pavé vert épouse ses lignes et la note se lit comme
une note.

## Peaufinage

### 5. Un ruban pour retrouver ses signets d'un coup d'œil
Poser un signet ne changeait rien à la page : il fallait ouvrir le
sommaire pour vérifier qu'il était là. Désormais, quand la page
courante porte un signet, un **ruban doré pend du haut du livre**
(EPUB comme PDF), à l'endroit exact où la page sort de la reliure.
Il apparaît à la pose, disparaît au retrait, suit la navigation — et
reste en mode concentration, justement pour retrouver son endroit.
Décoratif et silencieux : aucun clic possible dessus, la lecture
reste intacte.

## Vérifications

Repassage complet dans un navigateur réel : import, ouverture EPUB,
soulignage multi-lignes, note sur un seul mot, capture PNG, tourne-page
aller-retour avec contrôle des coordonnées des voiles, mode
concentration, cycle signet posé → page tournée → page retrouvée →
retiré, restauration de sauvegarde, packs, objectif de lecture —
sans aucune erreur en console. Le cache PWA passe en `v2.27` :
la mise à jour prendra effet après un rechargement (éventuellement
deux, comme toujours après une publication).
