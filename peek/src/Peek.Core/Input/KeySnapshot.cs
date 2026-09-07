using Peek.Core.Configuration;

namespace Peek.Core.Input;

/// <summary>
/// Jeu des touches que le hook doit avaler, sous forme immuable.
///
/// C'est le seul etat que le callback du hook consulte, et c'est pour lui qu'il
/// est construit ainsi. Le callback ne peut pas differer sa reponse a Windows :
/// la decision d'avaler une touche (I1) se prend forcement dans le callback,
/// donc de facon synchrone. Un verrou y serait un risque d'attente, une table
/// de hachage une indirection de trop.
///
/// La publication se fait par echange de reference. Un remplacement n'invalide
/// jamais l'instance qu'un callback est en train de lire : il en lit une
/// version, complete et coherente, simplement peut-etre l'ancienne.
/// </summary>
public sealed class KeySnapshot
{
    private const int WordCount = KeyBinding.VirtualKeyCount / 64;

    private readonly ulong[] _bits;

    private KeySnapshot(ulong[] bits, int count)
    {
        _bits = bits;
        Count = count;
    }

    /// <summary>Aucune touche assignee : le hook laisse tout passer.</summary>
    public static KeySnapshot Empty { get; } = new(new ulong[WordCount], 0);

    public int Count { get; }

    public bool IsEmpty => Count == 0;

    /// <summary>
    /// Appele depuis le callback du hook. Une lecture de tableau et un masque,
    /// sans allocation, sans verrou, sans branche inutile.
    /// </summary>
    public bool Contains(int virtualKey)
    {
        if ((uint)virtualKey >= KeyBinding.VirtualKeyCount)
        {
            return false;
        }

        return (_bits[virtualKey >> 6] & (1UL << (virtualKey & 63))) != 0;
    }

    /// <summary>
    /// Construit l'instantane a partir des raccourcis actifs. Un raccourci
    /// desactive ou sans touche n'y figure pas : sa touche continue d'arriver
    /// au jeu.
    /// </summary>
    public static KeySnapshot FromShortcuts(IEnumerable<Shortcut> shortcuts)
    {
        ArgumentNullException.ThrowIfNull(shortcuts);

        var bits = new ulong[WordCount];
        var count = 0;

        foreach (var shortcut in shortcuts)
        {
            if (!shortcut.Enabled || shortcut.Key is null || !shortcut.Key.IsAssigned)
            {
                continue;
            }

            var vk = shortcut.Key.VirtualKey;
            var word = vk >> 6;
            var mask = 1UL << (vk & 63);

            if ((bits[word] & mask) != 0)
            {
                // Deux raccourcis sur la meme touche : le conflit est signale
                // ailleurs, ici on ne compte la touche qu'une fois.
                continue;
            }

            bits[word] |= mask;
            count++;
        }

        return count == 0 ? Empty : new KeySnapshot(bits, count);
    }
}
