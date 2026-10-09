/* =========================================================================
 *  Birthday 3D — fully interactive scene
 *  • Click objects to interact (pop balloons, open gifts, blow candles)
 *  • Click / double-click to fly + zoom the camera anywhere
 *  • Drag to orbit 360°, scroll/pinch to zoom, guided cinematic tour
 *  • Confetti, sound, live countdown, full accessibility
 * ========================================================================= */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

/* ---- Config (from config.js, with safe fallbacks) ------------------- */
const CFG = Object.assign(
  {
    name: "Friend",
    date: "",
    message: "",
    from: "",
    intensity: "high",
    sound: true,
    theme: {
      primary: "#ff5da2",
      secondary: "#7c5cff",
      accent: "#ffd23f",
      background: "#120a24",
    },
  },
  window.BIRTHDAY_CONFIG || {}
);

const COLOR = {
  primary: new THREE.Color(CFG.theme.primary),
  secondary: new THREE.Color(CFG.theme.secondary),
  accent: new THREE.Color(CFG.theme.accent),
  bg: new THREE.Color(CFG.theme.background),
};

const rootStyle = document.documentElement.style;
rootStyle.setProperty("--primary", CFG.theme.primary);
rootStyle.setProperty("--secondary", CFG.theme.secondary);
rootStyle.setProperty("--accent", CFG.theme.accent);
rootStyle.setProperty("--bg", CFG.theme.background);

/* ---- Motion preference --------------------------------------------- */
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let reduceMotion = prefersReduced;

/* ---- DOM ------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const canvas = $("scene");
const loader = $("loader");
const startGate = $("start-gate");
const overlay = $("overlay");
const controls = $("controls");
const srStatus = $("sr-status");
const hint = $("hint");

const INTENSITY = { low: 0.5, normal: 1, high: 1.7 }[CFG.intensity] ?? 1;
let revealed = false;   // becomes true once the user opens the surprise

/* ============================================================ *
 *  RENDERER / SCENE / CAMERA
 * ============================================================ */
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = COLOR.bg.clone();
scene.fog = new THREE.FogExp2(COLOR.bg.clone(), 0.014);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  300
);
camera.position.set(0, 6, 15);

/* ---- OrbitControls: full 360° freedom ------------------------------ */
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.07;
orbit.minDistance = 3;
orbit.maxDistance = 40;
orbit.maxPolarAngle = Math.PI * 0.92;   // look almost straight up/down
orbit.minPolarAngle = 0.05;
orbit.rotateSpeed = 0.9;
orbit.zoomSpeed = 1.1;
orbit.autoRotate = !reduceMotion;
orbit.autoRotateSpeed = 0.6;
orbit.enablePan = true;
orbit.panSpeed = 0.6;
orbit.target.set(0, 2.6, 0);

/* ============================================================ *
 *  CINEMATIC CAMERA FLIGHT (tween)
 * ============================================================ */
const flight = { active: false, t: 0, dur: 1, startPos: new THREE.Vector3(),
  endPos: new THREE.Vector3(), startTgt: new THREE.Vector3(), endTgt: new THREE.Vector3() };
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function flyTo(pos, target, dur = 1.4) {
  if (reduceMotion) {
    camera.position.copy(pos);
    orbit.target.copy(target);
    orbit.update();
    return;
  }
  flight.startPos.copy(camera.position);
  flight.endPos.copy(pos);
  flight.startTgt.copy(orbit.target);
  flight.endTgt.copy(target);
  flight.t = 0;
  flight.dur = dur;
  flight.active = true;
  orbit.enabled = false;          // take control during the flight
  orbit.autoRotate = false;
}
function endFlight() {
  flight.active = false;
  orbit.enabled = true;
  orbit.autoRotate = !reduceMotion;
}

/* Compute a camera position that frames a point from a given direction/distance */
function frameFrom(point, dir, dist) {
  return point.clone().add(dir.clone().normalize().multiplyScalar(dist));
}

/* ============================================================ *
 *  LIGHTING
 * ============================================================ */
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
scene.add(new THREE.HemisphereLight(0xffe9f5, 0x2a1a4a, 0.6));

const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(6, 14, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 50;
Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
scene.add(key);

const rimA = new THREE.PointLight(COLOR.primary, 1.3, 50, 2);
rimA.position.set(-9, 5, -5);
scene.add(rimA);
const rimB = new THREE.PointLight(COLOR.secondary, 1.3, 50, 2);
rimB.position.set(9, 4, -7);
scene.add(rimB);

/* ---- Ground -------------------------------------------------------- */
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 64),
  new THREE.MeshStandardMaterial({
    color: COLOR.bg.clone().lerp(new THREE.Color(0xffffff), 0.06),
    roughness: 0.85,
    metalness: 0.1,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
ground.userData.type = "ground";
scene.add(ground);

/* ============================================================ *
 *  BIRTHDAY CAKE
 * ============================================================ */
const cake = new THREE.Group();
cake.userData.type = "cake";
scene.add(cake);

const spongeBase = new THREE.Color(0x7a4a2e);
const creamColor = new THREE.Color(0xfff0e2);
const sprinkleColors = [COLOR.primary, COLOR.accent, COLOR.secondary, new THREE.Color(0x4ad6c0)];

/* Each tier: outer radius, height, y-centre, frosting colour */
const tierSpecs = [
  { r: 3.2, h: 1.9, y: 0.95, frost: COLOR.primary.clone() },
  { r: 2.3, h: 1.6, y: 2.7, frost: COLOR.accent.clone() },
  { r: 1.5, h: 1.3, y: 4.15, frost: COLOR.secondary.clone() },
];

/* Cake-layer cross-section texture (sponge + cream layers) for the cut faces */
function makeLayerTexture() {
  const c = document.createElement("canvas");
  c.width = 96; c.height = 160;
  const ctx = c.getContext("2d");
  // light, appetising sponge + cream layers (bright so it never looks like a hole)
  const sponge = "#e7b07a", cream = "#fff6ea";
  const bands = [cream, sponge, cream, sponge, cream, sponge, cream];
  const bh = c.height / bands.length;
  bands.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, i * bh, c.width, bh + 1); });
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
/* A solid cut-face slab from the cake centre out to the rim, at a given angle.
 * Built from solid-coloured layers (sponge + cream) so the interior always
 * reads as filled cake — never a dark/hollow hole. */
const layerMat = (hex, em = 0.22) => new THREE.MeshStandardMaterial({
  color: hex, roughness: 0.85, emissive: hex, emissiveIntensity: em, side: THREE.DoubleSide,
});
function cutWall(radius, height, yCentre, angle, frost) {
  const pivot = new THREE.Group();
  const depth = 0.16;
  // alternating sponge / cream bands stacked up the height
  const bands = [
    { c: 0xfff6ea, f: 0.16 },  // cream (bottom)
    { c: 0xe7b07a, f: 0.22 },  // sponge
    { c: 0xfff6ea, f: 0.14 },  // cream
    { c: 0xe7b07a, f: 0.22 },  // sponge
    { c: 0xfff6ea, f: 0.14 },  // cream (top, under frosting)
  ];
  let yy = -height / 2;
  bands.forEach((b) => {
    const bh = height * b.f;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(radius, bh, depth), layerMat(b.c, 0.25));
    slab.position.set(radius / 2, yy + bh / 2, 0);
    pivot.add(slab);
    yy += bh;
  });
  // frosting cap along the very top edge, in the tier colour
  if (frost) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(radius, height * 0.12, depth + 0.02), layerMat(frost.getHex(), 0.18));
    cap.position.set(radius / 2, height / 2 - height * 0.06, 0);
    pivot.add(cap);
  }
  // CylinderGeometry maps angle θ to (sinθ, cosθ); align the slab to that radial
  pivot.rotation.y = angle - Math.PI / 2;
  pivot.position.y = yCentre;
  return pivot;
}

/* Build one tier spanning the angular range [startAngle, startAngle+lengthAngle] */
function buildTier(spec, startAngle, lengthAngle, withWalls) {
  const g = new THREE.Group();
  const { r, h, y, frost } = spec;

  const sponge = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 64, 1, false, startAngle, lengthAngle),
    new THREE.MeshStandardMaterial({ color: frost, roughness: 0.45, metalness: 0.04 })
  );
  sponge.castShadow = sponge.receiveShadow = true;
  sponge.position.y = y;
  g.add(sponge);

  // frosting dollops around the visible rim
  const dollops = Math.max(6, Math.round((lengthAngle / (Math.PI * 2)) * 26));
  for (let i = 0; i <= dollops; i++) {
    const a = startAngle + (lengthAngle * i) / dollops;
    const d = new THREE.Mesh(
      new THREE.SphereGeometry(h * 0.16, 12, 12),
      new THREE.MeshStandardMaterial({ color: creamColor, roughness: 0.3 })
    );
    d.position.set(Math.sin(a) * r, y + h / 2, Math.cos(a) * r);
    g.add(d);
  }

  // sprinkles on the top surface, only within the visible wedge
  const sprCount = Math.round((lengthAngle / (Math.PI * 2)) * (spec === tierSpecs[0] ? 40 : 22));
  for (let i = 0; i < sprCount; i++) {
    const a = startAngle + Math.random() * lengthAngle;
    const rr = r * (0.25 + Math.random() * 0.6);
    const s = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.04, 0.14, 4, 6),
      new THREE.MeshStandardMaterial({ color: sprinkleColors[i % sprinkleColors.length], roughness: 0.4 })
    );
    s.position.set(Math.sin(a) * rr, y + h / 2 + 0.02, Math.cos(a) * rr);
    s.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    g.add(s);
  }

  if (withWalls) {
    g.add(cutWall(r, h, y, startAngle, frost));
    g.add(cutWall(r, h, y, startAngle + lengthAngle, frost));
  }
  return g;
}

/* Cherries on the very top — only within the still-present part of the top tier */
function addCherries(parent, startA, lenA) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    // skip cherries that fall inside the cut-away wedge
    let rel = a - startA; while (rel < 0) rel += Math.PI * 2;
    if (rel > lenA) continue;
    const cherry = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xd11149, roughness: 0.25, metalness: 0.1 })
    );
    cherry.position.set(Math.sin(a) * 1.25, 4.96, Math.cos(a) * 1.25);
    cherry.castShadow = true;
    parent.add(cherry);
  }
}

/* The (re-buildable) stack of tiers.
 * Only the TOP tier (3rd portion) gets cut — the bottom two stay whole. */
let tiersGroup = null;
let cutAngle = 0;            // wedge removed from the top tier; it spans [cutAngle, 2π]
const CUT_STEP = 0.7;        // ~40° per slice
function buildTiers() {
  if (tiersGroup) {
    cake.remove(tiersGroup);
    tiersGroup.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  }
  tiersGroup = new THREE.Group();
  // bottom two tiers: always whole
  tiersGroup.add(buildTier(tierSpecs[0], 0, Math.PI * 2, false));
  tiersGroup.add(buildTier(tierSpecs[1], 0, Math.PI * 2, false));
  // top tier: the part we actually cut
  const topLen = Math.PI * 2 - cutAngle;
  tiersGroup.add(buildTier(tierSpecs[2], cutAngle, topLen, cutAngle > 0.001));
  addCherries(tiersGroup, cutAngle, topLen);
  cake.add(tiersGroup);
}
buildTiers();

/* Decorative base plate under the cake */
const plate = new THREE.Mesh(
  new THREE.CylinderGeometry(3.9, 4.1, 0.3, 64),
  new THREE.MeshStandardMaterial({ color: 0xeae6f2, roughness: 0.25, metalness: 0.3 })
);
plate.position.y = 0.05;
plate.receiveShadow = true;
cake.add(plate);

/* ---- Name plaque on the front of the cake -------------------------- */
function makeNamePlaque() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 384;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, CFG.theme.secondary);
  grad.addColorStop(1, CFG.theme.primary);
  // rounded card background
  const r = 60;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(c.width, 0, c.width, c.height, r);
  ctx.arcTo(c.width, c.height, 0, c.height, r);
  ctx.arcTo(0, c.height, 0, 0, r);
  ctx.arcTo(0, 0, c.width, 0, r);
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "600 88px 'Quicksand', sans-serif";
  ctx.fillText("Happy Birthday", c.width / 2, 140);
  ctx.fillStyle = "#fff";
  ctx.font = "800 180px 'Baloo 2', 'Quicksand', sans-serif";
  let name = CFG.name || "Friend";
  if (name.length > 12) ctx.font = "800 120px 'Baloo 2','Quicksand',sans-serif";
  ctx.fillText(name, c.width / 2, 300);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 1.65),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, transparent: true })
  );
  plaque.position.set(0, 1.15, 3.28);
  plaque.castShadow = true;
  cake.add(plaque);
}
makeNamePlaque();

/* ---- BIG name in the background, flying in from far away ----------- */
let bgName = null;
let bgProg = 0;            // 0 = far away & tiny, 1 = settled
const BG_Z_FAR = -120, BG_Z_NEAR = -34, BG_Y = 8.5;
function buildBackgroundName() {
  const loader = new FontLoader();
  loader.load(
    "https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json",
    (font) => {
      const text = (CFG.name || "Friend").toUpperCase();
      const geo = new TextGeometry(text, {
        font, size: 7, height: 1.1, curveSegments: 10,
        bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.12, bevelSegments: 4,
      });
      geo.center();
      // bright & unaffected by fog so it glows in the distance
      const matFace = new THREE.MeshStandardMaterial({
        color: COLOR.accent, emissive: COLOR.accent, emissiveIntensity: 0.55,
        roughness: 0.3, metalness: 0.5, fog: false,
      });
      const matSide = new THREE.MeshStandardMaterial({
        color: COLOR.primary, emissive: COLOR.primary, emissiveIntensity: 0.35,
        roughness: 0.4, metalness: 0.3, fog: false,
      });
      bgName = new THREE.Mesh(geo, [matFace, matSide]);
      bgName.position.set(0, BG_Y, BG_Z_FAR);
      scene.add(bgName);
    },
    undefined,
    () => { /* font failed — the cake plaque still shows the name */ }
  );
}
buildBackgroundName();

/* ---- Candles (each individually lightable / blow-out-able) --------- */
const candles = [];   // { group, flame, light, index, lit }
function addCandle(x, z, index) {
  const grp = new THREE.Group();
  grp.userData.type = "candle";
  grp.userData.index = index;

  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 1.1, 16),
    new THREE.MeshStandardMaterial({ color: 0xfff4f8, roughness: 0.5 })
  );
  stick.castShadow = true;
  stick.position.y = 0.55;
  grp.add(stick);

  for (let i = 0; i < 4; i++) {
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.03, 8, 20),
      new THREE.MeshStandardMaterial({ color: COLOR.primary })
    );
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = 0.2 + i * 0.25;
    grp.add(stripe);
  }

  const wick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  wick.position.y = 1.16;
  grp.add(wick);

  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 16, 16),
    new THREE.MeshStandardMaterial({
      color: COLOR.accent,
      emissive: new THREE.Color(0xffae00),
      emissiveIntensity: 2.2,
      roughness: 0.3,
    })
  );
  flame.scale.set(1, 1.7, 1);
  flame.position.y = 1.32;
  flame.visible = false;        // start unlit — the guide lights them
  grp.add(flame);

  const fl = new THREE.PointLight(0xffb347, 1.4, 6, 2);
  fl.position.set(0, 1.4, 0);
  fl.visible = false;
  grp.add(fl);

  grp.position.set(x, 4.8, z);
  cake.add(grp);
  candles.push({ group: grp, flame, light: fl, index, lit: false });
}
for (let i = 0; i < 5; i++) {
  const a = (i / 5) * Math.PI * 2;
  addCandle(Math.sin(a) * 0.7, Math.cos(a) * 0.7, i);
}
function setCandle(i, lit) {
  const c = candles[i];
  if (!c) return;
  c.lit = lit;
  c.flame.visible = lit;
  c.light.visible = lit;
}
const litCount = () => candles.filter((c) => c.lit).length;

/* ============================================================ *
 *  BALLOONS  (clickable → pop)
 * ============================================================ */
const balloons = [];
const balloonColors = [COLOR.primary, COLOR.secondary, COLOR.accent, new THREE.Color(0x4ad6c0), new THREE.Color(0xff8c42)];
function spawnBalloon(grp, color) {
  const a = Math.random() * Math.PI * 2;
  const r = 6 + Math.random() * 6;
  grp.position.set(Math.cos(a) * r, 3 + Math.random() * 5, Math.sin(a) * r - 2);
  grp.scale.set(1, 1, 1);
  grp.visible = true;
  grp.userData.baseY = grp.position.y;
  grp.userData.speed = 0.4 + Math.random() * 0.6;
  grp.userData.phase = Math.random() * Math.PI * 2;
  grp.userData.swing = 0.3 + Math.random() * 0.5;
  grp.userData.popped = false;
}
function addBalloon(color) {
  const grp = new THREE.Group();
  grp.userData.type = "balloon";

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 24, 24),
    new THREE.MeshPhysicalMaterial({
      color, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.5,
    })
  );
  body.scale.set(1, 1.22, 1);
  body.castShadow = true;
  grp.add(body);

  const knot = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.3, 8),
    new THREE.MeshStandardMaterial({ color })
  );
  knot.position.y = -1.08;
  knot.rotation.x = Math.PI;
  grp.add(knot);

  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 2.4, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
  );
  string.position.y = -2.3;
  grp.add(string);

  grp.userData.color = color;
  spawnBalloon(grp, color);
  scene.add(grp);
  balloons.push(grp);
}
const balloonCount = Math.round(8 * INTENSITY);
for (let i = 0; i < balloonCount; i++) addBalloon(balloonColors[i % balloonColors.length]);

/* ============================================================ *
 *  GIFTS  (clickable → open)
 * ============================================================ */
const gifts = [];
function addGift(x, z, color) {
  const grp = new THREE.Group();
  grp.userData.type = "gift";

  const boxMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x1a1326, roughness: 0.9, side: THREE.DoubleSide });
  const S = 1, half = S / 2, wall = 0.06;

  // open-top box: 4 walls + a floor (no top face → genuinely looks open)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(S, wall, S), boxMat);
  floor.position.y = -half + wall / 2;
  floor.castShadow = floor.receiveShadow = true;
  grp.add(floor);
  const mkWall = (w, h, d, px, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
    m.position.set(px, 0, pz);
    m.castShadow = true;
    grp.add(m);
  };
  mkWall(S, S, wall, 0, half - wall / 2);   // front
  mkWall(S, S, wall, 0, -half + wall / 2);  // back
  mkWall(wall, S, S, half - wall / 2, 0);   // right
  mkWall(wall, S, S, -half + wall / 2, 0);  // left
  // dark inner liner so the opening reads as hollow
  const liner = new THREE.Mesh(new THREE.BoxGeometry(S - wall * 2, S - wall * 2, S - wall * 2), innerMat);
  grp.add(liner);

  const ribbonMat = new THREE.MeshStandardMaterial({ color: COLOR.accent, roughness: 0.3, metalness: 0.2 });
  // ribbon bands wrapping the outside of the box
  const bandV = new THREE.Mesh(new THREE.BoxGeometry(0.16, S + 0.02, S + 0.02), ribbonMat);
  grp.add(bandV);
  const bandH = new THREE.Mesh(new THREE.BoxGeometry(S + 0.02, S + 0.02, 0.16), ribbonMat);
  grp.add(bandH);

  // removable lid
  const lid = new THREE.Group();
  const lidBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.14, 0.22, 1.14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4 })
  );
  lidBox.castShadow = true;
  lid.add(lidBox);
  const bow = new THREE.Mesh(new THREE.TorusKnotGeometry(0.16, 0.06, 50, 8), ribbonMat);
  bow.position.y = 0.22;
  lid.add(bow);
  lid.position.set(0, half + 0.11, 0);   // resting on top, closed
  grp.add(lid);

  grp.position.set(x, 1.2, z);
  grp.userData = Object.assign(grp.userData, {
    baseY: 1.2, spin: (Math.random() - 0.5) * 0.6, phase: Math.random() * Math.PI * 2,
    lid, color, opened: false,
  });
  scene.add(grp);
  gifts.push(grp);
}
const giftColors = [COLOR.primary, COLOR.secondary, new THREE.Color(0x4ad6c0)];
for (let i = 0; i < 3; i++) {
  const a = (i / 3) * Math.PI * 2 + 0.6;
  addGift(Math.cos(a) * 5.5, Math.sin(a) * 5.5, giftColors[i]);
}

/* ============================================================ *
 *  PARTICLE STARFIELD
 * ============================================================ */
function makeSparkleTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const sparkleCount = Math.round(900 * INTENSITY);
const sparkGeo = new THREE.BufferGeometry();
const sparkPos = new Float32Array(sparkleCount * 3);
const sparkCol = new Float32Array(sparkleCount * 3);
const palette = [COLOR.primary, COLOR.secondary, COLOR.accent, new THREE.Color(0xffffff)];
for (let i = 0; i < sparkleCount; i++) {
  const r = 14 + Math.random() * 40;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  sparkPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  sparkPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6;
  sparkPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  const c = palette[Math.floor(Math.random() * palette.length)];
  sparkCol[i * 3] = c.r; sparkCol[i * 3 + 1] = c.g; sparkCol[i * 3 + 2] = c.b;
}
sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
const sparkles = new THREE.Points(
  sparkGeo,
  new THREE.PointsMaterial({
    size: 0.35, map: makeSparkleTexture(), vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9,
  })
);
scene.add(sparkles);

/* ============================================================ *
 *  INTERACTION: raycasting (hover + click)
 * ============================================================ */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const interactives = () => [
  ...candles.map((c) => c.group),
  ...balloons.filter((b) => b.visible),
  ...gifts,
  cake,
];
let hovered = null;
const tmpV = new THREE.Vector3();

function findRoot(obj) {
  let o = obj;
  while (o && !o.userData?.type) o = o.parent;
  return o;
}
function setPointerFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}
function pick(list) {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(list, true);
  for (const h of hits) {
    const root = findRoot(h.object);
    if (root) return { root, point: h.point };
  }
  return null;
}

/* ---- Pop a balloon ------------------------------------------------- */
function popBalloon(b, silent = false) {
  if (b.userData.popped) return;
  b.userData.popped = true;
  playPop();
  burstConfettiAt(b.position, 40);
  // shrink-out animation
  const start = performance.now();
  (function shrink() {
    const k = Math.min(1, (performance.now() - start) / 220);
    const s = 1 + k * 0.4 - k * k * 1.4; // pop then vanish
    b.scale.setScalar(Math.max(0.001, s));
    if (k < 1 && !reduceMotion) requestAnimationFrame(shrink);
    else {
      b.visible = false;
      if (!silent) {
        announce("Balloon popped! A card appeared.");
        showCard(Math.random() < 0.5 ? "popup" : "envelope"); // popup or sealed note
      }
      // respawn a fresh one after a beat
      setTimeout(() => spawnBalloon(b, b.userData.color), 1400 + Math.random() * 1500);
    }
  })();
}

/* Pop every balloon at once (no card spam — one wish card at the end) */
function popAllBalloons() {
  ensureAudio();
  const live = balloons.filter((b) => b.visible && !b.userData.popped);
  if (!live.length) { showHint("🎈 No balloons up right now — they'll float back!"); return; }
  live.forEach((b, i) => setTimeout(() => popBalloon(b, true), i * 90));
  rainConfetti(1600);
  launchFireworks();
  announce(`Popped all ${live.length} balloons!`);
  setTimeout(() => showCard(Math.random() < 0.5 ? "popup" : "envelope"), live.length * 90 + 400);
}

/* ---- Open a gift --------------------------------------------------- */
/* Little low-poly 3D gift models that pop out of the box. Each builder
 * returns a Group roughly 0.9 tall with its base at y = 0.            */
const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6 }, o));
function setShadows(g) { g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g; }

function buildTeddy() {
  const g = new THREE.Group();
  const fur = mat(0x9b5e2e, { roughness: 0.95 });
  const dark = mat(0x2a1a0e);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 18), fur);
  body.scale.set(1, 1.15, 0.9); body.position.y = 0.38; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 18), fur);
  head.position.y = 0.85; g.add(head);
  [-0.18, 0.18].forEach((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), fur); e.position.set(x, 1.03, 0); g.add(e); });
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), mat(0xd9b38c)); snout.position.set(0, 0.8, 0.2); snout.scale.set(1, 0.8, 0.9); g.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), dark); nose.position.set(0, 0.84, 0.31); g.add(nose);
  [-0.1, 0.1].forEach((x) => { const ey = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), dark); ey.position.set(x, 0.92, 0.23); g.add(ey); });
  [-0.33, 0.33].forEach((x) => { const a = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), fur); a.position.set(x, 0.46, 0.05); g.add(a); });
  [-0.16, 0.16].forEach((x) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), fur); l.position.set(x, 0.1, 0.06); g.add(l); });
  return setShadows(g);
}

function buildPianoGift() {
  const g = new THREE.Group();
  const black = mat(0x101015, { roughness: 0.3, metalness: 0.4 });
  // grand-piano body (rounded slab)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.62), black); body.position.y = 0.42; g.add(body);
  const curve = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.16, 24, 1, false, 0, Math.PI), black);
  curve.position.set(0.42, 0.42, 0); curve.rotation.y = -Math.PI / 2; g.add(curve);
  // raised lid
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.58), black);
  lid.position.set(-0.02, 0.55, -0.14); lid.rotation.x = -0.6; g.add(lid);
  const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), mat(0x888888)); prop.position.set(-0.3, 0.6, -0.1); prop.rotation.z = 0.3; g.add(prop);
  // keyboard
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.14), mat(0xfdfdfd)); keys.position.set(-0.02, 0.36, 0.32); g.add(keys);
  for (let i = 0; i < 10; i++) { const bk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.08), black); bk.position.set(-0.32 + i * 0.07, 0.39, 0.3); g.add(bk); }
  // three legs
  [[-0.36, 0.26], [0.36, 0.26], [0, -0.26]].forEach(([x, z]) => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), black); leg.position.set(x, 0.2, z); g.add(leg); });
  return setShadows(g);
}

function buildChocolates() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.52), mat(0x7a1f3d, { roughness: 0.5 }));
  box.position.y = 0.1; g.add(box);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.05, 0.54), mat(0xa83357)); rim.position.y = 0.2; g.add(rim);
  const chocs = [mat(0x3a2012), mat(0x5b3a1e), mat(0x8c5a2b)];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), chocs[(i + j) % 3]);
    c.scale.y = 0.7; c.position.set(-0.22 + i * 0.22, 0.24, -0.13 + j * 0.26); g.add(c);
  }
  return setShadows(g);
}

function buildCupcake() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.18, 0.32, 18), mat(0xcf7a35));
  base.position.y = 0.16; g.add(base);
  for (let i = 0; i < 3; i++) {
    const swirl = new THREE.Mesh(new THREE.SphereGeometry(0.26 - i * 0.06, 16, 16), mat(0xff9ec4, { roughness: 0.4 }));
    swirl.position.y = 0.4 + i * 0.16; g.add(swirl);
  }
  const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), mat(0xd11149, { roughness: 0.3 }));
  cherry.position.y = 0.92; g.add(cherry);
  return setShadows(g);
}

function buildTrophy() {
  const g = new THREE.Group();
  const gold = mat(0xffd23f, { metalness: 0.85, roughness: 0.25, emissive: 0x3a2e00, emissiveIntensity: 0.3 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.13, 0.34, 18), gold); cup.position.y = 0.62; g.add(cup);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 8, 24), gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.79; g.add(rim);
  [-0.27, 0.27].forEach((x) => { const h = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 16), gold); h.position.set(x, 0.66, 0); h.rotation.y = Math.PI / 2; g.add(h); });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 10), gold); stem.position.y = 0.36; g.add(stem);
  const base1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 18), mat(0x5a3a1a)); base1.position.y = 0.24; g.add(base1);
  const base2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), mat(0x3a2414)); base2.position.y = 0.16; g.add(base2);
  return setShadows(g);
}

function buildCrown() {
  const g = new THREE.Group();
  const gold = mat(0xffd23f, { metalness: 0.85, roughness: 0.22, emissive: 0x3a2e00, emissiveIntensity: 0.35 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 24, 1, true), gold); band.position.y = 0.5; g.add(band);
  const jewels = [0xff3b6b, 0x3bdcff, 0x8b5cff, 0x4ade80, 0xffffff];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), gold);
    spike.position.set(Math.cos(a) * 0.3, 0.72, Math.sin(a) * 0.3); g.add(spike);
    const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), mat(jewels[i % jewels.length], { metalness: 0.3, roughness: 0.2, emissive: jewels[i % jewels.length], emissiveIntensity: 0.4 }));
    jewel.position.set(Math.cos(a) * 0.3, 0.52, Math.sin(a) * 0.3); g.add(jewel);
  }
  const bot = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 24), gold); bot.rotation.x = Math.PI / 2; bot.position.y = 0.4; g.add(bot);
  return setShadows(g);
}

const GIFTS = [
  { name: "cuddly teddy bear", build: buildTeddy },
  { name: "grand piano", build: buildPianoGift },
  { name: "box of chocolates", build: buildChocolates },
  { name: "yummy cupcake", build: buildCupcake },
  { name: "gold trophy", build: buildTrophy },
  { name: "sparkly crown", build: buildCrown },
];
const LID_CLOSED = { y: 0.61, x: 0, z: 0, rz: 0, rx: 0 };
const LID_OPEN = { y: 1.25, x: 1.25, z: 0.45, rz: -1.35, rx: 0.35 }; // lifted & leaning aside
function openGift(g) {
  const lid = g.userData.lid;
  if (g.userData.opened) {
    // close it back up
    g.userData.opened = false;
    g.userData.prizeReady = false;
    lid.position.set(LID_CLOSED.x, LID_CLOSED.y, LID_CLOSED.z);
    lid.rotation.set(LID_CLOSED.rx, 0, LID_CLOSED.rz);
    if (g.userData.prize) { g.remove(g.userData.prize); g.userData.prize = null; }
    return;
  }
  g.userData.opened = true;
  playPop();
  burstConfettiAt(g.position, 120);
  rainConfetti(1600);
  announce("Surprise! The gift box opened.");   // screen-reader only, no on-screen popup

  // lid lifts up and tilts off to the side (clears the opening)
  const start = performance.now();
  (function lift() {
    const k = Math.min(1, (performance.now() - start) / 600);
    const e = easeInOut(k);
    lid.position.set(LID_OPEN.x * e, LID_CLOSED.y + (LID_OPEN.y - LID_CLOSED.y) * e, LID_OPEN.z * e);
    lid.rotation.set(LID_OPEN.rx * e, 0, LID_OPEN.rz * e);
    if (k < 1 && !reduceMotion) requestAnimationFrame(lift);
    else { lid.position.set(LID_OPEN.x, LID_OPEN.y, LID_OPEN.z); lid.rotation.set(LID_OPEN.rx, 0, LID_OPEN.rz); }
  })();

  // a real 3D present rises up out of the open box and floats, slowly spinning
  const chosen = GIFTS[Math.floor(Math.random() * GIFTS.length)];
  const prize = chosen.build();
  prize.scale.setScalar(0.85);
  prize.position.set(0, -0.4, 0);    // start down inside the box
  g.add(prize);
  g.userData.prize = prize;
  const RISE_TO = 0.95;
  const t0 = performance.now();
  (function rise() {
    const k = Math.min(1, (performance.now() - t0) / 850);
    const e = easeInOut(k);
    prize.position.y = -0.4 + e * (RISE_TO + 0.4);   // up through the opening
    if (k < 1 && !reduceMotion) requestAnimationFrame(rise);
    else { prize.position.y = RISE_TO; g.userData.prizeReady = true; }
  })();
  // no on-screen popup — the 3D present rising out shows what it is
  announce(`You got a ${chosen.name}.`);
}

/* ---- Click handling ------------------------------------------------ */
let downX = 0, downY = 0, downT = 0;
renderer.domElement.addEventListener("pointerdown", (e) => {
  downX = e.clientX; downY = e.clientY; downT = performance.now();
});
renderer.domElement.addEventListener("pointerup", (e) => {
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  const quick = performance.now() - downT < 400;
  if (moved > 6 || !quick) return; // it was a drag, not a click
  setPointerFromEvent(e);
  const hit = pick(interactives());
  if (!hit) return;
  const { root, point } = hit;
  ensureAudio();
  if (root.userData.type === "balloon") {
    popBalloon(root);
    // small camera nudge toward it
    flyTo(frameFrom(point, tmpV.copy(camera.position).sub(point), 6), point.clone(), 0.9);
  } else if (root.userData.type === "gift") {
    openGift(root);
    flyTo(frameFrom(root.position, new THREE.Vector3(2, 2, 4), 5), root.position.clone(), 1);
  } else if (root.userData.type === "candle") {
    // blow out this one candle and make a wish
    blowCandle(root.userData.index);
  } else if (root.userData.type === "cake") {
    flyTo(new THREE.Vector3(0, 8, 7), new THREE.Vector3(0, 4, 0), 1.2);
  }
});

/* ---- Double-click: zoom to whatever you clicked -------------------- */
renderer.domElement.addEventListener("dblclick", (e) => {
  setPointerFromEvent(e);
  const hit = pick([...interactives(), ground]);
  if (!hit) return;
  const dir = tmpV.copy(camera.position).sub(hit.point);
  flyTo(frameFrom(hit.point, dir, 5), hit.point.clone(), 1.1);
});

/* ---- Hover: cursor + scale pulse ----------------------------------- */
renderer.domElement.addEventListener("pointermove", (e) => {
  setPointerFromEvent(e);
  const hit = pick(interactives());
  const type = hit?.root.userData.type;
  const clickable = type === "balloon" || type === "gift" || type === "candle";
  const root = clickable ? hit.root : null;
  // only balloons & gifts get the scale-pulse; candles just change the cursor
  const pulseRoot = (type === "balloon" || type === "gift") ? hit.root : null;
  if (pulseRoot !== hovered) {
    if (hovered) hovered.userData.hover = false;
    hovered = pulseRoot;
    if (hovered) hovered.userData.hover = true;
  }
  renderer.domElement.style.cursor = root ? "pointer" : "grab";
});
renderer.domElement.style.cursor = "grab";

/* ============================================================ *
 *  GUIDED TOUR  (waypoints)
 * ============================================================ */
const tour = [
  { name: "Wide view", pos: new THREE.Vector3(0, 6, 15), tgt: new THREE.Vector3(0, 2.6, 0) },
  { name: "The candles", pos: new THREE.Vector3(0, 8, 6.5), tgt: new THREE.Vector3(0, 4.2, 0) },
  { name: "Top of the cake", pos: new THREE.Vector3(0, 11, 0.1), tgt: new THREE.Vector3(0, 3, 0) },
  { name: "Up close", pos: new THREE.Vector3(3.5, 3.5, 4.5), tgt: new THREE.Vector3(0, 2.2, 0) },
  { name: "Among the gifts", pos: new THREE.Vector3(6, 3, 7), tgt: new THREE.Vector3(3, 1.4, 3) },
  { name: "Balloon's eye", pos: new THREE.Vector3(-4, 7, 6), tgt: new THREE.Vector3(-2, 5, -1) },
];
let tourIdx = 0;
function nextTourStop() {
  tourIdx = (tourIdx + 1) % tour.length;
  const w = tour[tourIdx];
  flyTo(w.pos.clone(), w.tgt.clone(), 1.6);
  announce(`Flying to: ${w.name}`);
  showHint(`📍 ${w.name}`);
}

/* ============================================================ *
 *  ANIMATION LOOP
 * ============================================================ */
const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  const dt = Math.min(0.05, clockDelta());

  // Camera flight
  if (flight.active) {
    flight.t += dt / flight.dur;
    const k = easeInOut(Math.min(1, flight.t));
    camera.position.lerpVectors(flight.startPos, flight.endPos, k);
    orbit.target.lerpVectors(flight.startTgt, flight.endTgt, k);
    camera.lookAt(orbit.target);
    if (flight.t >= 1) endFlight();
  }

  cake.position.y = reduceMotion ? 0 : Math.sin(t * 1.1) * 0.06;

  candles.forEach((c, i) => {
    if (!c.lit) return;
    const flick = 1 + Math.sin(t * 12 + i) * 0.18 + Math.random() * 0.06;
    c.flame.scale.set(1, 1.7 * flick, 1);
    c.flame.material.emissiveIntensity = 2 + Math.sin(t * 15 + i) * 0.6;
    c.light.intensity = 1.2 + Math.sin(t * 14 + i) * 0.4;
  });

  balloons.forEach((b) => {
    if (!b.visible) return;
    const u = b.userData;
    const bounce = partyOn ? beatPulse * 0.9 : 0;     // dance to the beat
    b.position.y = u.baseY + bounce + (reduceMotion ? 0 : Math.sin(t * u.speed + u.phase) * 0.5);
    b.rotation.z = reduceMotion ? 0 : Math.sin(t * u.speed * 0.7 + u.phase) * (partyOn ? 0.35 : 0.12) * u.swing;
    const target = (u.hover ? 1.12 : 1) + (partyOn ? beatPulse * 0.12 : 0);
    if (!u.popped) b.scale.lerp(tmpV.set(target, target, target), 0.2);
  });

  gifts.forEach((g) => {
    const u = g.userData;
    const bounce = partyOn ? beatPulse * 0.5 : 0;
    g.position.y = u.baseY + bounce + (reduceMotion ? 0 : Math.sin(t * 1.4 + u.phase) * 0.25);
    g.rotation.y += reduceMotion ? 0 : u.spin * 0.01 + (partyOn ? dt * 1.5 : 0);
    const target = (u.hover ? 1.12 : 1) + (partyOn ? beatPulse * 0.1 : 0);
    g.scale.lerp(tmpV.set(target, target, target), 0.2);
    // the revealed 3D present slowly spins & bobs above the open box
    if (u.prize && u.prizeReady && !reduceMotion) {
      u.prize.rotation.y += dt * 0.9;
      u.prize.position.y = 0.95 + Math.sin(t * 1.6 + u.phase) * 0.06;
    }
  });

  if (!reduceMotion) sparkles.rotation.y = t * 0.02;

  // party / disco mode
  beatPulse = Math.max(0, beatPulse - dt * 4);
  if (discoBall) {
    const targetY = partyOn ? 14 : 30;
    discoBall.position.y += (targetY - discoBall.position.y) * 0.05;
    if (partyOn && !reduceMotion) discoBall.children[0].rotation.y += dt * 1.2;
    // light beams flare on each kick
    discoBeams.forEach((b) => { b.material.opacity = partyOn ? 0.1 + beatPulse * 0.22 : 0; });
    partyLights.forEach((pl, i) => {
      const target = partyOn ? 1.4 + beatPulse * 2.2 : 0;
      pl.intensity += (target - pl.intensity) * 0.2;
      if (partyOn) {
        const ang = t * 1.4 + pl.userData.base * Math.PI * 2;
        pl.position.set(Math.cos(ang) * 11, 7 + Math.sin(t * 2 + i) * 3.5, Math.sin(ang) * 11);
      }
    });
    if (partyOn) {
      cake.scale.setScalar(1 + beatPulse * 0.05);
      if (!reduceMotion) cake.position.y += beatPulse * 0.18;
      // background pulses through hues, brighter on each kick
      const hue = (t * 0.12) % 1;
      partyColor.setHSL(hue, 0.65, 0.1 + beatPulse * 0.14);
      scene.background.copy(partyColor);
      scene.fog.color.copy(partyColor);
      renderer.toneMappingExposure = 1.15 + beatPulse * 0.5;   // strobe flash
    } else if (cake.scale.x !== 1) {
      cake.scale.setScalar(1);
    }
  }

  if (bgName) {
    // ease the big name in from far away once the surprise is opened
    if (revealed && bgProg < 1) bgProg = Math.min(1, bgProg + dt * (reduceMotion ? 4 : 0.35));
    const e = easeInOut(bgProg);
    bgName.position.z = BG_Z_FAR + (BG_Z_NEAR - BG_Z_FAR) * e;
    bgName.position.y = BG_Y + (reduceMotion ? 0 : Math.sin(t * 0.5) * 0.5 * e);
    bgName.rotation.y = reduceMotion ? 0 : Math.sin(t * 0.25) * 0.08 * e;
    bgName.scale.setScalar(0.25 + 0.75 * e);
  }

  if (orbit.enabled) orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

let _last = performance.now();
function clockDelta() {
  const now = performance.now();
  const d = (now - _last) / 1000;
  _last = now;
  return d;
}

/* ---- Resize -------------------------------------------------------- */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeConfetti();
});

/* ============================================================ *
 *  CONFETTI  (2D canvas)
 * ============================================================ */
const confettiCanvas = $("confetti");
const cx = confettiCanvas.getContext("2d");
let confetti = [];
function resizeConfetti() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
resizeConfetti();

const confettiColors = [CFG.theme.primary, CFG.theme.secondary, CFG.theme.accent, "#4ad6c0", "#ff8c42", "#ffffff"];
function pushConfetti(originX, amount) {
  if (reduceMotion) amount = Math.min(amount, 40);
  for (let i = 0; i < amount * INTENSITY; i++) {
    confetti.push({
      x: originX + (Math.random() - 0.5) * 80,
      y: -20 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 8,
      vy: 2 + Math.random() * 5,
      size: 6 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      shape: Math.random() > 0.5 ? "rect" : "circle",
      life: 1,
    });
  }
}
function burstConfetti(amount = 160) { pushConfetti(confettiCanvas.width / 2, amount); }
function burstConfettiAt(worldPos, amount = 80) {
  // project 3D point to 2D screen
  const v = worldPos.clone().project(camera);
  const sx = (v.x * 0.5 + 0.5) * confettiCanvas.width;
  pushConfetti(sx, amount);
}
function rainConfetti(duration = 2600) {
  const end = performance.now() + duration;
  (function loop() {
    burstConfetti(24);
    if (performance.now() < end) setTimeout(loop, 120);
  })();
}
function drawConfetti() {
  cx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confetti.forEach((p) => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.99; p.rot += p.vr;
    if (p.y > confettiCanvas.height + 40) p.life = 0;
    cx.save();
    cx.translate(p.x, p.y);
    cx.rotate(p.rot);
    cx.fillStyle = p.color;
    cx.globalAlpha = 0.95;
    if (p.shape === "rect") cx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
    else { cx.beginPath(); cx.arc(0, 0, p.size / 2, 0, Math.PI * 2); cx.fill(); }
    cx.restore();
  });
  confetti = confetti.filter((p) => p.life > 0);
  requestAnimationFrame(drawConfetti);
}
drawConfetti();

/* ============================================================ *
 *  SOUND  (WebAudio — no files needed)
 * ============================================================ */
let audioCtx = null;
let soundOn = CFG.sound;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function playNote(freq, start, dur, type = "sine", gain = 0.18) {
  if (!soundOn || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g); g.connect(audioCtx.destination);
  const t0 = audioCtx.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}
function playFanfare() {
  ensureAudio();
  [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) =>
    playNote(f, i * 0.12, 0.4, "triangle", 0.16));
  playNote(1318.5, 0.72, 0.8, "sine", 0.12);
}
function playPop() { ensureAudio(); playNote(440 + Math.random() * 260, 0, 0.16, "square", 0.1); }

/* ---- Gentle auto-playing background music -------------------------- */
let musicTimer = null;
let musicStep = 0;
// soft chord pads cycling under everything
const MUSIC_CHORDS = [
  [261.63, 329.63, 392.0],   // C
  [349.23, 440.0, 523.25],   // F
  [392.0, 493.88, 587.33],   // G
  [329.63, 415.3, 493.88],   // Am-ish
];
function playPad(freqs) {
  if (!soundOn || !audioCtx) return;
  freqs.forEach((f) => {
    playNote(f, 0, 2.6, "triangle", 0.035);     // very soft
    playNote(f / 2, 0, 2.6, "sine", 0.02);      // gentle bass
  });
}
function startMusic() {
  ensureAudio();
  if (musicTimer || !soundOn) return;
  const step = () => {
    if (!soundOn) return;
    playPad(MUSIC_CHORDS[musicStep % MUSIC_CHORDS.length]);
    musicStep++;
  };
  step();
  musicTimer = setInterval(step, 2500);
}
function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

/* ============================================================ *
 *  COUNTDOWN  +  CONTENT
 * ============================================================ */
function announce(msg) { srStatus.textContent = msg; }
let hintTimer = null;
function showHint(text) {
  if (!hint) return;
  hint.textContent = text;
  hint.classList.add("is-visible");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.remove("is-visible"), 2600);
}

function setupContent() {
  $("wish-heading").textContent = CFG.name;
  document.title = `🎉 Happy Birthday, ${CFG.name}!`;
  const msgEl = $("wish-message");
  if (CFG.message) msgEl.textContent = CFG.message; else msgEl.remove();
  if (CFG.from) { const f = $("wish-from"); f.textContent = `— with love, ${CFG.from}`; f.hidden = false; }
}

function nextBirthday(dateStr) {
  const parts = (dateStr || "").split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return null;
  const [, month, day] = parts;
  const now = new Date();
  let target = new Date(now.getFullYear(), month - 1, day, 0, 0, 0);
  const isToday = now.getMonth() === month - 1 && now.getDate() === day;
  if (!isToday && target < now) target = new Date(now.getFullYear() + 1, month - 1, day);
  return { target, isToday };
}

const cdEl = $("countdown");
let countdownTimer = null;
function renderCountdown() {
  const nb = nextBirthday(CFG.date);
  if (!nb) { cdEl.remove(); return; }
  if (nb.isToday) {
    cdEl.innerHTML = `<div class="countdown--today">🎂 It's your big day! 🎂</div>`;
    announce(`Happy birthday ${CFG.name}! It is your big day.`);
    if (countdownTimer) clearInterval(countdownTimer);
    setTimeout(() => celebrate(true), 900);
    return;
  }
  function update() {
    const diff = nb.target - new Date();
    if (diff <= 0) { renderCountdown(); return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff / 3600000) % 24);
    const m = Math.floor((diff / 60000) % 60);
    const s = Math.floor((diff / 1000) % 60);
    const unit = (n, l) =>
      `<div class="countdown__unit"><span class="countdown__num">${String(n).padStart(2, "0")}</span><span class="countdown__label">${l}</span></div>`;
    cdEl.innerHTML = unit(d, "days") + unit(h, "hrs") + unit(m, "min") + unit(s, "sec");
  }
  update();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(update, 1000);
}

/* ============================================================ *
 *  CELEBRATE / WISH / CANDLES
 * ============================================================ */
function celebrate(big = false) {
  burstConfetti(big ? 260 : 160);
  rainConfetti(big ? 3200 : 1800);
  playFanfare();
  announce("Hooray! Confetti everywhere. Happy birthday!");
  if (!reduceMotion) {
    orbit.autoRotate = true;
    const o = orbit.autoRotateSpeed;
    orbit.autoRotateSpeed = 6;
    setTimeout(() => { orbit.autoRotateSpeed = o; orbit.autoRotate = !reduceMotion; }, 800);
  }
}
const candleWorld = (c) => c.group.getWorldPosition(new THREE.Vector3());

/* Light the candles one-by-one (the guided intro), then invite blow-out */
let lightingSeq = false;
function lightCandlesOneByOne() {
  ensureAudio();
  if (lightingSeq) return;
  const unlit = candles.filter((c) => !c.lit);
  if (!unlit.length) { showHint("🔥 All candles are already glowing — click each to blow it out!"); return; }
  lightingSeq = true;
  showHint("🕯️ Lighting the candles…");
  announce("Lighting the candles one by one.");
  unlit.forEach((c, n) => {
    setTimeout(() => {
      setCandle(c.index, true);
      playNote(560 + n * 60, 0, 0.3, "sine", 0.12);
      burstConfettiAt(candleWorld(c), 14);
      if (n === unlit.length - 1) {
        lightingSeq = false;
        showHint("✨ Now click each candle to blow it out & make a wish!");
        announce("All candles lit. Click each candle to blow it out and make a wish.");
      }
    }, 500 + n * 600);
  });
}
/* Quick "light all" used by the 🔥 button */
function lightCandles() { lightCandlesOneByOne(); }

/* Blow out one candle (clicking it) */
function blowCandle(i) {
  const c = candles[i];
  if (!c || !c.lit) return;
  ensureAudio();
  setCandle(i, false);
  playPop();
  burstConfettiAt(candleWorld(c), 24);
  const left = litCount();
  if (left > 0) {
    showHint(`🕯️ Pfff… ${left} candle${left > 1 ? "s" : ""} to go!`);
    announce(`Candle blown out. ${left} remaining.`);
  } else {
    onAllBlown();
  }
}
function onAllBlown() {
  showHint("🎉 Make a wish — happy birthday!");
  announce(`All candles out! Wish made. Happy birthday ${NM()}!`);
  celebrate(true);
  setTimeout(() => showCard("popup"), 500);
}
/* "Make a wish" button: blow them all out in a quick ripple */
function makeWish() {
  ensureAudio();
  const lit = candles.filter((c) => c.lit);
  if (!lit.length) { lightCandlesOneByOne(); return; }
  lit.forEach((c, n) =>
    setTimeout(() => {
      setCandle(c.index, false);
      playPop();
      burstConfettiAt(candleWorld(c), 20);
      if (n === lit.length - 1) onAllBlown();
    }, n * 220)
  );
}
function toggleCandles() { makeWish(); }

/* ============================================================ *
 *  START / REVEAL / CONTROLS
 * ============================================================ */
function reveal() {
  startGate.hidden = true;
  overlay.hidden = false;
  controls.hidden = false;
  revealed = true;
  ensureAudio();
  flyTo(new THREE.Vector3(0, 6, 13), new THREE.Vector3(0, 2.6, 0), 1.8);
  setTimeout(() => celebrate(true), 400);

  // auto-playing music: a cheerful "Happy Birthday", then a soft pad loop
  if (soundOn) {
    playHappyBirthday();
    setTimeout(startMusic, 13000);
  }

  // guided candles: light them one-by-one, then invite the user to blow them out
  setTimeout(lightCandlesOneByOne, 2200);

  showHint("✨ Watch the candles light up… then click each to blow it out!");
  const h = $("wish-heading");
  h.setAttribute("tabindex", "-1");
  h.focus({ preventScroll: true });
}

/* Show / hide the central birthday message card so the scene is explorable */
function toggleMessage(force) {
  const show = force !== undefined ? force : overlay.hidden;
  overlay.hidden = !show;
  const btn = $("message-btn");
  if (btn) btn.setAttribute("aria-pressed", String(show));
  if (show) {
    const h = $("wish-heading");
    h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
  } else {
    showHint("💌 Message hidden — tap 💌 anytime to bring it back");
    renderer.domElement.focus?.();
  }
}

function applyMotionPref() {
  document.body.classList.toggle("reduce-motion", reduceMotion);
  orbit.autoRotate = !reduceMotion && !flight.active;
  const btn = $("motion-toggle");
  btn.setAttribute("aria-pressed", String(reduceMotion));
  btn.textContent = reduceMotion ? "⏸️" : "🌀";
}

function wireControls() {
  $("start-btn").addEventListener("click", reveal);
  $("celebrate-btn").addEventListener("click", () => { ensureAudio(); celebrate(false); });
  $("wish-btn").addEventListener("click", makeWish);
  $("tour-btn").addEventListener("click", nextTourStop);
  $("light-btn").addEventListener("click", lightCandles);
  $("popall-btn").addEventListener("click", popAllBalloons);
  $("cut-btn").addEventListener("click", cutCake);
  $("firework-btn").addEventListener("click", launchFireworks);
  $("piano-btn").addEventListener("click", () => togglePiano());
  $("piano-hide").addEventListener("click", () => togglePiano(false));
  $("piano-song").addEventListener("click", playHappyBirthday);
  $("card-next").addEventListener("click", () => { randomCard(); burstConfetti(40); });
  $("card-close").addEventListener("click", hideCard);
  $("card-dismiss").addEventListener("click", () => toggleMessage(false));
  $("message-btn").addEventListener("click", () => toggleMessage());

  $("party-btn").addEventListener("click", () => toggleParty());

  $("sound-toggle").addEventListener("click", (e) => {
    soundOn = !soundOn;
    if (soundOn) { ensureAudio(); startMusic(); } else { stopMusic(); }
    e.currentTarget.setAttribute("aria-pressed", String(soundOn));
    e.currentTarget.textContent = soundOn ? "🔊" : "🔇";
    announce(soundOn ? "Sound on" : "Sound off");
  });
  $("motion-toggle").addEventListener("click", () => {
    reduceMotion = !reduceMotion;
    applyMotionPref();
    announce(reduceMotion ? "Motion reduced" : "Motion on");
  });
  $("replay-btn").addEventListener("click", () => {
    // fresh cake, relight from scratch, replay the candle guide
    cutAngle = 0;
    buildTiers();
    candles.forEach((c) => setCandle(c.index, false));
    flyTo(new THREE.Vector3(0, 6, 13), new THREE.Vector3(0, 2.6, 0), 1.4);
    celebrate(true);
    setTimeout(lightCandlesOneByOne, 900);
  });

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();

    if (e.key === "Escape") { hideCard(); if (pianoOpen) togglePiano(false); return; }

    // When the piano is open, letter keys play notes instead of shortcuts.
    if (pianoOpen && KEY_FOR_LETTER[k]) {
      if (e.repeat) return;
      pressKey(KEY_FOR_LETTER[k]);
      return;
    }

    if (e.target.matches("button, a, input")) return;
    if (k === "c") celebrate(false);
    if (k === "w") makeWish();
    if (k === "t") nextTourStop();
    if (k === "x") cutCake();
    if (k === "l") lightCandles();
    if (k === "b") popAllBalloons();
    if (k === "d") toggleParty();
    if (k === "f") launchFireworks();
    if (k === "p") togglePiano();
    if (k === "m") toggleMessage();
    if (k === "r") { flyTo(new THREE.Vector3(0, 6, 13), new THREE.Vector3(0, 2.6, 0), 1.2); }
  });
}

/* ============================================================ *
 *  SURPRISE CARDS  (revealed by popping balloons)
 * ============================================================ */
/* Pool of names: the real name + any funny nicknames. Each message picks a
 * different one (never repeating the previous pick) so the names auto-rotate. */
const NAME_POOL = [CFG.name, ...(Array.isArray(CFG.nicknames) ? CFG.nicknames : [])]
  .map((n) => (n || "").toString().trim())
  .filter(Boolean);
if (!NAME_POOL.length) NAME_POOL.push("friend");
let _lastName = -1;
const NM = () => {
  if (NAME_POOL.length === 1) return NAME_POOL[0];
  let i;
  do { i = Math.floor(Math.random() * NAME_POOL.length); } while (i === _lastName);
  _lastName = i;
  return NAME_POOL[i];
};
/* Long, unique messages grouped by where they come from. {who} → the name. */
const CARD_SETS = {
  popup: {
    title: "🎈 A wish floated out!",
    emojis: ["🎈", "🎉", "🥳", "🌈", "✨"],
    messages: [
      "Pop! 🎈 That balloon carried a tiny secret just for you: every single year you've been around has made this world a warmer, funnier, brighter place. Today we get to celebrate exactly that — so go ahead and take up all the space, eat the bigger slice, and let everyone fuss over you. You've earned it, {who}.",
      "Surprise! 🎉 Somewhere inside this balloon was bottled up a whole year of good luck, silly laughs, unexpected wins and cozy little moments — and now it's all yours. May your coming year be ridiculously good to you, {who}, in all the ways you hope for and a few wonderful ones you never saw coming.",
      "Here's the thing nobody tells you, {who}: you don't get older, you get *upgraded*. New wisdom, better stories, sharper jokes, and an even bigger heart. This balloon just unlocked your next level — go play it like the legend you are. 🚀",
      "Whoosh — caught one! 🎈 Consider this your official reminder that you are deeply, genuinely loved. Not the polite kind. The real kind. The kind that throws confetti at a screen just to make you smile today. Happy birthday, {who}.",
      "That balloon held a single, stubborn wish that refused to pop until you found it: that this year hands you more reasons to laugh than to worry, more 'yes' than 'maybe', and a cake so good it ruins all other cakes forever. 🍰",
    ],
  },
  envelope: {
    title: "💌 A sealed little note",
    emojis: ["💌", "✉️", "💖", "🌟", "🕊️"],
    messages: [
      "Dear {who}, if I folded every good wish meant for you into this envelope, it would never have closed. So I picked the most important one: be as kind to yourself this year as you always are to everyone else. You deserve front-row seats to your own happiness. With love, always. 💖",
      "P.S. 💌 They say you should make a wish on your birthday — but honestly, {who}, the world already got its wish the day you showed up. So this year, wish big and a little selfishly. Chase the loud dream, not the safe one. We're all quietly cheering for you.",
      "A small confession sealed in this envelope: you are someone's favourite person, someone's safe place, someone's reason to smile on a hard day. That's not a small thing, {who} — that's a whole life well-lived. Here's to many, many more chapters. 🕊️",
      "Folded inside: one year of permission slips. Permission to rest, to start over, to say no, to celebrate loudly, to be proud of how far you've come. Use them generously, {who}. Happy birthday from someone who's lucky to know you. ✉️",
      "Hand-written just for you, {who}: may your coffee be strong, your friends be near, your worries be small and your birthday cake be enormous. And may you always remember how genuinely wonderful you are — even on the ordinary days. 🌟",
    ],
  },
  gift: {
    title: "🎁 You unwrapped a gift!",
    emojis: ["🎁", "🧸", "🎀", "🏆", "💝"],
    messages: [
      "Tah-dah! 🎁 You unwrapped a {item}! But the real present, {who}, is a brand-new year stuffed with possibility — 365 blank pages waiting for your best stories yet. Go fill them with bold, beautiful, slightly ridiculous adventures.",
      "Inside the box: a {item}! 🎀 And tucked beneath it, a wish — that this year treats you the way you deserve: gently, generously, and with plenty of dessert. Happy birthday, {who}. You make the whole world a little more fun.",
      "Congratulations, {who} — it's a {item}! 🏆 Think of it as a trophy for simply being you: thoughtful, hilarious, stubborn in the best ways, and impossible not to love. Here's to a year as remarkable as the person unwrapping this.",
      "Ooooh, a {item}! 💝 Gifts are nice, but you, {who}, are the gift the rest of us got. So today we wrap *you* in confetti, cake and far too many emojis. May this year be your happiest, healthiest, most you-est one yet.",
    ],
    items: [
      "giant cuddly teddy bear 🧸", "shiny gold trophy 🏆", "box of fancy chocolates 🍫",
      "tiny adorable puppy 🐶", "magic wand ✨", "pair of cozy socks 🧦",
      "ticket to anywhere ✈️", "jar of endless cookies 🍪", "sparkly crown 👑",
      "brand-new bicycle 🚲",
    ],
  },
  cake: {
    title: "🍰 Slice served!",
    emojis: ["🍰", "🎂", "😋", "🥳", "🕯️"],
    messages: [
      "First slice is always yours, {who}. 🍰 Make a wish before the first bite — the good kind, the one you're almost too shy to say out loud. Then eat the frosting flower. You're the birthday star; the rules bend for you today.",
      "Cut, lifted, served — and somehow it tastes even better because it's *your* day, {who}. 🎂 May your year be exactly like this cake: sweet, generous, shared with the people you love, and absolutely worth the wait.",
      "There it goes — a perfect slice! 😋 Here's a wish baked right in: that the months ahead are layered with little joys, topped with big laughs, and dusted with just enough surprises to keep things interesting. Happy birthday, {who}.",
      "One slice down, a whole wonderful year to go. 🥳 Save room, {who} — life still has so much good stuff to serve you. Today, though, you only have one job: be celebrated. Let us spoil you rotten.",
    ],
  },
};

let cardModal, cardText, cardEmoji, cardTitle;
const pick1 = (arr) => arr[Math.floor(Math.random() * arr.length)];
let lastCardSet = "popup";
function randomCard(setName = lastCardSet, opts = {}) {
  lastCardSet = setName;
  const set = CARD_SETS[setName] || CARD_SETS.popup;
  let msg = pick1(set.messages);
  const item = opts.item || (set.items ? pick1(set.items) : "");
  msg = msg.replaceAll("{who}", NM()).replaceAll("{item}", item);
  cardText.textContent = msg;
  cardEmoji.textContent = pick1(set.emojis);
  if (cardTitle) cardTitle.textContent = set.title;
}
function showCard(setName = "popup", opts = {}) {
  if (!cardModal) return;
  randomCard(setName, opts);
  cardModal.dataset.kind = setName;
  cardModal.hidden = false;
  burstConfetti(60);
  playFanfare();
  $("card-close").focus({ preventScroll: true });
}
function hideCard() { if (cardModal) cardModal.hidden = true; }

/* ============================================================ *
 *  FIREWORKS  (radial bursts on the confetti canvas)
 * ============================================================ */
function fireworkBurst(x, y) {
  const n = Math.round(60 * INTENSITY);
  const hue = confettiColors[Math.floor(Math.random() * confettiColors.length)];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const sp = 3 + Math.random() * 5;
    confetti.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      size: 4 + Math.random() * 5,
      rot: 0, vr: 0,
      color: Math.random() > 0.4 ? hue : confettiColors[Math.floor(Math.random() * confettiColors.length)],
      shape: "circle",
      life: 1,
    });
  }
  playNote(180 + Math.random() * 120, 0, 0.5, "sawtooth", 0.06);
  playNote(880 + Math.random() * 400, 0.04, 0.3, "sine", 0.05);
}
function launchFireworks() {
  ensureAudio();
  const W = confettiCanvas.width, H = confettiCanvas.height;
  const shots = reduceMotion ? 2 : 6;
  for (let i = 0; i < shots; i++) {
    setTimeout(() => fireworkBurst(W * (0.2 + Math.random() * 0.6), H * (0.15 + Math.random() * 0.35)),
      i * 280);
  }
  announce("Fireworks!");
  showHint("🎆 Boom! Happy birthday!");
}

/* ============================================================ *
 *  PARTY / DISCO MODE  (disco ball + rotating colour lights + beat)
 * ============================================================ */
let partyOn = false;
let discoBall = null;
let partyLights = [];
let discoBeams = [];
let beatTimer = null;
let beatPulse = 0;        // decays each frame; spikes on every kick
const partyColor = new THREE.Color();

function makeDiscoTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#9aa3b2";
  ctx.fillRect(0, 0, 128, 128);
  const n = 8, s = 128 / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = 150 + Math.floor(Math.random() * 105);
      ctx.fillStyle = `rgb(${v},${v},${v + 10})`;
      ctx.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
    }
  return new THREE.CanvasTexture(c);
}

function buildDisco() {
  discoBall = new THREE.Group();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 24, 24),
    new THREE.MeshStandardMaterial({
      map: makeDiscoTexture(), color: 0xffffff,
      metalness: 0.95, roughness: 0.15, emissive: 0x222233, emissiveIntensity: 0.4,
    })
  );
  ball.castShadow = true;
  discoBall.add(ball);

  // visible coloured light beams shooting out of the ball (rotate with it)
  const beamCols = [0xff3b6b, 0x3bdcff, 0xffd23f, 0x8b5cff, 0x4ade80, 0xffffff];
  beamCols.forEach((col, i) => {
    const geo = new THREE.ConeGeometry(1.6, 16, 20, 1, true);
    geo.translate(0, -8, 0);   // apex at the ball centre, opens outward
    const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    // spread the beams around & tilt them downward like real disco rays
    const az = (i / beamCols.length) * Math.PI * 2;
    const el = -0.55 - (i % 2) * 0.25;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    ball.add(beam);
    discoBeams.push(beam);
  });

  // string up to the sky
  const str = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 14, 6),
    new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  str.position.y = 8.5;
  discoBall.add(str);
  discoBall.position.set(0, 30, 0);   // starts up high, descends when party starts
  discoBall.visible = false;
  scene.add(discoBall);

  // rotating coloured party lights
  const cols = [0xff3b6b, 0x3bdcff, 0xffd23f, 0x8b5cff, 0x4ade80];
  for (let i = 0; i < cols.length; i++) {
    const pl = new THREE.PointLight(cols[i], 0, 30, 2);
    pl.userData = { base: i / cols.length, color: cols[i] };
    scene.add(pl);
    partyLights.push(pl);
  }
}

function playBeat(kick) {
  if (!soundOn || !audioCtx) return;
  if (kick) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(150, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.12);
    g.gain.setValueAtTime(0.18, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.16);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.18);
    beatPulse = 1;
  } else {
    // hi-hat: short burst of filtered noise
    const buf = audioCtx.createBuffer(1, 2048, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const hp = audioCtx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
    const g = audioCtx.createGain(); g.gain.value = 0.05;
    src.connect(hp); hp.connect(g); g.connect(audioCtx.destination);
    src.start();
  }
}

// a catchy looping groove: kick/hat + bassline + lead arpeggio
const PARTY_BASS = [65.41, 65.41, 98.0, 87.31];                         // C2 C2 G2 F2
const PARTY_LEAD = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.0, 698.46];
let partyStep = 0;
function playGroove(step) {
  if (!soundOn || !audioCtx) return;
  const beat = step % 8;
  playBeat(beat % 2 === 0);                                              // kick / hat
  if (beat % 2 === 0) {                                                  // bass on each kick
    playNote(PARTY_BASS[(step >> 1) % PARTY_BASS.length], 0, 0.22, "sawtooth", 0.11);
  }
  playNote(PARTY_LEAD[beat], 0, 0.16, "triangle", 0.045);               // lead line
  if (step % 16 === 0) burstConfetti(50);                               // confetti every 2 bars
}

function toggleParty(force) {
  partyOn = force !== undefined ? force : !partyOn;
  ensureAudio();
  if (!discoBall) buildDisco();
  const btn = $("party-btn");
  if (btn) btn.setAttribute("aria-pressed", String(partyOn));

  if (partyOn) {
    discoBall.visible = true;
    if (!reduceMotion) { orbit.autoRotate = true; orbit.autoRotateSpeed = 3.2; }
    scene.fog.density = 0.02;
    partyStep = 0;
    if (!beatTimer) beatTimer = setInterval(() => { playGroove(partyStep); partyStep++; }, 235);
    launchFireworks();
    showHint("🪩 PARTY MODE! Everyone dance! 💃🕺");
    announce("Party mode on.");
  } else {
    discoBall.visible = false;
    partyLights.forEach((pl) => (pl.intensity = 0));
    orbit.autoRotateSpeed = 0.6;
    orbit.autoRotate = !reduceMotion;
    scene.fog.density = 0.014;
    scene.background.copy(COLOR.bg);
    scene.fog.color.copy(COLOR.bg);
    renderer.toneMappingExposure = 1.15;
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
    showHint("✨ Party paused.");
    announce("Party mode off.");
  }
}

/* ============================================================ *
 *  CUT THE CAKE  (knife sweeps → wedge actually disappears → slice served)
 * ============================================================ */
let knifePivot = null, knife = null;
let sliceCount = 0;
let cutting = false;
const servedSlices = [];

/* a serving plate beside the cake to receive the slices */
const servePlate = new THREE.Mesh(
  new THREE.CylinderGeometry(2.6, 2.8, 0.18, 48),
  new THREE.MeshStandardMaterial({ color: 0xece8f4, roughness: 0.25, metalness: 0.3 })
);
servePlate.position.set(8.5, 0.1, 2.5);
servePlate.receiveShadow = true;
scene.add(servePlate);

function buildKnife() {
  knifePivot = new THREE.Group();
  knifePivot.position.set(0, 6, 0);
  scene.add(knifePivot);

  knife = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 1.3, 0.06),   // long (radial) × tall × thin
    new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.15, metalness: 0.95 })
  );
  blade.position.x = 1.6;
  blade.castShadow = true;
  knife.add(blade);
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 1.0, 12),
    new THREE.MeshStandardMaterial({ color: 0x2e2140, roughness: 0.6 })
  );
  handle.rotation.z = Math.PI / 2;
  handle.position.x = 3.9;
  knife.add(handle);
  knifePivot.add(knife);
  knifePivot.visible = false;
}

/* the wedge removed from the TOP tier only, centred at local y = 0 */
function buildSliceWedge(a0, a1) {
  const grp = new THREE.Group();
  const { r, h, frost } = tierSpecs[2];
  const len = a1 - a0;
  const sponge = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 40, 1, false, a0, len),
    new THREE.MeshStandardMaterial({ color: frost, roughness: 0.45, metalness: 0.04 })
  );
  sponge.castShadow = true;
  grp.add(sponge);
  grp.add(cutWall(r, h, 0, a0, frost));
  grp.add(cutWall(r, h, 0, a1, frost));
  return grp;
}

function cutCake() {
  if (cutting) return;
  cutting = true;
  ensureAudio();
  if (!knifePivot) buildKnife();

  // a fresh cake once the top tier is mostly gone
  if (cutAngle > Math.PI * 1.6) {
    cutAngle = 0;
    buildTiers();
  }

  const top = tierSpecs[2];
  const a0 = cutAngle;
  const a1 = cutAngle + CUT_STEP;

  // slow, cinematic move in close to the top tier
  flyTo(new THREE.Vector3(3.6, 6.6, 4.8), new THREE.Vector3(0, top.y, 0), 1.8);

  const downY = top.y, upY = top.y + 3.4;   // knife cuts through the top tier only
  const KNIFE_OFF = Math.PI / 2;            // align knife to the same radial convention as the wedge
  knifePivot.visible = true;
  knifePivot.position.y = 0;
  knifePivot.rotation.y = a0 - KNIFE_OFF;
  knife.position.y = upY;

  const finish = () => {
    cutAngle = a1;
    buildTiers();                               // the wedge is now truly gone
    playNote(120, 0, 0.25, "sawtooth", 0.1);

    const slice = buildSliceWedge(a0, a1);
    const startPos = new THREE.Vector3(0, top.y, 0);  // exactly where it was
    slice.position.copy(startPos);
    scene.add(slice);
    burstConfettiAt(new THREE.Vector3(0, top.y, 0), 60);
    sliceCount++;
    announce(`Cake cut. Slice number ${sliceCount} served onto the plate.`);   // screen-reader only

    const idx = servedSlices.length;
    const sScale = 0.85;
    const dest = new THREE.Vector3(
      servePlate.position.x + Math.cos(idx * 1.5) * 0.9,
      0.19 + (top.h / 2) * sScale,
      servePlate.position.z + Math.sin(idx * 1.5) * 0.9
    );
    servedSlices.push(slice);
    if (servedSlices.length > 6) { const old = servedSlices.shift(); scene.remove(old); }

    const detach = () => { knifePivot.visible = false; cutting = false; };

    if (reduceMotion) { slice.scale.setScalar(sScale); slice.position.copy(dest); detach(); return; }

    // lift the slice out, arc it over to the plate (slow & smooth)
    const ts = performance.now();
    (function serve() {
      const k = Math.min(1, (performance.now() - ts) / 1500);
      const e = easeInOut(k);
      slice.scale.setScalar(1 - e * (1 - sScale));
      slice.position.set(
        startPos.x + (dest.x - startPos.x) * e,
        startPos.y + (dest.y - startPos.y) * e + Math.sin(e * Math.PI) * 2.6,
        startPos.z + (dest.z - startPos.z) * e
      );
      slice.rotation.y = e * 1.4;
      if (k < 1) requestAnimationFrame(serve);
      else slice.position.copy(dest);
    })();

    // raise the knife back up & away
    const tu = performance.now();
    (function lift() {
      const k = Math.min(1, (performance.now() - tu) / 600);
      knife.position.y = downY + (upY - downY) * easeInOut(k);
      if (k < 1) requestAnimationFrame(lift);
      else detach();
    })();
  };

  if (reduceMotion) { finish(); return; }

  // 1) lower the knife onto the top tier (slow)
  const t0 = performance.now();
  (function lower() {
    const k = Math.min(1, (performance.now() - t0) / 700);
    knife.position.y = upY + (downY - upY) * easeInOut(k);
    if (k < 1) requestAnimationFrame(lower);
    else sweep();
  })();

  // 2) the knife slowly runs across the cake — the real cut
  function sweep() {
    playNote(90, 0, 0.5, "sawtooth", 0.09);
    const t1 = performance.now();
    (function run() {
      const k = Math.min(1, (performance.now() - t1) / 1700);
      knifePivot.rotation.y = (a0 + (a1 - a0) * easeInOut(k)) - KNIFE_OFF;
      if (k < 1) requestAnimationFrame(run);
      else finish();
    })();
  }
}

/* ============================================================ *
 *  PIANO
 * ============================================================ */
const NOTE_FREQ = {
  C4: 261.63, "C#4": 277.18, D4: 293.66, "D#4": 311.13, E4: 329.63,
  F4: 349.23, "F#4": 369.99, G4: 392.0, "G#4": 415.3, A4: 440.0,
  "A#4": 466.16, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
  F5: 698.46, G5: 783.99,
};
const WHITE_KEYS = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
// black key -> index of the white key it sits to the right of
const BLACK_KEYS = [
  { note: "C#4", after: 0 }, { note: "D#4", after: 1 },
  { note: "F#4", after: 3 }, { note: "G#4", after: 4 }, { note: "A#4", after: 5 },
];
const KEY_FOR_LETTER = {
  a: "C4", w: "C#4", s: "D4", e: "D#4", d: "E4", f: "F4",
  t: "F#4", g: "G4", y: "G#4", h: "A4", u: "A#4", j: "B4", k: "C5",
};
let pianoOpen = false;
const keyEls = {};

function buildPiano() {
  const wrap = $("piano-keys");
  WHITE_KEYS.forEach((note, i) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "pkey pkey--white";
    el.dataset.note = note;
    el.textContent = note.replace(/\d/, "");
    el.setAttribute("aria-label", `Piano key ${note}`);
    wrap.appendChild(el);
    keyEls[note] = el;
  });
  // place black keys by percentage across the white-key row
  const whiteW = 100 / WHITE_KEYS.length;
  BLACK_KEYS.forEach(({ note, after }) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "pkey pkey--black";
    el.dataset.note = note;
    el.style.left = `${(after + 1) * whiteW}%`;
    el.setAttribute("aria-label", `Piano key ${note}`);
    wrap.appendChild(el);
    keyEls[note] = el;
  });

  wrap.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".pkey");
    if (!el) return;
    e.preventDefault();
    pressKey(el.dataset.note);
  });
}

function pianoTone(freq, dur = 1.1, gain = 0.22) {
  ensureAudio();
  if (!soundOn || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const g = audioCtx.createGain();
  g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  // two oscillators for a warmer, piano-ish timbre
  [["triangle", 1, 1], ["sine", 2, 0.4]].forEach(([type, mult, lvl]) => {
    const o = audioCtx.createOscillator();
    const og = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq * mult;
    og.gain.value = lvl;
    o.connect(og); og.connect(g);
    o.start(t0); o.stop(t0 + dur + 0.05);
  });
}
function flashKey(note) {
  const el = keyEls[note];
  if (!el) return;
  el.classList.add("is-active");
  setTimeout(() => el.classList.remove("is-active"), 180);
}
function pressKey(note) {
  if (!NOTE_FREQ[note]) return;
  pianoTone(NOTE_FREQ[note]);
  flashKey(note);
}
let songTimers = [];
function playHappyBirthday() {
  ensureAudio();
  songTimers.forEach(clearTimeout);
  songTimers = [];
  // (note, beats)  — "Happy Birthday to You" in C
  const song = [
    ["G4", 0.5], ["G4", 0.5], ["A4", 1], ["G4", 1], ["C5", 1], ["B4", 2],
    ["G4", 0.5], ["G4", 0.5], ["A4", 1], ["G4", 1], ["D5", 1], ["C5", 2],
    ["G4", 0.5], ["G4", 0.5], ["G5", 1], ["E5", 1], ["C5", 1], ["B4", 1], ["A4", 2],
    ["F5", 0.5], ["F5", 0.5], ["E5", 1], ["C5", 1], ["D5", 1], ["C5", 2],
  ];
  const beat = 0.42; // seconds per beat
  let t = 0;
  song.forEach(([note, beats]) => {
    const freq = NOTE_FREQ[note];
    songTimers.push(setTimeout(() => { pianoTone(freq, beats * beat * 1.1, 0.24); flashKey(note); }, t * 1000));
    t += beats * beat;
  });
  songTimers.push(setTimeout(() => { celebrate(false); }, t * 1000 + 200));
  showHint("🎵 Singing Happy Birthday…");
  announce("Playing Happy Birthday on the piano.");
}
function togglePiano(force) {
  pianoOpen = force !== undefined ? force : !pianoOpen;
  $("piano").hidden = !pianoOpen;
  const btn = $("piano-btn");
  btn.setAttribute("aria-pressed", String(pianoOpen));
  if (pianoOpen) { ensureAudio(); showHint("🎹 Play with mouse or keys A S D F G H J K"); }
}

/* ============================================================ *
 *  BOOT
 * ============================================================ */
function boot() {
  cardModal = $("card-modal");
  cardText = $("card-modal-text");
  cardEmoji = $("card-modal-emoji");
  cardTitle = $("card-modal-title");
  setupContent();
  renderCountdown();
  buildPiano();
  applyMotionPref();
  wireControls();
  clockDelta();          // prime the delta timer
  tick();
  requestAnimationFrame(() => {
    setTimeout(() => {
      loader.classList.add("is-hidden");
      startGate.hidden = false;
      $("start-btn").focus({ preventScroll: true });
      announce(`A birthday surprise for ${CFG.name} is ready. Press the button to open it.`);
    }, 700);
  });
}
boot();
