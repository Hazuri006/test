namespace Babel.Core.Audio;

/// <summary>Ce que le decoupage demande de faire apres une trame.</summary>
public enum VadEvent
{
    /// <summary>Rien a faire.</summary>
    None,

    /// <summary>Une phrase commence. Le tampon doit inclure les trames d'amorce.</summary>
    SpeechStarted,

    /// <summary>Il est temps de produire une hypothese partielle sur le tampon en cours.</summary>
    PartialDue,

    /// <summary>La phrase est terminee et doit etre transcrite.</summary>
    SegmentEnded,

    /// <summary>La phrase etait trop courte pour etre autre chose qu'un bruit.</summary>
    SegmentDiscarded,
}

/// <summary>
/// Machine a etats du decoupage en phrases.
///
/// Volontairement separee de l'inference : elle ne recoit que des probabilites de
/// parole, ce qui la rend entierement testable sans ONNX, sans audio et sans
/// Windows. C'est la piece la plus facile a casser du jalon, donc celle qui doit
/// etre la mieux couverte.
/// </summary>
public sealed class VadSegmenter
{
    private readonly VadOptions _options;
    private readonly int _minSpeechFrames;
    private readonly int _hangoverFrames;
    private readonly int _maxSegmentFrames;
    private readonly int _minSegmentFrames;
    private readonly int _partialFrames;

    private bool _inSpeech;
    private int _speechRun;
    private int _silenceRun;
    private int _segmentFrames;
    private int _framesSincePartial;

    public VadSegmenter(VadOptions? options = null)
    {
        _options = options ?? new VadOptions();

        _minSpeechFrames = Math.Max(1, AudioFormat.MillisecondsToFrames(_options.MinSpeechMilliseconds));
        _hangoverFrames = Math.Max(1, AudioFormat.MillisecondsToFrames(_options.HangoverMilliseconds));
        _maxSegmentFrames = Math.Max(_minSpeechFrames, AudioFormat.MillisecondsToFrames(_options.MaxSegmentMilliseconds));
        _minSegmentFrames = Math.Max(1, AudioFormat.MillisecondsToFrames(_options.MinSegmentMilliseconds));
        _partialFrames = Math.Max(1, AudioFormat.MillisecondsToFrames(_options.PartialIntervalMilliseconds));
    }

    /// <summary>Vrai entre <see cref="VadEvent.SpeechStarted"/> et la fin du segment.</summary>
    public bool InSpeech => _inSpeech;

    /// <summary>
    /// Nombre de trames deja consommees par la parole au moment ou le segment
    /// s'ouvre. L'appelant doit les reprendre dans son tampon d'amorce, sinon le
    /// debut de chaque phrase serait tronque.
    /// </summary>
    public int LeadInFrames { get; private set; }

    /// <summary>Nombre de trames du segment en cours, amorce comprise.</summary>
    public int SegmentFrames => _segmentFrames;

    public VadEvent Feed(double speechProbability)
    {
        var isSpeech = speechProbability >= _options.SpeechThreshold;

        return _inSpeech ? FeedDuringSpeech(isSpeech) : FeedDuringSilence(isSpeech);
    }

    public void Reset()
    {
        _inSpeech = false;
        _speechRun = 0;
        _silenceRun = 0;
        _segmentFrames = 0;
        _framesSincePartial = 0;
        LeadInFrames = 0;
    }

    private VadEvent FeedDuringSilence(bool isSpeech)
    {
        if (!isSpeech)
        {
            _speechRun = 0;
            return VadEvent.None;
        }

        _speechRun++;

        if (_speechRun < _minSpeechFrames)
        {
            return VadEvent.None;
        }

        _inSpeech = true;
        LeadInFrames = _speechRun;
        _segmentFrames = _speechRun;
        _silenceRun = 0;
        _framesSincePartial = 0;
        _speechRun = 0;

        return VadEvent.SpeechStarted;
    }

    private VadEvent FeedDuringSpeech(bool isSpeech)
    {
        _segmentFrames++;
        _silenceRun = isSpeech ? 0 : _silenceRun + 1;

        if (_silenceRun >= _hangoverFrames)
        {
            // La duree utile exclut le silence de fin : une phrase de 100 ms suivie
            // de 200 ms de silence reste une phrase de 100 ms.
            var voiced = _segmentFrames - _silenceRun;
            var ended = voiced >= _minSegmentFrames ? VadEvent.SegmentEnded : VadEvent.SegmentDiscarded;

            Reset();
            return ended;
        }

        if (_segmentFrames >= _maxSegmentFrames)
        {
            // Coupure de force : un monologue continu doit quand meme produire des
            // sous-titres, quitte a couper entre deux mots.
            Reset();
            return VadEvent.SegmentEnded;
        }

        if (++_framesSincePartial >= _partialFrames)
        {
            _framesSincePartial = 0;
            return VadEvent.PartialDue;
        }

        return VadEvent.None;
    }
}
