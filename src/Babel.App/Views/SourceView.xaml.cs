using System.Windows.Controls;

namespace Babel.App.Views;

internal sealed partial class SourceView : UserControl
{
    internal SourceView() => InitializeComponent();

    /// <summary>
    /// Alimente le vumetre. Branche sur la capture WASAPI au jalon suivant ;
    /// le controle existe des maintenant pour que le diagnostic soit en place.
    /// </summary>
    internal void SetLevel(double level) => Meter.Level = level;
}
