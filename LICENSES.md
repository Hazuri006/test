# Licences

Le produit est vendu. Chaque dépendance et chaque modèle doit être compatible avec
une vente commerciale, sans clause non commerciale et sans obligation de diffuser
le code du produit.

**Interdit explicitement : NLLB, en CC-BY-NC.** Toute clause « NC » disqualifie une
ressource, quel que soit son intérêt technique.

## Dépendances intégrées

| Composant | Version | Licence | Rôle |
|---|---|---|---|
| .NET 8 (runtime, SDK, WPF) | 8.0 | MIT | Plateforme |
| Microsoft.Extensions.Logging.Abstractions | 8.0.2 | MIT | Journalisation locale |
| Microsoft.Extensions.Logging | 8.0.1 | MIT | Journalisation locale |
| Microsoft.Extensions.DependencyInjection | 8.0.1 | MIT | Racine de composition |
| NAudio | 2.2.1 | MIT | Capture WASAPI, rééchantillonnage |
| Microsoft.ML.OnnxRuntime | 1.20.1 | MIT | Exécution de Silero VAD |
| Whisper.net | 1.8.1 | MIT | Liaison .NET vers whisper.cpp |
| Whisper.net.Runtime | 1.8.1 | MIT | Bibliothèque native whisper.cpp, processeur |

## Dépendances de développement seulement

Elles ne sont pas distribuées avec le produit.

| Composant | Version | Licence |
|---|---|---|
| xunit | 2.9.2 | Apache-2.0 |
| xunit.runner.visualstudio | 2.8.2 | Apache-2.0 |
| Microsoft.NET.Test.Sdk | 17.12.0 | MIT |

## Modèles

Ils ne sont pas versionnés : l'utilisateur les dépose lui-même, et le
téléchargement intégré arrive en M5. Voir le README pour les emplacements.

| Modèle | Licence | Rôle |
|---|---|---|
| silero_vad.onnx | MIT | Détection de la parole |
| ggml-small-q5_1.bin (whisper.cpp) | MIT | Transcription |

Les poids Whisper sont publiés par OpenAI sous licence MIT, et les conversions
ggml distribuées avec whisper.cpp le restent. Silero VAD est passé en MIT à partir
de sa version 4 ; les versions antérieures étaient en AGPL et sont donc à écarter.

## Polices

Décision D5 : l'OFL 1.1 est acceptée pour les polices embarquées, alors que la
section 4 de la spécification ne listait que MIT, Apache-2.0, BSD et CC-BY-4.0.
L'OFL autorise la redistribution dans un logiciel commercial ; elle impose que les
fichiers de police restent sous OFL et réserve certains noms. Il n'existe pas de
famille CJK complète sous Apache-2.0, ce qui rendait la liste d'origine intenable
pour un produit dont les sous-titres sont le cœur.

| Police | Licence | Usage |
|---|---|---|
| Source Sans 3 | OFL 1.1 | Interface |
| JetBrains Mono | OFL 1.1 | Chiffres du HUD |
| Noto Sans | OFL 1.1 | Sous-titres, latin |
| Noto Sans JP / KR / SC | OFL 1.1 | Sous-titres, CJK |

Les fichiers ne sont pas encore versionnés ; voir `assets/fonts/README.md`.
L'OFL exige que le texte de la licence accompagne les fichiers de police : il
devra être livré dans le paquet d'installation, pas seulement ici.

## À vérifier au moment de l'intégration

Ces composants sont prévus par la spécification mais pas encore intégrés. La
licence indiquée est celle attendue ; elle sera confirmée, et cette table mise à
jour, au moment où le composant entre réellement dans le produit.

| Composant | Jalon | Licence attendue |
|---|---|---|
| Whisper.net.Runtime.Cuda | M1, si la mesure l'exige | MIT |
| CTranslate2 | M2 | MIT |
| Modèles opus-mt (Helsinki-NLP) | M2 | CC-BY-4.0 — à confirmer paire par paire |
| PaddleOCR en ONNX, si repli nécessaire | M3 | Apache-2.0 |
| LLM local pour le mode contextuel | après M2 | Apache-2.0 exigée |

`Windows.Media.Ocr` et `Windows.Graphics.Capture` font partie de Windows et ne
demandent aucune licence supplémentaire.
