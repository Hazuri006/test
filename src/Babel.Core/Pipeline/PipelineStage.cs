namespace Babel.Core.Pipeline;

/// <summary>
/// Les etages instrumentes du pipeline. L'ordre suit le budget de latence de
/// la specification, section 3, et sert d'index dans <see cref="Diagnostics.PipelineMetrics"/>.
/// </summary>
public enum PipelineStage
{
    /// <summary>Capture WASAPI vers le buffer. Budget p95 : 20 ms.</summary>
    Capture = 0,

    /// <summary>Detection de fin de phrase. Budget p95 : 200 ms.</summary>
    Vad = 1,

    /// <summary>Transcription. Budget p95 : 250 ms.</summary>
    Asr = 2,

    /// <summary>Traduction. Budget p95 : 60 ms.</summary>
    Translate = 3,

    /// <summary>Soumission du texte jusqu'a la trame affichee. Budget p95 : 16 ms.</summary>
    Render = 4,
}

public static class PipelineStages
{
    /// <summary>Nombre d'etages, utilise pour dimensionner les tableaux d'index.</summary>
    public const int Count = 5;

    /// <summary>Budget p95 en millisecondes, tel qu'impose par la specification.</summary>
    public static double BudgetMs(PipelineStage stage) => stage switch
    {
        PipelineStage.Capture => 20,
        PipelineStage.Vad => 200,
        PipelineStage.Asr => 250,
        PipelineStage.Translate => 60,
        PipelineStage.Render => 16,
        _ => double.PositiveInfinity,
    };

    public static string Label(PipelineStage stage) => stage switch
    {
        PipelineStage.Capture => "Capture",
        PipelineStage.Vad => "VAD",
        PipelineStage.Asr => "ASR",
        PipelineStage.Translate => "Traduction",
        PipelineStage.Render => "Rendu",
        _ => stage.ToString(),
    };
}
