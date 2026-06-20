#pragma once

#include "CoreMinimal.h"
#include "PlanetNoise.generated.h"

/**
 * A single layer of fractal noise. Planets stack several of these to combine,
 * for example, large continents (low frequency) with sharp ridged mountains
 * (high frequency, ridged) and fine surface detail.
 */
USTRUCT(BlueprintType)
struct FNoiseLayer
{
	GENERATED_BODY()

	/** Whether this layer contributes to the final elevation. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Noise")
	bool bEnabled = true;

	/** Ridged noise produces sharp mountain ridges; smooth produces rolling hills. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Noise")
	bool bRidged = false;

	/** Number of fBm octaves. More octaves = more detail (and more cost). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Noise", meta = (ClampMin = "1", ClampMax = "12"))
	int32 Octaves = 6;

	/** Frequency of the first octave. Higher = smaller features. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Noise", meta = (ClampMin = "0.01"))
	float BaseFrequency = 1.0f;

	/** Frequency multiplier per octave. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Noise", meta = (ClampMin = "1.0"))
	float Lacunarity = 2.0f;

	/** Amplitude multiplier per octave (a.k.a. gain / roughness). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Noise", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float Persistence = 0.5f;

	/** Overall strength of this layer's contribution. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Noise")
	float Amplitude = 1.0f;

	/** Raises elevation; useful for pushing continents above sea level. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Noise")
	float Offset = 0.0f;

	/**
	 * When true, this layer is multiplied by the (clamped) output of the first
	 * layer. This lets a "continent mask" suppress mountains in the oceans so
	 * detail only appears on land — a classic procedural-planet trick.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Noise")
	bool bUseFirstLayerAsMask = false;
};

/** A full noise profile for a planet: a seed plus an ordered stack of layers. */
USTRUCT(BlueprintType)
struct FPlanetNoiseSettings
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Noise")
	int32 Seed = 1337;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Noise")
	TArray<FNoiseLayer> Layers;

	/** Provides a sensible default profile (continents + ridged mountains + detail). */
	static FPlanetNoiseSettings MakeDefault();
};

/**
 * Stateless 3D fractal-noise sampler. Sampling in 3D (on the unit sphere)
 * guarantees seamless results with no polar pinching or UV seams — unlike
 * sampling a 2D heightmap wrapped around a sphere.
 */
class STELLARFRONTIER_API FPlanetNoise
{
public:
	/**
	 * Returns signed elevation in roughly [-1, 1] for a point on the unit sphere.
	 * Multiply by a height scale and add to the planet radius to get a surface point.
	 */
	static float SampleElevation(const FPlanetNoiseSettings& Settings, const FVector& UnitSpherePos);

private:
	static float SampleLayer(const FNoiseLayer& Layer, const FVector& P, const FVector& SeedOffset);
	static FVector MakeSeedOffset(int32 Seed, int32 LayerIndex);
};
