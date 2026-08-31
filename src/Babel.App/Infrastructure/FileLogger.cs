using System.Globalization;
using System.Text;
using Microsoft.Extensions.Logging;

namespace Babel.App.Infrastructure;

/// <summary>
/// Journal local, dans un fichier, et rien d'autre.
///
/// Contrainte 3 : aucune donnee ne quitte la machine. Il n'y a donc ni remontee
/// de plantage automatique, ni service distant. Le fichier existe pour que
/// l'utilisateur puisse l'ouvrir ou l'envoyer lui-meme s'il le decide.
/// </summary>
internal sealed class FileLoggerProvider : ILoggerProvider
{
    private readonly object _gate = new();
    private readonly string _filePath;

    internal FileLoggerProvider(string directory)
    {
        Directory.CreateDirectory(directory);

        _filePath = Path.Combine(
            directory,
            $"babel-{DateTime.Now:yyyy-MM-dd}.log");

        TrimOldLogs(directory);
    }

    public ILogger CreateLogger(string categoryName) => new FileLogger(this, categoryName);

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
            catch (IOException)
            {
                // Un journal qui echoue ne doit jamais faire tomber l'application.
            }
        }
    }

    /// <summary>Garde une semaine de journaux, pas davantage.</summary>
    private static void TrimOldLogs(string directory)
    {
        try
        {
            var cutoff = DateTime.Now.AddDays(-7);

            foreach (var file in Directory.EnumerateFiles(directory, "babel-*.log"))
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

        internal FileLogger(FileLoggerProvider provider, string category)
        {
            _provider = provider;
            _category = category;
        }

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

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
