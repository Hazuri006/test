#include "SolarSystem.h"

#include "OrbitComponent.h"
#include "Planets/Planet.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/DirectionalLightComponent.h"

ASolarSystem::ASolarSystem()
{
	PrimaryActorTick.bCanEverTick = false;

	SystemRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SystemRoot"));
	SetRootComponent(SystemRoot);

	StarMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("StarMesh"));
	StarMesh->SetupAttachment(SystemRoot);
	StarMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	StarMesh->SetWorldScale3D(FVector(2000.0f)); // assign a sphere mesh + emissive material in-editor

	StarLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("StarLight"));
	StarLight->SetupAttachment(SystemRoot);
	StarLight->SetIntensity(50000.0f);
	StarLight->SetAttenuationRadius(50000000.0f);
	StarLight->SetMobility(EComponentMobility::Movable);
	StarLight->SetCastShadows(false);

	// At planet scale a point light's inverse-square falloff makes distant worlds
	// too dark, so a directional "sun" provides the primary, even lighting.
	SunLight = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("SunLight"));
	SunLight->SetupAttachment(SystemRoot);
	SunLight->SetMobility(EComponentMobility::Movable);
	SunLight->SetIntensity(8.0f);
	SunLight->SetWorldRotation(FRotator(-35.0f, 0.0f, 0.0f));
}

void ASolarSystem::BeginPlay()
{
	Super::BeginPlay();

	if (!PlanetClass)
	{
		PlanetClass = APlanet::StaticClass();
	}

	if (PlanetDescs.Num() == 0)
	{
		PlanetDescs = RollProceduralSystem();
	}

	SpawnFromDescs();
}

TArray<FPlanetSpawnDesc> ASolarSystem::RollProceduralSystem() const
{
	TArray<FPlanetSpawnDesc> Out;
	FRandomStream Rng(SystemSeed);

	const int32 Count = Rng.RandRange(FMath::Min(MinPlanets, MaxPlanets), FMath::Max(MinPlanets, MaxPlanets));
	double Orbit = Rng.FRandRange(4000000.0, 7000000.0);

	for (int32 i = 0; i < Count; ++i)
	{
		FPlanetSpawnDesc Desc;
		Desc.OrbitRadius = Orbit;
		Desc.PlanetRadius = Rng.FRandRange(350000.0, 900000.0);
		Desc.Seed = Rng.RandRange(1, 1000000);
		// Outer planets orbit slower (a nod to Kepler's third law).
		Desc.OrbitSpeedDegPerSec = (float)(2.0 * FMath::Pow(4000000.0 / Orbit, 1.5));
		Desc.InclinationDegrees = Rng.FRandRange(-8.0f, 8.0f);
		Out.Add(Desc);

		// Space the next orbit out by a randomized gap so worlds don't overlap.
		Orbit += Rng.FRandRange(2500000.0, 5000000.0) + Desc.PlanetRadius * 2.0;
	}

	return Out;
}

void ASolarSystem::SpawnFromDescs()
{
	for (const FPlanetSpawnDesc& Desc : PlanetDescs)
	{
		SpawnPlanet(Desc);
	}
}

void ASolarSystem::SpawnPlanet(const FPlanetSpawnDesc& Desc)
{
	UWorld* World = GetWorld();
	if (!World || !PlanetClass)
	{
		return;
	}

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Params.Owner = this;

	const FVector StartLocation = GetActorLocation() + FVector(Desc.OrbitRadius, 0.0, 0.0);

	APlanet* Planet = World->SpawnActor<APlanet>(PlanetClass, StartLocation, FRotator::ZeroRotator, Params);
	if (!Planet)
	{
		return;
	}

	Planet->Radius = Desc.PlanetRadius;
	Planet->Noise.Seed = (Desc.Seed != 0) ? Desc.Seed : Planet->Noise.Seed;

	UOrbitComponent* Orbit = NewObject<UOrbitComponent>(Planet);
	if (Orbit)
	{
		Orbit->RegisterComponent();
		Orbit->CenterActor = this;
		Orbit->SemiMajorAxis = Desc.OrbitRadius;
		Orbit->OrbitSpeedDegPerSec = Desc.OrbitSpeedDegPerSec;
		Orbit->InclinationDegrees = Desc.InclinationDegrees;
		Orbit->StartingPhaseDegrees = FMath::Fmod((float)(Desc.Seed % 360), 360.0f);
	}

	SpawnedPlanets.Add(Planet);
}
