using System.Windows.Controls;
using Babel.Core.Settings;

namespace Babel.App.Views;

internal sealed partial class LanguagesView : UserControl
{
    private static readonly (string Code, string Label)[] Languages =
    [
        ("ja", "Japonais"),
        ("ko", "Coréen"),
        ("zh", "Chinois"),
        ("en", "Anglais"),
        ("fr", "Français"),
    ];

    private SettingsStore? _store;
    private bool _loading;

    internal LanguagesView()
    {
        InitializeComponent();

        foreach (var (_, label) in Languages)
        {
            SourceSelector.Items.Add(label);
            TargetSelector.Items.Add(label);
        }
    }

    internal void Bind(SettingsStore store)
    {
        _store = store;
        _loading = true;

        SourceSelector.SelectedIndex = IndexOf(store.Current.SourceLanguage);
        TargetSelector.SelectedIndex = IndexOf(store.Current.TargetLanguage);

        _loading = false;
    }

    private static int IndexOf(string code)
    {
        for (var i = 0; i < Languages.Length; i++)
        {
            if (string.Equals(Languages[i].Code, code, StringComparison.OrdinalIgnoreCase))
            {
                return i;
            }
        }

        return 0;
    }

    private void OnSourceChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loading || _store is null || SourceSelector.SelectedIndex < 0)
        {
            return;
        }

        _store.Current.SourceLanguage = Languages[SourceSelector.SelectedIndex].Code;
        _store.RequestSave();
    }

    private void OnTargetChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loading || _store is null || TargetSelector.SelectedIndex < 0)
        {
            return;
        }

        _store.Current.TargetLanguage = Languages[TargetSelector.SelectedIndex].Code;
        _store.RequestSave();
    }
}
