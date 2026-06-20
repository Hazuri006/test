#include "PlanetNoise.h"

FPlanetNoiseSettings FPlanetNoiseSettings::MakeDefault()
{
	FPlanetNoiseSettings Out;
	Out.Seed = 1337;

	// Layer 0: continents — low frequency, smooth, biased upward so land breaches sea level.
	FNoiseLayer Continents;
	Continents.bRidged = false;
	Continents.Octaves = 5;
	Continents.BaseFrequency = 0.9f;
	Continents.Lacunarity = 2.0f;
	Continents.Persistence = 0.5f;
	Continents.Amplitude = 1.0f;
	Continents.Offset = 0.15f;
	Out.Layers.Add(Continents);

	// Layer 1: mountains — ridged, higher frequency, masked to land only.
	FNoiseLayer Mountains;
	Mountains.bRidged = true;
	Mountains.Octaves = 7;
	Mountains.BaseFrequency = 2.5f;
	Mountains.Lacunarity = 2.1f;
	Mountains.Persistence = 0.45f;
	Mountains.Amplitude = 0.6f;
	Mountains.bUseFirstLayerAsMask = true;
	Out.Layers.Add(Mountains);

	// Layer 2: fine detail — high frequency, low amplitude, masked to land.
	FNoiseLayer Detail;
	Detail.bRidged = false;
	Detail.Octaves = 4;
	Detail.BaseFrequency = 8.0f;
	Detail.Lacunarity = 2.3f;
	Detail.Persistence = 0.5f;
	Detail.Amplitude = 0.08f;
	Detail.bUseFirstLayerAsMask = true;
	Out.Layers.Add(Detail);

	return Out;
}

FVector FPlanetNoise::MakeSeedOffset(int32 Seed, int32 LayerIndex)
{
	// Deterministically derive a large, well-spread offset per (seed, layer) so
	// each layer samples a different region of the noise field and different
	// seeds produce different worlds.
	const FRandomStream Stream(Seed * 73856093 ^ (LayerIndex + 1) * 19349663);
	return FVector(
		Stream.FRandRange(-10000.f, 10000.f),
		Stream.FRandRange(-10000.f, 10000.f),
		Stream.FRandRange(-10000.f, 10000.f));
}

float FPlanetNoise::SampleLayer(const FNoiseLayer& Layer, const FVector& P, const FVector& SeedOffset)
{
	float Frequency = Layer.BaseFrequency;
	float Amplitude = 1.0f;
	float Sum = 0.0f;
	float Normalization = 0.0f;

	for (int32 Octave = 0; Octave < Layer.Octaves; ++Octave)
	{
		// FMath::PerlinNoise3D returns roughly [-1, 1].
		const FVector SamplePos = (P * Frequency) + SeedOffset;
		float Value = FMath::PerlinNoise3D(SamplePos);

		if (Layer.bRidged)
		{
			// Classic ridged transform: sharp creases where noise crosses zero.
			Value = 1.0f - FMath::Abs(Value);
			Value = Value * Value;
		}

		Sum += Value * Amplitude;
		Normalization += Amplitude;

		Amplitude *= Layer.Persistence;
		Frequency *= Layer.Lacunarity;
	}

	float Result = (Normalization > 0.0f) ? (Sum / Normalization) : 0.0f;

	// Ridged noise lives in [0, 1]; recenter to roughly [-1, 1] so it composes
	// with smooth layers and the mask logic behaves consistently.
	if (Layer.bRidged)
	{
		Result = Result * 2.0f - 1.0f;
	}

	return Result * Layer.Amplitude + Layer.Offset;
}

float FPlanetNoise::SampleElevation(const FPlanetNoiseSettings& Settings, const FVector& UnitSpherePos)
{
	float Elevation = 0.0f;
	float FirstLayerValue = 0.0f;

	for (int32 i = 0; i < Settings.Layers.Num(); ++i)
	{
		const FNoiseLayer& Layer = Settings.Layers[i];
		if (!Layer.bEnabled)
		{
			continue;
		}

		const FVector SeedOffset = MakeSeedOffset(Settings.Seed, i);
		float LayerValue = SampleLayer(Layer, UnitSpherePos, SeedOffset);

		if (i == 0)
		{
			FirstLayerValue = LayerValue;
		}
		else if (Layer.bUseFirstLayerAsMask)
		{
			// Only let this layer raise terrain where the first layer is above
			// sea level. Clamp to [0, 1] so the mask never inverts elevation.
			const float Mask = FMath::Clamp(FirstLayerValue, 0.0f, 1.0f);
			LayerValue *= Mask;
		}

		Elevation += LayerValue;
	}

	return Elevation;
}
