using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Peek.Core.Configuration;

/// <summary>
/// Lecture et ecriture de la configuration.
///
/// Trois exigences : l'ecriture est atomique, pour qu'une coupure de courant ne
/// laisse jamais un fichier tronque ; la sauvegarde est differee, pour qu'une
/// serie de modifications ne declenche pas une serie d'ecritures ; un fichier
/// illisible ramene les defauts sans jamais faire tomber l'application, et il
/// est mis de cote au lieu d'etre ecrase.
///
/// Aucun minuteur ne tourne au repos : le minuteur de sauvegarde est arme a la
/// demande et se desarme seul. C'est une condition de I6.
/// </summary>
public sealed class ConfigStore : IDisposable
{
    private static readonly TimeSpan SaveDelay = TimeSpan.FromMilliseconds(500);

    private readonly string _filePath;
    private readonly ILogger<ConfigStore> _logger;
    private readonly object _gate = new();
    private readonly Timer _debounce;

    private PeekConfig _current = new();
    private bool _pending;
    private bool _disposed;

    public ConfigStore(string filePath, ILogger<ConfigStore> logger)
    {
        ArgumentException.ThrowIfNullOrEmpty(filePath);
        ArgumentNullException.ThrowIfNull(logger);

        _filePath = filePath;
        _logger = logger;
        _debounce = new Timer(_ => SaveNow(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
    }

    /// <summary>
    /// %APPDATA%\Peek. La specification demande %APPDATA% et non le dossier
    /// local : la configuration suit l'utilisateur sur un profil itinerant.
    /// </summary>
    public static string DefaultDirectory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Peek");

    public static string DefaultPath => Path.Combine(DefaultDirectory, "config.json");

    /// <summary>Fichier de reprise apres plantage (I4). Ecrit a partir de M1.</summary>
    public static string RestoreStatePath => Path.Combine(DefaultDirectory, "restore-state.json");

    public static string LogDirectory => Path.Combine(DefaultDirectory, "logs");

    public PeekConfig Current
    {
        get
        {
            lock (_gate)
            {
                return _current;
            }
        }
    }

    public PeekConfig Load()
    {
        lock (_gate)
        {
            _current = ReadOrDefault();
            _current.Normalize();
            return _current;
        }
    }

    /// <summary>Sauvegarde differee. Les appels rapproches se fondent en une seule ecriture.</summary>
    public void RequestSave()
    {
        if (_disposed)
        {
            return;
        }

        _pending = true;
        _debounce.Change(SaveDelay, Timeout.InfiniteTimeSpan);
    }

    /// <summary>Ecriture immediate et inconditionnelle.</summary>
    public void SaveNow()
    {
        lock (_gate)
        {
            if (_disposed)
            {
                return;
            }

            WriteAtomically(_current);
            _pending = false;
        }
    }

    /// <summary>
    /// Ferme le magasin en ecrivant ce qui restait en attente, et rien de plus.
    ///
    /// Ecrire inconditionnellement ici serait un piege : quand le fichier vient
    /// d'une version plus recente de Peek, sa lecture rend les defauts, et une
    /// ecriture a la fermeture remplacerait alors la configuration de
    /// l'utilisateur par du vide. Une sauvegarde ne se declenche que si quelque
    /// chose a demande a etre sauvegarde.
    /// </summary>
    public void Dispose()
    {
        lock (_gate)
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            _debounce.Dispose();

            if (_pending)
            {
                WriteAtomically(_current);
                _pending = false;
            }
        }
    }

    private void WriteAtomically(PeekConfig config)
    {
        var temporaryPath = _filePath + ".tmp";

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_filePath)!);

            var json = JsonSerializer.Serialize(config, ConfigJsonContext.Default.PeekConfig);
            File.WriteAllText(temporaryPath, json);

            // Remplacement en une operation : le fichier final est soit l'ancien
            // complet, soit le nouveau complet, jamais un melange des deux.
            File.Move(temporaryPath, _filePath, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or NotSupportedException)
        {
            _logger.LogError(ex, "Impossible d'enregistrer la configuration dans {Path}.", _filePath);
            TryDelete(temporaryPath);
        }
    }

    private PeekConfig ReadOrDefault()
    {
        if (!File.Exists(_filePath))
        {
            return new PeekConfig();
        }

        try
        {
            var json = File.ReadAllText(_filePath);
            var loaded = JsonSerializer.Deserialize(json, ConfigJsonContext.Default.PeekConfig);

            if (loaded is null)
            {
                return new PeekConfig();
            }

            if (loaded.SchemaVersion > PeekConfig.CurrentSchemaVersion)
            {
                // Une version plus recente de Peek a ecrit ce fichier. Le lire a
                // moitie serait pire que de repartir des defauts, mais l'ecraser
                // le serait encore plus : on le met de cote comme un fichier
                // illisible, et l'utilisateur le retrouve s'il reinstalle.
                _logger.LogWarning(
                    "La configuration vient d'une version plus recente ({Found} > {Known}). Defauts appliques, fichier conserve en .newer.",
                    loaded.SchemaVersion,
                    PeekConfig.CurrentSchemaVersion);

                MoveAside(".newer");
                return new PeekConfig();
            }

            return loaded;
        }
        catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
        {
            _logger.LogError(ex, "Configuration illisible, defauts appliques.");
            MoveAside(".corrupt");
            return new PeekConfig();
        }
    }

    /// <summary>
    /// Met le fichier fautif de cote plutot que de l'ecraser : une liste de
    /// raccourcis patiemment construite reste recuperable a la main.
    /// </summary>
    private void MoveAside(string suffix)
    {
        try
        {
            File.Move(_filePath, _filePath + suffix, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogWarning(ex, "Le fichier de configuration n'a pas pu etre mis de cote en {Suffix}.", suffix);
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Sans consequence : le fichier temporaire sera ecrase au prochain tour.
        }
    }
}
