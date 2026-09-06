# Décisions

Les choix d'architecture et ce qu'ils coûtent. Un choix qui n'a rien coûté n'a
probablement pas été fait.

Chaque entrée dit ce qui a été décidé, pourquoi, et ce qu'on abandonne en
échange. Les invariants cités renvoient à la section 4 de [SPEC.md](SPEC.md).

---

## Jalon M0

### D1 — Le hook clavier bas niveau est le seul mécanisme possible, et il a un prix

`RegisterHotKey` ne signale pas le relâchement des touches. Peek est construit
sur le maintien : sans relâchement, il n'y a pas de produit. Il faut donc
`WH_KEYBOARD_LL`.

Ce choix est pris les yeux ouverts. Un hook clavier global voit toutes les
frappes du système : c'est la signature exacte d'un enregistreur de frappe.
Il attire les faux positifs antivirus et l'attention des anticheat.

Trois conséquences, toutes assumées :

1. Le test anticheat de la section 7 remonte au **jalon M0** au lieu d'être un
   test tardif. Un binaire qui ne fait qu'installer un hook et ne touche aucune
   fenêtre est la sonde minimale idéale. Si un anticheat majeur réagit au hook
   seul, tout le reste du projet est caduc et il faut le savoir maintenant.
2. Une **signature de code** devient un poste de dépense du projet, pas une
   finition de M5. La réputation SmartScreen se construit avec le temps.
3. La confidentialité du journal cesse d'être une consigne pour devenir une
   propriété de construction. Voir D5.

I8 reste entier : un hook bas niveau est un mécanisme public de Windows, hors du
processus visé. Il n'injecte rien, ne charge aucune bibliothèque chez personne
et ne lit la mémoire d'aucun autre processus.

### D2 — Le callback décide seul d'avaler, donc l'état qu'il lit est immuable

I1 impose que la touche assignée n'arrive jamais au jeu. On ne peut pas différer
cette décision : la valeur de retour du callback est ce qui avale la touche, et
elle doit partir tout de suite. La décision est donc forcément synchrone, dans
le callback.

D'où `KeySnapshot` : un masque de 256 bits, immuable, publié par échange de
référence. Le callback fait une lecture de tableau et un masque. Pas de verrou,
pas de table de hachage, pas d'allocation.

Conséquence : remplacer la liste des raccourcis construit un nouvel instantané
au lieu de modifier l'ancien. Un callback en cours finit sa lecture sur la
version précédente, complète et cohérente — jamais sur un état à moitié écrit.

### D3 — Une touche est identifiée par son code virtuel **et** son code de balayage

Le code virtuel dépend de la disposition clavier : le `A` d'un AZERTY est le `Q`
d'un QWERTY. Le code de balayage désigne la touche physique.

On stocke les deux. Le hook compare le code virtuel, parce que c'est ce que
Windows lui remet. Le code de balayage est là pour qu'un joueur qui change de
disposition retrouve son raccourci au même endroit du clavier, et pour que
`GetKeyNameText` affiche le bon libellé.

Coût : deux champs au lieu d'un, et une règle de préséance à écrire au jalon M2,
quand la capture de touche existera.

### D4 — Le coup d'œil commence à l'enfoncement ; le seuil ne décide que du relâchement

À l'enfoncement, on ne peut pas savoir si ce sera une pression brève ou un
maintien. Attendre 250 ms pour l'apprendre ajouterait 250 ms au délai
d'affichage, et la section 6 donne 80 ms au voile.

Le coup d'œil commence donc immédiatement. Le seuil ne tranche qu'au
relâchement : refermer si la touche a été tenue, rester affiché sinon.

Corollaire : une seconde pression sur un raccourci resté affiché referme dès
l'enfoncement, pas au relâchement. La réaction doit être aussi immédiate à la
fermeture qu'à l'ouverture.

### D5 — Le journal ne peut pas contenir une touche non assignée

Un hook bas niveau voit tout ce qui est tapé sur la machine. Une règle qui
dirait « on ne journalise pas les autres touches » serait une consigne, et une
consigne se contourne par distraction.

La construction s'en charge à la place : le callback n'empile dans la file que
les touches présentes dans l'instantané. Les autres sont écartées avant même
d'être nommées, et rien en aval du hook ne peut donc les journaliser. Le fil de
travail n'a jamais l'occasion de mal se comporter.

Les touches que l'utilisateur a lui-même assignées apparaissent dans le journal,
puisqu'il les a choisies. `diagnosticLogging` n'ajoute que du détail de mesure.

### D6 — Icône de notification par `Shell_NotifyIcon`, sans WinForms ni dépendance tierce

`UseWindowsForms` amènerait une seconde boucle de messages dans un processus
WPF pour une icône et quatre entrées de menu. Une bibliothèque tierce amènerait
une licence à vérifier, dans un produit destiné à la vente.

Coût : environ deux cents lignes d'interop, et trois pièges à traiter à la main,
qui sont traités.

- Identification par `hWnd + uID`, jamais par `NIF_GUID` : le GUID est lié au
  chemin de l'exécutable, et l'icône disparaît si l'utilisateur déplace le
  dossier.
- Réenregistrement sur le message `TaskbarCreated` : sans lui, l'icône disparaît
  définitivement au redémarrage de l'explorateur.
- Fenêtre de niveau supérieur jamais affichée, et non fenêtre à messages seuls :
  `SetForegroundWindow` échoue sur ces dernières, et un menu contextuel qui ne
  se referme pas au clic à côté est un défaut visible.

### D7 — Tampon circulaire préalloué plutôt que `Channel<T>`

Un `Channel` non borné alloue par segments. Une allocation dans un callback de
hook peut tomber pendant une pause du ramasse-miettes, et Windows retire
purement et simplement un hook trop lent : touches perdues, impossibles à
reproduire, impossibles à déboguer.

Les emplacements sont donc réservés une fois pour toutes au démarrage. Un
producteur, un consommateur, aucun verrou, aucune opération atomique : chaque
index n'a qu'un seul écrivain.

Coût assumé : quand la file est pleine, l'événement est perdu et compté, au lieu
d'être mis en attente. Un callback qui attend est un défaut plus grave qu'un
événement perdu, et la perte, elle, se voit dans le journal.

### D8 — La configuration va dans `%APPDATA%`, pas dans `%LOCALAPPDATA%`

La section 5 de la spécification demande `%APPDATA%`. La liste de raccourcis
suit alors l'utilisateur sur un profil itinerant, ce qui est le comportement
attendu pour un réglage aussi personnel.

### D9 — `asInvoker`, donc les jeux lancés en administrateur ne sont pas pris en charge

Un hook non élevé ne reçoit pas les frappes destinées à une fenêtre élevée
(UIPI). Peek ne répond donc pas au-dessus d'un jeu lancé en administrateur.

L'alternative serait de demander l'élévation. Elle est refusée : un logiciel
qui se lance à côté d'un jeu et réclame les droits administrateur est un signal
d'alarme pour l'utilisateur comme pour les anticheat, et I8 vise précisément à
ne pas en déclencher.

Cette limite se dit franchement, dans l'application et sur la page de vente, au
même endroit que celle du plein écran exclusif.

### D10 — Globalisation invariante

Peek ne compare que des codes de touches et des noms de fenêtres. Le mode
invariant allège le binaire et le démarrage, et .NET 6 et suivants y assurent
quand même la casse Unicode complète.

C'est l'inverse du choix fait pour Babel, dans le même dépôt, et pour une bonne
raison : Babel manipule du japonais, du coréen et du chinois.

### D11 — La fenêtre de réglages existe dès M0, et elle est vide

M0 n'a besoin d'aucune fenêtre. Elle est écrite quand même, avec l'état vide de
la section 6 et rien d'autre, pour que la palette, la conscience DPI par écran
et le cycle de vie de la fenêtre soient éprouvés maintenant, et non découverts
au jalon où ils comptent.

Elle n'est construite qu'à la première ouverture : au repos, Peek n'entretient
aucun arbre visuel. C'est une condition de I6.

### D12 — Une seule fenêtre affichée à la fois

Appuyer sur la touche d'un second raccourci referme le premier. Les
dispositions à plusieurs fenêtres simultanées sont hors périmètre pour la
version 1 (section 8), et la machine à états le rend structurel plutôt que de
compter dessus.

### D13 — Usings implicites désactivés sur `Peek.App`

Le projet temporaire généré par le compilateur de markup WPF ne reprend pas les
usings implicites. Un fichier qui s'y fie compile dans la passe normale et
échoue dans la passe XAML, avec un message qui ne désigne pas la cause.

Usings explicites partout dans `Peek.App`, et les deux passes voient la même
chose. La leçon vient de Babel, dans le même dépôt.

### D14 — Peek vit dans un sous-dossier de ce dépôt, provisoirement

Peek est un produit distinct de Babel et mérite son propre dépôt. La création
d'un dépôt n'est pas accessible depuis l'environnement de travail actuel
(`403 Resource not accessible by integration`), et `Hazuri006/test` est le seul
dépôt joignable.

Peek est donc sous `peek/`, sans toucher à Babel ni à son `SPEC.md`. Le jour où
le dépôt existe, `git subtree split --prefix=peek` déplace l'ensemble avec son
historique intact.

---

## Points en attente d'arbitrage

Ils ne bloquent pas M0 mais engagent les jalons suivants.

1. **Tension entre I1 et le mode utilisation.** I1 impose que la touche assignée
   soit avalée partout. Or en mode utilisation, l'utilisateur tape dans la
   fenêtre affichée : sa touche `T` y serait avalée aussi. Une règle est
   nécessaire avant M3 — par exemple, cesser d'avaler quand Peek détient le
   focus, la sortie se faisant par `Échap`. C'est pour cela qu'`Échap` figure
   déjà dans les touches réservées de `ShortcutConflicts`.
2. **Signature de code.** Voir D1, point 3. À budgéter, pas à repousser.
3. **Comportement à la disparition de la fenêtre visée** pendant un coup d'œil
   (test 6 de la section 7). Décidé à M1.

---

## Journal des mesures

Les relevés du hook (durée du callback, délai de file, événements perdus) sont
écrits dans le journal à la fermeture de Peek. Le budget est d'une milliseconde
par passage dans le callback ; au-delà de 250 ms, le hook est réinstallé sans
attendre que Windows le retire de lui-même.
