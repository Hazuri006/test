using Microsoft.Extensions.Logging.Abstractions;
using Peek.Core.Configuration;

namespace Peek.Core.Tests;

public sealed class ConfigStoreTests : IDisposable
{
    private readonly string _directory =
        Path.Combine(Path.GetTempPath(), "peek-tests-" + Guid.NewGuid().ToString("n")[..8]);

    private string ConfigPath => Path.Combine(_directory, "config.json");

    [Fact]
    public void Un_fichier_absent_donne_les_defauts()
    {
        using var store = NewStore();

        var config = store.Load();

        Assert.Equal(PeekConfig.CurrentSchemaVersion, config.SchemaVersion);
        Assert.Empty(config.Shortcuts);
        Assert.Equal(250, config.Advanced.HoldThresholdMs);
        Assert.Equal(0.40, config.Advanced.VeilOpacity);
    }

    [Fact]
    public void Un_aller_retour_conserve_tout()
    {
        using (var store = NewStore())
        {
            var config = store.Load();
            config.Shortcuts.Add(Keyboard.Shortcut(Keyboard.G, id: "g", mode: PeekMode.Use));
            config.Advanced.HoldThresholdMs = 300;
            store.SaveNow();
        }

        using var reopened = NewStore();
        var reloaded = reopened.Load();

        var shortcut = Assert.Single(reloaded.Shortcuts);
        Assert.Equal("g", shortcut.Id);
        Assert.Equal(Keyboard.G, shortcut.Key.VirtualKey);
        Assert.Equal(PeekMode.Use, shortcut.Mode);
        Assert.Equal("chrome", shortcut.Target.ProcessName);
        Assert.Equal(300, reloaded.Advanced.HoldThresholdMs);
    }

    [Fact]
    public void Le_fichier_est_lisible_et_modifiable_a_la_main()
    {
        using var store = NewStore();
        store.Load().Shortcuts.Add(Keyboard.Shortcut(Keyboard.G, mode: PeekMode.Use));
        store.SaveNow();

        var json = File.ReadAllText(ConfigPath);

        // En M0 la configuration s'edite a la main : elle doit rester lisible,
        // et un mode doit s'y ecrire par son nom, pas par un numero.
        Assert.Contains("\"schemaVersion\": 1", json, StringComparison.Ordinal);
        Assert.Contains("\"virtualKey\": 71", json, StringComparison.Ordinal);
        Assert.Contains("\"mode\": \"Use\"", json, StringComparison.Ordinal);
    }

    [Fact]
    public void Aucun_fichier_temporaire_ne_survit_a_une_ecriture()
    {
        using var store = NewStore();
        store.Load();
        store.SaveNow();

        Assert.True(File.Exists(ConfigPath));
        Assert.False(File.Exists(ConfigPath + ".tmp"));
    }

    [Fact]
    public void Un_fichier_illisible_est_mis_de_cote_au_lieu_d_etre_ecrase()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(ConfigPath, "{ ceci n'est pas du JSON");

        using var store = NewStore();
        var config = store.Load();

        Assert.Empty(config.Shortcuts);
        Assert.True(File.Exists(ConfigPath + ".corrupt"));
        Assert.Contains("ceci n'est pas du JSON", File.ReadAllText(ConfigPath + ".corrupt"), StringComparison.Ordinal);
    }

    [Fact]
    public void Une_version_de_schema_plus_recente_ramene_les_defauts()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(ConfigPath, """{ "schemaVersion": 99, "advanced": { "holdThresholdMs": 900 } }""");

        using var store = NewStore();
        var config = store.Load();

        Assert.Equal(PeekConfig.CurrentSchemaVersion, config.SchemaVersion);
        Assert.Equal(250, config.Advanced.HoldThresholdMs);
    }

    [Fact]
    public void Un_champ_inconnu_n_empeche_pas_la_lecture()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(ConfigPath, """{ "schemaVersion": 1, "inventeParUneVersionFuture": true }""");

        using var store = NewStore();

        Assert.Equal(PeekConfig.CurrentSchemaVersion, store.Load().SchemaVersion);
    }

    [Theory]
    [InlineData(0, 80)]
    [InlineData(5000, 1000)]
    public void Un_seuil_ecrit_a_la_main_hors_bornes_est_ramene(int written, int expected)
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(ConfigPath, $$"""{ "schemaVersion": 1, "advanced": { "holdThresholdMs": {{written}} } }""");

        using var store = NewStore();

        Assert.Equal(expected, store.Load().Advanced.HoldThresholdMs);
    }

    [Fact]
    public void Une_opacite_hors_bornes_est_ramenee()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(ConfigPath, """{ "schemaVersion": 1, "advanced": { "veilOpacity": 5.0 } }""");

        using var store = NewStore();

        Assert.Equal(0.95, store.Load().Advanced.VeilOpacity);
    }

    [Fact]
    public void Un_raccourci_sans_identifiant_en_recoit_un()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(ConfigPath, """{ "schemaVersion": 1, "shortcuts": [ { "id": "" } ] }""");

        using var store = NewStore();

        Assert.NotEmpty(Assert.Single(store.Load().Shortcuts).Id);
    }

    [Fact]
    public void Une_configuration_plus_recente_est_mise_de_cote_et_jamais_ecrasee()
    {
        Directory.CreateDirectory(_directory);
        const string written = """{ "schemaVersion": 99, "shortcuts": [ { "id": "precieux" } ] }""";
        File.WriteAllText(ConfigPath, written);

        using (var store = NewStore())
        {
            store.Load();
        }

        // Fermer Peek ne doit pas remplacer par du vide la configuration ecrite
        // par une version plus recente : elle reste recuperable a la main.
        Assert.Equal(written, File.ReadAllText(ConfigPath + ".newer"));
    }

    [Fact]
    public void La_fermeture_n_ecrit_rien_si_personne_n_a_rien_demande()
    {
        using (var store = NewStore())
        {
            store.Load();
        }

        Assert.False(File.Exists(ConfigPath));
    }

    [Fact]
    public void La_fermeture_ecrit_ce_qui_restait_en_attente()
    {
        using (var store = NewStore())
        {
            store.Load().Shortcuts.Add(Keyboard.Shortcut(Keyboard.T));
            store.RequestSave();
        }

        using var reopened = NewStore();

        Assert.Single(reopened.Load().Shortcuts);
    }

    [Fact]
    public void Les_chemins_par_defaut_sont_tous_sous_le_meme_dossier()
    {
        Assert.StartsWith(ConfigStore.DefaultDirectory, ConfigStore.DefaultPath, StringComparison.Ordinal);
        Assert.StartsWith(ConfigStore.DefaultDirectory, ConfigStore.RestoreStatePath, StringComparison.Ordinal);
        Assert.StartsWith(ConfigStore.DefaultDirectory, ConfigStore.LogDirectory, StringComparison.Ordinal);
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }

    private ConfigStore NewStore() => new(ConfigPath, NullLogger<ConfigStore>.Instance);
}
