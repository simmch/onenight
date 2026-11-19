THE CONGREGATION - PSX Horror Boss
SublevelB

Contents
- SK_Congregation.fbx : mesh, rig (87 bones) and all 9 animations
- Textures/           : 2048 / 1024 px (clean) + 512 / 256 px (PSX, reduced colours, dithered)
- TheCongregation_source.blend : Blender source, texture packed in

Animations (30 fps)
Idle, Idle_02, Walk, Run, Run_Spider, Attack_Pound, Attack_Leap, Hit, Death

Move speeds (in place animations)
Walk 43 cm/s  |  Run 222 cm/s  |  Run_Spider 233 cm/s
Attack_Leap uses root motion (moves 3 m forward) - enable root motion for it.

The model faces -Y in Blender (forward in Unity and Unreal), scale 1.0, feet on the floor.

If Idle looks jittery in your engine
The idle moves very slowly, and default animation compression can round off those small movements.
- Unreal: open the Idle animation > Asset Details > Compression > Bone Compression Settings
  > set it to "ACL Uniformly Sampled" (or lower the error threshold) and click Apply.
- Unity: select the FBX > Animation tab > Anim. Compression > Off (or lower the error values).
Or use Idle_02, which is built so it does not have this issue.

Questions or problems? Leave a comment on the product page and I'll help.
