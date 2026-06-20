#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "Spaceship.generated.h"

class UStaticMeshComponent;
class USpringArmComponent;
class UCameraComponent;
class UInputMappingContext;
class UInputAction;
struct FInputActionValue;

/**
 * Player spaceship with a six-degrees-of-freedom flight model.
 *
 * The model integrates linear velocity and angular rates by hand (rather than
 * leaning on rigid-body physics) so the feel is precise and tunable — the
 * approach arcade-sim space games use. Two regimes are supported:
 *
 *  - Space: near-frictionless. With "flight assist" ON, velocity gently damps
 *    toward your facing so the ship is easy to fly; with it OFF you keep true
 *    Newtonian inertia and can drift/strafe freely.
 *  - Atmosphere: stronger drag and a banking tendency, set bInAtmosphere true
 *    (e.g. from a planet proximity check) for a heavier, plane-like feel.
 *
 * Input is wired through Enhanced Input. Assign the Input Action / Mapping
 * Context assets in the editor (see docs/GETTING_STARTED.md); the bindings are
 * null-safe so the project still runs before assets are hooked up.
 */
UCLASS()
class STELLARFRONTIER_API ASpaceship : public APawn
{
	GENERATED_BODY()

public:
	ASpaceship();

	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	UFUNCTION(BlueprintPure, Category = "Flight")
	float GetCurrentSpeed() const { return Velocity.Size(); }

	UFUNCTION(BlueprintCallable, Category = "Flight")
	void SetInAtmosphere(bool bNewInAtmosphere) { bInAtmosphere = bNewInAtmosphere; }

protected:
	virtual void BeginPlay() override;
	virtual void PawnClientRestart() override;

	// ---- Components ----
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UStaticMeshComponent> Hull;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<USpringArmComponent> SpringArm;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components")
	TObjectPtr<UCameraComponent> Camera;

	// ---- Enhanced Input assets (assign in editor) ----
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Input")
	TObjectPtr<UInputMappingContext> FlightMappingContext;

	/** 1D axis: forward/back throttle. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Input")
	TObjectPtr<UInputAction> ThrottleAction;

	/** 2D axis: X = strafe right, Y = strafe up. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Input")
	TObjectPtr<UInputAction> StrafeAction;

	/** 2D axis: X = yaw, Y = pitch (mouse / right stick). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Input")
	TObjectPtr<UInputAction> LookAction;

	/** 1D axis: roll (Q/E or shoulder buttons). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Input")
	TObjectPtr<UInputAction> RollAction;

	/** Digital: hold to boost. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Input")
	TObjectPtr<UInputAction> BoostAction;

	/** Digital: toggle flight assist. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Input")
	TObjectPtr<UInputAction> FlightAssistAction;

	// ---- Flight tuning ----

	/** Forward/strafe acceleration, in Unreal units/s^2. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight|Thrust")
	float ThrustAcceleration = 250000.0f;

	/** Multiplier applied to thrust and max speed while boosting. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight|Thrust")
	float BoostMultiplier = 4.0f;

	/** Soft cap on speed (before boost), in Unreal units/s. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight|Thrust")
	float MaxSpeed = 400000.0f;

	/** Max rotation rates in degrees/second. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight|Rotation")
	float PitchRate = 70.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight|Rotation")
	float YawRate = 55.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight|Rotation")
	float RollRate = 120.0f;

	/** How quickly rotation rates ramp toward the input target (inertia feel). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight|Rotation")
	float RotationResponsiveness = 6.0f;

	/** Flight-assist linear damping (per second). Higher = velocity bleeds off faster. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight|Assist")
	float FlightAssistDamping = 1.2f;

	/** Atmospheric drag (per second), applied on top of assist when in atmosphere. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight|Assist")
	float AtmosphericDrag = 0.8f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Flight|Assist")
	bool bFlightAssistEnabled = true;

private:
	// ---- Input handlers ----
	void OnThrottle(const FInputActionValue& Value);
	void OnStrafe(const FInputActionValue& Value);
	void OnLook(const FInputActionValue& Value);
	void OnRoll(const FInputActionValue& Value);
	void OnBoostStarted(const FInputActionValue& Value);
	void OnBoostCompleted(const FInputActionValue& Value);
	void OnToggleFlightAssist(const FInputActionValue& Value);

	void AddMappingContext();

	// ---- Runtime state ----
	FVector Velocity = FVector::ZeroVector;

	float ThrottleInput = 0.0f;     // [-1, 1]
	FVector2D StrafeInput = FVector2D::ZeroVector; // x=right, y=up
	FVector2D LookInput = FVector2D::ZeroVector;   // x=yaw, y=pitch
	float RollInput = 0.0f;          // [-1, 1]

	/** Smoothed angular velocity in deg/s (pitch, yaw, roll) for inertial rotation. */
	FVector AngularVelocity = FVector::ZeroVector;

	bool bBoosting = false;
	bool bInAtmosphere = false;
};
