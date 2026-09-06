using System;
using System.Globalization;
using System.IO;
using System.Text;
using Microsoft.Extensions.Logging;

namespace Peek.App.Infrastructure;

/// <summary>
/// Journal local, dans un fichier, et rien d'autre. Ni remontee de plantage, ni
/// telemetrie : le produit est hors ligne, sans compte, et le reste jusqu'au
/// bout. Le fichier existe pour que l'utilisateur puisse l'ouvrir, ou l'envoyer
/// lui-meme s'il le decide.
///
/// Sur la confidentialite : un hook clavier bas niveau voit tout ce qui est
/// tape sur la machine. Rien de tout cela n'arrive jusqu'ici. Le callback ne met
/// dans la file que les touches assignees par l'utilisateur, les autres sont
/// ecartees avant meme d'etre nommees. Voir DECISIONS.md, D5.
/// </summary>
internal sealed class FileLoggerProvider : ILoggerProvider
{
    private readonly object _gate = new();
    private readonly string _filePath;
    private readonly LogLevel _minimum;

    internal FileLoggerProvider(string directory, LogLevel minimum)
    {
        Directory.CreateDirectory(directory);
        _minimum = minimum;

        _filePath = Path.Combine(directory, $"peek-{DateTime.Now:yyyy-MM-dd}.log");

        TrimOldLogs(directory);
    }

    public ILogger CreateLogger(string categoryName) => new FileLogger(this, categoryName, _minimum);

    public void Dispose()
    {
    }

    private void Write(string line)
    {
        lock (_gate)
        {
            try
            {
                File.AppendAllText(_filePath, line + Environment.NewLine, Encoding.UTF8);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // Un journal qui echoue ne doit jamais faire tomber l'application.
            }
        }
    }

    /// <summary>Garde une semaine, pas davantage. Personne ne relit un journal d'il y a un mois.</summary>
    private static void TrimOldLogs(string directory)
    {
        try
        {
            var cutoff = DateTime.Now.AddDays(-7);

            foreach (var file in Directory.EnumerateFiles(directory, "peek-*.log"))
            {
                if (File.GetLastWriteTime(file) < cutoff)
                {
                    File.Delete(file);
                }
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Sans consequence.
        }
    }

    private sealed class FileLogger : ILogger
    {
        private readonly FileLoggerProvider _provider;
        private readonly string _category;
        private readonly LogLevel _minimum;

        internal FileLogger(FileLoggerProvider provider, string category, LogLevel minimum)
        {
            _provider = provider;
            _category = category;
            _minimum = minimum;
        }

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= _minimum;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }

            var builder = new StringBuilder()
                .Append(DateTime.Now.ToString("HH:mm:ss.fff", CultureInfo.InvariantCulture))
                .Append(" [").Append(logLevel).Append("] ")
                .Append(_category).Append(" — ")
                .Append(formatter(state, exception));

            if (exception is not null)
            {
                builder.AppendLine().Append(exception);
            }

            _provider.Write(builder.ToString());
        }
    }
}
