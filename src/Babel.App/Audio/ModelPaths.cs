using System.IO;
using Babel.App.Infrastructure;

namespace Babel.App.Audio;

/// <summary>
/// Ou l'application cherche ses modeles.
///
/// Contrainte 2 : rien n'est telecharge a l'execution. Le telechargement explicite,
/// dans un ecran dedie, est prevu pour M5 ; d'ici la, les fichiers sont deposes a
/// la main et l'application dit clairement lequel manque.
/// </summary>
internal static class ModelPaths
{
    internal static string Directory => Path.Combine(RepositoryPaths.LocalDirectory(), "models");

    internal static string Whisper => Path.Combine(Directory, "ggml-small-q5_1.bin");

    internal static string SileroVad => Path.Combine(Directory, "silero_vad.onnx");

    /// <summary>Message affichable quand un modele manque, en langage utilisateur.</summary>
    internal static string MissingMessage(string fileName) =>
        $"Le fichier {fileName} est absent. Dépose-le dans {Directory}, puis relance Babel.";
}
