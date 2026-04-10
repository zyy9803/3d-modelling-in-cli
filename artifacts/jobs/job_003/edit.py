
import json, math, struct
from pathlib import Path

EPS = 1e-6

def dot(a, b):
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]

def sub(a, b):
    return (a[0]-b[0], a[1]-b[1], a[2]-b[2])

def add(a, b):
    return (a[0]+b[0], a[1]+b[1], a[2]+b[2])

def mul(a, s):
    return (a[0]*s, a[1]*s, a[2]*s)

def cross(a, b):
    return (
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0],
    )

def norm(v):
    l = math.sqrt(max(dot(v, v), 0.0))
    if l < EPS:
        return (0.0, 0.0, 0.0)
    return (v[0]/l, v[1]/l, v[2]/l)

def dist(a, b):
    return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2)

def triangle_normal(tri):
    return norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])))

def line_plane_intersection(a, b, n, d):
    ab = sub(b, a)
    denom = dot(n, ab)
    if abs(denom) < EPS:
        return a
    t = (d - dot(n, a)) / denom
    return add(a, mul(ab, t))

def clip_polygon(poly, n, d):
    out = []
    intersections = []
    if not poly:
        return out, intersections
    m = len(poly)
    for i in range(m):
        cur = poly[i]
        nxt = poly[(i + 1) % m]
        cur_in = dot(n, cur) <= d + EPS
        nxt_in = dot(n, nxt) <= d + EPS
        if cur_in and nxt_in:
            out.append(nxt)
        elif cur_in and not nxt_in:
            p = line_plane_intersection(cur, nxt, n, d)
            out.append(p)
            intersections.append(p)
        elif (not cur_in) and nxt_in:
            p = line_plane_intersection(cur, nxt, n, d)
            out.append(p)
            out.append(nxt)
            intersections.append(p)
    # remove consecutive duplicates
    cleaned = []
    for p in out:
        if not cleaned or dist(cleaned[-1], p) > 1e-5:
            cleaned.append(p)
    if len(cleaned) > 1 and dist(cleaned[0], cleaned[-1]) <= 1e-5:
        cleaned.pop()
    return cleaned, intersections

def dedupe_points(points, tol=1e-5):
    unique = []
    for p in points:
        matched = False
        for q in unique:
            if dist(p, q) <= tol:
                matched = True
                break
        if not matched:
            unique.append(p)
    return unique

def triangulate(poly):
    if len(poly) < 3:
        return []
    tris = []
    for i in range(1, len(poly) - 1):
        tris.append((poly[0], poly[i], poly[i+1]))
    return tris

def build_cap(points, n):
    pts = dedupe_points(points)
    if len(pts) < 3:
        return []
    c = (sum(p[0] for p in pts)/len(pts), sum(p[1] for p in pts)/len(pts), sum(p[2] for p in pts)/len(pts))
    ref = (1.0, 0.0, 0.0) if abs(n[0]) < 0.9 else (0.0, 1.0, 0.0)
    u = norm(cross(ref, n))
    v = norm(cross(n, u))
    pts_sorted = sorted(pts, key=lambda p: math.atan2(dot(sub(p, c), v), dot(sub(p, c), u)))
    tris = triangulate(pts_sorted)
    if tris:
        tn = triangle_normal(tris[0])
        if dot(tn, n) < 0:
            pts_sorted = list(reversed(pts_sorted))
            tris = triangulate(pts_sorted)
    return tris

def clip_mesh(triangles, n, d):
    new_tris = []
    cap_points = []
    for tri in triangles:
        poly, intersections = clip_polygon(list(tri), n, d)
        if len(intersections) == 2:
            cap_points.extend(intersections)
        if len(poly) >= 3:
            new_tris.extend(triangulate(poly))
    new_tris.extend(build_cap(cap_points, n))
    return new_tris

def read_stl(path):
    tris = []
    with open(path, 'rb') as f:
        header = f.read(80)
        count = struct.unpack('<I', f.read(4))[0]
        for _ in range(count):
            vals = struct.unpack('<12fH', f.read(50))
            tri = [tuple(vals[3:6]), tuple(vals[6:9]), tuple(vals[9:12])]
            tris.append(tuple(tri))
    return tris

def write_stl(path, triangles):
    with open(path, 'wb') as f:
        header = b'Edited by Codex: 10mm chamfer on four edges of selected top face'
        f.write(header[:80].ljust(80, b' '))
        f.write(struct.pack('<I', len(triangles)))
        for tri in triangles:
            n = triangle_normal(tri)
            vals = n + tri[0] + tri[1] + tri[2] + (0,)
            f.write(struct.pack('<12fH', *vals))

def bbox(triangles):
    xs=[]; ys=[]; zs=[]
    for tri in triangles:
        for p in tri:
            xs.append(p[0]); ys.append(p[1]); zs.append(p[2])
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

def unique_vertices(triangles, tol=1e-5):
    pts=[]
    for tri in triangles:
        pts.extend(tri)
    return dedupe_points(pts, tol)

input_path = Path(r'C:\Users\Admin\Projects\3DModel\artifacts\models\model_003_from_model_001.stl')
output_path = Path(r'C:\Users\Admin\Projects\3DModel\artifacts\models\model_004_from_model_003.stl')
result_path = Path(r'C:\Users\Admin\Projects\3DModel\artifacts\jobs\job_003\result.json')

triangles = read_stl(input_path)
planes = [
    (norm(( 1.0, 1.0, 0.0)), 140.0 / math.sqrt(2.0), 'right'),
    (norm((-1.0, 1.0, 0.0)), 140.0 / math.sqrt(2.0), 'left'),
    (norm(( 0.0, 1.0, 1.0)), 140.0 / math.sqrt(2.0), 'front'),
    (norm(( 0.0, 1.0,-1.0)), 140.0 / math.sqrt(2.0), 'back'),
]

for n, d, _ in planes:
    triangles = clip_mesh(triangles, n, d)

write_stl(output_path, triangles)

bmin, bmax = bbox(triangles)
verts = unique_vertices(triangles)
top_y = max(p[1] for p in verts)
top_face_pts = sorted([tuple(round(c, 6) for c in p) for p in verts if abs(p[1] - top_y) <= 1e-5])
front_top = sorted([tuple(round(c, 6) for c in p) for p in verts if abs(p[2] - 50.0) <= 1e-5 and p[1] >= 89.999 - 1e-5], key=lambda p: (p[1], p[0]))
right_top = sorted([tuple(round(c, 6) for c in p) for p in verts if abs(p[0] - 50.0) <= 1e-5 and p[1] >= 89.999 - 1e-5], key=lambda p: (p[1], p[2]))

result = {
    'jobId': 'job_003',
    'operation': 'clip_with_four_10mm_chamfer_planes',
    'inputModelPath': str(input_path),
    'outputModelPath': str(output_path),
    'triangleCount': len(triangles),
    'bboxMin': [round(v, 6) for v in bmin],
    'bboxMax': [round(v, 6) for v in bmax],
    'topFaceVerticesAtYMax': top_face_pts,
    'frontChamferKeyVertices': front_top,
    'rightChamferKeyVertices': right_top,
    'chamferDistanceMm': 10.0,
}
result_path.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
