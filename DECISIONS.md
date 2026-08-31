# Décisions

Chaque entrée dit ce qui a été choisi, contre quoi, et à quelle condition on
revient dessus. Une décision sans critère de bascule n'est pas une décision,
c'est une habitude.

---

## Jalon M0

### D1 — Les étages du pipeline tournent sur le pool de threads

**Choisi :** une tâche par étage, sur le pool de threads .NET.
**Écarté :** threads dédiés à priorité relevée pour Capture et VAD.

Le transport imposé par la spécification reste le même dans les deux cas :
`System.Threading.Channels` bornés en `DropOldest`. Seul l'ordonnancement change.

L'option écartée valait pour la gigue : quand un jeu sature tous les cœurs, une
tâche du pool peut attendre plusieurs millisecondes avant d'être servie, là où un
thread dédié reste sous 0,5 ms. Le surcoût était de deux threads et d'environ
1 Mo de pile chacun.

**Critère de bascule :** si, à partir de M1, le p95 de l'étage Capture ou VAD
dépasse son budget alors que le temps de traitement mesuré reste sous ce budget,
c'est une gigue d'ordonnancement, et on passe ces deux étages sur threads dédiés.

### D2 — Le sous-titre est poussé vers le thread d'interface

**Choisi :** `Dispatcher.InvokeAsync` à la priorité `Render` depuis l'étage de rendu.
**Écarté :** un emplacement unique lu à chaque trame par `CompositionTarget.Rendering`.

L'option retenue est plus rapide en moyenne — de 0,2 à 2 ms contre environ une
demi-trame, soit 8 ms à 60 Hz. Elle a en revanche un pire cas non borné : si le
Dispatcher est occupé, les invocations s'empilent, ce qui contredit l'esprit de
la contrainte 5.

**Critère de bascule :** si le p95 du rendu dépasse 16 ms alors que le temps de
composition de la géométrie reste faible, la file du Dispatcher est en cause et on
passe au modèle par tirage.

### D3 — Transparence par `AllowsTransparency` plutôt que DirectComposition

**Choisi :** fenêtre WPF avec `AllowsTransparency = true`.
**Écarté :** `WS_EX_NOREDIRECTIONBITMAP` avec DirectComposition, 3 à 4 jours de travail.

L'overlay ne se redessine qu'au changement de sous-titre, donc le coût au repos
est proche de zéro. Le gain de l'option écartée est le chemin de composition
matériel ; elle ne rétablit pas ClearType pour autant, l'alpha prémultiplié
l'interdit dans les deux cas.

**Critère de bascule :** p95 du rendu hors budget avec une charge processeur
visible sur le thread d'interface au repos.

### D4 — JSON pour les réglages, SQLite à partir de M4

**Choisi :** un fichier JSON dans `%LOCALAPPDATA%\Babel\settings.json`.
**Écarté :** SQLite dès M0.

Introduire un schéma et des migrations pour une douzaine de valeurs coûte plus
qu'il ne rapporte. SQLite arrive avec les profils et les glossaires, qui sont de
vraies données relationnelles ; les deux cohabiteront sans gêne.

Détails qui comptent : écriture atomique par fichier temporaire puis remplacement,
sauvegarde différée de 500 ms pour qu'un glissement à la souris ne déclenche pas
des centaines d'écritures, fichier illisible mis de côté en `.corrupt` au lieu
d'être écrasé.

### D5 — Polices sous OFL 1.1

**Choisi :** Source Sans 3 pour l'interface, JetBrains Mono pour le HUD, Noto Sans
et les familles Noto CJK pour les sous-titres. Toutes en OFL 1.1.

La licence OFL 1.1 ne figure pas dans la liste de la section 4 de la
spécification, la question a donc été posée avant intégration et la réponse est
oui. L'OFL autorise sans ambiguïté la redistribution dans un logiciel commercial ;
elle impose que les fichiers de police restent sous OFL et encadre les noms
réservés. Rien de tout cela ne gêne une vente sur Steam.

Constat qui a motivé la question : il n'existe pas de famille CJK complète sous
Apache-2.0. Se limiter à la liste d'origine aurait signifié dépendre des polices
système de Windows pour le cœur même du produit.

---

## Autres décisions du jalon M0

### Raccourcis globaux par `RegisterHotKey`, jamais par hook clavier

Un hook `WH_KEYBOARD_LL` verrait toutes les frappes du système. C'est la signature
exacte d'un enregistreur de frappe : faux positifs antivirus, attention des
anticheat. `RegisterHotKey` ne voit que la combinaison demandée. La contrainte 1
interdit l'injection ; l'esprit de cette contrainte interdit aussi ce hook.

Conséquence assumée : une combinaison déjà prise par une autre application échoue.
L'échec est montré à l'utilisateur en clair dans les réglages plutôt que subi.

### `WS_EX_NOACTIVATE` ajouté à la liste de la spécification

La spécification demande `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW`.
Sans `WS_EX_NOACTIVATE`, l'affichage de l'overlay peut faire perdre le focus au
jeu. Ce quatrième style ne change rien à la contrainte 1 : il porte sur notre
propre fenêtre.

Conséquence : `Window.DragMove` ne fonctionne pas sur une fenêtre non activable.
Le mode déplacement capture donc la souris et déplace la fenêtre à la main.

### Position au premier plan réaffirmée à 1 Hz

Un jeu en fenêtre sans bordure peut repasser devant l'overlay. On se replace par
`SetWindowPos` sur notre propre fenêtre, sans activation. Aucun appel ne touche le
processus cible.

### Géométrie du sous-titre construite hors du thread d'interface

WPF n'a pas de contour de texte natif. On construit la géométrie du texte, puis on
la trace avec un stylo. Ce travail — de 0,3 à 1,5 ms — a lieu sur le thread
appelant, et la géométrie est gelée avant d'être remise au thread d'interface, qui
ne fait plus que deux `DrawGeometry`.

**À vérifier au premier lancement sur Windows :** `FormattedText` et `FontFamily`
sont utilisés ici depuis un thread de travail. C'est une pratique établie et le
gel lève l'affinité de thread, mais ça n'a pas pu être exécuté depuis
l'environnement de développement, qui est sous Linux. Si un problème apparaît, le
repli est de deux lignes : appeler `Compose` à l'intérieur du callback du
Dispatcher, ce qui remet environ 1 ms sur le thread d'interface — sans danger pour
un budget de 16 ms.

### Opacité adaptative du fond reportée à M3

La section 5 demande un fond dont l'opacité suit la luminance des pixels situés
derrière. Cela suppose de capturer ces pixels, donc `Windows.Graphics.Capture`,
qui arrive avec l'OCR en M3. M0 livre une opacité fixe réglable et l'interface qui
recevra le calcul. Dette assumée, pas oubliée.

### Un seul moniteur en M0

L'overlay se place sur la zone de travail du moniteur principal. Le champ
`MonitorDeviceName` existe déjà dans les réglages mais n'est pas encore utilisé :
le choix du moniteur arrivera avec les profils, en M4.

### Fermer la fenêtre de réglages quitte Babel

Il n'y a pas encore d'icône de zone de notification. Fermer la fenêtre principale
arrête donc l'application, ce qui est le comportement le moins surprenant en
l'absence d'un autre chemin de retour. L'icône de notification est un sujet de
finition, donc M5.

### Habillage complet des contrôles reporté à M5

M0 pose la palette, la typographie, la mise en page, le voyant et le vumètre. Les
gabarits complets des contrôles WPF standards — liste déroulante, curseur — sont
un travail de finition et relèvent de M5. Les couleurs et les polices sont déjà
celles de la section 5 ; ce sont les gabarits qui manquent.

### Usings implicites désactivés sur Babel.App

Le compilateur de markup WPF génère un projet temporaire pour sa première passe,
et ce projet ne reprend pas les usings implicites du projet d'origine. Un fichier
qui s'y fie compile dans la passe normale et échoue dans la passe XAML — sur
`System.IO` en particulier, donc `Path`, `File` et `Directory`.

`ImplicitUsings` est donc désactivé sur `Babel.App` et chaque fichier déclare ce
qu'il utilise. Les deux passes voient exactement le même code, et la divergence ne
peut plus réapparaître. `Babel.Core` garde les usings implicites : il ne contient
aucun XAML.

Corollaire à connaître : un élément portant un `x:Name` doit exposer un
constructeur public. `StatusLamp` et `VuMeter` sont publics pour cette raison, et
non par choix d'API.

### Limite du plein écran exclusif

Un overlay externe ne s'affiche pas au-dessus d'un jeu en plein écran exclusif.
C'est écrit dans l'écran Affichage, en langage utilisateur. Aucune tentative de
contournement : voir contrainte 1.
