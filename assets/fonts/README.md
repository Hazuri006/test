# Polices

Les fichiers de police ne sont pas versionnés. Dépose-les ici et ils seront
embarqués automatiquement dans l'exécutable (voir `Babel.App.csproj`).

| Usage | Famille | Licence | Où la prendre |
|---|---|---|---|
| Interface | Source Sans 3 | OFL 1.1 | github.com/adobe-fonts/source-sans |
| Chiffres du HUD | JetBrains Mono | OFL 1.1 | github.com/JetBrains/JetBrainsMono |
| Sous-titres, latin | Noto Sans | OFL 1.1 | fonts.google.com/noto |
| Sous-titres, japonais | Noto Sans JP | OFL 1.1 | fonts.google.com/noto |
| Sous-titres, coréen | Noto Sans KR | OFL 1.1 | fonts.google.com/noto |
| Sous-titres, chinois simplifié | Noto Sans SC | OFL 1.1 | fonts.google.com/noto |

Tant que les fichiers sont absents, l'application reste utilisable : chaque
famille est déclarée avec une chaîne de repli vers les polices livrées avec
Windows (Segoe UI, Yu Gothic UI, Malgun Gothic, Microsoft YaHei, Consolas).
Le rendu est alors moins homogène entre les langues, rien de plus.

Les familles Noto CJK pèsent plusieurs dizaines de mégaoctets. Avant la
livraison Steam, il faudra les sous-ensembler aux plages réellement utilisées
plutôt que d'embarquer les fichiers complets.
