using UnrealBuildTool;
using System.Collections.Generic;

public class StellarFrontierTarget : TargetRules
{
	public StellarFrontierTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("StellarFrontier");
	}
}
