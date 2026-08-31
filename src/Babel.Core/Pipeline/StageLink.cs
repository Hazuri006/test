using System.Threading.Channels;

namespace Babel.Core.Pipeline;

/// <summary>
/// Lien borne entre deux etages du pipeline.
///
/// Contrainte 5 de la specification : la latence prime sur la completude. Quand
/// le consommateur prend du retard, on jette la donnee la plus ancienne au lieu
/// de faire grossir une file. Le nombre d'elements jetes est compte et remonte
/// au HUD : c'est un chiffre de diagnostic, pas un detail d'implementation.
/// </summary>
public sealed class StageLink<T>
{
    private readonly Channel<T> _channel;
    private readonly Action<T>? _recycle;
    private long _dropped;
    private long _published;

    /// <param name="name">Nom affiche dans les diagnostics.</param>
    /// <param name="capacity">
    /// Taille de la file. 1 signifie « seul le message le plus recent survit ».
    /// </param>
    /// <param name="recycle">
    /// Appele sur chaque element jete, pour rendre un buffer loue au pool.
    /// </param>
    public StageLink(string name, int capacity = 1, Action<T>? recycle = null)
    {
        ArgumentException.ThrowIfNullOrEmpty(name);
        ArgumentOutOfRangeException.ThrowIfLessThan(capacity, 1);

        Name = name;
        _recycle = recycle;

        var options = new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false,

            // Faux volontairement : sinon le producteur peut executer le travail
            // du consommateur en ligne. Sur le thread de capture audio, ce serait
            // une source de gigue directe.
            AllowSynchronousContinuations = false,
        };

        _channel = Channel.CreateBounded<T>(options, OnItemDropped);
    }

    public string Name { get; }

    /// <summary>Nombre d'elements jetes depuis le demarrage.</summary>
    public long Dropped => Interlocked.Read(ref _dropped);

    /// <summary>Nombre d'elements acceptes en ecriture depuis le demarrage.</summary>
    public long Published => Interlocked.Read(ref _published);

    public ChannelReader<T> Reader => _channel.Reader;

    /// <summary>
    /// Publie un element sans jamais bloquer. Renvoie faux uniquement si le lien
    /// a ete termine.
    /// </summary>
    public bool Publish(T item)
    {
        if (!_channel.Writer.TryWrite(item))
        {
            return false;
        }

        Interlocked.Increment(ref _published);
        return true;
    }

    public void Complete() => _channel.Writer.TryComplete();

    private void OnItemDropped(T item)
    {
        Interlocked.Increment(ref _dropped);
        _recycle?.Invoke(item);
    }
}
