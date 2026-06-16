# Game Design — DRIFTWAKE

## Pitch

Survie maritime à la première personne. Le joueur, naufragé sur un petit radeau, doit
récupérer des ressources flottantes, agrandir et améliorer son embarcation, gérer ses
besoins vitaux, repousser un requin et explorer des îles, le tout sous un cycle jour/nuit
et une météo changeante.

## Boucle de jeu principale

1. **Récupérer** des débris (crochet, main, filet) → bois, plastique, fibre, ferraille…
2. **Fabriquer** des outils et des matériaux raffinés (corde, clous, planches).
3. **Construire / agrandir** le radeau (fondations, murs, stations).
4. **Subvenir** à ses besoins : pêcher, cuisiner, purifier de l'eau, cultiver.
5. **Survivre** aux menaces : requin, tempêtes, faim/soif, noyade.
6. **Explorer** les îles pour des ressources rares (bois, pierre, argile, coffres).
7. **Progresser** via la recherche (nouvelles recettes) et la montée en gamme des outils.

## Statistiques de survie

| Stat        | Baisse                              | Conséquence à vide                    |
| ----------- | ----------------------------------- | ------------------------------------- |
| Santé       | Dégâts (requin, chute, faim/soif)   | Mort → écran de mort, réapparition    |
| Faim        | Progressive                         | Dégâts de santé                       |
| Soif        | Progressive (plus rapide que faim)  | Dégâts de santé                       |
| Endurance   | Sprint, sauts, coups                | Plus de sprint                        |
| Oxygène     | Sous l'eau                          | Dégâts (noyade)                       |
| Température  | Nuit / tempête / immersion          | Influence d'ambiance (extensible)     |

- L'**eau salée** bue telle quelle **aggrave** la soif et coûte de la santé → il faut la
  **purifier**.
- La régénération de santé n'a lieu que bien nourri **et** hydraté.
- Le poisson **cru** est risqué (−santé) ; **grillé** il restaure faim + santé + un bonus
  d'endurance temporaire ; **brûlé** s'il cuit trop longtemps.

## Économie & artisanat

`ItemDatabase` et `RecipeDatabase` centralisent objets et recettes. Catégories : outils,
armes, matériaux, cuisine, agriculture, stockage, machines, équipement. La **table de
recherche** débloque des recettes avancées en sacrifiant des matériaux.

Chaîne d'exemple : `fibre ×2 → corde` · `ferraille → clou ×2` · `bois ×2 → planche` ·
`bois ×3 + plastique ×2 → marteau` · `bois ×4 → fondation`.

## Le requin (antagoniste)

Machine à états : **Patrol → CircleRaft → Investigate → ChasePlayer → BitePlayer /
AttackRaft → Flee / Stunned → Dead**. Comportements clés :

- **Télégraphe** : la morsure est précédée d'un recul + grognement (~0,6 s) → le joueur
  peut réagir (sortir de l'eau, frapper à la lance).
- **Perception** : ne chasse que si le joueur est **dans l'eau** et à portée ; perd
  l'intérêt au-delà d'un rayon.
- **Évitement** : contourne radeau et îles, sauf pendant une charge (par conception).
- **Dégâts au radeau** : cible la fondation la plus proche ; elle peut céder.
- **Mort & butin** : laisse des ressources, puis **réapparaît** après un délai configurable.

## Îles

Générées de façon **déterministe** depuis le seed du monde : une île proche (~110 m) pour
un accès précoce, d'autres plus lointaines. Contenu : plage de sable, palmiers et rochers
**récoltables** (hache/main), buissons instanciés, plateau rocheux immergé, coffre à
butin sur l'île de départ.

## Météo & temps

Transitions clair → nuageux → pluie → tempête, influençant la hauteur des vagues, le
brouillard/visibilité, le vent (audio + dérive des débris), la pluie en particules et les
éclairs. Cycle jour/nuit avec lever/coucher, lune et étoiles.

## Progression de difficulté

- **Début** : mer calme, ressources proches, requin en patrouille.
- **Montée** : besoins qui pressent, météo plus rude, requin plus insistant, exploration
  d'îles lointaines pour pierre/argile/objets rares.

## Accessibilité & options

Sensibilité souris, inversion Y, FOV, volumes (principal/musique/effets/ambiance),
reconfiguration des touches, 4 préréglages graphiques, HUD lisible et contrasté.
