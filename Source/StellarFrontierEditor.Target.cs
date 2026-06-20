using UnrealBuildTool;
using System.Collections.Generic;

public class StellarFrontierEditorTarget : TargetRules
{
	public StellarFrontierEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("StellarFrontier");
	}
}
