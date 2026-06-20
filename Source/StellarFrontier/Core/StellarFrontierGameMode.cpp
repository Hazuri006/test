#include "StellarFrontierGameMode.h"
#include "Flight/Spaceship.h"
#include "GameFramework/PlayerController.h"

AStellarFrontierGameMode::AStellarFrontierGameMode()
{
	// Possess the spaceship by default. Override DefaultPawnClass with a
	// Blueprint subclass (BP_Spaceship) in-editor once you have a hull mesh and
	// the Enhanced Input assets assigned.
	DefaultPawnClass = ASpaceship::StaticClass();
	PlayerControllerClass = APlayerController::StaticClass();
}
