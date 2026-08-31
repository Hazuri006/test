using Microsoft.Extensions.Logging;

namespace Babel.Core.Pipeline;

/// <summary>
/// Demarre et arrete les etages du pipeline.
///
/// Decision D1 (voir DECISIONS.md) : chaque etage tourne sur une tache du pool
/// de threads. Aucun thread dedie, aucune priorite relevee.
/// </summary>
public sealed class PipelineHost : IAsyncDisposable
{
    private readonly List<IPipelineStage> _stages = new();
    private readonly List<Task> _running = new();
    private readonly ILogger<PipelineHost> _logger;
    private readonly object _gate = new();

    private CancellationTokenSource? _cts;
    private volatile PipelineState _state = PipelineState.Stopped;

    public PipelineHost(ILogger<PipelineHost> logger) => _logger = logger;

    /// <summary>Leve a chaque changement d'etat, pour le voyant de l'interface.</summary>
    public event Action<PipelineState>? StateChanged;

    public PipelineState State => _state;

    /// <summary>
    /// Vrai quand les etages doivent laisser passer les donnees. En pause, les
    /// sources cessent de publier ; les etages restent vivants pour eviter le
    /// cout d'un redemarrage complet.
    /// </summary>
    public bool IsFlowing => _state == PipelineState.Running;

    public void Add(IPipelineStage stage)
    {
        lock (_gate)
        {
            if (_state != PipelineState.Stopped)
            {
                throw new InvalidOperationException(
                    "Les etages doivent etre ajoutes avant le demarrage du pipeline.");
            }

            _stages.Add(stage);
        }
    }

    public void Start()
    {
        lock (_gate)
        {
            if (_state != PipelineState.Stopped)
            {
                return;
            }

            _cts = new CancellationTokenSource();
            var token = _cts.Token;

            foreach (var stage in _stages)
            {
                var captured = stage;
                _running.Add(Task.Run(() => RunStageAsync(captured, token), token));
            }

            SetState(PipelineState.Running);
        }
    }

    /// <summary>Bascule entre marche et pause sans arreter les etages.</summary>
    public void TogglePause()
    {
        lock (_gate)
        {
            SetState(_state switch
            {
                PipelineState.Running => PipelineState.Paused,
                PipelineState.Paused => PipelineState.Running,
                _ => _state,
            });
        }
    }

    public async Task StopAsync()
    {
        CancellationTokenSource? cts;
        Task[] running;

        lock (_gate)
        {
            if (_state == PipelineState.Stopped)
            {
                return;
            }

            cts = _cts;
            running = _running.ToArray();
            _running.Clear();
            _cts = null;
            SetState(PipelineState.Stopped);
        }

        if (cts is not null)
        {
            await cts.CancelAsync().ConfigureAwait(false);
            cts.Dispose();
        }

        try
        {
            await Task.WhenAll(running).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Attendu a l'arret.
        }
    }

    public async ValueTask DisposeAsync() => await StopAsync().ConfigureAwait(false);

    private async Task RunStageAsync(IPipelineStage stage, CancellationToken token)
    {
        try
        {
            await stage.RunAsync(token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            // Arret normal.
        }
        catch (Exception ex)
        {
            // Un etage qui meurt ne doit pas emporter l'application : l'utilisateur
            // doit garder une interface utilisable pour comprendre ce qui s'est passe.
            _logger.LogError(ex, "L'etage {Stage} s'est arrete sur une erreur.", stage.Name);
        }
    }

    private void SetState(PipelineState next)
    {
        if (_state == next)
        {
            return;
        }

        _state = next;
        StateChanged?.Invoke(next);
    }
}
