import * as THREE from 'three';

// Pale, grey, matte skin with per-vertex variation (the colours live on the geometry), and eyes that
// only show up as a faint reflection. SKIN_GAIN lifts the albedo so the weak light of a match can still
// show the body; the flashlight is strong enough either way.
export const SKIN_GAIN = 1.85;

export function createObserverMaterials({ ambientScale = 1 } = {}) {
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true });
  skin.color.setRGB(SKIN_GAIN * 0.86, SKIN_GAIN * 0.92, SKIN_GAIN);     // cool grey, so the warm flashlight doesn't turn it gold
  // ambientScale < 1 keeps a map's constant ambient glow (hell) from outlining the body in the dark
  skin.onBeforeCompile = (sh) => {
    sh.uniforms.uAmbientScale = { value: ambientScale };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAmbientScale;')
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin
        .replace('vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );', 'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor ) * uAmbientScale;'));
  };
  const eyes = new THREE.MeshBasicMaterial({ color: 0x000000 });
  return {
    skin, eyes,
    // glow 0..1: how squarely the player is facing the eyes. Never more than a dull glint.
    setEyeGlow(glow) { const g = 0.03 + glow * 0.95; eyes.color.setRGB(0.85 * g, 0.9 * g, 0.72 * g); },
    dispose() { skin.dispose(); eyes.dispose(); },
  };
}
