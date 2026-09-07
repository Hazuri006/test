# Babel

Sous-titres traduits en temps réel, affichés par-dessus n'importe quelle
application Windows, sans aucune intégration côté application cible.

La spécification complète est dans [SPEC.md](SPEC.md). Les choix d'architecture et
leur justification sont dans [DECISIONS.md](DECISIONS.md), les mesures de latence
dans [PERF.md](PERF.md), les licences dans [LICENSES.md](LICENSES.md).

## État

**Jalon M1 — audio et transcription.** Capture du son système, choix du
périphérique, vumètre, découpage en phrases par Silero VAD, transcription par
whisper.cpp. Le texte affiché est celui qui est **entendu**, dans sa langue
d'origine.

**La traduction n'existe pas encore** : elle arrive au jalon M2. Choisir
« langue affichée : français » enregistre le choix mais ne change rien pour
l'instant.

## Structure

| Dossier | Contenu |
|---|---|
| `src/Babel.Core` | Pipeline, politique de rejet, métriques, réglages. Sans WPF, testable partout. |
| `src/Babel.App` | WPF, interop Win32, overlay, réglages, HUD. Windows uniquement. |
| `tests/Babel.Core.Tests` | Tests du noyau. |

## Modèles à déposer

Aucun téléchargement n'a lieu à l'exécution — c'est la contrainte 2 de la
spécification, et le téléchargement explicite arrive en M5. En attendant, dépose
ces deux fichiers dans `%LOCALAPPDATA%\Babel\models\` :

```powershell
$dossier = "$env:LOCALAPPDATA\Babel\models"
New-Item -ItemType Directory -Force -Path $dossier | Out-Null

# Transcription — environ 190 Mo
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin" `
                  -OutFile "$dossier\ggml-small-q5_1.bin"

# Détection de la parole — environ 2 Mo
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/snakers4/silero-vad/master/src/silero_vad/data/silero_vad.onnx" `
                  -OutFile "$dossier\silero_vad.onnx"
```

Sans eux, Babel se lance et le dit franchement dans l'écran Source, en nommant le
fichier manquant et son emplacement.

## Accélération matérielle

Par défaut, la transcription tourne sur le processeur. Pour l'accélération CUDA,
ajoute le paquet natif au projet — aucun changement de code n'est nécessaire, le
repli CUDA puis Vulkan puis processeur est déjà en place :

```powershell
dotnet add src\Babel.App package Whisper.net.Runtime.Cuda
```

Il pèse plus d'un gigaoctet, d'où son absence par défaut.

## Construire

```
dotnet build Babel.sln -c Release
dotnet test tests/Babel.Core.Tests/Babel.Core.Tests.csproj
```

La solution complète exige Windows : la compilation du markup WPF n'existe pas
ailleurs. `Babel.Core` et ses tests se compilent sur n'importe quelle plateforme.

## Raccourcis

| Raccourci | Effet |
|---|---|
| `Ctrl+Alt+Espace` | Met la chaîne en pause, ou la relance |
| `Ctrl+Alt+H` | Affiche ou masque les sous-titres |
| `Ctrl+Alt+P` | Rend le bandeau saisissable à la souris |
| `F9` | Affiche le HUD de latence |
| `Ctrl+Alt+S` | Écrit un relevé de latence dans `PERF.md` |

## Limite connue

Les sous-titres ne peuvent pas s'afficher au-dessus d'un jeu en **plein écran
exclusif**. Le mode fenêtré sans bordure est nécessaire. C'est une conséquence
directe du refus de toute injection dans le processus cible, et ce refus n'est pas
négociable : il protège les utilisateurs d'un bannissement par les anticheat.
