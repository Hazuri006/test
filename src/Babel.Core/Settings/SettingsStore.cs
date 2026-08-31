using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Babel.Core.Settings;

/// <summary>
/// Chargement et sauvegarde des reglages.
///
/// Trois exigences guident cette classe :
/// l'ecriture est atomique, pour qu'une coupure ne laisse jamais un fichier
/// tronque ; la sauvegarde est differee, pour qu'un glissement de l'overlay a la
/// souris ne declenche pas des centaines d'ecritures ; un fichier illisible
/// ramene les valeurs par defaut sans jamais faire tomber l'application.
/// </summary>
public sealed class SettingsStore : IDisposable
{
    private static readonly TimeSpan SaveDelay = TimeSpan.FromMilliseconds(500);

    private readonly string _filePath;
    private readonly ILogger<SettingsStore> _logger;
    private readonly object _gate = new();
    private readonly Timer _debounce;

    private BabelSettings _current = new();
    private bool _disposed;

    public SettingsStore(string filePath, ILogger<SettingsStore> logger)
    {
        ArgumentException.ThrowIfNullOrEmpty(filePath);

        _filePath = filePath;
        _logger = logger;
        _debounce = new Timer(_ => SaveNow(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
    }

    /// <summary>Chemin par defaut : local a la machine, jamais itinerant.</summary>
    public static string DefaultPath => Path.Combine(DefaultDirectory, "settings.json");

    public static string DefaultDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Babel");

    public BabelSettings Current
    {
        get
        {
            lock (_gate)
            {
                return _current;
            }
        }
    }

    public BabelSettings Load()
    {
        lock (_gate)
        {
            _current = ReadOrDefault();
            return _current;
        }
    }

    /// <summary>Demande une sauvegarde differee. Les appels rapproches se fondent en un seul.</summary>
    public void RequestSave()
    {
        if (_disposed)
        {
            return;
        }

        _debounce.Change(SaveDelay, Timeout.InfiniteTimeSpan);
    }

    /// <summary>Sauvegarde immediate, utilisee a la fermeture de l'application.</summary>
    public void SaveNow()
    {
        lock (_gate)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_filePath)!);

                var temporaryPath = _filePath + ".tmp";
                var json = JsonSerializer.Serialize(_current, SettingsJsonContext.Default.BabelSettings);

                File.WriteAllText(temporaryPath, json);

                // Remplacement en une operation : le fichier final est soit
                // l'ancien complet, soit le nouveau complet, jamais un melange.
                File.Move(temporaryPath, _filePath, overwrite: true);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _logger.LogError(ex, "Impossible d'enregistrer les reglages dans {Path}.", _filePath);
            }
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _debounce.Dispose();
        SaveNow();
    }

    private BabelSettings ReadOrDefault()
    {
        if (!File.Exists(_filePath))
        {
            return new BabelSettings();
        }

        try
        {
            var json = File.ReadAllText(_filePath);
            var loaded = JsonSerializer.Deserialize(json, SettingsJsonContext.Default.BabelSettings);

            if (loaded is null)
            {
                return new BabelSettings();
            }

            if (loaded.SchemaVersion > BabelSettings.CurrentSchemaVersion)
            {
                _logger.LogWarning(
                    "Le fichier de reglages vient d'une version plus recente ({Found} > {Known}). Valeurs par defaut appliquees.",
                    loaded.SchemaVersion,
                    BabelSettings.CurrentSchemaVersion);

                return new BabelSettings();
            }

            return loaded;
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            _logger.LogError(ex, "Fichier de reglages illisible, valeurs par defaut appliquees.");
            QuarantineCorruptFile();
            return new BabelSettings();
        }
    }

    /// <summary>
    /// Met le fichier fautif de cote au lieu de l'ecraser : si l'utilisateur avait
    /// une configuration longue, elle reste recuperable a la main.
    /// </summary>
    private void QuarantineCorruptFile()
    {
        try
        {
            File.Move(_filePath, _filePath + ".corrupt", overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogWarning(ex, "Le fichier de reglages illisible n'a pas pu etre mis de cote.");
        }
    }
}
