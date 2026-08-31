using System.Windows.Input;

namespace Babel.App.Interop;

/// <summary>Raccourci global analyse depuis sa forme lisible, « Ctrl+Alt+Space ».</summary>
internal readonly record struct HotkeyGesture(uint Modifiers, uint VirtualKey, string Display)
{
    internal static bool TryParse(string text, out HotkeyGesture gesture)
    {
        gesture = default;

        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        var parts = text.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (parts.Length == 0)
        {
            return false;
        }

        uint modifiers = 0;

        for (var i = 0; i < parts.Length - 1; i++)
        {
            var modifier = parts[i].ToLowerInvariant() switch
            {
                "ctrl" or "control" => NativeMethods.ModControl,
                "alt" => NativeMethods.ModAlt,
                "shift" => NativeMethods.ModShift,
                "win" or "windows" => NativeMethods.ModWin,
                _ => 0u,
            };

            if (modifier == 0)
            {
                return false;
            }

            modifiers |= modifier;
        }

        if (!Enum.TryParse<Key>(parts[^1], ignoreCase: true, out var key) || key == Key.None)
        {
            return false;
        }

        var virtualKey = (uint)KeyInterop.VirtualKeyFromKey(key);

        if (virtualKey == 0)
        {
            return false;
        }

        // Sans MOD_NOREPEAT, garder la touche enfoncee declenche l'action en rafale.
        gesture = new HotkeyGesture(modifiers | NativeMethods.ModNoRepeat, virtualKey, text);
        return true;
    }
}
