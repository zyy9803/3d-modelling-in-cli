import json, math, struct
from pathlib import Path

def sub(a,b):
    return (a[0]-b[0], a[1]-b[1], a[2]-b[2])

def cross(a,b):
    return (
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0],
    )

def norm(v):
    l = math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2])
    if l == 0:
        return (0.0, 0.0, 0.0)
    return (v[0]/l, v[1]/l, v[2]/l)

def dist(a,b):
    return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2)

workspace = Path(r"C:\Users\Admin\Projects\3DModel\artifacts\jobs\job_002")
input_path = Path(r"C:\Users\Admin\Projects\3DModel\artifacts\models\model_001_original.stl")
output_path = Path(r"C:\Users\Admin\Projects\3DModel\artifacts\models\model_003_from_model_001.stl")
result_path = workspace / 'result.json'

scale_z = 2.0
triangles = []
with input_path.open('rb') as f:
    header = f.read(80)
    tri_count = struct.unpack('<I', f.read(4))[0]
    for _ in range(tri_count):
        vals = struct.unpack('<12fH', f.read(50))
        v1 = (vals[3], vals[4], vals[5] * scale_z)
        v2 = (vals[6], vals[7], vals[8] * scale_z)
        v3 = (vals[9], vals[10], vals[11] * scale_z)
        n = norm(cross(sub(v2, v1), sub(v3, v1)))
        triangles.append((n, v1, v2, v3, vals[12]))

with output_path.open('wb') as f:
    out_header = b'Edited by Codex: Z thickness scaled to make selected edge 100mm'
    out_header = out_header[:80].ljust(80, b' ')
    f.write(out_header)
    f.write(struct.pack('<I', len(triangles)))
    for n, v1, v2, v3, attr in triangles:
        f.write(struct.pack('<12fH', *(n + v1 + v2 + v3 + (attr,))))

# verify selected edge 1033/1034
sel = {1033, 1034}
sel_tris = {}
for idx in sel:
    _, v1, v2, v3, _ = triangles[idx]
    sel_tris[idx] = [tuple(round(c, 6) for c in v) for v in (v1, v2, v3)]
common = set(sel_tris[1033]) & set(sel_tris[1034])
common = sorted(common)
edge_length = dist(common[0], common[1]) if len(common) == 2 else None

result = {
    'jobId': 'job_002',
    'operation': 'scale_z_symmetrically',
    'inputModelPath': str(input_path),
    'outputModelPath': str(output_path),
    'triangleCount': len(triangles),
    'selectedSharedEdge': common,
    'selectedSharedEdgeLengthMm': edge_length,
    'scaleFactorZ': scale_z,
}
result_path.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
