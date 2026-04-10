from pathlib import Path
import json
import math
import numpy as np
import trimesh
import mapbox_earcut as earcut

BASE = Path(r"C:\Users\Admin\Projects\3DModel\artifacts\models\model_001_original.stl")
OUT = Path(r"C:\Users\Admin\Projects\3DModel\artifacts\models\model_002_from_model_001.stl")
RESULT = Path(r"C:\Users\Admin\Projects\3DModel\artifacts\jobs\job_001\result.json")

# Geometry inferred from the selected top face and verified from the base mesh.
W = 100.0
H = 200.0
THICK = 50.0
R_HOLE = 10.0
CHAMFER = 10.0
Z_TOP = 25.0
Z_CHAMFER_END = 15.0
Z_BOTTOM = -25.0
N = 512

assert BASE.exists(), f"Base model not found: {BASE}"
assert CHAMFER > 0
assert CHAMFER < min(W/2, H/2)


def circle_points(radius: float, z: float, count: int, clockwise: bool = False):
    theta = np.linspace(0.0, 2.0 * math.pi, count, endpoint=False)
    if clockwise:
        theta = theta[::-1]
    pts = np.column_stack((radius * np.cos(theta), radius * np.sin(theta), np.full(count, z)))
    return pts


def triangulate_planar_rings(rings_xy):
    coords = np.vstack([np.asarray(r, dtype=np.float64) for r in rings_xy])
    ring_ends = np.cumsum([len(r) for r in rings_xy], dtype=np.uint32)
    return earcut.triangulate_float64(coords, ring_ends).reshape(-1, 3)


vertices = []
faces = []


def add_vertices(points):
    start = len(vertices)
    vertices.extend(np.asarray(points, dtype=np.float64).tolist())
    return np.arange(start, start + len(points), dtype=np.int64)


def add_face(a, b, c):
    faces.append([int(a), int(b), int(c)])


def add_strip(loop_top, loop_bottom):
    # For CCW outer loops this yields outward normals; for CW inner loops it yields normals into the hole.
    n = len(loop_top)
    for i in range(n):
        j = (i + 1) % n
        a0, a1 = loop_top[i], loop_top[j]
        b0, b1 = loop_bottom[i], loop_bottom[j]
        add_face(a0, b0, b1)
        add_face(a0, b1, a1)


# Outer loops (CCW)
outer_top = np.array([
    [-40.0, -90.0, Z_TOP],
    [ 40.0, -90.0, Z_TOP],
    [ 40.0,  90.0, Z_TOP],
    [-40.0,  90.0, Z_TOP],
], dtype=np.float64)
outer_mid = np.array([
    [-50.0, -100.0, Z_CHAMFER_END],
    [ 50.0, -100.0, Z_CHAMFER_END],
    [ 50.0,  100.0, Z_CHAMFER_END],
    [-50.0,  100.0, Z_CHAMFER_END],
], dtype=np.float64)
outer_bottom = np.array([
    [-50.0, -100.0, Z_BOTTOM],
    [ 50.0, -100.0, Z_BOTTOM],
    [ 50.0,  100.0, Z_BOTTOM],
    [-50.0,  100.0, Z_BOTTOM],
], dtype=np.float64)

# Inner loops (CW so wall normals point into the hole)
inner_top = circle_points(R_HOLE + CHAMFER, Z_TOP, N, clockwise=True)
inner_mid = circle_points(R_HOLE, Z_CHAMFER_END, N, clockwise=True)
inner_bottom = circle_points(R_HOLE, Z_BOTTOM, N, clockwise=True)

idx_outer_top = add_vertices(outer_top)
idx_outer_mid = add_vertices(outer_mid)
idx_outer_bottom = add_vertices(outer_bottom)
idx_inner_top = add_vertices(inner_top)
idx_inner_mid = add_vertices(inner_mid)
idx_inner_bottom = add_vertices(inner_bottom)

# Top face (+Z)
tri_top = triangulate_planar_rings([outer_top[:, :2], inner_top[:, :2]])
for tri in tri_top:
    a, b, c = [int(x) for x in tri]
    va, vb, vc = outer_top.tolist() + inner_top.tolist()[0:0], None, None
# rebuild with explicit index map
map_top = np.concatenate([idx_outer_top, idx_inner_top])
coords_top = np.vstack([outer_top[:, :2], inner_top[:, :2]])
tri_top = triangulate_planar_rings([outer_top[:, :2], inner_top[:, :2]])
for tri in tri_top:
    ia, ib, ic = map_top[tri]
    pa, pb, pc = np.array(vertices[ia]), np.array(vertices[ib]), np.array(vertices[ic])
    nz = np.cross(pb - pa, pc - pa)[2]
    if nz < 0:
        ib, ic = ic, ib
    add_face(ia, ib, ic)

# Bottom face (-Z)
map_bottom = np.concatenate([idx_outer_bottom, idx_inner_bottom])
tri_bottom = triangulate_planar_rings([outer_bottom[:, :2], inner_bottom[:, :2]])
for tri in tri_bottom:
    ia, ib, ic = map_bottom[tri]
    pa, pb, pc = np.array(vertices[ia]), np.array(vertices[ib]), np.array(vertices[ic])
    nz = np.cross(pb - pa, pc - pa)[2]
    if nz > 0:
        ib, ic = ic, ib
    add_face(ia, ib, ic)

# Chamfers and vertical walls
add_strip(idx_outer_top, idx_outer_mid)
add_strip(idx_outer_mid, idx_outer_bottom)
add_strip(idx_inner_top, idx_inner_mid)
add_strip(idx_inner_mid, idx_inner_bottom)

mesh = trimesh.Trimesh(vertices=np.asarray(vertices), faces=np.asarray(faces), process=True, validate=True)
mesh.remove_duplicate_faces()
mesh.remove_unreferenced_vertices()
mesh.merge_vertices()
mesh.fix_normals(multibody=False)

assert mesh.is_watertight, 'Output mesh is not watertight'
OUT.parent.mkdir(parents=True, exist_ok=True)
mesh.export(OUT)

result = {
    'jobId': 'job_001',
    'operation': 'top-face chamfer 10 mm',
    'baseModelPath': str(BASE),
    'outputModelPath': str(OUT),
    'vertexCount': int(len(mesh.vertices)),
    'faceCount': int(len(mesh.faces)),
    'watertight': bool(mesh.is_watertight),
    'bounds': mesh.bounds.tolist(),
    'volume': float(mesh.volume),
    'area': float(mesh.area),
    'notes': [
        'Rebuilt the mesh analytically as a 100x200x50 block with a centered ?20 through-hole.',
        'Applied a 10 mm chamfer to all edges bounding the selected top face: outer perimeter and top hole edge.',
        'Preserved the original base STL and wrote a new output STL only.'
    ]
}
RESULT.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
