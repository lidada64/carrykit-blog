"""Pack extracted OBJ props into a derived scene; never modify the base export.

Run from the repository root: python scripts/hero-props-pack.py
Source provenance and model limitations: blender/disco-elysium-matches/README.md.
"""
import array
import argparse
import gzip
import json
import math
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'blender/disco-elysium-matches'
OUT = ROOT / 'public/harry-campfire/orbit'
scene = json.loads((OUT / 'scene.json').read_text(encoding='utf-8'))
geometry = bytearray(gzip.decompress((OUT / 'geometry.bin.gz').read_bytes()))
scene['props'] = []

# Layout is in source scene space (Z up); these are intentionally different silhouettes.
PLACEMENTS = [
    ('blog', 'ledger-of-oblivion', 'ledger_tex.png', .82, -1.9, -.2, -.7, False, .3),
    ('work', 'kim-notebook-closed', 'kims-notebook-TEX.png', .7, 1.7, -1.3, .2, True, .35),
    ('radar', 'perfectly-adequate-transceiver', 'transceiver_adequate_TEX.png', .9, -.55, -2.3, -.3, False, 0.),
]

# Optional composition studies; running without arguments restores the base layout.
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--layout', choices=['current', 'a', 'b', 'c'], default='current')
layout = parser.parse_args().layout
studies = {
    'a': [(-1.8, -.6, -.5), (-.25, -1.6, .5), (1.15, -2.0, -.7)],
    'b': [(-1.5, -1.3, -.2), (.9, -1.75, .7), (-2.0, .25, -.9)],
    'c': [(-1.9, -.2, -.7), (1.7, -1.3, .2), (-.55, -2.3, -.3)],
}
if layout in studies:
    PLACEMENTS = [(*p[:4], *placement, *p[7:])
                  for p, placement in zip(PLACEMENTS, studies[layout])]

for key, folder, texture, size, x, y, yaw, y_up, tilt in PLACEMENTS:
    positions, normals, uvs, faces = [], [], [], []
    for line in (SOURCE / folder / f'{folder}.obj').read_text().splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == 'v':
            positions.append(tuple(map(float, parts[1:4])))
        elif parts[0] == 'vn':
            normals.append(tuple(map(float, parts[1:4])))
        elif parts[0] == 'vt':
            uvs.append(tuple(map(float, parts[1:3])))
        elif parts[0] == 'f':
            polygon = [tuple(int(v) - 1 for v in p.split('/')) for p in parts[1:]]
            faces.extend((polygon[0], polygon[i], polygon[i+1]) for i in range(1, len(polygon)-1))
    low = [min(v[i] for v in positions) for i in range(3)]
    high = [max(v[i] for v in positions) for i in range(3)]
    scale = size / max(high[i]-low[i] for i in range(3))
    center = [(a+b)/2 for a, b in zip(low, high)]

    def rotate(v):
        a, b, c = v
        if y_up:
            a, b, c = a, -c, b
        if key == 'work':
            a, b, c = a, -b, -c
        a, b = a*math.cos(yaw)-b*math.sin(yaw), a*math.sin(yaw)+b*math.cos(yaw)
        if key == 'radar':
            # The broad cabinet base lies in source XY. Align it with the
            # local sphere tangent rather than balancing it on a display edge.
            radius = scene['orb']['radius']
            ox, oy, _ = scene['orb']['center']
            nx, ny = (x-ox)/radius, (y-oy)/radius
            nz = math.sqrt(1-nx*nx-ny*ny)
            # Rodrigues rotation taking world up to the local surface normal.
            dot_xy = nx*a+ny*b
            return (a+nx*c-nx*dot_xy/(1+nz),
                    b+ny*c-ny*dot_xy/(1+nz), nz*c-dot_xy)
        # Tilt the display face toward the default camera around its horizontal
        # axis. Ground clearance below is recomputed, so the lowest edge rests.
        ux, uy = math.cos(-.5934), math.sin(-.5934)
        projection = ux*a+uy*b
        ct, st = math.cos(tilt), math.sin(tilt)
        return (a*ct+uy*c*st+ux*projection*(1-ct),
                b*ct-ux*c*st+uy*projection*(1-ct),
                c*ct+(ux*b-uy*a)*st)

    transformed = [rotate([(v[i]-center[i])*scale for i in range(3)]) for v in positions]
    radius = scene['orb']['radius']
    orb = scene['orb']['center']

    def surface(px, py):
        return orb[2] + math.sqrt(radius**2-(px-orb[0])**2-(py-orb[1])**2)

    # Raise until all vertices clear the curved ground, with a tiny contact allowance.
    z = max(surface(x+v[0], y+v[1])-v[2] for v in transformed) + .008
    world = [(v[0]+x, v[1]+y, v[2]+z) for v in transformed]
    vertices, indices, lookup = array.array('f'), array.array('I'), {}
    for face in faces:
        for ref in face:
            if ref not in lookup:
                vi, ti, ni = ref
                vertex = (*world[vi], *rotate(normals[ni]), *uvs[ti], 1, 1, 1, 1, *([0]*9))
                assert len(vertex) == 21 and all(math.isfinite(v) for v in vertex)
                lookup[ref] = len(vertices)//21
                vertices.extend(vertex)
            indices.append(lookup[ref])
    name = f'hero-prop-{key}'
    material = len(scene['materials'])
    target_texture = f'{name}.png'
    shutil.copyfile(SOURCE / folder / texture, OUT / target_texture)
    scene['materials'].append(dict(name=name, kind=0, color=[1,1,1,1],
                                  texture=target_texture, mask=None, emission=None, roughness=.8))
    offset = len(geometry)
    geometry.extend(vertices.tobytes())
    index_offset = len(geometry)
    geometry.extend(indices.tobytes())
    scene['meshes'].append(dict(name=name, material=material, offset=offset,
                               vertexCount=len(vertices)//21, indexOffset=index_offset, count=len(indices)))
    bounds = [[min(v[i] for v in world) for i in range(3)],
              [max(v[i] for v in world) for i in range(3)]]
    scene['props'].append(dict(id=key, bounds=bounds))
    print(key, 'vertices', len(vertices)//21, 'triangles', len(indices)//3, 'bounds', bounds)

scene['geometry'] = 'geometry-with-props.bin.gz'
(OUT / 'geometry-with-props.bin').write_bytes(geometry)
(OUT / 'geometry-with-props.bin.gz').write_bytes(gzip.compress(geometry, compresslevel=9, mtime=0))
(OUT / 'scene-with-props.json').write_text(json.dumps(scene, separators=(',', ':')), encoding='utf-8')



