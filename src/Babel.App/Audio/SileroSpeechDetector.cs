using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Babel.Core.Audio;
using Microsoft.Extensions.Logging;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace Babel.App.Audio;

/// <summary>
/// Silero VAD par ONNX Runtime.
///
/// Le modele existe en deux dispositions d'entrees selon sa version : la v5 porte
/// un unique tenseur d'etat, la v4 un couple h/c herite des LSTM. On lit les
/// metadonnees du fichier au chargement et on s'adapte, plutot que d'exiger une
/// version precise d'un fichier que l'utilisateur depose lui-meme.
/// </summary>
internal sealed class SileroSpeechDetector : ISpeechDetector
{
    private const int StateSize = 2 * 1 * 128;
    private const int LegacyStateSize = 2 * 1 * 64;

    private readonly ILogger<SileroSpeechDetector> _logger;
    private readonly InferenceSession? _session;
    private readonly bool _isVersion5;

    private readonly float[] _inputBuffer = new float[AudioFormat.FrameSamples];
    private readonly DenseTensor<float> _inputTensor;
    private readonly DenseTensor<long> _sampleRateTensor;

    private float[] _state = new float[StateSize];
    private float[] _hidden = new float[LegacyStateSize];
    private float[] _cell = new float[LegacyStateSize];
    private bool _disposed;

    internal SileroSpeechDetector(ILogger<SileroSpeechDetector> logger)
    {
        _logger = logger;

        _inputTensor = new DenseTensor<float>(_inputBuffer.AsMemory(), [1, AudioFormat.FrameSamples]);
        _sampleRateTensor = new DenseTensor<long>(new long[] { AudioFormat.SampleRate }, [1]);

        if (!File.Exists(ModelPaths.SileroVad))
        {
            UnavailableReason = ModelPaths.MissingMessage("silero_vad.onnx");
            return;
        }

        try
        {
            _session = new InferenceSession(ModelPaths.SileroVad);
            _isVersion5 = _session.InputMetadata.ContainsKey("state");

            _logger.LogInformation(
                "Silero VAD chargé, entrées : {Inputs}.",
                string.Join(", ", _session.InputMetadata.Keys));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Chargement de Silero VAD impossible.");
            UnavailableReason = "Le modèle de détection de la parole n'a pas pu être chargé. Le fichier est peut-être incomplet.";
        }
    }

    public bool IsReady => _session is not null;

    public string? UnavailableReason { get; }

    public double Probability(ReadOnlySpan<float> frame)
    {
        if (_session is null)
        {
            return 0;
        }

        var take = Math.Min(frame.Length, _inputBuffer.Length);
        frame[..take].CopyTo(_inputBuffer);

        if (take < _inputBuffer.Length)
        {
            Array.Clear(_inputBuffer, take, _inputBuffer.Length - take);
        }

        try
        {
            using var results = _session.Run(BuildInputs());
            return ReadProbability(results);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Inference VAD en erreur.");
            return 0;
        }
    }

    public void Reset()
    {
        Array.Clear(_state);
        Array.Clear(_hidden);
        Array.Clear(_cell);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _session?.Dispose();
    }

    private List<NamedOnnxValue> BuildInputs()
    {
        var inputs = new List<NamedOnnxValue>(4)
        {
            NamedOnnxValue.CreateFromTensor("input", _inputTensor),
            NamedOnnxValue.CreateFromTensor("sr", _sampleRateTensor),
        };

        if (_isVersion5)
        {
            inputs.Add(NamedOnnxValue.CreateFromTensor(
                "state",
                new DenseTensor<float>(_state.AsMemory(), [2, 1, 128])));
        }
        else
        {
            inputs.Add(NamedOnnxValue.CreateFromTensor(
                "h",
                new DenseTensor<float>(_hidden.AsMemory(), [2, 1, 64])));

            inputs.Add(NamedOnnxValue.CreateFromTensor(
                "c",
                new DenseTensor<float>(_cell.AsMemory(), [2, 1, 64])));
        }

        return inputs;
    }

    private double ReadProbability(IDisposableReadOnlyCollection<DisposableNamedOnnxValue> results)
    {
        double probability = 0;

        foreach (var result in results)
        {
            switch (result.Name)
            {
                case "output":
                    probability = result.AsTensor<float>().First();
                    break;

                case "stateN":
                    _state = result.AsTensor<float>().ToArray();
                    break;

                case "hn":
                    _hidden = result.AsTensor<float>().ToArray();
                    break;

                case "cn":
                    _cell = result.AsTensor<float>().ToArray();
                    break;

                default:
                    break;
            }
        }

        return probability;
    }
}
