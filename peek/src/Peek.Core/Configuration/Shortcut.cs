namespace Peek.Core.Configuration;

/// <summary>Une touche, une fenetre, un mode. La ligne de la section 6.</summary>
public sealed class Shortcut
{
    /// <summary>Identifiant stable, pour designer un raccourci dans un journal ou un conflit.</summary>
    public string Id { get; set; } = Guid.NewGuid().ToString("n")[..8];

    public KeyBinding Key { get; set; } = new();

    public WindowTarget Target { get; set; } = new();

    public PeekMode Mode { get; set; } = PeekMode.Glance;

    /// <summary>Un raccourci desactive n'est pas avale par le hook.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Nom lisible pour les journaux et la barre en bas de l'ecran.</summary>
    public string DisplayName => string.IsNullOrWhiteSpace(Key.Label) ? Id : Key.Label;
}
