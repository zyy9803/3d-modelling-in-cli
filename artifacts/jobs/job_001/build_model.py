import math
from pathlib import Path

out_path = Path(r'C:\Users\Admin\Projects\3DModel\artifacts\models\model_002_from_model_001.stl')
out_path.parent.mkdir(parents=True, exist_ok=True)

# Inferred from selection context:
# selected top face bbox: x=[-50,50], y=[-100,100], z=25
# target top face: 200 x 200 mm, centered at origin, same top Z and same thickness inferred as 25 mm.
# So final solid is a centered rectangular prism with bounds:
# x=[-100,100], y=[-100,100], z=[0,25]
verts = [
    (-100.0, -100.0,   0.0),  # 0
    ( 100.0, -100.0,   0.0),  # 1
    ( 100.0,  100.0,   0.0),  # 2
    (-100.0,  100.0,   0.0),  # 3
    (-100.0, -100.0,  25.0),  # 4
    ( 100.0, -100.0,  25.0),  # 5
    ( 100.0,  100.0,  25.0),  # 6
    (-100.0,  100.0,  25.0),  # 7
]

faces = [
    # bottom (-Z)
    (0, 2, 1), (0, 3, 2),
    # top (+Z)
    (4, 5, 6), (4, 6, 7),
    # front (-Y)
    (0, 1, 5), (0, 5, 4),
    # right (+X)
    (1, 2, 6), (1, 6, 5),
    # back (+Y)
    (2, 3, 7), (2, 7, 6),
    # left (-X)
    (3, 0, 4), (3, 4, 7),
]

def normal(a, b, c):
    ux, uy, uz = b[0]-a[0], b[1]-a[1], b[2]-a[2]
    vx, vy, vz = c[0]-a[0], c[1]-a[1], c[2]-a[2]
    nx = uy*vz - uz*vy
    ny = uz*vx - ux*vz
    nz = ux*vy - uy*vx
    l = math.sqrt(nx*nx + ny*ny + nz*nz)
    if l == 0:
        return (0.0, 0.0, 0.0)
    return (nx/l, ny/l, nz/l)

with out_path.open('w', encoding='ascii', newline='\n') as f:
    f.write('solid model_002_from_model_001\n')
    for i, j, k in faces:
        a, b, c = verts[i], verts[j], verts[k]
        n = normal(a, b, c)
        f.write(f'  facet normal {n[0]:.6g} {n[1]:.6g} {n[2]:.6g}\n')
        f.write('    outer loop\n')
        f.write(f'      vertex {a[0]:.6g} {a[1]:.6g} {a[2]:.6g}\n')
        f.write(f'      vertex {b[0]:.6g} {b[1]:.6g} {b[2]:.6g}\n')
        f.write(f'      vertex {c[0]:.6g} {c[1]:.6g} {c[2]:.6g}\n')
        f.write('    endloop\n')
        f.write('  endfacet\n')
    f.write('endsolid model_002_from_model_001\n')

print(out_path)
print(out_path.stat().st_size)
