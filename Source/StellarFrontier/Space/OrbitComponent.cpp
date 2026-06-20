#include "OrbitComponent.h"
#include "GameFramework/Actor.h"

UOrbitComponent::UOrbitComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

void UOrbitComponent::BeginPlay()
{
	Super::BeginPlay();
	CurrentAngleDeg = StartingPhaseDegrees;
}

void UOrbitComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	AActor* Owner = GetOwner();
	if (!Owner)
	{
		return;
	}

	CurrentAngleDeg = FMath::Fmod(CurrentAngleDeg + OrbitSpeedDegPerSec * DeltaTime, 360.0f);
	const double Angle = FMath::DegreesToRadians(CurrentAngleDeg);

	// Ellipse in the orbital plane (focus at center): r = a(1-e^2)/(1+e*cos(theta)).
	const double E = FMath::Clamp(Eccentricity, 0.0f, 0.95f);
	const double SemiLatusRectum = SemiMajorAxis * (1.0 - E * E);
	const double R = SemiLatusRectum / (1.0 + E * FMath::Cos(Angle));

	FVector LocalOffset(R * FMath::Cos(Angle), R * FMath::Sin(Angle), 0.0);

	// Apply inclination by rotating the offset about the X axis.
	if (!FMath::IsNearlyZero(InclinationDegrees))
	{
		LocalOffset = FRotator(0.0f, 0.0f, InclinationDegrees).RotateVector(LocalOffset);
	}

	const FVector Center = CenterActor ? CenterActor->GetActorLocation() : CenterWorldLocation;
	Owner->SetActorLocation(Center + LocalOffset);

	if (!FMath::IsNearlyZero(AxialSpinDegPerSec))
	{
		Owner->AddActorLocalRotation(FRotator(0.0f, AxialSpinDegPerSec * DeltaTime, 0.0f));
	}
}
