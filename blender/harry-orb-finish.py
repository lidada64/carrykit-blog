"""Refine the existing orb non-destructively and save a separate scene."""
import os
import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scene = bpy.context.scene
orb = bpy.data.objects['CK_orb_body']
for modifier in list(orb.modifiers):
    if modifier.name.startswith('Finish '):
        orb.modifiers.remove(modifier)
# Dimensions below are local: the source orb has a 14x object scale.
shell = orb.modifiers.new('Finish mirror backing 5mm', 'SOLIDIFY')
shell.thickness = .00036
shell.offset = -1
edge = orb.modifiers.new('Finish polished edge 2mm', 'BEVEL')
edge.width = .00014
edge.segments = 3
edge.affect = 'EDGES'
edge.limit_method = 'ANGLE'
edge.angle_limit = .35
material = bpy.data.materials['CK_tile']
nodes = material.node_tree.nodes
links = material.node_tree.links
for node in list(nodes):
    if node.name.startswith('Finish '):
        nodes.remove(node)
bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Roughness'].default_value = .13
tex = nodes.new('ShaderNodeTexCoord'); tex.name = 'Finish coordinates'
noise = nodes.new('ShaderNodeTexNoise'); noise.name = 'Finish subtle polish variation'
noise.inputs['Scale'].default_value = 90
noise.inputs['Detail'].default_value = 2
links.new(tex.outputs['Object'], noise.inputs['Vector'])
rough = nodes.new('ShaderNodeMapRange'); rough.name = 'Finish satin mirror roughness'
rough.inputs['To Min'].default_value = .10
rough.inputs['To Max'].default_value = .17
links.new(noise.outputs['Fac'], rough.inputs['Value'])
links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
# Dark backing must respond to light instead of remaining an unlit black emission.
grout = bpy.data.materials['CK_grout']
gn = grout.node_tree.nodes; gl = grout.node_tree.links
out = next(n for n in gn if n.type == 'OUTPUT_MATERIAL')
back = gn.get('Finish charcoal backing') or gn.new('ShaderNodeBsdfPrincipled')
back.name = 'Finish charcoal backing'
back.inputs['Base Color'].default_value = (.009, .011, .014, 1)
back.inputs['Roughness'].default_value = .72
back.inputs['Metallic'].default_value = .18
gl.new(back.outputs['BSDF'], out.inputs['Surface'])
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x = 1200
scene.render.resolution_y = 1090
scene.render.resolution_percentage = 100
scene['orb_finish'] = '5mm backing, 2mm rounded edges, roughness 0.10–0.17; source layout unchanged'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.overlay.show_overlays = False
scene.render.filepath = os.path.join(ROOT, 'blender', 'harry-orb-finished-render.png')
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'harry-campfire-orb-finished.blend'))
bpy.ops.render.render(write_still=True)
