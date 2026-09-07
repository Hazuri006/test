namespace Peek.Core.Input;

/// <summary>
/// File a taille fixe entre le callback du hook et le fil de travail.
///
/// I7 impose que le callback empile un evenement et retourne. Un
/// <c>Channel</c> non borne alloue par segments, et une allocation dans un
/// callback de hook peut tomber au milieu d'une pause du ramasse-miettes ;
/// Windows, lui, retire purement et simplement un hook trop lent, ce qui donne
/// des touches perdues impossibles a reproduire. Les emplacements sont donc
/// reserves une fois pour toutes au demarrage.
///
/// Un seul producteur, le fil du hook. Un seul consommateur, le fil de travail.
/// Aucun verrou, aucune operation atomique : chaque index n'a qu'un ecrivain.
/// </summary>
public sealed class KeyRingBuffer
{
    public const int DefaultCapacity = 1024;

    private readonly KeyEvent[] _slots;
    private readonly int _mask;

    private long _writeIndex;
    private long _readIndex;
    private long _dropped;

    public KeyRingBuffer(int capacity = DefaultCapacity)
    {
        if (capacity < 2 || (capacity & (capacity - 1)) != 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(capacity),
                capacity,
                "La capacite doit etre une puissance de deux, pour que l'index se replie par un masque.");
        }

        _slots = new KeyEvent[capacity];
        _mask = capacity - 1;
    }

    public int Capacity => _slots.Length;

    /// <summary>Evenements perdus depuis le demarrage. Toujours anormal, toujours journalise.</summary>
    public long Dropped => Volatile.Read(ref _dropped);

    public bool IsEmpty => Volatile.Read(ref _readIndex) >= Volatile.Read(ref _writeIndex);

    /// <summary>
    /// Appele depuis le callback du hook, et de nulle part ailleurs.
    ///
    /// Quand la file est pleine, l'evenement est perdu et le compteur avance.
    /// Perdre un evenement deja mesure vaut mieux qu'un callback qui attend :
    /// le premier se voit dans le journal, le second fait desactiver le hook
    /// par Windows.
    /// </summary>
    public bool TryEnqueue(in KeyEvent item)
    {
        var write = _writeIndex;

        if (write - Volatile.Read(ref _readIndex) >= _slots.Length)
        {
            // Ecriture simple : seul le producteur touche ce compteur.
            Volatile.Write(ref _dropped, _dropped + 1);
            return false;
        }

        _slots[(int)(write & _mask)] = item;

        // La publication de l'index vient apres l'ecriture de l'emplacement :
        // le consommateur ne voit jamais un emplacement a moitie ecrit.
        Volatile.Write(ref _writeIndex, write + 1);
        return true;
    }

    /// <summary>Appele depuis le fil de travail, et de nulle part ailleurs.</summary>
    public bool TryDequeue(out KeyEvent item)
    {
        var read = _readIndex;

        if (read >= Volatile.Read(ref _writeIndex))
        {
            item = default;
            return false;
        }

        item = _slots[(int)(read & _mask)];
        Volatile.Write(ref _readIndex, read + 1);
        return true;
    }
}
