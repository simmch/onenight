import * as THREE from 'three';
import { createMap, MAP_NAMES, MAP_META, LIQUID, FLOOR, SECRET } from './maps.js';
import { installInteriorLook } from './interiors/InteriorLook.js';
import { EXPOSED_ZONES } from './interiors/HazardDistricts.js';
import { createFacilityHazards } from './interiors/FacilityHazards.js';
import { doorBounds, doorIsClosed, segmentHits } from './world/Cover.js';
import { MAP_LIGHTS, describeMapLight, fixtureId, fixtureSeed, fixtureLevel, fixtureLensKind, isPoweredFixture, mapLightAt } from './world/MapLighting.js';
import { createObserverRound, OBS_ROUND, bodiesFor } from './observer/ObserverRound.js';
import { createObserverModel } from './observer/ObserverModel.js';
import { preloadMonsterAssets } from './world/MonsterAssets.js';
import { loadPaleHoursGhost } from './world/PaleHoursGhosts.js';
import { createCinematicMix } from './world/CinematicMix.js';
import { ObserverAnimator } from './observer/ObserverAnimator.js';
import { ObserverMovement } from './observer/ObserverMovement.js';
import { createObserverAudio } from './observer/ObserverAudio.js';
import { buildCorpse, poseCorpse } from './observer/DeadBodies.js';
import { createCollective, COLLECTIVE } from './collective/CollectiveRound.js';
import { buildChild, poseChild, createCollectiveMaterials } from './collective/CollectiveModel.js';
import { createChoirRound } from './choir/ChoirRound.js';
import { createConsumerRound } from './consumer/ConsumerRound.js';
import { createSlimeRound, SLIME } from './slime/SlimeRound.js';
import { createUnseenRound, UNSEEN } from './unseen/UnseenRound.js';
import { createLightboundRound } from './lightbound/LightboundRound.js';
import { createSpecialRounds, SPECIAL_ROUNDS } from './encounters/SpecialRounds.js';
import { createCultRound } from './cult/CultRound.js';
import { createJournal } from './lore/journal.js';
import { createStoryboard } from './lore/storyboard.js';
import { createLorePickups } from './lore/pickups.js';
import { mountLeaderboard, offerScore } from './leaderboard.js';
import { createTitleScreen } from './cinema/TitleScreen.js';
import { createCutscenes } from './cinema/Cutscenes.js';
import { createMapFall } from './cinema/MapFall.js';
import { GUN_TIERS, LIGHT_TIERS, RADAR_TIERS, COSTS, PARTS_IN_CHEST, SPRITES, createWorkbench, createPicker, ARMOR_TIERS, ARMOR_ICONS, rollArmorTier } from './gear/upgrades.js';

// The checkpoint carries the run and the fall across the destination's fresh scene load.
const TRAVEL_STATE = 'oneNightTravel';
const arriving = history.state?.[TRAVEL_STATE];
const arrival = arriving && MAP_NAMES.includes(arriving.map) && arriving.run ? arriving : null;
let mapFall = null;
const monsterAssetsReady = preloadMonsterAssets();
let cult = null;

// ───────────────────────── config ─────────────────────────
const CFG = {
  seed: arrival?.seed ?? (Number(new URLSearchParams(location.search).get('seed')) || (Math.random() * 1e9) | 0),
  chunk: 16,            // metres per chunk
  radius: 3,            // chunks loaded around the player
  renderHeight: 300,    // internal vertical resolution (pixelated upscale)
  eye: 1.7,
  walk: 2.8, run: 5.1,
  nightStartHour: 21, nightEndHour: 6,
  secondsPerHour: 60,   // 9 in-game hours -> 9 real minutes
  light: { intensity: 45, distance: 40, angle: 0.44, penumbra: 0.5, decay: 1.35 },
  batterySeconds: 200,  // beam-on time a full battery lasts
  startMatches: 3,
  startPotions: 1,
  match: { seconds: 30, intensity: 5, distance: 10 },
  chestChance: 0.25,    // chance a 16 m chunk holds a chest (about one every 30 m)
  chestReach: 2.2,
};
console.log('seed', CFG.seed);
// A ?map= link still opens that place. Otherwise the first night is a random one.
const requestedMap = new URLSearchParams(location.search).get('map');
const MAP_NAME = arrival?.map ?? (MAP_NAMES.includes(requestedMap) ? requestedMap : MAP_NAMES[(Math.random() * MAP_NAMES.length) | 0]);
const META = MAP_META[MAP_NAME];
console.log('map', MAP_NAME);

// ───────────────────────── rng / noise ─────────────────────────
function hash2(x, z, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(s + CFG.seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise(x, z, scale, s) {           // smooth value noise, 0..1
  x /= scale; z /= scale;
  const xi = Math.floor(x), zi = Math.floor(z);
  let fx = x - xi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
// Some nights the woods take the outskirts' storm: the same rain and thunder, for as long as you are there.
const forestStorm = MAP_NAME === 'forest' && (() => {
  const q = new URLSearchParams(location.search).get('storm');
  if (q === '1') return true;
  if (q === '0') return false;
  return hash2(3, 11, 91) < 0.35;
})();
if (forestStorm) META.weather = 'rain';

// ───────────────────────── renderer / scene ─────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(META.fog);
scene.fog = new THREE.FogExp2(META.fog, META.fogDensity);
// NOTE: no ambient light on purpose (hell has a faint red glow). The flashlight is the only light you can rely on.
scene.add(new THREE.AmbientLight(META.ambient[0], META.ambient[1]));
// Dusk: some Observer rounds on the open maps start before full dark. A cool sky light, a dim violet haze, thinner fog.
const DUSK = { maps: ['rural', 'snow'], chance: 0.4, sky: 0xc89a7a, ground: 0x3a2618, intensity: 1.8, fog: 0x3a2a26, fogDensity: 0.028 };
const duskLight = new THREE.HemisphereLight(DUSK.sky, DUSK.ground, 0);
scene.add(duskLight);
let isDusk = false;
function setDusk(on) {
  isDusk = on;
  duskLight.intensity = on ? DUSK.intensity : 0;
  const c = on ? DUSK.fog : META.fog;
  scene.fog.color.set(c); scene.fog.density = on ? DUSK.fogDensity : META.fogDensity;
  scene.background.set(c);
  bolt.sky.set(c);                                             // the rain map repaints the sky from this every frame
}

const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 120);
camera.rotation.order = 'YXZ';
camera.position.set(0, CFG.eye, 0);
scene.add(camera);

let visionReady = false;
function resize() {
  let vw = innerWidth, vh = innerHeight;
  if (window.visualViewport && matchMedia('(hover: none) and (pointer: coarse)').matches) {
    vw = visualViewport.width; vh = visualViewport.height;
  }
  const h = CFG.renderHeight, w = Math.max(1, Math.round(h * vw / Math.max(1, vh)));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (visionReady) {
    visionRT.setSize(w, h);
    visionUniforms.uTexel.value.set(1 / w, 1 / h);
    visionUniforms.uAspect.value = w / h;
  }
}
addEventListener('resize', resize); resize();

// ───────────────────────── flashlight ─────────────────────────
const L = { ...CFG.light, distance: META.beamRange ?? CFG.light.distance };
const spot = new THREE.SpotLight(0xffd49c, 0, L.distance, L.angle, L.penumbra, L.decay);
spot.position.set(0.22, -0.18, 0);
spot.target.position.set(0, -0.35, -10);
camera.add(spot, spot.target);
// Dim wider cone so the fringe around the beam has something soft to show.
const halo = new THREE.SpotLight(0xffd49c, 0, 26, 0.62, 1, 1.8);
halo.position.copy(spot.position);
halo.target = spot.target;
camera.add(halo);

const texLoader = new THREE.TextureLoader();
const arrivalTextures = [];
function pixelTex(url) {
  let settled;
  if (arrival?.fall) arrivalTextures.push(new Promise(resolve => { settled = resolve; }));
  const t = texLoader.load(url, settled, undefined, settled);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const held = new THREE.Mesh(
  new THREE.PlaneGeometry(0.34, 0.34),
  new THREE.MeshBasicMaterial({ map: pixelTex('./assets/flashlight.png'), color: 0x6a6a6a, alphaTest: 0.5, depthTest: false, fog: false, toneMapped: false })
);
held.renderOrder = 999;
held.layers.set(1);
const plainFlashlightTexture = held.material.map;
const HELD_UP = new THREE.Vector3(0.36, -0.30, -0.62), HELD_DOWN = new THREE.Vector3(0.36, -0.75, -0.62);
held.position.copy(HELD_DOWN);
camera.add(held);

const SKIP_INTRO = !!arrival || new URLSearchParams(location.search).has('nointro');
const flashlight = { battery: 1, equipped: SKIP_INTRO, raise: 0, flickerAge: -1, flickerDur: 0, nextFlicker: 7 + Math.random() * 8 };
const videoFlicker = { next: 2.5 + Math.random() * 2.5, age: -1, duration: 0, amount: 0 };

// Soft fringe around the beam: the core stays sharp, the ring around it is blurred.
const visionRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, samples: 0 });
visionRT.texture.magFilter = visionRT.texture.minFilter = THREE.NearestFilter;
visionRT.texture.generateMipmaps = false;
const visionUniforms = {
  tDiffuse: { value: visionRT.texture },
  uTexel: { value: new THREE.Vector2(1, 1) },
  uAspect: { value: 1 },
  uCore: { value: 0.18 },
  uSoft: { value: 0.2 },
  uStain: { value: 0 },
  uVideo: { value: 0 },
  uVideoTime: { value: 0 },
  uVideoOut: { value: 0 },
  uBlind: { value: 0 },
  uHeat: { value: 0 },
  uWhiteout: { value: 0 },
  uReflection: { value: 0 },
};
const visionMat = new THREE.ShaderMaterial({
  uniforms: visionUniforms,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uAspect;
    uniform float uCore;
    uniform float uSoft;
    uniform float uStain;
    uniform float uVideo;
    uniform float uVideoTime;
    uniform float uVideoOut;
    uniform float uBlind;
    uniform float uHeat;
    uniform float uWhiteout;
    uniform float uReflection;
    varying vec2 vUv;
    vec3 tap(vec2 o){ vec2 uv = vec2(mix(vUv.x, 1.0 - vUv.x, step(0.01, uReflection)), vUv.y); return texture2D(tDiffuse, uv + o).rgb; }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      float wavering = sin(vUv.y * 38.0 + uVideoTime * 9.0) * (0.011 * uHeat);
      vec3 sharp = tap(vec2(wavering, 0.0));
      vec2 px = uTexel * 6.5;
      vec3 blur = sharp * 0.18;
      blur += tap(px * vec2( 1.0, 0.0)) + tap(px * vec2(-1.0, 0.0));
      blur += tap(px * vec2( 0.0, 1.0)) + tap(px * vec2( 0.0,-1.0));
      blur += tap(px * vec2( 0.7, 0.7)) + tap(px * vec2(-0.7, 0.7));
      blur += tap(px * vec2( 0.7,-0.7)) + tap(px * vec2(-0.7,-0.7));
      blur /= 8.18;
      float d = length((vUv - vec2(0.5, 0.46)) * vec2(uAspect, 1.0));
      float core = mix(uCore, 0.46, uVideo);                        // the camera sees wide: its blur starts far out, near the rim of the lens
      float fringe = smoothstep(core, core + mix(uSoft, 0.3, uVideo), d);
      vec3 color = mix(sharp, blur, fringe);
      color *= mix(vec3(1.1, 1.0, 0.8), vec3(1.0), uVideo);     // a warm grade over everything; the video camera keeps its green
      float lift = clamp(uStain, 0.0, 1.0);
      color.r = mix(color.r, min(1.0, color.r * 0.45 + 0.62), lift);
      color.g = mix(color.g, color.g * 0.38, lift);
      color.b = mix(color.b, color.b * 0.28, lift);
      vec2 pixel = floor(vUv / uTexel);
      float grain = hash(pixel + vec2(floor(uVideoTime * 24.0))) - 0.5;
      float snow = step(0.9975, hash(pixel * 1.7 + vec2(floor(uVideoTime * 11.0))));
      float scanline = 0.9 + 0.1 * sin(pixel.y * 3.14159);
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      // the lens gathers light: what the beam shows, the camera shows brighter, in green, with a little white in the highlights
      float gained = pow(clamp(luma * 2.6, 0.0, 1.0), 0.7);
      vec3 nightVision = (vec3(gained * 0.14, gained * 0.96, gained * 0.3) + vec3(pow(gained, 4.0) * 0.3)) * scanline;
      nightVision += vec3(grain * 0.04 + snow * 0.2, grain * 0.07 + snow * 0.32, grain * 0.03 + snow * 0.12);
      float band = step(0.9975, hash(vec2(floor(vUv.y * 96.0), floor(uVideoTime * 8.0)))) * 0.16;
      nightVision += vec3(band * 0.25, band, band * 0.5);
      nightVision *= 1.0 - smoothstep(0.5, 0.95, d) * 0.97;       // and round the lens, soft black
      color = mix(color, clamp(nightVision, 0.0, 1.0), uVideo);
      color *= 1.0 - clamp(uVideoOut, 0.0, 1.0) * uVideo;
      color = mix(color, blur * 0.44 + vec3(0.10, 0.095, 0.065), uBlind * 0.92);
      color = mix(color, vec3(0.46, 0.52, 0.58) + grain * 0.17, uWhiteout * smoothstep(0.01, 0.65, d + 0.17) * 0.97);
      color = mix(color, color.bgr * vec3(0.62, 0.82, 0.93), uReflection);
      gl_FragColor = vec4(color, 1.0);
    }`,
});
const visionScene = new THREE.Scene();
const visionQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), visionMat);
visionQuad.frustumCulled = false;
visionScene.add(visionQuad);
const visionCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
visionCam.position.z = 1;
visionReady = true;
resize();

// ───────────────────────── ground (and cave ceiling) ─────────────────────────
const GROUND_TILE = 4;
const GROUND_SIZE = META.terrain ? 240 : 400, GROUND_SEG = META.terrain ? 120 : 1;
function speckleTexture(pal, salt, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = mulberry(CFG.seed ^ salt);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    g.fillStyle = pal[(r() * r() * pal.length) | 0]; g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(repeat, repeat);
  return t;
}
// Bias the surface normal toward the viewer so a beam held at eye height still lights the floor
// (true grazing-angle Lambert would leave it almost black).
function surfaceMaterial(tex, color = 0xffffff) {
  const m = new THREE.MeshLambertMaterial({ map: tex, color });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <defaultnormal_vertex>',
      'vec3 transformedNormal = normalize(normalMatrix * objectNormal + vec3(0.0, 0.0, 1.2));');
  };
  return m;
}
const groundMat = surfaceMaterial(speckleTexture(META.ground, 0x9e37, GROUND_SIZE / GROUND_TILE));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEG, GROUND_SEG), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.frustumCulled = false;
scene.add(ground);
const ceiling = META.ceiling ? new THREE.Mesh(new THREE.PlaneGeometry(400, 400), surfaceMaterial(speckleTexture(META.ground, 0x51c3, 100), 0xc8c8d6)) : null;
if (ceiling) { ceiling.rotation.x = Math.PI / 2; ceiling.frustumCulled = false; scene.add(ceiling); }
// The ground follows the player in whole texture tiles. On the mountain it is a height field, re-sampled each time it moves.
let groundX = NaN, groundZ = NaN;
function placeGround() {
  const gx = Math.round(camera.position.x / GROUND_TILE) * GROUND_TILE, gz = Math.round(camera.position.z / GROUND_TILE) * GROUND_TILE;
  if (gx === groundX && gz === groundZ) return;
  groundX = gx; groundZ = gz;
  ground.position.set(gx, 0, gz);
  if (ceiling) ceiling.position.set(gx, META.ceiling, gz);
  if (META.terrain) {
    const pos = ground.geometry.attributes.position;       // plane lies in local XY; local Z is world height
    for (let i = 0; i < pos.count; i++) pos.setZ(i, MAP.groundY(gx + pos.getX(i), gz - pos.getY(i)));
    pos.needsUpdate = true;
  }
}

// ───────────────────────── billboards (instanced, camera-facing) ─────────────────────────
const atlas = await (await fetch('./assets/atlas.json')).json();
const MAP = createMap(MAP_NAME, { seed: CFG.seed, S: CFG.chunk, atlas, hash2, mulberry, noise, chestChance: CFG.chestChance });
if (MAP.interior || MAP_NAME === 'forest' || MAP_NAME === 'swamp' || arrival) {
  const locationLabel = document.getElementById('locationName');
  locationLabel.textContent = META.label;
  locationLabel.hidden = false;
}
if (MAP.interior) {
  ground.visible = ceiling.visible = false;
}
// ───────────────────────── the lake, and ground that has been eaten ─────────────────────────
// Every open map has one lake, far from where the night starts. It is the only thing that kills the Slime.
// `eaten` is the ground the Slime has rolled over (and the lake bed): circles, bucketed by chunk. Whatever stood there is gone.
const lake = { on: !MAP.grid, x: 0, z: 0, r: 22, y: 0, far: 210 };
const eaten = new Map();
let eatenDirty = false;
function eatAdd(x, z, r) {
  const S = CFG.chunk;
  for (let cx = Math.floor((x - r) / S); cx <= Math.floor((x + r) / S); cx++) for (let cz = Math.floor((z - r) / S); cz <= Math.floor((z + r) / S); cz++) {
    const k = cx + ',' + cz; let list = eaten.get(k); if (!list) eaten.set(k, list = []);
    list.push(x, z, r * r);
  }
  eatenDirty = true;
}
function inEaten(E, x, z) {
  for (let i = 0; i < E.length; i += 3) if ((x - E[i]) ** 2 + (z - E[i + 1]) ** 2 < E[i + 2]) return true;
  return false;
}
if (MAP_NAME === 'forest' || MAP_NAME === 'swamp') {
  const blocked = MAP.blocked;
  const swallowed = (x, z) => {
    const marks = eaten.get(Math.floor(x / CFG.chunk) + ',' + Math.floor(z / CFG.chunk));
    return marks && inEaten(marks, x, z);
  };
  MAP.blocked = (x0, z0, x1, z1, doors) => blocked(x0, z0, x1, z1, doors, swallowed);
}
const rawGroundY = MAP.groundY;
MAP.groundY = (x, z) => {                 // on rolling ground the lake lies level, and its banks ease down to it
  if (MAP_NAME === 'swamp' && inLake(x, z, 1.5)) return lake.y;
  const y = rawGroundY(x, z);
  if (!lake.on || !META.terrain) return y;
  const d = Math.hypot(x - lake.x, z - lake.z);
  if (d > lake.r + 12) return y;
  const k = Math.max(0, (d - lake.r) / 12), e = k * k * (3 - 2 * k);
  return lake.y + (y - lake.y) * e;
};
const lakeMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x1f66b8, transparent: true, opacity: 0.9 }));
if (MAP_NAME === 'forest' || MAP_NAME === 'swamp') lakeMesh.material = new THREE.MeshLambertMaterial({ color: 0x29454a });
lakeMesh.rotation.x = -Math.PI / 2; lakeMesh.visible = false; scene.add(lakeMesh);
function placeLake() {
  if (!lake.on) return;
  const a = hash2(17, 5, 977) * Math.PI * 2;
  lake.x = Math.cos(a) * lake.far; lake.z = Math.sin(a) * lake.far; lake.y = MAP_NAME === 'swamp' ? 0 : rawGroundY(lake.x, lake.z);
  lakeMesh.position.set(lake.x, lake.y + 0.06, lake.z); lakeMesh.scale.setScalar(lake.r); lakeMesh.visible = true;
  eatAdd(lake.x, lake.z, lake.r + 1.5);
}
const inLake = (x, z, pad = 0) => lake.on && (x - lake.x) ** 2 + (z - lake.z) ** 2 < (lake.r + pad) ** 2;
placeLake();
const CAP = 24000;
const uTime = { value: 0 };
const atlasTex = pixelTex('./assets/atlas.png');
const dummy = new THREE.Object3D();
const billboardTint = new THREE.Color();
const unseenRustle = {
  count: { value: 0 },
  paths: { value: Array.from({ length: UNSEEN.maxCount }, () => new THREE.Vector4()) },
};
const looseProps = new Set(['fern', 'bramble', 'web', 'moss', 'trashbag', 'tire', 'gravel', 'ash']
  .flatMap((name) => atlas.sprites[name] || []));

// lit = shaded by the flashlight like everything else; unlit = glows on its own (torches, fire)
function billboardLayer(isLit, cap, rustle = null) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);   // pivot at the base
  const cells = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); // cellX, cellY, sway, rustle
  cells.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aCell', cells);
  const mat = isLit ? new THREE.MeshLambertMaterial({ map: atlasTex, alphaTest: 0.5 }) : new THREE.MeshBasicMaterial({ map: atlasTex, alphaTest: 0.5 });
  mat.customProgramCacheKey = () => rustle ? 'billboard-rustle' : 'billboard';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrid = { value: new THREE.Vector2(atlas.cols, atlas.rows) };
    sh.uniforms.uTime = uTime;
    if (rustle) {
      sh.uniforms.uRustleCount = rustle.count;
      sh.uniforms.uRustlePaths = rustle.paths;
    }
    const origin = `
      vec3 bbOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 bbToCam = cameraPosition - bbOrigin; bbToCam.y = 0.0; bbToCam = normalize(bbToCam);`;
    let v = sh.vertexShader
      .replace('#include <common>', `#include <common>
      attribute vec4 aCell; uniform vec2 uGrid; uniform float uTime;
      ${rustle ? `uniform int uRustleCount; uniform vec4 uRustlePaths[${UNSEEN.maxCount}];` : ''}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
      vMapUv = (vec2(aCell.x, uGrid.y - 1.0 - aCell.y) + uv * 0.98 + 0.01) / uGrid;`);
    if (isLit) v = v.replace('#include <defaultnormal_vertex>', origin + `
      vec3 transformedNormal = normalize((viewMatrix * vec4(bbToCam, 0.0)).xyz);`);
    sh.vertexShader = v.replace('#include <project_vertex>', (isLit ? '' : origin) + `
      vec3 bbRight = vec3(bbToCam.z, 0.0, -bbToCam.x);
      float bbSx = length(instanceMatrix[0].xyz);
      float bbSy = length(instanceMatrix[1].xyz);
      float bbSway = sin(uTime * 1.3 + bbOrigin.x * 0.7 + bbOrigin.z * 0.9) * aCell.z * transformed.y * bbSy;
      ${rustle ? `
      if (aCell.w > 0.0) {
        float disturbance = 0.0;
        for (int i = 0; i < ${UNSEEN.maxCount}; i++) {
          if (i >= uRustleCount) break;
          vec4 path = uRustlePaths[i];
          vec2 wake = path.zw - path.xy;
          vec2 offset = bbOrigin.xz - path.xy;
          float along = clamp(dot(offset, wake) / max(dot(wake, wake), 0.001), 0.0, 1.0);
          float contact = 1.0 - smoothstep(0.55, 3.0, length(offset - along * wake));
          disturbance = max(disturbance, contact * mix(1.0, 0.55, along));
        }
        float shake = sin(uTime * 14.0 + bbOrigin.x * 2.3 + bbOrigin.z * 1.7);
        bbSway += shake * disturbance * transformed.y * min(1.1, 0.32 * bbSy);
      }` : ''}
      vec3 bbWorld = bbOrigin + bbRight * (transformed.x * bbSx + bbSway) + vec3(0.0, transformed.y * bbSy, 0.0);
      vec4 mvPosition = viewMatrix * vec4(bbWorld, 1.0);
      gl_Position = projectionMatrix * mvPosition;`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false; mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  return {
    mesh, n: 0,
    add(x, y, z, w, h, cell, sway, tint = 0xffffff) {
      if (this.n >= cap) return;
      dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(w, h, 1); dummy.updateMatrix();
      mesh.setMatrixAt(this.n, dummy.matrix);
      mesh.setColorAt(this.n, billboardTint.set(tint));
      cells.setXYZW(this.n, cell % atlas.cols, Math.floor(cell / atlas.cols), sway, sway > 0 || looseProps.has(cell) ? 1 : 0);
      this.n++;
    },
    commit() { mesh.count = this.n; mesh.instanceMatrix.needsUpdate = true; cells.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; },
  };
}
const vegLayer = billboardLayer(true, CAP, unseenRustle), glowLayer = billboardLayer(false, 2000);
const veg = vegLayer.mesh;

// ───────────────────────── walls, floors, roads, water, lava (instanced boxes) ─────────────────────────
function repeatTex(url) { const t = pixelTex(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function paintTexture(size, salt, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), mulberry(CFG.seed ^ salt), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const PAINT = {
  asphalt(g, r, n) { const pal = ['#2a2b2f', '#303136', '#25262a', '#37383d', '#2c2d31', '#3d3e44']; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = pal[(r() * r() * pal.length) | 0]; g.fillRect(x, y, 1, 1); } },
  roof(g, r, n) {
    g.fillStyle = '#2b2422'; g.fillRect(0, 0, n, n);
    for (let y = 0; y < n; y += 8) for (let x = ((y / 8) % 2) * 4 - 8; x < n; x += 8) { g.fillStyle = ['#4a3a33', '#54423a', '#41332d', '#5c4a40'][(r() * 4) | 0]; g.fillRect(x + 1, y + 1, 7, 7); }
  },
  water(g, r, n) {
    g.fillStyle = '#0b1e2b'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 70; i++) { g.fillStyle = ['#15404f', '#1f546c', '#10303f', '#2f7088'][(r() * 4) | 0]; g.fillRect((r() * n) | 0, (r() * n) | 0, 2 + ((r() * 6) | 0), 1); }
  },
  lava(g, r, n) {
    g.fillStyle = '#c63a08'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 80; i++) { g.fillStyle = ['#ff7a12', '#ffb21e', '#e2500c', '#ffd34a', '#f06010'][(r() * 5) | 0]; g.fillRect((r() * n) | 0, (r() * n) | 0, 2 + ((r() * 6) | 0), 2 + ((r() * 4) | 0)); }
    for (let i = 0; i < 26; i++) { g.fillStyle = ['#3a0d05', '#521407', '#2a0903'][(r() * 3) | 0]; g.fillRect((r() * n) | 0, (r() * n) | 0, 3 + ((r() * 7) | 0), 2 + ((r() * 3) | 0)); }
  },
};
const liquidScroll = { value: new THREE.Vector2() };
// tile: metres per texture repeat, mapped in world space so any box size tiles cleanly (0 = stretch one copy over each face).
// bias: tilt flat tops toward the viewer, as the ground does, so the beam lights them.
function boxMaterial({ map = null, tile = 0, color = 0xffffff, unlit = false, bias = 0, scroll = false, gain = 1 }) {
  const m = unlit ? new THREE.MeshBasicMaterial({ map, color }) : new THREE.MeshLambertMaterial({ map, color });
  m.color.multiplyScalar(gain);      // dark textures need lifting to read under the beam
  m.customProgramCacheKey = () => `box:${tile}:${bias}`;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTile = { value: tile || 1 };
    sh.uniforms.uScroll = scroll ? liquidScroll : { value: new THREE.Vector2() };
    let v = sh.vertexShader;
    if (map && tile) v = v.replace('#include <common>', '#include <common>\nuniform float uTile; uniform vec2 uScroll;').replace('#include <uv_vertex>', `#include <uv_vertex>
      { vec4 bwp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 bwn = abs(normalize(mat3(instanceMatrix) * normal));
        vMapUv = (bwn.y > 0.5 ? bwp.xz : (bwn.x > 0.5 ? bwp.zy : bwp.xy)) / uTile + uScroll; }`);
    if (bias && !unlit) v = v.replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
      transformedNormal = normalize(transformedNormal + vec3(0.0, 0.0, ${bias.toFixed(2)}));`);
    sh.vertexShader = v;
  };
  return m;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const layers = {};
const lampLenses = [], lensTint = new THREE.Color();
function addLayer(name, material, cap) {
  const mesh = new THREE.InstancedMesh(boxGeo, material, cap);
  mesh.frustumCulled = false; mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  layers[name] = { mesh, cap, n: 0, lensKind: fixtureLensKind(name, MAP_NAME) };
}
const interiorLook = MAP.interior ? installInteriorLook(MAP_NAME, { scene, addLayer, boxMaterial, paintTexture }) : null;
const fixtureMap = MAP.interior || MAP_NAME === 'forest' || MAP_NAME === 'swamp';
if (fixtureMap) {
  const wood = paintTexture(64, 0x7f21, (g, r, n) => {
    g.fillStyle = '#5a4638'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 210; i++) {
      g.fillStyle = r() > 0.55 ? '#685543' : '#3a302a';
      g.fillRect(r() * n, r() * n, 1 + r() * 2, 4 + r() * 30);
    }
  });
  addLayer('wood', boxMaterial({ map: wood, tile: 2, bias: 0.6, gain: 1.25 }), 3700);
  addLayer('bark', boxMaterial({ map: wood, tile: 1.5, gain: 1.12 }), 3400);
  addLayer('fixture', boxMaterial({ color: 0x5c6260, bias: 0.4, gain: 1.3 }), 6800);
  addLayer('lever', boxMaterial({ color: 0x955e40, bias: 0.5, gain: 1.35 }), 400);
}
if (MAP_NAME === 'swamp') addLayer('bayouWater', boxMaterial({ map: paintTexture(64, 0x7c25, PAINT.water), tile: 4, color: 0x97a374, bias: 0.8, scroll: true }), 850);
if (MAP.interior) {
  addLayer('liquid', boxMaterial({ map: paintTexture(64, 0x55bf, PAINT.water), tile: 4, bias: 0.8, scroll: true, gain: 0.8 }), 850);
} else if (MAP.grid) {
  const rock = repeatTex(MAP_NAME === 'hell' ? './assets/tex/hellrock.png' : MAP_NAME === 'labyrinth' ? './assets/tex/brick.png' : './assets/tex/rock.png');
  const lift = MAP_NAME === 'hell' ? 1.9 : MAP_NAME === 'labyrinth' ? 1.5 : 2.4;
  if (MAP.labyrinth) addLayer('exit', boxMaterial({ color: 0xcfe0ff, unlit: true }), 8);      // the doorway out
  addLayer('wall', boxMaterial({ map: rock, tile: 4, gain: lift }), 1600);
  addLayer('secret', boxMaterial({ map: rock, tile: 4, color: 0xb9bcd6, gain: lift * 0.85 }), 64);          // a shade off: the only tell
  addLayer('liquid', MAP_NAME === 'hell'
    ? boxMaterial({ map: paintTexture(64, 0x1a7a, PAINT.lava), tile: 4, unlit: true, scroll: true })
    : boxMaterial({ map: paintTexture(64, 0x3a7e, PAINT.water), tile: 4, bias: 0.8, scroll: true, gain: 1.8 }), 1000);
}
if (MAP_NAME === 'rural') {
  addLayer('road', boxMaterial({ map: paintTexture(64, 0xa5fa, PAINT.asphalt), tile: 4, bias: 1.2, gain: 2.2 }), 300);
  addLayer('paint', boxMaterial({ color: 0xa8964e, bias: 1.2 }), 800);
  addLayer('hwall', boxMaterial({ map: repeatTex('./assets/tex/brick.png'), tile: 4 }), 2000);
  addLayer('floor', boxMaterial({ map: repeatTex('./assets/tex/floor.png'), tile: 4, bias: 1.2 }), 300);
  addLayer('roof', boxMaterial({ map: paintTexture(32, 0x400f, PAINT.roof), tile: 2, bias: 1.2 }), 300);
  addLayer('window', boxMaterial({ map: pixelTex('./assets/tex/window.png') }), 800);
  addLayer('door', boxMaterial({ map: pixelTex('./assets/tex/door.png') }), 400);
  layers.door.mesh.material.color.setScalar(2.4);      // dark wood: lift it so the beam shows a door, not a hole
  layers.window.mesh.material.color.setScalar(1.6);
}
// Reuse the same lights as chunks stream in and out. Hoods and windows use directional pools.
// They always exist (at zero) so lighting one never recompiles shaders.
const poolLights = Array.from({ length: MAP.interior ? 2 : 5 }, () => {
  const light = new THREE.PointLight(0xff8a3c, 0, 6.3, 1.65);
  scene.add(light);
  return light;
});
const poolSpots = Array.from({ length: MAP.interior ? 3 : 0 }, () => {
  const light = new THREE.SpotLight(0xb6cec4, 0, 5.6, 0.54, 0.56, 1.65);
  scene.add(light, light.target);
  return light;
});
const towerBeam = MAP_NAME === 'prison' ? new THREE.SpotLight(0xd8c8ac, 0, 13, 0.17, 0.60, 1.55) : null;
if (towerBeam) scene.add(towerBeam, towerBeam.target);
const near = { lights: [], vents: [], houses: [], doors: [], secrets: [], links: [], controls: [], hazards: [], towers: [] };
let glowStatic = 0;

// ───────────────────────── procedural chunks ─────────────────────────
// A chunk is pure data built by maps.js: billboards, colliders, boxes, lights, doors and so on.
const chunks = new Map();
const key = (cx, cz) => cx + ',' + cz;
const pick = (r, kind) => { const a = atlas.sprites[kind]; return a[(r() * a.length) | 0]; };
const CAMERA_WORDS = [
  'TODAY WAS MY EIGHTH BIRTHDAY.',
  'FATHER LOCKED THE DOOR.',
  'MOTHER HELD ME WHILE HE HIT ME.',
  'THEY SANG HAPPY BIRTHDAY OVER MY BODY.',
];
const seenCameraWords = new Set(), cameraWordChunks = new Map();
function makeCameraWord(data) {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 192;
  const g = canvas.getContext('2d'), phrase = CAMERA_WORDS[data.line] || CAMERA_WORDS[0];
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 30px Courier New, monospace';
  const words = phrase.split(' '), lines = []; let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > 570 && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  if (data.chalk) {
    g.fillStyle = '#d8d5c8'; g.shadowColor = '#c5c9bd'; g.shadowBlur = 3;
    lines.forEach((text, i) => g.fillText(text, 320, 60 + i * 42));
    g.shadowBlur = 0; g.fillStyle = 'rgba(230,230,216,.42)';
    for (let i = 0; i < 170; i++) g.fillRect(Math.random() * 640, Math.random() * 192, 1, 1);
  } else {
    g.fillStyle = '#6b110d'; g.shadowColor = '#9a1f17'; g.shadowBlur = 5;
    lines.forEach((text, i) => g.fillText(text, 320 + Math.sin(i * 7) * 2, 60 + i * 42));
    g.shadowBlur = 0; g.fillStyle = '#65110e';
    for (let i = 0; i < 15; i++) { const x = 42 + Math.random() * 556, y = 45 + Math.random() * 105; g.beginPath(); g.ellipse(x, y, 1 + Math.random() * 2, 3 + Math.random() * 8, 0, 0, Math.PI * 2); g.fill(); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.84), material);
  mesh.position.set(data.x, data.y, data.z); mesh.rotation.y = data.rotation; mesh.visible = false; mesh.renderOrder = 3; scene.add(mesh);
  return { id: `${MAP_NAME}:${data.id}`, mesh, exposed: false };
}
function mountCameraWords(chunkKey, chunk) {
  if (cameraWordChunks.has(chunkKey)) return;
  const entries = (chunk.cameraWords || []).map(makeCameraWord);
  cameraWordChunks.set(chunkKey, entries);
}
function unmountCameraWords(chunkKey) {
  const entries = cameraWordChunks.get(chunkKey); if (!entries) return;
  for (const entry of entries) {
    if (entry.exposed) seenCameraWords.add(entry.id);
    scene.remove(entry.mesh); entry.mesh.geometry.dispose(); entry.mesh.material.map.dispose(); entry.mesh.material.dispose();
  }
  cameraWordChunks.delete(chunkKey);
}
const wordAim = new THREE.Vector3(), wordTo = new THREE.Vector3();
function updateCameraWords(active) {
  camera.getWorldDirection(wordAim);
  for (const entries of cameraWordChunks.values()) for (const entry of entries) {
    if (seenCameraWords.has(entry.id)) { entry.mesh.visible = false; continue; }
    const p = entry.mesh.position, dx = p.x - camera.position.x, dy = p.y - camera.position.y, dz = p.z - camera.position.z;
    const distance = Math.hypot(dx, dy, dz);
    const lit = active && distance < 15 && distance > 0.5 && wordAim.dot(wordTo.set(dx, dy, dz).normalize()) > Math.cos(spot.angle * 0.9)
      && !creatureWorld.losBlocked(camera.position.x, camera.position.z, p.x, p.z);
    if (lit) { entry.mesh.visible = true; entry.exposed = true; }
    else if (entry.exposed) { entry.mesh.visible = false; entry.exposed = false; seenCameraWords.add(entry.id); }
  }
}

// Opened chests, open doors and broken-through cave walls, by id. Map generation itself lives in maps.js.
const opened = new Set();
const SPAWN_CHEST = MAP.spawnChest;
const SECRET_H = META.ceiling || 5.5;

let curCx = NaN, curCz = NaN;
// Places kept clear of grass and clutter (the Observer round's bodies), [x, z, r, ...], and extra round
// colliders only the player bumps into (hanging bodies, the Observer itself).
const clearZones = [], extraCircles = [];
function inClearZone(x, z) {
  for (let i = 0; i < clearZones.length; i += 3) if ((x - clearZones[i]) ** 2 + (z - clearZones[i + 1]) ** 2 < clearZones[i + 2] ** 2) return true;
  return false;
}
function setBox(L, x, y, z, sx, sy, sz, rot, tilt = 0) {
  if (!L || L.n >= L.cap) return;
  dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(tilt, rot, 0, 'YXZ'); dummy.updateMatrix();
  if (L.lensKind !== undefined) lampLenses.push({ layer: L, index: L.n, x, z, seed: fixtureSeed(x, z), last: -1 });
  L.mesh.setMatrixAt(L.n++, dummy.matrix);
}
function refreshChunks(force) {
  const cx = Math.floor(camera.position.x / CFG.chunk), cz = Math.floor(camera.position.z / CFG.chunk);
  if (!force && cx === curCx && cz === curCz) return;
  curCx = cx; curCz = cz;
  const R = CFG.radius, wanted = new Set(), D = MAP.door;
  const chestCell = [atlas.sprites.chest[0], atlas.sprites.chestOpen[0]], ventCells = atlas.sprites.vent || [];
  vegLayer.n = glowLayer.n = 0;
  lampLenses.length = 0;
  for (const name in layers) layers[name].n = 0;
  for (const name in near) near[name].length = 0;
  for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
    const k = key(cx + dx, cz + dz); wanted.add(k);
    let c = chunks.get(k);
    if (!c) chunks.set(k, c = MAP.generateChunk(cx + dx, cz + dz));
    mountCameraWords(k, c);
    interiorLook?.mount(k, c.details);
    const p = c.props, q = c.glow, E = eaten.get(k);
    for (let i = 0; i < p.length; i += 7) { if (p[i + 3] < 3 && inClearZone(p[i], p[i + 1])) continue; if (E && inEaten(E, p[i], p[i + 1])) continue; vegLayer.add(p[i], p[i + 6], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5]); }
    for (let i = 0; i < q.length; i += 7) if (!E || !inEaten(E, q[i], q[i + 1])) glowLayer.add(q[i], q[i + 6], q[i + 1], q[i + 2], q[i + 3], q[i + 4], q[i + 5]);
    if (c.chest) {
      const tint = c.chest.tier === 'armory' ? 0xd9b86c : c.chest.tier === 'red' ? 0xd27666 : c.chest.tier === 'blue' ? 0x769dc9 : 0xffffff;
      vegLayer.add(c.chest.x, MAP.groundY(c.chest.x, c.chest.z) - 0.05, c.chest.z, 0.95, 0.95, chestCell[opened.has(c.chest.id) ? 1 : 0], 0, tint);
    }
    for (let i = 0; i < c.vents.length && ventCells.length; i += 4) vegLayer.add(c.vents[i], 0, c.vents[i + 1], 1.0, 0.5, ventCells[(i / 4) % ventCells.length], 0);
    for (const name in c.boxes) {
      const L = layers[name], b = c.boxes[name];
      for (let i = 0; i < b.length; i += 7) if (!E || !inEaten(E, b[i], b[i + 2])) setBox(L, b[i], b[i + 1], b[i + 2], b[i + 3], b[i + 4], b[i + 5], b[i + 6]);
    }
    if (c.slopes) for (const [layer, ...slope] of c.slopes) setBox(layers[layer], ...slope);
    for (const tile of c.water || []) if (opened.has(tile.id)) setBox(layers.liquid, tile.x, tile.y + 0.018, tile.z, 4, 0.036, 4, 0);
    for (const h of c.hazards || []) {
      if (h.kind === 'roofGlass') {
        if (!opened.has(h.id)) setBox(layers.barrierGlass, h.x, h.roof, h.z, 3.83, 0.072, 3.84, 0);
        else for (let i = 0; i < 17; i++) {
          const a = i * 2.399 + h.phase * 8, r = 0.17 + i * 0.09;
          setBox(layers.railGlass, h.x + r * Math.cos(a), h.y + 0.016, h.z + r * Math.sin(a), 0.15 + i % 4 * 0.08, 0.035, 0.08, a);
        }
      } else if (h.kind === 'reflection') {
        setBox(layers.iron, h.x, h.y + 1.33, h.z, 1.36, 1.80, 0.09, -0.78);
        setBox(layers.railGlass, h.x - 0.05, h.y + 1.33, h.z + 0.04, 1.25, 1.66, 0.055, -0.78);
      } else if (h.kind === 'spill') {
        setBox(layers.railGlass, h.x, h.y + 0.01, h.z, 1.76, 0.023, 1.32, h.phase * 6.28);
        setBox(layers.rust, h.x + 0.45, h.y + 0.05, h.z - 0.47, 0.4, 0.095, 0.28, h.phase * 5);
      } else if (h.kind === 'brineDrip') {
        setBox(layers.rust, h.x, h.roof - 0.35, h.z, 0.13, 0.15, 3.9, 0);
        setBox(layers.iron, h.x, h.roof - 0.68, h.z, 0.22, 0.55, 0.21, 0);
      } else if (h.kind === 'iceEdge' && opened.has('system:beacon:' + h.sector)) {
        setBox(layers.amberDiode, h.x, h.y + 0.61, h.z, 0.11, 0.155, 0.10, 0);
      }
    }
    for (const control of c.controls || []) {
      if (E && inEaten(E, control.x, control.z)) continue;
      const { x, y, z, flood } = control;
      const down = opened.has(control.target);
      setBox(layers.fixture, x, y + 0.48, z, 0.20, 0.96, 0.22, 0);
      setBox(layers.fixture, x, y + 0.92, z, 0.35, 0.23, 0.27, 0);
      setBox(layers.lever, x, y + 1.15, z + (down ? -0.12 : 0.12), 0.12, flood ? 0.45 : 0.41, 0.11, 0, down ? -0.65 : 0.65);
    }
    for (const d of c.doors) {        // shut: across the gap. open: swung in on its hinge
      if (E && inEaten(E, d.x, d.z)) continue;
      if (d.style) {
        const w = d.width ?? D.W, h = d.height ?? D.H, t = d.thickness ?? D.T;
        const turn = d.along === 'x' ? 0 : Math.PI / 2;
        for (const side of [-1, 1]) setBox(layers.fixture, d.x + Math.cos(turn) * side * w * 0.49, d.y + h / 2,
          d.z - Math.sin(turn) * side * w * 0.49, 0.15, h + 0.12, 0.24, turn);
      if (!doorIsClosed(d, opened)) continue;
        if (d.style === 'bars') {
          for (let off = -w / 2 + 0.18; off < w / 2; off += 0.29) setBox(layers.fixture, d.x + Math.cos(turn) * off,
            d.y + h / 2, d.z - Math.sin(turn) * off, 0.082, h, t, turn);
          for (const offset of [0.18, h - 0.17]) setBox(layers.fixture, d.x, d.y + offset, d.z, w, 0.09, t + 0.025, turn);
        } else {
          const metal = d.style === 'security' || d.style === 'wardDoor';
          setBox(layers[metal ? 'fixture' : 'wood'], d.x, d.y + h / 2, d.z, w, h, t, turn);
          for (const offset of [h * 0.23, h * 0.73]) setBox(layers[metal ? 'lever' : 'fixture'], d.x, d.y + offset, d.z, w * 0.86, 0.09, t + 0.035, turn);
          setBox(layers.lever, d.x + Math.cos(turn) * w * 0.32, d.y + 1.02, d.z - Math.sin(turn) * w * 0.32, 0.19, 0.11, t + 0.12, turn);
        }
        continue;
      }
      const open = opened.has(d.id), alongX = d.along === 'x', lieX = open ? !alongX : alongX;
      const x = d.x + (open ? (alongX ? -D.W / 2 : d.inward * D.W / 2) : 0), z = d.z + (open ? (alongX ? d.inward * D.W / 2 : -D.W / 2) : 0);
      setBox(layers.door, x, D.H / 2, z, lieX ? D.W : 0.08, D.H, lieX ? 0.08 : D.W, 0);
    }
    for (const s of c.secrets) if (!opened.has(s.id)) setBox(layers.secret, s.x, SECRET_H / 2, s.z, 4, SECRET_H, 4, 0);
    if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) {
      for (const v of c.lights) near.lights.push(v);
      for (const v of c.vents) near.vents.push(v);
      for (const v of c.houses) near.houses.push(v);
      for (const detail of c.details || []) if (detail.type === 'towerLight') near.towers.push(detail);
    }
    if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
      for (const d of c.doors) near.doors.push(d);
      for (const s of c.secrets) near.secrets.push(s);
      if (c.links) near.links.push(...c.links);
      if (c.controls) near.controls.push(...c.controls.filter((v) => !E || !inEaten(E, v.x, v.z)));
      if (c.hazards) near.hazards.push(...c.hazards);
    }
  }
  for (const k of chunks.keys()) if (!wanted.has(k)) {
    unmountCameraWords(k); interiorLook?.unmount(k); chunks.delete(k);
  }
  vegLayer.commit(); glowStatic = glowLayer.n; glowLayer.commit();
  for (const name in layers) { const L = layers[name]; L.mesh.count = L.n; L.mesh.instanceMatrix.needsUpdate = true; }
}

function pushOutBox(pos, x0, z0, x1, z1, PR) {
  const nx = Math.max(x0, Math.min(pos.x, x1)), nz = Math.max(z0, Math.min(pos.z, z1));
  const ex = pos.x - nx, ez = pos.z - nz, d2 = ex * ex + ez * ez;
  if (d2 >= PR * PR) return;
  if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (PR - d) / d; pos.x += ex * k; pos.z += ez * k; return; }
  const l = pos.x - x0, r = x1 - pos.x, t = pos.z - z0, b = z1 - pos.z, m = Math.min(l, r, t, b);   // inside: leave by the nearest face
  if (m === l) pos.x = x0 - PR; else if (m === r) pos.x = x1 + PR; else if (m === t) pos.z = z0 - PR; else pos.z = z1 + PR;
}
function collide(pos, PR = 0.3, creature = false) {
  const cx = Math.floor(pos.x / CFG.chunk), cz = Math.floor(pos.z / CFG.chunk), D = MAP.door;
  if (!creature) for (let i = 0; i < extraCircles.length; i += 3) {
    const ex = pos.x - extraCircles[i], ez = pos.z - extraCircles[i + 1], min = extraCircles[i + 2] + PR, d2 = ex * ex + ez * ez;
    if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2), push = (min - d) / d; pos.x += ex * push; pos.z += ez * push; }
  }
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const c = chunks.get(key(cx + dx, cz + dz)); if (!c) continue;
    const E = eaten.get(key(cx + dx, cz + dz));
    for (let i = 0; i < c.col.length; i += 3) {
      if (E && inEaten(E, c.col[i], c.col[i + 1])) continue;
      const ex = pos.x - c.col[i], ez = pos.z - c.col[i + 1], min = c.col[i + 2] + PR;
      const d2 = ex * ex + ez * ez;
      if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2), push = (min - d) / d; pos.x += ex * push; pos.z += ez * push; }
    }
    for (let i = 0; i < c.aabb.length; i += 4) if (!E || !inEaten(E, (c.aabb[i] + c.aabb[i + 2]) / 2, (c.aabb[i + 1] + c.aabb[i + 3]) / 2)) pushOutBox(pos, c.aabb[i], c.aabb[i + 1], c.aabb[i + 2], c.aabb[i + 3], PR);
    for (const d of c.doors) {
      if (!doorIsClosed(d, opened) || (E && inEaten(E, d.x, d.z))) continue;
      pushOutBox(pos, ...doorBounds(d, D), PR);
    }
  }
  if (MAP.grid) {       // cave walls; while swimming, the banks hold you in too
    const G = MAP.grid, ci = G.cellOf(pos.x), cj = G.cellOf(pos.z);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = ci + di, j = cj + dj;
      if (creature ? !cellWalkable(i, j) : swim.in ? G.cellType(i, j, opened) !== LIQUID : G.solidCell(i, j, opened)) pushOutBox(pos, G.lo(i), G.lo(j), G.lo(i + 1), G.lo(j + 1), PR);
    }
  }
}

// ───────────────────────── what a creature can know about the map ─────────────────────────
// Chunk data for anywhere, not just the loaded area (generation is deterministic, so this is a cache).
const farChunks = new Map();
function chunkData(cx, cz) {
  const k = key(cx, cz);
  let c = chunks.get(k) || farChunks.get(k);
  if (!c) { if (farChunks.size > 300) farChunks.clear(); c = MAP.generateChunk(cx, cz); farChunks.set(k, c); }
  return c;
}
function cellWalkable(i, j) {
  const G = MAP.grid, t = G.cellType(i, j);
  return t === FLOOR || (t === SECRET && opened.has(G.secretId(i, j)));
}
function forChunksNear(x0, z0, x1, z1, fn) {
  const S = CFG.chunk;
  for (let cx = Math.floor(Math.min(x0, x1) / S); cx <= Math.floor(Math.max(x0, x1) / S); cx++)
    for (let cz = Math.floor(Math.min(z0, z1) / S); cz <= Math.floor(Math.max(z0, z1) / S); cz++) fn(chunkData(cx, cz));
}
const creatureWorld = {
  kind: MAP_NAME, facility: MAP.facility, grid: MAP.grid,
  exposure(x, z) {
    if (MAP_NAME === 'serverfarm' && (MAP.zoneAt(x, z) === 'cableHatch' ||
        !flashlight.equipped && !facilityLight)) return 0.30;
    if (MAP_NAME === 'offshore' && EXPOSED_ZONES.includes(MAP.zoneAt(x, z))) return 1 - (facilityView?.whiteout ?? 0) * 0.72;
    if (MAP_NAME === 'taxidermy' && facilityView?.peek) return 0.42;
    return 1;
  }, groundY: MAP.groundY, roofY: MAP.roofY, canStep: MAP.canStep && ((i, j, a, b) => MAP.canStep(i, j, a, b, opened)), ceiling: META.ceiling || 0,
  cellWalkable, solidCell: (i, j) => MAP.grid.solidCell(i, j, opened),
  collide: (pos, r) => collide(pos, r, true),
  losBlocked(x0, z0, x1, z1, includeDoors = false) {
    if (MAP.grid || MAP_NAME === 'forest' || MAP_NAME === 'swamp') return MAP.blocked(x0, z0, x1, z1, opened);
    let hit = false;                                         // house walls
    if (MAP_NAME === 'rural') forChunksNear(x0, z0, x1, z1, (c) => {
      for (let i = 0; i < c.aabb.length && !hit; i += 4) if (segmentHits(x0, z0, x1, z1, c.aabb[i], c.aabb[i + 1], c.aabb[i + 2], c.aabb[i + 3])) hit = true;
      if (!includeDoors || hit) return;
      const { W, T } = MAP.door;
      hit = c.doors.some((door) => {
        if (opened.has(door.id)) return false;
        const halfX = (door.along === 'x' ? W : T) / 2, halfZ = (door.along === 'x' ? T : W) / 2;
        return segmentHits(x0, z0, x1, z1, door.x - halfX, door.z - halfZ, door.x + halfX, door.z + halfZ);
      });
    });
    return hit;
  },
  walkable(x, z, r) {
    if (MAP.grid) {
      const G = MAP.grid, i = G.cellOf(x), j = G.cellOf(z);
      if (!cellWalkable(i, j)) return false;
      const lx = x - G.lo(i), lz = z - G.lo(j);
      if ((lx < r && !cellWalkable(i - 1, j)) || (lx > G.CELL - r && !cellWalkable(i + 1, j)) || (lz < r && !cellWalkable(i, j - 1)) || (lz > G.CELL - r && !cellWalkable(i, j + 1))) return false;
    }
    let ok = true;
    forChunksNear(x - 1.5, z - 1.5, x + 1.5, z + 1.5, (c) => {
      for (let i = 0; i < c.col.length && ok; i += 3) if ((x - c.col[i]) ** 2 + (z - c.col[i + 1]) ** 2 < (c.col[i + 2] + r) ** 2) ok = false;
      for (let i = 0; i < c.aabb.length && ok; i += 4) if (x > c.aabb[i] - r && x < c.aabb[i + 2] + r && z > c.aabb[i + 1] - r && z < c.aabb[i + 3] + r) ok = false;
      if (ok) for (const d of c.doors) {
        if (!doorIsClosed(d, opened)) continue;
        const [x0, z0, x1, z1] = doorBounds(d, MAP.door);
        if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) { ok = false; break; }
      }
    });
    return ok;
  },
  clearLine(x0, z0, x1, z1, r) {
    if (MAP.interior && MAP.blocked(x0, z0, x1, z1, opened)) return false;
    const G = MAP.grid, d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 0.5)), px = -(z1 - z0) / (d || 1) * r, pz = (x1 - x0) / (d || 1) * r;
    let height = MAP.groundY(x0, z0);
    for (let k = 0; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
      if (!cellWalkable(G.cellOf(x), G.cellOf(z)) || !cellWalkable(G.cellOf(x + px), G.cellOf(z + pz)) || !cellWalkable(G.cellOf(x - px), G.cellOf(z - pz))) return false;
      if (MAP.interior) {
        const next = MAP.groundY(x, z);
        if (Math.abs(next - height) > 0.6) return false;
        height = next;
      }
    }
    return true;
  },
  // a trunk, wall or rock between the player and (x, z)?
  cover(x, z, px, pz) {
    if (creatureWorld.losBlocked(px, pz, x, z)) return true;
    const L = Math.hypot(x - px, z - pz) || 1, ux = (x - px) / L, uz = (z - pz) / L;
    let hit = false;
    forChunksNear(x - 1.6, z - 1.6, x + 1.6, z + 1.6, (c) => {
      for (let i = 0; i < c.col.length && !hit; i += 3) {
        if (c.col[i + 2] < 0.25) continue;
        const cx = c.col[i] - px, cz = c.col[i + 1] - pz, t = cx * ux + cz * uz;
        if (t > L - 1.6 && t < L && Math.abs(cx * uz - cz * ux) < c.col[i + 2] + 0.35) hit = true;
      }
    });
    return hit;
  },
  // how much grass and low clutter stands within r of (x, z)
  clutter(x, z, r) {
    let n = 0;
    forChunksNear(x - r, z - r, x + r, z + r, (c) => {
      for (let i = 0; i < c.props.length; i += 7) if (c.props[i + 3] < 2.4 && (c.props[i] - x) ** 2 + (c.props[i + 1] - z) ** 2 < r * r) n += c.props[i + 3];
    });
    return n;
  },
  // standing trees near (x, z): [x, z, height, trunk radius]
  trees(x, z, radius) {
    const out = [];
    forChunksNear(x - radius, z - radius, x + radius, z + radius, (c) => {
      for (let i = 0; i < c.props.length; i += 7) {
        const h = c.props[i + 3], tx = c.props[i], tz = c.props[i + 1];
        if (h < 3.4 || (tx - x) ** 2 + (tz - z) ** 2 > radius * radius) continue;
        for (let k = 0; k < c.col.length; k += 3) if (c.col[k] === tx && c.col[k + 1] === tz) { out.push([tx, tz, h, c.col[k + 2]]); break; }
      }
    });
    return out;
  },
};

// ───────────────────────── input ─────────────────────────
const keys = {};
const overlay = document.getElementById('overlay');
let yaw = 0, pitch = 0, playing = false, finished = false, started = false;
// Phones and tablets only. A mouse-driven desktop never takes this path.
const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;

// Title-screen loop. Stops once the night actually begins (not on the pause screen).
const INTRO_SONG_VOLUME = 0.5;
const introSong = new Audio(new URL('../music/Midnight Creaks.mp3', import.meta.url));
introSong.loop = true;
introSong.volume = INTRO_SONG_VOLUME;
let introSongFading = false;
let introSongNeedsGesture = !arrival;

function playIntroSong() {
  if (started || finished) return;
  introSongFading = false;
  introSong.volume = INTRO_SONG_VOLUME;
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  introSong.play().then(() => { introSongNeedsGesture = false; }).catch(() => {});
}
function stopIntroSong() {
  if (introSong.paused || introSongFading) return;
  introSongFading = true;
  const from = introSong.volume;
  const t0 = performance.now();
  const step = (now) => {
    if (!introSongFading) return;
    const t = Math.min(1, (now - t0) / 1400);
    introSong.volume = from * (1 - t);
    if (t < 1) requestAnimationFrame(step);
    else {
      introSong.pause();
      introSong.currentTime = 0;
      introSong.volume = INTRO_SONG_VOLUME;
      introSongFading = false;
    }
  };
  requestAnimationFrame(step);
}

// Game audio. Footsteps cut on and off with movement. The outdoor night loop
// stays up until a different ambience clip is configured to take its place.
const audioCtx = new AudioContext();
const mix = createCinematicMix(audioCtx);
audioCtx.createMediaElementSource(introSong).connect(mix.music);
const footstepGain = audioCtx.createGain();
footstepGain.gain.value = 0.55;
footstepGain.connect(mix.foley);
const AMBIENCE_VOLUME = 0.35;
const AMBIENCE_MOVING = 0.22;
const ambienceGain = audioCtx.createGain();
ambienceGain.gain.value = AMBIENCE_VOLUME;
// Everything that belongs to the open air (night ambience, rain, thunder, wind) leaves through one bus,
// so stepping indoors can muffle all of it at once.
const outdoorFilter = audioCtx.createBiquadFilter();
outdoorFilter.type = 'lowpass';
outdoorFilter.frequency.value = 18000;
const outdoorGain = audioCtx.createGain();
outdoorFilter.connect(outdoorGain).connect(mix.ambience);
const eerieGain = audioCtx.createGain();
eerieGain.gain.value = META.eerie ?? 0;
eerieGain.connect(outdoorFilter);
ambienceGain.connect(eerieGain);
// Recorded weather sits on its own gain. Rain and the mountain go through the outdoor bus,
// so a house can muffle them. The cave and hell loops are the air of those maps.
const weatherOutdoor = ['rural', 'snow', 'school', 'glasshouse', 'offshore'].includes(MAP_NAME) || forestStorm;
const WEATHER_LEVEL = forestStorm ? 0.36 : ({
  rural: 0.36, school: 0.48, swamp: 0.32, snow: 0.52, cave: 0.55, hell: 0.5,
  glasshouse: 0.32, offshore: 0.34, cathedral: 0.24,
}[MAP_NAME] || 0);
const weatherGain = audioCtx.createGain();
weatherGain.gain.value = 0;
if (weatherOutdoor) weatherGain.connect(outdoorFilter);

async function loadClip(file, dir = '../sound_effects/') {
  const url = new URL(dir + encodeURIComponent(file), import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('missing audio: ' + file);
  return audioCtx.decodeAudioData(await res.arrayBuffer());
}
const [walkBuffer, runBuffer, outsideAmbience, switchBuffer, idleBreath, walkBreath, runBreath, candleBuffer, gunshotBuffer, ghostChaseBuffer, ghostShotBuffer, ghostGoneBuffer, reloadBuffer, clockBuffer, dyingBuffer, singBuffer, boneBuffer, radarBuffer] = await Promise.all([
  loadClip('footsteps_in_grass.mp3'),
  loadClip('footsteps_running_in_#4-1794535151787.mp3'),
  loadClip('eerie_night_time_for_#4-1794535463202.mp3'),
  loadClip('immediate_flashlight_#1-1794541663066.mp3'),
  loadClip('soft_slow_shaky_brea_#1-1794542525684.mp3'),
  loadClip('slow_breathing_pace_#2-1794542370652.mp3', '../'),
  loadClip('heavy_breathing_movi_#2-1794542291155.mp3'),
  loadClip('lit_candle_#4-1794545652511.mp3'),
  loadClip('pistol_gunshot_1.mp3'),
  loadClip('ghost_chasing_player.mp3', '../sound_effects/monsters/ghost/'),
  loadClip('ghost_getting_shot_1.mp3', '../sound_effects/monsters/ghost/'),
  loadClip('ghost_disppearing_#1-1794546133326.mp3', '../sound_effects/monsters/ghost/'),
  loadClip('quick_pistol_reload_#1-1794547613496.mp3'),
  loadClip('haunting_clock_ticks_#3-1794547878289.mp3'),
  loadClip('dying_sound_choking__#1-1794548072534.mp3', '../'),
  loadClip('kids_eerily_singing__#4-1794548776803.mp3'),
  loadClip('bones_crackle_moveme_#4-1794596756264.mp3'),
  loadClip('radar_sound_#3-1794597997638.mp3'),
]);
// The Observer's jump scares. Optional: if a file is missing the synthesised sounds play instead.
const [obsScreechBuffer, obsShriekBuffer] = await Promise.all(['obs_screech.mp3', 'obs_shriek.mp3'].map((f) => loadClip(f).catch(() => null)));
const OBS_CLIPS = { screech: obsScreechBuffer, shriek: obsShriekBuffer };
// Plain clip player for one-shots and simple loops. Returns a handle for stopClip.
function playClip(buffer, volume = 1, loop = false, destination = mix.cues) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
  src.buffer = buffer; src.loop = loop; gain.gain.value = volume;
  src.connect(gain).connect(destination);
  src.addEventListener('ended', () => { src.disconnect(); gain.disconnect(); }, { once: true });
  src.start();
  return { src, gain };
}
function stopClip(h, fade = 0) {
  if (!h) return;
  const t = audioCtx.currentTime;
  h.gain.gain.cancelScheduledValues(t);
  h.gain.gain.setValueAtTime(h.gain.gain.value, t);
  h.gain.gain.linearRampToValueAtTime(0, t + fade);
  try { h.src.stop(t + fade + 0.02); } catch (e) { /* already stopped */ }
}
// The Collective's whispers: one loud whisper once they are close, a quieter one if the light is still on after 10 seconds, and the last one when they come.
const [collectiveLoud, collectiveWhisper, collectiveHug] = await Promise.all([
  'loud_toddler_girl_whisper_#2-1794592825608.mp3',
  'whisper_toddler_girl_whisper_#1-1794592868288.mp3',
  'HUGtoddler_girl_whisper_#4-1794593109545.mp3',
].map((file) => loadClip(file, '../sound_effects/kids/')));
const collectiveThank = await loadClip('thank_you_toddler_girl_saying__#4-1794671332348.mp3');
const collectiveStop = await loadClip('stop-moving_toddler.mp3');
const collectiveWalk = await loadClip('toddler_girl_saying__#3-1794671590205.mp3');
const collectiveHome = await loadClip('GO HOME toddler_girl_saying__#1-1794671460847.mp3');
const kidClips = await Promise.all([
  'scary_kids_giggling_#1-1794542970900.mp3',
  'scary_kids_giggling_#2-1794542970900.mp3',
  'scary_kids_giggling_#3-1794542971366.mp3',
  'scary_kids_giggling_#4-1794542979890.mp3',
].map((file) => loadClip(file, '../sound_effects/kids/')));
const drinkBuffer = await loadClip('drinking_potion,_gul_#3-1794631930380.mp3');
const videoCamBuffer = await loadClip('ongoing_old_video_ca_#4-1794932489169.mp3');
const unseenScreech = await loadClip('monster_screech_#2-1794944610437.mp3');
const ghostWhisperBuffer = await loadClip('ghosts_whispers_#4-1795065466158.mp3');
const [consumerStomp, consumerEat, consumerYell] = await Promise.all([
  loadClip('loud_monster_stomps_#4-1795065087990.mp3'),
  loadClip('loud_monster_eating__#2-1795065119684.mp3'),
  loadClip('loud_monster_yell_so_#4-1795065139776.mp3'),
]);
const collectiveStepsBuffer = await loadClip('group_footsteps_movi_#2-1794932719907.mp3');
const [snowWalkBuffer, snowRunBuffer] = MAP_NAME === 'snow' ? await Promise.all([
  loadClip('Walking_in_snow_#1-1794670709006.mp3'),
  loadClip('Running_in_snow_#3-1794670755314.mp3'),
]) : [null, null];
const [puddleWalkBuffer, puddleRunBuffer] = MAP_NAME === 'rural' ? await Promise.all([
  loadClip('walking_in_puddle_#1-1794670894197.mp3'),
  loadClip('running_in_puddle_#4-1794670938292.mp3'),
]) : [null, null];
const [concreteWalkBuffer, concreteRunBuffer] = await Promise.all([
  loadClip('Walking_on_concrete_#4-1794964157151.mp3'),
  loadClip('running_on_concrete_#4-1794964174778.mp3'),
]);
const ambienceClips = { outside: outsideAmbience };
// The Woods keeps the night loop and adds this bed for the whole time the player is on the map.
const woodBuffer = MAP_NAME === 'forest' ? await loadClip('AMBForst-Dark_cursed_forest_a-Elevenlabs.mp3') : null;
const WOOD_LEVEL = 0.7;
const woodGain = audioCtx.createGain();
woodGain.gain.value = 0;
woodGain.connect(ambienceGain);
// The Labyrinth's own music, looping with the rest of the ambience while you are in the maze.
const labBuffer = MAP_NAME === 'labyrinth' ? await loadClip('labyrinth.mp3', '../music/') : null;
const LAB_LEVEL = 0.85;
const labGain = audioCtx.createGain();
labGain.gain.value = 0;
labGain.connect(ambienceGain);
// From round 2 on, one of these loops under the round. A new round draws the next song.
// Long Quiet Tail still comes up when you run; the rest stay quiet.
const ROUND_PLAYLIST = [
  { file: 'Long Quiet Tail.mp3', swell: true },
  { file: 'Lingering Quiet.mp3' },
  { file: 'Empty Playground.mp3' },
  { file: 'Cavernous Silence (1).mp3' },
  { file: 'Someones Standing in Your.mp3' },
];
const ROUND_LOW = 0.22;
const ROUND_RUN = 0.55;
const roundSongBuffers = await Promise.all(ROUND_PLAYLIST.map((song) => loadClip(song.file, '../music/')));
const roundBus = audioCtx.createGain();
roundBus.connect(mix.music);
function shuffledPlaylist() {
  const order = roundSongBuffers.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
let playlistOrder = shuffledPlaylist(), playlistAt = 0;
function nextRoundSong() {
  if (playlistAt >= playlistOrder.length) {
    const prev = playlistOrder[playlistOrder.length - 1];
    playlistOrder = shuffledPlaylist();
    if (playlistOrder[0] === prev) playlistOrder.push(playlistOrder.shift());
    playlistAt = 0;
  }
  return playlistOrder[playlistAt++];
}
const WEATHER_DIR = '../weather sounds/';
const RAIN_FILES = ['heavy_rain_and_thund_#3-1794584535804.mp3', 'heavy_rain_and_thund_#2-1794584537360.mp3'];
const weatherFiles = forestStorm ? RAIN_FILES : ({
  rural: RAIN_FILES,
  school: RAIN_FILES,
  glasshouse: RAIN_FILES,
  offshore: ['snow_mountain.mp3'],
  cathedral: ['Echoing_drips_and_di_#1-1794586326205.mp3'],
  swamp: ['Echoing_drips_and_di_#1-1794586326205.mp3'],
  snow: ['snow_mountain.mp3'],
  cave: ['Echoing_drips_and_di_#1-1794586326205.mp3'],
  hell: ['cavernous_hellscape__#2-1794586923139.mp3'],
}[MAP_NAME] || []);
const weatherBuffers = await Promise.all(weatherFiles.map((file) => loadClip(file, WEATHER_DIR)));
const cryBuffers = MAP_NAME === 'hell' ? await Promise.all([
  'Distant,_echoing_cri_#1-1794586746832.mp3',
  'Distant,_echoing_cri_#1-1794586787810.mp3',
  'Distant,_echoing_cri_#4-1794586760786.mp3',
].map((file) => loadClip(file))) : [];

const switchGain = audioCtx.createGain();
switchGain.gain.value = 0.55;
switchGain.connect(mix.foley);
let switchSrc = null;

function playSwitchSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (switchSrc) {
    try { switchSrc.stop(); } catch (e) { /* already stopped */ }
    switchSrc.disconnect();
    switchSrc = null;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = switchBuffer;
  src.connect(switchGain);
  src.start();
  switchSrc = src;
  src.onended = () => { if (switchSrc === src) switchSrc = null; };
}

let stepSource = null;
let stepMode = null;

// Paved floors: rural streets, and the hospitals, buildings, and halls. Carpet and standing water stay soft.
const SOFT_FLOOR = new Set(['flood', 'saltChannel', 'brinePool']);
function onConcrete(x, z) {
  if (MAP.interior) {
    const zone = MAP.zoneAt(x, z);
    if (SOFT_FLOOR.has(zone)) return false;
    if (MAP_NAME === 'backrooms' && !['utility', 'archive'].includes(zone)) return false;
    return true;
  }
  if (MAP_NAME !== 'rural' || indoors) return false;
  const block = 64, half = 3.5;
  const along = (v) => { const m = v - Math.floor(v / block) * block; return Math.min(m, block - m); };
  return along(x) <= half || along(z) <= half;
}
function footstepSurface(x, z) {
  if (onConcrete(x, z)) return 'concrete';
  return MAP.interior || MAP.footingAt ? 'terrain' : '';
}
function stepClip(mode, hard) {
  if (mode === 'run') return hard ? concreteRunBuffer : snowRunBuffer || puddleRunBuffer || runBuffer;
  if (mode === 'walk') return hard ? concreteWalkBuffer : snowWalkBuffer || puddleWalkBuffer || walkBuffer;
  return null;
}
function syncFootsteps(mode, surface = '') {
  const key = mode ? `${mode}:${surface}` : null;
  if (key === stepMode) return;
  if (stepSource) {
    stepSource.stop();
    stepSource.disconnect();
    stepSource = null;
  }
  stepMode = key;
  const buffer = stepClip(mode, surface === 'concrete');
  if (!buffer) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(footstepGain);
  src.start();
  stepSource = src;
}

let ambienceSource = null;
let ambienceId = null;

function syncAmbience(id) {
  if (id === ambienceId) return;
  const buffer = id == null ? null : ambienceClips[id];
  if (id != null && !buffer) return;
  if (ambienceSource) {
    ambienceSource.stop();
    ambienceSource.disconnect();
    ambienceSource = null;
  }
  ambienceId = id;
  if (!buffer) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(ambienceGain);
  src.start();
  ambienceSource = src;
}

let woodSource = null;
function syncWood(on) {
  if (!woodBuffer || on === !!woodSource) return;
  const t = audioCtx.currentTime;
  woodGain.gain.cancelScheduledValues(t);
  woodGain.gain.setValueAtTime(woodGain.gain.value, t);
  if (!on) {
    woodGain.gain.linearRampToValueAtTime(0, t + 0.5);
    try { woodSource.stop(t + 0.55); } catch (e) { /* already stopped */ }
    woodSource = null;
    return;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const src = audioCtx.createBufferSource();
  src.buffer = woodBuffer;
  src.loop = true;
  src.connect(woodGain);
  src.start();
  woodSource = src;
  woodGain.gain.linearRampToValueAtTime(WOOD_LEVEL, t + 1.4);
}

let labSource = null;
function syncLabyrinth(on) {
  if (!labBuffer || on === !!labSource) return;
  const t = audioCtx.currentTime;
  labGain.gain.cancelScheduledValues(t);
  labGain.gain.setValueAtTime(labGain.gain.value, t);
  if (!on) {
    labGain.gain.linearRampToValueAtTime(0, t + 0.5);
    try { labSource.stop(t + 0.55); } catch (e) { /* already stopped */ }
    labSource = null;
    return;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const src = audioCtx.createBufferSource();
  src.buffer = labBuffer;
  src.loop = true;
  src.connect(labGain);
  src.start();
  labSource = src;
  labGain.gain.linearRampToValueAtTime(LAB_LEVEL, t + 1.4);
}

let roundMusic = null;
function fadeRoundMusic(music, fade = 0.6) {
  if (!music) return;
  const t = audioCtx.currentTime;
  music.gain.gain.cancelScheduledValues(t);
  music.gain.gain.setValueAtTime(music.gain.gain.value, t);
  music.gain.gain.linearRampToValueAtTime(0, t + fade);
  try { music.src.stop(t + fade + 0.05); } catch (e) { /* already stopped */ }
}
function syncRoundMusic(on, roundN, running) {
  if (!roundSongBuffers.length) return;
  if (!on) {
    fadeRoundMusic(roundMusic);
    roundMusic = null;
    return;
  }
  if (!roundMusic || roundMusic.round !== roundN) {
    fadeRoundMusic(roundMusic, 0.45);
    const index = nextRoundSong();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    gain.connect(roundBus);
    const src = audioCtx.createBufferSource();
    src.buffer = roundSongBuffers[index];
    src.loop = true;
    src.connect(gain);
    src.start();
    const t = audioCtx.currentTime;
    gain.gain.linearRampToValueAtTime(ROUND_LOW, t + 1.4);
    roundMusic = { src, gain, index, round: roundN, run: false };
  }
  const wantRun = !!(ROUND_PLAYLIST[roundMusic.index].swell && running);
  if (wantRun === roundMusic.run) return;
  roundMusic.run = wantRun;
  const t = audioCtx.currentTime;
  roundMusic.gain.gain.cancelScheduledValues(t);
  roundMusic.gain.gain.setValueAtTime(roundMusic.gain.gain.value, t);
  roundMusic.gain.gain.linearRampToValueAtTime(wantRun ? ROUND_RUN : ROUND_LOW, t + (roundMusic.gain.gain.value < 0.02 ? 1.4 : 0.45));
}

let weatherOn = false;
const weatherVoices = [];
function syncWeather(on) {
  if (!weatherBuffers.length || on === weatherOn) return;
  weatherOn = on;
  const t = audioCtx.currentTime;
  weatherGain.gain.cancelScheduledValues(t);
  weatherGain.gain.setValueAtTime(weatherGain.gain.value, t);
  if (!on) {
    weatherGain.gain.linearRampToValueAtTime(0, t + 0.5);
    for (const src of weatherVoices) { try { src.stop(t + 0.55); } catch (e) { /* already stopped */ } }
    weatherVoices.length = 0;
    return;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  for (const [i, buffer] of weatherBuffers.entries()) {
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const pan = audioCtx.createStereoPanner(), trim = audioCtx.createGain();
    pan.pan.value = weatherBuffers.length > 1 ? (i % 2 === 0 ? -0.24 : 0.24) : 0;
    trim.gain.value = 1 / Math.sqrt(weatherBuffers.length);
    src.connect(pan).connect(trim).connect(weatherGain);
    src.addEventListener('ended', () => { src.disconnect(); pan.disconnect(); trim.disconnect(); }, { once: true });
    src.start(t, i * 0.27 % buffer.duration);
    weatherVoices.push(src);
  }
  weatherGain.gain.linearRampToValueAtTime(WEATHER_LEVEL, t + (weatherOutdoor ? 1.4 : 0.05));
}

let ambienceDucked = false;
function duckAmbience(moving) {
  if (moving === ambienceDucked) return;
  ambienceDucked = moving;
  const t = audioCtx.currentTime;
  ambienceGain.gain.cancelScheduledValues(t);
  ambienceGain.gain.setValueAtTime(ambienceGain.gain.value, t);
  ambienceGain.gain.linearRampToValueAtTime(moving ? AMBIENCE_MOVING : AMBIENCE_VOLUME, t + 0.18);
}

// Breathing. Idle, walk, and run each loop; movement breaths fade out when that pace stops.
// A run picks the next heavy breath from a shuffled set, then loops it until the run ends.
// Holding breath muffles it and silences footsteps so they don't carry.
const runBreaths = [runBreath, ...await Promise.all(['hb2.mp3', 'hb3.mp3', 'hb4.mp3', 'hb5.mp3'].map((file) => loadClip(file)))];
const BREATH = { idle: 0.32, walk: 0.42, run: 0.5 };
const STEP_VOLUME = 0.55;
const breathFilter = audioCtx.createBiquadFilter();
breathFilter.type = 'lowpass';
breathFilter.frequency.value = 16000;
breathFilter.connect(mix.foley);

function loopBreath(buffer) {
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  gain.connect(breathFilter);
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(gain);
  src.start();
  return gain;
}
const idleGain = loopBreath(idleBreath);
const walkGain = loopBreath(walkBreath);
const runGain = audioCtx.createGain();
runGain.gain.value = 0;
runGain.connect(breathFilter);
let runSource = null;
let runFading = null;
let runOrder = [];
let runLast = -1;
function pickRunBreath() {
  if (!runOrder.length) {
    runOrder = runBreaths.map((_, i) => i);
    for (let i = runOrder.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [runOrder[i], runOrder[j]] = [runOrder[j], runOrder[i]];
    }
    if (runOrder.length > 1 && runOrder[runOrder.length - 1] === runLast) {
      const swap = (Math.random() * (runOrder.length - 1)) | 0;
      [runOrder[swap], runOrder[runOrder.length - 1]] = [runOrder[runOrder.length - 1], runOrder[swap]];
    }
  }
  runLast = runOrder.pop();
  return runBreaths[runLast];
}
function stopRunSource(src) {
  if (!src) return;
  try { src.stop(); } catch (e) { /* already stopped */ }
  src.disconnect();
}
function startRunBreath() {
  stopRunSource(runSource);
  stopRunSource(runFading);
  runSource = null;
  runFading = null;
  const src = audioCtx.createBufferSource();
  src.buffer = pickRunBreath();
  src.loop = true;
  src.connect(runGain);
  src.start();
  runSource = src;
}
let bodyAudio = '';
let holdingBreath = false;
let breathBlocked = false;
const STAMINA_BASE = 1, STAMINA_PEAK = 3, STAMINA_GROW = 0.25, STAMINA_BAR = 148;
let staminaMax = STAMINA_BASE;
let stamina = STAMINA_BASE;
let needRecover = false;
let holdTime = 0;
let zoomFov = 70;
const SANITY_MAX = 100;
const SANITY_LOOK = 16; // per second while the flashlight beam is on a ghost or the Observer
const SANITY_LOOK_COLLECTIVE = 3.5; // the Collective wears at the mind much more slowly
const SANITY_BREATH = 2.4; // holding Space while still restores the mind
const SANITY_BREATH_SHELTER = 3.2; // indoors with a held breath is faster
const SANITY_BREATH_COLLECTIVE = 5.0; // holding Space while still brings it back, even with them close
const SANITY_EMPTY = 45; // seconds at zero before the night ends (holding breath can still fill it)
const SANITY_BURN = 6; // per second while an Observer body is on fire
const SANITY_BURN_DONE = 14; // when that body is ash
const SANITY_HALLUCINATION = 28; // a shot into something that was never there
const sanity = { value: SANITY_MAX, warned: false, empty: 0, drained: false };

function rampParam(param, value, seconds) {
  const t = audioCtx.currentTime;
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(value, t + seconds);
}
function syncBodyAudio(pace, holding) {
  const id = (pace || 'off') + (holding ? '/hold' : '');
  if (id === bodyAudio) return;
  const startingRun = pace === 'run' && !bodyAudio.startsWith('run');
  bodyAudio = id;
  const muff = holding ? 0.6 : 1;
  rampParam(idleGain.gain, pace === 'idle' ? BREATH.idle * muff : 0, 0.5);
  rampParam(walkGain.gain, pace === 'walk' ? BREATH.walk * muff : 0, 0.5);
  if (startingRun) startRunBreath();
  rampParam(runGain.gain, pace === 'run' ? BREATH.run * muff : 0, 0.5);
  if (pace !== 'run' && runSource) {
    runFading = runSource;
    runSource = null;
    try { runFading.stop(audioCtx.currentTime + 0.55); } catch (e) { /* already stopped */ }
  }
  rampParam(breathFilter.frequency, holding ? 420 : 16000, 0.2);
  rampParam(footstepGain.gain, holding ? 0 : STEP_VOLUME, 0.18);
}

// Distant kids. One giggle every 30–60s, loud or quiet, sometimes off to one side.
function softImpulse(seconds, decay) {
  const rate = audioCtx.sampleRate;
  const len = Math.floor(rate * seconds);
  const impulse = audioCtx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return impulse;
}
const kidsBus = audioCtx.createGain();
const kidsDry = audioCtx.createGain();
kidsDry.gain.value = 0.85;
kidsBus.connect(kidsDry).connect(mix.creatures);
const kidsDelay = audioCtx.createDelay(1);
kidsDelay.delayTime.value = 0.23;
const kidsDelayFilter = audioCtx.createBiquadFilter();
kidsDelayFilter.type = 'lowpass';
kidsDelayFilter.frequency.value = 2400;
const kidsDelayGain = audioCtx.createGain();
kidsDelayGain.gain.value = 0.3;
const kidsFeedback = audioCtx.createGain();
kidsFeedback.gain.value = 0.26;
kidsBus.connect(kidsDelay).connect(kidsDelayFilter);
kidsDelayFilter.connect(kidsDelayGain).connect(mix.ambience);
kidsDelayFilter.connect(kidsFeedback).connect(kidsDelay);
const kidsReverb = audioCtx.createConvolver();
kidsReverb.buffer = softImpulse(1.5, 3.4);
const kidsReverbGain = audioCtx.createGain();
kidsReverbGain.gain.value = 0.42;
kidsBus.connect(kidsReverb).connect(kidsReverbGain).connect(mix.ambience);
const kids = { next: 30 + Math.random() * 30, last: null };

function playKid() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const index = (Math.random() * kidClips.length) | 0;
  const src = audioCtx.createBufferSource();
  src.buffer = kidClips[index];
  const gain = audioCtx.createGain();
  const closeness = Math.random();
  gain.gain.value = 0.08 + closeness * closeness * 0.62;
  const pan = audioCtx.createStereoPanner();
  const roll = Math.random();
  pan.pan.value = roll < 0.33 ? -(0.4 + Math.random() * 0.6) : roll < 0.66 ? 0.4 + Math.random() * 0.6 : (Math.random() * 2 - 1) * 0.18;
  src.connect(gain).connect(pan).connect(kidsBus);
  src.start();
  kids.last = { index, volume: gain.gain.value, pan: pan.pan.value };
}
function tickKids(dt, active) {
  if (!active) return;
  kids.next -= dt;
  if (kids.next > 0) return;
  playKid();
  kids.next = 30 + Math.random() * 30;
}

// ───────────────────────── opening cutscene ─────────────────────────
// Wake on the ground, click the flashlight on, blink, stand, look left and right, then hand over control.
// Each track is [time, value] keyframes, eased between. Skip with ?nointro in the URL.
const INTRO = {
  length: 8.2,
  clickAt: 1.0,                                                          // flashlight switches on
  fade:  [[0, 1], [0.6, 1], [3.2, 0]],                                   // black overlay opacity
  lids:  [[0, 0], [0.7, 0], [1.3, 0.5], [1.7, 0.4], [1.85, 0], [2.05, 0], [2.5, 1],
          [3.6, 1], [3.72, 0], [3.8, 0], [4.0, 1], [5.6, 1], [5.7, 0], [5.78, 0], [5.95, 1]],  // 0 shut .. 1 open
  y:     [[0, -1.3], [2.2, -1.3], [3.2, -0.75], [3.5, -0.72], [4.6, 0]], // eye height offset: ground, knees, standing
  pitch: [[0, -0.55], [2.0, -0.55], [3.2, -0.3], [4.6, 0]],
  roll:  [[0, 0.3], [2.2, 0.3], [3.3, -0.06], [4.6, 0]],
  yaw:   [[0, 0], [4.8, 0], [5.6, 0.75], [6.0, 0.75], [7.0, -0.75], [7.4, -0.75], [8.1, 0]],   // left, then right
};
function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      const k = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * k * k * (3 - 2 * k);
    }
  }
  return keys[keys.length - 1][1];
}
const intro = { active: !SKIP_INTRO, t: 0, clicked: false };
const cut = { y: 0, pitch: 0, yaw: 0, roll: 0, light: 1 };
const fadeEl = document.getElementById('fade'), lidTop = document.getElementById('lidTop'), lidBot = document.getElementById('lidBot');
const hudEl = document.getElementById('hud');
const staminaEl = document.getElementById('stamina');
const staminaFill = document.getElementById('staminaFill');
const sanityEl = document.getElementById('sanity');
const sanityFill = document.getElementById('sanityFill');
const sanityStateEl = document.getElementById('sanityState');
const sanityHazeEl = document.getElementById('sanityHaze');
const sanityVisionEl = document.getElementById('sanityVision');

function applyIntro() {
  const t = intro.t;
  cut.y = track(INTRO.y, t); cut.pitch = track(INTRO.pitch, t);
  cut.roll = track(INTRO.roll, t); cut.yaw = track(INTRO.yaw, t);
  // the bulb catches twice before it holds
  const c = t - INTRO.clickAt;
  cut.light = c < 0 ? 0 : (c > 0.10 && c < 0.22) || (c > 0.30 && c < 0.37) ? 0.06 : 1;
  fadeEl.style.opacity = track(INTRO.fade, t);
  const shut = (1 - track(INTRO.lids, t)) * 52;
  lidTop.style.height = lidBot.style.height = shut + 'vh';
  lidTop.style.display = lidBot.style.display = shut > 0.01 ? 'block' : 'none';
}
function updateIntro(dt) {
  if (!intro.singing) intro.singing = playClip(singBuffer, 0.75);
  intro.t += dt;
  if (!intro.clicked && intro.t >= INTRO.clickAt) {
    intro.clicked = true;
    flashlight.equipped = true;
    playSwitchSound();
  }
  if (intro.t >= INTRO.length) {
    intro.active = false; intro.t = INTRO.length;
    stopClip(intro.singing, 1.2);
    hudEl.style.visibility = 'visible';
  }
  applyIntro();
}
if (intro.active) { hudEl.style.visibility = 'hidden'; applyIntro(); }

// ───────────────────────── items: chests, battery, matches, gun ─────────────────────────
// Chest positions and tiers are deterministic per seed. The first chest before the pistol is found guarantees it.
// GUN is the gun in hand right now: the pistol to begin with, rebuilt tier by tier (see gear/upgrades.js). reload matches the 2 s reload clip.
const GUN = { ...GUN_TIERS[0] };
const BULLET_RANGE = 90;
// parts are spent at the workbench (C). gunTier, lightTier and radarTier count the upgrades fitted so far.
const inv = { gun: false, mag: 0, reserve: 0, batteries: 0, matches: CFG.startMatches, potions: CFG.startPotions, health: 100, maxHealth: 100, innocents: 0,
              parts: 0, grenades: 0, launcher: false, gunTier: 0, lightTier: 0, radarTier: 0, kitGiven: false };
const CAMERA_LIGHT_TIER = LIGHT_TIERS.findIndex((tier) => tier.camera);
const hasCameraUpgrade = () => CAMERA_LIGHT_TIER >= 0 && inv.lightTier >= CAMERA_LIGHT_TIER;
const videoCameraOn = () => hasCameraUpgrade() && flashlight.equipped && flashlight.battery > 0.01 && facilityView?.drop?.id !== 'flashlight';
const radarWorks = () => inv.radarTier >= 1 || isObserverRound() || isChoirRound();
const ITEM_DEFS = {
  knife: { name: 'Knife', icon: './assets/items/combat_knife.png', kind: 'weapon', damage: 1, reach: 1.9, cooldown: 0.48, noise: 0.28 },
  sword: { name: 'Worn Sword', icon: './assets/items/longsword.png', kind: 'weapon', damage: 2, reach: 2.55, cooldown: 0.78, noise: 0.52, maxDurability: 18, color: 0xc5b9a6 },
  sword_iron: { name: 'Tempered Sword', icon: './assets/items/longsword.png', kind: 'weapon', damage: 3, reach: 2.65, cooldown: 0.82, noise: 0.56, maxDurability: 30, color: 0xb4d4dc },
  sword_hive: { name: 'Choir Cleaver', icon: './assets/items/longsword.png', kind: 'weapon', damage: 4, reach: 2.75, cooldown: 0.92, noise: 0.62, maxDurability: 22, color: 0xe18e85 },
  armor: { name: 'Bone armor', icon: './assets/items/spiked_chestplate.png', kind: 'armor', reduction: 0.2 },
  stamina_tonic: { name: 'Stamina tonic', icon: './assets/items/potion.png', kind: 'consumable' },
  stamina_surge: { name: 'Wind charm', icon: './assets/items/wind_icon.png', kind: 'consumable' },
  swift_boots: { name: 'Swift boots', icon: './assets/items/jetpack.png', kind: 'passive' },
  stamina_charm: { name: 'Skull ring', icon: './assets/items/skull_ring.png', kind: 'passive' },
  steady_charm: { name: 'Steady ring', icon: './assets/items/skull_ring.png', kind: 'passive' },
};
const bag = { capacity: 6, maxCapacity: 9, items: [], counts: {}, durability: {}, selected: 0, activeWeapon: 'gun', armorId: null, staminaUntil: 0 };
function inventorySlots() {
  const slots = [];
  if (inv.gun) slots.push({ id: 'pistol', label: GUN.name, icon: GUN.icon, kind: 'weapon', active: bag.activeWeapon === 'gun' });
  if (inv.gun && inv.mag + inv.reserve > 0) slots.push({ id: 'ammo', label: `Ammo ${inv.mag + inv.reserve}`, icon: './assets/items/bullet.png', kind: 'ammo' });
  if (inv.batteries > 0) slots.push({ id: 'battery', label: `Battery ×${inv.batteries}`, icon: './assets/items/battery.png', kind: 'battery' });
  if (inv.matches > 0) slots.push({ id: 'matches', label: `Matches ×${inv.matches}`, icon: './assets/items/match.png', kind: 'matches' });
  if (inv.potions > 0) slots.push({ id: 'potion', label: `Potion ×${inv.potions}`, icon: './assets/items/potion.png', kind: 'potion' });
  if (inv.grenades > 0) slots.push({ id: 'grenade', label: `Grenade ×${inv.grenades}`, icon: SPRITES.grenade.url, kind: 'grenade' });
  if (radar.acquired) slots.push({ id: 'radar', label: 'Radar', icon: './assets/items/radar.png', kind: 'radar' });
  for (const id of bag.items) {
    const item = ITEM_DEFS[id];
    if (item) {
      const durability = item.maxDurability ? ` ${bag.durability[id] ?? item.maxDurability}/${item.maxDurability}` : '';
      slots.push({ id, label: `${bag.counts[id] > 1 ? `${item.name} ×${bag.counts[id]}` : item.name}${durability}`, icon: item.icon, kind: item.kind, active: bag.activeWeapon === id || bag.armorId === id });
    }
  }
  return slots;
}
function bagHasRoom(id) {
  return inventorySlots().some((slot) => slot.id === id) || inventorySlots().length < bag.capacity;
}
function addBagItem(id) {
  if (!ITEM_DEFS[id] || !bagHasRoom(id)) return false;
  if (bag.items.includes(id)) {
    if (ITEM_DEFS[id].kind !== 'consumable') return false;
    bag.counts[id] = (bag.counts[id] || 1) + 1;
    return true;
  }
  bag.items.push(id);
  bag.counts[id] = 1;
  if (ITEM_DEFS[id].maxDurability) bag.durability[id] = ITEM_DEFS[id].maxDurability;
  return true;
}
function consumeBagItem(id) {
  bag.counts[id] = Math.max(0, (bag.counts[id] || 1) - 1);
  if (!bag.counts[id]) {
    delete bag.counts[id];
    const at = bag.items.indexOf(id);
    if (at >= 0) bag.items.splice(at, 1);
  }
}
function freeBagSlotsFor(ids) {
  const occupied = new Set(inventorySlots().map((slot) => slot.id));
  const needed = new Set(ids.filter((id) => !occupied.has(id)));
  return Math.max(0, bag.capacity - inventorySlots().length) >= needed.size;
}
function bagBonuses() {
  return {
    runSpeed: bag.items.includes('swift_boots') ? 1.07 : 1,
    noiseScale: (bag.items.includes('swift_boots') ? 1.08 : 1) * (bag.items.includes('stamina_charm') ? 0.86 : 1),
    meleeDamage: bag.items.includes('steady_charm') ? 1.12 : 1,
  };
}
const radar = { acquired: false, equipped: false, beepIn: 0, drawIn: 0, map: document.createElement('canvas') };
radar.map.width = 192; radar.map.height = 224;
const radarCtx = radar.map.getContext('2d');
const radarTexture = new THREE.CanvasTexture(radar.map);
radarTexture.colorSpace = THREE.SRGBColorSpace;
const radarMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.44),
  new THREE.MeshBasicMaterial({ map: radarTexture, alphaTest: 0.5, depthTest: false, fog: false, toneMapped: false, side: THREE.DoubleSide }));
radarMesh.renderOrder = 1000; radarMesh.layers.set(1); radarMesh.visible = false;
camera.add(radarMesh);
function useInventorySlot(index) {
  const slots = inventorySlots(), slot = slots[index];
  if (!slot) { toast('That inventory slot is empty'); return; }
  bag.selected = index;
  if (slot.id === 'pistol') { bag.activeWeapon = 'gun'; radar.equipped = false; gun.aiming = false; toast(`${GUN.name} equipped`); }
  else if (slot.id === 'radar') {
    if (!radarWorks()) { toast('The radar only catches signals during Observer or Choir rounds. A tracker upgrade (C) works in all of them'); return; }
    if (flashlight.battery <= 0) { toast('Radar battery dead. B to swap in a spare'); return; }
    radar.equipped = !radar.equipped; gun.aiming = false; playSwitchSound();
  }
  else if (slot.kind === 'weapon') { bag.activeWeapon = slot.id; radar.equipped = false; gun.aiming = false; toast(`${ITEM_DEFS[slot.id].name} equipped`); }
  else if (slot.kind === 'armor') { bag.armorId = slot.id; toast(`${ITEM_DEFS[slot.id].name} equipped`); }
  else if (slot.kind === 'battery') swapBattery();
  else if (slot.kind === 'ammo') startReload();
  else if (slot.kind === 'matches') strikeMatch();
  else if (slot.kind === 'potion') drinkPotion();
  else if (slot.kind === 'grenade') throwGrenade();
  else if (slot.id === 'stamina_tonic') {
    const cap = staminaMax * (bag.items.includes('stamina_charm') ? 1.18 : 1);
    if (stamina >= cap * 0.95) { toast('Stamina is already full'); return; }
    stamina = Math.min(cap, stamina + cap * 0.45); consumeBagItem(slot.id); toast('The tonic steadies your legs');
  }
  else if (slot.id === 'stamina_surge') {
    bag.staminaUntil = Math.max(bag.staminaUntil, uTime.value + 14);
    stamina = staminaMax * (bag.items.includes('stamina_charm') ? 1.18 : 1); needRecover = false;
    consumeBagItem(slot.id); toast('Wind fills your lungs. Stamina will not drain for 14 seconds');
  }
  else if (slot.id === 'stamina_charm') toast('Skull ring active: more stamina, quieter movement');
  else if (slot.id === 'swift_boots') toast('Swift boots active: faster sprint, louder steps');
  else if (slot.id === 'steady_charm') toast('Steady ring active: melee hits deal a little more damage');
}
function dropInventorySlot(index = bag.selected) {
  const slots = inventorySlots(), slot = slots[index];
  if (!slot) return;
  bag.selected = index;
  if (slot.id === 'pistol') { toast('Keep the pistol. You may need it.'); return; }
  if (slot.id === 'radar') { toast('The radar is bound to your pack'); return; }
  if (slot.id === 'ammo') { inv.mag = 0; inv.reserve = 0; }
  else if (slot.id === 'battery') inv.batteries = 0;
  else if (slot.id === 'matches') inv.matches = 0;
  else if (slot.id === 'potion') inv.potions = 0;
  else if (slot.id === 'grenade') inv.grenades = 0;
  else {
    const at = bag.items.indexOf(slot.id);
    if (at < 0) return;
    if (bag.counts[slot.id] > 1) bag.counts[slot.id]--;
    else { bag.items.splice(at, 1); delete bag.counts[slot.id]; delete bag.durability[slot.id]; }
    if (bag.activeWeapon === slot.id) bag.activeWeapon = inv.gun ? 'gun' : 'none';
    if (bag.armorId === slot.id) bag.armorId = bag.items.find((id) => ITEM_DEFS[id]?.kind === 'armor') || null;
  }
  bag.selected = Math.max(0, Math.min(bag.selected, inventorySlots().length - 1));
  toast(`Dropped ${slot.label}`);
}
const lootRng = mulberry(CFG.seed ^ 0x51ed);
const gun = { raise: 0, recoil: 0, reloadT: -1, loaded: false, cooldown: 0, flash: 0, aiming: false, ads: 0, trigger: false, burst: 0 };
const match = { t: 0 };
const swordSwing = { t: 1, duration: 0.36 };
let handSide = 1;          // flashlight hand: 1 right, -1 left (when a right-hand weapon is equipped)
let nearChest = null;
held.material.side = THREE.DoubleSide;

function handSprite(url, size, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: pixelTex(url), color, alphaTest: 0.5, depthTest: false, fog: false, toneMapped: false, side: THREE.DoubleSide }));
  m.renderOrder = 999; m.layers.set(1); m.visible = false;
  camera.add(m);
  return m;
}
const gunMesh = handSprite('./assets/items/pistol.png', 0.36, 0x8a8a8a);
const pistolTex = gunMesh.material.map;
// Make the gun in hand match inv.gunTier: its figures, its picture, its size.
function fitGun() {
  Object.assign(GUN, GUN_TIERS[inv.gunTier]);
  gunMesh.material.map = GUN.sprite ? SPRITES[GUN.sprite].tex : pistolTex; gunMesh.material.needsUpdate = true;
  gunMesh.scale.setScalar(GUN.scale);
}
const knifeMesh = handSprite('./assets/items/combat_knife.png', 0.42, 0xffffff);
const swordMesh = handSprite('./assets/items/longsword.png', 0.48, 0xffffff);
const matchMesh = handSprite('./assets/items/match_lit.png', 0.26, 0xffffff);
// Both lights always exist at zero intensity, so striking or firing never recompiles shaders.
const matchLight = new THREE.PointLight(0xff9a3c, 0, CFG.match.distance, 1.6);
const muzzle = new THREE.PointLight(0xffc27a, 0, 30, 1.4);
muzzle.position.set(0.3, -0.15, -0.9);
camera.add(matchLight, muzzle);

// A lit match keeps the candle crackling until the flame goes out. Each shot is the pistol clip.
const candleGain = audioCtx.createGain();
candleGain.gain.value = 0.4;
candleGain.connect(mix.foley);
const gunshotGain = audioCtx.createGain();
gunshotGain.gain.value = 0.85;
gunshotGain.connect(mix.impacts);
let candleSrc = null;
let videoCamLoop = null;

function syncCandle(lit) {
  if (lit === !!candleSrc) return;
  if (candleSrc) {
    try { candleSrc.stop(); } catch (e) { /* already stopped */ }
    candleSrc.disconnect();
    candleSrc = null;
  }
  if (!lit) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const src = audioCtx.createBufferSource();
  src.buffer = candleBuffer;
  src.loop = true;
  src.connect(candleGain);
  src.start();
  candleSrc = src;
}
function syncVideoCamera(on) {
  if (on === !!videoCamLoop) return;
  if (videoCamLoop) { stopClip(videoCamLoop, 0.12); videoCamLoop = null; return; }
  videoCamLoop = playClip(videoCamBuffer, 0.42, true);
}
function playGunshot() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const src = audioCtx.createBufferSource();
  src.buffer = gunshotBuffer;
  // every bullet is the same clip: a rapid gun plays it again for each one, a touch off-pitch so the burst is not a buzz
  src.playbackRate.value = GUN.pitch * (GUN.auto ? 0.96 + Math.random() * 0.08 : 1);
  const level = audioCtx.createGain(); level.gain.value = GUN.vol;
  src.connect(level).connect(gunshotGain);
  src.addEventListener('ended', () => { src.disconnect(); level.disconnect(); }, { once: true });
  mix.accent(GUN.auto ? 0.58 : 0.85);
  src.start();
}

// Synthesised effects for the cues that have no clip.
const sfxGain = audioCtx.createGain();
sfxGain.gain.value = 0.7;
sfxGain.connect(mix.cues);
const noiseBuffer = (() => {
  const b = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.5, audioCtx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
})();
function noise1(dur, type, f0, f1, vol, destination = sfxGain) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const t = audioCtx.currentTime, src = audioCtx.createBufferSource(), filt = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
  src.buffer = noiseBuffer; filt.type = type;
  filt.frequency.setValueAtTime(f0, t); filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt).connect(g).connect(destination);
  src.start(t); src.stop(t + dur);
}
function thump(f0, f1, dur, vol, destination = sfxGain) {
  const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(destination); o.start(t); o.stop(t + dur);
}
const sfx = {
  shot()   { playGunshot(); },
  swing()  { thump(240, 75, 0.13, 0.34); },
  click()  { noise1(0.04, 'highpass', 2600, 2000, 0.35); },
  strike() { noise1(0.38, 'bandpass', 2200, 4200, 0.3); },
  chest()  { thump(170, 80, 0.16, 0.5); noise1(0.12, 'lowpass', 900, 300, 0.4); },
  shieldHit() { thump(300, 140, 0.12, 0.45); noise1(0.1, 'highpass', 2600, 1400, 0.3); },
  shieldBreak() { thump(240, 60, 0.35, 0.7); noise1(0.45, 'bandpass', 3000, 600, 0.6); },
  upgrade() { thump(420, 620, 0.12, 0.35); noise1(0.08, 'highpass', 3000, 5200, 0.25); setTimeout(() => thump(620, 880, 0.16, 0.3), 110); },
  boom()   { thump(95, 26, 1.0, 1.6); noise1(0.9, 'lowpass', 1400, 70, 1.5); noise1(0.25, 'bandpass', 2600, 500, 0.8); },
  drink()  { playClip(drinkBuffer, 0.85); },
};

// HUD
const $ = (id) => document.getElementById(id);
const ui = { shieldRow: $('shieldRow'), shieldFill: $('shieldFill'), shieldIcon: $('shieldIcon'), status: $('status'), battFill: $('battFill'), batt: $('batt'), spare: $('spare'), matches: $('matches'), potions: $('potions'), parts: $('parts'), reticle: $('reticle'),
             ammo: $('ammo'), ammoText: $('ammoText'), prompt: $('prompt'), toast: $('toast'), inventory: $('inventoryPanel'), inventoryMeta: $('inventoryMeta'), inventorySlots: $('inventorySlots') };
let toastTimer = 0;
function useWords(text) {
  if (!TOUCH || text == null) return text;
  return String(text)
    .replace(/\[Hold E\]\s*/g, 'Press and hold to ')
    .replace(/\[E\]\s*/g, 'Press and hold to ')
    .replace(/press E to/gi, 'press and hold to')
    .replace(/\bHold E\b/g, 'Press and hold')
    .replace(/Press and hold to ([A-Z])/g, (_, c) => 'Press and hold to ' + c.toLowerCase())
    .replace(/Select a slot and press X to make room/g, 'Tap an item, then swipe up and tap Drop, to make room')
    .replace(/Q or its inventory slot to drink/g, 'Tap it to drink')
    .replace(/G or its inventory slot swaps it with your weapon/g, 'Tap it to swap it with your weapon')
    .replace(/Select its inventory slot when you want to equip it/g, 'Tap it when you want to equip it')
    .replace(/Select its slot to equip/g, 'Tap it to equip')
    .replace(/Select its slot to restore stamina/g, 'Tap it to restore stamina')
    .replace(/Select its inventory slot to equip it/g, 'Tap it to equip it')
    .replace(/B to swap in a spare/g, 'Tap the battery to swap in a spare')
    .replace(/B to replace it/g, 'Tap the battery to replace it')
    .replace(/B to swap it in/g, 'Tap it to swap it in')
    .replace(/M to strike a match/g, 'Tap the matches to strike one')
    .replace(/Hold Space to quiet your breath/g, 'Hold the breath button to quiet your breath')
    .replace(/Hold Space while still/g, 'Hold the breath button while still')
    .replace(/\bHold Space\b/g, 'Hold the breath button')
    .replace(/\bhold Space\b/g, 'hold the breath button')
    .replace(/Press F again/g, 'Tap the light again')
    .replace(/Click to shoot, right mouse to aim, R to reload/g, 'Tap to shoot, hold to aim, tap the ammo to reload')
    .replace(/C opens the workbench/g, 'Swipe two fingers down for the workbench')
    .replace(/the workbench \(C\)/g, 'the workbench')
    .replace(/T or its inventory slot to throw/g, 'Sweep two fingers sideways to throw')
    .replace(/T to throw/g, 'Sweep two fingers sideways to throw')
    .replace(/Hold the trigger to keep firing/g, 'Tap for a burst. Tap, then hold, to keep firing')
    .replace(/T to fire/g, 'Sweep two fingers sideways to fire')
    .replace(/A tracker upgrade \(C\)/g, 'A tracker upgrade')
    .replace(/G raises it/g, 'Tap it to raise it')
    .replace(/G to raise it/g, 'Tap it to raise it');
}
function toast(text) { ui.toast.textContent = useWords(text); ui.toast.style.opacity = 1; toastTimer = 3; }
function setText(el, text) { if (el.textContent !== text) el.textContent = text; }
let inventoryHudSignature = '';
let inventoryDrag = null;
function inventoryPointerOutside(x, y) {
  const bounds = ui.inventory.getBoundingClientRect();
  return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
}
function moveInventoryDrag(x, y) {
  if (!inventoryDrag) return;
  inventoryDrag.ghost.style.left = `${x}px`;
  inventoryDrag.ghost.style.top = `${y}px`;
  inventoryDrag.ghost.classList.toggle('outside', inventoryPointerOutside(x, y));
}
function endInventoryDrag(x, y, cancel = false) {
  const drag = inventoryDrag;
  if (!drag) return;
  inventoryDrag = null;
  drag.ghost.remove();
  if (!cancel && inventoryPointerOutside(x, y)) dropInventorySlot(drag.index);
  else bag.selected = drag.index;
  inventoryHudSignature = '';
}
function renderInventoryHud(inControl) {
  const show = (inControl || (!TOUCH && started && !playing && !finished && !intro.active)) && !journal.isOpen && !bench.isOpen && !picker.isOpen && !helpOpen;
  ui.inventory.hidden = !show;
  if (!show) {
    if (inventoryDrag) endInventoryDrag(inventoryDrag.x, inventoryDrag.y, true);
    return;
  }
  const slots = inventorySlots();
  bag.selected = Math.max(0, Math.min(bag.selected, Math.max(0, bag.capacity - 1)));
  const weaponDef = ITEM_DEFS[bag.activeWeapon];
  const weapon = bag.activeWeapon === 'gun' ? GUN.name : weaponDef ? `${weaponDef.name}${weaponDef.maxDurability ? ` ${bag.durability[bag.activeWeapon] ?? weaponDef.maxDurability}/${weaponDef.maxDurability}` : ''}` : 'None';
  const worn = armor.tier ? ARMOR_TIERS[armor.tier].name : 'None';
  const surge = bag.staminaUntil > uTime.value ? ` · WIND ${Math.ceil(bag.staminaUntil - uTime.value)}s` : '';
  const signature = `${bag.capacity}|${bag.selected}|${weapon}|${worn}|${slots.map((slot) => `${slot.id}:${slot.label}:${slot.active ? 1 : 0}`).join('|')}`;
  setText(ui.inventoryMeta, `PACK ${slots.length}/${bag.capacity} · WEP ${weapon} · ARM ${worn}${surge}`);
  if (inventoryDrag || signature === inventoryHudSignature) return;
  inventoryHudSignature = signature;
  ui.inventorySlots.replaceChildren();
  for (let i = 0; i < bag.capacity; i++) {
    const slot = slots[i], cell = document.createElement('div');
    cell.className = `inventory-slot${slot ? '' : ' empty'}${i === bag.selected ? ' selected' : ''}${slot?.active ? ' active' : ''}`;
    const keyLabel = document.createElement('b'); keyLabel.textContent = String(i + 1); cell.append(keyLabel);
    if (slot) {
      const img = document.createElement('img'); img.src = slot.icon; img.alt = ''; img.draggable = false;
      const label = document.createElement('span'); label.textContent = slot.label;
      cell.title = `${i + 1}: ${slot.label}`; cell.append(img, label);
      if (!TOUCH) cell.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || inventoryDrag) return;
        e.preventDefault();
        e.stopPropagation();
        const ghost = document.createElement('div');
        ghost.id = 'inventoryDrag';
        const icon = document.createElement('img'); icon.src = slot.icon; icon.alt = '';
        ghost.append(icon);
        document.body.append(ghost);
        inventoryDrag = { index: i, ghost, x: e.clientX, y: e.clientY };
        bag.selected = i;
        moveInventoryDrag(e.clientX, e.clientY);
        cell.setPointerCapture(e.pointerId);
        const move = (ev) => { if (!inventoryDrag) return; inventoryDrag.x = ev.clientX; inventoryDrag.y = ev.clientY; moveInventoryDrag(ev.clientX, ev.clientY); };
        const up = (ev) => {
          cell.removeEventListener('pointermove', move);
          cell.removeEventListener('pointerup', up);
          cell.removeEventListener('pointercancel', up);
          endInventoryDrag(ev.clientX, ev.clientY);
        };
        cell.addEventListener('pointermove', move);
        cell.addEventListener('pointerup', up);
        cell.addEventListener('pointercancel', up);
      });
      cell.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    } else {
      const label = document.createElement('span'); label.textContent = 'empty'; cell.append(label);
    }
    if (TOUCH && slot) cell.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      useInventorySlot(i);
    });
    ui.inventorySlots.append(cell);
  }
}

// Battery: the lower it runs, the more often the beam stutters and the dimmer it gets.
function flickerGap(u) {
  const k = Math.min(1, flashlight.battery / 0.5);
  return 0.7 + 7.3 * k + u * (1.2 + 8.8 * k);
}
function batteryDim() { return flashlight.battery >= 0.25 ? 1 : 0.3 + 0.7 * (flashlight.battery / 0.25); }

function onFlashlightToggle() {
  if (!flashlight.equipped) {
    if (isCollectiveRound() && collective.active) collective.speak(collectiveThank, 1);
    return;
  }
  match.t = 0;
  if (flashlight.battery > 0) maybeScare();
  if (flashlight.battery <= 0) toast(inv.batteries > 0 ? 'Battery dead. B to swap in a spare' : 'Battery dead. M to strike a match');
}
function swapBattery() {
  if (inv.batteries <= 0) { toast('No spare batteries'); return; }
  if (flashlight.battery > 0.98) { toast('Battery is still full'); return; }
  inv.batteries--; flashlight.battery = 1;
  playSwitchSound();
  toast('Battery replaced');
}
function drawRadarMap() {
  const g = radarCtx, w = radar.map.width, h = radar.map.height;
  let displayRange = RADAR_TIERS[inv.radarTier].range;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#201d19'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#726d58'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = '#26352b'; g.fillRect(12, 25, w - 24, h - 38);
  g.fillStyle = '#b9b3a3'; g.font = 'bold 13px monospace'; g.textAlign = 'center'; g.fillText(isChoirRound() ? 'CHOIR LISTENER' : isObserverRound() ? 'BODY RADAR' : RADAR_TIERS[inv.radarTier].name.toUpperCase(), w / 2, 17);
  const cx = w / 2, cy = 126, radius = 74, range = RADAR_TIERS[inv.radarTier].range;
  g.save(); g.beginPath(); g.rect(12, 25, w - 24, h - 38); g.clip();
  if (facilityView?.compass > 0) {
    g.translate(cx, cy);
    g.rotate(facilityView.compass * Math.sin(uTime.value * 4) * 1.7);
    g.translate(-cx, -cy);
  }
  g.strokeStyle = 'rgba(130,190,135,.35)'; g.lineWidth = 1;
  for (const r of [radius / 3, radius * 2 / 3, radius]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(cx - radius, cy); g.lineTo(cx + radius, cy); g.moveTo(cx, cy - radius); g.lineTo(cx, cy + radius); g.stroke();
  const px = camera.position.x, pz = camera.position.z, hunt = obsRound.hunting, now = uTime.value;
  const choirMode = isChoirRound() && choir.active;
  if (choirMode) {
    const phase = (choir.t + (choir.round * 7.3) % 24) % 24;
    const jammed = phase < 4.5;
    // Holding breath quiets the Choir's sound hunting and lets the listener resolve more of its signal.
    const listening = holdingBreath ? THREE.MathUtils.clamp((holdTime - 1.5) / 3.5, 0, 1) : 0;
    const choirRange = range + listening * 24;
    displayRange = choirRange;
    const hive = choir.hive;
    const hiveDistance = hive ? Math.hypot(hive.x - px, hive.z - pz) : Infinity;
    const closeSignal = hiveDistance <= 18 + listening * 26;
    g.fillStyle = jammed ? '#e49b69' : closeSignal ? '#9ad7a4' : '#938c78';
    g.font = 'bold 9px monospace';
    g.fillText(jammed ? (listening > 0.45 ? 'VOICES THROUGH FEEDBACK' : 'FEEDBACK: VOICES') : listening > 0 ? 'BREATH LOCK: SIGNAL CLEARING' : closeSignal ? 'CORE SIGNAL NEAR' : 'SIGNAL SEEKING', w / 2, 37);
    const drawSinger = (s, opacity = 1) => {
      const dx = s.x - px, dz = s.z - pz, d = Math.hypot(dx, dz);
      const x = cx + THREE.MathUtils.clamp(dx / choirRange, -1, 1) * radius;
      const y = cy + THREE.MathUtils.clamp(dz / choirRange, -1, 1) * radius;
      const pulse = 0.5 + 0.5 * Math.sin(now * 7 + s.phase);
      g.fillStyle = `rgba(255,188,119,${opacity * (0.55 + pulse * 0.4)})`;
      g.beginPath(); g.arc(x, y, d > choirRange ? 2.5 : 4 + pulse, 0, Math.PI * 2); g.fill();
    };
    const drawHive = () => {
      const dx = hive.x - px, dz = hive.z - pz;
      const x = cx + THREE.MathUtils.clamp(dx / choirRange, -1, 1) * radius;
      const y = cy + THREE.MathUtils.clamp(dz / choirRange, -1, 1) * radius;
      const pulse = 0.5 + 0.5 * Math.sin(now * 5);
      g.fillStyle = choir.exposed ? '#ff655b' : '#d7e98f';
      g.beginPath(); g.arc(x, y, 4 + pulse * 2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `rgba(215,233,143,${(jammed ? 0.4 : 0.7) * (1 - pulse)})`; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, 7 + pulse * 8, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#d7e98f'; g.font = '8px monospace'; g.fillText(`${Math.round(hiveDistance)}m`, x, y - 9);
    };
    if (jammed) {
      // During feedback the core disappears; the listener locks onto the bodies bound to it.
      for (const singer of choir.singers) {
        if (!singer.alive) continue;
        drawSinger(singer);
      }
      for (let i = 0; i < 85; i++) {
        g.fillStyle = `rgba(216,169,117,${0.08 + Math.random() * 0.2})`;
        g.fillRect(12 + Math.random() * (w - 24), 42 + Math.random() * (h - 55), 2, 2);
      }
      if (Math.random() < 0.5) {
        g.fillStyle = 'rgba(222,156,110,.14)';
        g.fillRect(12, 48 + Math.random() * (h - 60), w - 24, 3 + Math.random() * 7);
      }
      // A long, held breath can cut a faint Hive echo through the static when it is close enough.
      if (closeSignal && listening > 0.45 && Math.random() < listening) drawHive();
    } else if (closeSignal && hive) {
      if (listening > 0) {
        const contacts = choir.singers.filter((s) => s.alive)
          .map((s) => ({ s, d: Math.hypot(s.x - px, s.z - pz) }))
          .sort((a, b) => a.d - b.d);
        const count = Math.max(1, Math.ceil(contacts.length * listening));
        for (const contact of contacts.slice(0, count)) drawSinger(contact.s, 0.3 + listening * 0.7);
      }
      drawHive();
    } else {
      // At range the instrument only gives a hunting sweep, so it guides without giving away the nest.
      const sweep = now * 1.3;
      g.strokeStyle = 'rgba(198,191,154,.26)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, radius, sweep - 0.34, sweep + 0.34); g.closePath(); g.stroke();
      if (listening > 0) {
        const contacts = choir.singers.filter((s) => s.alive)
          .map((s) => ({ s, d: Math.hypot(s.x - px, s.z - pz) }))
          .sort((a, b) => a.d - b.d);
        const count = Math.ceil(contacts.length * listening);
        for (const contact of contacts.slice(0, count)) drawSinger(contact.s, 0.3 + listening * 0.7);
      }
      g.fillStyle = 'rgba(201,194,160,.5)'; g.font = '8px monospace'; g.fillText(listening > 0 ? 'SINGER RETURNS' : 'NO FIX', cx, cy - radius - 5);
    }
  } else if (hunt) {                                    // while it hunts the radar is unreliable: static, tearing, dropouts
    for (let i = 0; i < 170; i++) { g.fillStyle = `rgba(${150 + Math.random() * 100 | 0},${190 + Math.random() * 60 | 0},150,${0.15 + Math.random() * 0.45})`; g.fillRect(12 + Math.random() * (w - 24), 25 + Math.random() * (h - 38), 2, 2); }
    if (Math.random() < 0.35) { g.fillStyle = 'rgba(190,230,190,.18)'; g.fillRect(12, 25 + Math.random() * (h - 50), w - 24, 3 + Math.random() * 8); }
  }
  if (!choirMode) for (const m of obsRound.radarMarks()) {
    if (m.kind === 'false' && Math.random() < 0.45) continue;       // the hunter shows as a body, flickering in and out
    if (hunt && m.kind !== 'false' && Math.random() < 0.3) continue;
    const jit = hunt ? 6 : 0;
    const dx = m.x - px + (Math.random() - 0.5) * jit, dz = m.z - pz + (Math.random() - 0.5) * jit, d = Math.hypot(dx, dz);
    const x = cx + THREE.MathUtils.clamp(dx / range, -1, 1) * radius;
    const y = cy + THREE.MathUtils.clamp(dz / range, -1, 1) * radius;
    if (m.kind === 'decoy') {                            // a faint blip, there and gone
      g.fillStyle = `rgba(255,101,91,${0.25 + Math.random() * 0.3})`;
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      continue;
    }
    if (m.kind === 'burning') { g.fillStyle = '#f3a64a'; g.beginPath(); g.arc(x, y, d > range ? 3 : 5, 0, Math.PI * 2); g.fill(); continue; }
    const pulse = 0.5 + 0.5 * Math.sin(now * 5 + m.x);  // real bodies (and whatever passes for one) pulse strongly
    g.fillStyle = '#ff655b';
    g.beginPath(); g.arc(x, y, (d > range ? 3 : 5) + pulse * 1.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(255,120,100,${0.6 * (1 - pulse)})`; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, 6 + pulse * 7, 0, Math.PI * 2); g.stroke();
  }
  const blip = (x0, z0) => { const dx = x0 - px, dz = z0 - pz; return Math.hypot(dx, dz) > range * 1.12 ? null : [cx + THREE.MathUtils.clamp(dx / range, -1, 1) * radius, cy + THREE.MathUtils.clamp(dz / range, -1, 1) * radius]; };
  if (inv.radarTier >= 2) for (const c of chunks.values()) {      // prospector: every chest still shut
    const ch = c.chest, at = ch && !opened.has(ch.id) && blip(ch.x, ch.z);
    if (!at) continue;
    // chests are teal diamonds, so they never read as an objective (reds, ambers, yellow-green) or a creature (round dots); the better the chest, the bigger
    const s = ch.tier === 'armory' ? 4.5 : ch.tier === 'red' || ch.tier === 'blue' ? 3.6 : 3;
    g.fillStyle = '#3fe0c0'; g.strokeStyle = '#0b2b26'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(at[0], at[1] - s); g.lineTo(at[0] + s, at[1]); g.lineTo(at[0], at[1] + s); g.lineTo(at[0] - s, at[1]); g.closePath(); g.fill(); g.stroke();
  }
  if (inv.radarTier >= 1 && !choirMode) {                         // tracker: whatever is moving
    const dot = (x0, z0, color, r) => { const at = blip(x0, z0); if (at) { g.fillStyle = color; g.beginPath(); g.arc(at[0], at[1], r, 0, Math.PI * 2); g.fill(); } };
    for (const gh of ghosts) if (gh.state !== 'die') dot(gh.x, gh.z, gh.brute ? '#e7a0ff' : '#bfe3ff', (gh.brute ? 4.5 : 3.2) + Math.sin(now * 6 + gh.phase));
    if (collective.active && ['appear', 'warning', 'dispersal', 'last'].includes(collective.phase)) for (const k of collective.kids) dot(k.x, k.z, '#f0e08a', 3);
    if (consumer.active) dot(consumer.x, consumer.z, '#ff8a5c', 6);
    if (slime.active) { dot(slime.x, slime.z, '#4f9bff', 5 + Math.min(6, slime.r * 0.5)); for (const l of slime.littles) dot(l.x, l.z, '#8fc2ff', 2.5); }
  }
  g.translate(cx, cy); g.rotate(-yaw);
  g.fillStyle = '#e5e1cc'; g.beginPath(); g.moveTo(0, -8); g.lineTo(-5, 6); g.lineTo(0, 3); g.lineTo(5, 6); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#a9bf9f'; g.font = '10px monospace'; g.fillText(`${Math.round(displayRange)} m`, w / 2, h - 8);
  radarTexture.needsUpdate = true;
}
function strikeMatch() {
  if (match.t > 0) return;
  if (inv.matches <= 0) { toast('No matches'); return; }
  inv.matches--; match.t = CFG.match.seconds;
  if (isChoirRound()) choir.noise(camera.position.x, camera.position.z, 0.58, 'match strike');
  if (isConsumerRound()) consumer.noise(camera.position.x, camera.position.z, 0.58, 'match strike');
  const lightWasOn = flashlight.equipped;
  if (flashlight.equipped && isCollectiveRound() && collective.encounter) toast('Match lit. Your flashlight is off.');
  flashlight.equipped = false;
  if (lightWasOn && isCollectiveRound() && collective.active) collective.speak(collectiveThank, 1);
  sfx.strike();
  maybeScare();
}
function drinkPotion() {
  if (inv.potions <= 0) { toast('No potions'); return; }
  const hurt = inv.health < inv.maxHealth;
  const mind = sanity.value < SANITY_MAX;
  if (!hurt && !mind) { toast("You're fine"); return; }
  inv.potions--;
  if (hurt) inv.health = Math.min(inv.maxHealth, inv.health + 50);
  if (mind) { sanity.value = SANITY_MAX; sanity.warned = false; sanity.empty = 0; sanity.drained = false; }
  sfx.drink();
  toast(mind && hurt ? 'The potion mends you and clears your mind' : mind ? 'The potion clears your mind' : 'Drank a potion');
}
function startReload() {
  if (!inv.gun || radar.equipped || bag.activeWeapon !== 'gun' || gun.reloadT >= 0 || inv.mag >= GUN.mag || facilityView?.drop?.id === 'gun') return;
  if (inv.reserve <= 0) { toast('No spare bullets'); return; }
  gun.reloadT = 0; gun.loaded = false;
  playClip(reloadBuffer, 0.8);
  if (isChoirRound()) choir.noise(camera.position.x, camera.position.z, 0.46, 'reload');
  if (isConsumerRound()) consumer.noise(camera.position.x, camera.position.z, 0.46, 'reload');
}
function shoot() {
  if (radar.equipped || swim.in || facilityView?.pinned > 0 || facilityView?.drop?.id === bag.activeWeapon) return;
  if (bag.activeWeapon !== 'gun') { meleeAttack(); return; }
  if (!inv.gun || gun.reloadT >= 0 || gun.cooldown > 0 || gun.raise < 0.9) return;
  gun.cooldown = GUN.cooldown;
  if (facilityView?.corrosion > 0.48 && Math.random() < facilityView.corrosion * 0.44) {
    gun.cooldown = 0.66;
    sfx.click();
    toast('Salt in the action. The gun jams.');
    return;
  }
  if (inv.mag <= 0) {
    sfx.click();
    if (isChoirRound()) choir.noise(camera.position.x, camera.position.z, 0.28, 'empty click');
    gun.trigger = false; gun.burst = 0;
    if (inv.reserve > 0) startReload(); else toast('Out of bullets');
    return;
  }
  inv.mag--; gun.recoil = 1; gun.flash = 0.07;
  pitch = Math.min(1.45, pitch + GUN.kick);
  if (GUN.auto) yaw += (Math.random() - 0.5) * GUN.kick * 1.5;       // a rapid gun walks about as it fires
  sfx.shot();
  if (MAP_NAME === 'serverfarm') { camera.getWorldDirection(aim); facility.smashOverride(camera.position, aim, 22, near.controls); }
  ghostHit(BULLET_RANGE, 0.3, GUN.damage);
  shootHallucination();
  if (obsRound.active) { camera.getWorldDirection(aim); obsRound.shot(camera.position, aim, BULLET_RANGE); }
  if (collective.active) { camera.getWorldDirection(aim); collective.shot(camera.position, aim, BULLET_RANGE); }
  if (choir.active) { camera.getWorldDirection(aim); choir.shot(camera.position, aim, { range: BULLET_RANGE, damage: GUN.damage }); }
  if (consumer.active) { camera.getWorldDirection(aim); consumer.shot(camera.position, aim, { range: BULLET_RANGE, damage: 3 * GUN.damage, noiseVolume: 1.25 }); }
  if (slime.active) { camera.getWorldDirection(aim); slime.shot(camera.position, aim, { range: BULLET_RANGE }); }
  if (unseen.active) { camera.getWorldDirection(aim); unseen.shot(camera.position, aim, { range: BULLET_RANGE, damage: GUN.damage }); }
  if (lightbound.active) { camera.getWorldDirection(aim); lightbound.shot(camera.position, aim, { range: BULLET_RANGE, damage: GUN.damage }); }
  if (specialRounds.active) { camera.getWorldDirection(aim); specialRounds.shot(camera.position, aim, { range: BULLET_RANGE, damage: GUN.damage }); }
}
function meleeAttack() {
  const item = ITEM_DEFS[bag.activeWeapon], bonuses = bagBonuses();
  if (!item || item.kind !== 'weapon' || gun.cooldown > 0 || swim.in) return;
  gun.cooldown = item.cooldown;
  if (item.maxDurability) swordSwing.t = 0;
  camera.getWorldDirection(aim);
  sfx.swing();
  if (MAP_NAME === 'serverfarm') facility.smashOverride(camera.position, aim, item.reach, near.controls);
  const damage = Math.max(1, Math.round(item.damage * bonuses.meleeDamage));
  ghostHit(item.reach, 0.9, damage);
  if (choir.active) choir.shot(camera.position, aim, { range: item.reach, melee: true, damage, noiseVolume: item.noise });
  if (collective.active) collective.shot(camera.position, aim);
  if (consumer.active) consumer.shot(camera.position, aim, { range: item.reach, melee: true, damage: damage * 2, noiseVolume: item.noise });
  if (slime.active) slime.shot(camera.position, aim, { range: item.reach, melee: true });
  if (unseen.active) unseen.shot(camera.position, aim, { range: item.reach, melee: true, damage });
  if (lightbound.active) lightbound.shot(camera.position, aim, { range: item.reach, melee: true, damage });
  if (specialRounds.active) specialRounds.shot(camera.position, aim, { range: item.reach, melee: true, damage });
  if (item.maxDurability) {
    const remaining = (bag.durability[bag.activeWeapon] ?? item.maxDurability) - 1;
    if (remaining <= 0) {
      const brokenId = bag.activeWeapon;
      bag.items = bag.items.filter((id) => id !== brokenId);
      delete bag.counts[brokenId]; delete bag.durability[brokenId];
      bag.activeWeapon = inv.gun ? 'gun' : 'none';
      toast(`${item.name} broke. It lasted ${item.maxDurability} strikes`);
    } else {
      bag.durability[bag.activeWeapon] = remaining;
      if (remaining === 3) toast(`${item.name} is wearing out: 3 strikes remain`);
    }
  }
}
const openedChests = [];
const chestLootRolls = new Map();
const CHEST_LOOT = {
  common: [['ammo', 22], ['battery', 20], ['matches', 18], ['potion', 10], ['stamina_tonic', 7], ['knife', 5], ['swift_boots', 4], ['stamina_charm', 3], ['steady_charm', 3], ['armor', 6], ['sword', 0.8], ['sword_iron', 0.22], ['sword_hive', 0.05], ['stamina_surge', 0.6], ['grenade', 3], ['gun_kit', 1.6], ['light_kit', 1.6], ['radar_kit', 1], ['launcher_kit', 0.3]],
  blue: [['pack_blue', 14], ['stamina_surge', 9], ['armor', 16], ['sword', 8], ['sword_iron', 3], ['sword_hive', 0.7], ['knife', 8], ['stamina_tonic', 12], ['swift_boots', 9], ['stamina_charm', 8], ['steady_charm', 6], ['battery', 5], ['ammo', 4], ['potion', 3], ['matches', 3], ['grenade', 8], ['gun_kit', 9], ['light_kit', 7], ['radar_kit', 5], ['launcher_kit', 2]],
  red: [['pack_red', 17], ['sword', 16], ['sword_iron', 8], ['sword_hive', 2], ['armor', 18], ['stamina_surge', 14], ['stamina_charm', 12], ['steady_charm', 9], ['swift_boots', 6], ['knife', 5], ['stamina_tonic', 5], ['battery', 4], ['ammo', 3], ['potion', 2], ['matches', 1], ['grenade', 10], ['gun_kit', 12], ['light_kit', 8], ['radar_kit', 6], ['launcher_kit', 5]],
  armory: [['sword', 24], ['sword_iron', 16], ['sword_hive', 5], ['armor', 28], ['knife', 20], ['stamina_surge', 9], ['stamina_tonic', 8], ['swift_boots', 5], ['stamina_charm', 4], ['steady_charm', 4], ['pack_blue', 2], ['grenade', 16], ['gun_kit', 22], ['launcher_kit', 10], ['light_kit', 4]],
};
function canReceiveLoot(id) {
  if (id === 'pack_blue' || id === 'pack_red') return bag.capacity < bag.maxCapacity;
  if (id === 'pistol') return !inv.gun && freeBagSlotsFor(['pistol', 'ammo']);
  if (id === 'radar') return !radar.acquired && bagHasRoom('radar');
  if (id === 'ammo') return inv.gun && bagHasRoom('ammo');
  if (id === 'battery') return bagHasRoom('battery');
  if (id === 'matches') return bagHasRoom('matches');
  if (id === 'potion') return bagHasRoom('potion');
  if (id === 'grenade') return bagHasRoom('grenade');
  if (id === 'armor') return true;                       // worn, not carried: it never needs a slot
  if (id === 'gun_kit') return inv.gun && inv.gunTier < GUN_TIERS.length - 1;
  if (id === 'light_kit') return inv.lightTier < CAMERA_LIGHT_TIER;
  if (id === 'radar_kit') return radar.acquired && inv.radarTier < RADAR_TIERS.length - 1;
  if (id === 'launcher_kit') return !inv.launcher;
  if (ITEM_DEFS[id]) return (ITEM_DEFS[id].kind === 'consumable' || !bag.items.includes(id)) && bagHasRoom(id);
  return false;
}
function rollChestLoot(tier) {
  const entries = (CHEST_LOOT[tier] || CHEST_LOOT.common).filter(([id]) => canReceiveLoot(id)).map(([id, weight]) => {
    if (id === 'ammo' && inv.mag + inv.reserve >= 30 * GUN.ammoScale) weight *= 0.3;
    if (id === 'grenade' && inv.grenades >= 3) weight *= 0.35;
    if (id === 'battery' && inv.batteries >= 3) weight *= 0.35;
    if (id === 'potion' && inv.potions >= 2) weight *= 0.35;
    return [id, weight];
  });
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!total) return null;
  let pick = lootRng() * total;
  for (const [id, weight] of entries) { pick -= weight; if (pick <= 0) return id; }
  return entries[entries.length - 1][0];
}
function grantChestLoot(id) {
  if (id === 'pack_blue' || id === 'pack_red') {
    const add = id === 'pack_blue' ? 2 : 3, before = bag.capacity;
    bag.capacity = Math.min(bag.maxCapacity, bag.capacity + add);
    if (bag.capacity === before) return false;
    toast(`${id === 'pack_blue' ? 'Blue' : 'Red'} field pack: inventory expanded to ${bag.capacity} slots`); return true;
  }
  if (id === 'pistol') {
    if (!canReceiveLoot(id)) return false;
    inv.gun = true; inv.mag = GUN.mag; inv.reserve = GUN.mag; bag.activeWeapon = 'gun';
    toast(`Found a pistol: ${GUN.mag} loaded, ${GUN.mag} spare. Click to shoot, right mouse to aim, R to reload`); return true;
  }
  if (id === 'radar') {
    if (!canReceiveLoot(id)) return false;
    radar.acquired = true; radar.equipped = true; bag.activeWeapon = 'gun'; gun.aiming = false;
    playSwitchSound(); toast(isChoirRound() ? 'Found a Choir listener. G or its inventory slot swaps it with your weapon' : 'Found a body radar. G or its inventory slot swaps it with your weapon'); return true;
  }
  if (id === 'ammo') { if (!canReceiveLoot(id)) return false; const n = Math.round((4 + ((lootRng() * 5) | 0)) * GUN.ammoScale); inv.reserve += n; toast(`Found ${n} bullets`); return true; }
  if (id === 'grenade') { if (!canReceiveLoot(id)) return false; const n = 1 + ((lootRng() * 2) | 0); inv.grenades += n; toast(`Found ${n > 1 ? `${n} grenades` : 'a grenade'}. T or its inventory slot to throw. Stand well back`); return true; }
  if (id === 'armor') { toast(wearArmor(rollArmorTier(round.n, lootRng))); return true; }
  if (id === 'gun_kit' || id === 'light_kit' || id === 'radar_kit' || id === 'launcher_kit') { const line = canReceiveLoot(id) && applyKit(id); if (!line) return false; toast(line); sfx.upgrade(); return true; }
  if (id === 'battery') { if (!canReceiveLoot(id)) return false; inv.batteries++; toast('Found a battery. B to swap it in'); return true; }
  if (id === 'matches') { if (!canReceiveLoot(id)) return false; inv.matches += 2 + ((lootRng() * 3) | 0); toast(`Found matches (${inv.matches} total)`); return true; }
  if (id === 'potion') { if (!canReceiveLoot(id)) return false; inv.potions++; toast('Found a potion. Q or its inventory slot to drink'); return true; }
  if (!canReceiveLoot(id) || !addBagItem(id)) return false;
  if (id === 'stamina_tonic') toast('Found a stamina tonic. Select its slot to restore stamina');
  else if (id === 'stamina_surge') toast('Found a wind charm. It grants 14 seconds of unlimited stamina');
  else if (id === 'swift_boots') toast('Found swift boots: sprint faster, but make more noise');
  else if (id === 'stamina_charm') toast('Found a skull ring: stamina capacity rises and movement grows quieter');
  else if (id === 'steady_charm') toast('Found a steady ring: melee weapons hit a little harder');
  else if (id === 'armor') toast('Found bone armor. Select its inventory slot when you want to equip it');
  else if (ITEM_DEFS[id].maxDurability) toast(`Found ${ITEM_DEFS[id].name}: damage ${ITEM_DEFS[id].damage}, durability ${ITEM_DEFS[id].maxDurability}. Select its slot to equip`);
  else toast(`Found a ${ITEM_DEFS[id].name}. Select its inventory slot to equip it`);
  return true;
}
// The Counterfeit: some real chests are copies. Which ones is decided the first time each is opened (about one in three,
// more in later rounds), never the first chest that hands out the pistol.
const falseChests = new Map();
function openChest(c) {
  if (opened.has(c.id)) return;
  if (round.type === 'counterfeit' && specialRounds.active && inv.gun) {
    if (!falseChests.has(c.id)) falseChests.set(c.id, Math.random() < Math.min(0.5, 0.3 + round.n * 0.01));
    if (falseChests.get(c.id) && specialRounds.chestTrap(c.x, c.z)) {
      opened.add(c.id); openedChests.push(c.id); refreshChunks(true); sfx.chest();
      return;
    }
  }
  if (isChoirRound()) choir.noise(camera.position.x, camera.position.z, 0.72, 'chest');
  if (isConsumerRound()) consumer.noise(camera.position.x, camera.position.z, 0.72, 'chest');
  if (!c.loot) c.loot = chestLootRolls.get(c.id) || null;
  if (!c.loot) {
    if (isCollectiveRound() && (c.tier || 'common') === 'common') c.loot = 'matches';
    else if (!radar.acquired && (isChoirRound() || (isObserverRound() && (round.t >= 90 || lootRng() < 0.16)))) c.loot = 'radar';
    else if (!inv.gun) c.loot = 'pistol';
    else if (!inv.kitGiven && inv.gunTier === 0 && (c.tier || 'common') !== 'common') c.loot = 'gun_kit';      // the first good chest always rebuilds the pistol
    else if ((c.tier || 'common') === 'common' && lootRng() < 0.12 && lore.dropAt('world', camera.position.x, camera.position.z)) c.loot = 'lore';
    if (!c.loot) c.loot = rollChestLoot(c.tier || 'common');
    if (c.loot) chestLootRolls.set(c.id, c.loot);
  }
  let granted = false;
  if (c.loot === 'lore') { toast('Something is folded in with the rest. Look around you.'); granted = true; }
  else if (c.loot === 'matches' && isCollectiveRound()) {
    if (bagHasRoom('matches')) { inv.matches += 2 + ((lootRng() * 3) | 0); toast(`Found matches (${inv.matches} total)`); granted = true; }
  } else granted = c.loot && grantChestLoot(c.loot);
  if (!granted) { toast(`Inventory full (${inventorySlots().length}/${bag.capacity}). Select a slot and press X to make room`); return; }
  opened.add(c.id); openedChests.push(c.id); refreshChunks(true); sfx.chest();
  { const [lo, hi] = PARTS_IN_CHEST[c.tier || 'common'] || PARTS_IN_CHEST.common; addParts(lo + ((lootRng() * (hi - lo + 1)) | 0), true); }     // every chest has parts in the bottom of it
  chestLootRolls.delete(c.id);
  if (c.loot === 'radar') radar.beepIn = 0;
  c.loot = null;
}
function actionKey(e) {
  if (e.repeat || !playing || finished || intro.active) return;
  if (e.code === 'KeyE') { if (swim.in) useAction(); else if (nearLore) collectLore(nearLore); else if (nearChest) openChest(nearChest); else useAction(); }
  else if (/^Digit[1-9]$/.test(e.code)) useInventorySlot(Number(e.code.slice(-1)) - 1);
  else if (e.code === 'KeyX') dropInventorySlot();
  else if (e.code === 'KeyR') startReload();
  else if (e.code === 'KeyB') swapBattery();
  else if (e.code === 'KeyM') strikeMatch();
  else if (e.code === 'KeyQ') drinkPotion();
  else if (e.code === 'KeyC') bench.open();
  else if (e.code === 'KeyT') throwGrenade();
  else if (e.code === 'KeyG' && radarWorks() && radar.acquired) {
    if (!radar.equipped && flashlight.battery <= 0) { toast('The radar battery is dead. B to swap in a spare'); return; }
    radar.equipped = !radar.equipped;
    gun.aiming = false;
    playSwitchSound();
  }
}
document.addEventListener('mousedown', (e) => {
  if (!playing || finished || intro.active) return;
  if (e.button === 0) { gun.trigger = true; shoot(); }
  else if (e.button === 2 && inv.gun && bag.activeWeapon === 'gun' && !radar.equipped) gun.aiming = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) gun.trigger = false;
  if (e.button === 2) gun.aiming = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

function updateItems(dt, bobX, bobY, inControl, raised) {
  if (inControl && swordSwing.t < swordSwing.duration) swordSwing.t += dt;
  const swordProgress = Math.min(1, swordSwing.t / swordSwing.duration);
  const swordArc = swordSwing.t < swordSwing.duration ? Math.sin(swordProgress * Math.PI) : 0;
  // battery drains only while the beam is actually on
  if (inControl && (raised || radar.equipped) && flashlight.battery > 0) {
    flashlight.battery = Math.max(0, flashlight.battery - dt / (CFG.batterySeconds * LIGHT_TIERS[inv.lightTier].life));
    if (flashlight.battery === 0) {
      if (radar.equipped) { radar.equipped = false; flashlight.equipped = false; toast('Radar battery dead. B to swap in a spare'); }
      else toast(inv.batteries > 0 ? 'Battery dead. B to swap in a spare' : 'Battery dead. M to strike a match');
    }
  }
  if (inControl && !raised && !radar.equipped && LIGHT_TIERS[inv.lightTier].recharge) flashlight.battery = Math.min(1, flashlight.battery + dt * LIGHT_TIERS[inv.lightTier].recharge);
  flashlight.nextFlicker = Math.min(flashlight.nextFlicker, flickerGap(1));

  // A pistol or sword occupies the right hand, leaving the flashlight in the left.
  const rightHandOccupied = facilityView?.drop?.id !== bag.activeWeapon && ((inv.gun && bag.activeWeapon === 'gun') || bag.activeWeapon.startsWith('sword'));
  handSide += ((rightHandOccupied ? -1 : 1) - handSide) * Math.min(1, dt * 8);
  held.position.x = handSide * HELD_UP.x + bobX;
  const cameraTier = hasCameraUpgrade();
  const heldTexture = cameraTier ? LIGHT_TIERS[CAMERA_LIGHT_TIER].sprite : plainFlashlightTexture;
  if (held.material.map !== heldTexture) {
    held.material.map = heldTexture; held.material.color.set(cameraTier ? 0xffffff : 0x6a6a6a); held.material.needsUpdate = true;
  }
  held.scale.x = (handSide < 0 ? -1 : 1) * (cameraTier ? 1.35 : 1);
  spot.position.x = halo.position.x = 0.22 * handSide;

  // match: a small, short-lived glow in the flashlight hand
  if (match.t > 0) {
    if (inControl) match.t -= dt;
    if (match.t <= 0) scare.armed = true;      // burned out on its own
    const burn = Math.min(1, match.t / 1.2) * Math.min(1, (CFG.match.seconds - match.t) / 0.25);
    const waver = 0.8 + 0.2 * Math.sin(uTime.value * 31) * Math.sin(uTime.value * 12.7);
    matchLight.intensity = CFG.match.intensity * Math.max(0, burn) * waver;
    matchLight.position.set(handSide * 0.3, -0.2, -0.45);
    matchMesh.position.set(handSide * 0.33 + bobX, -0.27 + bobY * 0.6, -0.6);
    matchMesh.visible = match.t > 0;
  } else { matchLight.intensity = 0; matchMesh.visible = false; }
  syncCandle(match.t > 0 && !finished);

  // pistol: raise, recoil, reload dip. Holding aim brings the sights up to the reticle.
  const weaponAvailable = !radar.equipped && facilityView?.drop?.id !== bag.activeWeapon;
  gunMesh.visible = weaponAvailable && inv.gun && bag.activeWeapon === 'gun';
  knifeMesh.visible = weaponAvailable && bag.activeWeapon === 'knife';
  swordMesh.visible = weaponAvailable && bag.activeWeapon.startsWith('sword');
  knifeMesh.position.set(handSide * 0.34 + bobX, -0.27 + bobY * 0.6, -0.58);
  // Swords share the pistol's right-hand position while the flashlight stays in the left.
  swordMesh.position.set(0.36 + bobX - swordArc * 0.4, -0.31 + bobY * 0.6 + swordArc * 0.1, -0.6 + swordArc * 0.18);
  knifeMesh.rotation.z = -0.32 + Math.sin(uTime.value * 1.7) * 0.012;
  swordMesh.rotation.z = -0.24 + Math.sin(uTime.value * 1.7) * 0.012 - swordArc * 1.35;
  swordMesh.material.color.setHex(ITEM_DEFS[bag.activeWeapon]?.color ?? 0xffffff);
  radarMesh.visible = radar.equipped;
  radarMesh.position.set(0.29 + bobX, -0.34 + bobY * 0.6, -0.62);
  radarMesh.rotation.z = -0.08 + Math.sin(uTime.value * 1.7) * 0.015;
  if (radar.equipped && inControl) {
    radar.beepIn -= dt;
    if (radar.beepIn <= 0) {
      if (flashlight.battery > 0 && (obsRound.active || choir.active || inv.radarTier >= 1)) {
        const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
        src.buffer = radarBuffer; gain.gain.value = 0.12;
        if (obsRound.hunting) { src.playbackRate.value = 0.6 + Math.random() * 0.7; gain.gain.value = 0.08 + Math.random() * 0.1; }   // warped while it hunts
        src.connect(gain).connect(mix.cues); src.start();
        if (choir.active) choir.noise(camera.position.x, camera.position.z, 0.08, 'listener ping');
      }
      radar.beepIn = 3;
    }
    radar.drawIn -= dt;
    if (radar.drawIn <= 0) { drawRadarMap(); radar.drawIn = 0.12; }
  }
  const wantAds = gun.aiming && gunMesh.visible && gun.reloadT < 0 && inControl ? 1 : 0;
  gun.ads += (wantAds - gun.ads) * Math.min(1, dt * 8);
  gun.cooldown = Math.max(0, gun.cooldown - dt);
  // a rapid gun keeps firing while the trigger is held (or until a tapped burst is spent)
  if (!inControl) { gun.trigger = false; gun.burst = 0; }
  else if (gun.cooldown <= 0 && inv.gun && bag.activeWeapon === 'gun' && ((gun.trigger && GUN.auto) || gun.burst > 0)) { if (gun.burst > 0) gun.burst--; shoot(); }
  if (inv.gun) {
    gun.raise += (1 - gun.raise) * Math.min(1, dt * 6);
    gun.recoil = Math.max(0, gun.recoil - dt * 6);
    let dip = 0;
    if (gun.reloadT >= 0) {
      if (inControl) gun.reloadT += dt;
      const u = gun.reloadT / GUN.reload;
      dip = Math.max(0, Math.min(1, u / 0.22, (1 - u) / 0.22));
      if (u > 0.4 && u < 0.6) dip += Math.sin((u - 0.4) / 0.2 * Math.PI) * 0.25;   // magazine goes in
      if (!gun.loaded && u >= 0.6) {
        gun.loaded = true;
        const n = Math.min(GUN.mag - inv.mag, inv.reserve);
        inv.mag += n; inv.reserve -= n;
      }
      if (u >= 1) gun.reloadT = -1;
    }
    const a = gun.ads, steady = 1 - a * 0.8;
    gunMesh.position.set(
      0.36 + (0.02 - 0.36) * a + bobX * steady - (GUN.scale - 1) * 0.1 * (1 - a),
      -0.31 + (GUN.scale - 1) * 0.05 + (-0.16 - -0.31) * a - (1 - gun.raise) * 0.5 - dip * 0.22 + gun.recoil * 0.05 + bobY * 0.6 * steady,
      -0.6 + (-0.48 - -0.6) * a + gun.recoil * 0.07);
    gunMesh.rotation.z = -0.45 + (-0.06 - -0.45) * a - gun.recoil * 0.5 - dip * 0.9;
    muzzle.position.set(0.3 + (0.02 - 0.3) * a, -0.15 + (-0.05 - -0.15) * a, -0.9 + (-0.7 - -0.9) * a);
  }
  gun.flash = Math.max(0, gun.flash - dt);
  muzzle.intensity = gun.flash > 0 ? 80 * (gun.flash / 0.07) : 0;

  // nearest unopened chest in reach and roughly in view
  nearChest = null;
  if (inControl) {
    const px = camera.position.x, pz = camera.position.z, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const cx = Math.floor(px / CFG.chunk), cz = Math.floor(pz / CFG.chunk);
    let best = CFG.chestReach;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = chunks.get(key(cx + dx, cz + dz))?.chest;
      if (!c || opened.has(c.id)) continue;
      const ex = c.x - px, ez = c.z - pz, d = Math.hypot(ex, ez);
      if (d < best && (ex * fx + ez * fz) / d > 0.4) { best = d; nearChest = c; }
    }
  }

  // HUD
  ui.status.hidden = !inControl;
  ui.ammo.hidden = !inControl || !inv.gun || radar.equipped || bag.activeWeapon !== 'gun';
  ui.reticle.hidden = !inControl || radar.equipped || bag.activeWeapon !== 'gun' || gun.ads < 0.35;
  renderInventoryHud(inControl);
  nearLore = lore.update(dt, inControl, yaw);
  const chestPrompt = nearChest ? `[E] Open ${nearChest.tier === 'armory' ? 'armory cache' : nearChest.tier === 'common' ? 'chest' : `${nearChest.tier} supply chest`}` : '';
  setText(ui.prompt, useWords(swim.in ? (mapAction ? mapAction.label : '') : nearLore ? (nearLore.kind === 'item' ? '[E] Pick it up' : '[E] Pick up the paper') : nearChest ? chestPrompt : mapAction ? mapAction.label : ''));
  ui.battFill.style.transform = `scaleX(${flashlight.battery})`;
  ui.batt.classList.toggle('low', flashlight.battery < 0.25);
  setText(ui.spare, '+' + inv.batteries);
  setText(ui.matches, String(inv.matches));
  setText(ui.potions, String(inv.potions));
  setText(ui.parts, String(inv.parts));
  if (partsFlash > 0) { partsFlash = Math.max(0, partsFlash - dt); ui.parts.style.color = partsFlash > 0 ? '#fff' : ''; }
  setText(ui.ammoText, gun.reloadT >= 0 ? 'reloading' : `${inv.mag} / ${inv.reserve}`);
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.style.opacity = 0; }
}

let lightConfirmAt = -1e9;
addEventListener('keydown', (e) => {
  if (mapFall?.active) return;
  if (cult?.active) { cult.key(e); return; }
  keys[e.code] = true;
  actionKey(e);
  if (e.code === 'Space') e.preventDefault();
  if (!started && introSong.paused) playIntroSong();
  if (e.code === 'Space' && playing && !finished && !intro.active && !breathBlocked && stamina > 0.02) holdingBreath = true;
  if (e.code === 'KeyF' && playing && !e.repeat && !finished && !intro.active) {
    // The Collective: with a match burning the flashlight is already off. F would switch it ON and put the match out,
    // so it takes a second press to mean it.
    if (isCollectiveRound() && !flashlight.equipped && match.t > 0 && collective.encounter && performance.now() - lightConfirmAt > 2000) {
      lightConfirmAt = performance.now();
      toast('Your flashlight is already off. The match is fine. Press F again to turn the flashlight ON.');
      return;
    }
    flashlight.equipped = !flashlight.equipped;
    playSwitchSound();
    if (isChoirRound()) choir.noise(camera.position.x, camera.position.z, 0.18, 'flashlight click');
    if (isConsumerRound()) consumer.noise(camera.position.x, camera.position.z, 0.18, 'flashlight click');
    onFlashlightToggle();
    if (flashlight.flickerAge >= 0) flashlight.flickerAge = -1;
  }
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Space') { holdingBreath = false; breathBlocked = false; }
});
addEventListener('blur', () => { holdingBreath = false; gun.aiming = false; gun.trigger = false; });
overlay.addEventListener('click', () => {
  if (canBeginCult()) { beginCult(); return; }
  if (TOUCH) { beginTouch(); return; }
  if (finished) { location.reload(); return; }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  // Autoplay is often blocked until a gesture. That first click starts the
  // title song and leaves the player on the intro; the next click begins.
  if (!started && introSong.paused && introSongNeedsGesture) {
    introSongNeedsGesture = false;
    playIntroSong();
    return;
  }
  renderer.domElement.requestPointerLock();
});
let helpOpen = false;
document.addEventListener('pointerlockchange', () => {
  if (mapFall?.active || cult?.active) return;
  playing = document.pointerLockElement === renderer.domElement;
  if (!playing && cutscenes.dying) cutscenes.skipDeath();          // Esc while dying: straight to the death screen
  overlay.style.display = playing || journal.isOpen || bench.isOpen || picker.isOpen || helpOpen || cutscenes.dying ? 'none' : 'flex';
  if (playing) { started = true; overlay.classList.remove('map-arrival'); stopIntroSong(); }
  else { holdingBreath = false; gun.aiming = false; syncFootsteps(null); }
  if (!playing && !finished) document.getElementById('go').textContent = started ? 'Paused. Click to resume' : 'Click to begin';
});
document.addEventListener('pointerlockerror', () => { if (!mapFall?.active && !cult?.active && !journal.isOpen && !bench.isOpen && !picker.isOpen && !helpOpen && !finished) { playing = false; overlay.style.display = 'flex'; } });
addEventListener('mousemove', (e) => {
  if (!playing || intro.active) return;
  const sens = 0.0022 * (1 - gun.ads * 0.4);
  yaw -= e.movementX * sens;
  pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY * sens));
});

function pressKey(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); }
function releaseKey(code) { window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); }
function touchView() {
  const vv = window.visualViewport;
  const winLand = innerWidth > innerHeight;
  if (!vv || winLand !== (vv.width > vv.height)) return { w: innerWidth, h: innerHeight, top: 0, left: 0 };
  return { w: vv.width, h: vv.height, top: vv.offsetTop, left: vv.offsetLeft };
}
function beginTouch() {
  const view = touchView();
  if (view.w <= view.h) return;
  if (finished) { location.reload(); return; }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!started && introSong.paused && introSongNeedsGesture) {
    introSongNeedsGesture = false;
    playIntroSong();
    return;
  }
  const root = document.documentElement;
  const req = root.requestFullscreen || root.webkitRequestFullscreen || root.webkitRequestFullScreen;
  if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
    const pending = req.call(root);
    if (pending && pending.catch) pending.catch(() => {});
  }
  try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (err) {}
  playing = true;
  started = true;
  overlay.classList.remove('map-arrival');
  stopIntroSong();
  overlay.style.display = 'none';
  dispatchEvent(new Event('resize'));          // the touch layout refits itself on resize (fitTouch lives inside the TOUCH block)
}
let releaseTouch = () => {};
function pauseTouch() {
  playing = false;
  overlay.style.display = 'flex';
  holdingBreath = false;
  gun.aiming = false;
  keys.KeyW = keys.KeyA = keys.KeyS = keys.KeyD = keys.ShiftLeft = false;
  releaseTouch();
  document.getElementById('go').textContent = started ? 'Tap to resume' : 'Tap to begin';
}
if (TOUCH) {
  document.body.classList.add('touch');
  const view = document.querySelector('meta[name=viewport]');
  if (view) view.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  for (const [name, content] of [['mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-capable', 'yes'], ['apple-mobile-web-app-status-bar-style', 'black'], ['theme-color', '#000000']]) {
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (!meta) { meta = document.createElement('meta'); meta.name = name; document.head.append(meta); }
    meta.content = content;
  }
  document.getElementById('go').textContent = 'Tap to begin';
  document.getElementById('inventoryHelp').textContent = 'TAP AN ITEM TO USE · TWO FINGERS: DOWN WORKBENCH, SIDEWAYS GRENADE';
  const stick = document.getElementById('stick'), knob = document.getElementById('stickKnob'), gear = document.getElementById('gear'), breathBtn = document.getElementById('breath');
  const fingers = new Map();
  const breathSources = new Set();
  let stickId = null, stickX = 0, stickY = 0, look = null, pair = null, breathOn = false, lastTap = 0, pendingFire = 0;
  function hideStick() {
    stickId = null;
    stick.classList.remove('on');
    knob.style.transform = '';
    keys.KeyW = keys.KeyA = keys.KeyS = keys.KeyD = keys.ShiftLeft = false;
  }
  function moveStick(x, y) {
    const dx = x - stickX, dy = y - stickY, len = Math.hypot(dx, dy) || 1, reach = Math.min(46, len);
    knob.style.transform = `translate(${dx / len * reach}px, ${dy / len * reach}px)`;
    const nx = dx / len * (reach / 46), ny = dy / len * (reach / 46);
    keys.KeyW = ny < -0.22; keys.KeyS = ny > 0.22; keys.KeyA = nx < -0.22; keys.KeyD = nx > 0.22;
    keys.ShiftLeft = reach > 40;
  }
  function rightFingers() { return [...fingers.values()].filter((f) => f.side === 'right'); }
  function beginBreath(source) {
    const fresh = breathSources.size === 0;
    breathSources.add(source);
    breathOn = true;
    breathBtn.classList.toggle('held', breathSources.has('button'));
    breathBtn.setAttribute('aria-pressed', breathSources.has('button') ? 'true' : 'false');
    if (fresh) pressKey('Space');
  }
  function endBreath(source) {
    if (source) breathSources.delete(source);
    else breathSources.clear();
    breathBtn.classList.toggle('held', breathSources.has('button'));
    breathBtn.setAttribute('aria-pressed', breathSources.has('button') ? 'true' : 'false');
    if (breathSources.size || !breathOn) return;
    breathOn = false;
    releaseKey('Space');
  }
  breathBtn.addEventListener('pointerdown', (e) => {
    if (!playing || intro.active) return;
    e.preventDefault();
    e.stopPropagation();
    try { breathBtn.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer has nothing to capture */ }
    beginBreath('button');
  });
  const releaseBreathButton = (e) => { e.preventDefault(); endBreath('button'); };
  breathBtn.addEventListener('pointerup', releaseBreathButton);
  breathBtn.addEventListener('pointercancel', releaseBreathButton);
  breathBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  function fitTouch() {
    const box = touchView();
    document.documentElement.classList.add('touch-root');
    const b = document.body;
    b.style.position = 'fixed';
    b.style.top = box.top + 'px';
    b.style.left = box.left + 'px';
    b.style.width = box.w + 'px';
    b.style.height = box.h + 'px';
    const canvas = document.querySelector('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = box.top + 'px';
    canvas.style.left = box.left + 'px';
    canvas.style.width = box.w + 'px';
    canvas.style.height = box.h + 'px';
    resize();
  }
  function touchCanUse() {
    const label = mapAction && mapAction.label;
    if (swim.in) return !!(label && label.includes('[E]'));
    if (nearLore || nearChest) return true;
    return !!(label && (label.includes('[E]') || label.includes('Hold E')));
  }
  function endUse() { if (look && look.using) { look.using = false; releaseKey('KeyE'); } }
  releaseTouch = () => {
    hideStick();
    endBreath();
    endUse();
    gun.aiming = false; gun.trigger = false;
    clearTimeout(pendingFire);
    if (look) clearTimeout(look.holdTimer);
    if (pair) clearTimeout(pair.timer);
    look = null; pair = null; fingers.clear();
    gear.classList.remove('on');
  };
  fitTouch();
  addEventListener('resize', fitTouch);
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', fitTouch);
    visualViewport.addEventListener('scroll', fitTouch);
  }
  addEventListener('orientationchange', () => setTimeout(fitTouch, 80));
  const chestPoint = new THREE.Vector3();
  function chestUnderTap(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    camera.updateMatrixWorld();
    const px = camera.position.x, pz = camera.position.z;
    const cx0 = Math.floor(px / CFG.chunk), cz0 = Math.floor(pz / CFG.chunk);
    let best = null, bestHit = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = chunks.get(key(cx0 + dx, cz0 + dz))?.chest;
      if (!c || opened.has(c.id)) continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d > CFG.chestReach) continue;
      chestPoint.set(c.x, MAP.groundY(c.x, c.z) + 0.45, c.z).project(camera);
      if (chestPoint.z < -1 || chestPoint.z > 1) continue;
      const sx = (chestPoint.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-chestPoint.y * 0.5 + 0.5) * rect.height + rect.top;
      const hit = Math.hypot(clientX - sx, clientY - sy);
      const tol = Math.max(56, Math.min(160, (0.85 / Math.max(d, 0.7)) * rect.height));
      if (hit <= tol && hit < bestHit) { best = c; bestHit = hit; }
    }
    return best;
  }
  function endPointer(e) {
    const gone = fingers.get(e.pointerId);
    fingers.delete(e.pointerId);
    if (look && e.pointerId === look.id && look.using) {
      clearTimeout(look.holdTimer);
      endUse();
      look = null;
      clearTimeout(pendingFire);
      lastTap = 0;
      if (e.pointerId === stickId) hideStick();
      return;
    }
    if (e.pointerId === stickId) hideStick();
    const rights = rightFingers();
    const wasBreath = breathOn;
    if (gone && gone.side === 'right' && rights.length < 2) endBreath('fingers');
    if (gone && gone.side === 'right' && rights.length === 0 && pair) {
      const quick = !pair.opened && !pair.used && !wasBreath && pair.moved < 18 && performance.now() - pair.t < 320;
      clearTimeout(pair.timer);
      pair = null;
      if (quick) { clearTimeout(pendingFire); lastTap = 0; pressKey('KeyF'); releaseKey('KeyF'); }
      return;
    }
    const moved = gone ? Math.hypot(e.clientX - gone.sx, e.clientY - gone.sy) : 99;
    const tapped = gone && moved < 18 && performance.now() - gone.t < 340 && rights.length === 0;
    if (tapped) {
      const chest = chestUnderTap(e.clientX, e.clientY);
      if (chest) {
        if (look && e.pointerId === look.id) { clearTimeout(look.holdTimer); if (look.aiming) gun.aiming = false; look = null; }
        clearTimeout(pendingFire);
        lastTap = 0;
        openChest(chest);
        return;
      }
    }
    if (!look || e.pointerId !== look.id) return;
    clearTimeout(look.holdTimer);
    const dist = Math.hypot(e.clientX - look.sx, e.clientY - look.sy);
    const tap = !look.dragged && !look.aiming && !look.firing && dist < 16 && performance.now() - look.t < 320;
    const doubled = gone && gone.double;
    if (look.aiming) gun.aiming = false;
    if (look.firing) gun.trigger = false;
    look = null;
    if (rights.length > 0 || !tap) return;
    if (doubled) { lastTap = 0; clearTimeout(pendingFire); pressKey('KeyE'); releaseKey('KeyE'); return; }
    const stamp = performance.now();
    lastTap = stamp;
    pendingFire = setTimeout(() => { if (lastTap === stamp) { shoot(); if (GUN.auto && bag.activeWeapon === 'gun' && inv.gun) gun.burst = 3; } }, 280);     // a tap on a rapid gun is a short burst
  }
  document.addEventListener('pointerdown', (e) => {
    if (!playing || intro.active) return;
    if (e.target.closest && e.target.closest('#overlay, #turn, #board, #inventorySlots, #breath')) return;
    const btn = e.target.closest && e.target.closest('#gear button');
    if (btn) {
      e.preventDefault();
      if (btn.dataset.tap) { pressKey(btn.dataset.tap); releaseKey(btn.dataset.tap); }
      else if (btn.dataset.act === 'pause') pauseTouch();
      gear.classList.remove('on');
      return;
    }
    if (gear.classList.contains('on')) { gear.classList.remove('on'); return; }
    const side = e.clientX < touchView().w * 0.5 ? 'left' : 'right';
    const rec = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, side, t: performance.now(), double: false };
    if (side === 'right' && performance.now() - lastTap < 320) { rec.double = true; clearTimeout(pendingFire); }
    fingers.set(e.pointerId, rec);
    if (side === 'left' && stickId == null) {
      stickId = e.pointerId; stickX = e.clientX; stickY = e.clientY;
      stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px';
      stick.classList.add('on'); knob.style.transform = '';
    }
    const rights = rightFingers();
    if (rights.length >= 2) {
      if (look) { clearTimeout(look.holdTimer); if (look.aiming) gun.aiming = false; if (look.firing) gun.trigger = false; endUse(); look = null; }
      clearTimeout(pendingFire);
      pair = { t: performance.now(), sx: rights.reduce((sum, f) => sum + f.sx, 0) / rights.length, sy: rights.reduce((sum, f) => sum + f.sy, 0) / rights.length, moved: 0, opened: false, timer: 0 };
      pair.timer = setTimeout(() => {
        if (!pair || pair.opened || pair.moved >= 16 || breathOn || rightFingers().length < 2) return;
        pair.used = true; beginBreath('fingers');
      }, 240);
      return;
    }
    if (side === 'right' && !look) {
      look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: rec.t, dragged: false, aiming: false, holdTimer: 0 };
      look.holdTimer = setTimeout(() => {
        if (!look || look.id !== e.pointerId || look.dragged || rightFingers().length >= 2) return;
        // tap, then hold: a rapid gun fires for as long as the finger stays down, and the finger still aims it
        if (rec.double && GUN.auto && inv.gun && bag.activeWeapon === 'gun' && !radar.equipped) { look.firing = true; lastTap = 0; gun.trigger = true; shoot(); return; }
        if (touchCanUse()) { look.using = true; clearTimeout(pendingFire); lastTap = 0; pressKey('KeyE'); return; }
        look.aiming = true; gun.aiming = true;
      }, 280);
    }
    e.preventDefault();
  });
  document.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f || !playing || intro.active) return;
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    f.x = e.clientX; f.y = e.clientY;
    const rights = rightFingers();
    if (rights.length >= 2 && pair) {
      const ay = rights.reduce((sum, p) => sum + p.y, 0) / rights.length, ax = rights.reduce((sum, p) => sum + p.x, 0) / rights.length;
      const up = pair.sy - ay, across = ax - pair.sx;
      pair.moved = Math.max(pair.moved, Math.hypot(up, across));
      if (pair.opened) return;
      // two fingers together: up for the gear, down for the workbench, sideways to throw a grenade
      const tall = Math.abs(up) > 46 && Math.abs(up) > Math.abs(across), wide = Math.abs(across) > 56 && Math.abs(across) > Math.abs(up);
      if (!tall && !wide) return;
      pair.opened = true; pair.used = true; endBreath('fingers');
      if (wide) throwGrenade();
      else if (up > 0) gear.classList.add('on');
      else if (!finished) bench.open();
      return;
    }
    if (e.pointerId === stickId) { moveStick(e.clientX, e.clientY); return; }
    if (!look || e.pointerId !== look.id) return;
    if (!look.firing && Math.hypot(e.clientX - look.sx, e.clientY - look.sy) > 12) { look.dragged = true; clearTimeout(look.holdTimer); }
    if (!look.dragged && !look.aiming && !look.firing) return;
    const sens = 0.0045 * (1 - gun.ads * 0.4);
    yaw -= dx * sens;
    pitch = Math.max(-1.45, Math.min(1.45, pitch - dy * sens));
  });
  document.addEventListener('pointerup', endPointer);
  document.addEventListener('pointercancel', endPointer);
  document.addEventListener('touchmove', (e) => { if (!e.target.closest('#board, #playerName, #inventorySlots, #breath, #menuPanel, #bench .wlist')) e.preventDefault(); }, { passive: false });
}

// ───────────────────────── loop ─────────────────────────
const clockEl = document.getElementById('clock');
let elapsed = 0, bob = 0, last = performance.now();
const move = new THREE.Vector3();

// ───────────────────────── world systems: weather, hazards, doors, map sound ─────────────────────────
const SWIM = { speed: 1.4, air: 14, drown: 20, climb: 1.1, reach: 1.0 };   // seconds of air, damage per second once it runs out
const LAVA = { damage: 12, every: 0.4, slow: 0.6 };
const VENT = { warn: 1.2, erupt: 1.7, reach: 1.25, damage: 14, every: 0.3 };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const swim = { in: false, air: 1, sink: 0, climb: -1, from: null, to: null, tick: 0, shore: null };
const burn = { in: false, tick: 0 };
const worldUi = { air: $('air'), airFill: $('airFill'), tint: $('tint') };
const idleSway = { k: 0, still: 0, t: 0 };
const runShake = { k: 0 };
let playerSpeedNow = 0, playerRunningNow = false, huntSilence = false, indoors = false, mapAction = null, deathCause = 'ghost', ventTick = 0, mapSoundOn = false;
const ventOn = new Set(), extraLights = [];

// ── sound ──
// Cave, hell and water sounds go straight out; rain, wind and thunder go through the outdoor bus so houses muffle them.
const mapBus = audioCtx.createGain(); mapBus.gain.value = 0; mapBus.connect(mix.ambience);
const skyBus = audioCtx.createGain(); skyBus.gain.value = 0; skyBus.connect(outdoorFilter);
const longNoise = (() => {
  const b = audioCtx.createBuffer(1, audioCtx.sampleRate * 3, audioCtx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
})();
function noiseBed(dest, type, freq, q, vol) {
  const src = audioCtx.createBufferSource(), filter = audioCtx.createBiquadFilter(), gain = audioCtx.createGain();
  src.buffer = longNoise; src.loop = true; filter.type = type; filter.frequency.value = freq; filter.Q.value = q; gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(dest); src.start();
  return { filter, gain };
}
const beds = {};
if (META.weather === 'rain') beds.roof = noiseBed(mapBus, 'bandpass', 260, 0.9, 0);   // rain on the roof, only heard indoors
if (!weatherOutdoor && weatherBuffers.length) weatherGain.connect(mapBus);
const echo = audioCtx.createConvolver(); echo.buffer = softImpulse(2.6, 2.2);
const echoGain = audioCtx.createGain(); echoGain.gain.value = 0.7; echo.connect(echoGain).connect(mapBus);
const echoReturn = MAP_NAME === 'accelerator' ? audioCtx.createDelay(0.5) : null;
if (echoReturn) { echoReturn.delayTime.value = 0.19; echoReturn.connect(echo); }
const interiorSound = { stepIn: 0, creakIn: 7 };
if (MAP.interior) {
  const tones = {
    asylum: [48, 102], subway: [43, 63], mall: [39, 90], deepsea: [49, 51, 98], backrooms: [59, 61, 120],
    prison: [37, 73], manor: [41, 82], apartments: [53, 108], school: [46, 92],
    cathedral: [32, 71], accelerator: [45, 58, 116], taxidermy: [34, 91],
    glasshouse: [38, 77], offshore: [41, 63], serverfarm: [55, 60, 120],
  }[MAP_NAME];
  const hum = audioCtx.createGain();
  hum.gain.value = MAP_NAME === 'deepsea' ? 0.038 : ['backrooms', 'serverfarm'].includes(MAP_NAME) ? 0.025 : 0.009;
  hum.connect(mapBus);
  for (const [i, frequency] of tones.entries()) {
    const oscillator = audioCtx.createOscillator(), level = audioCtx.createGain();
    oscillator.type = i === 0 ? 'triangle' : 'sine'; oscillator.frequency.value = frequency;
    level.gain.value = 1 / (i + 2);
    oscillator.connect(level).connect(hum); oscillator.start();
  }
  const voltage = audioCtx.createOscillator(), fluctuation = audioCtx.createGain();
  voltage.frequency.value = MAP_NAME === 'deepsea' ? 0.43 : 1.45;
  fluctuation.gain.value = hum.gain.value * 0.26;
  voltage.connect(fluctuation).connect(hum.gain); voltage.start();
  noiseBed(mapBus, 'lowpass', MAP_NAME === 'deepsea' ? 260 : 180, 0.85, 0.08);
  echoGain.gain.value = ['asylum', 'subway', 'cathedral', 'accelerator'].includes(MAP_NAME) ? 0.85 : MAP_NAME === 'backrooms' ? 0.16 : 0.44;
}
const cry = { next: 8 + Math.random() * 10, last: -1 };
function playHellCry() {
  if (!cryBuffers.length) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const index = (Math.random() * cryBuffers.length) | 0;
  const src = audioCtx.createBufferSource();
  src.buffer = cryBuffers[index];
  const gain = audioCtx.createGain();
  const pan = audioCtx.createStereoPanner();
  gain.gain.value = 0.42 + Math.random() * 0.18;
  pan.pan.value = (Math.random() * 2 - 1) * 0.65;
  src.connect(gain).connect(pan).connect(mapBus);
  src.start();
  cry.last = index;
}
const ambientTimer = { next: 2 };
function blip(dest, f0, f1, dur, vol, pan = 0) {
  const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain(), p = audioCtx.createStereoPanner();
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); p.pan.value = pan;
  o.connect(g).connect(p).connect(dest); o.start(t); o.stop(t + dur);
}
let facilityDirty = false;
const facility = MAP.facility ? createFacilityHazards(MAP, opened, {
  refresh: () => { facilityDirty = true; }, say: toast, damage: damagePlayer,
  noise(x, z, volume, kind) {
    if (choir.active) choir.noise(x, z, volume, kind);
    if (consumer.active) consumer.noise(x, z, volume, kind);
  },
  stamina: (amount) => { stamina = Math.max(0, stamina + amount); if (stamina === 0) needRecover = true; },
  corrode(dt) {
    flashlight.battery = Math.max(0, flashlight.battery - dt * 0.018);
    armor.shield = Math.max(0, armor.shield - dt * 8); armor.quiet = 0;
    const item = ITEM_DEFS[bag.activeWeapon];
    if (item?.maxDurability) bag.durability[bag.activeWeapon] = Math.max(1, (bag.durability[bag.activeWeapon] ?? item.maxDurability) - dt * 1.1);
  },
  pull(h, dt) {
    const x = h.x - Math.sign(h.dx) * 0.92;
    camera.position.x += (x - camera.position.x) * Math.min(1, dt * 5);
    camera.position.z += (h.z - camera.position.z) * Math.min(1, dt * 5);
    collide(camera.position);
  },
  reposition(p) { camera.position.x = p.x; camera.position.z = p.z; facilityDirty = true; },
  cue(kind, p) {
    const { vol, pan } = creatureSoundPlace(p);
    const sounds = {
      hum: [54, 112, 1.4, 1.0], surge: [380, 49, 0.42, 1.25], switch: [128, 70, 0.14, 0.48],
      creak: [490, 88, 0.47, 0.74], shatter: [1050, 290, 0.28, 0.86], crack: [730, 235, 0.11, 0.48],
      cough: [115, 66, 0.23, 0.50], gas: [322, 150, 0.68, 0.65],
      pollen: [180, 53, 0.37, 0.42], drip: [255, 94, 0.19, 0.44], rattle: [420, 110, 0.22, 0.50],
    };
    const [from, to, duration, level] = sounds[kind];
    blip(mapBus, from, to, duration, vol * level, pan);
    if (echoReturn) blip(echoReturn, from, to, duration, vol * level * 0.65, -pan * 0.84);
    if (kind === 'cough' || kind === 'gas' || kind === 'shatter') noise1(0.35, 'bandpass', kind === 'shatter' ? 4200 : kind === 'gas' ? 2200 : 640, kind === 'cough' ? 420 : 2200, vol * 1.6);
  },
}) : null;
const facilityStatus = document.getElementById('facilityStatus');
const facilityView = facility?.state;
const wetWeather = MAP_NAME === 'glasshouse' ? noiseBed(mapBus, 'bandpass', 400, 0.55, 0) : null;
const polarWind = MAP_NAME === 'offshore' ? noiseBed(mapBus, 'bandpass', 330, 0.65, 0) : null;
const reflectionCamera = MAP_NAME === 'taxidermy' ? new THREE.PerspectiveCamera(68, 1, 0.045, 58) : null;
const reflectionLight = reflectionCamera ? new THREE.PointLight(0xd2c2a4, 0, 16, 1.42) : null;
const chemicalMarks = MAP_NAME === 'taxidermy' ? new THREE.InstancedMesh(boxGeo,
  new THREE.MeshBasicMaterial({ color: 0x769d40, transparent: true, opacity: 0.48 }), 88) : null;
if (chemicalMarks) { chemicalMarks.count = 0; chemicalMarks.frustumCulled = false; scene.add(chemicalMarks); }
const droppedTool = MAP_NAME === 'accelerator' ? new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xac986e, alphaTest: 0.1 })) : null;
if (droppedTool) { droppedTool.visible = false; droppedTool.scale.set(0.52, 0.52, 1); scene.add(droppedTool); }
if (reflectionCamera) { reflectionLight.position.z = -0.6; reflectionCamera.add(reflectionLight); scene.add(reflectionCamera); }
function playTerrainStep(x, z, running, destination = mapBus, volumeScale = 1, pan = 0) {
  const zone = MAP.zoneAt?.(x, z);
  const footing = MAP.footingAt?.(x, z) ?? zone;
  const carpet = MAP_NAME === 'backrooms' && !['utility', 'archive'].includes(zone);
  const src = audioCtx.createBufferSource(), filter = audioCtx.createBiquadFilter(), gain = audioCtx.createGain();
  const now = audioCtx.currentTime, duration = carpet ? 0.09 : 0.14;
  src.buffer = longNoise;
  filter.type = 'bandpass';
  filter.frequency.value = carpet ? 175 : ({ mud: 450, boardwalk: 1150, saltNave: 2200, saltChannel: 530, brinePool: 320, beamRing: 1550, cableHatch: 270 })[footing] ?? 720 + Math.random() * 190;
  const volume = (facility ? Math.min(1.6, facility.noiseScale(x, z)) : 1) * volumeScale;
  gain.gain.setValueAtTime(Math.max(0.002, (running ? 0.32 : 0.21) * volume), now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  const panner = audioCtx.createStereoPanner();
  panner.pan.value = pan;
  src.connect(filter).connect(gain).connect(panner).connect(destination);
  if (destination === mapBus) gain.connect(echo);
  src.addEventListener('ended', () => { src.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect(); }, { once: true });
  src.start(now, Math.random() * 1.2, duration);
  blip(destination, carpet ? 78 : 118, 54, 0.10, (running ? 0.11 : 0.07) * volumeScale, pan);
}
const terrainStepInterval = running => running ? 0.31 : 0.49;
function updateInteriorSound(dt, moving, running, live, surface) {
  if ((!MAP.interior && !MAP.footingAt) || !live || huntSilence) return;
  if (!moving || surface !== 'terrain') interiorSound.stepIn = 0;
  else if ((interiorSound.stepIn -= dt) <= 0) {
    interiorSound.stepIn = terrainStepInterval(running);
    playTerrainStep(camera.position.x, camera.position.z, running);
  }
  if (MAP_NAME === 'deepsea' && (interiorSound.creakIn -= dt) <= 0) {
    const side = (Math.random() - 0.5) * 1.45;
    blip(echo, 72, 42, 2.7, 0.26, side);
    blip(mapBus, 133, 70, 1.95, 0.075, side);
    interiorSound.creakIn = 7 + Math.random() * 10;
  }
  if (MAP_NAME === 'offshore' && (interiorSound.creakIn -= dt) <= 0) {
    const side = Math.random() < 0.5 ? -1 : 1;
    if (facilityView.wind > 0.1) {
      blip(mapBus, 91, 48, 0.34, 0.24, side * 0.82);
      blip(mapBus, 438, 113, 0.21, 0.13, side * 0.73);
    }
    interiorSound.creakIn = 2.5 + Math.random() * 5.5;
  }
}
function thunder(power, delay) {
  const room = indoors ? 0.22 : 1;
  const t = audioCtx.currentTime + delay, dur = 2.6 + power * 2.6;
  const src = audioCtx.createBufferSource(), f = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
  src.buffer = longNoise; src.loop = true; f.type = 'lowpass';
  f.frequency.setValueAtTime(260 + power * 520, t); f.frequency.exponentialRampToValueAtTime(55, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(5 * power * room, t + 0.06);
  g.gain.exponentialRampToValueAtTime(1.6 * power * room, t + 0.5); g.gain.exponentialRampToValueAtTime(2.6 * power * room, t + 0.95);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(skyBus); src.start(t); src.stop(t + dur + 0.1);
  if (power > 0.75) {       // a close strike cracks first
    const c = audioCtx.createBufferSource(), cf = audioCtx.createBiquadFilter(), cg = audioCtx.createGain();
    c.buffer = longNoise; cf.type = 'highpass'; cf.frequency.value = 1400;
    cg.gain.setValueAtTime(0.5 * room, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    c.connect(cf).connect(cg).connect(skyBus); c.start(t); c.stop(t + 0.2);
  }
}
Object.assign(sfx, {
  splash() { noise1(0.55, 'lowpass', 2400, 300, 0.9); thump(120, 50, 0.3, 0.5); },
  climb()  { noise1(0.45, 'lowpass', 1500, 400, 0.5); },
  door()   { thump(140, 70, 0.12, 0.5); noise1(0.18, 'bandpass', 600, 300, 0.3); },
  rocks()  { noise1(0.8, 'lowpass', 900, 120, 1.0); thump(90, 40, 0.5, 0.7); },
  jet(v)   { noise1(VENT.erupt, 'bandpass', 300, 900, v); thump(70, 45, 0.5, v * 0.6); },
  sizzle() { noise1(0.25, 'highpass', 3000, 5000, 0.3); },
});

// ── rain, snow, embers: only visible where light falls on them ──
const WEATHER = {
  rain:   { count: 2600, box: [34, 16, 34], vel: [-1.6, -19, 0.7], streak: 0.6, sway: 0, color: [0.62, 0.7, 0.85], self: 0 },
  snow:   { count: 3200, box: [30, 14, 30], vel: [-0.9, -1.5, 0.35], streak: 0.12, sway: 0.35, color: [1, 1, 1], self: 0 },
  embers: { count: 420, box: [30, 12, 30], vel: [0.25, 1.3, 0.1], streak: 0.08, sway: 0.3, color: [1.0, 0.42, 0.08], self: 0.75 },
}[META.weather];
let weather = null;
if (WEATHER) {
  const n = WEATHER.count, seeds = new Float32Array(n * 6), ends = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = Math.random(), b = Math.random(), c = Math.random();
    seeds.set([a, b, c, a, b, c], i * 6); ends[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  const uniforms = {
    uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3() }, uTime: uTime,
    uBox: { value: new THREE.Vector3(...WEATHER.box) }, uVel: { value: new THREE.Vector3(...WEATHER.vel) },
    uStreak: { value: WEATHER.streak }, uSway: { value: WEATHER.sway }, uColor: { value: new THREE.Vector3(...WEATHER.color) },
    uBeam: { value: 0 }, uFlash: { value: 0 }, uSelf: { value: WEATHER.self }, uMatch: { value: 0 },
    uRoof: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) }, uRoofY: { value: MAP.wallH + 0.3 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aSeed; attribute float aEnd;
      uniform vec3 uCam, uDir, uBox, uVel; uniform float uTime, uStreak, uSway, uBeam, uFlash, uSelf, uMatch, uRoofY; uniform vec4 uRoof[4];
      varying float vB;
      void main() {
        vec3 p = aSeed * uBox + uVel * uTime;
        p.x += sin(uTime * 0.9 + aSeed.y * 40.0) * uSway; p.z += cos(uTime * 0.7 + aSeed.x * 40.0) * uSway;
        p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;          // an endless box of weather centred on the player
        float hidden = 0.0;                                                // nothing falls through a roof
        for (int i = 0; i < 4; i++) { vec4 r = uRoof[i]; if (p.x > r.x && p.x < r.z && p.z > r.y && p.z < r.w && p.y < uRoofY) hidden = 1.0; }
        vec3 to = p - uCam; float d = length(to);
        float cone = smoothstep(0.86, 0.95, dot(to / d, uDir));
        float b = uBeam * cone * clamp(1.0 - d / 20.0, 0.0, 1.0) + uFlash
                + uSelf * (0.55 + 0.45 * sin(uTime * 7.0 + aSeed.z * 60.0)) + uMatch * clamp(1.0 - d / 4.0, 0.0, 1.0);
        vB = (1.0 - hidden) * b * clamp(2.0 - d / (uBox.x * 0.25), 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p - normalize(uVel) * uStreak * aEnd, 1.0);
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vB; void main() { if (vB < 0.004) discard; gl_FragColor = vec4(uColor * vB, 1.0); }`,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  scene.add(lines);
  weather = { lines, uniforms, dir: new THREE.Vector3() };
}
// The Consumer can call down a moving storm even on maps that normally have no weather.
const consumerRainGeometry = new THREE.BufferGeometry();
const consumerRainSeeds = new Float32Array(1800 * 3);
for (let i = 0; i < 1800; i++) consumerRainSeeds.set([Math.random(), Math.random(), Math.random()], i * 3);
consumerRainGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(1800 * 3), 3));
consumerRainGeometry.setAttribute('aSeed', new THREE.BufferAttribute(consumerRainSeeds, 3));
const consumerRainUniforms = {
  uCam: { value: new THREE.Vector3() }, uTime, uIntensity: { value: 0 },
  uSheltered: { value: META.ceiling ? 1 : 0 },
  uRoof: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uRoofY: { value: MAP.wallH + 0.3 },
};
const consumerRainMaterial = new THREE.ShaderMaterial({
  uniforms: consumerRainUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `
    attribute vec3 aSeed; uniform vec3 uCam; uniform float uTime, uIntensity, uRoofY, uSheltered; uniform vec4 uRoof[4]; varying float vRain;
    void main() {
      vec3 p = aSeed * vec3(36.0, 20.0, 36.0) + vec3(-3.8, -24.0, 1.2) * uTime;
      p.x = mod(p.x - uCam.x + 18.0, 36.0) - 18.0 + uCam.x;
      p.y = mod(p.y - uCam.y + 10.0, 20.0) - 10.0 + uCam.y;
      p.z = mod(p.z - uCam.z + 18.0, 36.0) - 18.0 + uCam.z;
      float hidden = uSheltered;
      for (int i = 0; i < 4; i++) { vec4 r = uRoof[i]; if (p.x > r.x && p.x < r.z && p.z > r.y && p.z < r.w && p.y < uRoofY) hidden = 1.0; }
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp((2.0 + 2.8 * uIntensity) * (300.0 / max(1.0, -mv.z)), 1.0, 7.0);
      vRain = (1.0 - hidden) * uIntensity * (0.55 + 0.45 * sin(uTime * 6.0 + aSeed.x * 80.0));
    }`,
  fragmentShader: `varying float vRain; void main() { if (gl_PointCoord.x > 0.3 || gl_PointCoord.y > 0.9) discard; gl_FragColor = vec4(0.39, 0.31, 0.46, vRain * 0.52); }`,
});
const consumerRain = new THREE.Points(consumerRainGeometry, consumerRainMaterial);
consumerRain.frustumCulled = false; scene.add(consumerRain);
const consumerStorm = { intensity: 0, base: null, warned: false, hazardIn: 8, strikeIn: 7, flashT: 0, flashPower: 0 };
// lightning: the whole sky flashes, silhouetting whatever is out there, and thunder follows
const flashLight = new THREE.AmbientLight(0xbfd0ff, 0);
scene.add(flashLight);
const bolt = { next: 9 + Math.random() * 12, t: -1, power: 0, sky: new THREE.Color(META.fog) };

// ── doors, loose rocks, climbing out ──
function toggleDoor(d) {
  if (d.style && opened.has(d.id)) {
    const [x0, z0, x1, z1] = doorBounds(d, MAP.door);
    const { x, z } = camera.position;
    if (x > x0 - 0.38 && x < x1 + 0.38 && z > z0 - 0.38 && z < z1 + 0.38) return;
  }
  if (opened.has(d.id)) opened.delete(d.id); else opened.add(d.id);
  sfx.door();
  const loudness = 0.64 * (facility?.noiseScale(d.x, d.z, 'door') ?? 1);
  specialRounds.noise(d, 0.92);
  if (isChoirRound()) choir.noise(camera.position.x, camera.position.z, loudness, 'door');
  if (isConsumerRound()) consumer.noise(camera.position.x, camera.position.z, loudness, 'door');
  refreshChunks(true);
}
function useControl(control) {
  if (opened.has(control.target)) return;
  const { x, z } = camera.position, G = MAP.grid;
  const ci = G?.cellOf(x), cj = G?.cellOf(z);
  const wasWater = G?.liquid === 'water' && G.cellType(ci, cj, opened) === LIQUID;
  opened.add(control.target);
  const fellIn = !swim.in && !wasWater && G?.liquid === 'water' && G.cellType(ci, cj, opened) === LIQUID;
  sfx.door();
  if (control.flood) {
    noise1(0.48, 'lowpass', 1800, 650, 0.6);
    if (!fellIn) toast('The deluge pipes shudder. The bay is flooding.');
  } else toast('Something unlocks nearby.');
  if (fellIn) {
    fallIntoWater(true);
    updateSwim(0, true, G, ci, cj, LIQUID, x, z);
  }
  const mask = facility?.noiseScale(control.x, control.z, 'door') ?? 1;
  specialRounds.noise(control, 1);
  if (choir.active) choir.noise(control.x, control.z, 0.82 * mask, 'lever');
  if (consumer.active) consumer.noise(control.x, control.z, 0.77 * mask, 'lever');
  if (collective.encounter) collective.usedLever(control);
  refreshChunks(true);
}
const doorHold = { id: '', seconds: 0 };
function doorAction(d, dt) {
  const open = opened.has(d.id);
  if (d.mode === 'lockdown') return open ? { label: 'Sealed by the suppression system', run() {} } : null;
  if (d.mode === 'locked') return open ? null : { label: 'Locked. Find the lever.', run() {} };
  if (d.mode === 'breach' && open) return null;
  if (d.mode !== 'heavy' && d.mode !== 'breach') return { label: open ? '[E] Close door' : '[E] Open door', run: () => toggleDoor(d) };
  if (doorHold.id !== d.id) { doorHold.id = d.id; doorHold.seconds = 0; }
  if (!keys.KeyE) { doorHold.seconds = 0; doorHold.used = false; }
  else if (!doorHold.used) doorHold.seconds += dt;
  const breach = d.mode === 'breach', duration = breach ? 1.05 : 0.62;
  if (doorHold.seconds >= duration) {
    doorHold.seconds = 0; doorHold.used = true;
    if (breach) {
      sfx.rocks(); toast('The door splinters.');
      if (choir.active) choir.noise(d.x, d.z, 1.45, 'breaking door');
      if (consumer.active) consumer.noise(d.x, d.z, 1.25, 'breaking door');
    }
    toggleDoor(d);
    return null;
  }
  const action = breach ? 'Breach the boarded door' : open ? 'Pull the door shut' : 'Push the heavy door';
  return { label: `[Hold E] ${action}${doorHold.seconds ? ' · ' + Math.floor(doorHold.seconds / duration * 100) + '%' : ''}`, run() {} };
}
function breakSecret(s) { opened.add(s.id); sfx.rocks(); toast('The rocks give way'); refreshChunks(true); }
function climbOut() {
  if (!swim.shore || swim.climb >= 0) return;
  swim.climb = 0; swim.from = { x: camera.position.x, z: camera.position.z }; swim.to = swim.shore;
  sfx.climb();
}
function useAction() { if (mapAction) mapAction.run(); }

let thresholdCooldown = 0;
let facilityLight = false;
const litFacilityFixtures = new Map();
function updateLampLenses(time, power) {
  for (const lens of lampLenses) {
    const { layer, index, seed } = lens;
    const level = lightbound.levelFor(lens.x, lens.z, layer.lensKind, fixtureLevel(layer.lensKind, seed, time));
    const brightness = Math.round(level * power * 64) / 64;
    if (brightness === lens.last) continue;
    layer.mesh.setColorAt(index, lensTint.setScalar(brightness));
    layer.mesh.instanceColor.needsUpdate = true;
    lens.last = brightness;
  }
}

function updateMapLights(time, px, pz) {
  const pointPicks = [], spotPicks = [];
  const power = specialRounds.power;
  facilityLight = false;
  litFacilityFixtures.clear();
  const playerY = MAP.groundY(px, pz) + 1.1;

  function consider(entries, transient) {
    for (let i = 0; i < entries.length; i += 5) {
      const x = entries[i], y = entries[i + 1], z = entries[i + 2];
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 > 27 ** 2) continue;
      const strength = entries[i + 3], kind = entries[i + 4];
      const profile = MAP_LIGHTS[kind];
      const directional = !!profile.spread;
      const distance = Math.sqrt(d2);
      if (!transient && distance > profile.range + (directional ? 10 : 7)) continue;
      const seed = fixtureSeed(x, z);
      const level = transient ? 1 : lightbound.levelFor(x, z, kind, fixtureLevel(kind, seed, time)) * power;
      if (level < 0.018) continue;

      const picks = directional ? spotPicks : pointPicks;
      const slots = directional ? poolSpots.length : poolLights.length;
      // A flash or nearby open flame keeps a slot while a far bulb loses it.
      const score = distance - (transient ? 3 : Math.min(2, strength * level)) - (lightbound.active && lightbound.occupies(x, z, kind) ? 3.4 : 0);
      let at = picks.length;
      while (at > 0 && picks[at - 1].score > score) at--;
      if (at >= slots) continue;
      if (!transient && creatureWorld.losBlocked(px, pz, x, z, true)) continue;
      picks.splice(at, 0, { x, y, z, kind, strength, level, score, transient });
      if (picks.length > slots) picks.pop();
    }
  }
  consider(near.lights, false);
  consider(lightbound.emergencyLights, false);
  consider(extraLights, true);

  function apply(light, pick) {
    if (!pick) { light.intensity = 0; return; }
    const { x, y, z, kind, strength, level, transient } = pick;
    const beam = describeMapLight(x, y, z, strength, kind, MAP.groundY(x, z), MAP.grid?.CELL);
    beam.intensity *= level;
    if (transient) { beam.range = 16; beam.decay = 1.5; }
    light.position.set(x, y, z);
    light.color.setHex(beam.color);
    light.distance = beam.range;
    light.decay = beam.decay;
    light.intensity = beam.intensity;
    if (light.isSpotLight) {
      light.target.position.copy(beam.target);
      light.angle = beam.angle;
      light.penumbra = beam.penumbra;
    }
    if (lightbound.active && isPoweredFixture(kind)) {
      const id = fixtureId(x, z, kind);
      const beams = litFacilityFixtures.get(id);
      if (beams) beams.push(beam); else litFacilityFixtures.set(id, [beam]);
    }
    if (kind >= 3 && !facilityLight) facilityLight = mapLightAt(beam, px, playerY, pz) >= 0.64;
  }
  poolLights.forEach((light, i) => apply(light, pointPicks[i]));
  poolSpots.forEach((light, i) => apply(light, spotPicks[i]));
  if (!facilityLight && towerBeam?.intensity > 0) {
    const { x, y, z } = towerBeam.position;
    const { angle, penumbra, intensity, decay, distance: range } = towerBeam;
    facilityLight = mapLightAt({ x, y, z, target: towerBeam.target.position, angle, penumbra, intensity, decay, range }, px, playerY, pz) >= 0.64;
  }
}

function crossThreshold(link) {
  if (thresholdCooldown > 0) return;
  thresholdCooldown = 0.55;
  camera.position.set(link.toX, MAP.groundY(link.toX, link.toZ) + CFG.eye, link.toZ);
  yaw = link.yaw; pitch = 0;
  refreshChunks(true);
  specialRounds.relocate();
  lightbound.rebind(camera.position);
  if (link.text) toast(link.text);
  blip(mapBus, 135, 55, 0.38, 0.12);
}
function updateThresholds(dt, inControl) {
  if (thresholdCooldown > 0) {
    thresholdCooldown = Math.max(0, thresholdCooldown - dt);
    fadeEl.style.opacity = String(Math.max(0, thresholdCooldown - 0.22) * 2);
    return;
  }
  if (!inControl || swim.in) return;
  const { x, z } = camera.position;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  for (const link of near.links) {
    const dx = link.x - x, dz = link.z - z, distance = Math.hypot(dx, dz);
    if (link.type === 'fold') {
      if (distance < 0.78 && playerSpeedNow > 0 && move.x * link.di + move.z * link.dj > 0) {
        crossThreshold(link);
        return;
      }
    } else if (distance < 1.8 && (distance < 0.65 || (dx * fx + dz * fz) / distance > 0.35)) {
      mapAction = { label: '[E] ' + link.label, run: () => crossThreshold(link) };
      return;
    }
  }
}

function fallIntoWater(immediate = false) {
  swim.in = true;
  swim.tick = 0;
  if (immediate) swim.sink = 1;
  holdingBreath = false;
  sfx.splash();
  toast('You fell in. Swim to the edge and press E to climb out');
}

function updateSwim(dt, inControl, G, ci, cj, here, px, pz) {
  if (!swim.in) {
    swim.sink += (0 - swim.sink) * Math.min(1, dt * 6);
    swim.air = Math.min(1, swim.air + dt / 5);
    if (!inControl || here !== LIQUID) return;
    const lx = px - G.lo(ci), lz = pz - G.lo(cj), m = 0.35, L = (a, b) => G.cellType(ci + a, cj + b, opened) === LIQUID;    // properly over the edge?
    if ((lx > m || L(-1, 0)) && (lx < G.CELL - m || L(1, 0)) && (lz > m || L(0, -1)) && (lz < G.CELL - m || L(0, 1))) {
      fallIntoWater();
    }
    return;
  }
  if (swim.climb >= 0) {       // hauling yourself onto the bank
    swim.climb += dt / SWIM.climb;
    const k = Math.min(1, swim.climb), e = k * k * (3 - 2 * k);
    camera.position.x = swim.from.x + (swim.to.x - swim.from.x) * e; camera.position.z = swim.from.z + (swim.to.z - swim.from.z) * e;
    swim.sink = 1 - e;
    if (k >= 1) { swim.in = false; swim.climb = -1; }
    return;
  }
  swim.sink += (1 - swim.sink) * Math.min(1, dt * 5);
  if (!inControl) return;
  swim.air -= dt / SWIM.air;
  if (swim.air <= 0) { swim.air = 0; swim.tick += dt; if (swim.tick >= 1) { swim.tick = 0; damagePlayer(SWIM.drown, 'drowned'); } }
  swim.shore = null;
  let best = SWIM.reach;
  for (const [di, dj] of DIRS) {
    if (G.cellType(ci + di, cj + dj, opened) === LIQUID || G.solidCell(ci + di, cj + dj, opened)) continue;
    const edge = di ? Math.abs(G.lo(di > 0 ? ci + 1 : ci) - px) : Math.abs(G.lo(dj > 0 ? cj + 1 : cj) - pz);
    if (edge < best) { best = edge; swim.shore = { x: px + di * (edge + 0.8), z: pz + dj * (edge + 0.8) }; }
  }
  mapAction = swim.shore ? { label: '[E] Climb out', run: climbOut } : { label: 'Swim to the edge', run() {} };
}
function updateLava(dt, inControl, G, ci, cj, here, px, pz) {
  let inLava = false;
  if (inControl && here === LIQUID) {
    const lx = px - G.lo(ci), lz = pz - G.lo(cj), m = 0.2, L = (a, b) => G.cellType(ci + a, cj + b) === LIQUID;
    inLava = (lx > m || L(-1, 0)) && (lx < G.CELL - m || L(1, 0)) && (lz > m || L(0, -1)) && (lz < G.CELL - m || L(0, 1));
  }
  if (!inLava) { burn.in = false; return; }
  if (!burn.in) { burn.in = true; burn.tick = LAVA.every; toast('The lava burns. Get out'); }
  burn.tick += dt;
  while (burn.tick >= LAVA.every) { burn.tick -= LAVA.every; damagePlayer(LAVA.damage, 'burned'); sfx.sizzle(); }
}

let hazardIn = 0;
function updateWorld(dt, inControl, running) {
  mapAction = null;
  if (near.links.length || thresholdCooldown > 0) updateThresholds(dt, inControl);
  lightbound.update(dt, { player: camera.position, yaw, inControl });
  const px = camera.position.x, pz = camera.position.z, t = uTime.value;
  const live = started && !finished;
  if (live !== mapSoundOn) { mapSoundOn = live; if (!huntSilence) { rampParam(mapBus.gain, live ? 1 : 0, 1.5); rampParam(skyBus.gain, live ? 1 : 0, 1.5); } }

  // under a roof the storm stays outside: dull, and much quieter than in the open
  let inside = MAP_NAME === 'school' || !!facility && !EXPOSED_ZONES.includes(MAP.zoneAt(px, pz));
  for (let i = 0; i < near.houses.length; i += 4) if (px > near.houses[i] && pz > near.houses[i + 1] && px < near.houses[i + 2] && pz < near.houses[i + 3]) { inside = true; break; }
  if (inside !== indoors) {
    indoors = inside;
    rampParam(outdoorFilter.frequency, indoors ? 320 : 18000, 0.45);
    if (!huntSilence) rampParam(outdoorGain.gain, indoors ? 0.1 : 1, 0.45);
    if (beds.roof) rampParam(beds.roof.gain.gain, indoors ? 0.55 : 0, 0.35);
  }

  if (inControl) {
    if (facility) {
      const weapon = bag.activeWeapon === 'gun' && inv.gun ? 'gun' : ITEM_DEFS[bag.activeWeapon]?.kind === 'weapon' ? bag.activeWeapon : null;
      facility.update(dt, {
        x: px, z: pz, yaw, running, moving: playerSpeedNow > 0,
        hot: gun.flash > 0 || bag.staminaUntil > uTime.value,
        metalArmor: armor.tier >= 3 && armor.tier <= 5,
        metalGear: weapon ? { id: weapon, label: weapon === 'gun' ? 'gun' : ITEM_DEFS[weapon].name.toLowerCase() }
          : flashlight.equipped ? { id: 'flashlight', label: hasCameraUpgrade() ? 'video camera' : 'flashlight' } : null,
      }, near.hazards);
    }
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let best = 1.9;
    let target = null, controlTarget = null;
    for (const d of near.doors) {
      if (opened.has(d.id) && ['locked', 'breach'].includes(d.mode)) continue;
      if (d.mode === 'lockdown' && !doorIsClosed(d, opened)) continue;
      const ex = d.x - px, ez = d.z - pz, dist = Math.hypot(ex, ez);
      if (dist < best && (dist < 0.7 || (ex * fx + ez * fz) / dist > 0.3)) { best = dist; target = d; }
    }
    for (const control of near.controls) {
      if (opened.has(control.target) || (control.system && !facility.canInteract(control))) continue;
      const dx = control.x - px, dz = control.z - pz, d = Math.hypot(dx, dz);
      if (d < best && (d < 0.85 || (dx * fx + dz * fz) / d > 0.22)) {
        best = d; target = null; controlTarget = control;
      }
    }
    if (controlTarget?.system) mapAction = facility.interact(controlTarget, dt, !!keys.KeyE);
    else {
      facility?.resetHold();
      if (controlTarget) mapAction = { label: '[E] ' + controlTarget.label, run: () => useControl(controlTarget) };
    }
    if (target) mapAction = doorAction(target, dt);
    else { doorHold.seconds = 0; if (!keys.KeyE) doorHold.used = false; }
    const facilityAction = facility?.localAction({ x: px, z: pz }, near.hazards, yaw);
    if (facilityAction) mapAction = facilityAction;
    if (!mapAction) for (const s of near.secrets) {
      if (opened.has(s.id)) continue;
      const ex = s.x - px, ez = s.z - pz, dist = Math.hypot(ex, ez);
      if (dist < 3.3 && (ex * fx + ez * fz) / dist > 0.6) mapAction = { label: '[E] Push through the loose rocks', run: () => breakSecret(s) };
    }
  }
  if ((hazardIn -= dt) <= 0 && running && inControl) for (const hazard of near.hazards) {
    if (!['glass', 'boards'].includes(hazard.kind) || Math.hypot(px - hazard.x, pz - hazard.z) >= hazard.radius) continue;
    const glass = hazard.kind === 'glass';
    noise1(0.29, 'bandpass', glass ? 4200 : 530, glass ? 1900 : 265, 0.66);
    if (glass) damagePlayer(2, 'glass');
    if (choir.active) choir.noise(px, pz, 1.26, hazard.kind);
    if (consumer.active) consumer.noise(px, pz, 1.15, hazard.kind);
    hazardIn = 0.68; break;
  }
  if (towerBeam) {
    let tower = null, distance = 24;
    for (const entry of near.towers) {
      const d = Math.hypot(px - entry.x, pz - entry.z);
      if (d < distance) { tower = entry; distance = d; }
    }
    const hall = ['cellblock', 'gallery', 'tower'].includes(MAP.zoneAt(px, pz));
    const visible = tower && hall && !creatureWorld.losBlocked(px, pz, tower.x, tower.z, true);
    towerBeam.intensity = visible ? 85 * fixtureLevel(3, fixtureSeed(tower.x, tower.z), t) * specialRounds.power : 0;
    if (visible) {
      const angle = t * 0.33;
      towerBeam.position.set(tower.x, tower.y + 2.05, tower.z);
      const x = tower.x + Math.cos(angle) * 7.5, z = tower.z + Math.sin(angle) * 7.5;
      towerBeam.target.position.set(x, MAP.groundY(x, z) + 0.15, z);
    }
  }
  if (MAP.grid) {
    const G = MAP.grid, ci = G.cellOf(px), cj = G.cellOf(pz), here = G.cellType(ci, cj, opened);
    if (G.liquid === 'water') updateSwim(dt, inControl, G, ci, cj, here, px, pz); else updateLava(dt, inControl, G, ci, cj, here, px, pz);
  }
  if (MAP.grid || MAP_NAME === 'swamp') liquidScroll.value.set(t * 0.012, Math.sin(t * 0.35) * 0.03);
  worldUi.air.hidden = (!swim.in && !facilityView?.gassed) || !inControl;
  worldUi.airFill.style.transform = `scaleX(${facilityView?.gassed ? facilityView.air : swim.air})`;
  worldUi.tint.style.background = burn.in ? 'rgba(200,70,10,0.3)' : 'rgba(8,40,70,0.42)';
  worldUi.tint.style.opacity = burn.in ? 1 : facilityView?.gassed ? 0.2 : swim.sink;
  facilityStatus.hidden = !inControl || !facilityView?.status;
  if (!facilityStatus.hidden && facilityStatus.textContent !== facilityView.status) facilityStatus.textContent = facilityView.status;
  if (wetWeather) wetWeather.gain.gain.setTargetAtTime(facilityView.rain * 0.72, audioCtx.currentTime, 0.18);
  if (polarWind) polarWind.gain.gain.setTargetAtTime(facilityView.wind * 0.57, audioCtx.currentTime, 0.35);

  // fire jets: a pilot flame, a warning flare, then the column
  glowLayer.n = glowStatic;
  extraLights.length = 0;
  if (near.vents.length) {
    const big = atlas.sprites.fire, small = atlas.sprites.smallfire || big;
    let hit = false;
    for (let i = 0; i < near.vents.length; i += 4) {
      const vx = near.vents[i], vz = near.vents[i + 1], period = near.vents[i + 2], ph = (t + near.vents[i + 3]) % period, id = vx * 4096 + vz;
      const erupt = ph > period - VENT.erupt, warn = !erupt && ph > period - VENT.erupt - VENT.warn;
      let h = 0.28 + 0.08 * Math.sin(t * 17 + i), w = 0.4;
      if (erupt) {
        const a = ph - (period - VENT.erupt), k = Math.min(1, a / 0.15) * Math.min(1, (VENT.erupt - a) / 0.3);
        h = 0.6 + 4.6 * k * (0.9 + 0.1 * Math.sin(t * 31 + i)); w = 1.5;
      } else if (warn) { const a = (ph - (period - VENT.erupt - VENT.warn)) / VENT.warn; h = 0.35 + a * 0.9 + 0.15 * Math.sin(t * 40 + i); w = 0.6 + a * 0.4; }
      const list = erupt ? big : small;
      glowLayer.add(vx, 0, vz, w, h, list[(Math.floor(t * 12) + i) % list.length], 0.02);
      if (erupt || warn) extraLights.push(vx, erupt ? 2 : 0.6, vz, erupt ? 2.2 : 0.5, 0);
      const dist = Math.hypot(vx - px, vz - pz);
      if (!erupt) ventOn.delete(id);
      else {
        if (!ventOn.has(id)) { ventOn.add(id); if (live && dist < 26) sfx.jet(Math.max(0.05, 0.9 * (1 - dist / 26))); }
        if (inControl && dist < VENT.reach) hit = true;
      }
    }
    if (ventOn.size > 400) ventOn.clear();
    if (!hit) ventTick = VENT.every * 0.8;
    else { ventTick += dt; if (ventTick >= VENT.every) { ventTick = 0; damagePlayer(VENT.damage, 'burned'); sfx.sizzle(); } }
  }
  updateGrenades(dt, inControl);
  const bodyAction = obsRound.world(dt, inControl, px, pz, yaw, t);
  if (!swim.in && bodyAction && (!mapAction || bodyAction.label.startsWith('[E]'))) mapAction = bodyAction;
  const civilianAction = inControl && consumer.active ? consumer.worldAction(px, pz, yaw) : null;
  if (!swim.in && civilianAction && (!mapAction || !facility)) mapAction = civilianAction;
  if (collective.encounter) {
    const routeAction = collective.routeAction(dt, {
      available: inControl && !mapAction && !swim.in && !nearChest && !nearLore,
      yaw, held: !!keys.KeyE,
    });
    if (routeAction) mapAction = routeAction;
  }
  if (specialRounds.active) {
    const action = specialRounds.action(dt, inControl && !mapAction && !swim.in && !nearChest && !nearLore, !!keys.KeyE, {
      yaw, match: match.t > 0, beam: flashlight.equipped && flashlight.raise > 0.6 && flashlight.battery > 0 && spot.intensity > 1,
      camera: videoCameraOn(), beamRange: spot.distance, battery: flashlight.battery,
    });
    if (action) mapAction = action;
  }
  if (lightbound.active && inControl && !mapAction && !swim.in && !nearLore && !nearChest) {
    mapAction = lightbound.action(camera.position, yaw);
  }
  updateSalvage(dt, inControl, px, pz, -Math.sin(yaw), -Math.cos(yaw));
  updateDrops(dt, inControl, px, pz);
  glowLayer.commit();

  updateMapLights(t, px, pz);

  // hell: a distant cry, one of the three, every so often
  if (live && inControl && MAP_NAME === 'hell' && !huntSilence) {
    cry.next -= dt;
    if (cry.next <= 0) { playHellCry(); cry.next = 18 + Math.random() * 22; }
  }
  // gusts on the mountain when there is no recorded wind to carry them
  if (live) {
    ambientTimer.next -= dt;
    if (ambientTimer.next <= 0) {
      if (beds.wind) {
        const gust = 0.5 + Math.random() * 1.3, at = audioCtx.currentTime;
        beds.wind.gain.gain.setTargetAtTime(gust, at, 1.2); beds.wind.filter.frequency.setTargetAtTime(280 + Math.random() * 320, at, 1.5);
        beds.whistle.gain.gain.setTargetAtTime(gust > 1.3 ? 0.7 : 0.15, at, 1.0); beds.whistle.filter.frequency.setTargetAtTime(800 + Math.random() * 700, at, 1.5);
        ambientTimer.next = 2 + Math.random() * 4;
      } else ambientTimer.next = 5;
    }
  }

  // lightning
  let flash = 0;
  if (META.weather === 'rain') {
    if (bolt.t < 0) {
      if (live) bolt.next -= dt;
      if (bolt.next <= 0) { bolt.t = 0; bolt.power = 0.45 + Math.random() * 0.55; bolt.next = 10 + Math.random() * 22; thunder(bolt.power, (1 - bolt.power) * 3.2 + 0.15); }
    } else {
      bolt.t += dt;
      const a = bolt.t;
      flash = (a < 0.07 ? 1 : a < 0.13 ? 0.12 : a < 0.2 ? 0.8 : Math.max(0, 1 - (a - 0.2) / 0.3)) * bolt.power;
      if (a > 0.5) bolt.t = -1;
    }
    flashLight.intensity = flash * (indoors ? 0.5 : 2.4);
    scene.background.copy(bolt.sky).lerp(BOLT_SKY, flash);
  }
  if (consumerStorm.flashT > 0) {
    const age = 0.48 - consumerStorm.flashT;
    consumerStorm.flashT = Math.max(0, consumerStorm.flashT - dt);
    const pulse = age < 0.07 ? 1 : age < 0.15 ? 0.18 : age < 0.23 ? 0.82 : Math.max(0, 1 - (age - 0.23) / 0.25);
    const consumerFlash = pulse * consumerStorm.flashPower;
    flash = Math.max(flash, consumerFlash);
    flashLight.intensity = Math.max(flashLight.intensity, consumerFlash * (indoors ? 0.45 : 2.1));
    if (scene.background?.isColor) scene.background.lerp(new THREE.Color(0xb7a0bd), consumerFlash * 0.28);
  } else if (META.weather !== 'rain' && !debugAmbient) flashLight.intensity = 0;

  if (debugAmbient) flashLight.intensity = debugAmbient;
  if (weather) {
    if (MAP_NAME === 'school') weather.lines.visible = MAP.zoneAt(px, pz) === 'gym';
    if (MAP_NAME === 'glasshouse') weather.lines.visible = facilityView.rain > 0.28 && ['fernery', 'conservatory'].includes(facilityView.zone);
    if (MAP_NAME === 'offshore') weather.lines.visible = !inside;
    const u = weather.uniforms;
    camera.getWorldDirection(weather.dir);
    u.uCam.value.copy(camera.position); u.uDir.value.copy(weather.dir);
    u.uBeam.value = Math.min(1, spot.intensity / L.intensity) * 0.85; u.uFlash.value = flash * 0.5; u.uMatch.value = match.t > 0 ? 0.45 : 0;
    if (MAP_NAME === 'offshore') u.uFlash.value += facilityView.whiteout * 0.52;
    const H = near.houses, order = [];                     // the four nearest roofs keep the rain out
    for (let i = 0; i < H.length; i += 4) order.push([((H[i] + H[i + 2]) / 2 - px) ** 2 + ((H[i + 1] + H[i + 3]) / 2 - pz) ** 2, i]);
    order.sort((p, q) => p[0] - q[0]);
    for (let n = 0; n < 4; n++) {
      const r = u.uRoof.value[n];
      if (n < order.length) { const i = order[n][1]; r.set(H[i] - 0.7, H[i + 1] - 0.7, H[i + 2] + 0.7, H[i + 3] + 0.7); } else r.set(0, 0, 0, 0);
    }
  }
  if (chemicalMarks) {
    chemicalMarks.count = 0;
    for (const track of facility.tracks) {
      const age = facilityView.time - track.at;
      dummy.position.set(track.x, track.y + 0.015, track.z);
      dummy.rotation.set(0, track.yaw, 0);
      dummy.scale.set(0.1, 0.02, 0.23);
      dummy.updateMatrix();
      chemicalMarks.setMatrixAt(chemicalMarks.count, dummy.matrix);
      chemicalMarks.setColorAt(chemicalMarks.count++, billboardTint.setScalar(1 - age / 26));
    }
    chemicalMarks.instanceMatrix.needsUpdate = true;
    if (chemicalMarks.instanceColor) chemicalMarks.instanceColor.needsUpdate = true;
  }
  if (droppedTool) {
    const drop = facilityView.drop;
    droppedTool.visible = !!drop;
    if (drop) {
      droppedTool.position.set(drop.x, drop.y + 0.25, drop.z);
      const texture = drop.id === 'gun' ? gunMesh.material.map : drop.id === 'knife' ? knifeMesh.material.map
        : drop.id.startsWith('sword') ? swordMesh.material.map : held.material.map;
      if (texture !== droppedTool.material.map) { droppedTool.material.map = texture; droppedTool.material.needsUpdate = true; }
    }
  }
  if (facilityDirty) { facilityDirty = false; refreshChunks(true); }
}
const BOLT_SKY = new THREE.Color(0x2b3344);
let debugAmbient = 0;      // console only: game.debugLight(1.5) floods the map with light for inspection

// ───────────────────────── rounds + monsters ─────────────────────────
// Each round: survive ROUND.seconds or kill every monster. Inventory carries over between rounds.
const ROUND = {
  seconds: 300, rest: 6, locationRounds: 3,
  // Each round draws its monster at random, including the first.
  // The Slime needs either a lake or a working deluge bay.
  types: ['ghosts', 'observer', 'collective', 'choir', 'consumer', 'slime', 'unseen', 'lightbound', 'cult', ...Object.keys(SPECIAL_ROUNDS)],
  frenzy: 60,                          // the last N seconds of a round: clock ticks, ghosts turn vicious
  perRoundMenace: 0.15, frenzyMenace: 0.6,
  sneak: [0, 0.15, 0.35, 0.5, 0.65],   // per round: chance a creeping ghost attacks unlit instead of just staring (always, in a frenzy)
};
// How aggressive the ghosts are right now. lvl 0 = round 1 baseline; it scales creep rate and speed,
// how close they lurk, chase speed and jump-scare odds.
const isCollectiveRound = () => round.type === 'collective';
const isObserverRound = () => round.type === 'observer';
const isChoirRound = () => round.type === 'choir';
const isConsumerRound = () => round.type === 'consumer';
const isSlimeRound = () => round.type === 'slime';
const isUnseenRound = () => round.type === 'unseen';
const isLightboundRound = () => round.type === 'lightbound';
const isCultRound = () => round.type === 'cult';
const specialRound = () => Object.hasOwn(SPECIAL_ROUNDS, round.type) ? SPECIAL_ROUNDS[round.type] : null;
const roundSeconds = () => isObserverRound() ? OBS_ROUND.seconds : isCollectiveRound() || isChoirRound() || isConsumerRound() || isSlimeRound() || isLightboundRound() || isCultRound() || specialRound() ? Infinity : ROUND.seconds;
const monsterParam = new URLSearchParams(location.search).get('monster');
let forcedMonster = arrival ? arrival.run.forcedMonster : ROUND.types.includes(monsterParam) ? monsterParam : null;
// The same monster may come twice in a row, and never a third time.
const monsterStreak = arrival?.run.monsterStreak.slice() ?? [];
const recentMonsters = arrival?.run.recentMonsters?.slice() ?? [];
const favoredMonsters = {
  forest: ['unseen', 'observer', 'effigy', 'seamstress'], swamp: ['unseen', 'slime', 'consumer', 'burrower'],
  asylum: ['collective', 'observer', 'choir', 'bellman', 'lightbound'], prison: ['choir', 'unseen', 'consumer', 'bellman', 'lightbound'],
  manor: ['ghosts', 'observer', 'unseen', 'counterfeit', 'cult'], apartments: ['consumer', 'ghosts', 'slime', 'counterfeit'],
  school: ['collective', 'choir', 'unseen', 'bellman'], cathedral: ['choir', 'slime', 'effigy', 'bellman', 'cult'],
  accelerator: ['choir', 'observer', 'wickeater'], taxidermy: ['ghosts', 'unseen', 'effigy', 'counterfeit'],
  glasshouse: ['unseen', 'choir', 'seamstress'], offshore: ['observer', 'unseen', 'burrower'],
  serverfarm: ['consumer', 'unseen', 'wickeater', 'lightbound'], cave: ['burrower', 'seamstress'],
};
function pickMonster() {
  const supportsSlime = lake.on || !!MAP.slimeTrap;
  const fitsMap = (type) => (type !== 'slime' || supportsSlime) && (type !== 'lightbound' || MAP.interior);
  if (forcedMonster) return fitsMap(forcedMonster) ? forcedMonster : 'ghosts';
  const repeat = monsterStreak.length >= 2 && monsterStreak[0] === monsterStreak[1] ? monsterStreak[0] : null;
  // The Cult is rare: about one round in twenty-five (one in twelve where it is at home), never twice running.
  const cultChance = favoredMonsters[MAP_NAME]?.includes('cult') ? 0.08 : 0.04;
  if (fitsMap('cult') && ROUND.types.includes('cult') && monsterStreak[0] !== 'cult' && Math.random() < cultChance) {
    monsterStreak.unshift('cult'); if (monsterStreak.length > 2) monsterStreak.pop();
    return 'cult';
  }
  const pool = ROUND.types.filter((t) => t !== repeat && t !== 'cult' && fitsMap(t));
  pool.push(...pool.filter((t) => favoredMonsters[MAP_NAME]?.includes(t)));
  const type = pool[(Math.random() * pool.length) | 0];
  monsterStreak.unshift(type);
  if (monsterStreak.length > 2) monsterStreak.pop();
  return type;
}
// Every round raises the minimum ghost count, with a little extra variation at higher rounds.
// Past round 12 the count stops climbing (the frame rate would not survive it); the night grows harder in other ways.
const ghostCount = (n) => {
  const k = Math.min(n, 12), min = 4 + k;
  const max = min + 1 + Math.floor(k * 0.5);
  return min + Math.floor(Math.random() * (max - min + 1));
};
function menace() {
  const frenzy = round.rest <= 0 && round.n > 0 && round.t >= roundSeconds() - ROUND.frenzy;
  return { frenzy, lvl: Math.min(1.35, (round.n - 1) * ROUND.perRoundMenace) + (frenzy ? ROUND.frenzyMenace : 0), sneak: frenzy ? 1 : ROUND.sneak[round.n - 1] ?? 0.65 };
}
let tick = null;
function syncTick(on) {
  if (on === !!tick) return;
  if (tick) { stopClip(tick, 0.3); tick = null; }
  else tick = playClip(clockBuffer, 0.7, true);
}
// Dark Ghost (round 1+): drifts until the flashlight beam lands on it, then hunts and claws up close.
// Beam off it + held breath sends it far away; a few seconds of no light at all and it loses you.
const GHOST = {
  spawnMin: 25, spawnMax: 61,          // metres from the player (61 m = 200 ft)
  hp: 2, damage: 35, reach: 1.7,
  wander: 1.6, chase: 4.8, flee: 6.5,  // m/s: the player can build a lead while sprinting
  beamRange: 26, beamAngle: 0.34, noticeTime: 0.25,
  breathTime: 1.5, darkTime: 4, fleeDist: 50,
  size: 2.6, hover: 0.15, eyeGlow: 1.6, bodyBoost: 6,
  // stalking (before the beam ever finds them)
  grace: 30,                           // seconds into a round before they close in
  lurkMin: 11, lurkMax: 19,            // metres they hang back at, mostly behind you
  lurk: 2.6, dart: 7.5, creep: 2.0,    // m/s: repositioning, quick dashes (never with the beam on them), slow approach
  creepEvery: [9, 22], creepStop: 3.5, stare: 2.5,
  // jump scare: relighting after a match burns out
  scareChance: 0.3, scareCooldown: 40, scareDamage: 25,
};
const GHOST_ANIMS = {            // sheet, frames, fps, loop
  idle:   ['Idle', 6, 7, true],
  fly:    ['Fly', 4, 8, true],
  hurt:   ['Hurt', 10, 20, false],
  attack: ['Attack', 20, 28, false],      // fast swipe: the hit lands ~0.35 s in
  die:    ['Die', 23, 16, false],
};
const ghostTex = {};
for (const [name, [file]] of Object.entries(GHOST_ANIMS)) ghostTex[name] = pixelTex(`./monsters/DarkGhostPaid/${file}.png`);

const ghosts = [];
const round = { n: 0, t: 0, rest: 0, announced: false, type: 'ghosts' };
let roundsHere = 0;
const MAP_HINT = { labyrinth: 'Find the way out and the round is won', rural: 'Houses can be entered. E opens doors', cave: 'Watch your step near the water', hell: 'Keep out of the lava and clear of the vents' };
const bannerEl = document.getElementById('banner'), hurtEl = document.getElementById('hurt'), hpFill = document.getElementById('hpFill');
let bannerTimer = 0, hurtFlash = 0, cutsceneLine = '', cutsceneFrom = '';
function banner(title, sub) {
  bannerEl.innerHTML = '';
  const h = document.createElement('div'); h.className = 'big'; h.textContent = title;
  bannerEl.append(h);
  if (sub) { const s = document.createElement('div'); s.textContent = sub; bannerEl.append(s); }
  bannerEl.style.opacity = 1; bannerTimer = 4;
}
sfx.hurt = () => { thump(210, 60, 0.28, 0.9); noise1(0.15, 'lowpass', 1400, 300, 0.5); };

// Ghost voices. The chase loop runs while a beam is on one, or it is hunting.
// A non-lethal hit plays the shot reaction; the killing shot cuts over to the vanish.
const ghostOut = audioCtx.createGain();
ghostOut.gain.value = 0.9;
ghostOut.connect(mix.creatures);
function stopSrc(src) {
  if (!src) return;
  try { src.stop(); } catch (e) { /* already stopped */ }
  try { src.disconnect(); } catch (e) { /* already disconnected */ }
}
function creatureSoundPlace(g) {
  const px = camera.position.x, pz = camera.position.z;
  const dx = g.x - px, dz = g.z - pz, dist = Math.hypot(dx, dz) || 1e-6;
  const side = (dx * Math.cos(yaw) + dz * -Math.sin(yaw)) / dist;
  const vol = 0.55 * Math.pow(Math.max(0, 1 - dist / 48), 1.35);
  const smeared = echoReturn ? side * 0.64 + Math.sin(uTime.value * 2.3 + g.x * 0.31 + g.z * 0.28) * 0.38 : side;
  const muffled = facilityView ? 1 - Math.max(facilityView.rain, facilityView.wind) * 0.43 : 1;
  return { vol: Math.max(0.08, vol) * muffled, pan: Math.max(-1, Math.min(1, smeared)) };
}
function placeCreatureVoice(voice, source, place, volume, wallsAlreadyDampen = false) {
  const t = audioCtx.currentTime;
  if (t >= voice.spatialAt) {
    const { x, z } = camera.position;
    const distance = Math.hypot(source.x - x, source.z - z);
    voice.occluded = MAP.blocked?.(x, z, source.x, source.z, opened) ?? false;
    voice.filter.frequency.setTargetAtTime(voice.occluded ? 1050 + 2300 / (1 + distance / 5) :
      1000 + 17000 / (1 + (distance / 15) ** 1.35), t, 0.055);
    voice.spatialAt = t + 0.12;
  }
  voice.gain.gain.setTargetAtTime(place.vol * volume * (voice.occluded && !wallsAlreadyDampen ? 0.50 : 1), t, 0.043);
  voice.panner.pan.setTargetAtTime(place.pan * 0.86, t, 0.047);
}
function playCreatureClip(buffer, g, loop, volume = 1) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.loop = !!loop;
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.707;
  const panner = audioCtx.createStereoPanner();
  const place = creatureSoundPlace(g);
  gain.gain.value = 0;
  panner.pan.value = place.pan * 0.86;
  src.connect(filter).connect(gain).connect(panner).connect(ghostOut);
  const voice = { src, gain, panner, filter, spatialAt: -Infinity, occluded: false };
  placeCreatureVoice(voice, g, place, (loop ? 1 : 1.3) * volume);
  src.addEventListener('ended', () => {
    src.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect();
  }, { once: true });
  if (echoReturn) {
    const reflected = audioCtx.createStereoPanner();
    reflected.pan.value = -place.pan * 0.85;
    gain.connect(reflected).connect(echoReturn);
    src.addEventListener('ended', () => reflected.disconnect(), { once: true });
  }
  src.start();
  return voice;
}
function syncGhostChase(g, on) {
  if (on === !!g.chase) return;
  if (g.chase) { stopClip(g.chase, 0.12); g.chase = null; }
  if (on) g.chase = playCreatureClip(ghostChaseBuffer, g, true);
}
function updateGhostChase(g) {
  if (!g.chase) return;
  const place = creatureSoundPlace(g);
  placeCreatureVoice(g.chase, g, place, g.shot ? 0.35 : 1);
}
function playGhostShot(g) {
  if (g.shot) stopSrc(g.shot.src);
  g.shot = playCreatureClip(ghostShotBuffer, g, false);
  const voice = g.shot;
  voice.src.onended = () => { if (g.shot === voice) g.shot = null; };
}
function ghostNearPlace(g, reach) {
  const px = camera.position.x, pz = camera.position.z;
  const dx = g.x - px, dz = g.z - pz, dist = Math.hypot(dx, dz) || 1e-6;
  const side = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dist;
  const vol = Math.pow(Math.max(0, 1 - dist / reach), 1.2);
  const muffled = facilityView ? 1 - Math.max(facilityView.rain, facilityView.wind) * 0.43 : 1;
  const walls = MAP.blocked?.(px, pz, g.x, g.z, opened) ? 0.38 : 1;
  return { vol: vol * muffled * walls, pan: Math.max(-1, Math.min(1, side)) };
}
function stopGhostMotion(g) {
  if (g.steps) { stopClip(g.steps, 0.085); g.steps = null; }
  if (g.whisper) { stopClip(g.whisper, 0.18); g.whisper = null; }
  g.stepKey = null;
  g.terrainStepIn = 0;
}
// Follow the same surface and pace rules as the player, with positional playback.
function syncGhostMotion(g, speed, dt) {
  const moving = speed > 0.2 && g.state !== 'die' && g.state !== 'attack' && g.state !== 'scare' && g.state !== 'hurt';
  const running = speed >= 4;
  const surface = footstepSurface(g.x, g.z);
  const stepKey = moving ? `${running ? 'run' : 'walk'}:${surface}` : null;
  if (g.stepKey !== stepKey) {
    if (g.steps) { stopClip(g.steps, 0.09); g.steps = null; }
    g.stepKey = stepKey;
    g.terrainStepIn = 0;
    const buffer = surface === 'terrain' ? null : stepClip(running ? 'run' : 'walk', surface === 'concrete');
    if (stepKey && buffer) g.steps = playCreatureClip(buffer, g, true, 0.72);
  }
  if (moving && surface === 'terrain' && (g.terrainStepIn -= dt) <= 0) {
    g.terrainStepIn = terrainStepInterval(running);
    const place = ghostNearPlace(g, 32);
    if (place.vol > 0.02) playTerrainStep(g.x, g.z, running, ghostOut, place.vol * (g.chase ? 0.45 : 0.72), place.pan * 0.86);
  }
  if (g.steps) {
    const place = ghostNearPlace(g, 32);
    placeCreatureVoice(g.steps, g, place, g.chase ? 0.45 : 0.72, true);
  }
  const dist = Math.hypot(g.x - camera.position.x, g.z - camera.position.z);
  const idleNear = !moving && !g.chase && g.state === 'wander' && dist < 16;
  if (idleNear !== !!g.whisper) {
    if (g.whisper) { stopClip(g.whisper, 0.18); g.whisper = null; }
    if (idleNear) g.whisper = playCreatureClip(ghostWhisperBuffer, g, true, 0.8);
  }
  if (g.whisper) {
    const place = ghostNearPlace(g, 18);
    placeCreatureVoice(g.whisper, g, place, 0.76, true);
  }
}
function playGhostDeath(g) {
  if (g.chase) { stopSrc(g.chase.src); g.chase = null; }
  if (g.shot) { stopSrc(g.shot.src); g.shot = null; }
  stopGhostMotion(g);
  playCreatureClip(ghostGoneBuffer, g, false);
}
function silenceGhost(g) {
  if (g.chase) { stopSrc(g.chase.src); g.chase = null; }
  if (g.shot) { stopSrc(g.shot.src); g.shot = null; }
  stopGhostMotion(g);
}

function setAnim(g, name) {
  if (g.anim === name) return;
  g.anim = name; g.animT = 0; g.animDone = false;
  if (g.visual) updateGhostVisual(g, 0, true);
  else g.mesh.material.map = g.mesh.material.emissiveMap = ghostTex[name];
}
function updateGhostVisual(g, dt, restart = false) {
  const [, frames, fps, loop] = GHOST_ANIMS[g.anim];
  g.visual.update(g.anim, dt, frames / fps, loop, restart);
}
const creepDelay = () => GHOST.creepEvery[0] + Math.random() * (GHOST.creepEvery[1] - GHOST.creepEvery[0]);
const scare = { armed: false, cooldown: 0 };
// Sometimes, when a match has burned out and you get a light going again, one is already in your face.
function maybeScare() {
  if (!scare.armed) return;
  scare.armed = false;
  if (scare.cooldown > 0 || round.rest > 0 || round.t < GHOST.grace || finished) return;
  if (Math.random() > GHOST.scareChance + menace().lvl * 0.2) return;
  const { x, z } = camera.position;
  if (MAP.interior && MAP.blocked(x, z, x - Math.sin(yaw) * 1.3, z - Math.cos(yaw) * 1.3, opened)) return;
  let pickG = null, best = Infinity;
  for (const g of ghosts) {
    if (g.state !== 'wander') continue;
    const d = Math.hypot(g.x - camera.position.x, g.z - camera.position.z);
    if (d < best) { best = d; pickG = g; }
  }
  if (!pickG) return;
  scare.cooldown = GHOST.scareCooldown;
  pickG.state = 'scare'; pickG.timer = 0; pickG.struck = false; pickG.anim = '';
  setAnim(pickG, 'attack');
}
function ghostSpawn(a, d) {
  const p = camera.position;
  for (let i = 0; i < 56; i++) {
    const angle = a + i * 2.399, distance = Math.max(6, d - Math.floor(i / 7) * 3);
    const x = p.x + Math.cos(angle) * distance, z = p.z + Math.sin(angle) * distance;
    if (!MAP.interior || creatureWorld.walkable(x, z, 0.36)) return { x, z };
  }
  return { x: p.x, z: p.z };
}
function vanish(g) {
  if (g.chase) { stopSrc(g.chase.src); g.chase = null; }
  stopGhostMotion(g);
  playCreatureClip(ghostGoneBuffer, g, false);
  const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 12;
  Object.assign(g, ghostSpawn(a, d));
  g.mover?.reset();
  g.state = 'wander'; g.mode = 'lurk'; g.away = 12; g.tx = g.x; g.tz = g.z; g.retarget = 0; g.lit = 0; g.creepIn = creepDelay();
}
// Health climbs with the rounds so the dead keep up with better guns: 2 shots in round 1, 4 by round 5, 7 by round 11, 12 by round 21.
// A brute takes about twice as much. Past round 31 it stops climbing.
function ghostHp(brute) {
  const n = Math.min(Math.max(1, round.n), 31), hp = GHOST.hp + Math.floor((n - 1) / 2);
  return brute ? hp * 2 + 1 : hp;
}
function makeGhost(x, z, brute = false) {
  // Lit by the flashlight like everything else; a faint emissive keeps the red eyes just visible in the dark.
  const mat = new THREE.MeshLambertMaterial({ map: ghostTex.idle, emissiveMap: ghostTex.idle, emissive: 0xff6060, emissiveIntensity: GHOST.eyeGlow, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.color.setScalar(GHOST.bodyBoost);   // the sheet is near-black; lift it so the beam shows a shape
  if (brute) mat.emissiveIntensity *= 1.25;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(GHOST.size, GHOST.size), mat);
  const sizeScale = brute ? Math.min(1.85, 1.42 + (round.n - 3) * 0.06 + Math.random() * 0.1) : 0.86 + Math.random() * 0.2;
  mesh.scale.setScalar(sizeScale);
  scene.add(mesh);
  const hp = ghostHp(brute);
  const g = { x, z, mesh, sizeScale, brute, state: 'wander', hp, maxHp: hp, anim: '', animT: 0, animDone: false, tx: x, tz: z, retarget: 0,
              lit: 0, calm: 0, dark: 0, timer: 0, struck: false,
              mode: 'lurk', creepIn: creepDelay(), creepT: 0, stare: 0, away: 0, oa: 0, od: 15, flip: false, phase: Math.random() * 6 };
  if (MAP.interior) g.mover = new ObserverMovement(creatureWorld, 0.29);
  setAnim(g, 'idle');
  loadPaleHoursGhost(GHOST.size, brute).then(visual => {
    if (!mesh.parent || g.state === 'die') { visual.dispose(); return; }
    visual.root.position.copy(mesh.position);
    visual.root.quaternion.copy(mesh.quaternion);
    visual.root.scale.copy(mesh.scale);
    mesh.removeFromParent();
    mesh.geometry.dispose();
    mesh.material.dispose();
    g.visual = visual;
    g.mesh = visual.root;
    scene.add(g.mesh);
    updateGhostVisual(g, g.animT, true);
  }).catch(error => console.warn('Could not load Pale Hours ghost', error));
  return g;
}
function removeGhost(g) {
  silenceGhost(g);
  if (g.visual) g.visual.dispose();
  else { scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); }
  const i = ghosts.indexOf(g); if (i >= 0) ghosts.splice(i, 1);
}
const ghostsAlive = () => ghosts.reduce((n, g) => n + (g.state !== 'die' ? 1 : 0), 0);

function startRound(n) {
  cult?.stop();
  while (ghosts.length) removeGhost(ghosts[0]);
  if (obsRound.active) obsRound.stop();
  if (collective.active) collective.stop();
  if (choir.active) choir.stop();
  if (consumer.active) consumer.stop();
  if (slime.active) slime.stop();
  if (unseen.active) unseen.stop();
  if (lightbound.active) lightbound.stop();
  if (specialRounds.active) specialRounds.stop();
  if (inv.radarTier < 1) radar.equipped = false;       // a tracker works in any round, so it stays out
  setHuntSilence(false);                 // an Observer round can end mid-hunt: bring the world's sound back
  setDusk(false);
  round.n = n; round.t = 0; round.rest = 0; round.pickIn = 0; round.announced = false;
  lore.spawnRound(n);
  round.type = pickMonster();
  if (round.type === 'observer') { startObserverRound(); return; }
  if (round.type === 'collective') { startCollectiveRound(); return; }
  if (round.type === 'choir') { startChoirRound(); return; }
  if (round.type === 'consumer') { startConsumerRound(); return; }
  if (round.type === 'slime') { startSlimeRound(); return; }
  if (round.type === 'unseen') { unseen.start(n, camera.position, yaw); return; }
  if (isLightboundRound()) { startLightboundRound(n); return; }
  if (isCultRound()) return;
  if (specialRound()) {
    if (round.type === 'effigy') flashlight.battery = Math.max(flashlight.battery, 0.35);
    specialRounds.start(round.type, n);
    return;
  }
  const count = ghostCount(n), r = mulberry(CFG.seed ^ (n * 7919));
  const bruteCount = n < 3 ? 0 : Math.min(count, Math.max(1, Math.floor(count * Math.min(0.38, 0.14 + (n - 3) * 0.04))));
  const brutes = new Set();
  while (brutes.size < bruteCount) brutes.add((r() * count) | 0);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(GHOST.spawnMin ** 2 + r() * (GHOST.spawnMax ** 2 - GHOST.spawnMin ** 2));   // even over the ring
    const point = ghostSpawn(a, d);
    ghosts.push(makeGhost(point.x, point.z, brutes.has(i)));
  }
  if (n > 1) banner(`ROUND ${n}`, `${count} dark ghosts are out there`);
}
function endGame(won) {
  finished = true; playing = false;
  cult?.stop();
  syncVideoCamera(false);
  for (const g of ghosts) silenceGhost(g);
  if (obsRound.active) obsRound.observer.silence();
  if (collective.active) { for (const k of collective.kids) k.speed = 0; collective.S.phase = collective.S.phase === 'done' ? 'done' : 'captured'; }
  if (choir.active) choir.stop();
  if (consumer.active) consumer.stop();
  if (slime.active) slime.stop();
  if (unseen.active) unseen.stop();
  if (lightbound.active) lightbound.stop();
  if (specialRounds.active) specialRounds.stop();
  setHuntSilence(false);
  syncTick(false);
  if (!won && deathCause !== 'cult') playClip(dyingBuffer, 0.9);
  document.getElementById('title').textContent = won ? 'DAWN' : deathCause === 'time' ? 'TOO LATE' : 'YOU DIED';
  document.getElementById('sub').textContent = won ? `You reached round ${round.n}.` : ({ drowned: `You drowned in round ${round.n}.`, fallingGlass: 'The glass roof came down.', halon: 'The sealed aisle ran out of air.', cold: 'Your body heat ran out.', fall: 'You lost the catwalk in the storm.', brine: 'The brine burned through.', magnet: 'The field dragged you to the wall.', burned: `You burned in round ${round.n}.`, observer: 'It was right behind you.', blast: 'You were standing too close.', choir: 'The Choir found you by sound.', consumer: 'The Consumer caught your scent.', slime: 'The slime rolled over you.', unseen: 'The Unseen struck from behind.', collective: { shot: 'You hurt one of them. All of them came.', light: 'You kept your light on.', dark: 'You let it go dark.', ran: 'You ran.', approached: 'You went too close.' }[collective.S.reason] || 'They took you together.', time: `Dawn came with ${obsRound.total - obsRound.burned} of the bodies still unburned.`, sanity: 'Your mind was empty for too long.', cutscene: cutsceneLine }[deathCause] || `The dead took you in round ${round.n}.`);
  document.getElementById('go').textContent = TOUCH ? 'Tap to play again' : 'Click to play again';
  if (!won && deathCause === 'lightbound') document.getElementById('sub').textContent = 'The lights held them long enough to drain you.';
  if (!won && deathCause === 'cult') {
    document.getElementById('title').textContent = 'YOU JOINED THE CULT';
    document.getElementById('sub').textContent = `They kept a seat for you. Your run ended in round ${round.n}.`;
  }
  if (!won && Object.hasOwn(SPECIAL_ROUNDS, deathCause)) document.getElementById('sub').textContent = SPECIAL_ROUNDS[deathCause].death;
  // Dying is a scene of its own (cinema/Cutscenes.js): the death screen waits until it has played. A win goes straight there.
  if (won || deathCause === 'cult' || !cutscenes.playDeath(deathCause, showEndScreen, cutsceneFrom)) showEndScreen();
  const ending = won ? 'dawn' : deathCause === 'collective' ? `collective ${collective.S.reason || ''}`.trim() : deathCause;
  offerScore({
    won: !!won,
    round: Math.max(1, round.n || 1),
    seconds: Math.max(0, Math.min(86400, Math.round(elapsed))),
    map: (META.label || MAP_NAME || '').slice(0, 40),
    ending: ending.slice(0, 40),
  });
}
function showEndScreen() {
  overlay.style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
}
function roundWon(cleared, line, restraintParts = 0) {
  if (finished || round.rest > 0) return;
  roundsHere++;
  recentMonsters.unshift(round.type);
  if (recentMonsters.length > 4) recentMonsters.pop();
  if (choir.active) choir.stop();
  if (consumer.active) consumer.stop();
  if (slime.active) slime.stop();
  if (unseen.active) unseen.stop();
  if (lightbound.active) lightbound.stop(lightbound.remaining === 0);
  if (specialRounds.active) specialRounds.stop(specialRounds.won);
  banner(`ROUND ${round.n} SURVIVED`, line || (cleared ? 'Every ghost is gone' : 'You outlasted them'));
  addParts(3 + restraintParts);
  toast(restraintParts ? `3 salvage + ${restraintParts} parts for restraint (${inv.parts} total).` : `Salvaged 3 parts (${inv.parts}). C opens the workbench`);
  round.rest = ROUND.rest; round.pickIn = 1.6;          // and in a moment, the survivor's pick
  for (const g of ghosts) if (g.state !== 'die') { g.state = 'flee'; g.timer = 0; }
}
const STAIN_HEALTH = 12, STAIN_MAX = 220, STAIN_RED = 0.1, STAIN_RED_CAP = 0.8;
function stainFromInnocent() {
  inv.innocents++;
  inv.maxHealth = Math.min(STAIN_MAX, inv.maxHealth + STAIN_HEALTH);
  inv.health = Math.min(inv.maxHealth, inv.health + STAIN_HEALTH);
  visionUniforms.uStain.value = Math.min(STAIN_RED_CAP, inv.innocents * STAIN_RED);
  toast(`The blood stays in you. Maximum health ${inv.maxHealth}.`);
}
function damagePlayer(amount, cause = 'ghost') {
  if (finished) return;
  if (amount >= 3) mix.accent(Math.min(1, amount / 24));
  sanity.value = Math.max(0, sanity.value - Math.min(12, amount * 0.18));
  amount *= endlessHurt();
  armor.quiet = 0;
  if (armor.shield > 0) {                                 // the armor takes it first
    const took = Math.min(armor.shield, amount);
    armor.shield -= took; amount -= took; armor.flash = 1;
    if (armor.shield <= 0) { sfx.shieldBreak(); toast(`Your ${ARMOR_TIERS[armor.tier].name.toLowerCase()} gives way`); }
    if (amount <= 0) { sfx.shieldHit(); return; }
  }
  inv.health = Math.max(0, inv.health - amount);
  hurtFlash = 1; sfx.hurt();
  if (inv.health <= 0) { deathCause = cause; endGame(false); }
}
function aggro(g) {
  if (g.state === 'die' || g.state === 'chase' || g.state === 'attack' || g.state === 'alert') return;
  g.state = 'alert'; g.timer = 0.25; g.calm = 0; g.dark = 0;
}
// Bullet: nearest living ghost within half a metre of the aim line.
const aim = new THREE.Vector3();
function ghostHit(maxRange = BULLET_RANGE, spread = 0.3, damage = 1) {
  camera.getWorldDirection(aim);
  const o = camera.position;
  let best = null, bestT = maxRange;
  for (const g of ghosts) {
    if (g.state === 'die') continue;
    const cx = g.x - o.x, cy = g.mesh.position.y - o.y, cz = g.z - o.z;
    const t = cx * aim.x + cy * aim.y + cz * aim.z;
    if (t <= 0 || t >= bestT) continue;
    const mx = cx - aim.x * t, my = cy - aim.y * t, mz = cz - aim.z * t;
    const targetScale = g.sizeScale || 1;
    if (mx * mx + mz * mz < spread * targetScale * targetScale && Math.abs(my) < 0.9 * targetScale) { best = g; bestT = t; }
  }
  if (!best || MAP.blocked(o.x, o.z, best.x, best.z, opened)) return false;      // rock stops attacks
  best.x += aim.x * 0.6; best.z += aim.z * 0.6;
  hurtGhost(best, damage);
  return true;
}
// A bullet, a blade or a blast: it staggers, or it dies. The dead sometimes leave a request, sometimes a part.
function hurtGhost(g, damage) {
  if (g.state === 'die') return;
  g.hp -= damage;
  if (g.hp <= 0) {
    g.state = 'die'; setAnim(g, 'die'); playGhostDeath(g);
    if (Math.random() < 0.45) dropLore('request', g.x, g.z, 'It leaves something behind.');
    // what it was carrying falls where it died: a brute always leaves a proper bundle, the rest sometimes leave a part or two
    if (g.brute) dropBundle(g.x, g.z, 2, 'blue'); else if (Math.random() < 0.45) dropBundle(g.x, g.z, 1 + ((Math.random() * 2) | 0), Math.random() < 0.12 ? 'common' : null);
  } else { g.state = 'hurt'; g.timer = 0.5; g.anim = ''; setAnim(g, 'hurt'); playGhostShot(g); }
}

// Ambush: from round 2 on, a long run with nothing happening draws one or two ghosts out of the dark, off to the side ahead of you.
// They come in hunting, so there is something to shoot on the way. Not in a Collective round (its rules are about light and fleeing).
const AMBUSH = { after: 14, cool: [38, 60], near: 12, far: 17, maxLive: 2 };
const ambush = { run: 0, cool: 20 };
function updateAmbush(dt, inControl, running) {
  const quiet = !inControl || finished || round.n < 2 || round.rest > 0 || isCollectiveRound() || cutscenes.active || labLeaving || slimeTravel.t >= 0;
  ambush.cool = Math.max(0, ambush.cool - dt);
  // travelling counts (running fully, walking between sprints at 60%, since stamina runs out in 8 s); standing still drains it, a short stop does not reset it
  ambush.run = quiet ? 0 : running ? ambush.run + dt : playerSpeedNow > 0 ? ambush.run + dt * 0.6 : Math.max(0, ambush.run - dt * 0.8);
  if (quiet || ambush.run < AMBUSH.after || ambush.cool > 0) return;
  if (ghosts.filter((g) => g.ambush && g.state !== 'die').length >= AMBUSH.maxLive) return;
  const count = Math.random() < Math.min(0.6, 0.15 + round.n * 0.04) ? 2 : 1, px = camera.position.x, pz = camera.position.z;
  let made = 0;
  for (let tries = 0; tries < 16 && made < count; tries++) {
    const side = Math.random() < 0.5 ? -1 : 1, a = yaw + side * (0.45 + Math.random() * 0.7);   // ahead, but out of the beam
    const d = AMBUSH.near + Math.random() * (AMBUSH.far - AMBUSH.near);
    const x = px - Math.sin(a) * d, z = pz - Math.cos(a) * d;
    if (!creatureWorld.walkable(x, z, 0.45) || MAP.blocked(px, pz, x, z, opened)) continue;
    const g = makeGhost(x, z, round.n >= 6 && Math.random() < 0.2);
    g.ambush = true; g.state = 'alert'; g.timer = 0.35 + made * 0.4;
    ghosts.push(g); playGhostShot(g); made++;
  }
  if (!made) return;
  ambush.run = 0; ambush.cool = AMBUSH.cool[0] + Math.random() * (AMBUSH.cool[1] - AMBUSH.cool[0]);
  thump(110, 40, 0.3, 0.35); noise1(0.35, 'bandpass', 1400, 500, 0.3);
}
function updateMonsters(dt, inControl, beamOn, running) {
  syncTick(inControl && menace().frenzy && !huntSilence);
  updateObserver(dt, inControl);
  updateCollective(dt, inControl, running);
  updateChoir(dt, inControl);
  updateConsumer(dt, inControl);
  updateSlime(dt, inControl);
  updateAmbush(dt, inControl, running);
  const px = camera.position.x, pz = camera.position.z;
  if (!inControl) {
    for (const g of ghosts) {
      if (g.chase) { stopSrc(g.chase.src); g.chase = null; }
      stopGhostMotion(g);
    }
  } else {
    // The hall takes over on the first controllable frame after the opening.
    if (isCultRound() && round.rest <= 0) return;
    if (!round.announced) {
      round.announced = true;
      if (isObserverRound()) announceObserver();
      else if (isCollectiveRound()) announceCollective();
      else if (isChoirRound()) announceChoir();
      else if (isConsumerRound()) announceConsumer();
      else if (isSlimeRound()) announceSlime();
      else if (isUnseenRound()) announceUnseen();
      else if (isLightboundRound()) banner('THE LIGHTBOUND', 'Shoot them under the fixtures. Flip the breaker to steady the lights.');
      else if (specialRound()) banner(specialRound().name.toUpperCase(), specialRound().objective);
      else {
        banner(META.label, `Round ${round.n}. ${ghosts.length} dark ghosts are out there. Keep your light off them`);
        const hint = META.hint || MAP_HINT[MAP_NAME];
        if (hint) toast(hint);
      }
    }
    if (round.pickIn > 0 && (round.pickIn -= dt) <= 0 && !finished) picker.open(pickOffers());
    if (round.rest > 0) {
      round.rest -= dt;
      if (round.rest <= 0) {                               // sometimes the next round does not simply begin
        const next = round.n + 1;
        if (slimeTravel.pending) beginSlimeTravel(next);
        else if (roundsHere >= ROUND.locationRounds) travelToNextMap(next);
        else if (!cutscenes.maybePlay(() => startRound(next), { force: CUTSCENE_PARAM })) startRound(next);
      }
    }
    else if (isObserverRound()) {
      round.t += dt;
      if (obsRound.total && obsRound.burned >= obsRound.total) { obsRound.stop(); setHuntSilence(false); roundWon(true, 'The dead are ash. Whatever was watching has gone.'); }
      else if (round.t >= OBS_ROUND.seconds) { deathCause = 'time'; endGame(false); }
    } else if (isCollectiveRound()) {
      round.t += dt;
      if (collective.escaped) {
        const px = camera.position.x - Math.sin(yaw) * 2.6, pz = camera.position.z - Math.cos(yaw) * 2.6;
        const restraint = collective.S.last && !collective.S.reason ? 2 : 0;
        collective.stop();
        roundWon(true, collective.S.companion ? 'They let you go. One of them stayed to watch.' : 'They let you go.', restraint);
        if (dropLore('child', px, pz)) setTimeout(() => toast('Something has been left on the ground ahead of you.'), 2500);
      }
    } else if (isChoirRound()) {
      round.t += dt;
      if (choir.death) roundWon(true, 'The Hive Mind is dead. The singers have gone quiet.');
    } else if (isConsumerRound()) {
      round.t += dt;
      if (consumer.dead) roundWon(true, 'The Consumer is dead. The survivors escape.');
    } else if (isSlimeRound()) {
      round.t += dt;
    } else if (isUnseenRound()) {
      round.t += dt;
      if (!unseen.monsters.length) roundWon(true, 'The last of the Unseen has fallen.');
      else if (round.t >= ROUND.seconds) roundWon(false, 'You outlasted the Unseen.');
    } else if (isLightboundRound()) {
      round.t += dt;
      if (lightbound.remaining === 0) roundWon(true, 'The last soul lets go of the circuit.');
    } else if (specialRound()) {
      round.t += dt;
      if (specialRounds.won) roundWon(true, specialRound().ending);
    } else {
      round.t += dt;
      const alive = ghostsAlive();
      if (alive === 0 || round.t >= ROUND.seconds) roundWon(alive === 0);
    }
    scare.cooldown = Math.max(0, scare.cooldown - dt);
    const m = menace();
    clockEl.style.color = m.frenzy ? '#c0564a' : '';
    camera.getWorldDirection(aim);
    const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      const dx = px - g.x, dz = pz - g.z, dist = Math.hypot(dx, dz) || 1e-6;
      // is the beam on this ghost?
      const ey = g.mesh.position.y - camera.position.y, len = Math.hypot(dist, ey);
      const lit = beamOn && dist < GHOST.beamRange && Math.acos(Math.min(1, (-dx * aim.x + ey * aim.y - dz * aim.z) / len)) < GHOST.beamAngle && !MAP.blocked(px, pz, g.x, g.z, opened);
      let vx = 0, vz = 0, goal = null;
      const go = (tx, tz, speed) => {
        const ex = tx - g.x, ez = tz - g.z, d = Math.hypot(ex, ez);
        if (d > 0.05) { vx = ex / d * speed; vz = ez / d * speed; goal = { x: tx, z: tz }; }
        return d;
      };
      // Hunting ghosts give up when the beam is off them and you hold your breath, or when the light stays off.
      if (g.state === 'chase' || g.state === 'attack') {
        g.calm = !lit && holdingBreath ? g.calm + dt : 0;
        g.dark = beamOn ? 0 : g.dark + dt;
        if (g.calm >= GHOST.breathTime) { g.state = 'flee'; g.timer = 0; }
        else if (g.dark >= GHOST.darkTime) { g.state = 'wander'; g.retarget = 0; g.lit = 0; }
      }
      if (g.state === 'wander' && MAP_NAME === 'taxidermy' && MAP.zoneAt(g.x, g.z) === 'specimenHall' &&
          dist < 21 && Math.sin(uTime.value * 0.48 + g.phase) > 0.15) {
        // A standing ghost gives itself away by moving only when the beam stays on it.
        setAnim(g, 'idle');
        g.lit = lit ? g.lit + dt : 0;
        if (g.lit > GHOST.noticeTime) aggro(g);
      } else if (g.state === 'wander') {
        // Stalking. They hang back behind you, dash to keep up, and every so often pace slowly in to stare.
        const desperate = flashlight.battery <= 0;            // down to matches: closer, and more often
        let speed = 0;
        if (round.t < GHOST.grace || g.away > 0) {
          // start of a round, or just driven off: drift where it is
          g.away -= dt; g.retarget -= dt; speed = GHOST.wander;
          if (g.retarget <= 0 || go(g.tx, g.tz, speed) < 1) {
            const a = Math.random() * Math.PI * 2;
            g.tx = g.x + Math.cos(a) * 8; g.tz = g.z + Math.sin(a) * 8; g.retarget = 6 + Math.random() * 6;
          }
        } else if (g.mode === 'creep') {
          g.creepT += dt;
          // A sneaking ghost comes all the way in and swipes once, unlit. Holding your breath as it arrives makes it only stare.
          if (dist > (g.sneak ? GHOST.reach * 0.9 : GHOST.creepStop * (desperate ? 0.7 : 1))) { speed = GHOST.creep * (desperate ? 1.4 : 1) * (1 + m.lvl); go(px, pz, speed); }
          else if (g.sneak && !holdingBreath && !lit) { g.state = 'attack'; g.sneaking = true; g.struck = false; g.dark = 0; g.calm = 0; setAnim(g, 'attack'); }
          else g.stare += dt;
          if (g.stare > GHOST.stare || g.creepT > 30) { g.mode = 'lurk'; g.retarget = 0; g.creepIn = creepDelay(); }
        } else {
          g.retarget -= dt;
          if (g.retarget <= 0) {
            g.oa = yaw + Math.PI + (Math.random() - 0.5) * 4.4;                 // mostly behind or beside
            g.od = (GHOST.lurkMin + Math.random() * (GHOST.lurkMax - GHOST.lurkMin)) * (desperate ? 0.6 : 1) * (1 - Math.min(0.5, m.lvl * 0.5));
            g.retarget = 4 + Math.random() * 6;
          }
          const tx = px - Math.sin(g.oa) * g.od, tz = pz - Math.cos(g.oa) * g.od;
          const gap = Math.hypot(tx - g.x, tz - g.z);
          speed = gap > 9 ? GHOST.dart : gap > 1 ? GHOST.lurk : 0;
          if (lit) speed = Math.min(speed, GHOST.creep);                        // never dashes with the beam on it
          if (speed) go(tx, tz, speed);
          g.creepIn -= dt * (desperate ? 2 : 1) * (1 + m.lvl * 2);
          if (g.creepIn <= 0) { g.mode = 'creep'; g.stare = 0; g.creepT = 0; g.sneak = Math.random() < m.sneak; }
        }
        setAnim(g, speed > 3 ? 'fly' : 'idle');
        g.lit = lit ? g.lit + dt : 0;
        if (g.lit > GHOST.noticeTime) aggro(g);
      } else if (g.state === 'scare') {
        // locked in your face for one swipe, then gone
        g.timer += dt;
        g.x = px - Math.sin(yaw) * 1.3; g.z = pz - Math.cos(yaw) * 1.3;
        if (!g.struck && g.animT * GHOST_ANIMS.attack[2] >= 10) { g.struck = true; damagePlayer(GHOST.scareDamage); }
        if (g.animDone || g.timer > 1.4) vanish(g);
      } else if (g.state === 'alert') {
        g.timer -= dt;
        if (g.timer <= 0) g.state = 'chase';
      } else if (g.state === 'chase') {
        setAnim(g, 'fly');
        go(px, pz, GHOST.chase * (1 + m.lvl * 0.1));
        if (dist < GHOST.reach) { g.state = 'attack'; g.sneaking = false; g.struck = false; setAnim(g, 'attack'); }
      } else if (g.state === 'attack') {
        if (!g.struck && g.animT * GHOST_ANIMS.attack[2] >= 10) {
          g.struck = true;
          if (dist < GHOST.reach + 0.9 && !MAP.blocked(px, pz, g.x, g.z, opened)) damagePlayer(GHOST.damage);
        }
        if (g.animDone) {
          if (g.sneaking) { g.sneaking = false; g.state = 'wander'; g.mode = 'lurk'; g.retarget = 0; g.lit = 0; g.creepIn = creepDelay(); }
          else g.state = 'chase';
        }
      } else if (g.state === 'flee') {
        setAnim(g, 'fly');
        g.timer += dt;
        go(g.x - dx / dist * 10, g.z - dz / dist * 10, GHOST.flee);
        if (round.rest <= 0 && (dist > GHOST.fleeDist || g.timer > 12)) { g.state = 'wander'; g.mode = 'lurk'; g.away = 15; g.tx = g.x; g.tz = g.z; g.retarget = 0; g.lit = 0; g.creepIn = creepDelay(); }
      } else if (g.state === 'hurt') {
        g.timer -= dt;
        if (g.timer <= 0) g.state = 'chase';
      } else if (g.state === 'die' && g.animDone) { removeGhost(g); continue; }

      g.beamHold = lit ? 0.45 : Math.max(0, (g.beamHold || 0) - dt);
      const hunting = g.state !== 'die' && g.state !== 'hurt' && (g.beamHold > 0 || g.state === 'chase' || g.state === 'attack' || g.state === 'scare');
      syncGhostChase(g, hunting);
      updateGhostChase(g);
      const beforeX = g.x, beforeZ = g.z;
      if (g.mover && goal) g.mover.update(dt, g, goal, Math.hypot(vx, vz));
      else { g.x += vx * dt; g.z += vz * dt; }
      syncGhostMotion(g, dt > 0 ? Math.hypot(g.x - beforeX, g.z - beforeZ) / dt : 0, dt);
      const side = vx * rightX + vz * rightZ;
      if (Math.abs(side) > 0.3) g.flip = side > 0;      // sheet faces left
    }
  }
  // animate + face the camera (also while paused, so nothing pops)
  for (const g of ghosts) {
    const [, frames, fps, loop] = GHOST_ANIMS[g.anim];
    if (inControl) g.animT += dt;
    let f = Math.floor(g.animT * fps);
    if (loop) f %= frames; else if (f >= frames) { f = frames - 1; g.animDone = true; }
    if (g.visual) {
      if (inControl) updateGhostVisual(g, dt);
    } else {
      const u0 = f / frames, u1 = (f + 1) / frames, uv = g.mesh.geometry.attributes.uv;
      uv.setX(0, g.flip ? u1 : u0); uv.setX(2, g.flip ? u1 : u0); uv.setX(1, g.flip ? u0 : u1); uv.setX(3, g.flip ? u0 : u1);
      uv.needsUpdate = true;
    }
    g.mesh.position.set(g.x, MAP.groundY(g.x, g.z) + GHOST.size * g.sizeScale / 2 + GHOST.hover + Math.sin(uTime.value * 1.7 + g.phase) * 0.08, g.z);
    g.mesh.rotation.y = Math.atan2(px - g.x, pz - g.z);
  }
  // HUD
  hpFill.parentElement.style.width = `${Math.min(220, 110 * inv.maxHealth / 100)}px`;
  hpFill.style.transform = `scaleX(${inv.health / inv.maxHealth})`;
  hpFill.parentElement.classList.toggle('low', inv.health / inv.maxHealth <= 0.25);
  updateArmor(dt, inControl);
  hurtFlash = Math.max(0, hurtFlash - dt * 1.4);
  const blood = Math.min(0.62, inv.innocents * 0.07);
  hurtEl.style.opacity = Math.min(0.95, hurtFlash * 0.8 + (inv.health / inv.maxHealth <= 0.25 && !finished ? 0.18 : 0) + blood);
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) bannerEl.style.opacity = 0; }
}

// ───────────────────────── the Observer round ─────────────────────────
// Find and burn three bodies in six minutes while the Observer watches. The creature lives in src/observer/;
// here it is given the map, the lights, the sound buses and the hooks it uses to frighten and to kill.
function setHuntSilence(on) {
  if (on === huntSilence) return;
  huntSilence = on;
  const t = on ? 0.12 : 2.5, live = mapSoundOn && !finished;
  rampParam(mapBus.gain, on || !live ? 0 : 1, t);
  rampParam(skyBus.gain, on || !live ? 0 : 1, t);
  rampParam(outdoorGain.gain, on ? 0 : indoors ? 0.1 : 1, t);
  rampParam(kidsBus.gain, on ? 0 : 1, t);
}
function flickerFlashlight(kind) {
  if (flashlight.flickerAge >= 0 || !flashlight.equipped) return;
  flashlight.flickerAge = 0;
  flashlight.flickerDur = kind === 'hunt' ? 0.9 + Math.random() * 1.4 : kind === 'dip' ? 0.35 + Math.random() * 0.3 : 0.6 + Math.random() * 0.8;
}
// ───────────────────────── the story: fragments in the world, and the journal that keeps them ─────────────────────────
// src/lore/ holds the text. Reading pauses the world; what you find is kept between nights.
let journalWasPlaying = false;
let helpWasPlaying = false;
const journal = createJournal({
  onOpen() { journalWasPlaying = playing; playing = false; holdingBreath = false; gun.aiming = false; syncFootsteps(null); if (document.pointerLockElement) document.exitPointerLock(); overlay.style.display = 'none'; },
  onClose() {
    if (journalWasPlaying && !finished) {
      playing = true;
      if (TOUCH) overlay.style.display = 'none';
      else { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => { playing = false; overlay.style.display = 'flex'; }); }
    }
    else overlay.style.display = 'flex';
  },
});
// The lore board (lore/storyboard.js): every fragment found so far, pinned and strung together. Opened from the title.
const storyboard = createStoryboard({ getFound: () => journal.snapshot(), markRead: (id) => journal.markRead(id) });

const roundHelpStyle = document.createElement('style');
roundHelpStyle.textContent = `
#roundHelp { position: fixed; inset: 0; z-index: 21; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.92); font-family: "Courier New", monospace; color: #b9b3a3; }
#roundHelp[hidden] { display: none; }
#roundHelp .hbox { width: min(720px, 92vw); max-height: min(640px, 88vh); display: flex; flex-direction: column; border: 1px solid rgba(185,179,163,.28); background: #0c0b09; }
#roundHelp .hhead { padding: 16px 22px 12px; border-bottom: 1px solid rgba(185,179,163,.2); letter-spacing: 5px; font-size: 14px; color: #e6dfc8; }
#roundHelp .hbody { padding: 18px 22px 8px; overflow-y: auto; }
#roundHelp .hbody p { margin: 0 0 14px; font-size: 15px; line-height: 1.65; color: #d3ccb2; }
#roundHelp .hfoot { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 22px; border-top: 1px solid rgba(185,179,163,.2); font-size: 12px; letter-spacing: 2px; opacity: .7; }
#roundHelp button { padding: 8px 14px; border: 1px solid rgba(185,179,163,.4); background: transparent; color: #e6dfc8; font: 12px "Courier New", monospace; letter-spacing: 2px; }
`;
document.head.appendChild(roundHelpStyle);
const roundHelp = document.createElement('div');
roundHelp.id = 'roundHelp';
roundHelp.hidden = true;
roundHelp.innerHTML = `<div class="hbox"><div class="hhead"></div><div class="hbody"></div><div class="hfoot"><span>I OR ESC CLOSES THIS</span><button type="button">CLOSE</button></div></div>`;
document.body.appendChild(roundHelp);
roundHelp.querySelector('button').addEventListener('click', () => closeRoundHelp());
const helpTitle = roundHelp.querySelector('.hhead');
const helpBody = roundHelp.querySelector('.hbody');
const helpText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function roundBrief() {
  const spec = specialRound();
  let title = 'THIS ROUND';
  let lines = ['Survive until the round ends, or do what the words at the start asked of you.'];
  if (isObserverRound()) {
    title = 'THE OBSERVER';
    lines = [
      'Find every body and burn it with a match before dawn. Hold M to light the match, then hold E at the body until it catches. One match is not enough for the whole round, so search as you go.',
      'Burning a body wears on your mind, and a body that is still on fire keeps wearing it down. Hold your breath while standing still to recover, or drink a potion.',
      'Something is watching. If it is right behind you, the night ends. Dawn with a body still unburned also ends it. Burning the last body wins.',
    ];
  } else if (isCollectiveRound()) {
    title = 'THE COLLECTIVE';
    lines = [
      'They close in around you. You win by keeping every rule until they leave, then walking clear of where they stood.',
      'Never hurt one. A shot or a strike brings all of them at once.',
      'Put the flashlight away once they are close. A match is allowed, and so is a light that is already on in the building. Standing in the dark for long brings them.',
      'Walk away slowly. Running, or stepping right up to one of them, brings them. When they have gone, keep going until you are well clear. The last one may stay and watch. Do not go back to it.',
    ];
  } else if (isChoirRound()) {
    title = 'THE CHOIR';
    lines = [
      'They hunt by sound: footsteps, breath, doors, and gunfire. Walk. Hold Space to quiet your breath. The round does not end on a timer.',
      'A listener from a chest can point you toward the nest. The radar feedback marks the singers. Get close to the nest and the Hive Mind shows itself.',
      'Kill the Hive Mind. Singers keep coming until it is dead. That is the only way to win.',
    ];
  } else if (isConsumerRound()) {
    title = 'THE CONSUMER';
    lines = [
      'Civilians are loose. Hold E beside one for a few seconds to get them out. Each rescue is worth parts. Killing the creature is what wins the round.',
      'It feeds and grows. Listen for its footsteps and the scrape along the ceiling. Stop the feeding where you can, and kill it before it gets too large.',
      MAP.interior
        ? 'Inside, the rooms carry the sound. Move quieter than you would outdoors.'
        : 'As it grows, the weather turns against you. Get under a roof when the air darkens.',
    ];
  } else if (isSlimeRound()) {
    title = 'THE SLIME';
    lines = [
      'Nothing you carry kills the large one. Shots only slow it. Shoot the small ones before they cling to your legs. The round does not end on a timer.',
      MAP.slimeTrap
        ? 'Follow the DELUGE mark. Pull the valve, then lure the slime through the flooded bay. The water is what takes it apart.'
        : 'Follow the WATER mark to the lake and lure the slime into it. It is slower than your run. The water is what takes it apart.',
    ];
  } else if (isUnseenRound()) {
    title = 'THE UNSEEN';
    lines = [
      'They are invisible until you reveal them. Watch for shaking branches and listen for the screech. A lit match, or the spectral video camera, shows their silhouette.',
      'They watch for about ten seconds, then strike from behind. When you hear one close, turn to face it. Facing it stops the charge.',
      'Kill all of them, or survive until the round runs out. Either one wins.',
    ];
  } else if (isLightboundRound()) {
    title = 'THE LIGHTBOUND';
    lines = [
      'Souls are clinging to the lights. Look under the fixtures and shoot them. The round ends when the last one lets go.',
      'If the wing is dark, find the breaker and hold E to steady the lights. They drain you while the lights hold them in place. Kill every one.',
    ];
  } else if (isCultRound()) {
    title = 'THE CULT';
    lines = [
      'Listen to the leader and the congregation. Click an answer or press its number. The way you answer matters as much as what you say.',
      'Watch the attendants. If you get loose, take the shot when the leader reaches for the bell.',
    ];
  } else if (spec) {
    title = spec.name.toUpperCase();
    lines = [spec.objective, ...specialDetail(round.type)];
  } else {
    title = 'DARK GHOSTS';
    lines = [
      'Keep your light off them. The beam wears your mind down and makes them come for you. Shoot them, or stay alive until the round ends. Either one wins.',
      'The last minute they turn vicious and the clock ticks. Hold your breath while standing still if your mind is fraying. A potion restores it too.',
    ];
  }
  if (MAP.labyrinth) lines.push('On this map, walking out through the gap in the outer wall also ends the round, whatever is in here with you.');
  return { title, lines };
}
function specialDetail(type) {
  return ({
    effigy: [
      'Several statues are standing about. Bring a light close and hold E to inspect them. One of them breathes and shifts. That is the living one.',
      'Lead it into the gold circle and hold your flashlight on it so it stays. Then hold E to seal each of the three locks. Outside the circle, do not let it reach you.',
    ],
    burrower: [
      'Arm three traps. Run across an armed plate so it hears you under the ground, then get off the plate. When it is underneath, hold E on the trigger switch.',
      'That exposes it. Shoot it. If you are still standing on the plate when the ground opens, it hits you.',
    ],
    seamstress: [
      'Follow the web to three anchors. Burn an anchor with a match, or cut it. When the three are gone, the nest opens. Burn the nest.',
      'Wax tins can be searched for spare matches. Loose threads slow your steps.',
    ],
    counterfeit: [
      'Some of the props breathe or creak. Bring a light close and hold E to inspect them. Destroy three copies.',
      'Then find the false landmark and destroy what is inside it. If one grabs you, hold E to pry it open before it bites.',
      'Some ordinary chests are copies too. They look like any other chest, and bite the moment you open them. Shoot them: each one is worth 2 parts.',
    ],
    wickeater: [
      'Hold E to power the three relays. One of them then buzzes and flickers brightly: the round bar names it. Hold E on that one to force the core out.',
      'Shoot the core before it climbs back in. Do it twice. Keep your light on near the buzzing relay; in the dark it can reach you.',
      'The closer you get to finishing it, the more wicklings tear out of the walls at you. Shoot them; a light on them slows them down.',
    ],
    bellman: [
      'The clocks tick in pairs. Follow the sound and stop three of the right clocks with E. Stopping the wrong clock does not count.',
      'When the master bell is ready, wait until you hear two footfalls and then a pause. Ring the bell in that pause.',
    ],
  })[type] || [];
}
function openRoundHelp() {
  if (mapFall?.active || cult?.active || helpOpen || !started || finished || intro.active || cutscenes.active || journal.isOpen || bench.isOpen || picker.isOpen) return;
  const brief = roundBrief();
  helpTitle.textContent = `ROUND ${round.n} · ${brief.title}`;
  helpBody.innerHTML = brief.lines.map((line) => `<p>${helpText(line)}</p>`).join('');
  helpBody.scrollTop = 0;
  helpOpen = true;
  roundHelp.hidden = false;
  helpWasPlaying = playing;
  playing = false;
  holdingBreath = false;
  gun.aiming = false;
  gun.trigger = false;
  syncFootsteps(null);
  for (const k in keys) keys[k] = false;
  overlay.style.display = 'none';
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeRoundHelp() {
  if (!helpOpen) return;
  helpOpen = false;
  roundHelp.hidden = true;
  if (helpWasPlaying && !finished) {
    playing = true;
    if (TOUCH) overlay.style.display = 'none';
    else { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => { playing = false; overlay.style.display = 'flex'; }); }
  } else overlay.style.display = 'flex';
}
window.addEventListener('keydown', (e) => {
  if (helpOpen) {
    if (e.code === 'Escape' || e.code === 'KeyI') closeRoundHelp();
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (e.code !== 'KeyI' || e.repeat) return;
  openRoundHelp();
  if (helpOpen) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

// ───────────────────────── armor: a shield over your health ─────────────────────────
// Six kinds (gear/upgrades.js). Chests, salvage, the dead and the survivor's pick all turn them up; which kind is down to
// the round. One is worn at a time. Its shield takes every hit first, and grows back once you have gone a while unhurt.
const armor = { tier: 0, shield: 0, quiet: 99, flash: 0 };
const endlessHurt = () => (round.n > 7 ? 1 + (round.n - 7) * 0.07 : 1);   // later rounds hit harder
const roundTag = () => `ROUND ${round.n}`;
// Put on a kind of armor, or, if it is no better than what you wear, strip it to patch your own. Returns what to say.
function wearArmor(tier) {
  tier = Math.max(1, Math.min(6, tier));
  const a = ARMOR_TIERS[tier];
  if (tier <= armor.tier) {
    armor.shield = ARMOR_TIERS[armor.tier].shield; addParts(1 + Math.floor(tier / 2));
    return `Found ${a.a}${a.name.toLowerCase()}. No better than yours: you strip it to patch your own`;
  }
  const was = armor.tier;
  armor.tier = tier; armor.shield = a.shield; armor.quiet = 99; armor.flash = 1;
  if (was) addParts(1 + Math.floor(was / 2));
  sfx.upgrade();
  return `${a.name.toUpperCase()} on: a shield of ${a.shield} over your health${was ? `. Your ${ARMOR_TIERS[was].name.toLowerCase()} goes for parts` : ''}`;
}
function updateArmor(dt, inControl) {
  const a = ARMOR_TIERS[armor.tier];
  ui.shieldRow.hidden = !armor.tier;
  if (!a) return;
  if (inControl) {
    armor.quiet += dt;
    if (armor.quiet >= a.delay && armor.shield < a.shield) armor.shield = Math.min(a.shield, armor.shield + a.regen * dt);
  }
  armor.flash = Math.max(0, armor.flash - dt * 3);
  ui.shieldFill.parentElement.style.width = `${Math.min(220, 40 + a.shield * 0.9)}px`;
  ui.shieldFill.style.transform = `scaleX(${armor.shield / a.shield})`;
  ui.shieldFill.style.filter = armor.flash > 0 ? `brightness(${1 + armor.flash})` : '';
  if (ui.shieldIcon.dataset.tier !== String(armor.tier)) { ui.shieldIcon.src = ARMOR_ICONS[armor.tier]; ui.shieldIcon.dataset.tier = String(armor.tier); ui.shieldIcon.title = a.name; }
}

// ───────────────────────── gear: parts, kits, the workbench, grenades ─────────────────────────
let partsFlash = 0;
document.getElementById('partsIcon').src = SPRITES.parts.url;
// say: tack the find onto whatever the last message was (a chest has just said what else was in it)
function addParts(n, say = false) {
  inv.parts += n; partsFlash = 1.2;
  if (say) { ui.toast.textContent += ` · +${n} part${n > 1 ? 's' : ''}`; ui.toast.style.opacity = 1; toastTimer = Math.max(toastTimer, 3); }
}
// Fit an upgrade, from a kit in a chest or built at the bench. Returns the line to say, or null if there was nothing to fit.
function applyKit(id) {
  if (id === 'gun_kit') {
    if (!inv.gun || inv.gunTier >= GUN_TIERS.length - 1) return null;
    const was = GUN.name, oldMag = GUN.mag;
    inv.gunTier++; inv.kitGiven = true; fitGun();
    inv.reserve = Math.round(inv.reserve * GUN.mag / oldMag); inv.mag = GUN.mag;        // what you were carrying is recut to fit
    gun.reloadT = -1; gun.trigger = false; gun.burst = 0;
    return `Your ${was.toLowerCase()} is rebuilt as ${/^[AEIOU]/.test(GUN.name) ? 'an' : 'a'} ${GUN.name.toUpperCase()}: ${GUN.mag} rounds${GUN.damage > 1 ? `, ${GUN.damage}× the damage` : ''}. Hold the trigger to keep firing`;
  }
  if (id === 'light_kit') {
    if (inv.lightTier >= LIGHT_TIERS.length - 1) return null;
    inv.lightTier++; flashlight.battery = 1;
    return `${LIGHT_TIERS[inv.lightTier].name.toUpperCase()} fitted. ${LIGHT_TIERS[inv.lightTier].note}`;
  }
  if (id === 'radar_kit') {
    if (!radar.acquired || inv.radarTier >= RADAR_TIERS.length - 1) return null;
    inv.radarTier++; radar.drawIn = 0;
    return `Radar rebuilt as a ${RADAR_TIERS[inv.radarTier].name.toUpperCase()}. ${RADAR_TIERS[inv.radarTier].note}. G to raise it`;
  }
  if (id === 'launcher_kit') {
    if (inv.launcher) return null;
    inv.launcher = true; if (bagHasRoom('grenade')) inv.grenades += 2;
    return 'LAUNCHER TUBE fitted: grenades now fly flat and far and go off where they hit. T to fire';
  }
  return null;
}
// What the bench can make right now. ok: you can afford it and have room; why: the reason, when you cannot.
function gearRecipes() {
  const out = [], add = (id, name, cost, note, can = true, why = '', tag = '') => out.push({ id, name, tag, cost, note, ok: can && inv.parts >= cost, why: !can ? why : inv.parts < cost ? `${cost - inv.parts} more parts` : '' });
  add('battery', 'Battery', COSTS.battery, `A spare cell. You carry ${inv.batteries}`, canReceiveLoot('battery'), 'pack is full');
  if (inv.gun) add('ammo', `${GUN.mag} bullets`, COSTS.ammo, `A magazine for the ${GUN.name.toLowerCase()}. You carry ${inv.mag + inv.reserve}`, canReceiveLoot('ammo'), 'pack is full');
  add('matches', '2 matches', COSTS.matches, `You carry ${inv.matches}`, canReceiveLoot('matches'), 'pack is full');
  const nextArmor = ARMOR_TIERS[armor.tier + 1];
  if (nextArmor) add('armor', nextArmor.name, nextArmor.cost, `Equips a regenerating shield with ${nextArmor.shield} points.`, true, '', 'ARMOR');
  add('grenade', 'Grenade', COSTS.grenade, `${TOUCH ? 'Sweep two fingers sideways' : 'T'} to ${inv.launcher ? 'fire' : 'throw'}. Clears a wide circle, you included. You carry ${inv.grenades}`, canReceiveLoot('grenade'), 'pack is full');
  if (inv.gun && inv.gunTier < GUN_TIERS.length - 1) {
    const next = GUN_TIERS[inv.gunTier + 1];
    add('gun_kit', next.name, next.cost, `Rebuild the ${GUN.name.toLowerCase()}: ${TOUCH ? 'tap, then hold, and it keeps firing' : 'fires while the trigger is held'}, ${next.mag} rounds${next.damage > GUN.damage ? `, ${next.damage}× damage` : ''}`, true, '', 'UPGRADE');
  }
  if (inv.lightTier < LIGHT_TIERS.length - 1) { const next = LIGHT_TIERS[inv.lightTier + 1]; add('light_kit', next.name, next.cost, next.note, true, '', 'UPGRADE'); }
  if (!radar.acquired) add('radar', RADAR_TIERS[0].name, RADAR_TIERS[0].cost, RADAR_TIERS[0].note, bagHasRoom('radar'), 'pack is full', 'NEW');
  else if (inv.radarTier < RADAR_TIERS.length - 1) { const next = RADAR_TIERS[inv.radarTier + 1]; add('radar_kit', next.name, next.cost, next.note, true, '', 'UPGRADE'); }
  if (!inv.launcher) add('launcher_kit', 'Launcher tube', COSTS.launcher, 'Grenades fly flat and far and go off where they hit. Comes with two', true, '', 'UPGRADE');
  add('potion', 'Potion', COSTS.potion, `Mends you and restores your sanity. You carry ${inv.potions}`, canReceiveLoot('potion'), 'pack is full');
  return out;
}
function craftGear(id) {
  const r = gearRecipes().find((x) => x.id === id);
  if (!r || !r.ok) return null;
  if (id === 'armor') {
    inv.parts -= r.cost;
    return wearArmor(armor.tier + 1);
  }
  let line = null;
  if (id === 'battery') { inv.batteries++; line = `Built a battery (${inv.batteries} spare)`; }
  else if (id === 'ammo') { inv.reserve += GUN.mag; line = `Pressed ${GUN.mag} bullets (${inv.mag + inv.reserve} in all)`; }
  else if (id === 'matches') { inv.matches += 2; line = `Dipped 2 matches (${inv.matches} in all)`; }
  else if (id === 'grenade') { inv.grenades++; line = `Packed a grenade (${inv.grenades} carried)`; }
  else if (id === 'potion') { inv.potions++; line = `Mixed a potion (${inv.potions} carried)`; }
  else if (id === 'radar') { radar.acquired = true; radar.drawIn = 0; line = 'Built a radar. G raises it during Observer and Choir rounds'; }
  else line = applyKit(id);
  if (!line) return null;
  inv.parts -= r.cost; sfx.upgrade();
  return useWords(line);
}
let benchWasPlaying = false;
const bench = createWorkbench({
  touch: TOUCH, recipes: gearRecipes, craft: craftGear, parts: () => inv.parts,
  gear: () => `${inv.gun ? GUN.name.toUpperCase() : 'NO GUN'} · ${LIGHT_TIERS[inv.lightTier].name.toUpperCase()} · ${radar.acquired ? RADAR_TIERS[inv.radarTier].name.toUpperCase() : 'NO RADAR'}${inv.launcher ? ' · LAUNCHER' : ''} · ${ARMOR_TIERS[armor.tier]?.name.toUpperCase() ?? 'NO ARMOR'}`,
  // the world stops while you work, the way it does for the journal
  onOpen() { benchWasPlaying = playing; playing = false; releaseTouch(); for (const k in keys) keys[k] = false; holdingBreath = false; gun.aiming = false; gun.trigger = false; gun.burst = 0; syncFootsteps(null); if (document.pointerLockElement) document.exitPointerLock(); overlay.style.display = 'none'; },
  onClose() {
    if (benchWasPlaying && !finished) {
      playing = true;
      if (TOUCH) overlay.style.display = 'none';
      else { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => { playing = false; overlay.style.display = 'flex'; }); }
    }
    else overlay.style.display = 'flex';
  },
});

// ───────────────────────── other ways to come by things: salvage, drops, the survivor's pick ─────────────────────────
// Chests are not the only place. Some of what stands about in each map can be searched (hold E), which takes a moment
// and makes a little noise. What you kill sometimes leaves a bundle where it fell, and you have to go and get it.
// And each round you live through, the night leaves three things and you take one.

// 1. Salvage. kind: [what to call it, seconds to search, parts lo..hi, chance of an item as well, chance one has anything (else SALVAGE_CHANCE)]
const SALVAGE = {
  car: ['car', 2.4, 2, 4, 0.35], dumpster: ['dumpster', 2.2, 2, 4, 0.3], cabinet: ['cabinet', 1.8, 1, 3, 0.3], shelf: ['shelves', 1.6, 1, 2, 0.2],
  crate: ['crate', 1.4, 1, 3, 0.2], barrel: ['barrel', 1.3, 1, 2, 0.12], trashcan: ['bin', 1.2, 1, 2, 0.1], mailbox: ['mailbox', 1.0, 1, 1, 0.15], wheelbarrow: ['wheelbarrow', 1.2, 1, 2, 0.1],
  minecart: ['mine cart', 2.0, 2, 4, 0.3], pickaxe: ['miner\'s kit', 1.2, 1, 2, 0.1], skeleton: ['bones', 1.5, 1, 2, 0.22], coffin: ['coffin', 2.4, 2, 4, 0.4], cage: ['cage', 1.6, 1, 3, 0.2],
  cauldron: ['cauldron', 1.5, 1, 2, 0.2], throne: ['throne', 2.4, 3, 5, 0.5], snowmobile: ['snowmobile', 2.4, 2, 4, 0.35], sled: ['sled', 1.2, 1, 2, 0.12], igloo: ['igloo', 2.2, 2, 3, 0.35],
  stump: ['hollow stump', 1.3, 1, 2, 0.12, 0.22], well: ['well', 2.0, 1, 3, 0.25], crystal: ['crystal seam', 1.6, 1, 2, 0.06, 0.5],
};
const SALVAGE_CHANCE = 0.6;                               // not everything has something in it
const salvageKind = new Map();                            // atlas cell -> kind
for (const kind in SALVAGE) for (const cell of atlas.sprites[kind] || []) if (!salvageKind.has(cell)) salvageKind.set(cell, kind);
const salvage = { at: null, t: 0, scan: 0 };
function salvageIn(c) {                                   // what could be searched in a chunk, worked out once
  if (c.salvage) return c.salvage;
  c.salvage = [];
  for (let i = 0; i < c.props.length; i += 7) {
    const kind = salvageKind.get(c.props[i + 4]); if (!kind) continue;
    const x = c.props[i], z = c.props[i + 1];
    if (hash2(Math.round(x * 4), Math.round(z * 4), 77) < (SALVAGE[kind][5] ?? SALVAGE_CHANCE)) c.salvage.push({ x, z, kind, id: `sv${Math.round(x * 4)},${Math.round(z * 4)}` });
  }
  return c.salvage;
}
// every frame, in the world update: the nearest thing worth searching, and the search itself while E is held on it
function updateSalvage(dt, inControl, px, pz, fx, fz) {
  let best = null;
  if (inControl && !mapAction && !nearChest && !nearLore && !swim.in) {
    const cx = Math.floor(px / CFG.chunk), cz = Math.floor(pz / CFG.chunk);
    let bd = 2.3;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = chunks.get(key(cx + dx, cz + dz)); if (!c) continue;
      for (const s of salvageIn(c)) {
        if (opened.has(s.id)) continue;
        const ex = s.x - px, ez = s.z - pz, d = Math.hypot(ex, ez);
        if (d < bd && (d < 0.9 || (ex * fx + ez * fz) / d > 0.35)) { bd = d; best = s; }
      }
    }
  }
  if (!best || best !== salvage.at) { salvage.at = best; salvage.t = 0; }
  if (!best) return;
  const [name, secs, lo, hi, itemChance] = SALVAGE[best.kind];
  if (keys.KeyE) {
    if (salvage.t === 0) { noise1(0.25, 'bandpass', 900, 400, 0.3); if (isChoirRound()) choir.noise(px, pz, 0.5, 'searching'); if (isConsumerRound()) consumer.noise(px, pz, 0.5, 'searching'); }
    salvage.t += dt;
    if ((salvage.scan -= dt) <= 0) { salvage.scan = 0.4; noise1(0.12, 'bandpass', 700 + Math.random() * 500, 300, 0.2); }      // rummaging
  } else salvage.t = Math.max(0, salvage.t - dt * 2);
  const k = Math.min(1, salvage.t / secs), bar = '▮'.repeat(Math.round(k * 6)).padEnd(6, '▯');
  mapAction = { label: `[Hold E] search the ${name}${salvage.t > 0 ? ` ${bar}` : ''}`, run() {} };
  if (k < 1) return;
  opened.add(best.id); salvage.at = null; salvage.t = 0;
  const n = lo + ((lootRng() * (hi - lo + 1)) | 0), item = lootRng() < itemChance ? rollChestLoot('common') : null;
  sfx.chest();
  if (!(item && grantChestLoot(item))) toast(`You search the ${name}`);
  addParts(n, true);
}

// 2. Drops. A bundle lies where the thing fell until you walk onto it (it comes the last little way to you), or a minute and a half passes.
const drops = [];
const dropGeo = new THREE.BoxGeometry(0.36, 0.28, 0.28);
function dropBundle(x, z, parts, tier = null) {
  const mat = new THREE.MeshBasicMaterial({ color: tier ? 0x9fc79a : 0xc8a25a }), mesh = new THREE.Mesh(dropGeo, mat);
  scene.add(mesh);
  drops.push({ x, z, parts, tier, mesh, mat, t: 0, phase: Math.random() * 6 });
}
function updateDrops(dt, inControl, px, pz) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (inControl) d.t += dt;
    const ex = px - d.x, ez = pz - d.z, dist = Math.hypot(ex, ez) || 1;
    if (inControl && dist < 3.6) { const pull = Math.min(dist, dt * (2 + (3.6 - dist) * 2.5)); d.x += ex / dist * pull; d.z += ez / dist * pull; }
    const pulse = 0.55 + 0.45 * Math.sin(uTime.value * 4 + d.phase);
    d.mat.color.setHex(d.tier ? 0x9fc79a : 0xc8a25a).multiplyScalar(0.45 + 0.55 * pulse * Math.min(1, (90 - d.t) / 8));
    d.mesh.position.set(d.x, MAP.groundY(d.x, d.z) + 0.7 + Math.sin(uTime.value * 2 + d.phase) * 0.09, d.z);      // held up clear of the grass
    d.mesh.rotation.y += dt * 1.6;
    const got = inControl && dist < 0.95;
    if (!got && d.t < 90) continue;
    scene.remove(d.mesh); d.mat.dispose(); drops.splice(i, 1);
    if (!got) continue;
    const item = d.tier ? rollChestLoot(d.tier) : null;
    sfx.chest();
    if (!(item && grantChestLoot(item))) toast(d.tier ? 'A bundle, mostly ruined' : 'Something it was carrying');
    addParts(d.parts + (d.tier && !item ? 2 : 0), true);
  }
}
function clearDrops() { for (const d of drops) { scene.remove(d.mesh); d.mat.dispose(); } drops.length = 0; }

// 3. The survivor's pick: three offers drawn from what would be of use to you now.
let pickArmor = 1;
function pickOffers() {
  const pool = [
    { w: 3, name: '8 parts', note: 'For the workbench', take: () => { inv.parts += 8; partsFlash = 1.2; return 'You take the parts'; } },
    { w: 3, ok: () => inv.gun && canReceiveLoot('ammo'), name: `${GUN.mag * 2} bullets`, note: `Two magazines for the ${GUN.name.toLowerCase()}`, take: () => { inv.reserve += GUN.mag * 2; return 'You take the bullets'; } },
    { w: 3, ok: () => canReceiveLoot('battery'), name: '2 batteries', note: `You carry ${inv.batteries}`, take: () => { inv.batteries += 2; return 'You take the batteries'; } },
    { w: 2, ok: () => canReceiveLoot('matches'), name: '4 matches', note: `You carry ${inv.matches}`, take: () => { inv.matches += 4; return 'You take the matches'; } },
    { w: 2, ok: () => canReceiveLoot('potion'), name: 'A potion', note: `You carry ${inv.potions}`, take: () => { inv.potions++; return 'You take the potion'; } },
    { w: 2, ok: () => canReceiveLoot('grenade'), name: '2 grenades', note: `You carry ${inv.grenades}`, take: () => { inv.grenades += 2; return 'You take the grenades'; } },
    { w: 2, ok: () => inv.health < inv.maxHealth * 0.7 || sanity.value < SANITY_MAX * 0.7, name: 'A moment of rest', note: 'Your wounds close and your head clears', take: () => { inv.health = inv.maxHealth; sanity.value = SANITY_MAX; sanity.warned = false; sanity.empty = 0; sanity.drained = false; return 'You rest. It helps'; } },
    { w: 1.4, ok: () => round.n >= 2 && canReceiveLoot('gun_kit'), name: 'A weapon kit', note: `Rebuilds the ${GUN.name.toLowerCase()} as ${inv.gunTier < GUN_TIERS.length - 1 ? GUN_TIERS[inv.gunTier + 1].name.toLowerCase() : ''}`, take: () => applyKit('gun_kit') },
    { w: 1.4, ok: () => canReceiveLoot('light_kit'), name: 'A lens kit', note: inv.lightTier < LIGHT_TIERS.length - 1 ? LIGHT_TIERS[inv.lightTier + 1].note : '', take: () => applyKit('light_kit') },
    { w: 1.2, ok: () => canReceiveLoot('radar_kit'), name: 'An antenna kit', note: inv.radarTier < RADAR_TIERS.length - 1 ? RADAR_TIERS[inv.radarTier + 1].note : '', take: () => applyKit('radar_kit') },
    { w: 2.2, ok: () => (pickArmor = Math.max(armor.tier + 1, rollArmorTier(round.n))) <= 6, name: ARMOR_TIERS[Math.min(6, pickArmor)].name, note: `Armor. A shield of ${ARMOR_TIERS[Math.min(6, pickArmor)].shield} over your health${armor.tier ? `, in place of your ${ARMOR_TIERS[armor.tier].name.toLowerCase()}` : ''}`, take: ((t) => () => wearArmor(t))(pickArmor) },
    { w: 1, ok: () => bag.capacity < bag.maxCapacity, name: 'A bigger pack', note: 'One more inventory slot', take: () => { bag.capacity++; return `Your pack now holds ${bag.capacity}`; } },
  ].filter((o) => !o.ok || o.ok());
  const out = [];
  while (out.length < 3 && pool.length) {
    let pick = Math.random() * pool.reduce((sum, o) => sum + o.w, 0), i = 0;
    for (; i < pool.length - 1; i++) { pick -= pool[i].w; if (pick <= 0) break; }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
let pickWasPlaying = false;
const picker = createPicker({
  touch: TOUCH,
  onOpen() { pickWasPlaying = playing; playing = false; releaseTouch(); for (const k in keys) keys[k] = false; holdingBreath = false; gun.aiming = false; gun.trigger = false; gun.burst = 0; syncFootsteps(null); if (document.pointerLockElement) document.exitPointerLock(); overlay.style.display = 'none'; },
  onClose() {
    if (pickWasPlaying && !finished) {
      playing = true;
      if (TOUCH) overlay.style.display = 'none';
      else { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => { playing = false; overlay.style.display = 'flex'; }); }
    }
    else overlay.style.display = 'flex';
  },
  onTake(line) { if (line) toast(line); sfx.upgrade(); },
});

// Grenades. Thrown, one bounces and rolls and goes off when its fuse runs out. From the launcher tube it flies flat and
// goes off where it lands. Either way the blast does not care who is standing in it.
const NADE = { fuse: 1.9, radius: 5.5, launchRadius: 6.5, self: 4.2 };
const grenades = [], blasts = [];
const nadeGeo = new THREE.BoxGeometry(0.13, 0.16, 0.13), nadeMat = new THREE.MeshLambertMaterial({ color: 0x4d6238 });
const fireCells = atlas.sprites.fire || atlas.sprites.bonfire || [];
let nadeWait = 0;
function throwGrenade() {
  if (radar.equipped || swim.in || nadeWait > 0) return;
  if (inv.grenades <= 0) { toast('No grenades. Chests hold them, and the workbench (C) builds them'); return; }
  inv.grenades--; nadeWait = 0.7;
  camera.getWorldDirection(aim);
  const fast = inv.launcher, sp = fast ? 32 : 13.5, mesh = new THREE.Mesh(nadeGeo, nadeMat);
  scene.add(mesh);
  grenades.push({ x: camera.position.x + aim.x * 0.5, y: camera.position.y - 0.2, z: camera.position.z + aim.z * 0.5, vx: aim.x * sp, vy: aim.y * sp + (fast ? 1.2 : 4.4), vz: aim.z * sp,
                  fuse: fast ? 3 : NADE.fuse, fast, mesh });
  if (fast) { thump(190, 55, 0.22, 1); noise1(0.18, 'lowpass', 1200, 200, 0.6); gun.recoil = 1; } else sfx.swing();
  if (isChoirRound()) choir.noise(camera.position.x, camera.position.z, fast ? 1.2 : 0.4, 'grenade');
  if (isConsumerRound()) consumer.noise(camera.position.x, camera.position.z, fast ? 1.2 : 0.4, 'grenade');
}
function explode(g) {
  scene.remove(g.mesh);
  const x = g.x, z = g.z, y = Math.max(g.y, MAP.groundY(x, z)), R = g.fast ? NADE.launchRadius : NADE.radius;
  blasts.push({ x, y, z, t: 0, R });
  sfx.boom();
  const pd = Math.hypot(camera.position.x - x, camera.position.z - z);
  mix.accent(Math.max(0.1, 1 - pd / 35));
  consumerViewShake.value = Math.max(consumerViewShake.value, Math.max(0, 1.4 - pd / 14));
  // the dead
  for (const gh of ghosts.slice()) { const d = Math.hypot(gh.x - x, gh.z - z); if (d < R && !MAP.blocked(x, z, gh.x, gh.z, opened)) hurtGhost(gh, d < R * 0.5 ? 5 : 2); }
  // everything else already knows what being shot means, so the blast shoots at each thing inside it
  const from = new THREE.Vector3(x, y + 0.9, z), dir = new THREE.Vector3();
  const at = (tx, tz, fn) => { const d = Math.hypot(tx - x, tz - z); if (d > R || d < 0.05) return; dir.set((tx - x) / d, 0, (tz - z) / d); fn(d); };
  if (choir.active) {
    choir.noise(x, z, 2.6, 'explosion');
    for (const s of choir.singers) if (s.alive) at(s.x, s.z, () => choir.shot(from, dir, { range: R, damage: 5 }));
    if (choir.hive) at(choir.hive.x, choir.hive.z, () => choir.shot(from, dir, { range: R, damage: 6 }));
  }
  if (consumer.active) consumer.blast(new THREE.Vector3(x, y, z), R);
  if (slime.active) slime.blast(x, z, R);
  if (unseen.active) unseen.blast(x, z, R);
  if (lightbound.active) lightbound.blast({ x, z }, R);
  if (specialRounds.active) specialRounds.blast({ x, z }, R);
  if (collective.active && ['appear', 'warning', 'dispersal', 'last'].includes(collective.phase)) {
    const low = new THREE.Vector3(x, MAP.groundY(x, z) + 0.7, z);        // they are small: the blast reaches them at their own height
    for (const k of collective.kids) at(k.x, k.z, () => collective.shot(low, dir));
  }
  if (obsRound.active) {
    for (const o of obsRound.observers) if (o.active) at(o.position.x, o.position.z, () => obsRound.shot(from, dir));
    const lit = obsRound.burnNear(x, z, R * 0.75);          // fire is fire: it burns the bodies too, and brings the watcher
    if (lit) toast(lit > 1 ? `${lit} bodies catch` : 'The body catches');
  }
  // and you
  if (pd < NADE.self && !MAP.blocked(x, z, camera.position.x, camera.position.z, opened)) damagePlayer(Math.round(70 * (1 - pd / NADE.self)) + 8, 'blast');
}
// every frame, inside the world update (between the glow layer reset and commit), so the fire can be drawn
function updateGrenades(dt, inControl) {
  nadeWait = Math.max(0, nadeWait - dt);
  for (let i = grenades.length - 1; i >= 0 && inControl; i--) {
    const g = grenades[i];
    g.vy -= (g.fast ? 7 : 19) * dt;
    let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt, hit = false;
    if (MAP.blocked(g.x, g.z, nx, nz, opened) || (MAP.grid && MAP.grid.solidCell(MAP.grid.cellOf(nx), MAP.grid.cellOf(nz), opened))) {   // a wall
      hit = true; nx = g.x; nz = g.z; g.vx *= -0.35; g.vz *= -0.35;
    }
    const floor = MAP.groundY(nx, nz) + 0.08;
    if (ny <= floor) { hit = true; ny = floor; g.vy = g.vy < -2.5 ? -g.vy * 0.32 : 0; g.vx *= 0.55; g.vz *= 0.55; if (g.vy > 0 && !g.fast) noise1(0.05, 'lowpass', 700, 300, 0.25); }
    if (META.ceiling && ny > META.ceiling - 0.1) { ny = META.ceiling - 0.1; g.vy = -Math.abs(g.vy) * 0.3; }
    if (g.fast && !hit) for (const gh of ghosts) if (gh.state !== 'die' && (gh.x - nx) ** 2 + (gh.z - nz) ** 2 < 1.3 && Math.abs(gh.mesh.position.y - ny) < 1.4) { hit = true; break; }
    g.x = nx; g.y = ny; g.z = nz; g.fuse -= dt;
    g.mesh.position.set(nx, ny, nz); g.mesh.rotation.x += dt * 9; g.mesh.rotation.z += dt * 6;
    if (g.fuse <= 0 || (g.fast && hit)) { grenades.splice(i, 1); explode(g); }
  }
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i];
    b.t += dt;
    if (b.t >= 0.75) { blasts.splice(i, 1); continue; }
    const k = b.t / 0.75, glare = Math.max(0, 1 - b.t / 0.4);
    extraLights.push(b.x, b.y + 1.0, b.z, 5 * glare, 0);
    if (fireCells.length) for (let n = 0; n < 5; n++) {                 // a ball of fire that swells and thins
      const a = n * 2.4 + b.x, r = (n ? 0.5 + k * b.R * 0.42 : 0), s = (n ? 2.4 : 3.8) + k * 3.8 - k * k * 2.4;
      if (k < 0.85) glowLayer.add(b.x + Math.cos(a) * r, b.y - 0.1, b.z + Math.sin(a) * r, s, s, fireCells[(n + ((b.t * 14) | 0)) % fireCells.length], 0.02);
    }
  }
}
const lore = createLorePickups({ scene, camera, world: { walkable: creatureWorld.walkable, groundY: (x, z) => MAP.groundY(x, z) }, map: MAP_NAME, journal, rng: Math.random });
let nearLore = null;
function collectLore(it) {
  const id = lore.collect(it);
  if (!id) return;
  noise1(0.18, 'highpass', 2400, 1400, 0.22); noise1(0.3, 'bandpass', 900, 500, 0.12);      // paper, a rustle
  if (isChoirRound()) choir.noise(camera.position.x, camera.position.z, 0.3, 'rustle');
  journal.add(id);
  journal.open(id);
}
function dropLore(pool, x, z, line) {
  const id = lore.dropAt(pool, x, z);
  if (id && line) toast(line);
  return id;
}
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyJ' || e.repeat || !started || intro.active || cult?.active || journal.isOpen || helpOpen) return;
  journal.open();
});
await monsterAssetsReady;
let nextObserverAt = Infinity;
const ashDropped = new Set();
const obsRound = createObserverRound({
  scene, camera, world: creatureWorld, rng: mulberry(CFG.seed ^ 0x0b5e),
  ambientScale: MAP_NAME === 'hell' ? 0.12 : 1,
  audio: { ctx: audioCtx, dest: mix.creatures, noise: longNoise, bones: boneBuffer, clips: OBS_CLIPS },
  glowAdd: (...a) => glowLayer.add(...a), lightPush: (...a) => extraLights.push(...a),
  fireCells: atlas.sprites.fire, smallCells: atlas.sprites.smallfire || atlas.sprites.fire,
  inv, toast, clearZones, circles: extraCircles, refresh: () => refreshChunks(true),
  sfx: {
    strike: () => sfx.strike(),
    crackle(x, z) {                       // seven seconds of fire, quieter the further away you are
      const d = Math.hypot(x - camera.position.x, z - camera.position.z), v = Math.max(0.15, 1 - d / 20);
      noise1(0.6, 'lowpass', 600, 300, 0.5 * v);
      for (let i = 0; i < 40; i++) setTimeout(() => { if (!finished) noise1(0.05 + Math.random() * 0.06, 'highpass', 2200 + Math.random() * 2000, 1500, (0.12 + Math.random() * 0.25) * v); }, Math.random() * 7000);
    },
  },
  onBurned(n) {
    sanity.value = Math.max(0, sanity.value - SANITY_BURN_DONE);
    toast(n >= obsRound.total ? 'The last of them burns. It stays with you.' : `${n} of ${obsRound.total} burned. It gets into your head.`);
    for (const b of obsRound.bodies()) {                         // what it was carrying is left in the ash
      const k = b.x.toFixed(1) + ',' + b.z.toFixed(1);
      if (b.done && !ashDropped.has(k)) { ashDropped.add(k); if (dropLore('body', b.x, b.z)) setTimeout(() => toast('Something is left in the ash.'), 1500); }
    }
  },
  hooks: {
    huntStart() { setHuntSilence(true); },
    huntEnd() { setHuntSilence(false); },
    flicker: flickerFlashlight,
    // something nearby gets disturbed. On the outskirts that can be a door you left alone swinging on its own.
    disturb(rel, dist) {
      if (MAP_NAME !== 'rural' || Math.random() > 0.45) return false;
      const px = camera.position.x, pz = camera.position.z;
      const d = near.doors.find((o) => { const k = Math.hypot(o.x - px, o.z - pz); return k > 4 && k < 18; });
      if (!d) return false;
      toggleDoor(d); return true;
    },
    capture() {                             // the screen cuts to black, then the death screen
      deathCause = 'observer';
      fadeEl.style.opacity = 1;
      playing = false;
      syncFootsteps(null);
      setTimeout(() => endGame(false), 1300);
    },
  },
});
function startObserverRound() {
  // the loadout the round expects: the flashlight, a loaded pistol, at least five matches
  radar.equipped = false; radar.beepIn = 0; radar.drawIn = 0;
  flashlight.equipped = true;
  inv.gun = true;
  inv.mag = Math.max(inv.mag, GUN.mag);
  inv.reserve = Math.max(inv.reserve, GUN.mag);
  const bodies = bodiesFor(Math.min(round.n, 12));
  inv.matches = Math.max(inv.matches, bodies + 2);           // one per body and a couple to see by
  setDusk(DUSK.maps.includes(MAP_NAME) && Math.random() < DUSK.chance);
  ashDropped.clear();
  nextObserverAt = OBS_ROUND.firstExtra;                     // 4:00 brings a second one; after that, a coin flip each minute
  obsRound.start({ x: camera.position.x, z: camera.position.z }, bodies);
  if (round.announced) announceObserver();
}
function announceObserver() {
  banner('THE OBSERVER', `${isDusk ? 'Dusk. ' : ''}Find and burn the ${obsRound.total} bodies before dawn. Something is watching you.`);
  toast('Each body takes one match. The pull tells you how close the nearest one is.');
}
function updateObserver(dt, inControl) {
  if (!obsRound.active) return;
  if (inControl && round.t >= nextObserverAt) {
    const first = nextObserverAt === OBS_ROUND.firstExtra;
    if (first || Math.random() < OBS_ROUND.extraChance) obsRound.addObservers(1);
    nextObserverAt += OBS_ROUND.extraEvery;
  }
  extraCircles.length = 0;
  for (const b of obsRound.bodies()) if (b.kind !== 'ground') extraCircles.push(b.x, b.z, 0.3);
  for (const o of obsRound.observers) if (o.active) extraCircles.push(o.position.x, o.position.z, 0.35);
  obsRound.update(dt, {
    inControl: inControl && playing, yaw,
    flashlightOn: flashlight.equipped && flashlight.battery > 0 && flashlight.raise > 0.6,
    beamLit: Math.min(1, spot.intensity / L.intensity), beamRange: L.distance, beamAngle: L.angle,
    matchActive: match.t > 0, matchRadius: CFG.match.distance,
    flash: flashLight.intensity > 0.6 && !debugAmbient ? 1 : 0,
    playerMoving: keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD,
    dusk: isDusk, sanity: sanity.value,
  });
}

// ───────────────────────── the Collective round ─────────────────────────
// Thirty of them. src/collective/ holds the creatures and their rules; here they get the map, the sound and the death.
const collective = createCollective({
  scene, camera, world: creatureWorld,
  audio: { ctx: audioCtx, dest: mix.creatures, walk: walkBuffer, run: runBuffer, loud: collectiveLoud, whisper: collectiveWhisper, hug: collectiveHug, stopMoving: collectiveStop, walkAway: collectiveWalk, goHome: collectiveHome, groupSteps: collectiveStepsBuffer },
  hooks: {
    say: (text) => toast(text),
    levers: () => near.controls.filter(c => !c.system && !c.flood && !opened.has(c.target)),
    crank() { noise1(0.55, 'bandpass', 840, 420, 0.26); },
    bell() { thump(466, 462, 1.8, 0.28); thump(1107, 1100, 1.2, 0.12); },
    mark() { document.getElementById('collectiveMark')?.classList.add('on'); },
    provoked() { syncFootsteps(null); },
    capture() {                             // they reach you together: cut to black, then the death screen
      deathCause = 'collective';
      fadeEl.style.opacity = 1;
      playing = false;
      syncFootsteps(null);
      setTimeout(() => endGame(false), 1300);
    },
  },
});
function startCollectiveRound() {
  // every chest is restocked, and every one now holds matches
  for (const id of openedChests) opened.delete(id);
  openedChests.length = 0;
  refreshChunks(true);
  if (!inv.gun) { inv.gun = true; inv.mag = GUN.mag; inv.reserve = Math.max(inv.reserve, GUN.mag); }
  inv.matches = Math.max(inv.matches, 3);
  collective.start();
  if (round.announced) announceCollective();
}
function announceCollective() {
  banner('The Collective', '');
}
function updateCollective(dt, inControl, running) {
  const info = {
    inControl: inControl && playing, yaw, clock: uTime.value,
    flashlightOn: flashlight.equipped && flashlight.battery > 0 && flashlight.raise > 0.6,
    beamLit: Math.min(1, spot.intensity / L.intensity), beamRange: L.distance, beamAngle: L.angle,
    matchLit: match.t > 0, roomLit: facilityLight,
    running, moving: playerSpeedNow > 0,
    moveX: move.x, moveZ: move.z, round: round.n, environment: MAP_NAME, sanity: sanity.value,
  };
  collective.updateFollower(dt, info);
  if (collective.active) collective.update(dt, info);
}

const [hiveQueenDeath, hiveGruntDeath, hiveQueenAttack, hiveHoundChase] = await Promise.all([
  loadClip('hive_queen_death.mp3'),
  loadClip('hive_grunt_death.mp3'),
  loadClip('hive_queen_attack.mp3'),
  loadClip('monster_hound_chase_#4-1795066667568.mp3'),
]);
// The Choir tracks sounds and returns in waves until the exposed Hive Mind is destroyed.
const choir = createChoirRound({
  scene, camera, world: creatureWorld,
  audio: { ctx: audioCtx, dest: mix.creatures, sing: singBuffer, queenDeath: hiveQueenDeath, gruntDeath: hiveGruntDeath, queenAttack: hiveQueenAttack, houndChase: hiveHoundChase },
  hooks: {
    say: (text) => toast(text),
    damage: (amount, cause) => damagePlayer(amount, cause),
    civilianDeath: () => playClip(dyingBuffer, 0.9),
  },
});
function startChoirRound() {
  flashlight.equipped = true;
  if (flashlight.battery <= 0.1 && inv.batteries <= 0) {
    inv.batteries = 1;
    toast('A spare battery waits in your pack. B to replace it.');
  }
  inv.gun = true;
  inv.mag = Math.max(inv.mag, GUN.mag);
  inv.reserve = Math.max(inv.reserve, GUN.mag);
  choir.start({ round: round.n });
  if (round.announced) announceChoir();
}
function announceChoir() {
  banner('THE CHOIR', 'They hear footsteps, breath, doors and gunfire. A listener in a chest can find the nest nearby; feedback shows the singers.');
  toast('At least 1–3 grunts hunt by sound. Hold Space to quiet your breath. Blue/red chests bring better gear and larger packs.');
}
function updateChoir(dt, inControl) {
  if (!choir.active) return;
  if (!inControl) { choir.update(dt, { inControl: false }); return; }
  const runningNow = playerRunningNow;
  choir.update(dt, {
    inControl: true, x: camera.position.x, z: camera.position.z, yaw,
    moving: playerSpeedNow > 0, running: runningNow, holdingBreath,
    swimming: swim.in, environment: MAP_NAME, noiseScale: bagBonuses().noiseScale,
    surfaceNoise: facility?.noiseScale(camera.position.x, camera.position.z) ?? 1,
    ambientNoise: facility?.noiseScale(camera.position.x, camera.position.z, 'breath') ?? 1,
  });
}

const consumerViewShake = { value: 0 };
const consumer = createConsumerRound({
  scene, camera, world: creatureWorld,
  audio: {
    ctx: audioCtx, dest: mix.creatures,
    walk: snowWalkBuffer || puddleWalkBuffer || walkBuffer,
    run: snowRunBuffer || puddleRunBuffer || runBuffer,
    stomp: consumerStomp, eat: consumerEat, yell: consumerYell,
  },
  hooks: {
    say: (text) => toast(text),
    damage: (amount, cause) => damagePlayer(amount, cause),
    stomp(x, z, size, surface) {
      if (surface === 'ceiling') return;
      const distance = Math.hypot(camera.position.x - x, camera.position.z - z);
      consumerViewShake.value = Math.max(consumerViewShake.value, Math.max(0, 1 - distance / 15) * Math.min(0.42, size * 0.14));
    },
    bump(x, z, size) {
      const distance = Math.hypot(camera.position.x - x, camera.position.z - z), volume = Math.max(0, 1 - distance / 16);
      if (volume > 0.02) thump(100, 42, 0.15, 0.4 * volume);
      consumerViewShake.value = Math.max(consumerViewShake.value, Math.max(0, 1 - distance / 10) * Math.min(0.5, size * 0.18));
    },
    civilianDeath(outcome) {
      if (outcome !== 'killed') return;
      playClip(dyingBuffer, 0.7);
      stainFromInnocent();
    },
    rescued() {
      addParts(4);
      toast(`A civilian makes it to safety · +4 parts (${inv.parts}). The Consumer turns toward the sound.`);
    },
  },
});
const consumerWarpColor = new THREE.Color(0x24101c);
function updateConsumerAtmosphere(dt, inControl) {
  if (MAP.interior) return;
  const active = consumer.active && !consumer.dead;
  if (active && !consumerStorm.base) {
    consumerStorm.base = {
      fog: scene.fog?.color?.clone(), density: scene.fog?.density,
      background: scene.background?.isColor ? scene.background.clone() : null,
    };
    consumerStorm.hazardIn = 8; consumerStorm.strikeIn = 6 + Math.random() * 4; consumerStorm.warned = false;
  }
  const target = active ? THREE.MathUtils.clamp((consumer.sizeScale - consumer.baseScale) / 0.95, 0, 1) : 0;
  consumerStorm.intensity += (target - consumerStorm.intensity) * Math.min(1, dt * (target > consumerStorm.intensity ? 0.75 : 1.7));
  consumerRainUniforms.uIntensity.value = consumerStorm.intensity;
  consumerRain.visible = consumerStorm.intensity > 0.01;
  consumerRainUniforms.uCam.value.copy(camera.position);
  if (!active && !consumerStorm.base && consumerStorm.intensity < 0.01) {
    consumerStorm.intensity = 0; consumerRainUniforms.uIntensity.value = 0; consumerRain.visible = false; return;
  }
  const roofs = near.houses, ordered = [];
  for (let i = 0; i < roofs.length; i += 4) ordered.push([((roofs[i] + roofs[i + 2]) / 2 - camera.position.x) ** 2 + ((roofs[i + 1] + roofs[i + 3]) / 2 - camera.position.z) ** 2, i]);
  ordered.sort((a, b) => a[0] - b[0]);
  for (let n = 0; n < 4; n++) {
    const r = consumerRainUniforms.uRoof.value[n];
    if (n < ordered.length) { const i = ordered[n][1]; r.set(roofs[i] - 0.7, roofs[i + 1] - 0.7, roofs[i + 2] + 0.7, roofs[i + 3] + 0.7); }
    else r.set(0, 0, 0, 0);
  }

  if (!active) {
    consumerStorm.flashT = 0;
    if (consumerStorm.base) {
      if (scene.fog && consumerStorm.base.fog) { scene.fog.color.copy(consumerStorm.base.fog); scene.fog.density = consumerStorm.base.density; }
      if (scene.background?.isColor && consumerStorm.base.background) scene.background.copy(consumerStorm.base.background);
      consumerStorm.base = null; consumerStorm.warned = false;
    }
    return;
  }
  if (consumerStorm.base) {
    const strength = consumerStorm.intensity;
    if (scene.fog && consumerStorm.base.fog) {
      scene.fog.color.copy(consumerStorm.base.fog).lerp(consumerWarpColor, strength * 0.62);
      scene.fog.density = consumerStorm.base.density * (1 + strength * 0.7) + strength * 0.002;
    }
    if (scene.background?.isColor && consumerStorm.base.background) scene.background.copy(consumerStorm.base.background).lerp(consumerWarpColor, strength * 0.34);
  }
  if (!consumerStorm.warned && target >= 0.38) {
    consumerStorm.warned = true;
    toast('The Consumer is warping the weather. The storm burns anyone caught outside; seek a roof.');
  }
  if (!inControl) return;
  if (target >= 0.55) {
    consumerStorm.strikeIn -= dt;
    if (consumerStorm.strikeIn <= 0) {
      consumerStorm.strikeIn = 8 + Math.random() * 8;
      consumerStorm.flashT = 0.48; consumerStorm.flashPower = 0.35 + target * 0.65;
      thunder(consumerStorm.flashPower, 0.18 + (1 - target) * 1.2);
    }
    if (!indoors && !META.ceiling) {
      consumerStorm.hazardIn -= dt;
      if (consumerStorm.hazardIn <= 0) {
        damagePlayer(4 + Math.floor(target * 4) + Math.floor(round.n / 3), 'consumer');
        consumerStorm.hazardIn = 8 + Math.random() * 4;
        if (!consumer.active) return;
      }
    }
  }
}
// ───────────────────────── the Slime ─────────────────────────
// slime/SlimeRound.js rolls it, grows it and sheds the small ones. Here: what it eats, the water that ends it,
// what it does to the player's legs and to the ground under them, and the way out of the lake into another map.
const wade = { sink: 0, in: false, step: 0 };
let slimeBay = null;
const slimeFx = { clingUntil: 0, bed: null, fizz: 0 };
const slimeTravel = { pending: false, t: -1, next: 0, swapped: false };
const slimeDrag = () => slimeTravel.t >= 0 ? 0 : (uTime.value < slimeFx.clingUntil ? 0.55 : 1) * (wade.in ? 0.72 : 1);
// What stood inside this bite, and so how much the Slime grows on it. Then the bite is taken out of the world.
function slimeEat(x, z, r) {
  let gain = 0;
  const r2 = r * r, hit = (px, pz) => (px - x) ** 2 + (pz - z) ** 2 < r2;
  forChunksNear(x - r, z - r, x + r, z + r, (c) => {
    const p = c.props;
    for (let i = 0; i < p.length; i += 7) {
      if (!hit(p[i], p[i + 1])) continue;
      const E = eaten.get(key(Math.floor(p[i] / CFG.chunk), Math.floor(p[i + 1] / CFG.chunk)));
      if (!E || !inEaten(E, p[i], p[i + 1])) gain += 0.002 + p[i + 3] * 0.0025;      // a tree is a bigger meal than a weed
    }
    for (const name in c.boxes) { const b = c.boxes[name]; for (let i = 0; i < b.length; i += 7) if (hit(b[i], b[i + 2])) { const E = eaten.get(key(Math.floor(b[i] / CFG.chunk), Math.floor(b[i + 2] / CFG.chunk))); if (!E || !inEaten(E, b[i], b[i + 2])) gain += 0.05; } }
  });
  eatAdd(x, z, r);
  return Math.min(0.05, gain);
}
const slime = createSlimeRound({
  scene, world: creatureWorld,
  hooks: {
    say: (text) => toast(text),
    damage: (amount, cause) => damagePlayer(amount, cause),
    eat: MAP.interior ? () => 0 : slimeEat,
    inWater: (x, z) => inLake(x, z) || !!MAP.slimeWater?.(x, z, opened),
    cling(seconds) {
      slimeFx.clingUntil = uTime.value + seconds;
      noise1(0.3, 'lowpass', 700, 200, 0.45);
      toast('Slime clings to your legs. You are slowed');
    },
    pop(x, z) {
      const v = Math.max(0, 1 - Math.hypot(camera.position.x - x, camera.position.z - z) / 30);
      if (v > 0.02) { noise1(0.16, 'bandpass', 1200, 300, 0.4 * v); thump(260, 90, 0.12, 0.3 * v); }
    },
    stomp(x, z, r, dist) {                       // every landing: a wet thud, and from a certain size the ground takes it too
      const reach = 18 + r * 3.4, near = Math.max(0, 1 - dist / reach), size = Math.min(1, r / 9);
      if (near > 0.02) { thump(70 - size * 30, 30, 0.22 + size * 0.3, (0.18 + size * 0.5) * near); noise1(0.2 + size * 0.25, 'lowpass', 260 - size * 120, 50, (0.15 + size * 0.45) * near); }
      if (r > SLIME.shakeR) consumerViewShake.value = Math.max(consumerViewShake.value, near * Math.min(1.8, 0.4 + (r - SLIME.shakeR) * 0.16));
    },
    rumble(v) {                                  // under the thuds, the ground itself: louder the bigger and the nearer
      if (!slimeFx.bed) { if (v <= 0) return; slimeFx.bed = noiseBed(mix.creatures, 'lowpass', 62, 0.9, 0); }
      slimeFx.bed.gain.gain.setTargetAtTime(v * 0.85, audioCtx.currentTime, 0.12);
      if (v > 0) consumerViewShake.value = Math.max(consumerViewShake.value, v * 0.9);
    },
    fizz(x, z, r, dt) {
      if ((slimeFx.fizz -= dt) > 0) return;
      slimeFx.fizz = 0.22;
      const v = Math.max(0, 1 - Math.hypot(camera.position.x - x, camera.position.z - z) / 60);
      noise1(0.3, 'highpass', 2400, 5200, 0.3 * v);
    },
    dissolved() {
      noise1(1.6, 'highpass', 1800, 6000, 0.4); thump(120, 40, 0.8, 0.5);
      slimeTravel.pending = true;
      roundWon(true, slimeBay ? 'The deluge dissolves the last of it.' : 'The water takes it apart. The lake is still moving. Something under it is pulling');
    },
  },
});
function startSlimeRound() {
  flashlight.equipped = true;
  if (flashlight.battery <= 0.1 && inv.batteries <= 0) inv.batteries = 1;
  inv.gun = true;
  inv.mag = Math.max(inv.mag, GUN.mag);
  inv.reserve = Math.max(inv.reserve, GUN.mag * 2);
  const px = camera.position.x, pz = camera.position.z;
  slimeBay = MAP.slimeTrap?.(px, pz) ?? null;
  const target = slimeBay || lake;
  slime.start({ round: round.n, x: px, z: pz, awayX: px - target.x, awayZ: pz - target.z });
  if (round.announced) announceSlime();
}
function announceSlime() {
  if (slimeBay) {
    banner('THE SLIME', 'Gunfire only slows it. The fire-suppression bay can dissolve it.');
    toast('Follow DELUGE. Pull the valve, then lure the Slime through the flooded bay.');
    return;
  }
  banner('THE SLIME', 'It eats what it rolls over, and it grows. Nothing you carry will kill it. Lead it into the lake');
  toast(`The lake is ${Math.round(Math.hypot(camera.position.x - lake.x, camera.position.z - lake.z))} m away: follow the WATER arrow at the top. It is slower than your run. Shoot the small ones before they reach your legs.`);
}
// "184 m ↗": how far the lake is, and which way to turn for it.
function waterSign() {
  const target = slimeBay || lake;
  const dx = target.x - camera.position.x, dz = target.z - camera.position.z, d = Math.hypot(dx, dz);
  if (d < target.r) return slimeBay ? opened.has(target.id) ? 'FLOODED' : 'PULL VALVE' : 'HERE';
  let a = Math.atan2(-dx, -dz) - yaw + (facilityView?.compass ?? 0) * Math.sin(uTime.value * 4) * 1.9;                       // 0 = dead ahead, positive = to the left
  a = ((a % 6.2832) + 6.2832) % 6.2832;
  return `${Math.round(d - target.r)} m ${'↑↖←↙↓↘→↗'[Math.round(a / 0.7854) % 8]}`;
}
function updateSlime(dt, inControl) {
  // the lake is there in every round: you wade in it, slower and lower
  wade.in = inControl && !swim.in && inLake(camera.position.x, camera.position.z, -0.5);
  wade.sink += ((wade.in ? 0.5 : 0) - wade.sink) * Math.min(1, dt * 4);
  if (wade.in && playerSpeedNow > 0 && (wade.step -= dt) <= 0) { wade.step = 0.42; noise1(0.22, 'bandpass', 900, 350, 0.22); }
  lakeMesh.material.opacity = 0.86 + Math.sin(uTime.value * 1.3) * 0.05;
  slime.update(dt, { inControl: inControl && playing, x: camera.position.x, z: camera.position.z });
  if (eatenDirty) { eatenDirty = false; refreshChunks(true); }
  updateSlimeTravel(dt);
}
function travelToNextMap(nextRound) {
  if (mapFall.active) return;
  const choices = MAP_NAMES.filter((name) => name !== MAP_NAME);
  const map = choices[Math.floor(Math.random() * choices.length)];
  const checkpoint = {
    map,
    seed: (Math.random() * 1e9) | 0,
    nextRound,
    fall: { startedAt: Date.now(), label: MAP_META[map].label },
    run: {
      inv, bag, armor, sanity, stamina, staminaMax, needRecover, elapsed, clock: uTime.value,
      battery: flashlight.battery, flashlightEquipped: flashlight.equipped, matchTime: match.t,
      radarAcquired: radar.acquired, radarEquipped: radar.equipped, monsterStreak, recentMonsters, forcedMonster,
      companion: collective.saveCompanion(),
    },
  };
  history.replaceState({ ...history.state, [TRAVEL_STATE]: checkpoint }, '');
  mapFall.launch(checkpoint.fall.label, () => location.reload());
  playing = false;
  holdingBreath = gun.aiming = gun.trigger = false;
  gun.burst = 0;
  for (const k in keys) keys[k] = false;
  overlay.style.display = 'none';
  fadeEl.style.transition = ''; fadeEl.style.background = ''; fadeEl.style.opacity = '0';
  if (document.pointerLockElement) document.exitPointerLock();
  syncFootsteps(null);
  syncBodyAudio(null, false);
  syncAmbience(null);
  syncRoundMusic(false, round.n, false);
  setHuntSilence(true);
  noise1(1.43, 'lowpass', 620, 105, 0.72);
  thump(108, 32, 0.92, 0.48);
}

function restoreRun(run) {
  Object.assign(inv, run.inv);
  Object.assign(bag, run.bag);
  Object.assign(armor, run.armor);
  Object.assign(sanity, run.sanity);
  stamina = run.stamina; staminaMax = run.staminaMax; needRecover = run.needRecover;
  elapsed = run.elapsed; uTime.value = run.clock;
  flashlight.battery = run.battery; flashlight.equipped = run.flashlightEquipped;
  match.t = run.matchTime;
  radar.acquired = run.radarAcquired; radar.equipped = run.radarEquipped;
  fitGun();
  visionUniforms.uStain.value = Math.min(STAIN_RED_CAP, inv.innocents * STAIN_RED);
  collective.restoreCompanion(run.companion);
}

// Reseed the current location when the lake carries you to another part of it.
function newWorld() {
  CFG.seed = (Math.random() * 1e9) | 0;
  MAP.reseed();
  for (const k of chunks.keys()) { unmountCameraWords(k); interiorLook?.unmount(k); }
  chunks.clear(); farChunks.clear(); eaten.clear(); lore.clear(); clearDrops();
  opened.clear(); openedChests.length = 0; chestLootRolls.clear();
  placeLake();
  camera.position.x = 0; camera.position.z = 0;
  refreshChunks(true);
}
// The lake pulls you under (the screen goes to water), and you come up out of water into another map, where the next round starts.
const TRAVEL = { under: 1.1, hold: 0.7, rise: 3.0 };
function beginSlimeTravel(next) {
  slimeTravel.pending = false;
  if (roundsHere >= ROUND.locationRounds) { travelToNextMap(next); return; }
  if (slimeBay) {
    startRound(next);
    return;
  }
  slimeTravel.t = 0; slimeTravel.next = next; slimeTravel.swapped = false;
  fadeEl.style.transition = ''; fadeEl.style.background = 'radial-gradient(circle at 50% 35%, #3f8fd8, #0d3f86 55%, #041c44)';
  noise1(1.4, 'lowpass', 900, 120, 0.6); thump(90, 30, 1.0, 0.5);
}
function updateSlimeTravel(dt) {
  const T = slimeTravel; if (T.t < 0) return;
  T.t += dt;
  const ease = (k) => k * k * (3 - 2 * k);
  if (T.t < TRAVEL.under) {
    const k = ease(T.t / TRAVEL.under);
    fadeEl.style.opacity = k; cut.y = -1.25 * k; cut.pitch = -0.25 * k;
    return;
  }
  if (!T.swapped) {
    T.swapped = true; fadeEl.style.opacity = 1;
    newWorld(); startRound(T.next);
    noise1(2.2, 'bandpass', 500, 1800, 0.35);
  }
  const k = Math.min(1, Math.max(0, (T.t - TRAVEL.under - TRAVEL.hold) / TRAVEL.rise)), e = ease(k);
  fadeEl.style.opacity = 1 - e; cut.y = -1.25 * (1 - e); cut.pitch = 0.5 * (1 - e) * (1 - k);   // head back, breaking the surface, then level
  if (k >= 1) { T.t = -1; fadeEl.style.opacity = 0; fadeEl.style.background = ''; cut.y = 0; cut.pitch = 0; toast('You wash up on another shore.'); }
}
function startConsumerRound() {
  flashlight.equipped = true;
  if (flashlight.battery <= 0.1 && inv.batteries <= 0) inv.batteries = 1;
  inv.gun = true;
  inv.mag = Math.max(inv.mag, GUN.mag);
  inv.reserve = Math.max(inv.reserve, GUN.mag * 2);
  consumer.start({ round: round.n, center: camera.position });
  if (round.announced) announceConsumer();
}
function announceConsumer() {
  banner('THE CONSUMER', 'Dozens of civilians are loose. Stop the feeding, save who you can, and kill the thing before it grows.');
  const rescue = 'Hold E beside a civilian for 4.2 seconds to rescue them. Each rescue is worth 4 parts.';
  toast(MAP.interior ? rescue : rescue + ' Its growth turns the weather against you. Seek a roof when the air darkens.');
}
function updateConsumer(dt, inControl) {
  if (!consumer.active) { updateConsumerAtmosphere(dt, inControl); return; }
  const runningNow = playerRunningNow;
  consumer.update(dt, {
    inControl: inControl && playing,
    x: camera.position.x, z: camera.position.z, yaw,
    moving: playerSpeedNow > 0, running: runningNow, holdingBreath,
    interacting: !!keys.KeyE,
    surfaceNoise: facility?.noiseScale(camera.position.x, camera.position.z) ?? 1,
    ambientNoise: facility?.noiseScale(camera.position.x, camera.position.z, 'breath') ?? 1,
  });
  updateConsumerAtmosphere(dt, inControl && playing);
}

const unseenVoices = new Map();
function silenceUnseen(monster) {
  const voice = unseenVoices.get(monster);
  if (!voice) return;
  stopClip(voice, 0.08);
  unseenVoices.delete(monster);
}
const unseen = createUnseenRound({
  scene,
  world: { ...creatureWorld, losBlocked: (x0, z0, x1, z1) => creatureWorld.losBlocked(x0, z0, x1, z1, true) },
  hooks: {
    damage: damagePlayer,
    screech(monster, attack) {
      if (unseenVoices.has(monster) && !attack) return;
      silenceUnseen(monster);
      const volume = attack ? 1.08 : 0.52;
      const voice = playCreatureClip(unseenScreech, monster, false, volume);
      voice.volume = volume;
      voice.src.playbackRate.value = attack ? 1.08 : 0.87 + Math.random() * 0.14;
      unseenVoices.set(monster, voice);
      voice.src.onended = () => {
        voice.src.disconnect(); voice.gain.disconnect(); voice.panner.disconnect();
        if (unseenVoices.get(monster) === voice) unseenVoices.delete(monster);
      };
    },
    silence: silenceUnseen,
  },
});
function announceUnseen() {
  banner('THE UNSEEN', `Round ${round.n}. ${unseen.monsters.length} are watching.`);
  toast('Watch for moving branches. A match reveals their shape. Face them to stop an attack.');
}
function updateUnseen(dt, inControl, cameraView) {
  unseen.update(dt, camera, {
    inControl, yaw,
    matchRange: match.t > 0 && matchLight.intensity > 0.4 ? CFG.match.distance : 0,
    cameraRange: cameraView ? 28 : 0,
  });
  unseenRustle.count.value = inControl ? unseen.monsters.length : 0;
  if (!inControl) return;
  unseen.monsters.forEach((m, i) => unseenRustle.paths.value[i].set(m.x, m.z, m.trailX, m.trailZ));
  for (const [monster, voice] of unseenVoices) {
    placeCreatureVoice(voice, monster, creatureSoundPlace(monster), 1.3 * voice.volume);
  }
}

const lightboundVoices = new Map();
function silenceLightbound(monster) {
  const voice = lightboundVoices.get(monster);
  if (!voice) return;
  lightboundVoices.delete(monster);
  stopClip(voice, 0.06);
}

const lightbound = createLightboundRound({
  scene, world: creatureWorld,
  fixtures: () => near.lights,
  fixtureIsOn: (id, x, y, z, minimum) => litFacilityFixtures.get(id)?.some(beam => mapLightAt(beam, x, y, z) >= minimum) ?? false,
  hooks: {
    level: (x, z, kind) => fixtureLevel(kind, fixtureSeed(x, z), uTime.value),
    damage: amount => damagePlayer(amount, 'lightbound'),
    sanity: amount => { sanity.value = Math.max(0, sanity.value - amount); },
    switched() {
      sfx.door();
      thump(115, 74, 0.33, 0.26);
      toast('The breaker holds for 20 seconds. Take your shots.');
    },
    screech(monster, reason) {
      if (audioCtx.state !== 'running' || Math.hypot(monster.x - camera.position.x, monster.z - camera.position.z) > 29) return;
      if (lightboundVoices.has(monster) && reason === 'idle') return;
      if (lightboundVoices.size >= 4 && !lightboundVoices.has(monster)) {
        if (reason !== 'hit') return;
        silenceLightbound(lightboundVoices.keys().next().value);
      }
      silenceLightbound(monster);
      const volume = reason === 'hit' ? 1.15 : reason === 'near' ? 0.98 : 0.57;
      const voice = playCreatureClip(unseenScreech, monster, false, volume);
      voice.volume = volume;
      voice.src.playbackRate.value = (reason === 'hit' ? 0.84 : 0.68) + 0.13 * monster.variation;
      lightboundVoices.set(monster, voice);
      voice.src.onended = () => {
        voice.src.disconnect(); voice.gain.disconnect(); voice.panner.disconnect();
        if (lightboundVoices.get(monster) === voice) lightboundVoices.delete(monster);
      };
    },
    silence() { for (const monster of lightboundVoices.keys()) silenceLightbound(monster); },
  },
});

function startLightboundRound(n) {
  lightbound.start(n, camera.position);
  if (!inv.gun) { inv.gun = true; inv.mag = GUN.mag; }
  if (!ITEM_DEFS[bag.activeWeapon]) bag.activeWeapon = 'gun';
  // Provide enough rounds to clear the fixtures with the equipped pistol and a few misses.
  inv.reserve = Math.max(inv.reserve, Math.ceil(lightbound.health * 1.3 / GUN.damage) + GUN.mag - inv.mag);
}

function updateLightbound(dt, inControl) {
  lightbound.updateBodies(dt, { player: camera.position, inControl });
  for (const [monster, voice] of lightboundVoices) {
    if (!inControl) { silenceLightbound(monster); continue; }
    placeCreatureVoice(voice, monster, creatureSoundPlace(monster), 1.3 * voice.volume);
  }
}

// Short spatial cues stay separate from the score and die with the encounter.
const encounterVoices = new Set();
const encounterCues = {
  stone: [119, 48, 0.36, 0.33, 'triangle'],
  crack: [155, 38, 0.32, 0.56, 'sawtooth'],
  latch: [425, 150, 0.12, 0.38, 'triangle'],
  rumble: [55, 29, 0.53, 0.58, 'sine'],
  thread: [1100, 245, 0.24, 0.32, 'triangle'],
  mimic: [235, 74, 0.38, 0.32, 'triangle'],
  buzz: [98, 113, 0.55, 0.37, 'sawtooth'],
  step: [75, 36, 0.27, 0.51, 'triangle'],
  bell: [625, 617, 1.6, 0.46, 'sine'],
  clockLow: [560, 375, 0.09, 0.45, 'triangle'],
  clockMid: [780, 540, 0.09, 0.41, 'triangle'],
  clockHigh: [1040, 670, 0.09, 0.38, 'triangle'],
  falseTick: [370, 280, 0.08, 0.27, 'triangle'],
};
function encounterCue(kind, point, volume = 1) {
  if (audioCtx.state !== 'running' || encounterVoices.size >= 14) return;
  const [from, to, duration, loudness, wave] = encounterCues[kind];
  const { vol, pan } = creatureSoundPlace(point);
  const distance = Math.hypot(point.x - camera.position.x, point.z - camera.position.z);
  if (distance > 43) return;
  const panner = audioCtx.createStereoPanner();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = creatureWorld.losBlocked(camera.position.x, camera.position.z, point.x, point.z, true) ? 720 : 2800;
  panner.pan.value = pan;
  filter.connect(panner).connect(ghostOut);
  const voice = { sources: new Set(), panner, filter };
  function tone(factor, delay, scale) {
    const oscillator = audioCtx.createOscillator(), gain = audioCtx.createGain();
    const t = audioCtx.currentTime + delay;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from * factor, t);
    oscillator.frequency.exponentialRampToValueAtTime(to * factor, t + duration);
    gain.gain.setValueAtTime(Math.max(0.001, vol * volume * loudness * scale), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    oscillator.connect(gain).connect(filter);
    voice.sources.add(oscillator);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      gain.disconnect();
      voice.sources.delete(oscillator);
      if (!voice.sources.size) { filter.disconnect(); panner.disconnect(); encounterVoices.delete(voice); }
    }, { once: true });
    oscillator.start(t);
    oscillator.stop(t + duration);
  }
  encounterVoices.add(voice);
  tone(1, 0, 1);
  if (kind.startsWith('clock')) tone(0.79, 0.155, 0.82);
  if (kind === 'bell') tone(2.41, 0, 0.38);
}
const specialRounds = createSpecialRounds({
  scene, world: creatureWorld, camera, atlas, atlasTexture: atlasTex,
  hooks: {
    map: MAP_NAME, random: Math.random, cue: encounterCue, say: toast, hurt: damagePlayer, parts: addParts,
    silence() {
      for (const voice of encounterVoices) {
        voice.filter.disconnect();
        voice.panner.disconnect();
        for (const source of voice.sources) stopSrc(source);
      }
      encounterVoices.clear();
    },
    match() {
      if (!inv.matches && match.t <= 0) inv.matches = 1;
      strikeMatch();
    },
    recharge() {
      flashlight.battery = Math.max(0.35, flashlight.battery);
      toast('The binding stand charges your flashlight.');
    },
    drain(seconds) { flashlight.battery = Math.max(0, flashlight.battery - seconds * 0.028); },
    tug(point, amount) {
      const dx = point.x - camera.position.x, dz = point.z - camera.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7 || swim.in) return;
      camera.position.x += dx / d * amount;
      camera.position.z += dz / d * amount;
      collide(camera.position);
    },
  },
});

function updateClock() {
  const left = Math.max(0, roundSeconds() - round.t), m = Math.floor(left / 60), s = Math.floor(left % 60);
  const time = `${m}:${String(s).padStart(2, '0')}`;
  let text;
  if (round.rest > 0) text = `ROUND ${round.n} SURVIVED`;
  else if (isCollectiveRound()) text = `${roundTag()} · THE COLLECTIVE`;
  else if (isChoirRound()) {
    const hive = choir.hive;
    const core = choir.exposed && hive ? `CORE ${hive.hp}/${hive.maxHp}` : 'CORE HIDDEN';
    text = `${roundTag()} · THE CHOIR · ${choir.state} · SINGERS ${choir.alive} · GRUNTS ${choir.grunts} · ${core}`;
  } else if (isSlimeRound()) {
    text = `${roundTag()} · THE SLIME · ${(slime.r * 2).toFixed(1)} m WIDE · ${slimeBay ? 'DELUGE' : 'WATER'} ${waterSign()}`;
  } else if (isConsumerRound()) {
    text = `${roundTag()} · THE CONSUMER · CIVILIANS ${consumer.civilians} · SAVED ${consumer.rescued} · ${consumer.health}/${consumer.maxHealth} HP`;
  } else if (isObserverRound()) text = `${roundTag()} · ${time} · BODIES ${obsRound.burned}/${obsRound.total}${obsRound.sense ? ' · ' + obsRound.sense : ''}`;
  else if (isUnseenRound()) text = `${roundTag()} · ${time} · UNSEEN ${unseen.monsters.length}`;
  else if (isLightboundRound()) text = `${roundTag()} · LIGHTBOUND ${lightbound.remaining} · ${lightbound.status}${lightbound.draining ? ' · DRAINING' : ''}`;
  else if (isCultRound()) text = `${roundTag()} · THE CULT`;
  else if (specialRound()) text = `${roundTag()} · ${specialRound().name.toUpperCase()} · ${specialRounds.status}`;
  else text = `${roundTag()} · ${time} · GHOSTS ${ghostsAlive()}`;
  if (clockEl.textContent !== text) clockEl.textContent = text;
}

function nearestHostileDistance() {
  const px = camera.position.x, pz = camera.position.z;
  let nearest = Infinity;
  const consider = (x, z) => { if (Number.isFinite(x) && Number.isFinite(z)) nearest = Math.min(nearest, Math.hypot(x - px, z - pz)); };
  for (const g of ghosts) if (g.state !== 'die' && g.state !== 'flee') consider(g.x, g.z);
  if (obsRound.active) for (const o of obsRound.observers) if (o.active) consider(o.position.x, o.position.z);
  if (collective.active) for (const k of collective.kids) if (!k.gone) consider(k.x, k.z);
  if (choir.active) {
    for (const s of choir.singers) if (s.alive) consider(s.x, s.z);
    if (choir.hive && !choir.hive.dead) consider(choir.hive.x, choir.hive.z);
  }
  if (consumer.active && !consumer.dead) consider(consumer.x, consumer.z);
  if (slime.active) { consider(slime.x, slime.z); for (const l of slime.littles) consider(l.x, l.z); }
  for (const monster of unseen.monsters) consider(monster.x, monster.z);
  for (const monster of lightbound.creatures) if (monster.model.root.visible) consider(monster.x, monster.z);
  for (const monster of specialRounds.hostiles) consider(monster.x, monster.z);
  return nearest;
}

function flashlightOnHorror() {
  if (!(flashlight.equipped && flashlight.raise > 0.6 && flashlight.battery > 0 && spot.intensity > 1)) return false;
  const px = camera.position.x, py = camera.position.y, pz = camera.position.z;
  camera.getWorldDirection(aim);
  const lit = (x, y, z) => {
    const dx = x - px, dy = y - py, dz = z - pz;
    const horiz = Math.hypot(dx, dz), len = Math.hypot(horiz, dy);
    if (horiz > GHOST.beamRange || len < 1e-4) return false;
    const ang = Math.acos(THREE.MathUtils.clamp((dx * aim.x + dy * aim.y + dz * aim.z) / len, -1, 1));
    if (ang >= GHOST.beamAngle) return false;
    return !creatureWorld.losBlocked(px, pz, x, z);
  };
  for (const g of ghosts) {
    if (g.state === 'die') continue;
    if (lit(g.x, g.mesh.position.y || MAP.groundY(g.x, g.z) + 1.2, g.z)) return 'ghost';
  }
  if (obsRound.active) for (const o of obsRound.observers) {
    if (o.active && lit(o.position.x, MAP.groundY(o.position.x, o.position.z) + 1.6, o.position.z)) return 'observer';
  }
  if (collective.active) for (const k of collective.kids) {
    if (!k.gone && lit(k.x, MAP.groundY(k.x, k.z) + 0.9, k.z)) return 'collective';
  }
  return '';
}

// A breaking mind puts figures in the world. Children appear and run, and the Observer stands in the
// flashlight beam, then is gone. None of them are real: they do not hunt or harm.
const mindMats = createCollectiveMaterials();
const mindKids = Array.from({ length: 4 }, () => {
  const c = buildChild(mindMats, Math.random);
  c.root.visible = false;
  scene.add(c.root);
  return { c, on: false, x: 0, z: 0, heading: 0, speed: 0, life: 0, delay: 0, gait: 0 };
});
const mindObserverModel = createObserverModel();
mindObserverModel.root.visible = false;
scene.add(mindObserverModel.root);
const mindObserverAnim = new ObserverAnimator(mindObserverModel);
const mindObserver = { on: false, mode: 'stare', x: 0, z: 0, heading: 0, life: 0, speed: 0, stepped: false };
const mindStats = { kids: 0, observer: 0, kidRun: 0, ahead: 0, fronts: 0, charges: 0, lastMode: '' };
let mindKidIn = 1.1, mindObsIn = 1.6;
const beamLive = () => flashlight.equipped && flashlight.battery > 0.05 && flashlight.raise > 0.6 && spot.intensity > 2;
const matchLive = () => match.t > 0.25 && matchLight.intensity > 0.4;
const lightLive = () => beamLive() || matchLive();
const mindAudio = createObserverAudio(audioCtx, mix.creatures, longNoise, boneBuffer, OBS_CLIPS);

function hideMindKid(k) { k.on = false; k.c.root.visible = false; }
function hideMindObserver() {
  if (mindObserver.on) mindAudio.stop();
  mindObserver.on = false;
  mindObserverModel.root.visible = false;
}
function mindRay(x, y, z, radius) {
  const o = camera.position;
  const cx = x - o.x, cy = y - o.y, cz = z - o.z;
  const t = cx * aim.x + cy * aim.y + cz * aim.z;
  if (t <= 0.2 || t > BULLET_RANGE) return Infinity;
  const mx = cx - aim.x * t, my = cy - aim.y * t, mz = cz - aim.z * t;
  if (mx * mx + mz * mz > radius * radius || Math.abs(my) > radius * 2.4) return Infinity;
  if (creatureWorld.losBlocked(o.x, o.z, x, z)) return Infinity;
  return t;
}
function shootHallucination() {
  camera.getWorldDirection(aim);
  let best = Infinity, kid = null, observer = false;
  for (const k of mindKids) {
    if (!k.on || !k.c.root.visible) continue;
    const t = mindRay(k.x, k.c.root.position.y + 0.75, k.z, 0.34);
    if (t < best) { best = t; kid = k; observer = false; }
  }
  if (mindObserver.on && mindObserverModel.root.visible) {
    const t = mindRay(mindObserver.x, MAP.groundY(mindObserver.x, mindObserver.z) + 1.35, mindObserver.z, 0.42);
    if (t < best) { best = t; kid = null; observer = true; }
  }
  if (!kid && !observer) return;
  for (const g of ghosts) {
    if (g.state === 'die') continue;
    if (mindRay(g.x, g.mesh.position.y, g.z, 0.3 * (g.sizeScale || 1)) < best) return;
  }
  if (kid) hideMindKid(kid);
  else hideMindObserver();
  sanity.value = Math.max(0, sanity.value - SANITY_HALLUCINATION);
  toast('Nothing was there. The shot stays in your head.');
}
function mindRel(x, z) {
  let rel = Math.atan2(-(x - camera.position.x), -(z - camera.position.z)) - yaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  return rel;
}
mindObserverAnim.onStep = () => {
  const o = mindObserver;
  if (!o.on || !mindObserverModel.root.visible) return;
  mindAudio.step(mindRel(o.x, o.z), Math.hypot(camera.position.x - o.x, camera.position.z - o.z), o.mode === 'charge' ? 1.15 : 0.55, o.mode === 'charge' ? 1.25 : 1);
};
function clearMind() {
  for (const k of mindKids) hideMindKid(k);
  hideMindObserver();
}
function placeInView(minD, maxD, spread) {
  const px = camera.position.x, pz = camera.position.z;
  for (let i = 0; i < 16; i++) {
    const a = yaw + (Math.random() - 0.5) * 2 * spread;
    const d = minD + Math.random() * (maxD - minD);
    const x = px - Math.sin(a) * d, z = pz - Math.cos(a) * d;
    if (!creatureWorld.walkable(x, z, 0.35) || creatureWorld.losBlocked(px, pz, x, z)) continue;
    return { x, z, y: MAP.groundY(x, z) };
  }
  return null;
}
function headingWithRoom(x, z, preferred) {
  for (const h of [preferred, preferred + Math.PI, yaw + Math.PI, yaw]) {
    const nx = x + Math.sin(h) * 0.9, nz = z + Math.cos(h) * 0.9;
    if (creatureWorld.walkable(nx, nz, 0.28)) return h;
  }
  return preferred;
}
function spawnMindKid() {
  const slot = mindKids.find((k) => !k.on);
  const spotAt = placeInView(2.2, beamLive() ? 6.2 : 10, beamLive() ? L.angle * 0.65 : 1.05);
  if (!slot || !spotAt) return false;
  const across = yaw + (Math.random() < 0.5 ? 1 : -1) * (0.55 + Math.random() * 1.05);
  slot.on = true;
  slot.x = spotAt.x; slot.z = spotAt.z;
  slot.heading = headingWithRoom(spotAt.x, spotAt.z, across);
  slot.speed = 2.4 + Math.random() * 2.2;
  slot.life = 0.85 + Math.random() * 1.7;
  slot.delay = Math.random() < 0.4 ? 0.12 + Math.random() * 0.28 : 0;
  slot.gait = Math.random() * 6.28;
  slot.c.root.visible = true;
  slot.c.root.position.set(spotAt.x, spotAt.y, spotAt.z);
  slot.c.root.rotation.y = slot.heading;
  slot.bornX = spotAt.x; slot.bornZ = spotAt.z;
  poseChild(slot.c, 'idle', slot.gait, uTime.value);
  mindStats.kids++;
  return true;
}
function observerLook(o) {
  const dx = camera.position.x - o.x, dz = camera.position.z - o.z;
  const face = Math.atan2(dx, dz);
  let lookYaw = face - o.heading;
  while (lookYaw > Math.PI) lookYaw -= Math.PI * 2;
  while (lookYaw < -Math.PI) lookYaw += Math.PI * 2;
  const lookPitch = Math.atan2(camera.position.y - (MAP.groundY(o.x, o.z) + 2.15), Math.hypot(dx, dz));
  return { speed: o.speed, lookYaw, lookPitch };
}
function spawnMindObserver() {
  if (mindObserver.on || !lightLive()) return false;
  const charging = Math.random() < 0.45;
  const spread = charging ? (beamLive() ? L.angle * 0.9 : 0.5) : (beamLive() ? L.angle * 0.2 : 0.26);
  const spotAt = placeInView(charging ? 6.2 : 1.8, charging ? (beamLive() ? 12 : 8.2) : 4.2, spread);
  if (!spotAt) return false;
  const roll = Math.random();
  const o = mindObserver;
  o.on = true;
  o.mode = charging ? 'charge' : roll < 0.5 ? 'stare' : roll < 0.75 ? 'blink' : 'step';
  o.x = spotAt.x; o.z = spotAt.z; o.stepped = false;
  o.life = o.mode === 'charge' ? 2.6 : o.mode === 'blink' ? 0.9 : 0.7 + Math.random() * 0.6;
  o.speed = o.mode === 'charge' ? 6.4 : o.mode === 'step' ? 0.85 : 0;
  o.heading = Math.atan2(camera.position.x - spotAt.x, camera.position.z - spotAt.z);
  mindObserverModel.root.visible = true;
  mindObserverModel.root.position.set(spotAt.x, spotAt.y, spotAt.z);
  mindObserverModel.root.rotation.y = o.heading;
  mindObserverAnim.setState(o.mode === 'charge' ? 'hunt' : o.mode === 'step' ? 'stalk' : 'idle');
  const look = observerLook(o);
  mindObserverAnim.update(0.5, look);
  mindObserverAnim.update(0.5, look);
  const dx = spotAt.x - camera.position.x, dz = spotAt.z - camera.position.z, dist = Math.hypot(dx, dz) || 1;
  mindStats.ahead = Math.max(mindStats.ahead, (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / dist);
  mindStats.observer++;
  mindStats.lastMode = o.mode;
  if (o.mode === 'charge') mindStats.charges++; else mindStats.fronts++;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const rel = mindRel(o.x, o.z);
  if (o.mode === 'charge') mindAudio.screech(rel, dist);
  else mindAudio.exhale(rel, Math.min(dist, 4));
  return true;
}
function updateMind(dt, value) {
  if (value > 68) {
    clearMind();
    mindKidIn = 2.5;
    mindObsIn = 4;
    return;
  }
  const broken = (68 - value) / 68;
  for (const k of mindKids) {
    if (!k.on) continue;
    k.life -= dt;
    if (k.life <= 0) { hideMindKid(k); continue; }
    const moving = k.delay <= 0;
    if (!moving) k.delay -= dt;
    k.gait += dt * (moving ? k.speed : 0.4) * 6.5;
    if (moving) {
      const nx = k.x + Math.sin(k.heading) * k.speed * dt, nz = k.z + Math.cos(k.heading) * k.speed * dt;
      if (!creatureWorld.walkable(nx, nz, 0.28)) { hideMindKid(k); continue; }
      k.x = nx; k.z = nz;
    }
    k.c.root.position.set(k.x, MAP.groundY(k.x, k.z), k.z);
    k.c.root.rotation.y = k.heading;
    poseChild(k.c, moving ? (k.speed > 3.2 ? 'run' : 'walk') : 'idle', k.gait, uTime.value);
    if (Math.hypot(k.x - camera.position.x, k.z - camera.position.z) > 16) hideMindKid(k);
    else mindStats.kidRun = Math.max(mindStats.kidRun, Math.hypot(k.x - k.bornX, k.z - k.bornZ));
  }
  if (mindObserver.on) {
    const o = mindObserver;
    const distNow = Math.hypot(camera.position.x - o.x, camera.position.z - o.z);
    if (o.mode === 'charge' && distNow < 1.45) { mindAudio.shriek(); hideMindObserver(); }     // it reaches you, and is gone
    else if (!lightLive()) hideMindObserver();
    else {
      o.life -= dt;
      if (o.life <= 0) hideMindObserver();
      else {
        if (o.mode === 'blink') {
          mindObserverModel.root.visible = o.life > 0.55 || o.life < 0.36;
          if (o.life < 0.36 && !o.stepped) {
            const px = camera.position.x, pz = camera.position.z;
            const dx = px - o.x, dz = pz - o.z, dist = Math.hypot(dx, dz) || 1;
            const nx = o.x + dx / dist * 1.15, nz = o.z + dz / dist * 1.15;
            if (Math.hypot(nx - px, nz - pz) > 1.7 && creatureWorld.walkable(nx, nz, 0.4) && !creatureWorld.losBlocked(px, pz, nx, nz)) {
              o.x = nx; o.z = nz;
            }
            o.stepped = true;
          }
        }
        if (o.mode !== 'cross') o.heading = Math.atan2(camera.position.x - o.x, camera.position.z - o.z);
        if (o.speed > 0 && mindObserverModel.root.visible) {
          const nx = o.x + Math.sin(o.heading) * o.speed * dt, nz = o.z + Math.cos(o.heading) * o.speed * dt;
          const px = camera.position.x, pz = camera.position.z;
          const room = o.mode === 'charge' ? 1.35 : 1.6;
          if (Math.hypot(nx - px, nz - pz) > room && creatureWorld.walkable(nx, nz, 0.4)) { o.x = nx; o.z = nz; }
          else if (o.mode === 'charge') { if (Math.hypot(o.x - px, o.z - pz) < 2.4) mindAudio.shriek(); hideMindObserver(); }   // shriek only if it got to you, not if a wall stopped it
        }
        if (mindObserver.on) {
          mindObserverModel.root.position.set(o.x, MAP.groundY(o.x, o.z), o.z);
          mindObserverModel.root.rotation.y = o.heading;
          const dist = Math.hypot(camera.position.x - o.x, camera.position.z - o.z);
          mindObserverModel.sizeEyes(dist, (camera.fov * Math.PI / 180) / CFG.renderHeight);
          mindObserverModel.mats.setEyeGlow(o.mode === 'charge' ? 0.9 : 0.62);
          const look = observerLook(o);
          mindObserverAnim.update(dt, look);
          if (mindObserverModel.root.visible) {
            mindAudio.breath(dt, mindRel(o.x, o.z), dist, o.mode === 'charge' ? 1 : 0.72, o.mode === 'charge' ? 28 : 18);
            mindAudio.bones(o.speed > 0.4, mindRel(o.x, o.z), dist);
          }
        }
      }
    }
  }
  const cap = 1 + Math.floor(broken * 3);
  mindKidIn -= dt;
  if (mindKidIn <= 0 && mindKids.filter((k) => k.on).length < cap) {
    mindKidIn = spawnMindKid() ? 1.2 + Math.random() * 2.1 + (1 - broken) * 7 : 0.35;
  }
  if (!mindObserver.on && lightLive()) {
    mindObsIn -= dt * (0.55 + broken);
    if (mindObsIn <= 0) {
      mindObsIn = spawnMindObserver() ? 3.2 + Math.random() * 4.5 + (1 - broken) * 12 : 0.8;
    }
  }
}

function updateSanity(dt, inControl, running) {
  sanityEl.hidden = !inControl;
  if (!inControl) {
    sanityVisionEl.style.opacity = '0';
    sanityHazeEl.style.opacity = '0';
    clearMind();
    return;
  }

  const nearest = nearestHostileDistance();
  const danger = round.rest > 0 ? 0 : THREE.MathUtils.clamp(1 - nearest / 36, 0, 1);
  const safeToRecover = !swim.in && !burn.in && nearest > 14;
  const sheltered = indoors && safeToRecover;
  const stillBreath = holdingBreath && !running && playerSpeedNow < 0.08 && !swim.in && !burn.in;
  // The Collective stands close enough that the usual "away from danger" rule never lets a breath land.
  const collectiveBreath = stillBreath && isCollectiveRound() && collective.encounter;
  // An emptied mind can be filled by a held breath even with danger close; otherwise you die of the void.
  if (sanity.value <= 0) sanity.drained = true;
  if (sanity.value >= 50) sanity.drained = false;
  const emptyBreath = stillBreath && sanity.drained;
  const breathCalm = stillBreath && safeToRecover;
  let recovering = false;
  if (round.rest > 0) {
    sanity.value += dt * 1.6;
    recovering = true;
  } else if (collectiveBreath) {
    sanity.value += dt * SANITY_BREATH_COLLECTIVE;
    recovering = true;
  } else if (emptyBreath) {
    sanity.value += dt * SANITY_BREATH_SHELTER;
    recovering = true;
  } else if (sheltered) {
    sanity.value += dt * (holdingBreath && playerSpeedNow < 0.08 ? SANITY_BREATH_SHELTER : 0.55);
    recovering = true;
  } else if (breathCalm) {
    sanity.value += dt * SANITY_BREATH;
    recovering = true;
  } else {
    const hasLight = (flashlight.equipped && flashlight.battery > 0.05) || match.t > 0;
    const darkness = hasLight ? 0 : 0.035;
    const stress = 0.018 + darkness + danger * 0.31 + (running ? 0.045 : 0);
    sanity.value -= dt * stress * (holdingBreath ? 0.72 : 1);
  }
  const horror = flashlightOnHorror();
  if (horror && !emptyBreath && !(horror === 'collective' && collectiveBreath)) {
    sanity.value -= dt * (horror === 'collective' ? SANITY_LOOK_COLLECTIVE : SANITY_LOOK);
    recovering = false;
  }
  if (obsRound.active) {
    let burning = 0;
    for (const b of obsRound.bodies()) if (!b.done && b.burnT >= 0) burning++;
    if (burning) {
      sanity.value -= dt * SANITY_BURN * burning;
      recovering = false;
    }
  }
  sanity.value = THREE.MathUtils.clamp(sanity.value, 0, SANITY_MAX);
  if (sanity.value <= 0) {
    sanity.drained = true;
    sanity.empty += dt;
    if (sanity.empty >= SANITY_EMPTY) {
      deathCause = 'sanity';
      endGame(false);
      return;
    }
  } else sanity.empty = 0;

  if (sanity.value <= 62 && !sanity.warned) {
    sanity.warned = true;
    toast(collectiveBreath || emptyBreath || (isCollectiveRound() && collective.encounter)
      ? 'Your mind is fraying. Hold Space while still to bring it back.'
      : 'Your mind is fraying. Hold Space while still, or reach shelter to recover sanity.');
  } else if (sanity.value >= 82) sanity.warned = false;

  const value = sanity.value;
  const stress = THREE.MathUtils.clamp((68 - value) / 68, 0, 1);
  sanityFill.style.transform = `scaleX(${value / SANITY_MAX})`;
  sanityEl.classList.toggle('low', value <= 68 && value > 30);
  sanityEl.classList.toggle('critical', value <= 30);
  sanityStateEl.textContent = recovering ? 'RECOVERING' : value > 75 ? 'CLEAR' : value > 50 ? 'UNSTEADY' : value > 25 ? 'FRACTURED' : value > 0 ? 'BREAKING' : 'EMPTY';
  sanityEl.title = useWords(recovering
    ? (collectiveBreath || emptyBreath
      ? 'Holding Space is restoring your sanity.'
      : 'Sanity is recovering. Shelter restores it; holding Space while still restores it faster.')
    : 'Hold Space while still to recover sanity. An empty mind can still be filled that way. A potion restores it too. Shelter helps.');
  sanityHazeEl.style.opacity = String(stress * 0.22);
  sanityVisionEl.style.opacity = '0';
  updateMind(dt, value);
}

const longMixRoom = ['cathedral', 'subway', 'accelerator', 'mall', 'cave'].includes(MAP_NAME);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const cinematic = cult.active || cutscenes.active || mapFall.active || (playing && intro.active);
  const enclosed = indoors || (MAP.interior && !facility) || MAP_NAME === 'cave';
  mix.space(cult.active ? 'hall' : swim.in ? 'confined' : enclosed ? (longMixRoom ? 'hall' : 'room') : 'open');
  mix.focus(cinematic ? 'cinema' : huntSilence ? 'hunt' : !playing && started ? 'pause' : holdingBreath ? 'breath' : 'normal');
  if (mapFall.update(dt)) return;
  if (TOUCH) {
    const box = touchView();
    if (playing && box.w <= box.h) pauseTouch();
    document.body.classList.toggle('playing', playing && box.w > box.h);
  }
  uTime.value += dt;
  // the landing page: nothing in the night moves until PLAY
  if (title.active) { title.update(dt); if (title.active) { title.render(); return; } }
  // between rounds: a scene has the camera, and the night waits for it (it stops with the rest when paused)
  if (cutscenes.active) { if (playing || cutscenes.dying) cutscenes.update(dt); if (cutscenes.active) { cutscenes.render(); return; } }
  if (playing && canBeginCult()) beginCult();
  if (cult.active) { elapsed += dt; round.t += dt; cult.update(dt); return; }

  let speed = 0, running = false;
  const bonuses = bagBonuses();
  const staminaCap = staminaMax * (bag.items.includes('stamina_charm') ? 1.18 : 1);
  const staminaSurge = uTime.value < bag.staminaUntil;
  stamina = Math.min(stamina, staminaCap);
  if (playing && intro.active) updateIntro(dt);
  else if (playing) {
    elapsed += dt;
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    if ((f || s) && swim.climb < 0 && !(facilityView?.pinned > 0)) {
      const canRun = (keys.ShiftLeft || keys.ShiftRight) && (stamina > 0 || staminaSurge) && (!needRecover || staminaSurge);
      running = canRun && !swim.in && MAP.zoneAt?.(camera.position.x, camera.position.z) !== 'cableHatch';
      const terrain = MAP.moveScale?.(camera.position.x, camera.position.z) ?? 1;
      speed = (swim.in ? SWIM.speed : (running ? CFG.run * bonuses.runSpeed : CFG.walk) * (burn.in ? LAVA.slow : terrain)) * slimeDrag() * specialRounds.drag;
      move.set(s, 0, -f).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).multiplyScalar(speed * dt);
      camera.position.x += move.x; camera.position.z += move.z;
      collide(camera.position);
      bob += dt * speed * 2.6;
    }
    updateClock();
  }
  const inControl = playing && !finished && !intro.active;
  playerSpeedNow = speed; playerRunningNow = running;
  if (inControl) {
    if (staminaSurge) { stamina = staminaCap; needRecover = false; if (holdingBreath) holdTime += dt; else holdTime = 0; }
    else {
      if (running) stamina -= dt / 8;
      if (holdingBreath) { stamina -= dt / 15; holdTime += dt; }
      else holdTime = 0;
      if (stamina <= 0) {
        if (running && staminaMax < STAMINA_PEAK) staminaMax = Math.min(STAMINA_PEAK, staminaMax + STAMINA_GROW);
        stamina = 0;
        needRecover = true;
        if (holdingBreath) { holdingBreath = false; breathBlocked = true; holdTime = 0; }
      }
      if (!running && !holdingBreath) {
        stamina = Math.min(staminaCap, stamina + dt / 4.5);
        if (stamina >= staminaCap * 0.28) needRecover = false;
      }
    }
  } else holdTime = 0;
  updateSanity(dt, inControl, running);
  tickKids(dt, inControl && round.rest <= 0 && !menace().frenzy && !huntSilence && !collective.encounter);   // the kids go quiet for the last minute, until the next round
  staminaEl.hidden = !inControl;
  staminaEl.style.width = `${STAMINA_BAR * staminaCap}px`;
  staminaFill.style.transform = `scaleX(${stamina / staminaCap})`;
  staminaEl.classList.toggle('low', stamina / staminaCap < 0.25);
  const moving = playing && !finished && !intro.active && speed > 0;
  const pace = !playing || finished || intro.active ? null : running ? 'run' : speed > 0 ? 'walk' : 'idle';
  const stepping = moving && !holdingBreath && !swim.in;
  const surface = footstepSurface(camera.position.x, camera.position.z);
  syncFootsteps(stepping && surface !== 'terrain' ? (pace === 'run' ? 'run' : 'walk') : null, surface);
  updateInteriorSound(dt, stepping, running, inControl, surface);
  syncBodyAudio(pace, holdingBreath && pace != null);
  syncAmbience(started ? 'outside' : null);
  syncWood(started && !finished && MAP_NAME === 'forest');
  syncLabyrinth(started && !finished && MAP_NAME === 'labyrinth');
  syncRoundMusic(started && !finished && round.n >= 2, round.n, running && inControl);
  syncWeather(started && !finished && (MAP_NAME !== 'glasshouse' || facilityView.rain > 0.5));
  duckAmbience(moving);

  // camera + head bob. Holding breath zooms in; past 10s the view starts to shake.
  const bobY = Math.sin(bob) * 0.035, bobX = Math.cos(bob * 0.5) * 0.02;
  // Running: the body pounds and twists. Each foot strike jolts the view down, the shoulders roll side to side
  // with the stride, the head sways and the whole thing judders. The flashlight hand pumps up and down out of step.
  runShake.k += ((running && inControl ? 1 : 0) - runShake.k) * Math.min(1, dt * 6);
  const rk = runShake.k, strike = Math.pow(1 - Math.abs(Math.sin(bob)), 6);       // spikes as each foot lands
  const judder = Math.sin(uTime.value * 31) * Math.sin(uTime.value * 13.7);
  const runY = rk * (Math.abs(Math.sin(bob)) * 0.075 - 0.04 - strike * 0.03);
  consumerViewShake.value = Math.max(0, consumerViewShake.value - dt * 2.8);
  const consumerJolt = Math.sin(uTime.value * 51) * consumerViewShake.value * 0.055;
  const stooped = MAP.zoneAt?.(camera.position.x, camera.position.z) === 'cableHatch';
  camera.position.y = MAP.groundY(camera.position.x, camera.position.z) + CFG.eye + bobY + runY + cut.y - swim.sink * 1.15 - wade.sink + consumerJolt - (stooped ? 0.66 : 0);
  const shaking = (facilityView?.shiver ?? 0) * 0.014;
  let sx = rk * (-0.025 - strike * 0.03 + judder * 0.008), sy = rk * Math.cos(bob) * 0.028, sr = rk * (Math.sin(bob) * 0.045 + judder * 0.01);
  if (holdingBreath && holdTime >= 10) {
    const k = Math.min(1, (holdTime - 10) / 1.5);
    sx += Math.sin(uTime.value * 27) * 0.022 * k;
    sy += Math.sin(uTime.value * 21) * 0.018 * k;
    sr += Math.sin(uTime.value * 17) * 0.014 * k;
  }
  camera.rotation.set(pitch + cut.pitch + sx + shaking * Math.sin(uTime.value * 37), yaw + cut.yaw + sy, cut.roll + sr + consumerViewShake.value * 0.018);

  // flashlight raise / lower, with a faint wobble and occasional hard flicker
  flashlight.raise += ((flashlight.equipped && facilityView?.drop?.id !== 'flashlight' ? 1 : 0) - flashlight.raise) * Math.min(1, dt * 9);
  held.position.lerpVectors(HELD_DOWN, HELD_UP, flashlight.raise);
  held.position.x += bobX; held.position.y += bobY * 0.6;
  // Standing still, scared: the beam sweeps back and forth along a deep U, jittery hands shaking it, with a
  // sudden jerk every few seconds as if something moved. Walking steadies it again.
  const still = playerSpeedNow === 0 && playing && !intro.active && !finished;
  idleSway.k += ((still && (idleSway.still += dt) > 1.5 ? 1 : 0) - idleSway.k) * Math.min(1, dt * (still ? 0.8 : 4));
  if (!still) idleSway.still = 0;
  idleSway.t += dt;
  const sw = idleSway.t, ph = 1.25 * Math.sin(sw * 0.62) + 0.3 * Math.sin(sw * 0.23 + 1);   // back and forth across the arc, a little hurried
  // scared hands: a constant shake, and now and then a sharp jerk as if something moved
  if ((idleSway.jerkIn = (idleSway.jerkIn ?? 4) - dt) <= 0) { idleSway.jerkIn = 3 + Math.random() * 6; idleSway.jx = (Math.random() - 0.5) * 1.1; idleSway.jy = (Math.random() - 0.5) * 0.6; }
  idleSway.jx = (idleSway.jx || 0) * Math.exp(-dt * 5); idleSway.jy = (idleSway.jy || 0) * Math.exp(-dt * 5);
  const tremor = 0.07 * Math.sin(sw * 11.3) * Math.sin(sw * 3.7) + 0.035 * Math.sin(sw * 17.9 + 2);
  const swayX = idleSway.k * (Math.sin(ph) * 1.1 + tremor + idleSway.jx);
  const swayY = idleSway.k * ((1 - Math.cos(ph)) * 0.8 - 0.45 - 0.15 * (0.5 + 0.5 * Math.sin(sw * 0.09)) + tremor * 0.8 + idleSway.jy);   // a deep U: lowest in the middle of the swing
  held.position.x += swayX * 0.026; held.position.y += swayY * 0.026;
  // running: the flashlight hand pumps up and down with the arm, a beat behind the feet
  const pump = Math.sin(bob + 1.2), runFX = rk * (Math.cos(bob) * 0.9 + judder * 0.15), runFY = rk * (pump * 1.5 - strike * 0.5 + judder * 0.2);
  held.position.y += rk * pump * 0.06; held.position.x += rk * Math.cos(bob) * 0.03;
  held.rotation.y = -swayX * 0.03 - runFX * 0.05; held.rotation.x = swayY * 0.03 + runFY * 0.06;
  held.visible = flashlight.raise > 0.02;
  const raised = flashlight.raise > 0.6 && facilityView?.drop?.id !== 'flashlight';
  updateWorld(dt, inControl, running);
  updateItems(dt, bobX, bobY, inControl, raised);
  const videoLens = videoCameraOn();
  syncVideoCamera(videoLens && !finished);
  const breathFov = videoLens ? 82 : holdingBreath && inControl ? 61 : 70;
  zoomFov += (breathFov - zoomFov) * Math.min(1, dt * 3.2);
  const fov = zoomFov - gun.ads * 16;
  if (Math.abs(camera.fov - fov) > 0.02) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const flickerOk = raised && playing && !finished && !intro.active && flashlight.battery > 0;
  if (flickerOk && flashlight.flickerAge < 0) {
    flashlight.nextFlicker -= dt;
    if (flashlight.nextFlicker <= 0) {
      flashlight.flickerDur = 0.9 + Math.random() * 0.7;
      flashlight.flickerAge = 0;
      flashlight.nextFlicker = flickerGap(Math.random());
    }
  } else if (!playing && flashlight.flickerAge >= 0) {
    flashlight.flickerAge = -1;
  }
  let flick = 0.94 + 0.06 * Math.sin(uTime.value * 23) * Math.sin(uTime.value * 7.3);
  if (flashlight.flickerAge >= 0) {
    flashlight.flickerAge += dt;
    const age = flashlight.flickerAge, dur = flashlight.flickerDur, fade = 0.6;
    if (age >= dur) flashlight.flickerAge = -1;
    else {
      const stutter = Math.abs(Math.sin(age * 46)) > 0.55 ? 1 : 0.06;
      const recover = dur - age < fade ? (dur - age) / fade : 1;
      flick *= 1 - (1 - stutter) * recover;
    }
  }
  const cameraViewActive = videoLens && raised && inControl;
  if (cameraViewActive && videoFlicker.age < 0) {
    videoFlicker.next -= dt;
    if (videoFlicker.next <= 0) { videoFlicker.age = 0; videoFlicker.duration = 0.12 + Math.random() * 0.12; videoFlicker.next = 3.8 + Math.random() * 5.2; }
  }
  if (videoFlicker.age >= 0) {
    videoFlicker.age += dt;
    if (videoFlicker.age >= videoFlicker.duration) { videoFlicker.age = -1; videoFlicker.amount = 0; }
    else videoFlicker.amount = Math.sin(videoFlicker.age * 155) > -0.3 ? 0.96 : 0.12;
  } else videoFlicker.amount = 0;
  const beam = raised && flashlight.battery > 0 ? L.intensity * flick * cut.light * batteryDim() * (cameraViewActive ? 1 - videoFlicker.amount * 0.94 : 1) : 0;
  const beamAngle = cameraViewActive ? 0.74 : L.angle;
  spot.angle = beamAngle; spot.distance = (cameraViewActive ? Math.min(48, L.distance + 8) : L.distance) * (1 - (facilityView?.whiteout ?? 0) * 0.91); spot.color.set(cameraViewActive ? 0xa7ffb2 : 0xffd49c);
  halo.angle = cameraViewActive ? 0.98 : 0.62; halo.distance = Math.min(spot.distance, cameraViewActive ? 32 : 26); halo.color.copy(spot.color);
  spot.intensity = beam;
  halo.intensity = beam * 0.18;
  interiorLook?.update(uTime.value, dt, camera, inControl);
  specialRounds.update(dt, {
    inControl: inControl && !finished, yaw, running, moving: speed > 0, armor: armor.tier,
    beam: beam > 1, beamRange: spot.distance, match: match.t > 0, roomLit: facilityLight,
    camera: cameraViewActive && beam > 1 && videoFlicker.amount < 0.8,
  });
  updateLightbound(dt, inControl && !finished);
  updateMonsters(dt, inControl && !finished, beam > 1, running);
  if (mapFall.active) return;
  updateUnseen(dt, inControl && !finished, cameraViewActive && beam > 1 && videoFlicker.amount < 0.8);
  updateLabyrinth(inControl && !finished);
  const dreadAim = collective.active && ['appear', 'warning', 'dispersal', 'last'].includes(collective.phase) && flashlight.equipped;
  const aimOffset = dreadAim ? Math.sin(uTime.value * 2.3) * 0.38 + Math.sin(uTime.value * 0.53 + 1.4) * 0.16 : 0;
  spot.target.position.set(bobX * 4 + swayX + aimOffset + runFX, -0.35 + bobY * 5 + swayY + runFY + (dreadAim ? Math.sin(uTime.value * 1.7) * 0.13 : 0), -10);
  visionUniforms.uVideo.value = cameraViewActive ? 1 : 0;
  visionUniforms.uVideoTime.value = uTime.value;
  visionUniforms.uVideoOut.value = cameraViewActive ? videoFlicker.amount : 0;
  updateCameraWords(cameraViewActive && beam > 1);

  // world follows the player
  refreshChunks(false);
  updateLampLenses(uTime.value, specialRounds.power);
  placeGround();

  const peek = inControl && facilityView?.peek;
  if (reflectionLight) reflectionLight.intensity = peek ? 32 : 0;
  if (peek) {
    const [i, j] = peek.sector.split(',').map(Number);
    const offsetX = i * 4, offsetZ = j * 4;
    reflectionCamera.position.set(offsetX + peek.peekX, peek.y + 1.32, offsetZ + peek.peekZ);
    reflectionCamera.lookAt(offsetX + peek.lookX, peek.y + 1.32, offsetZ + peek.lookZ);
    reflectionCamera.aspect = camera.aspect;
    reflectionCamera.updateProjectionMatrix();
  }
  visionUniforms.uBlind.value = inControl ? (facilityView?.blind ?? 0) : 0;
  visionUniforms.uHeat.value = inControl ? (facilityView?.haze ?? 0) : 0;
  visionUniforms.uWhiteout.value = inControl ? (facilityView?.whiteout ?? 0) : 0;
  visionUniforms.uReflection.value = peek ? 0.55 : 0;
  if (peek) renderView(scene, reflectionCamera, false);
  else renderView(scene, camera, held.visible || gunMesh.visible || matchMesh.visible);
  visionUniforms.uBlind.value = visionUniforms.uHeat.value = visionUniforms.uWhiteout.value = visionUniforms.uReflection.value = 0;
}
// One picture: the world at low resolution through the vision pass, then whatever is held in the hands on top.
// The title screen and the cutscenes that leave the map draw their own scene through the same pass.
// sharp: no soft fringe round the middle of the picture (that is the flashlight's, in first person).
function renderView(sc, cam, hands, sharp = false) {
  const core = visionUniforms.uCore.value, stain = visionUniforms.uStain.value;
  const videoPass = visionUniforms.uVideo.value > 0.5 && cam === camera && started && playing && !finished && !intro.active && !cutscenes.active;
  if (!videoPass) visionUniforms.uVideo.value = 0;
  if (sharp) { visionUniforms.uCore.value = 9; visionUniforms.uStain.value = 0; }
  cam.layers.set(0);
  renderer.setRenderTarget(visionRT);
  renderer.render(sc, cam);
  if (hands && videoPass) {
    const bg = sc.background; sc.background = null;      // or the background is drawn again, over the world just rendered
    cam.layers.set(1); renderer.autoClear = false; renderer.clearDepth(); renderer.render(sc, cam); renderer.autoClear = true;
    sc.background = bg;
  }
  renderer.setRenderTarget(null);
  renderer.render(visionScene, visionCam);
  if (hands && !videoPass) {
    cam.layers.set(1);
    const bg = sc.background;
    sc.background = null;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(sc, cam);
    renderer.autoClear = true;
    sc.background = bg;
  }
  cam.layers.set(0);
  if (cam === camera && !playing) visionUniforms.uVideo.value = 0;
  visionUniforms.uCore.value = core; visionUniforms.uStain.value = stain;
}

function canBeginCult() {
  return !!cult && !cult.active && isCultRound() && round.rest <= 0 && !finished && !intro.active && !mapFall?.active;
}
function beginCult() {
  const seed = CFG.seed ^ Math.imul(round.n, 0x45d9f3b);
  started = true; playing = false;
  overlay.style.display = 'none';
  stopIntroSong();
  releaseTouch();
  for (const k in keys) keys[k] = false;
  holdingBreath = gun.aiming = gun.trigger = false; gun.burst = 0;
  syncFootsteps(null); syncBodyAudio(null, false); syncCandle(false); syncVideoCamera(false);
  syncAmbience(null); syncWood(false); syncLabyrinth(false); syncWeather(false);
  syncRoundMusic(false, round.n, false); syncTick(false); setHuntSilence(true);
  if (audioCtx.state === 'suspended') audioCtx.resume();
  cult.start({ random: mulberry(seed), round: round.n, map: MAP_NAME, health: inv.health / inv.maxHealth, recent: recentMonsters }, mulberry(seed ^ 0x1a97f));
  if (document.pointerLockElement) document.exitPointerLock();
}
let chantBuffer = null, chant = null, chantLevel = 0;
// The cult scene calls step/run once per footfall. Each call keeps the looping concrete steps and the matching breath
// going; when the calls stop coming, the steps stop and the breathing settles back to idle.
let cultPaceTimer = 0;
function cultPace(mode) {
  clearTimeout(cultPaceTimer);
  syncFootsteps(mode, 'concrete');
  syncBodyAudio(mode || 'idle', false);
  if (mode) cultPaceTimer = setTimeout(() => cultPace(null), mode === 'run' ? 600 : 900);
}
const cultCues = {
  door() { thump(72, 25, 0.52, 0.56, mix.hallCue); noise1(0.38, 'bandpass', 1250, 160, 0.48, mix.hallCue); },
  shove() { thump(160, 44, 0.21, 0.45); noise1(0.31, 'bandpass', 500, 260, 0.35); },
  // the hall is stone: the same concrete footsteps and the same breathing as walking or running anywhere else
  step() { cultPace('walk'); },
  run() { cultPace('run'); },
  stop() { cultPace(null); thump(140, 38, 0.32, 0.32); },
  pews() { noise1(0.67, 'bandpass', 540, 210, 0.46, mix.hallCue); thump(78, 35, 0.39, 0.36, mix.hallCue); },
  cloth() { noise1(0.34, 'bandpass', 480, 300, 0.31); },
  rope() { noise1(0.32, 'bandpass', 1450, 540, 0.52); },
  shot() { playClip(gunshotBuffer, 0.67, false, mix.hallCue); thump(130, 35, 0.62, 0.61, mix.hallCue); mix.accent(1); },
  echo() { noise1(0.86, 'lowpass', 680, 100, 0.30); },
};
cult = createCultRound({
  root: $('cult'), aspect: () => camera.aspect,
  render: (hall, hallCamera) => renderView(hall, hallCamera, false, true),
  sound: {
    chant(volume, fade = 0.7) {
      chantLevel = volume;
      if (chant) { rampParam(chant.gain.gain, volume, fade); return; }
      if (!chantBuffer) chantBuffer = loadClip('cult_chanting_in_uni_#1-1795056075443.mp3').catch(() => null);
      chantBuffer.then(buffer => {
        if (buffer && cult.active && chantLevel > 0 && !chant) chant = playClip(buffer, chantLevel, true, mix.hallCue);
      });
    },
    cue: kind => cultCues[kind](),
    stop() { chantLevel = 0; if (chant) stopClip(chant, 0.35); chant = null; clearTimeout(cultPaceTimer); syncFootsteps(null); syncBodyAudio(null, false); },
  },
  onWin() {
    setHuntSilence(false);
    round.announced = true;
    roundWon(true, 'The leader fell. You left the congregation behind.');
    $('title').textContent = 'YOU LEFT THE HALL';
    $('sub').textContent = `Round ${round.n} survived.`;
    $('go').textContent = TOUCH ? 'Tap to continue' : 'Click to continue';
    overlay.style.display = 'flex';
    if (TOUCH) beginTouch();
    else renderer.domElement.requestPointerLock()?.catch(() => {});
  },
  onConversion() { deathCause = 'cult'; endGame(false); },
});
refreshChunks(true);
// ?round=N starts at round N; ?monster=<type> forces a type from ROUND.types for every round.
if (arrival) restoreRun(arrival.run);
startRound(arrival?.nextRound ?? Math.max(1, Math.min(99, Number(new URLSearchParams(location.search).get('round')) || 1)));
updateClock();
// ───────────────────────── title screen ─────────────────────────
// A landing page in front of the night: the runner in the woods, PLAY, LEADERBOARD, INSTRUCTIONS.
// ?nointro or ?notitle goes straight past it.
const SHOW_TITLE = !SKIP_INTRO && !new URLSearchParams(location.search).has('notitle');
const menuEl = document.getElementById('menu'), boardEl = document.getElementById('board');
const cinemaKit = {
  THREE, atlas, mulberry, billboardLayer, speckleTexture, surfaceMaterial, groundPalette: MAP_META.forest.ground, buildCorpse,
  render: (sc, cam, hands = false, sharp = false) => renderView(sc, cam, hands, sharp), aspect: () => camera.aspect, fade: fadeEl, menu: menuEl,
  moveBoard(into) { into.append(boardEl); },
  openLore() { storyboard.open(); },
  loreOpen: () => storyboard.isOpen,
  onPlay() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    introSongNeedsGesture = false;
    if (TOUCH) beginTouch(); else renderer.domElement.requestPointerLock();
  },
  onLeft() { overlay.append(boardEl); menuEl.hidden = true; if (!playing) overlay.style.display = 'flex'; },
};
const title = SHOW_TITLE ? createTitleScreen(cinemaKit) : { active: false, skip() {} };
if (title.active) {
  overlay.style.display = 'none';
  fadeEl.style.opacity = '0'; lidTop.style.display = lidBot.style.display = 'none';     // the opening holds these shut; not yet
  menuEl.classList.remove('loading');
  menuEl.addEventListener('pointerdown', (e) => {         // the first touch of the page is what lets the music start
    if (!started && introSong.paused && !(e.target.closest && e.target.closest('[data-menu=play]'))) playIntroSong();
  });
} else menuEl.hidden = true;

// ───────────────────────── cutscenes between rounds ─────────────────────────
// ?cutscene=<name> plays that one after every round, ?cutscene=all always plays one, ?cutscene=none never does.
const CUTSCENE_PARAM = new URLSearchParams(location.search).get('cutscene');
Object.assign(cinemaKit, {
  scene, camera, L, eye: CFG.eye, TOUCH, world: creatureWorld, groundY: (x, z) => MAP.groundY(x, z),
  createObserverModel, ObserverAnimator, buildChild, poseChild, kidMats: mindMats, poseCorpse,
  radPerPixel: () => (camera.fov * Math.PI / 180) / CFG.renderHeight,
  playing: () => playing, view: () => ({ yaw, pitch }), setView(y, p) { yaw = y; pitch = p; },
  lightOn: () => flashlight.equipped && flashlight.battery > 0,
  // the scene's flashlight: v is 0..1 of a full beam, whatever the battery says
  beam(v, torch) {
    spot.intensity = L.intensity * v; halo.intensity = spot.intensity * 0.18; spot.target.position.set(0, -0.35, -10);
    held.visible = torch; held.position.copy(HELD_UP); held.rotation.set(0, 0, 0);
    gunMesh.visible = false; matchMesh.visible = false;
  },
  handsShown: () => held.visible,
  hurt(v) { hurtEl.style.opacity = v; },
  // keep the grass and small clutter off a patch of ground; returns the call that puts it back
  clearGround(x, z, r) {
    clearZones.push(x, z, r); refreshChunks(true);
    return () => { for (let i = 0; i < clearZones.length; i += 3) if (clearZones[i] === x && clearZones[i + 1] === z && clearZones[i + 2] === r) { clearZones.splice(i, 3); break; } refreshChunks(true); };
  },
  lock(on) { intro.active = on; },                        // everything that ignores input during the opening ignores it now
  quiet() { for (const k in keys) keys[k] = false; holdingBreath = false; gun.aiming = false; gun.trigger = false; gun.burst = 0; syncFootsteps(null); syncBodyAudio(null, false); syncTick(false); },
  clear() { while (ghosts.length) removeGhost(ghosts[0]); clearMind(); bannerEl.style.opacity = 0; bannerTimer = 0; },
  clearMind() { clearMind(); sanity.value = SANITY_MAX; sanity.warned = false; sanity.empty = 0; sanity.drained = false; },
  canPlay: () => playing && !finished && !swim.in && swim.climb < 0 && !burn.in && !journal.isOpen && !helpOpen,
  die(line, from = '') { cutsceneLine = line; cutsceneFrom = from; deathCause = 'cutscene'; endGame(false); },
  ceiling: META.ceiling || 0,
  // eyelids: 0 open, 1 shut
  lids(v) { const shut = Math.max(0, Math.min(1, v)) * 52; lidTop.style.height = lidBot.style.height = shut + 'vh'; lidTop.style.display = lidBot.style.display = shut > 0.01 ? 'block' : 'none'; },
  // fire sprites for this frame: [x, y, z, size, frame]
  flames(list) { glowLayer.n = glowStatic; if (fireCells.length) for (const f of list) glowLayer.add(f[0], f[1], f[2], f[3], f[3], fireCells[f[4] % fireCells.length], 0.02); glowLayer.commit(); },
  // the sky getting light: 0 the night as it is, 1 morning
  dawn(v) {
    if (v <= 0) { setDusk(isDusk); return; }
    duskLight.intensity = Math.max(duskLight.intensity, v * 2.2);
    scene.fog.color.set(META.fog).lerp(dawnColor, v); scene.background.copy(scene.fog.color); scene.fog.density = META.fogDensity * (1 - 0.45 * v);
  },
  audio: { play: playClip, stop: stopClip, thump, noise1, sfx, obs: mindAudio,
           clips: { sing: singBuffer, run: runBuffer, bones: boneBuffer, candle: candleBuffer, stopMoving: collectiveStop, thank: collectiveThank, hug: collectiveHug } },
});
const dawnColor = new THREE.Color(0x6a6a86);
const cutscenes = createCutscenes(cinemaKit);
function clearTravelCheckpoint() {
  const state = { ...history.state };
  delete state[TRAVEL_STATE];
  history.replaceState(state, '');
}
function showArrival() {
  clearTravelCheckpoint();
  overlay.classList.add('map-arrival');
  overlay.style.display = 'flex';
}
mapFall = createMapFall({
  camera, screen: $('mapFall'), label: $('fallTarget'), state: $('fallState'),
  render(amount) {
    const beam = spot.intensity, fringe = halo.intensity;
    spot.intensity = Math.max(beam, amount * 29);
    halo.intensity = Math.max(fringe, amount * 7);
    renderView(scene, camera, false, true);
    spot.intensity = beam;
    halo.intensity = fringe;
  },
  onLand: showArrival,
});
if (arrival) {
  started = true;
  document.getElementById('title').textContent = META.label;
  document.getElementById('sub').textContent = `Round ${round.n}. Your gear came with you.`;
  document.getElementById('go').textContent = TOUCH ? 'Tap to continue' : 'Click to continue';
  if (arrival.fall) {
    const { x, z } = camera.position;
    camera.position.y = MAP.groundY(x, z) + CFG.eye;
    mapFall.wait((MAP.roofY?.(x, z) ?? camera.position.y + (META.ceiling || 0)) - camera.position.y);
    placeGround();
    updateMapLights(uTime.value, x, z);
    updateLampLenses(uTime.value, specialRounds.power);
    // Asset loading began while the shaft was already visible. Warm the map shaders behind it too.
    Promise.all(arrivalTextures).then(() => renderer.compileAsync(scene, camera))
      .catch(error => console.warn('Destination shader warmup failed', error))
      .then(() => mapFall.loaded());
  } else showArrival();
} else {
  if (arriving?.fall) {
    clearTravelCheckpoint();
    $('mapFall').hidden = true;
    document.body.classList.remove('map-travel');
  }
  playIntroSong();
}
requestAnimationFrame(frame);

// ───────────────────────── the labyrinth: its dead, and the way out ─────────────────────────
// Walking out through the gap in the outer wall wins the round, whatever was hunting you, and drops you
// in the middle of a new, larger maze.
const LAB = MAP.labyrinth, labDead = [];
let labLeaving = false;
function buildLabDead() {
  for (const c of labDead) { scene.remove(c.root); c.root.traverse((o) => { if (o.material) o.material.dispose(); }); }
  labDead.length = 0;
  const rng = mulberry(CFG.seed ^ (LAB.state.gen * 977 + 13));
  for (const spec of LAB.state.bodies) {
    const c = buildCorpse(rng); poseCorpse(c, { ...spec, y: 0 }, rng);
    c.root.visible = false; scene.add(c.root); labDead.push(c);
  }
}
function newLabyrinth() {
  LAB.regen();
  chunks.clear(); farChunks.clear(); lore.clear(); clearDrops();
  camera.position.x = 0; camera.position.z = 0;
  buildLabDead(); refreshChunks(true);
}
function leaveLabyrinth() {
  labLeaving = true;
  while (ghosts.length) removeGhost(ghosts[0]);
  if (obsRound.active) obsRound.stop();
  if (collective.active) collective.stop();
  if (choir.active) choir.stop();
  setHuntSilence(false);
  if (round.rest <= 0) roundWon(true, roundsHere + 1 >= ROUND.locationRounds
    ? 'You found the way out. It opens somewhere else.'
    : 'You found the way out. It opens on another labyrinth.');
  if (roundsHere >= ROUND.locationRounds) return;
  if (finished) return;                                   // that was the last round
  fadeEl.style.transition = 'opacity 0.45s'; fadeEl.style.opacity = 1;
  setTimeout(() => {
    newLabyrinth();
    fadeEl.style.opacity = 0; labLeaving = false;
    setTimeout(() => { fadeEl.style.transition = ''; }, 500);
  }, 550);
}
function updateLabyrinth(inControl) {
  if (!LAB) return;
  const px = camera.position.x, pz = camera.position.z;
  for (const c of labDead) c.root.visible = (c.spec.x - px) ** 2 + (c.spec.z - pz) ** 2 < 42 * 42;
  if (inControl && !finished && !labLeaving && LAB.outside(px, pz)) leaveLabyrinth();
}
if (LAB) buildLabDead();
mountLeaderboard();

// small debug handle for the console
window.game = { title, facility, damagePlayer, armor, wearArmor, endlessHurt, rollArmorTier, cutscenes, picker, pickOffers, drops, dropBundle, salvage, salvageIn, die(cause) { deathCause = cause; endGame(false); }, bench, GUN, applyKit, addParts, throwGrenade, grenades, craftGear, gearRecipes, labyrinth: LAB, leaveLabyrinth, journal, storyboard, lore, collectLore, dropLore, radar, drawRadarMap, setDusk, isDusk: () => isDusk, forceNext(type) { forcedMonster = type; }, collective, choir, consumer, specialRounds, falseChests, stepState: () => ({ stepMode, bodyAudio }), slime, SLIME, ambush, AMBUSH, ghostHp, unseen, unseenRustle, lake, eaten, slimeTravel, newWorld, col: () => collective.debug(), obsRound, observer: () => obsRound.observer.debug(), creatureWorld, setHuntSilence, clock: () => uTime.value, outdoor: { filter: outdoorFilter, gain: outdoorGain }, weatherGain, cry, vision: visionUniforms, debugLight(v) { debugAmbient = v; flashLight.color.set(v ? 0xffffff : 0xbfd0ff); if (!v) flashLight.intensity = 0; }, MAP, MAP_NAME, storm: forestStorm, near, layers, swim, burn, bolt, weather, poolLights, world: () => ({ indoors, action: mapAction && mapAction.label, deathCause, glowStatic }), act: useAction, teleport(x, z) { camera.position.x = x; camera.position.z = z; }, menace, clips: { reloadBuffer, clockBuffer, dyingBuffer, singBuffer }, ticking: () => !!tick, scare, ghosts, round, ROUND, GHOST, startRound, state: () => ({ finished, playing, holdingBreath }), inv, gun, match, opened, SPAWN_CHEST, openChest, setYaw(v) { yaw = v; pitch = 0; }, setPitch(v) { pitch = v; }, intro, INTRO, debugBegin() { title.skip(); playing = true; started = true; overlay.style.display = 'none'; }, setSanity(v) { sanity.value = THREE.MathUtils.clamp(v, 0, SANITY_MAX); }, sanity, mind: () => ({ kids: mindKids.filter((k) => k.on).length, observer: mindObserver.on && mindObserverModel.root.visible, spawnedKids: mindStats.kids, spawnedObserver: mindStats.observer, kidRun: mindStats.kidRun, ahead: mindStats.ahead, mode: mindStats.lastMode, fronts: mindStats.fronts, charges: mindStats.charges, empty: sanity.empty, sanity: sanity.value }), CFG, camera, flashlight, chunks, veg, scene, renderer, introSong, audioCtx, walkBuffer, runBuffer, outsideAmbience, idleGain, walkGain, runGain, breathFilter, footstepGain, kids };
