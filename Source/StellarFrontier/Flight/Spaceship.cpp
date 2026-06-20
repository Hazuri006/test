#include "Spaceship.h"

#include "Components/StaticMeshComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/PlayerController.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputMappingContext.h"
#include "InputAction.h"

ASpaceship::ASpaceship()
{
	PrimaryActorTick.bCanEverTick = true;

	Hull = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Hull"));
	SetRootComponent(Hull);
	Hull->SetSimulatePhysics(false); // movement is integrated manually below
	Hull->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	Hull->SetCollisionProfileName(TEXT("Pawn"));

	SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
	SpringArm->SetupAttachment(Hull);
	SpringArm->TargetArmLength = 1800.0f;
	SpringArm->SocketOffset = FVector(0.0f, 0.0f, 400.0f);
	SpringArm->bEnableCameraLag = true;
	SpringArm->CameraLagSpeed = 6.0f;
	SpringArm->bEnableCameraRotationLag = true;
	SpringArm->CameraRotationLagSpeed = 8.0f;
	// The ship controls orientation directly, so the arm follows the hull rigidly
	// (no inherited yaw/pitch on top), giving a clean chase-cam.
	SpringArm->bUsePawnControlRotation = false;
	SpringArm->bInheritPitch = true;
	SpringArm->bInheritYaw = true;
	SpringArm->bInheritRoll = true;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(SpringArm, USpringArmComponent::SocketName);
	Camera->bUsePawnControlRotation = false;
}

void ASpaceship::BeginPlay()
{
	Super::BeginPlay();
}

void ASpaceship::PawnClientRestart()
{
	Super::PawnClientRestart();
	AddMappingContext();
}

void ASpaceship::AddMappingContext()
{
	if (!FlightMappingContext)
	{
		return;
	}

	if (const APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (ULocalPlayer* LocalPlayer = PC->GetLocalPlayer())
		{
			if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
				LocalPlayer->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>())
			{
				Subsystem->AddMappingContext(FlightMappingContext, /*Priority*/ 0);
			}
		}
	}
}

void ASpaceship::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!EIC)
	{
		return;
	}

	if (ThrottleAction)
	{
		EIC->BindAction(ThrottleAction, ETriggerEvent::Triggered, this, &ASpaceship::OnThrottle);
		EIC->BindAction(ThrottleAction, ETriggerEvent::Completed, this, &ASpaceship::OnThrottle);
	}
	if (StrafeAction)
	{
		EIC->BindAction(StrafeAction, ETriggerEvent::Triggered, this, &ASpaceship::OnStrafe);
		EIC->BindAction(StrafeAction, ETriggerEvent::Completed, this, &ASpaceship::OnStrafe);
	}
	if (LookAction)
	{
		EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &ASpaceship::OnLook);
		EIC->BindAction(LookAction, ETriggerEvent::Completed, this, &ASpaceship::OnLook);
	}
	if (RollAction)
	{
		EIC->BindAction(RollAction, ETriggerEvent::Triggered, this, &ASpaceship::OnRoll);
		EIC->BindAction(RollAction, ETriggerEvent::Completed, this, &ASpaceship::OnRoll);
	}
	if (BoostAction)
	{
		EIC->BindAction(BoostAction, ETriggerEvent::Started, this, &ASpaceship::OnBoostStarted);
		EIC->BindAction(BoostAction, ETriggerEvent::Completed, this, &ASpaceship::OnBoostCompleted);
	}
	if (FlightAssistAction)
	{
		EIC->BindAction(FlightAssistAction, ETriggerEvent::Started, this, &ASpaceship::OnToggleFlightAssist);
	}
}

void ASpaceship::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (DeltaSeconds <= 0.0f)
	{
		return;
	}

	// ---- Rotation: ramp angular velocity toward the input target for inertia ----
	const FVector TargetAngular(
		LookInput.Y * PitchRate,  // pitch
		LookInput.X * YawRate,    // yaw
		RollInput * RollRate);    // roll

	AngularVelocity = FMath::VInterpTo(AngularVelocity, TargetAngular, DeltaSeconds, RotationResponsiveness);

	const FRotator DeltaRotation(
		AngularVelocity.X * DeltaSeconds,
		AngularVelocity.Y * DeltaSeconds,
		AngularVelocity.Z * DeltaSeconds);
	AddActorLocalRotation(DeltaRotation);

	// ---- Linear: accelerate along local axes, then integrate position ----
	const float ThrustMul = bBoosting ? BoostMultiplier : 1.0f;

	const FVector Forward = GetActorForwardVector();
	const FVector Right = GetActorRightVector();
	const FVector Up = GetActorUpVector();

	const FVector Acceleration =
		(Forward * ThrottleInput + Right * StrafeInput.X + Up * StrafeInput.Y)
		* (ThrustAcceleration * ThrustMul);

	Velocity += Acceleration * DeltaSeconds;

	// Flight assist / atmospheric drag: exponential decay toward zero velocity.
	float Damping = 0.0f;
	if (bFlightAssistEnabled)
	{
		Damping += FlightAssistDamping;
	}
	if (bInAtmosphere)
	{
		Damping += AtmosphericDrag;
	}
	if (Damping > 0.0f)
	{
		Velocity *= FMath::Clamp(1.0f - Damping * DeltaSeconds, 0.0f, 1.0f);
	}

	// Clamp to a (boost-scaled) soft max speed.
	const float SpeedCap = MaxSpeed * ThrustMul;
	if (Velocity.SizeSquared() > FMath::Square(SpeedCap))
	{
		Velocity = Velocity.GetClampedToMaxSize(SpeedCap);
	}

	// Move with sweep so the ship collides with planet chunks / objects.
	FHitResult Hit;
	AddActorWorldOffset(Velocity * DeltaSeconds, /*bSweep*/ true, &Hit);
	if (Hit.bBlockingHit)
	{
		// Kill the into-surface component of velocity and slide along the surface.
		Velocity = FVector::VectorPlaneProject(Velocity, Hit.Normal) * 0.5f;
	}
}

void ASpaceship::OnThrottle(const FInputActionValue& Value)
{
	ThrottleInput = FMath::Clamp(Value.Get<float>(), -1.0f, 1.0f);
}

void ASpaceship::OnStrafe(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	StrafeInput = FVector2D(FMath::Clamp(Axis.X, -1.0f, 1.0f), FMath::Clamp(Axis.Y, -1.0f, 1.0f));
}

void ASpaceship::OnLook(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	LookInput = FVector2D(FMath::Clamp(Axis.X, -1.0f, 1.0f), FMath::Clamp(Axis.Y, -1.0f, 1.0f));
}

void ASpaceship::OnRoll(const FInputActionValue& Value)
{
	RollInput = FMath::Clamp(Value.Get<float>(), -1.0f, 1.0f);
}

void ASpaceship::OnBoostStarted(const FInputActionValue& Value)
{
	bBoosting = true;
}

void ASpaceship::OnBoostCompleted(const FInputActionValue& Value)
{
	bBoosting = false;
}

void ASpaceship::OnToggleFlightAssist(const FInputActionValue& Value)
{
	bFlightAssistEnabled = !bFlightAssistEnabled;
}
