using Babel.Core.Settings;
using Microsoft.Extensions.Logging.Abstractions;

namespace Babel.Core.Tests;

public sealed class SettingsStoreTests : IDisposable
{
    private readonly string _directory = Path.Combine(
        Path.GetTempPath(),
        "babel-tests-" + Guid.NewGuid().ToString("N"));

    private string FilePath => Path.Combine(_directory, "settings.json");

    private SettingsStore CreateStore() =>
        new(FilePath, NullLogger<SettingsStore>.Instance);

    [Fact]
    public void Un_fichier_absent_donne_les_valeurs_par_defaut()
    {
        using var store = CreateStore();

        var settings = store.Load();

        Assert.Equal(BabelSettings.CurrentSchemaVersion, settings.SchemaVersion);
        Assert.Equal(0.5, settings.Overlay.AnchorX);
        Assert.Equal("F9", settings.Hotkeys.ToggleHud);
    }

    [Fact]
    public void Les_reglages_survivent_a_un_aller_retour()
    {
        using (var store = CreateStore())
        {
            var settings = store.Load();
            settings.Overlay.AnchorY = 0.25;
            settings.Overlay.FontSize = 48;
            settings.TargetLanguage = "en";
            settings.HudVisible = true;
            store.SaveNow();
        }

        using var reloaded = CreateStore();
        var loaded = reloaded.Load();

        Assert.Equal(0.25, loaded.Overlay.AnchorY);
        Assert.Equal(48, loaded.Overlay.FontSize);
        Assert.Equal("en", loaded.TargetLanguage);
        Assert.True(loaded.HudVisible);
    }

    [Fact]
    public void Un_fichier_illisible_ne_fait_pas_tomber_l_application()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(FilePath, "{ ceci n'est pas du json");

        using var store = CreateStore();
        var settings = store.Load();

        Assert.Equal(0.5, settings.Overlay.AnchorX);

        // Le fichier fautif est mis de cote, pas ecrase : il reste recuperable.
        Assert.True(File.Exists(FilePath + ".corrupt"));
    }

    [Fact]
    public void Un_schema_plus_recent_est_ignore_au_profit_des_defauts()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(FilePath, """{ "schemaVersion": 9999, "targetLanguage": "xx" }""");

        using var store = CreateStore();

        Assert.Equal("fr", store.Load().TargetLanguage);
    }

    [Fact]
    public void L_ecriture_ne_laisse_aucun_fichier_temporaire()
    {
        using var store = CreateStore();
        store.Load();
        store.SaveNow();
        store.SaveNow();

        Assert.True(File.Exists(FilePath));
        Assert.False(File.Exists(FilePath + ".tmp"));
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }
}
