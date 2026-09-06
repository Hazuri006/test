using System;

namespace Peek.App.Interop;

/// <summary>
/// Nom lisible d'une touche, tel que Windows le donne pour la disposition
/// clavier courante. Un AZERTY doit lire « A » la ou un QWERTY lit « Q ».
/// </summary>
internal static class KeyNames
{
    internal static string Describe(int virtualKey, int scanCode)
    {
        if (virtualKey <= 0)
        {
            return string.Empty;
        }

        var code = scanCode > 0
            ? (uint)scanCode
            : NativeMethods.MapVirtualKeyW((uint)virtualKey, NativeMethods.MapvkVkToVsc);

        if (code == 0)
        {
            return string.Empty;
        }

        var buffer = new char[64];
        var length = NativeMethods.GetKeyNameTextW((int)(code << 16), buffer, buffer.Length);

        return length > 0 ? new string(buffer, 0, length) : string.Empty;
    }
}
