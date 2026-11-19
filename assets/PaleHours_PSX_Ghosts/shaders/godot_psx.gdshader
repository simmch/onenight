// godot_psx.gdshader - Core Systems Asset Factory PSX surface shader for Godot 4 (Forward+, Mobile and Compatibility).
// Vertex snapping to a low-resolution grid, affine (perspective-incorrect) texture mapping, nearest-filtered albedo,
// 15-bit colour quantisation with ordered dithering and a distance fog. Drop on a MeshInstance3D material, set `albedo`
// to the pack texture (textures/<name>_skinN.png). Every uniform is a slider.
shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_disabled;

uniform sampler2D albedo : source_color, filter_nearest, repeat_enable;
uniform vec2 snap_resolution = vec2(320.0, 240.0);
uniform float affine_strength : hint_range(0.0, 1.0) = 1.0;
uniform float colour_levels : hint_range(4.0, 256.0) = 32.0;
uniform bool dither = true;
uniform vec4 fog_colour : source_color = vec4(0.03, 0.03, 0.05, 1.0);
uniform float fog_start = 6.0;
uniform float fog_end = 28.0;
uniform float brightness : hint_range(0.0, 2.0) = 1.0;

varying vec3 affine_uv;
varying float fog_amount;

const mat4 BAYER = mat4(
	vec4(0.0, 8.0, 2.0, 10.0),
	vec4(12.0, 4.0, 14.0, 6.0),
	vec4(3.0, 11.0, 1.0, 9.0),
	vec4(15.0, 7.0, 13.0, 5.0));

void vertex() {
	vec4 clip = PROJECTION_MATRIX * MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	vec2 grid = snap_resolution * 0.5;
	vec2 ndc = clip.xy / clip.w;
	ndc = floor(ndc * grid + 0.5) / grid;
	clip.xy = ndc * clip.w;
	POSITION = clip;
	affine_uv = vec3(UV * clip.w, clip.w);
	float view_depth = -(MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).z;
	fog_amount = clamp((view_depth - fog_start) / max(0.001, fog_end - fog_start), 0.0, 1.0);
}

void fragment() {
	vec2 uv = mix(UV, affine_uv.xy / affine_uv.z, affine_strength);
	vec3 col = texture(albedo, uv).rgb * brightness;
	if (dither) {
		int x = int(mod(FRAGCOORD.x, 4.0));
		int y = int(mod(FRAGCOORD.y, 4.0));
		float threshold = (BAYER[y][x] + 0.5) / 16.0 - 0.5;
		col += threshold / colour_levels;
	}
	col = floor(clamp(col, 0.0, 1.0) * colour_levels) / colour_levels;
	ALBEDO = mix(col, fog_colour.rgb, fog_amount);
}
