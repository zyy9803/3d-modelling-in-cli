import math
from pathlib import Path

out_path = Path(r'C:\Users\Admin\Projects\3DModel\artifacts\models\model_005_from_model_003.stl')
out_path.parent.mkdir(parents=True, exist_ok=True)

# Inferred from selection context:
# current selected top face center = (0,0,25), normal +Z, current size = 100 x 200
# confirmed target size = X 300, Y 100, keeping center and thickness 25.
verts = [
    (-150.0,  -50.0,   0.0),
    ( 150.0,  -50.0,   0.0),
    ( 150.0,   50.0,   0.0),
    (-150.0,   50.0,   0.0),
    (-150.0,  -50.0,  25.0),
    ( 150.0,  -50.0,  25.0),
    ( 150.0,   50.0,  25.0),
    (-150.0,   50.0,  25.0),
]
faces = [
    (0,2,1),(0,3,2),
    (4,5,6),(4,6,7),
    (0,1,5),(0,5,4),
    (1,2,6),(1,6,5),
    (2,3,7),(2,7,6),
    (3,0,4),(3,4,7),
]

def normal(a,b,c):
    ux,uy,uz = b[0]-a[0], b[1]-a[1], b[2]-a[2]
    vx,vy,vz = c[0]-a[0], c[1]-a[1], c[2]-a[2]
    nx = uy*vz - uz*vy
    ny = uz*vx - ux*vz
    nz = ux*vy - uy*vx
    l = math.sqrt(nx*nx + ny*ny + nz*nz)
    return (0.0,0.0,0.0) if l == 0 else (nx/l, ny/l, nz/l)

with out_path.open('w', encoding='ascii', newline='\n') as f:
    f.write('solid model_005_from_model_003\n')
    for i,j,k in faces:
        a,b,c = verts[i], verts[j], verts[k]
        n = normal(a,b,c)
        f.write(f'  facet normal {n[0]:.6g} {n[1]:.6g} {n[2]:.6g}\n')
        f.write('    outer loop\n')
        f.write(f'      vertex {a[0]:.6g} {a[1]:.6g} {a[2]:.6g}\n')
        f.write(f'      vertex {b[0]:.6g} {b[1]:.6g} {b[2]:.6g}\n')
        f.write(f'      vertex {c[0]:.6g} {c[1]:.6g} {c[2]:.6g}\n')
        f.write('    endloop\n')
        f.write('  endfacet\n')
    f.write('endsolid model_005_from_model_003\n')

print(out_path)
print(out_path.stat().st_size)
