using System.Text.Json.Serialization;

namespace Peek.Core.Configuration;

/// <summary>
/// Contexte de serialisation genere a la compilation : aucune reflexion au
/// demarrage, et un chemin compatible avec une publication AOT le jour ou
/// l'installateur en aura besoin.
/// </summary>
[JsonSourceGenerationOptions(
    WriteIndented = true,
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(PeekConfig))]
[JsonSerializable(typeof(RestoreState))]
internal sealed partial class ConfigJsonContext : JsonSerializerContext;
