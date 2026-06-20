#include "PlanetQuadTreeNode.h"

#include "Planet.h"
#include "ProceduralMeshComponent.h"
#include "KismetProceduralMeshLibrary.h"

FPlanetQuadTreeNode::FPlanetQuadTreeNode(APlanet* InPlanet, const FVector& InLocalUp, const FVector2D& InCenter, double InSize, int32 InDepth)
	: Planet(InPlanet)
	, LocalUp(InLocalUp)
	, Center(InCenter)
	, Size(InSize)
	, Depth(InDepth)
{
	// Build an orthonormal basis on the face plane. AxisA/AxisB are derived from
	// LocalUp by swizzling components, which yields stable, perpendicular axes.
	AxisA = FVector(LocalUp.Y, LocalUp.Z, LocalUp.X);
	AxisB = FVector::CrossProduct(LocalUp, AxisA);
}

FPlanetQuadTreeNode::~FPlanetQuadTreeNode()
{
	// Children are unique-ptrs and clean themselves up; release our own mesh.
	DestroyMesh();
}

FVector FPlanetQuadTreeNode::PointOnUnitSphere(const FVector2D& FaceCoord) const
{
	// Position on the cube face in [-1, 1]^2 mapped onto the face plane.
	const FVector OnCube = LocalUp + AxisA * FaceCoord.X + AxisB * FaceCoord.Y;

	// Spherified-cube mapping (Phil Nowell): distributes vertices far more evenly
	// than a plain normalize(), reducing distortion toward face corners.
	const double X = OnCube.X;
	const double Y = OnCube.Y;
	const double Z = OnCube.Z;
	const double X2 = X * X;
	const double Y2 = Y * Y;
	const double Z2 = Z * Z;

	FVector Spherified;
	Spherified.X = X * FMath::Sqrt(1.0 - (Y2 * 0.5) - (Z2 * 0.5) + (Y2 * Z2 / 3.0));
	Spherified.Y = Y * FMath::Sqrt(1.0 - (Z2 * 0.5) - (X2 * 0.5) + (Z2 * X2 / 3.0));
	Spherified.Z = Z * FMath::Sqrt(1.0 - (X2 * 0.5) - (Y2 * 0.5) + (X2 * Y2 / 3.0));
	return Spherified;
}

FVector FPlanetQuadTreeNode::ComputeChunkWorldCenter() const
{
	float Unused;
	const FVector LocalSurface = Planet->GetSurfacePoint(PointOnUnitSphere(Center), Unused);
	return Planet->GetActorTransform().TransformPosition(LocalSurface);
}

void FPlanetQuadTreeNode::Update(const FVector& ViewerLocalPos)
{
	// Distance from the viewer to this chunk's surface center, in world units.
	const FVector ChunkWorldCenter = ComputeChunkWorldCenter();
	const FVector ViewerWorld = Planet->GetActorTransform().TransformPosition(ViewerLocalPos);
	const double DistanceToViewer = FVector::Distance(ViewerWorld, ChunkWorldCenter);

	// Approximate world-space size of this chunk (face half-width * radius * 2).
	const double ChunkWorldSize = Size * 2.0 * Planet->Radius;

	// Split when the viewer is within SplitFactor chunk-widths and depth allows it.
	const bool bShouldSplit =
		(Depth < Planet->MaxDepth) &&
		(DistanceToViewer < ChunkWorldSize * Planet->SplitFactor);

	if (bShouldSplit)
	{
		if (IsLeaf())
		{
			Split();
		}
		for (const TUniquePtr<FPlanetQuadTreeNode>& Child : Children)
		{
			Child->Update(ViewerLocalPos);
		}
	}
	else
	{
		if (!IsLeaf())
		{
			Merge();
		}
		if (!Mesh)
		{
			BuildMesh();
		}
	}
}

void FPlanetQuadTreeNode::Split()
{
	DestroyMesh();

	const double ChildSize = Size * 0.5;
	const FVector2D Offsets[4] = {
		FVector2D(-ChildSize, -ChildSize),
		FVector2D( ChildSize, -ChildSize),
		FVector2D(-ChildSize,  ChildSize),
		FVector2D( ChildSize,  ChildSize)
	};

	Children.Reserve(4);
	for (int32 i = 0; i < 4; ++i)
	{
		Children.Add(MakeUnique<FPlanetQuadTreeNode>(
			Planet, LocalUp, Center + Offsets[i], ChildSize, Depth + 1));
	}
}

void FPlanetQuadTreeNode::Merge()
{
	Children.Empty(); // unique-ptr destructors tear down child meshes recursively
}

void FPlanetQuadTreeNode::Collapse()
{
	Merge();
	DestroyMesh();
}

void FPlanetQuadTreeNode::BuildMesh()
{
	const int32 Res = FMath::Max(2, Planet->ChunkResolution);
	const int32 VertsPerEdge = Res + 1;

	TArray<FVector> Vertices;
	TArray<int32> Triangles;
	TArray<FVector2D> UVs;
	TArray<FLinearColor> VertexColors;
	TArray<FVector> Normals;
	TArray<FProcMeshTangent> Tangents;

	Vertices.Reserve(VertsPerEdge * VertsPerEdge);
	UVs.Reserve(VertsPerEdge * VertsPerEdge);
	VertexColors.Reserve(VertsPerEdge * VertsPerEdge);
	Triangles.Reserve(Res * Res * 6);

	// Sample a regular grid across this node's patch of the face.
	for (int32 y = 0; y < VertsPerEdge; ++y)
	{
		for (int32 x = 0; x < VertsPerEdge; ++x)
		{
			const double U = (double)x / (double)Res; // [0,1] across the patch
			const double V = (double)y / (double)Res;

			const FVector2D FaceCoord(
				Center.X + FMath::Lerp(-Size, Size, U),
				Center.Y + FMath::Lerp(-Size, Size, V));

			const FVector UnitPos = PointOnUnitSphere(FaceCoord);

			float Elevation = 0.0f;
			const FVector SurfacePoint = Planet->GetSurfacePoint(UnitPos, Elevation);

			Vertices.Add(SurfacePoint);
			UVs.Add(FVector2D(U, V));
			VertexColors.Add(Planet->EvaluateColor(Elevation, UnitPos));
		}
	}

	// Two triangles per grid cell (clockwise winding for outward-facing normals).
	for (int32 y = 0; y < Res; ++y)
	{
		for (int32 x = 0; x < Res; ++x)
		{
			const int32 I0 = y * VertsPerEdge + x;
			const int32 I1 = I0 + 1;
			const int32 I2 = I0 + VertsPerEdge;
			const int32 I3 = I2 + 1;

			Triangles.Add(I0); Triangles.Add(I2); Triangles.Add(I1);
			Triangles.Add(I1); Triangles.Add(I2); Triangles.Add(I3);
		}
	}

	// Let the engine compute smooth normals + tangents from the geometry & UVs.
	UKismetProceduralMeshLibrary::CalculateTangentsForMesh(Vertices, Triangles, UVs, Normals, Tangents);

	Mesh = Planet->CreateChunkComponent();
	if (!Mesh)
	{
		return;
	}

	const bool bCreateCollision = (Depth >= Planet->CollisionDepth);
	Mesh->CreateMeshSection_LinearColor(
		/*SectionIndex*/ 0, Vertices, Triangles, Normals, UVs, VertexColors, Tangents, bCreateCollision);

	if (bCreateCollision)
	{
		Mesh->SetCollisionProfileName(TEXT("BlockAll"));
		Mesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	}
	else
	{
		Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}

	if (Planet->SurfaceMaterial)
	{
		Mesh->SetMaterial(0, Planet->SurfaceMaterial);
	}
}

void FPlanetQuadTreeNode::DestroyMesh()
{
	if (Mesh)
	{
		Planet->ReleaseChunkComponent(Mesh);
		Mesh = nullptr;
	}
}
