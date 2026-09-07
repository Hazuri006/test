using Peek.Core.Configuration;
using Peek.Core.Input;

namespace Peek.Core.Tests;

/// <summary>
/// Fabrique de raccourcis et de frappes. Les tests de la machine a etats sont
/// deterministes : l'horodatage est une donnee du test, pas une horloge.
/// </summary>
internal static class Keyboard
{
    internal const int G = 0x47;
    internal const int T = 0x54;
    internal const int R = 0x52;

    internal static Shortcut Shortcut(
        int virtualKey,
        string id = "",
        PeekMode mode = PeekMode.Glance,
        bool enabled = true) => new()
        {
            Id = string.IsNullOrEmpty(id) ? $"s{virtualKey:x2}" : id,
            Key = new KeyBinding { VirtualKey = virtualKey, ScanCode = virtualKey, Label = "G" },
            Target = new WindowTarget { ProcessName = "chrome" },
            Mode = mode,
            Enabled = enabled,
        };

    internal static KeyEvent Down(int virtualKey, uint atMs) =>
        new(virtualKey, virtualKey, KeyTransition.Down, atMs, 0);

    internal static KeyEvent Up(int virtualKey, uint atMs) =>
        new(virtualKey, virtualKey, KeyTransition.Up, atMs, 0);
}
