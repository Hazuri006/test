namespace Babel.Core.Settings;

/// <summary>Actions declenchables par un raccourci global.</summary>
public enum HotkeyAction
{
    TogglePause,
    ToggleOverlay,
    ToggleHud,
    ToggleRepositionMode,
    WritePerfReport,
}

/// <summary>
/// Raccourcis globaux, exprimes sous forme lisible (« Ctrl+Alt+Space ») pour
/// rester modifiables a la main dans le fichier de reglages.
/// </summary>
public sealed class HotkeySettings
{
    public string TogglePause { get; set; } = "Ctrl+Alt+Space";

    public string ToggleOverlay { get; set; } = "Ctrl+Alt+H";

    public string ToggleHud { get; set; } = "F9";

    public string ToggleRepositionMode { get; set; } = "Ctrl+Alt+P";

    public string WritePerfReport { get; set; } = "Ctrl+Alt+S";

    public string For(HotkeyAction action) => action switch
    {
        HotkeyAction.TogglePause => TogglePause,
        HotkeyAction.ToggleOverlay => ToggleOverlay,
        HotkeyAction.ToggleHud => ToggleHud,
        HotkeyAction.ToggleRepositionMode => ToggleRepositionMode,
        HotkeyAction.WritePerfReport => WritePerfReport,
        _ => string.Empty,
    };
}
