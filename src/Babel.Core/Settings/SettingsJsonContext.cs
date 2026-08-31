using System.Text.Json.Serialization;

namespace Babel.Core.Settings;

/// <summary>
/// Contexte de serialisation genere a la compilation : pas de reflexion au
/// demarrage, et un chemin compatible avec une future publication AOT.
/// </summary>
[JsonSourceGenerationOptions(
    WriteIndented = true,
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(BabelSettings))]
internal sealed partial class SettingsJsonContext : JsonSerializerContext;
