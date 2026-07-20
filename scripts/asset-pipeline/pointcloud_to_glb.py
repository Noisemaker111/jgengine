#!/usr/bin/env python3
"""Mesh a point cloud (e.g. LingBot-Map output) and export a .glb.

Runs locally, no GPU required. See
.claude/skills/jgengine-assets/references/video-to-3d-capture.md for the
full capture -> reconstruct -> mesh -> import pipeline this fits into.

Usage:
    python3 pointcloud_to_glb.py input.ply output.glb [--depth 9] [--decimate 50000]

Requires: open3d, trimesh (pip install open3d trimesh)
"""

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Input point cloud (.ply, .pcd, or .npz with 'points'/'colors')")
    parser.add_argument("output", help="Output mesh path (.glb)")
    parser.add_argument("--depth", type=int, default=9, help="Poisson reconstruction octree depth (default 9)")
    parser.add_argument("--decimate", type=int, default=None, help="Target triangle count after decimation")
    args = parser.parse_args()

    try:
        import numpy as np
        import open3d as o3d
    except ImportError:
        print("Missing dependency: pip install open3d trimesh numpy", file=sys.stderr)
        return 1

    if args.input.endswith(".npz"):
        data = np.load(args.input)
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(data["points"])
        if "colors" in data:
            pcd.colors = o3d.utility.Vector3dVector(data["colors"])
    else:
        pcd = o3d.io.read_point_cloud(args.input)

    if not pcd.has_normals():
        pcd.estimate_normals()
        pcd.orient_normals_consistent_tangent_plane(30)

    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd, depth=args.depth
    )

    # Trim low-density (sparsely-observed) vertices Poisson extrapolates past the real surface.
    densities = np.asarray(densities)
    keep = densities >= np.quantile(densities, 0.02)
    mesh.remove_vertices_by_mask(~keep)

    if args.decimate:
        mesh = mesh.simplify_quadric_decimation(args.decimate)

    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_unreferenced_vertices()
    mesh.compute_vertex_normals()

    o3d.io.write_triangle_mesh(args.output, mesh)
    print(f"Wrote {args.output}: {len(mesh.vertices)} verts, {len(mesh.triangles)} tris")
    print("Expect to hand-clean scale/facing/holes in Blender before cataloging.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
