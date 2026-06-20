#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SolarSystem.generated.h"

class APlanet;
class UDirectionalLightComponent;
class UPointLightComponent;
class UStaticMeshComponent;

/** Per-planet spawn description used to procedurally populate a system. */
USTRUCT(BlueprintType)
struct FPlanetSpawnDesc
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet")
	double OrbitRadius = 5000000.0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet")
	double PlanetRadius = 600000.0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet")
	int32 Seed = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet")
	float OrbitSpeedDegPerSec = 1.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet")
	float InclinationDegrees = 0.0f;
};

/**
 * A star at the origin with a set of planets placed on orbits around it. On
 * BeginPlay it either spawns the planets you describe in PlanetDescs, or — if
 * that list is empty — procedurally rolls a system from SystemSeed.
 *
 * The star drives scene lighting via a directional "sun" light (cheap, crisp
 * shadows at planet scale) plus an optional point light and a visible star mesh.
 */
UCLASS()
class STELLARFRONTIER_API ASolarSystem : public AActor
{
	GENERATED_BODY()

public:
	ASolarSystem();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "System")
	TSubclassOf<APlanet> PlanetClass;

	/** Explicit planets to spawn. Leave empty to roll a procedural system. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "System")
	TArray<FPlanetSpawnDesc> PlanetDescs;

	/** Seed used when PlanetDescs is empty. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "System")
	int32 SystemSeed = 20260620;

	/** Range of planet counts when rolling procedurally. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "System")
	int32 MinPlanets = 3;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "System")
	int32 MaxPlanets = 7;

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<USceneComponent> SystemRoot;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UStaticMeshComponent> StarMesh;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UPointLightComponent> StarLight;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UDirectionalLightComponent> SunLight;

private:
	void SpawnFromDescs();
	TArray<FPlanetSpawnDesc> RollProceduralSystem() const;
	void SpawnPlanet(const FPlanetSpawnDesc& Desc);

	UPROPERTY()
	TArray<TObjectPtr<APlanet>> SpawnedPlanets;
};
