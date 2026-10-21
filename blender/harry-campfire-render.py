"""Render the twelve-frame seamless flame cycle from harry-campfire.blend."""
import bpy, os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scene=bpy.context.scene
scene.render.resolution_x=1100;scene.render.resolution_y=1000;scene.cycles.samples=48
for frame in range(1,13):
    scene.frame_set(frame)
    scene.render.filepath=os.path.join(root,'public','harry-campfire',f'frame-{frame:02}.png')
    bpy.ops.render.render(write_still=True)
print('HARRY_LOOP_COMPLETE')
