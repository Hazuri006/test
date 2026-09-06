namespace Peek.Core.Configuration;

/// <summary>
/// Identite d'une touche.
///
/// Les deux codes sont conserves volontairement. Le code virtuel est ce que le
/// hook compare, parce que c'est ce que Windows lui remet. Le code de balayage
/// designe la touche physique : un joueur qui passe d'AZERTY a QWERTY garde son
/// raccourci au meme endroit du clavier. Voir DECISIONS.md, D3.
/// </summary>
public sealed class KeyBinding
{
    /// <summary>Nombre de codes virtuels possibles. Le hook n'en voit jamais d'autres.</summary>
    public const int VirtualKeyCount = 256;

    /// <summary>Code virtuel Windows, de 1 a 254.</summary>
    public int VirtualKey { get; set; }

    /// <summary>Code de balayage materiel, informatif tant que M2 n'existe pas.</summary>
    public int ScanCode { get; set; }

    /// <summary>Libelle affiche, tel que Windows nomme la touche. Jamais compare.</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>Une touche renseignee et dans les bornes que le hook peut voir.</summary>
    public bool IsAssigned => VirtualKey > 0 && VirtualKey < VirtualKeyCount;
}
