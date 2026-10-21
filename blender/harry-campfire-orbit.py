"""Build an editable ground-seated scene and export evaluated meshes for WebGL.

Inputs are never overwritten. Run Blender -b --python this-file -- source.blend.
The viewport ports flowing mask materials; Blender remains the full volume reference.
"""
import bpy, os, sys, math, json, array
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'harry-campfire', 'orbit')
os.makedirs(OUT, exist_ok=True)
source = sys.argv[sys.argv.index('--') + 1]
orb_source = sys.argv[sys.argv.index('--orb') + 1] if '--orb' in sys.argv else 'C:/Users/12281/Documents/carrykit-blender/orb-master.blend'
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'blender', 'harry-campfire.blend'), load_ui=False, use_scripts=False)
scene = bpy.context.scene
for ob in list(bpy.data.objects):
    if ob.name.startswith(('Fallen log seat', 'Pale sawn log end', 'Annual growth rings', 'Bark ridge', 'Roasting twig', 'Twig fork', 'One toasted marshmallow')) or ob in list(bpy.data.collections['Campfire'].objects) or ob in list(bpy.data.collections['Clearing'].objects):
        bpy.data.objects.remove(ob, do_unlink=True)
rig = bpy.data.objects['Harry_Rig']
rig.scale *= 1.08
rig.location.x += .22
def bone(name): return rig.pose.bones['char_body_' + name + 'SHJnt']
def aim(name, direction):
    pb = bone(name); m = pb.matrix.copy()
    q = (m.to_3x3() @ Vector((0, 1, 0))).rotation_difference(Vector(direction).normalized())
    pb.matrix = Matrix.Translation(m.translation) @ q.to_matrix().to_4x4() @ m.to_3x3().to_4x4()
    bpy.context.view_layer.update()
# A low, bent-knee ground seat: thighs slope up, shins forward to planted feet.
for side, sign in [('l', -1), ('r', 1)]:
    aim(side + '_Leg_Hip', (sign * .28, 1, .34))
    aim(side + '_Leg_Knee', (sign * .06, 1, -.55))
    aim(side + '_Leg_Ankle', (sign * .06, 1, -.1))
    aim(side + '_Leg_Ball', (sign * .04, 1, 0))
# Lower until trouser seat reaches the ground, then ensure shoes do not clip it.
def low_z(ob):
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()); mesh = ev.to_mesh()
    z = min((ev.matrix_world @ v.co).z for v in mesh.vertices)
    ev.to_mesh_clear(); return z
rig.location.z -= low_z(bpy.data.objects['Yellow_Pants']) - .045
bpy.context.view_layer.update()
shoe_z = low_z(bpy.data.objects['Green_Shoes'])
if shoe_z < .015: rig.location.z += .015 - shoe_z
bpy.context.view_layer.update()
# Reuse the original measured mirror tiles and grout; leave the decorative rings out.
with bpy.data.libraries.load(orb_source, link=False) as (orb_src, orb_dst):
    orb_dst.objects = ['CK_core', 'CK_orb_body']
    orb_dst.worlds = ['CK_world']
orb_collection = bpy.data.collections.new('Disco orb platform'); scene.collection.children.link(orb_collection)
stage = bpy.data.objects.new('Harry campfire and orb - whole scene', None); scene.collection.objects.link(stage)
ORB_SCALE = 14.0
ORB_RADIUS = ORB_SCALE * 1.0025
orb_center = Vector((0, 0, -ORB_RADIUS))
def surface(x, y): return orb_center.z + math.sqrt(max(0, ORB_RADIUS**2 - x*x - y*y))
def surface_normal(x, y): return Vector((x, y, surface(x, y) - orb_center.z)).normalized()
for ob in orb_dst.objects:
    ob.animation_data_clear(); orb_collection.objects.link(ob)
    ob.location = orb_center; ob.scale = (ORB_SCALE,) * 3; ob.parent = stage
scene.world = orb_dst.worlds[0]
for n in scene.world.node_tree.nodes:
    if n.type == 'BACKGROUND':
        n['source_strength'] = n.inputs['Strength'].default_value
        n.inputs['Strength'].default_value = .008
# Preserve source parameters for the future lit state; the intro has no grout glow.
for n in bpy.data.materials['CK_grout'].node_tree.nodes:
    if n.type == 'EMISSION':
        n['source_strength'] = n.inputs['Strength'].default_value
        n.inputs['Strength'].default_value = 0
for ob in bpy.data.collections['Lights'].objects:
    if ob.type == 'LIGHT': ob.hide_render = True
environment = next(n.image for n in scene.world.node_tree.nodes if n.type == 'TEX_ENVIRONMENT')
rig.rotation_euler = (Vector((0, 0, 1)).rotation_difference(surface_normal(rig.location.x, rig.location.y)) @ rig.rotation_euler.to_quaternion()).to_euler()
rig.parent = stage
bpy.context.view_layer.update()
def min_clearance(ob):
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()); mesh = ev.to_mesh()
    points = [ev.matrix_world @ v.co for v in mesh.vertices]
    clearance = min(p.z - surface(p.x, p.y) for p in points)
    ev.to_mesh_clear(); return clearance
rig.location.z -= min(min_clearance(bpy.data.objects[n]) for n in ['Yellow_Pants', 'Green_Shoes']) - .018
bpy.context.view_layer.update()
with bpy.data.libraries.load(source, link=False) as (src, dst):
    dst.objects = [name for name in src.objects if name not in ('Preview_Camera', 'Studio_Key', 'Studio_Fill')]
fire = bpy.data.collections['Campfire']
for ob in dst.objects:
    if ob: fire.objects.link(ob)
root = next(ob for ob in dst.objects if ob.name.startswith('Outer_Wilds_Campfire') and ob.type == 'EMPTY')
root.location = (1.23, -.38, surface(1.23, -.38) + .012); root.scale = (.68,) * 3
root.rotation_euler = Vector((0, 0, 1)).rotation_difference(surface_normal(1.23, -.38)).to_euler()
root.parent = stage
for ob in dst.objects:
    if 'Collider' in ob.name: ob.hide_render = True; ob.hide_viewport = True
scene.frame_start = 1; scene.frame_end = 288; scene.render.fps = 24
scene.frame_set(1)
bpy.context.view_layer.update()
# Pose in world space after the orb tilt, rather than inheriting the former log seat.
def aim_world(name, direction):
    aim(name, rig.matrix_world.to_3x3().inverted() @ Vector(direction))

def place_arm(side, wrist, pole):
    shoulder = rig.matrix_world @ bone(side + '_Arm_Shoulder').head
    upper = (rig.matrix_world @ bone(side + '_Arm_Shoulder').tail - shoulder).length
    lower = (rig.matrix_world @ bone(side + '_Arm_Elbow').tail - rig.matrix_world @ bone(side + '_Arm_Elbow').head).length
    line = wrist - shoulder; distance = min(line.length, upper + lower - .001)
    forward = line.normalized()
    along = (upper*upper - lower*lower + distance*distance) / (2*distance)
    bend = Vector(pole) - shoulder
    bend = (bend - forward * bend.dot(forward)).normalized()
    elbow = shoulder + forward*along + bend*math.sqrt(max(0, upper*upper - along*along))
    aim_world(side + '_Arm_Shoulder', elbow - shoulder)
    aim_world(side + '_Arm_Elbow', wrist - elbow)

def orient_palm(side, forward, outward):
    # Source wrist axes differ from the anatomical axes defined by the knuckles.
    inv = rig.matrix_world.to_3x3().inverted()
    pb = bone(side + '_Arm_Wrist')
    y0 = (bone(side + '_Finger_01_01').head - pb.head).normalized()
    width = bone(side + '_Finger_02_01').head - bone(side + '_Finger_01_01').head
    z0 = y0.cross(width).normalized(); x0 = y0.cross(z0).normalized()
    y = (inv @ Vector(forward)).normalized()
    z = (inv @ Vector(outward)).normalized() * (1 if side == 'l' else -1)
    x = y.cross(z).normalized(); z = x.cross(y).normalized()
    rotation = Matrix((x, y, z)).transposed() @ Matrix((x0, y0, z0)).transposed().inverted()
    pb.matrix = Matrix.Translation(pb.matrix.translation) @ (rotation @ pb.matrix.to_3x3()).to_4x4()
    bpy.context.view_layer.update()

# Reset every weighted joint before constructing the anatomical palm frame.
for side in ['l', 'r']:
    for finger in ['Finger_01', 'Finger_02', 'Thumb_01']:
        for joint in ['01', '02', '03']:
            pb = bone(side + '_' + finger + '_' + joint)
            pb.rotation_mode = 'XYZ'; pb.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
place_arm('r', Vector((-.19, -.40, .77)), (-.65, -.48, .68))
orient_palm('r', (0., .94, -.34), (0., .34, .94))
place_arm('l', Vector((-.53, .30, .680)), (-.92, .49, .70))
orient_palm('l', (1., -.04, -.16), (.16, .85, 1.))
# Never translate knuckles: it stretches the shared skin between finger bundles.
for finger in ['Finger_01', 'Finger_02']:
    aim_world('l_' + finger + '_01', (1., -.02, -.25))
    aim_world('l_' + finger + '_02', (1., -.02, -.36))
    # Tip bones point backwards in the source rig; inherit the middle joint.
    aim_world('r_' + finger + '_01', (0., .85, -.53))
    aim_world('r_' + finger + '_02', (0., -.65, -.76))

for joint, direction in [('01', (.8, -.6, -.16)), ('02', (1., -.25, -.25))]:
    aim_world('l_Thumb_01_' + joint, direction)
for joint, direction in [('01', (.35, .85, -.40)), ('02', (.65, .65, -.40))]:
    aim_world('r_Thumb_01_' + joint, direction)
bpy.context.view_layer.update()
grip = rig.matrix_world @ bone('r_Finger_01_01').head + Vector((.015, .0, -.043))
end = root.location + root.rotation_euler.to_quaternion() @ Vector((-.17, 0, .968))
def twig(name, points, radius):
    data = bpy.data.curves.new(name, 'CURVE'); data.dimensions = '3D'; data.bevel_depth = radius; data.bevel_resolution = 2
    sp = data.splines.new('BEZIER'); sp.bezier_points.add(len(points) - 1)
    for p, co in zip(sp.bezier_points, points): p.co = co; p.handle_left_type = 'AUTO'; p.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, data); bpy.data.collections['Harry'].objects.link(ob); ob.parent = stage
    data.materials.append(bpy.data.materials['Rough log bark'])
rod_axis = (end - grip).normalized()
twig('Roasting twig - ground seat', [grip - rod_axis*.10, grip, grip.lerp(end, .5) + Vector((0, 0, -.03)), end], .0075)
bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=.07, depth=.13, location=end)
marsh = bpy.context.object; marsh.name = 'One toasted marshmallow'
marsh.parent = stage
marsh.rotation_euler = (end - grip).to_track_quat('Z', 'Y').to_euler(); marsh.data.materials.append(bpy.data.materials['Marshmallow'])
bevel = marsh.modifiers.new('Soft corners', 'BEVEL'); bevel.width = .02; bevel.segments = 3
target = Vector((.15, -.1, .65))
fill_data = bpy.data.lights.new('Dark scene - soft sky fill', 'AREA')
fill_data.energy = 18; fill_data.color = (.5, .7, 1); fill_data.shape = 'DISK'; fill_data.size = 5
fill = bpy.data.objects.new('Dark scene - soft sky fill', fill_data); scene.collection.objects.link(fill)
fill.location = (-3, -4, 6); fill.rotation_euler = (target - fill.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.engine = 'CYCLES'; scene.cycles.samples = 96; scene.cycles.use_denoising = True
# Replace inherited portrait lighting with a motivated fire key and dim sky.
bpy.data.objects['Soft moon fill'].hide_render = True
key = bpy.data.objects['Warm fire key']; key.location = (1.05, -.60, 1.05)
key.rotation_euler = (Vector((-.55, 0., 1.2)) - key.location).to_track_quat('-Z', 'Y').to_euler()
key.data.energy = 95; key.data.size = 1.1
rim = bpy.data.objects['Rim on hair and jacket']; rim.data.energy = 12; rim.data.size = 2.5
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'None'; scene.view_settings.exposure = 0
scene.render.film_transparent = False
# Fade the smoke cards out before their top edge, in the source and WebGL alike.
smoke = bpy.data.materials['Animated_Original_Smoke'].node_tree
uv = smoke.nodes.new('ShaderNodeTexCoord')
split = smoke.nodes.new('ShaderNodeSeparateXYZ'); smoke.links.new(uv.outputs['UV'], split.inputs[0])
fade = smoke.nodes.new('ShaderNodeMapRange'); fade.interpolation_type = 'SMOOTHSTEP'
fade.inputs['From Min'].default_value = .65; fade.inputs['From Max'].default_value = 1.
fade.inputs['To Min'].default_value = 1.; fade.inputs['To Max'].default_value = 0.
smoke.links.new(split.outputs['Y'], fade.inputs['Value'])
multiply = smoke.nodes.new('ShaderNodeMath'); multiply.operation = 'MULTIPLY'
factor = smoke.nodes['Mix Shader'].inputs[0]; existing = factor.links[0].from_socket
smoke.links.new(existing, multiply.inputs[0]); smoke.links.new(fade.outputs['Result'], multiply.inputs[1])
smoke.links.new(multiply.outputs[0], factor)
layer = bpy.context.view_layer
layer.use_pass_cryptomatte_object = True; layer.use_pass_cryptomatte_material = True
layer.use_pass_mist = True
scene.world.mist_settings.start = 3; scene.world.mist_settings.depth = 14
for group in ['Fire', 'Sky', 'Rim']:
    if group not in layer.lightgroups: layer.lightgroups.add(name=group)
for ob in scene.objects:
    if ob.type == 'LIGHT':
        ob.lightgroup = 'Sky' if 'sky' in ob.name or 'moon' in ob.name else ('Rim' if 'Rim' in ob.name else 'Fire')
# Blender 5.2 compositor: editable, restrained finishing; beauty stays unblurred.
comp = bpy.data.node_groups.new('Campfire finishing - linear before AgX', 'CompositorNodeTree')
comp.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
scene.compositing_node_group = comp
layers = comp.nodes.new('CompositorNodeRLayers'); layers.location = (-500, 0)
grade = comp.nodes.new('CompositorNodeColorBalance'); grade.location = (-240, 0)
grade.label = 'Gentle midtone shaping - keep skin detail'
next(i for i in grade.inputs if i.identifier == 'Base Gamma').default_value = 1.025
glow = comp.nodes.new('CompositorNodeGlare'); glow.location = (20, 0)
glow.label = 'Fire highlights only - subtle fog glow'
glow.inputs['Type'].default_value = 'Fog Glow'; glow.inputs['Quality'].default_value = 'High'
glow.inputs['Threshold'].default_value = 1.5; glow.inputs['Strength'].default_value = .12
glow.inputs['Size'].default_value = .22
output = comp.nodes.new('NodeGroupOutput'); output.location = (280, 0)
comp.links.new(layers.outputs['Image'], grade.inputs['Image'])
comp.links.new(grade.outputs['Image'], glow.inputs['Image'])
comp.links.new(glow.outputs['Image'], output.inputs['Image'])
scene.camera.data.ortho_scale = 4.15
scene.camera.rotation_euler = (target - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
scene['campfire_source'] = source
scene['orb_source'] = orb_source
scene['composition'] = 'Harry enlarged 8%, moved 0.22 toward the fire, seated on an oversized disco orb'
scene['viewport_note'] = 'Native WebGL: original geometry, sampled shape drivers/transforms/lights; flowing masks and volume adapted to GPU shader.'
# Replace ballistic spark drivers with buoyant rise, fade and staggered respawn.
# Lifetimes divide the 12-second export period so the wrap is seamless.
for ob in dst.objects:
    if not ob.name.startswith('Spark_'): continue
    index = int(ob.name.rsplit('_', 1)[1]) - 1
    ob.animation_data_clear()
    life = 3. if index % 2 else 4.
    phase = (index * .61803398875) % 1
    age = f'(((frame-1)/24/{life}+{phase})%1)'
    angle = index * 2.39996323
    for axis, expression in enumerate([
        f'{math.cos(angle)*.20}+{math.cos(angle)*.18}*{age}+.04*sin({age}*6.283+{angle})',
        f'{math.sin(angle)*.20}+{math.sin(angle)*.18}*{age}+.04*cos({age}*6.283+{angle})',
        f'.38+{2.1+index*.045}*{age}',
    ]):
        ob.driver_add('location', axis).driver.expression = expression
    for axis in range(3):
        ob.driver_add('scale', axis).driver.expression = f'.65*min(1,{age}/.08)*max(0,min(1,(1-{age})/.24))'
scene.frame_set(1); bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'harry-campfire-orb-dark.blend'))

materials = []; material_ids = {}; textures = {}; groups = {}; dynamic = []
def texture(image):
    if not image: return None
    if image.name not in textures:
        filename = 'texture-%02d.png' % len(textures)
        # Save pixel data directly: render saving would tone-map color textures.
        image.filepath_raw = os.path.join(OUT, filename); image.file_format = 'PNG'; image.save()
        textures[image.name] = filename
    return textures[image.name]
def material(mat):
    key = mat.name if mat else '__default'
    if key in material_ids: return material_ids[key]
    record = {'name': key, 'color': list(mat.diffuse_color) if mat else [.5, .5, .5, 1], 'kind': 0, 'texture': None, 'mask': None, 'emission': None}
    if mat and mat.node_tree:
        nodes = mat.node_tree.nodes
        images = [n.image for n in nodes if n.type == 'TEX_IMAGE' and n.image]
        diffuse = next((im for im in images if '_d.' in im.name or 'diffuse' in im.name.lower()), images[0] if images else None)
        principled = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if principled:
            base = principled.inputs['Base Color']
            record['color'] = [1, 1, 1, 1] if base.is_linked else list(base.default_value)
            record['emissionStrength'] = float(principled.inputs['Emission Strength'].default_value)
            record['emissionColor'] = list(principled.inputs['Emission Color'].default_value)[:3]
            record['metallic'] = float(principled.inputs['Metallic'].default_value)
            record['roughness'] = float(principled.inputs['Roughness'].default_value)
        record['texture'] = texture(diffuse)
        record['emission'] = texture(next((im for im in images if '_e.' in im.name), None))
        if 'Animated_Original_Flames' in key:
            record['kind'] = 1; record['color'] = [1, 1, 1, 1]
            record['texture'] = texture(next(im for im in images if 'Flames_d' in im.name))
            record['mask'] = texture(next(im for im in images if 'Mask_d' in im.name))
        elif 'Animated_Original_Smoke' in key:
            record['kind'] = 2; record['color'] = [.18, .17, .16, 1]
            record['texture'] = texture(next(im for im in images if 'Column_d' in im.name))
            record['mask'] = texture(next(im for im in images if 'Mask_d' in im.name))
        elif 'Animated_Fire_Volume' in key:
            record['kind'] = 3
            record['color'] = [1, .28, .018, 1]
        elif key.startswith('CK_tile'):
            record['kind'] = 4
        elif key.startswith('CK_grout'):
            record['kind'] = 5
            glow = next(n for n in nodes if n.type == 'EMISSION' and n.get('source_strength', 0) > 0)
            # Web original mode uses a dark, weakly lit backing; duotone white
            # is handled independently by the renderer.
            record['color'] = [.009, .011, .014, 1]
            record['sourceEmissionStrength'] = float(glow.get('source_strength', .9))
            record['emissionStrength'] = 0
    idx = len(materials); materials.append(record); material_ids[key] = idx
    return idx
def values(ob, mesh, tri, world):
    uv = mesh.uv_layers.active
    colors = mesh.color_attributes.active_color
    normal_matrix = world.to_3x3().inverted_safe().transposed()
    result = []
    keys = ob.data.shape_keys.key_blocks if ob.type == 'MESH' and ob.data.shape_keys else []
    for li in tri.loops:
        loop = mesh.loops[li]; vi = loop.vertex_index
        pos = world @ mesh.vertices[vi].co
        n = (normal_matrix @ mesh.corner_normals[li].vector).normalized()
        tex = uv.data[li].uv if uv else (0, 0)
        color = colors.data[li if colors.domain == 'CORNER' else vi].color if colors else (1, 1, 1, 1)
        result.extend((*pos, *n, *tex, *color))
        for k in range(3):
            delta = world.to_3x3() @ (keys[k+1].data[vi].co - keys[0].data[vi].co) if len(keys) >= 4 else Vector((0, 0, 0))
            result.extend(delta)
    return result
for ob in scene.objects:
    if ob.hide_render or ob.type not in ('MESH', 'CURVE'): continue
    moving = ob in dst.objects and (ob.animation_data or (ob.type == 'MESH' and ob.data.shape_keys))
    if moving:
        # Export undeformed source mesh. Driver values are sampled separately.
        if ob.type == 'MESH' and ob.data.shape_keys:
            mesh = ob.data.copy()
            for v, basis in zip(mesh.vertices, ob.data.shape_keys.key_blocks[0].data): v.co = basis.co
            mesh.update()
        else: mesh = ob.data.copy()
        world = Matrix.Identity(4)
    else:
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()); mesh = ev.to_mesh(); world = ob.matrix_world
    mesh.calc_loop_triangles()
    parts = {}
    for tri in mesh.loop_triangles:
        mat = mesh.materials[tri.material_index] if len(mesh.materials) else None
        mid = material(mat)
        parts.setdefault(mid, array.array('f')).extend(values(ob, mesh, tri, world))
    for mid, verts in parts.items():
        if moving: dynamic.append({'name': ob.name, 'material': mid, 'vertices': verts, 'object': ob, 'matrices': [], 'weights': []})
        else: groups.setdefault(mid, array.array('f')).extend(verts)
    if moving: bpy.data.meshes.remove(mesh)
    else: ev.to_mesh_clear()
lights = [o for o in dst.objects if o.type == 'LIGHT']; energies = []
for frame in range(1, 289):
    scene.frame_set(frame)
    for part in dynamic:
        ob = part['object']
        part['matrices'].append([round(ob.matrix_world[r][c], 6) for c in range(4) for r in range(4)])
        keys = ob.data.shape_keys.key_blocks if ob.data.shape_keys else []
        part['weights'].append([round(k.value, 6) for k in list(keys)[1:4]] if len(keys) >= 4 else [0, 0, 0])
    energies.append(round(sum(o.data.energy for o in lights), 4))
meshes = []
with open(os.path.join(OUT, 'geometry.bin'), 'wb') as binary:
    def write_mesh(record, verts):
        # Index identical loop corners to keep curved grass and flames compact.
        unique = array.array('f'); indices = array.array('I'); lookup = {}
        for start in range(0, len(verts), 21):
            vertex = tuple(verts[start:start+21])
            if vertex not in lookup:
                lookup[vertex] = len(unique)//21; unique.extend(vertex)
            indices.append(lookup[vertex])
        record['offset'] = binary.tell(); record['vertexCount'] = len(unique)//21
        unique.tofile(binary)
        record['indexOffset'] = binary.tell(); record['count'] = len(indices)
        indices.tofile(binary); meshes.append(record)
    for mid, verts in groups.items():
        write_mesh({'name': materials[mid]['name'], 'material': mid}, verts)
    for part in dynamic:
        write_mesh({k: v for k, v in part.items() if k not in ('vertices', 'object')}, part['vertices'])
# Encode linear HDR radiance as RGBM rather than clipping the EXR into an LDR PNG.
pixels = np.array(environment.pixels[:], dtype=np.float32).reshape(-1, 4)
hdr_range = max(1., float(pixels[:, :3].max()))
multiplier = np.ceil(np.maximum(pixels[:, :3].max(axis=1) / hdr_range, 1/255) * 255) / 255
encoded = np.concatenate((pixels[:, :3] / (multiplier[:, None] * hdr_range), multiplier[:, None]), axis=1)
hdr = bpy.data.images.new('orb-source-HDR-RGBM', width=environment.size[0], height=environment.size[1], alpha=True)
hdr.colorspace_settings.name = 'Non-Color'; hdr.alpha_mode = 'CHANNEL_PACKED'; hdr.pixels.foreach_set(encoded.ravel())
manifest = {'version': 2, 'frames': 288, 'fps': 24, 'duration': 12, 'materials': materials, 'meshes': meshes, 'lightEnergy': energies,
            'environment': texture(hdr), 'environmentRange': hdr_range, 'environmentStrength': .008,
            'orb': {'center': list(orb_center), 'radius': ORB_RADIUS, 'source': 'orb-master.blend'},
            'firePosition': list(root.location + root.rotation_euler.to_quaternion() @ Vector((0, 0, .6))),
            'camera': {'target': list(target), 'yaw': .36, 'pitch': .31, 'distance': 4.8},
            'source': 'Outer_Wilds_Campfire_Animated.blend', 'scene': 'blender/harry-campfire-orb-dark.blend'}
with open(os.path.join(OUT, 'scene.json'), 'w', encoding='utf-8') as f: json.dump(manifest, f, separators=(',', ':'))
scene.frame_set(1)
scene.render.resolution_x = 900; scene.render.resolution_y = 820; scene.render.resolution_percentage = 100
scene.render.filepath = os.path.join(ROOT, 'blender', 'harry-campfire-orb-dark-preview.png')
if '--no-preview' not in sys.argv: bpy.ops.render.render(write_still=True)
print('ORBIT_EXPORT_COMPLETE',len(meshes),'draws',len(materials),'materials',flush=True)
