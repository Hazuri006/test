using System;
using System.Buffers;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using Babel.Core.Audio;
using Microsoft.Extensions.Logging;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace Babel.App.Audio;

/// <summary>
/// Capture du son systeme en WASAPI loopback.
///
/// Ce que Windows livre — 44,1 ou 48 kHz, stereo, virgule flottante — est ramene
/// une seule fois en 16 kHz mono, le format qu'attendent Silero et whisper.cpp.
/// Le reechantillonnage a lieu ici et nulle part ailleurs.
///
/// Aucune allocation par trame : les tampons viennent du pool et sont rendus par
/// l'etage suivant, y compris quand la politique de rejet les jette.
/// </summary>
internal sealed class WasapiAudioCapture : IAudioCapture
{
    private const double LevelSmoothing = 0.7;
    private const double FloorDecibels = -60;

    private readonly ILogger<WasapiAudioCapture> _logger;
    private readonly MMDeviceEnumerator _enumerator = new();
    private readonly float[] _pending = new float[AudioFormat.FrameSamples];
    private readonly float[] _scratch = new float[8192];
    private readonly object _gate = new();

    private WasapiLoopbackCapture? _capture;
    private BufferedWaveProvider? _incoming;
    private ISampleProvider? _resampled;
    private int _pendingLength;
    private double _level;
    private bool _disposed;

    internal WasapiAudioCapture(ILogger<WasapiAudioCapture> logger) => _logger = logger;

    public event Action<AudioFrame>? FrameReady;

    public event Action<string>? Failed;

    public double Level => Volatile.Read(ref _level);

    public bool IsCapturing => _capture is not null;

    public IReadOnlyList<AudioDevice> ListDevices()
    {
        var devices = new List<AudioDevice>();

        try
        {
            var defaultId = _enumerator
                .GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia)
                .ID;

            foreach (var device in _enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
            {
                devices.Add(new AudioDevice(device.ID, device.FriendlyName, device.ID == defaultId));
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Impossible d'enumerer les peripheriques de sortie.");
        }

        return devices;
    }

    public void Start(string deviceId)
    {
        lock (_gate)
        {
            Stop();

            try
            {
                var device = ResolveDevice(deviceId);
                _capture = new WasapiLoopbackCapture(device);

                _incoming = new BufferedWaveProvider(_capture.WaveFormat)
                {
                    // On jette plutot que de laisser la file grossir : contrainte 5.
                    DiscardOnBufferOverflow = true,
                    ReadFully = false,
                    BufferDuration = TimeSpan.FromMilliseconds(400),
                };

                _resampled = BuildResamplingChain(_incoming, _capture.WaveFormat.Channels);

                _capture.DataAvailable += OnDataAvailable;
                _capture.RecordingStopped += OnRecordingStopped;
                _capture.StartRecording();

                _logger.LogInformation(
                    "Capture demarree sur {Device}, {Format}.",
                    device.FriendlyName,
                    _capture.WaveFormat);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Demarrage de la capture impossible.");
                Stop();

                Failed?.Invoke(
                    "Impossible d'écouter ce périphérique. Choisis-en un autre, ou vérifie qu'il est bien activé dans Windows.");
            }
        }
    }

    public void Stop()
    {
        lock (_gate)
        {
            if (_capture is null)
            {
                return;
            }

            _capture.DataAvailable -= OnDataAvailable;
            _capture.RecordingStopped -= OnRecordingStopped;

            try
            {
                _capture.StopRecording();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Arret de la capture en erreur.");
            }

            _capture.Dispose();
            _capture = null;
            _incoming = null;
            _resampled = null;
            _pendingLength = 0;

            Volatile.Write(ref _level, 0);
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        Stop();
        _enumerator.Dispose();
    }

    private MMDevice ResolveDevice(string deviceId) =>
        string.IsNullOrWhiteSpace(deviceId)
            ? _enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia)
            : _enumerator.GetDevice(deviceId);

    private static ISampleProvider BuildResamplingChain(BufferedWaveProvider incoming, int channels)
    {
        ISampleProvider provider = incoming.ToSampleProvider();

        provider = channels switch
        {
            1 => provider,
            2 => new StereoToMonoSampleProvider(provider),

            // Au-dela de deux canaux — sortie multicanal — on ne garde que le
            // premier. Melanger cinq canaux n'apporte rien a la reconnaissance.
            _ => new MultiplexingSampleProvider([provider], 1),
        };

        return new WdlResamplingSampleProvider(provider, AudioFormat.SampleRate);
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        var incoming = _incoming;
        var resampled = _resampled;

        if (incoming is null || resampled is null)
        {
            return;
        }

        incoming.AddSamples(e.Buffer, 0, e.BytesRecorded);

        while (true)
        {
            var read = resampled.Read(_scratch, 0, _scratch.Length);

            if (read == 0)
            {
                return;
            }

            Accumulate(_scratch.AsSpan(0, read));
        }
    }

    private void Accumulate(ReadOnlySpan<float> samples)
    {
        var offset = 0;

        while (offset < samples.Length)
        {
            var take = Math.Min(AudioFormat.FrameSamples - _pendingLength, samples.Length - offset);
            samples.Slice(offset, take).CopyTo(_pending.AsSpan(_pendingLength));

            _pendingLength += take;
            offset += take;

            if (_pendingLength == AudioFormat.FrameSamples)
            {
                EmitFrame();
                _pendingLength = 0;
            }
        }
    }

    private void EmitFrame()
    {
        UpdateLevel(_pending);

        var buffer = ArrayPool<float>.Shared.Rent(AudioFormat.FrameSamples);
        _pending.AsSpan().CopyTo(buffer);

        FrameReady?.Invoke(new AudioFrame(buffer, AudioFormat.FrameSamples, Stopwatch.GetTimestamp()));
    }

    /// <summary>
    /// Niveau en decibels plutot qu'en amplitude brute : c'est ce qui fait bouger
    /// un vumetre de facon lisible, et il sert au diagnostic, pas a la decoration.
    /// </summary>
    private void UpdateLevel(ReadOnlySpan<float> samples)
    {
        double sum = 0;

        foreach (var sample in samples)
        {
            sum += sample * sample;
        }

        var rms = Math.Sqrt(sum / samples.Length);
        var decibels = 20 * Math.Log10(Math.Max(rms, 1e-7));
        var normalized = Math.Clamp((decibels - FloorDecibels) / -FloorDecibels, 0, 1);

        Volatile.Write(ref _level, (Volatile.Read(ref _level) * LevelSmoothing) + (normalized * (1 - LevelSmoothing)));
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs e)
    {
        if (e.Exception is null)
        {
            return;
        }

        _logger.LogError(e.Exception, "La capture s'est interrompue.");

        Failed?.Invoke(
            "L'écoute du son s'est interrompue. Le périphérique a peut-être été débranché ou changé.");
    }
}
