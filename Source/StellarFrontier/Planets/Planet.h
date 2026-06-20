#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "PlanetNoise.h"
#include "PlanetTypes.h"
#include "Planet.generated.h"

class UProceduralMeshComponent;
class UMaterialInterface;
class FPlanetQuadTreeNode;

/**
 * A procedurally generated, fully spherical planet with continuous level of
 * detail. The surface is a "spherified cube" (six faces) driven by a quad-tree
 * per face; chunks subdivide near the viewer for close-up detail and collapse
 * at distance for performance, so a single actor scales from orbit to ground.
 *
 * Elevation comes from layered 3D fractal noise (see FPlanetNoise) and the
 * surface is colored by elevation-banded biomes plus a flat ocean at sea level.
 * Vertex colors are written per chunk so a triplanar material can blend real
 * textures without UV seams (see docs/ARCHITECTURE.md).
 */
UCLASS()
class STELLARFRONTIER_API APlanet : public AActor
{
	GENERATED_BODY()

public:
	APlanet();
	virtual ~APlanet();

	virtual void Tick(float DeltaSeconds) override;

	// ---- Tunable parameters (exposed to the editor) ----

	/** Planet radius at sea level, in Unreal units (cm). Default 600 km-ish at game scale. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|Shape", meta = (ClampMin = "1000.0"))
	double Radius = 600000.0;

	/** Maximum vertical displacement of terrain (peaks/valleys), in Unreal units. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|Shape", meta = (ClampMin = "0.0"))
	double HeightScale = 40000.0;

	/** Normalized sea level in elevation space; terrain below this is flooded flat. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|Shape", meta = (ClampMin = "-1.0", ClampMax = "1.0"))
	float SeaLevel = 0.0f;

	/** Vertices per chunk edge. Higher = denser mesh per chunk (cost scales ~quadratically). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|LOD", meta = (ClampMin = "4", ClampMax = "128"))
	int32 ChunkResolution = 24;

	/** Maximum quad-tree depth. Each level halves chunk size and doubles ground detail. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|LOD", meta = (ClampMin = "0", ClampMax = "16"))
	int32 MaxDepth = 9;

	/** Higher = subdivide more eagerly (more detail, more triangles). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|LOD", meta = (ClampMin = "0.5"))
	float SplitFactor = 2.0f;

	/** Quad-tree depth at or beyond which chunks get collision (so you can land/walk). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|LOD", meta = (ClampMin = "0"))
	int32 CollisionDepth = 6;

	/** Layered fractal-noise profile that shapes the terrain. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|Surface")
	FPlanetNoiseSettings Noise;

	/** Elevation-banded biomes, written to vertex color for the surface material. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|Surface")
	TArray<FPlanetBiome> Biomes;

	/** Color of water at/below sea level. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|Surface")
	FLinearColor OceanColor = FLinearColor(0.02f, 0.18f, 0.35f, 1.0f);

	/** Surface material. Assign a triplanar material in-editor; vertex color carries the biome tint. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|Surface")
	TObjectPtr<UMaterialInterface> SurfaceMaterial;

	/** Optional explicit viewer (e.g. the player ship). Falls back to the local player camera. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Planet|LOD")
	TObjectPtr<AActor> ViewerOverride;

	// ---- Surface evaluation, called by quad-tree nodes ----

	/** Signed elevation in roughly [-1, 1] for a point on the unit sphere. */
	float SampleElevation(const FVector& UnitSpherePos) const;

	/**
	 * Final surface point (planet-local, relative to actor origin) for a unit-sphere
	 * direction, accounting for sea-level flooding. Also returns the raw elevation.
	 */
	FVector GetSurfacePoint(const FVector& UnitSpherePos, float& OutElevation) const;

	/** Biome/ocean color for a surface sample. */
	FLinearColor EvaluateColor(float Elevation, const FVector& UnitSpherePos) const;

	/** Allocate a chunk mesh component rooted on this actor (GC-safe). */
	UProceduralMeshComponent* CreateChunkComponent();

	/** Return a chunk mesh component to the pool / destroy it. */
	void ReleaseChunkComponent(UProceduralMeshComponent* Component);

	/** Viewer position in this planet's local space (used for LOD distance tests). */
	FVector GetViewerLocalPosition() const;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
	void RebuildFaces();

	/** Six quad-tree roots, one per cube face. */
	TArray<TUniquePtr<FPlanetQuadTreeNode>> Faces;

	/** Keeps generated chunk meshes referenced so the GC won't collect them. */
	UPROPERTY()
	TArray<TObjectPtr<UProceduralMeshComponent>> ManagedChunks;

	UPROPERTY()
	TObjectPtr<USceneComponent> PlanetRoot;
};
