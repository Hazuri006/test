namespace Babel.Core.Audio;

/// <summary>
/// Tampon circulaire des dernieres millisecondes captees.
///
/// Il existe pour une seule raison : quand le VAD declare qu'une phrase commence,
/// les premieres trames de cette phrase sont deja passees. Sans amorce, chaque
/// sous-titre perdrait sa premiere syllabe.
/// </summary>
public sealed class SampleRing
{
    private readonly float[] _buffer;
    private int _position;
    private long _written;

    public SampleRing(int capacity)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(capacity, 1);
        _buffer = new float[capacity];
    }

    public int Capacity => _buffer.Length;

    /// <summary>Nombre d'echantillons reellement disponibles.</summary>
    public int Available => (int)Math.Min(_written, _buffer.Length);

    public void Write(ReadOnlySpan<float> samples)
    {
        foreach (var sample in samples)
        {
            _buffer[_position] = sample;
            _position = (_position + 1) % _buffer.Length;
        }

        _written += samples.Length;
    }

    /// <summary>
    /// Recopie les <paramref name="count"/> derniers echantillons dans l'ordre
    /// chronologique. Renvoie le nombre reellement copie, qui peut etre inferieur
    /// quand le tampon n'est pas encore rempli.
    /// </summary>
    public int CopyLast(int count, Span<float> destination)
    {
        var take = Math.Min(Math.Min(count, Available), destination.Length);

        for (var i = 0; i < take; i++)
        {
            var index = ((_position - take + i) % _buffer.Length + _buffer.Length) % _buffer.Length;
            destination[i] = _buffer[index];
        }

        return take;
    }

    public void Clear()
    {
        Array.Clear(_buffer);
        _position = 0;
        _written = 0;
    }
}
