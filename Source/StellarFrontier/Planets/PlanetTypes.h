#pragma once

#include "CoreMinimal.h"
#include "PlanetTypes.generated.h"

/**
 * A biome band keyed by normalized elevation. Biomes are sorted by StartHeight
 * and the surface color is interpolated between adjacent bands, giving smooth
 * transitions from beaches to grass to rock to snow.
 */
USTRUCT(BlueprintType)
struct FPlanetBiome
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Biome")
	FName Name = NAME_None;

	/** Normalized elevation [0,1] (0 = sea level, 1 = highest peak) where this biome begins. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Biome", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float StartHeight = 0.0f;

	/** Base albedo tint written to vertex color; a triplanar material reads this to blend textures. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Biome")
	FLinearColor Color = FLinearColor::White;

	/** How sharply this biome blends into the next (0 = hard edge, 1 = fully gradual). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Biome", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float BlendStrength = 0.5f;
};

/** High-level archetype used to seed default noise + biome presets for variety between worlds. */
UENUM(BlueprintType)
enum class EPlanetArchetype : uint8
{
	Terran      UMETA(DisplayName = "Terran (oceans + continents)"),
	Desert      UMETA(DisplayName = "Desert"),
	Frozen      UMETA(DisplayName = "Frozen"),
	Volcanic    UMETA(DisplayName = "Volcanic"),
	Barren      UMETA(DisplayName = "Barren / Moon"),
	GasGiant    UMETA(DisplayName = "Gas Giant")
};
