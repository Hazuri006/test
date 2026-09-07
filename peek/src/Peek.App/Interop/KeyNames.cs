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

        // MAPVK_VK_TO_VSC_EX renvoie le prefixe 0xE0 ou 0xE1 dans l'octet haut
        // pour les touches etendues. Sans le bit correspondant dans lParam,
        // GetKeyNameText nomme « 4 » la fleche gauche, parce qu'il croit lire la
        // touche du pave numerique.
        var mapped = NativeMethods.MapVirtualKeyW((uint)virtualKey, NativeMethods.MapvkVkToVscEx);

        if (mapped == 0)
        {
            return string.Empty;
        }

        var prefix = (mapped >> 8) & 0xFF;
        var lParam = (int)((mapped & 0xFF) << 16);

        if (prefix is 0xE0 or 0xE1)
        {
            lParam |= 1 << 24;
        }

        var buffer = new char[64];
        var length = NativeMethods.GetKeyNameTextW(lParam, buffer, buffer.Length);

        return length > 0 ? new string(buffer, 0, length) : string.Empty;
    }
}
