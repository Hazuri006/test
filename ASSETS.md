# Assets — DRIFTWAKE

> **Principe directeur :** aucun asset n'est copié d'un autre jeu. **Tout** est généré de
> façon procédurale au moment de l'exécution, ou défini par du code original. Il n'y a
> donc **aucun fichier binaire d'asset** dans le dépôt et **aucune dépendance de licence
> tierce** en dehors de Three.js (MIT).

## Tableau récapitulatif

| Asset                         | Emplacement (générateur)                  | Rôle                                   | Format         | Licence | Auteur  | Source       | Statut |
| ----------------------------- | ----------------------------------------- | -------------------------------------- | -------------- | ------- | ------- | ------------ | ------ |
| Texture bois (albedo)         | `rendering/TextureFactory.ts`             | Planches du radeau, débris             | Canvas 2D → `CanvasTexture` | Originale (générée) | Projet | Runtime | Définitif (procédural) |
| Texture sable                 | `rendering/TextureFactory.ts`             | Plages des îles                        | Canvas 2D      | Originale | Projet | Runtime | Définitif |
| Texture métal                 | `rendering/TextureFactory.ts`             | Ferraille, structures métalliques      | Canvas 2D      | Originale | Projet | Runtime | Définitif |
| Normal maps (value-noise)     | `rendering/TextureFactory.ts`             | Détail océan, bois, roche              | Canvas 2D      | Originale | Projet | Runtime | Définitif |
| Sprite de particule           | `rendering/TextureFactory.ts`             | Pluie, écume, éclaboussures            | Canvas 2D      | Originale | Projet | Runtime | Définitif |
| Icônes d'objets               | `ui/IconFactory.ts`                       | Inventaire, hotbar, recettes           | Canvas 2D → data URL | Originale | Projet | Runtime | Définitif |
| Géométrie radeau (pièces)     | `raft/RaftMeshes.ts`                      | Fondations, murs, stations…            | `BufferGeometry` (code) | Originale | Projet | Runtime | Placeholder propre |
| Géométrie débris flottants    | `entities/resources/DebrisFactory.ts`     | Planches, bouteilles, tonneaux, etc.   | `BufferGeometry` (code) | Originale | Projet | Runtime | Placeholder propre |
| Modèle de requin              | `entities/SharkModel.ts`                  | Antagoniste                            | `BufferGeometry` (code, low-poly animable) | Originale | Projet | Runtime | Placeholder propre |
| Îles (plage, palmiers, rochers) | `world/IslandManager.ts`                | Exploration                            | `BufferGeometry` (code) | Originale | Projet | Runtime | Placeholder propre |
| Ciel / soleil / lune / étoiles | `rendering/Sky.ts`                       | Atmosphère                             | Shader GLSL (code) | Originale | Projet | Runtime | Définitif |
| Océan (vagues, écume, fresnel) | `world/ocean/OceanShader.ts`             | Mer                                    | Shader GLSL (code) | Originale | Projet | Runtime | Définitif |
| Sons (ambiance, SFX)          | `core/AudioManager.ts`                    | Vagues, vent, crochet, requin, UI…     | Web Audio (synthèse) | Originale | Projet | Runtime | Temporaire (synthétique) |
| Musique                       | —                                         | —                                      | —              | —       | —       | —            | À ajouter (libre de droits) |

## Pourquoi des placeholders procéduraux ?

Claude Code ne peut pas produire de fichiers `.glb` riggés complexes directement. Plutôt
que de bloquer le jeu ou d'afficher un cube blanc, chaque objet utilise une **géométrie
procédurale low-poly propre et cohérente**, avec matériaux PBR. Le jeu est ainsi
**entièrement jouable sans aucun fichier d'asset**.

## Remplacer un placeholder par un modèle glTF/GLB

1. Placez le fichier dans `public/models/` (créez le dossier) — Vite le servira tel quel.
2. Chargez-le avec `GLTFLoader` (`three/addons/loaders/GLTFLoader.js`) dans un
   `AssetManager` ou directement dans le factory concerné.
3. **Conservez** : l'échelle attendue (ex. requin ≈ 5 m de long, fondation = `CELL_SIZE`
   = 4 m de côté), l'orientation (le requin avance vers **+Z**), le pivot (origine au
   centre de la cellule au niveau du pont pour les pièces de radeau), et les références de
   parties animables publiques (`SharkModel.tailPivot`, `.jaw`) pour ne pas casser
   l'animation.
4. Documentez l'asset importé dans le tableau ci-dessus (licence, auteur, source).
5. Pour des textures importées : préférez le KTX2/Basis compressé et réduisez la taille.

## Conformité

- Aucun nom, logo, personnage, modèle, texture, son ou interface provenant d'un jeu
  existant n'est utilisé.
- Le nom **DRIFTWAKE**, l'identité visuelle (palette bois/océan), les noms d'objets et de
  recettes sont originaux.
