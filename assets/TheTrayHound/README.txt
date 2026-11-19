THE TRAY HOUND - PSX Horror Creature
SublevelB

Contents
- SK_TrayHound.fbx        : mesh, rig (27 bones) and all 8 animations
- Textures/               : 2048 / 1024 px (clean) + 512 / 256 px (PSX, reduced colours, dithered)
- TheTrayHound_source.blend : Blender source, texture packed in

Animations (30 fps)
Idle, Idle_Sniff, Walk, Run, Run_Shred, Attack_Shred, Hit, Death

Move speeds (in place animations)
Walk 36 cm/s  |  Run 260 cm/s  |  Run_Shred 260 cm/s

The tool bundle on its head is one rigid part on the "head" bone, so the blades never bend.

Size: about 0.9 m at the back and 2 m long. Scale it freely in your engine if you want a smaller or bigger hound.
The model faces -Y in Blender (forward in Unity and Unreal), scale 1.0, feet on the floor.

If Idle looks jittery in your engine
The idle moves very slowly, and default animation compression can round off those small movements.
- Unreal: open the Idle animation > Asset Details > Compression > Bone Compression Settings
  > set it to "ACL Uniformly Sampled" (or lower the error threshold) and click Apply.
- Unity: select the FBX > Animation tab > Anim. Compression > Off (or lower the error values).

Questions or problems? Leave a comment on the product page and I'll help.
