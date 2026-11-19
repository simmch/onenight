THE CONTORTIONIST - PSX Horror Creature
SublevelB

Contents
- SK_Contortionist.fbx        : mesh, rig (36 bones) and all 6 animations
- Textures/                   : 1024 px (clean) + 512 / 256 px (PSX, reduced colours, dithered)
- TheContortionist_source.blend : Blender source, texture packed in

Animations (30 fps)
Idle, Walk, Run, Attack, Hit, Death

Move speeds (in place animations)
Walk 60 cm/s  |  Run 220 cm/s

The face has its own jaw bones (mouth_upper / mouth_lower), so you can open and close the mouth in your own animations.

Size: about 1.2 m tall and 2.7 m wide with the legs spread. Scale it freely in your engine.
The model faces -Y in Blender (forward in Unity and Unreal), scale 1.0, resting on the floor.

If Idle looks jittery in your engine
The idle moves very slowly, and default animation compression can round off those small movements.
- Unreal: open the Idle animation > Asset Details > Compression > Bone Compression Settings
  > set it to "ACL Uniformly Sampled" (or lower the error threshold) and click Apply.
- Unity: select the FBX > Animation tab > Anim. Compression > Off (or lower the error values).

Questions or problems? Leave a comment on the product page and I'll help.
