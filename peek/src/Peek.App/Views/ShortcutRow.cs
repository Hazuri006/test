using System.ComponentModel;

namespace Peek.App.Views;

/// <summary>
/// Une ligne de la liste des raccourcis, telle que la section 6 la decrit :
/// la touche, la fenetre visee, le mode, un bouton de suppression. C'est tout.
///
/// Publique parce que la liaison de donnees de WPF ne lit pas les proprietes
/// d'un type interne. Ce n'est pas un choix d'API.
/// </summary>
public sealed class ShortcutRow : INotifyPropertyChanged
{
    private string _conflict = string.Empty;

    public required string Id { get; init; }

    /// <summary>Le nom de la touche tel que Windows la nomme pour cette disposition.</summary>
    public required string KeyLabel { get; init; }

    public required string TargetLabel { get; init; }

    public required string ModeLabel { get; init; }

    /// <summary>Message de conflit, vide quand la ligne va bien.</summary>
    public string Conflict
    {
        get => _conflict;
        set
        {
            if (_conflict == value)
            {
                return;
            }

            _conflict = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Conflict)));
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(HasConflict)));
        }
    }

    public bool HasConflict => !string.IsNullOrEmpty(_conflict);

    public event PropertyChangedEventHandler? PropertyChanged;
}

/// <summary>Une fenetre ouverte, proposee au moment de choisir la cible.</summary>
public sealed class WindowChoice
{
    public required long Handle { get; init; }

    public required string ProcessName { get; init; }

    public required string Title { get; init; }

    /// <summary>« chrome — Guide du raid ». Le programme d'abord : c'est ce qui identifie.</summary>
    public string Display => $"{ProcessName} — {Title}";
}
