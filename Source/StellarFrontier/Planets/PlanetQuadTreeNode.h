#pragma once

#include "CoreMinimal.h"

class APlanet;
class UProceduralMeshComponent;

/**
 * One node in a per-face quad-tree covering a planet's surface.
 *
 * Each of a planet's six cube faces owns a root node. On every update the node
 * measures its distance to the viewer: if it is close enough (and not at max
 * depth) it subdivides into four children and hides its own mesh; otherwise it
 * collapses its children and shows a single chunk mesh. This is chunked LOD —
 * the standard technique behind seamless, planet-scale procedural terrain.
 *
 * Nodes are plain (non-UObject) C++ for cheap allocation; the GPU meshes they
 * own are UProceduralMeshComponents rooted on the planet actor so the GC keeps
 * them alive (see APlanet::CreateChunkComponent / ReleaseChunkComponent).
 */
class FPlanetQuadTreeNode
{
public:
	FPlanetQuadTreeNode(APlanet* InPlanet, const FVector& InLocalUp, const FVector2D& InCenter, double InSize, int32 InDepth);
	~FPlanetQuadTreeNode();

	/** Recursively evaluate LOD against the viewer's planet-local position. */
	void Update(const FVector& ViewerLocalPos);

	/** Tear down this node's mesh and all descendants (used on planet destroy). */
	void Collapse();

private:
	bool IsLeaf() const { return Children.Num() == 0; }

	void Split();
	void Merge();
	void BuildMesh();
	void DestroyMesh();

	/** Maps this node's 2D face coordinate to a unit-sphere position (spherified cube). */
	FVector PointOnUnitSphere(const FVector2D& FaceCoord) const;

	/** World-space center of this node, used for the LOD distance test. */
	FVector ComputeChunkWorldCenter() const;

	APlanet* Planet = nullptr;

	// Orthonormal basis for this cube face: LocalUp is the outward face normal,
	// AxisA/AxisB span the face plane.
	FVector LocalUp = FVector::UpVector;
	FVector AxisA = FVector::ForwardVector;
	FVector AxisB = FVector::RightVector;

	// Node extent in face space, where the full face spans [-1, 1] on each axis.
	FVector2D Center = FVector2D::ZeroVector;
	double Size = 1.0; // half-width of the node in face space

	int32 Depth = 0;

	TArray<TUniquePtr<FPlanetQuadTreeNode>> Children;
	UProceduralMeshComponent* Mesh = nullptr;
};
