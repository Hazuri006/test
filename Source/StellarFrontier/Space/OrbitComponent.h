#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "OrbitComponent.generated.h"

/**
 * Moves the owning actor along a simple elliptical orbit around a center actor
 * (or a fixed world point), and optionally spins it on its axis. Good enough to
 * make a solar system feel alive; swap for a real n-body integrator later.
 */
UCLASS(ClassGroup = (StellarFrontier), meta = (BlueprintSpawnableComponent))
class STELLARFRONTIER_API UOrbitComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UOrbitComponent();

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Body to orbit around. If null, orbits CenterWorldLocation. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Orbit")
	TObjectPtr<AActor> CenterActor;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Orbit")
	FVector CenterWorldLocation = FVector::ZeroVector;

	/** Semi-major axis (orbit radius) in Unreal units. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Orbit", meta = (ClampMin = "0.0"))
	double SemiMajorAxis = 5000000.0;

	/** Orbital eccentricity [0,1): 0 is circular. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Orbit", meta = (ClampMin = "0.0", ClampMax = "0.95"))
	float Eccentricity = 0.0f;

	/** Degrees per second along the orbit. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Orbit")
	float OrbitSpeedDegPerSec = 1.5f;

	/** Tilt of the orbital plane, in degrees. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Orbit")
	float InclinationDegrees = 0.0f;

	/** Starting angle along the orbit, in degrees. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Orbit")
	float StartingPhaseDegrees = 0.0f;

	/** Axial spin rate (degrees/second) applied as local yaw. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Orbit")
	float AxialSpinDegPerSec = 5.0f;

protected:
	virtual void BeginPlay() override;

private:
	float CurrentAngleDeg = 0.0f;
};
