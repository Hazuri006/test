using System.Buffers;
using System.Diagnostics;
using Babel.Core.Diagnostics;
using Babel.Core.Pipeline;

namespace Babel.Core.Audio;

/// <summary>
/// Etage de decoupage : transforme un flux continu de trames en phrases.
///
/// C'est ici que se joue le budget de 200 ms de la section 3. Le detecteur donne
/// une probabilite par trame de 32 ms, la machine a etats decide, et cet etage
/// gere les tampons.
/// </summary>
public sealed class VadStage : IPipelineStage
{
    private readonly StageLink<AudioFrame> _input;
    private readonly StageLink<Utterance> _output;
    private readonly ISpeechDetector _detector;
    private readonly VadSegmenter _segmenter;
    private readonly PipelineMetrics _metrics;
    private readonly Action<AudioFrame> _recycleFrame;

    private readonly SampleRing _preRoll;
    private readonly float[] _segment;

    private int _segmentLength;
    private long _segmentOrigin;
    private long _sequence;

    public VadStage(
        StageLink<AudioFrame> input,
        StageLink<Utterance> output,
        ISpeechDetector detector,
        PipelineMetrics metrics,
        Action<AudioFrame> recycleFrame,
        VadOptions? options = null)
    {
        _input = input;
        _output = output;
        _detector = detector;
        _metrics = metrics;
        _recycleFrame = recycleFrame;

        var settings = options ?? new VadOptions();
        _segmenter = new VadSegmenter(settings);

        var preRollFrames = AudioFormat.MillisecondsToFrames(settings.MinSpeechMilliseconds) + 2;
        _preRoll = new SampleRing(preRollFrames * AudioFormat.FrameSamples);

        // Marge d'une trame au-dela du plafond : la coupure de force intervient
        // apres l'ajout de la trame courante.
        var maxFrames = AudioFormat.MillisecondsToFrames(settings.MaxSegmentMilliseconds) + preRollFrames + 1;
        _segment = new float[maxFrames * AudioFormat.FrameSamples];
    }

    public string Name => "VAD";

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        await foreach (var frame in _input.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
        {
            try
            {
                _metrics[PipelineStage.Capture].SetDropped(_input.Dropped);
                Process(frame);
            }
            finally
            {
                _recycleFrame(frame);
            }
        }
    }

    private void Process(AudioFrame frame)
    {
        var started = Stopwatch.GetTimestamp();
        var samples = frame.Samples;

        _preRoll.Write(samples);

        var probability = _detector.Probability(samples);
        var decision = _segmenter.Feed(probability);

        switch (decision)
        {
            case VadEvent.SpeechStarted:
                BeginSegment(frame);
                break;

            case VadEvent.PartialDue:
                Append(samples);
                Emit(isFinal: false);
                break;

            case VadEvent.SegmentEnded:
                Append(samples);
                Emit(isFinal: true);
                EndSegment();
                break;

            case VadEvent.SegmentDiscarded:
                EndSegment();
                break;

            case VadEvent.None:
            default:
                if (_segmenter.InSpeech)
                {
                    Append(samples);
                }

                break;
        }

        _metrics[PipelineStage.Vad].RecordSince(started);
    }

    private void BeginSegment(AudioFrame frame)
    {
        _segmentLength = 0;

        // L'amorce : les trames de parole deja passees avant que le segment
        // s'ouvre officiellement.
        var leadIn = _segmenter.LeadInFrames * AudioFormat.FrameSamples;
        _segmentLength = _preRoll.CopyLast(leadIn, _segment);

        // L'horodatage du segment est celui de son debut reel, amorce comprise :
        // c'est lui qui porte la latence bout en bout jusqu'a l'affichage.
        var leadInTicks = (long)(_segmenter.LeadInFrames * AudioFormat.FrameMilliseconds
                                 * Stopwatch.Frequency / 1000.0);

        _segmentOrigin = frame.Timestamp - leadInTicks;
    }

    private void Append(ReadOnlySpan<float> samples)
    {
        var room = _segment.Length - _segmentLength;

        if (room <= 0)
        {
            return;
        }

        var take = Math.Min(room, samples.Length);
        samples[..take].CopyTo(_segment.AsSpan(_segmentLength));
        _segmentLength += take;
    }

    private void Emit(bool isFinal)
    {
        if (_segmentLength == 0)
        {
            return;
        }

        // Copie propre : le segment continue de grandir pour la prochaine
        // hypothese partielle, l'etage suivant ne doit pas voir bouger son entree.
        var buffer = ArrayPool<float>.Shared.Rent(_segmentLength);
        _segment.AsSpan(0, _segmentLength).CopyTo(buffer);

        var utterance = new Utterance(
            buffer,
            _segmentLength,
            _segmentOrigin,
            isFinal,
            Interlocked.Increment(ref _sequence));

        _output.Publish(utterance);
    }

    private void EndSegment()
    {
        _segmentLength = 0;
        _detector.Reset();
    }
}
