namespace Peek.Core.Input;

/// <summary>
/// Les quelques codes virtuels que Peek doit connaitre par leur nom. La liste
/// n'a pas vocation a etre complete : ailleurs, une touche n'est qu'un nombre.
/// </summary>
public static class VirtualKeys
{
    public const int LeftButton = 0x01;
    public const int RightButton = 0x02;
    public const int Cancel = 0x03;
    public const int MiddleButton = 0x04;
    public const int XButton1 = 0x05;
    public const int XButton2 = 0x06;

    public const int Escape = 0x1B;

    public const int Shift = 0x10;
    public const int Control = 0x11;
    public const int Menu = 0x12;

    public const int LeftWindows = 0x5B;
    public const int RightWindows = 0x5C;

    public const int LeftShift = 0xA0;
    public const int RightShift = 0xA1;
    public const int LeftControl = 0xA2;
    public const int RightControl = 0xA3;
    public const int LeftMenu = 0xA4;
    public const int RightMenu = 0xA5;
}
