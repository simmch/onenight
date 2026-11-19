THE BRUTE - PSX Horror Monster
SublevelB

Contents
- SK_Brute.fbx           : mesh, rig (23 bones) and all 7 animations
- Textures/              : 1024 px (clean) + 512 / 256 px (PSX, reduced colours, dithered)
- Textures/HD/           : 2048 px BaseColor + Normal map (baked from the 1.4M poly sculpt) for modern / realistic projects
- TheBrute_source.blend  : Blender source, texture packed in

Animations (30 fps)
Idle, Walk, Run, Attack_Slam, Attack_Swing, Hit, Death

Move speeds (in place animations)
Walk 78 cm/s  |  Run 350 cm/s

The concrete block on the right arm is rigid, it does not bend.

HD textures: plug T_Brute_2048_BaseColor into Base Color and the normal map into Normal.
- Unreal: use T_Brute_2048_Normal_DirectX
- Unity, Godot, Blender: use T_Brute_2048_Normal_OpenGL

Size: about 2.5 m tall. Scale it freely in your engine.
The model faces -Y in Blender (forward in Unity and Unreal), scale 1.0, feet on the floor.

If Idle looks jittery in your engine
The idle moves very slowly, and default animation compression can round off those small movements.
- Unreal: open the Idle animation > Asset Details > Compression > Bone Compression Settings
  > set it to "ACL Uniformly Sampled" (or lower the error threshold) and click Apply.
- Unity: select the FBX > Animation tab > Anim. Compression > Off (or lower the error values).

Questions or problems? Leave a comment on the product page and I'll help.
