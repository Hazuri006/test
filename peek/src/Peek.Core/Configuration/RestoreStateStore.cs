using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Peek.Core.Configuration;

/// <summary>
/// Le filet de I4.
///
/// Avant toute modification d'une fenetre, son etat d'origine est ecrit ici.
/// Au demarrage, si le fichier existe, c'est que Peek a ete tue en plein coup
/// d'oeil : on restitue tout, puis on le supprime.
///
/// Le fichier est ecrit de facon atomique et il est minuscule, parce qu'il est
/// sur le chemin critique : il part sur le disque avant que la fenetre ne
/// bouge, et le voile a 80 ms pour apparaitre.
/// </summary>
public sealed class RestoreStateStore
{
    private readonly string _filePath;
    private readonly ILogger<RestoreStateStore> _logger;

    public RestoreStateStore(string filePath, ILogger<RestoreStateStore> logger)
    {
        ArgumentException.ThrowIfNullOrEmpty(filePath);
        ArgumentNullException.ThrowIfNull(logger);

        _filePath = filePath;
        _logger = logger;
    }

    public bool Exists => File.Exists(_filePath);

    /// <summary>Ecrit l'etat d'origine. Retourne faux si l'ecriture a echoue.</summary>
    public bool Write(RestoreState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        var temporaryPath = _filePath + ".tmp";

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_filePath)!);

            var json = JsonSerializer.Serialize(state, ConfigJsonContext.Default.RestoreState);
            File.WriteAllText(temporaryPath, json);
            File.Move(temporaryPath, _filePath, overwrite: true);

            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or NotSupportedException)
        {
            // Sans ce fichier, un plantage laisserait des fenetres deplacees et
            // topmost. On ne touche donc a rien.
            _logger.LogError(ex, "Impossible d'ecrire l'etat de restitution. Le coup d'oeil est annule.");
            return false;
        }
    }

    /// <summary>Lit l'etat laisse par une execution precedente, s'il y en a un.</summary>
    public RestoreState? Read()
    {
        if (!File.Exists(_filePath))
        {
            return null;
        }

        try
        {
            var state = JsonSerializer.Deserialize(
                File.ReadAllText(_filePath),
                ConfigJsonContext.Default.RestoreState);

            if (state is null)
            {
                return null;
            }

            if (state.SchemaVersion > RestoreState.CurrentSchemaVersion)
            {
                _logger.LogWarning(
                    "Etat de restitution ecrit par une version plus recente ({Found}). Ignore.",
                    state.SchemaVersion);

                return null;
            }

            return state;
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            _logger.LogError(ex, "Etat de restitution illisible. Les fenetres devront etre remises a la main.");
            return null;
        }
    }

    /// <summary>Efface le filet, une fois la restitution faite.</summary>
    public void Clear()
    {
        try
        {
            File.Delete(_filePath);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogWarning(ex, "L'etat de restitution n'a pas pu etre efface.");
        }
    }
}
