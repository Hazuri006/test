using UnrealBuildTool;

public class StellarFrontier : ModuleRules
{
	public StellarFrontier(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"ProceduralMeshComponent"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			// Add private-only dependencies here as the project grows.
		});

		// Large World Coordinates is enabled engine-wide in UE5; planet-scale
		// math below relies on double-precision FVector, which LWC provides.
	}
}
