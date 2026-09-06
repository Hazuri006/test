using Microsoft.Extensions.Logging.Abstractions;
using Peek.Core.Configuration;

namespace Peek.Core.Tests;

public sealed class RestoreStateStoreTests : IDisposable
{
    private readonly string _directory =
        Path.Combine(Path.GetTempPath(), "peek-restore-" + Guid.NewGuid().ToString("n")[..8]);

    private string StatePath => Path.Combine(_directory, "restore-state.json");

    [Fact]
    public void Sans_fichier_il_n_y_a_rien_a_restituer()
    {
        var store = NewStore();

        Assert.False(store.Exists);
        Assert.Null(store.Read());
    }

    [Fact]
    public void Un_aller_retour_conserve_tout_ce_que_I5_exige()
    {
        var store = NewStore();

        store.Write(new RestoreState
        {
            OwnerProcessId = 4321,
            WrittenAtUtc = "2026-09-06T10:00:00Z",
            Windows =
            [
                new WindowRestorePoint
                {
                    WindowHandle = 0x1234,
                    ProcessName = "chrome",
                    ShowCommand = 3,
                    NormalLeft = 10,
                    NormalTop = 20,
                    NormalRight = 810,
                    NormalBottom = 620,
                    WasTopmost = true,
                    InsertAfterHandle = 0x9999,
                },
            ],
        });

        var read = store.Read()!;
        var window = Assert.Single(read.Windows);

        Assert.Equal(4321, read.OwnerProcessId);
        Assert.Equal(0x1234, window.WindowHandle);
        Assert.Equal(3, window.ShowCommand);
        Assert.Equal(10, window.NormalLeft);
        Assert.Equal(620, window.NormalBottom);
        Assert.True(window.WasTopmost);
        Assert.Equal(0x9999, window.InsertAfterHandle);
    }

    [Fact]
    public void Aucun_fichier_temporaire_ne_survit()
    {
        NewStore().Write(new RestoreState());

        Assert.True(File.Exists(StatePath));
        Assert.False(File.Exists(StatePath + ".tmp"));
    }

    [Fact]
    public void Effacer_retire_le_filet()
    {
        var store = NewStore();
        store.Write(new RestoreState());
        store.Clear();

        Assert.False(store.Exists);
    }

    [Fact]
    public void Effacer_un_fichier_absent_ne_derange_personne()
    {
        NewStore().Clear();
    }

    [Fact]
    public void Un_fichier_illisible_ne_fait_pas_tomber_le_demarrage()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(StatePath, "ceci n'est pas du JSON");

        Assert.Null(NewStore().Read());
    }

    [Fact]
    public void Un_etat_ecrit_par_une_version_plus_recente_est_ignore()
    {
        Directory.CreateDirectory(_directory);
        File.WriteAllText(StatePath, """{ "schemaVersion": 99, "windows": [] }""");

        Assert.Null(NewStore().Read());
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }

    private RestoreStateStore NewStore() => new(StatePath, NullLogger<RestoreStateStore>.Instance);
}
