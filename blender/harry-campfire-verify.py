"""Check evaluated hand contacts; optionally render two neutral close-ups.

Run with Blender -b scene.blend --python-exit-code 1 --python this-file.
This checks selected skin surface intersections, not a watertight collision proof.
"""
import bpy
import os
import sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def surface(ob, side=None):
    evaluated = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        vertices = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
        groups = {group.index for group in ob.vertex_groups if side and any(
            name in group.name for name in [side + '_Finger', side + '_Thumb', side + '_Arm_Wrist'])}
        selected = {vertex.index for vertex in mesh.vertices if not side or any(
            group.group in groups and group.weight > .4 for group in vertex.groups)}
        faces = [list(face.vertices) for face in mesh.polygons if all(index in selected for index in face.vertices)]
        assert faces, 'Contact mesh is empty: ' + ob.name
        return BVHTree.FromPolygons(vertices, faces), [vertices[index] for index in selected]
    finally:
        evaluated.to_mesh_clear()


bpy.context.scene.frame_set(1)
pants, _ = surface(bpy.data.objects['Yellow_Pants'])
rod, _ = surface(bpy.data.objects['Roasting twig - ground seat'])
failures = []
for side, other, label in [('l', pants, 'Left hand / thigh'), ('r', rod, 'Right hand / rod')]:
    hand, vertices = surface(bpy.data.objects['Harry_Body'], side)
    overlaps = len(hand.overlap(other))
    gap = min(other.find_nearest(vertex)[3] for vertex in vertices)
    print(f'{label}: {overlaps} intersecting face pairs; nearest vertex gap {gap:.5f}', flush=True)
    if overlaps or gap > .015:
        failures.append(label)
assert not failures, 'Contact regression: ' + ', '.join(failures)

if '--preview' in sys.argv:
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = 1000; scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_shadows = True; scene.display.shading.show_cavity = True
    scene.camera.data.type = 'ORTHO'; scene.camera.data.ortho_scale = 1.05
    target = Vector((-.25, 0, .68))
    for name, offset in [('front', (1, -2, 1.8)), ('reverse', (1, 1, .7))]:
        scene.camera.location = target + Vector(offset)
        scene.camera.rotation_euler = (target - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(os.path.dirname(__file__), f'harry-hands-{name}.png')
        bpy.ops.render.render(write_still=True)
