#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "StellarFrontierGameMode.generated.h"

/**
 * Default game mode. Spawns the player into the spaceship and uses a controller
 * that doesn't consume rotation input (the ship integrates its own orientation).
 */
UCLASS()
class STELLARFRONTIER_API AStellarFrontierGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AStellarFrontierGameMode();
};
