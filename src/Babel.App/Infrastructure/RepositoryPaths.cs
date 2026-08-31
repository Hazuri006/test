namespace Babel.App.Infrastructure;

/// <summary>
/// Retrouve les fichiers de suivi du depot quand l'application est lancee depuis
/// l'arborescence de developpement, pour que PERF.md soit ecrit la ou il est lu.
/// Hors depot, tout retombe dans le dossier local de l'utilisateur.
/// </summary>
internal static class RepositoryPaths
{
    internal static string PerfFile()
    {
        var root = FindRepositoryRoot();

        return root is null
            ? Path.Combine(LocalDirectory(), "PERF.md")
            : Path.Combine(root, "PERF.md");
    }

    internal static string LocalDirectory() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Babel");

    private static string? FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);

        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "SPEC.md")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        return null;
    }
}
