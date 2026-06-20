#include "Planet.h"

#include "PlanetQuadTreeNode.h"
#include "ProceduralMeshComponent.h"
#include "Components/SceneComponent.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Camera/PlayerCameraManager.h"

APlanet::APlanet()
{
	PrimaryActorTick.bCanEverTick = true;

	PlanetRoot = CreateDefaultSubobject<USceneComponent>(TEXT("PlanetRoot"));
	SetRootComponent(PlanetRoot);

	// Sensible defaults so a freshly placed planet looks like a world, not a sphere.
	Noise = FPlanetNoiseSettings::MakeDefault();

	if (Biomes.Num() == 0)
	{
		auto AddBiome = [this](FName InName, float InStart, FLinearColor InColor, float InBlend)
		{
			FPlanetBiome B;
			B.Name = InName;
			B.StartHeight = InStart;
			B.Color = InColor;
			B.BlendStrength = InBlend;
			Biomes.Add(B);
		};

		AddBiome(TEXT("Beach"), 0.00f, FLinearColor(0.76f, 0.70f, 0.50f), 0.4f);
		AddBiome(TEXT("Grass"), 0.06f, FLinearColor(0.18f, 0.42f, 0.12f), 0.5f);
		AddBiome(TEXT("Forest"), 0.25f, FLinearColor(0.10f, 0.28f, 0.08f), 0.5f);
		AddBiome(TEXT("Rock"), 0.55f, FLinearColor(0.34f, 0.30f, 0.26f), 0.5f);
		AddBiome(TEXT("Snow"), 0.80f, FLinearColor(0.92f, 0.94f, 0.98f), 0.4f);
	}
}

void APlanet::BeginPlay()
{
	Super::BeginPlay();
	RebuildFaces();
}

void APlanet::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	for (const TUniquePtr<FPlanetQuadTreeNode>& Face : Faces)
	{
		if (Face)
		{
			Face->Collapse();
		}
	}
	Faces.Empty();
	Super::EndPlay(EndPlayReason);
}

void APlanet::RebuildFaces()
{
	for (const TUniquePtr<FPlanetQuadTreeNode>& Face : Faces)
	{
		if (Face)
		{
			Face->Collapse();
		}
	}
	Faces.Empty();

	// The six outward normals of a cube. Each becomes a quad-tree root spanning
	// the full face ([-1,1] in face space, hence Size = 1).
	const FVector FaceNormals[6] = {
		FVector::UpVector,    FVector::DownVector,
		FVector::ForwardVector, FVector::BackwardVector,
		FVector::RightVector,  FVector::LeftVector
	};

	Faces.Reserve(6);
	for (int32 i = 0; i < 6; ++i)
	{
		Faces.Add(MakeUnique<FPlanetQuadTreeNode>(
			this, FaceNormals[i], FVector2D::ZeroVector, /*Size*/ 1.0, /*Depth*/ 0));
	}
}

void APlanet::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	const FVector ViewerLocal = GetViewerLocalPosition();
	for (const TUniquePtr<FPlanetQuadTreeNode>& Face : Faces)
	{
		if (Face)
		{
			Face->Update(ViewerLocal);
		}
	}
}

float APlanet::SampleElevation(const FVector& UnitSpherePos) const
{
	return FPlanetNoise::SampleElevation(Noise, UnitSpherePos);
}

FVector APlanet::GetSurfacePoint(const FVector& UnitSpherePos, float& OutElevation) const
{
	OutElevation = SampleElevation(UnitSpherePos);

	// Flood everything below sea level to a flat ocean floor at sea level so
	// water sits as a smooth shell rather than following the seabed.
	const float EffectiveElevation = FMath::Max(OutElevation, SeaLevel);
	const double SurfaceRadius = Radius + (double)EffectiveElevation * HeightScale;
	return UnitSpherePos * SurfaceRadius;
}

FLinearColor APlanet::EvaluateColor(float Elevation, const FVector& UnitSpherePos) const
{
	// Below sea level => ocean, shaded slightly by depth for readability.
	if (Elevation < SeaLevel)
	{
		const float Depth = FMath::Clamp((SeaLevel - Elevation) / 0.5f, 0.0f, 1.0f);
		return FMath::Lerp(OceanColor, OceanColor * 0.4f, Depth);
	}

	if (Biomes.Num() == 0)
	{
		return FLinearColor::Gray;
	}

	// Normalize land elevation to [0,1] over the above-sea-level range.
	const float Range = FMath::Max(1.0f - SeaLevel, KINDA_SMALL_NUMBER);
	const float Normalized = FMath::Clamp((Elevation - SeaLevel) / Range, 0.0f, 1.0f);

	// Find the biome band and blend toward the next one for smooth transitions.
	FLinearColor Result = Biomes[0].Color;
	for (int32 i = 0; i < Biomes.Num(); ++i)
	{
		if (Normalized >= Biomes[i].StartHeight)
		{
			Result = Biomes[i].Color;

			if (i + 1 < Biomes.Num())
			{
				const float BandStart = Biomes[i].StartHeight;
				const float BandEnd = Biomes[i + 1].StartHeight;
				const float BandRange = FMath::Max(BandEnd - BandStart, KINDA_SMALL_NUMBER);
				const float T = FMath::Clamp((Normalized - BandStart) / BandRange, 0.0f, 1.0f);
				// Bias the blend toward the band edges using BlendStrength.
				const float Blend = FMath::SmoothStep(0.0f, 1.0f, T) * Biomes[i].BlendStrength;
				Result = FMath::Lerp(Biomes[i].Color, Biomes[i + 1].Color, Blend);
			}
		}
	}
	return Result;
}

UProceduralMeshComponent* APlanet::CreateChunkComponent()
{
	UProceduralMeshComponent* Chunk = NewObject<UProceduralMeshComponent>(this);
	if (!Chunk)
	{
		return nullptr;
	}

	Chunk->SetMobility(EComponentMobility::Movable);
	Chunk->RegisterComponent();
	Chunk->AttachToComponent(PlanetRoot, FAttachmentTransformRules::KeepRelativeTransform);
	Chunk->SetRelativeTransform(FTransform::Identity);

	// Cast shadows for that orbit-to-ground terminator look; tune in-editor.
	Chunk->SetCastShadow(true);

	ManagedChunks.Add(Chunk); // root against GC
	return Chunk;
}

void APlanet::ReleaseChunkComponent(UProceduralMeshComponent* Component)
{
	if (!Component)
	{
		return;
	}

	ManagedChunks.RemoveSingleSwap(Component, /*bAllowShrinking*/ false);
	Component->DestroyComponent();
}

FVector APlanet::GetViewerLocalPosition() const
{
	FVector ViewerWorld = GetActorLocation();
	bool bFound = false;

	if (ViewerOverride)
	{
		ViewerWorld = ViewerOverride->GetActorLocation();
		bFound = true;
	}
	else if (const UWorld* World = GetWorld())
	{
		if (const APlayerController* PC = UGameplayStatics::GetPlayerController(World, 0))
		{
			if (PC->PlayerCameraManager)
			{
				ViewerWorld = PC->PlayerCameraManager->GetCameraLocation();
				bFound = true;
			}
			else if (const APawn* Pawn = PC->GetPawn())
			{
				ViewerWorld = Pawn->GetActorLocation();
				bFound = true;
			}
		}
	}

	// If we couldn't find a viewer (e.g. in-editor with no PIE), default to a
	// point above the north pole so the planet still tessellates somewhere.
	if (!bFound)
	{
		ViewerWorld = GetActorLocation() + FVector(0, 0, Radius * 2.0);
	}

	return GetActorTransform().InverseTransformPosition(ViewerWorld);
}
