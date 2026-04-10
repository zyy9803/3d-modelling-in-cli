
import json, math, struct
from pathlib import Path

EPS = 1e-6

def dot(a,b): return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
def sub(a,b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def add(a,b): return (a[0]+b[0], a[1]+b[1], a[2]+b[2])
def mul(a,s): return (a[0]*s, a[1]*s, a[2]*s)
def cross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def norm(v):
    l = math.sqrt(max(dot(v,v), 0.0))
    return (0.0,0.0,0.0) if l < EPS else (v[0]/l, v[1]/l, v[2]/l)
def dist(a,b): return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2)
def tri_normal(tri): return norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])))

def line_plane_intersection(a, b, n, d):
    ab = sub(b, a)
    denom = dot(n, ab)
    if abs(denom) < EPS:
        return a
    t = (d - dot(n, a)) / denom
    return add(a, mul(ab, t))

def clip_polygon(poly, n, d):
    out, intersections = [], []
    m = len(poly)
    for i in range(m):
        cur = poly[i]
        nxt = poly[(i+1)%m]
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
        if not any(dist(p, q) <= tol for q in unique):
            unique.append(p)
    return unique

def triangulate(poly):
    if len(poly) < 3: return []
    return [(poly[0], poly[i], poly[i+1]) for i in range(1, len(poly)-1)]

def build_cap(points, n):
    pts = dedupe_points(points)
    if len(pts) < 3: return []
    c = (sum(p[0] for p in pts)/len(pts), sum(p[1] for p in pts)/len(pts), sum(p[2] for p in pts)/len(pts))
    ref = (1.0, 0.0, 0.0) if abs(n[0]) < 0.9 else (0.0, 1.0, 0.0)
    u = norm(cross(ref, n))
    v = norm(cross(n, u))
    pts = sorted(pts, key=lambda p: math.atan2(dot(sub(p, c), v), dot(sub(p, c), u)))
    tris = triangulate(pts)
    if tris and dot(tri_normal(tris[0]), n) < 0:
        pts = list(reversed(pts))
        tris = triangulate(pts)
    return tris

def clip_mesh(triangles, n, d):
    new_tris = []
    cap_points = []
    for tri in triangles:
        poly, ints = clip_polygon(list(tri), n, d)
        if len(ints) == 2:
            cap_points.extend(ints)
        if len(poly) >= 3:
            new_tris.extend(triangulate(poly))
    new_tris.extend(build_cap(cap_points, n))
    return new_tris

def read_stl(path):
    tris = []
    with open(path, 'rb') as f:
        f.read(80)
        count = struct.unpack('<I', f.read(4))[0]
        for _ in range(count):
            vals = struct.unpack('<12fH', f.read(50))
            tris.append((tuple(vals[3:6]), tuple(vals[6:9]), tuple(vals[9:12])))
    return tris

def clean_triangles(triangles, snap=1e-4):
    def snap_point(p):
        return tuple(round(c / snap) * snap for c in p)
    cleaned = []
    seen = set()
    for tri in triangles:
        tri = tuple(snap_point(p) for p in tri)
        if dist(tri[0], tri[1]) <= snap or dist(tri[1], tri[2]) <= snap or dist(tri[2], tri[0]) <= snap:
            continue
        key = tuple(sorted(tri))
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(tri)
    return cleaned

def write_stl(path, triangles):
    with open(path, 'wb') as f:
        header = b'Edited by Codex: 10mm chamfer on selected edge x50-z50'
        f.write(header[:80].ljust(80, b' '))
        f.write(struct.pack('<I', len(triangles)))
        for tri in triangles:
            n = tri_normal(tri)
            f.write(struct.pack('<12fH', *(n + tri[0] + tri[1] + tri[2] + (0,))))

def bbox(triangles):
    pts = [p for tri in triangles for p in tri]
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; zs = [p[2] for p in pts]
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

def unique_vertices(triangles):
    return dedupe_points([p for tri in triangles for p in tri])

input_path = Path(r'C:\Users\Admin\Projects\3DModel\artifacts\models\model_004_from_model_003.stl')
output_path = Path(r'C:\Users\Admin\Projects\3DModel\artifacts\models\model_005_from_model_004.stl')
result_path = Path(r'C:\Users\Admin\Projects\3DModel\artifacts\jobs\job_004\result.json')

triangles = read_stl(input_path)
plane_n = norm((1.0, 0.0, 1.0))
plane_d = 90.0 / math.sqrt(2.0)
triangles = clip_mesh(triangles, plane_n, plane_d)
triangles = clean_triangles(triangles, snap=1e-4)
write_stl(output_path, triangles)

verts = unique_vertices(triangles)
cap_pts = sorted([tuple(round(c,6) for c in p) for p in verts if abs(p[0] + p[2] - 90.0) < 1e-4], key=lambda p:(p[1], p[0], p[2]))
bmin, bmax = bbox(triangles)
result = {
    'jobId': 'job_004',
    'operation': 'single_edge_chamfer_10mm',
    'inputModelPath': str(input_path),
    'outputModelPath': str(output_path),
    'triangleCount': len(triangles),
    'bboxMin': [round(v,6) for v in bmin],
    'bboxMax': [round(v,6) for v in bmax],
    'chamferPlane': {'normal': [round(v,6) for v in plane_n], 'equation': 'x + z = 90'},
    'capVertexSample': cap_pts[:20],
    'capVertexCount': len(cap_pts),
}
result_path.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
