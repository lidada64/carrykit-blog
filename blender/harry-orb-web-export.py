"""Replace only orb geometry in the existing web export, without saving the blend.

Run after the base exporter/packer, loading harry-campfire-orb-finished.blend.
One bevel segment and baked vertex roughness avoid procedural shader evaluation.
"""
import array
import gzip
import json
import math
from pathlib import Path
import bpy
from mathutils import noise

directory = Path(__file__).resolve().parents[1] / 'public/harry-campfire/orbit'
manifest_path = directory / 'scene.json'
scene = json.loads(manifest_path.read_text(encoding='utf-8'))
source = (directory / scene['geometry']).read_bytes()
if scene['geometry'].endswith('.gz'):
    source = gzip.decompress(source)
orb = bpy.data.objects['CK_orb_body']
# Only the near upper cap needs physical edge detail; retain the rest as
# the original single-surface mirror. The 2mm edge is subpixel at that range.
cap_faces = [p for p in orb.data.polygons if p.center.z > .65]
cap_mesh = bpy.data.meshes.new('Web near-cap detail')
cap_mesh.from_pydata([tuple(v.co) for v in orb.data.vertices], [], [list(p.vertices) for p in cap_faces])
cap = bpy.data.objects.new('Web near-cap detail', cap_mesh)
bpy.context.scene.collection.objects.link(cap)
cap.matrix_world = orb.matrix_world.copy()
shell = cap.modifiers.new('Web thin mirror', 'SOLIDIFY')
shell.thickness = .00036
shell.offset = -1
bevel = cap.modifiers.new('Web single bevel', 'BEVEL')
bevel.width = .00014
bevel.segments = 1
bevel.limit_method = 'ANGLE'
bevel.angle_limit = .35
bpy.context.view_layer.update()
evaluated = cap.evaluated_get(bpy.context.evaluated_depsgraph_get())
mesh = evaluated.to_mesh()
mesh.calc_loop_triangles()
orb.data.calc_loop_triangles()
world = orb.matrix_world
normal_matrix = world.to_3x3().inverted_safe().transposed()
vertices = array.array('f')
indices = array.array('I')
lookup = {}
def append_triangles(data, triangles):
    for triangle in triangles:
        for loop_index in triangle.loops:
            loop = data.loops[loop_index]
            local = data.vertices[loop.vertex_index].co
            position = world @ local
            normal = (normal_matrix @ data.corner_normals[loop_index].vector).normalized()
            # A low-frequency sample interpolates across a tile; no runtime noise cost.
            roughness = .10 + .07 * max(0, min(1, .5 + .5 * noise.noise(local * 90)))
            vertex = (*position, *normal, 0., 0., 1., 1., 1., roughness, *([0.] * 9))
            assert len(vertex) == 21 and all(math.isfinite(v) for v in vertex)
            if vertex not in lookup:
                lookup[vertex] = len(vertices) // 21
                vertices.extend(vertex)
            indices.append(lookup[vertex])
append_triangles(mesh, mesh.loop_triangles)
append_triangles(orb.data, [t for t in orb.data.loop_triangles if orb.data.polygons[t.polygon_index].center.z <= .65])
evaluated.to_mesh_clear()
result = bytearray()
for record in scene['meshes']:
    if scene['materials'][record['material']]['kind'] == 4:
        vertex_data, index_data = vertices.tobytes(), indices.tobytes()
        record['vertexCount'], record['count'] = len(vertices) // 21, len(indices)
    else:
        vertex_data = source[record['offset']:record['offset'] + record['vertexCount'] * 84]
        index_data = source[record['indexOffset']:record['indexOffset'] + record['count'] * 4]
    record['offset'] = len(result)
    result.extend(vertex_data)
    record['indexOffset'] = len(result)
    result.extend(index_data)
tile = next(m for m in scene['materials'] if m['kind'] == 4)
tile['roughness'] = .135
tile['bakedRoughness'] = True
grout = next(m for m in scene['materials'] if m['kind'] == 5)
grout['roughness'] = .72
grout['metallic'] = .18
grout['color'] = [.009, .011, .014, 1.]
scene['orb']['finish'] = 'bevel-1-baked-roughness'
scene['orb']['detailCapLocalZ'] = .65
scene['scene'] = 'blender/harry-campfire-orb-finished.blend'
scene['geometry'] = 'geometry.bin.gz'
(directory / 'geometry.bin').write_bytes(result)
(directory / 'geometry.bin.gz').write_bytes(gzip.compress(result, compresslevel=9, mtime=0))
manifest_path.write_text(json.dumps(scene, separators=(',', ':')), encoding='utf-8')
print(f'Orb: {len(vertices)//21} vertices, {len(indices)//3} triangles; geometry gzip {len(gzip.compress(result))} bytes')
