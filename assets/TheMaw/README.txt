THE MAW - PSX Horror Creature
SublevelB

Contents
- SK_Maw.fbx        : mesh, rig (39 bones) and all 9 animations
- Textures/         : 2048 / 1024 px (clean) + 512 / 256 px (PSX, reduced colours, dithered)
- TheMaw_source.blend : Blender source, texture packed in

Animations (30 fps)
Idle_Breathe, Idle_Hungry, Crawl, Run_Pull, Run_Chomp, Attack_Swipe, Attack_Eat, Hit, Death

Move speeds (in place animations)
Crawl 49 cm/s  |  Run_Pull 113 cm/s  |  Run_Chomp 113 cm/s

The chest mouth has its own jaw bones (mouth_upper / mouth_lower), so you can open and close it in your own animations.

The model faces -Y in Blender (forward in Unity and Unreal), scale 1.0, resting on the floor.

If Idle looks jittery in your engine
The idle moves very slowly, and default animation compression can round off those small movements.
- Unreal: open the Idle animation > Asset Details > Compression > Bone Compression Settings
  > set it to "ACL Uniformly Sampled" (or lower the error threshold) and click Apply.
- Unity: select the FBX > Animation tab > Anim. Compression > Off (or lower the error values).

Questions or problems? Leave a comment on the product page and I'll help.
