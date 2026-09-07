namespace Peek.Core.Input;

/// <summary>Ce que la machine a etats demande, sans savoir comment ce sera fait.</summary>
public enum PeekIntentKind
{
    /// <summary>Afficher la fenetre par-dessus le jeu, sans prendre le focus.</summary>
    Begin,

    /// <summary>Refermer et rendre la main au jeu.</summary>
    End,

    /// <summary>
    /// Pression breve : la fenetre reste affichee apres le relachement.
    /// Le voile est deja la, c'est un changement d'etat, pas un affichage.
    /// </summary>
    Latch,

    /// <summary>
    /// Passer en mode utilisation. Le destinataire doit d'abord neutraliser les
    /// touches maintenues, sinon le personnage continue de courir (I2).
    /// </summary>
    EnterUse,
}

/// <summary>Une intention et le raccourci qui l'a produite.</summary>
/// <param name="Kind">Nature de l'intention.</param>
/// <param name="ShortcutId">Raccourci concerne.</param>
/// <param name="HeldMilliseconds">Duree de l'appui, quand elle a un sens.</param>
public readonly record struct PeekIntent(PeekIntentKind Kind, string ShortcutId, uint HeldMilliseconds);

/// <summary>
/// Zero, une ou deux intentions produites par un evenement clavier. Deux au
/// maximum, et le cas se produit vraiment : appuyer sur la touche d'un second
/// raccourci referme le premier avant d'ouvrir le nouveau.
///
/// Structure a taille fixe plutot que liste : le fil de travail traite chaque
/// frappe du systeme, autant ne rien laisser au ramasse-miettes.
/// </summary>
public readonly struct PeekIntentBatch : IEquatable<PeekIntentBatch>
{
    private readonly PeekIntent _first;
    private readonly PeekIntent _second;

    private PeekIntentBatch(PeekIntent first, PeekIntent second, int count)
    {
        _first = first;
        _second = second;
        Count = count;
    }

    public static PeekIntentBatch None => default;

    public int Count { get; }

    public PeekIntent this[int index] => index switch
    {
        0 when Count > 0 => _first,
        1 when Count > 1 => _second,
        _ => throw new ArgumentOutOfRangeException(nameof(index)),
    };

    public static PeekIntentBatch Of(PeekIntent intent) => new(intent, default, 1);

    public static PeekIntentBatch Of(PeekIntent first, PeekIntent second) => new(first, second, 2);

    public bool Equals(PeekIntentBatch other) =>
        Count == other.Count && _first == other._first && _second == other._second;

    public override bool Equals(object? obj) => obj is PeekIntentBatch other && Equals(other);

    public override int GetHashCode() => HashCode.Combine(Count, _first, _second);

    public static bool operator ==(PeekIntentBatch left, PeekIntentBatch right) => left.Equals(right);

    public static bool operator !=(PeekIntentBatch left, PeekIntentBatch right) => !left.Equals(right);
}
