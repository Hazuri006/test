/* ============================================================
   Stages — six arenas, all procedurally generated.
   Environment geometry uses MeshToonMaterial + real lights so it
   can be instanced; fighters use the custom cel shader.
   ============================================================ */
import * as THREE from 'three';
import { createSky } from '../graphics/sky.js';
import { ENV } from '../graphics/materials.js';
import { groundMap, sprites } from '../graphics/textures.js';
import { rand, randInt, TAU, clamp } from '../core/utils.js';

/* ---------------- shared helpers ---------------- */

let gradCache = null;
function gradientMap(steps = 3) {
  if (gradCache) return gradCache;
  const c = document.createElement('canvas');
  c.width = steps; c.height = 1;
  const ctx = c.getContext('2d');
  const vals = steps === 3 ? [78, 176, 255] : [90, 255];
  for (let i = 0; i < steps; i++) {
    ctx.fillStyle = `rgb(${vals[i]},${vals[i]},${vals[i]})`;
    ctx.fillRect(i, 0, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  gradCache = t;
  return t;
}

function toonMat(color, opts = {}) {
  return new THREE.MeshToonMaterial({
    color, gradientMap: gradientMap(3), fog: true, ...opts,
  });
}

/** world-space planar UVs — radial caps otherwise fan the tile pattern out */
function planarUV(geo, scale = 8) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / scale, pos.getZ(i) / scale);
  uv.needsUpdate = true;
  return geo;
}

/* deterministic 2D value noise, for terrain relief and ground tinting */
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function fbm2(x, y, oct = 4) {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    v += noise2(x * f, y * f) * amp;
    tot += amp; f *= 2.03; amp *= 0.5;
  }
  return v / tot;
}

/**
 * Layered rock: horizontal strata plus a wind-carved lean. Plain displaced
 * icospheres read as potatoes.
 */
function crag(seed = 1) {
  const g = new THREE.CylinderGeometry(0.62, 1, 1, 9, 6);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  let s = seed * 7919;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const lean = (rnd() - 0.5) * 0.5;
  const bands = [];
  for (let i = 0; i < 8; i++) bands.push(0.82 + rnd() * 0.36);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const band = bands[Math.min(bands.length - 1, Math.floor(v.y * bands.length))];
    const a = Math.atan2(v.z, v.x);
    const ripple = 1 + Math.sin(a * 5 + v.y * 9) * 0.09 + Math.sin(a * 11) * 0.05;
    v.x *= band * ripple; v.z *= band * ripple;
    v.x += lean * v.y * v.y;              // topples slightly with height
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function rockGeo(seed = 1, detail = 0) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  let s = seed * 1013;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 0.84 + rnd() * 0.3;
    v.multiplyScalar(n);
    v.y *= 1.12;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function instanced(geo, mat, list) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let colored = false;
  list.forEach((it, i) => {
    d.position.set(it.p[0], it.p[1], it.p[2]);
    d.rotation.set(it.r?.[0] ?? 0, it.r?.[1] ?? 0, it.r?.[2] ?? 0);
    const s = it.s ?? 1;
    d.scale.set(...(Array.isArray(s) ? s : [s, s, s]));
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    if (it.c !== undefined) { col.set(it.c); m.setColorAt(i, col); colored = true; }
  });
  m.instanceMatrix.needsUpdate = true;
  if (colored && m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = false; m.receiveShadow = false;
  return m;
}

/** looping ambient motes (dust, embers, petals, snow) */
class Motes {
  constructor(cfg) {
    const n = cfg.count ?? 220;
    this.cfg = cfg;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-cfg.range, cfg.range);
      pos[i * 3 + 1] = rand(0, cfg.height);
      pos[i * 3 + 2] = rand(-cfg.range, cfg.range);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: sprites().glow },
        uColor: { value: new THREE.Color(cfg.color ?? 0xffd9a0) },
        uSize: { value: cfg.size ?? 26 },
        uHeight: { value: cfg.height },
        uRise: { value: cfg.rise ?? 1.2 },
        uSway: { value: cfg.sway ?? 1.0 },
        uOpacity: { value: cfg.opacity ?? 0.75 },
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime, uSize, uHeight, uRise, uSway;
        varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * uRise + aSeed * 40.0;
          p.y = mod(p.y + t, uHeight);
          p.x += sin(t * 0.7 + aSeed * 12.0) * uSway;
          p.z += cos(t * 0.6 + aSeed * 9.0) * uSway;
          vA = smoothstep(0.0, 0.18, p.y / uHeight) * smoothstep(1.0, 0.6, p.y / uHeight);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(uSize * (0.5 + aSeed) / max(-mv.z, 0.1), 1.0, 90.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
        varying float vA;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(uColor * t.rgb, t.a * vA * uOpacity);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  update(dt) { this.material.uniforms.uTime.value += dt; }
}

/* ---------------- stage definitions ---------------- */

export const STAGES = [
  { id: 'wasteland', name: 'TERRES BRISÉES', sub: 'Plaine rocheuse — crépuscule' },
  { id: 'city', name: 'CITÉ EN RUINES', sub: 'Métropole — nuit' },
  { id: 'sanctuary', name: 'SANCTUAIRE CÉLESTE', sub: 'Îles flottantes — aube' },
  { id: 'arena', name: 'ARÈNE DU TOURNOI', sub: 'Grand ring — plein jour' },
  { id: 'volcano', name: 'CRATÈRE ARDENT', sub: 'Caldeira — éruption' },
  { id: 'void', name: 'FAILLE TEMPORELLE', sub: 'Hors du temps' },
];

export function buildStage(id, scene) {
  const g = new THREE.Group();
  const updaters = [];
  const stage = {
    id, group: g, radius: 68, ceiling: 46, groundY: 0,
    music: 'battle', update: (dt) => updaters.forEach((f) => f(dt)),
  };

  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.45);
  g.add(dir, hemi);

  const setLight = (c) => {
    ENV.lightDir.copy(c.lightDir).normalize();
    ENV.lightColor.set(c.lightColor);
    ENV.skyColor.set(c.skyColor);
    ENV.groundColor.set(c.groundColor);
    ENV.ambient = c.ambient ?? 0.55;
    ENV.rimColor.set(c.rimColor ?? 0xbfe4ff);
    ENV.fogColor.set(c.fogColor);
    dir.position.copy(ENV.lightDir).multiplyScalar(50);
    dir.color.set(c.lightColor);
    dir.intensity = c.dirIntensity ?? 1.05;
    hemi.color.set(c.skyColor);
    hemi.groundColor.set(c.groundColor);
    hemi.intensity = c.hemiIntensity ?? 0.42;
    scene.fog = new THREE.FogExp2(c.fogColor, (c.fogDensity ?? 0.0055) * 0.62);
    scene.background = null;
  };

  /**
   * Ground = a perfectly flat arena disc (gameplay depends on that) plus a
   * displaced outer apron that rises with distance. A single flat disc to the
   * horizon is what made every stage read as a tabletop.
   * Large-scale vertex colour on top of the tiling map breaks the repeat.
   */
  const addGround = (kind, tint, repeat, radius = 130, opts = {}) => {
    const flat = Math.min(radius, (opts.flat ?? stage.radius + 10));
    const relief = opts.relief ?? 9;
    // planar UVs already carry the tiling, so the map itself must stay at
    // repeat 1 — otherwise the two multiply and the ground moirés
    const mat = toonMat(0xffffff, {
      map: groundMap(kind, tint, 1),
      vertexColors: true,
    });
    const group = new THREE.Group();

    const tintVertices = (geo, amount = 0.11) => {
      const p = geo.attributes.position;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const n = fbm2(p.getX(i) * 0.014, p.getZ(i) * 0.014, 3);
        const k = 1 + (n - 0.5) * 2 * amount;
        col[i * 3] = k; col[i * 3 + 1] = k * (1 - (n - 0.5) * 0.06); col[i * 3 + 2] = k * (1 - (n - 0.5) * 0.12);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    };
    const planar = (geo, sc) => {
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / sc, p.getZ(i) / sc);
      uv.needsUpdate = true;
      return geo;
    };
    const texScale = opts.tile ?? 5.5;   // world units per texture tile

    // subdivided ring, not CircleGeometry: a triangle fan has one centre
    // vertex, so per-vertex tinting bleeds outward as radial wedges
    const inner = new THREE.RingGeometry(0.02, flat, 96, 18);
    inner.rotateX(-Math.PI / 2);
    group.add(new THREE.Mesh(tintVertices(planar(inner, texScale)), mat));

    if (radius > flat + 1) {
      const outer = new THREE.RingGeometry(flat, radius, 108, 28);
      outer.rotateX(-Math.PI / 2);
      const p = outer.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        const r = Math.hypot(x, z);
        // ramp the displacement in so the arena edge stays seamless
        const k = Math.min(1, (r - flat) / Math.max(1, radius - flat) * 2.2);
        const h = (fbm2(x * 0.009, z * 0.009, 4) - 0.45) * relief
                + (fbm2(x * 0.035, z * 0.035, 3) - 0.5) * relief * 0.28;
        p.setY(i, h * k * k);
      }
      outer.computeVertexNormals();
      group.add(new THREE.Mesh(tintVertices(planar(outer, texScale)), mat));
    }
    g.add(group);
    return group;
  };

  /** distant silhouette ridges — cheap aerial perspective through the fog */
  const addRidges = (color, rings = [[300, 26, 55], [430, 40, 30]]) => {
    const geo = new THREE.ConeGeometry(1, 1, 5, 1);
    geo.translate(0, 0.5, 0);
    for (const [dist, height, count] of rings) {
      const list = [];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU + rand(-0.05, 0.05);
        const r = dist * rand(0.86, 1.18);
        const h = height * rand(0.5, 1.5);
        list.push({
          p: [Math.cos(a) * r, -height * 0.15, Math.sin(a) * r],
          r: [0, rand(0, TAU), 0],
          s: [h * rand(1.1, 2.3), h, h * rand(1.1, 2.3)],
          c: new THREE.Color(color).offsetHSL(0, 0, rand(-0.04, 0.04)).getHex(),
        });
      }
      g.add(instanced(geo, toonMat(0xffffff), list));
    }
  };

  switch (id) {
    /* ------------------------------------------------ */
    case 'wasteland': {
      setLight({
        lightDir: new THREE.Vector3(-0.5, 0.62, 0.35),
        lightColor: 0xffe3c4, skyColor: 0x7f9ade, groundColor: 0x5a4a4e,
        ambient: 0.75, hemiIntensity: 0.6, rimColor: 0xffd0a0, fogColor: 0x6f5460, fogDensity: 0.0030,
      });
      g.add(createSky({
        top: 0x123a86, mid: 0xdc8a55, bottom: 0xffc46a,
        sunDir: new THREE.Vector3(-0.5, 0.16, 0.35), sunColor: 0xfff0c8,
        sunSize: 0.016, sunGlow: 120, clouds: 0.85, cloudColor: 0xffdcb0, cloudDark: 0x6d4a63,
      }));
      addGround('rock', 0x8a7368, 42, 340, { relief: 16 });
      addRidges(0x6a5560, [[300, 30, 52], [440, 46, 34]]);

      const rocks = [];
      for (let i = 0; i < 46; i++) {
        const a = rand(0, TAU), r = rand(40, 118);
        const s = rand(1.8, 6.5);
        rocks.push({
          p: [Math.cos(a) * r, -0.4, Math.sin(a) * r],
          r: [rand(-0.06, 0.06), rand(0, TAU), rand(-0.06, 0.06)],
          s: [s * rand(0.7, 1.2), s * rand(1.1, 2.4), s * rand(0.7, 1.2)],
          c: new THREE.Color(0x7d6a5e).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.07, 0.07)).getHex(),
        });
      }
      g.add(instanced(crag(3), toonMat(0xffffff), rocks));

      // far mesas
      const mesas = [];
      for (let i = 0; i < 18; i++) {
        const a = rand(0, TAU), r = rand(150, 300);
        mesas.push({
          p: [Math.cos(a) * r, rand(-4, 0), Math.sin(a) * r],
          r: [0, rand(0, TAU), 0],
          s: [rand(12, 28), rand(14, 44), rand(12, 28)],
          c: 0x6b5a5c,
        });
      }
      g.add(instanced(new THREE.CylinderGeometry(0.62, 1.2, 1, 6, 1), toonMat(0xffffff), mesas));

      // small stones scattered on the field
      const pebbles = [];
      for (let i = 0; i < 90; i++) {
        const a = rand(0, TAU), r = rand(4, 60);
        pebbles.push({
          p: [Math.cos(a) * r, 0.1, Math.sin(a) * r],
          r: [rand(0, 1), rand(0, TAU), rand(0, 1)],
          s: rand(0.2, 0.9), c: 0x7f6c60,
        });
      }
      g.add(instanced(rockGeo(9, 0), toonMat(0xffffff), pebbles));

      const motes = new Motes({ count: 260, range: 70, height: 30, color: 0xffd8a0, size: 20, rise: 1.6, sway: 1.6, opacity: 0.5 });
      g.add(motes.points); updaters.push((dt) => motes.update(dt));
      stage.radius = 72;
      break;
    }

    /* ------------------------------------------------ */
    case 'city': {
      setLight({
        lightDir: new THREE.Vector3(0.3, 0.7, -0.5),
        lightColor: 0xd6e2ff, skyColor: 0x4a5c96, groundColor: 0x1c2238,
        ambient: 0.72, rimColor: 0x9fe0ff, fogColor: 0x1a2442, fogDensity: 0.0044,
        dirIntensity: 1.55, hemiIntensity: 0.6,
      });
      g.add(createSky({
        top: 0x080e22, mid: 0x1c2a54, bottom: 0x3a4a78,
        sunDir: new THREE.Vector3(0.3, 0.45, -0.5), sunColor: 0xdfe8ff,
        sunSize: 0.02, sunGlow: 90, clouds: 0.45, cloudColor: 0x6a7ba8, cloudDark: 0x1a2340,
        stars: 0.7,
      }));
      addGround('stone', 0x63697c, 46, 300, { relief: 5 });

      const mat = toonMat(0xffffff);
      const box = new THREE.BoxGeometry(1, 1, 1);
      const towers = [], windows = [];
      for (let i = 0; i < 70; i++) {
        const a = rand(0, TAU), r = rand(34, 190);
        const w = rand(6, 16), h = rand(12, 78), d = rand(6, 16);
        const broken = Math.random() < 0.45;
        towers.push({
          p: [Math.cos(a) * r, h / 2 - (broken ? h * 0.2 : 0), Math.sin(a) * r],
          r: [broken ? rand(-0.12, 0.12) : 0, rand(0, TAU), broken ? rand(-0.12, 0.12) : 0],
          s: [w, h, d],
          c: new THREE.Color(0x4c5478).offsetHSL(rand(-0.03, 0.03), 0, rand(-0.06, 0.08)).getHex(),
        });
        // neon strip
        if (Math.random() < 0.85) {
          windows.push({
            p: [Math.cos(a) * r, rand(6, h), Math.sin(a) * r],
            r: [0, rand(0, TAU), 0],
            s: [w * 1.04, rand(0.35, 1.1), d * 1.04],
            c: [0x37e0ff, 0xff4f8b, 0xffd23c, 0x7dff9b][randInt(0, 3)],
          });
        }
      }
      g.add(instanced(box, mat, towers));
      // over-unity colour so the strips punch through the bloom threshold
      const neon = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false });
      neon.color.setRGB(2.6, 2.6, 2.6, THREE.LinearSRGBColorSpace);
      g.add(instanced(box, neon, windows));

      // street rubble
      const rubble = [];
      for (let i = 0; i < 120; i++) {
        const a = rand(0, TAU), r = rand(5, 60);
        rubble.push({
          p: [Math.cos(a) * r, 0.2, Math.sin(a) * r],
          r: [rand(0, 1), rand(0, TAU), rand(0, 1)],
          s: rand(0.3, 1.6), c: 0x525a74,
        });
      }
      g.add(instanced(rockGeo(4, 0), mat, rubble));

      const motes = new Motes({ count: 200, range: 60, height: 34, color: 0x7fd8ff, size: 18, rise: 0.8, sway: 1.2, opacity: 0.45 });
      g.add(motes.points); updaters.push((dt) => motes.update(dt));
      stage.radius = 66;
      break;
    }

    /* ------------------------------------------------ */
    case 'sanctuary': {
      setLight({
        lightDir: new THREE.Vector3(0.35, 0.75, 0.5),
        lightColor: 0xfff6ec, skyColor: 0xbadcff, groundColor: 0x5a7a4a,
        ambient: 0.72, rimColor: 0xffe0f0, fogColor: 0xcadcf2, fogDensity: 0.0032,
      });
      g.add(createSky({
        top: 0x2470d0, mid: 0x9ad2f6, bottom: 0xffbcd6,
        sunDir: new THREE.Vector3(0.35, 0.35, 0.5), sunColor: 0xfff4d8,
        sunSize: 0.014, clouds: 0.85, cloudColor: 0xffffff, cloudDark: 0xc8b8d8,
      }));
      addGround('grass', 0x6a9455, 58, 320, { relief: 13 });
      addRidges(0x7f96a8, [[280, 34, 46], [420, 52, 30]]);

      // floating islands
      const isl = [];
      for (let i = 0; i < 22; i++) {
        const a = rand(0, TAU), r = rand(70, 200);
        isl.push({
          p: [Math.cos(a) * r, rand(-24, 34), Math.sin(a) * r],
          r: [rand(-0.1, 0.1), rand(0, TAU), rand(-0.1, 0.1)],
          s: [rand(6, 22), rand(5, 16), rand(6, 22)],
          c: 0x8a9a6a,
        });
      }
      const islGeo = new THREE.ConeGeometry(1, 2, 9, 1);
      islGeo.rotateZ(Math.PI);
      islGeo.translate(0, 0.6, 0);
      g.add(instanced(islGeo, toonMat(0xffffff), isl));
      // grassy cap so floating rocks don't read as dark hanging spikes
      const capG = new THREE.CylinderGeometry(1.02, 1.02, 0.14, 9);
      capG.translate(0, 0.62, 0);
      g.add(instanced(capG, toonMat(0x7fc061), isl.map((it) => ({ ...it, c: undefined }))));

      // giant tree
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(2.4, 5.2, 40, 12, 3),
        toonMat(0x6a4a32)
      );
      trunk.position.set(-46, 20, -52);
      g.add(trunk);
      for (let i = 0; i < 8; i++) {
        const leaf = new THREE.Mesh(
          new THREE.IcosahedronGeometry(rand(7, 14), 1),
          toonMat(new THREE.Color(0x7fd06a).offsetHSL(rand(-0.03, 0.03), 0, rand(-0.06, 0.06)))
        );
        leaf.position.set(-46 + rand(-14, 14), 38 + rand(-6, 12), -52 + rand(-14, 14));
        leaf.scale.y = 0.75;
        g.add(leaf);
      }

      // stone pillars ringing the arena
      const pil = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        pil.push({ p: [Math.cos(a) * 54, 5, Math.sin(a) * 54], r: [0, a, 0], s: [1.6, 10, 1.6], c: 0xe0dcc8 });
      }
      g.add(instanced(new THREE.CylinderGeometry(1, 1.15, 1, 10), toonMat(0xffffff), pil));

      const motes = new Motes({ count: 300, range: 66, height: 26, color: 0xffd8f0, size: 22, rise: 0.5, sway: 2.4, opacity: 0.7 });
      g.add(motes.points); updaters.push((dt) => motes.update(dt));
      stage.radius = 62;
      break;
    }

    /* ------------------------------------------------ */
    case 'arena': {
      setLight({
        lightDir: new THREE.Vector3(0.2, 0.92, 0.25),
        lightColor: 0xffffff, skyColor: 0x9fc8ff, groundColor: 0x8a7a5a,
        ambient: 0.78, rimColor: 0xdff0ff, fogColor: 0xc4dcf4, fogDensity: 0.0028,
      });
      g.add(createSky({
        top: 0x0f4fc0, mid: 0x74b4ef, bottom: 0xdcefff,
        sunDir: new THREE.Vector3(0.2, 0.8, 0.25), sunColor: 0xffffe8,
        sunSize: 0.01, clouds: 0.6, cloudColor: 0xffffff, cloudDark: 0xa8bcd8,
      }));

      // sunken ring
      addGround('sand', 0xd8c090, 44, 330, { flat: 96, relief: 11 });
      addRidges(0xb8a684, [[300, 26, 44], [450, 40, 28]]);
      const ringGeo = planarUV(new THREE.CylinderGeometry(46, 48, 2.4, 64, 1), 7);
      const ringMap = groundMap('stone', 0xd0c8b0, 1);
      const ring = new THREE.Mesh(ringGeo, toonMat(0xffffff, { map: ringMap }));
      ring.position.y = -1.17;   // clear of the sand disc at y=0
      g.add(ring);
      const border = new THREE.Mesh(new THREE.TorusGeometry(46.5, 0.9, 8, 72), toonMat(0xf0e8d0));
      border.rotation.x = Math.PI / 2;
      border.position.y = 0.1;
      g.add(border);

      // tiered stands
      const stands = [];
      for (let t = 0; t < 7; t++) {
        stands.push({ p: [0, 1.6 + t * 2.4, 0], s: [56 + t * 5, 2.4, 56 + t * 5], c: 0xd8cfae });
      }
      const standGeo = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true);
      g.add(instanced(standGeo, toonMat(0xffffff, { side: THREE.DoubleSide }), stands));

      // crowd
      const crowd = [];
      const palette = [0xff6b4a, 0x4a9fff, 0xffd23c, 0x7dff9b, 0xff89c4, 0xf0f0f0, 0x9d6bff];
      for (let t = 0; t < 7; t++) {
        const r = 58 + t * 5;
        const n = Math.floor(r * 1.6);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rand(-0.02, 0.02);
          crowd.push({
            p: [Math.cos(a) * r, 3.4 + t * 2.4, Math.sin(a) * r],
            r: [0, -a, 0], s: rand(0.72, 1.0),
            c: palette[randInt(0, palette.length - 1)],
          });
        }
      }
      const person = new THREE.CapsuleGeometry(0.34, 0.9, 3, 7);
      const crowdMesh = instanced(person, toonMat(0xffffff), crowd);
      g.add(crowdMesh);
      let ct = 0;
      updaters.push((dt) => { ct += dt; crowdMesh.position.y = Math.sin(ct * 2.2) * 0.09; });

      // banners
      const bann = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        bann.push({ p: [Math.cos(a) * 51, 12, Math.sin(a) * 51], r: [0, -a, 0], s: [3, 9, 0.3],
          c: [0xd82a2a, 0x2a5ad8, 0xd8b02a][i % 3] });
      }
      g.add(instanced(new THREE.BoxGeometry(1, 1, 1), toonMat(0xffffff), bann));

      stage.radius = 44; stage.ceiling = 40;
      break;
    }

    /* ------------------------------------------------ */
    case 'volcano': {
      setLight({
        lightDir: new THREE.Vector3(-0.3, 0.55, -0.4),
        lightColor: 0xffd0aa, skyColor: 0xb05038, groundColor: 0x4a221a,
        ambient: 0.78, hemiIntensity: 0.7, rimColor: 0xff8a3c,
        fogColor: 0x5a2620, fogDensity: 0.0058, dirIntensity: 1.5,
      });
      g.add(createSky({
        top: 0x2e1016, mid: 0x8a2c1c, bottom: 0xe0641e,
        sunDir: new THREE.Vector3(-0.3, 0.12, -0.4), sunColor: 0xffb060,
        sunSize: 0.02, sunGlow: 60, clouds: 0.9, cloudColor: 0xff9050, cloudDark: 0x2a0c0a,
      }));
      addGround('rock', 0x4a3430, 44, 300, { relief: 14 });

      // lava pools
      const lavaMat = new THREE.MeshBasicMaterial({
        map: groundMap('lava', 0xff5a1e, 6), toneMapped: false, fog: true,
      });
      for (let i = 0; i < 9; i++) {
        const a = rand(0, TAU), r = rand(30, 100);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(rand(6, 20), 24), lavaMat);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(Math.cos(a) * r, 0.06, Math.sin(a) * r);
        g.add(pool);
      }
      let lt = 0;
      updaters.push((dt) => {
        lt += dt;
        if (lavaMat.map) { lavaMat.map.offset.y = lt * 0.02; lavaMat.map.offset.x = Math.sin(lt * 0.2) * 0.02; }
      });

      const rocks = [];
      for (let i = 0; i < 54; i++) {
        const a = rand(0, TAU), r = rand(38, 130);
        const s = rand(2.0, 7.5);
        rocks.push({
          p: [Math.cos(a) * r, -0.4, Math.sin(a) * r],
          r: [rand(-0.08, 0.08), rand(0, TAU), rand(-0.08, 0.08)],
          s: [s * 0.85, s * rand(1.2, 2.6), s * 0.85],
          c: new THREE.Color(0x2e2220).offsetHSL(0, 0, rand(-0.03, 0.05)).getHex(),
        });
      }
      g.add(instanced(crag(7), toonMat(0xffffff), rocks));

      // caldera walls
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(230, 200, 120, 44, 1, true),
        toonMat(0x4a2c24, { side: THREE.BackSide })
      );
      wall.position.y = 30;
      g.add(wall);

      const embers = new Motes({ count: 420, range: 80, height: 44, color: 0xff8020, size: 26, rise: 3.4, sway: 2.2, opacity: 0.85 });
      g.add(embers.points); updaters.push((dt) => embers.update(dt));
      stage.radius = 70;
      break;
    }

    /* ------------------------------------------------ */
    case 'void': {
      setLight({
        lightDir: new THREE.Vector3(0.4, 0.6, -0.4),
        lightColor: 0xded0ff, skyColor: 0x4a3a7a, groundColor: 0x120c28,
        ambient: 0.6, rimColor: 0xc8a0ff, fogColor: 0x0e0822, fogDensity: 0.0045,
        dirIntensity: 1.2,
      });
      g.add(createSky({
        top: 0x05030f, mid: 0x160a2e, bottom: 0x2a1050,
        sunDir: new THREE.Vector3(0.4, 0.3, -0.4), sunColor: 0xd8b0ff,
        sunSize: 0.03, sunGlow: 40, clouds: 0,
        stars: 1.0, nebula: 0.85, nebulaColor: 0x8a3fd0,
      }));

      // shattered platform
      const plat = new THREE.Mesh(
        new THREE.CylinderGeometry(42, 36, 4, 9, 1),
        toonMat(0xffffff, { map: groundMap('crystal', 0x5a4a8a, 8) })
      );
      plat.position.y = -2;
      g.add(plat);
      const glowRing = new THREE.Mesh(
        new THREE.TorusGeometry(42, 0.28, 8, 90),
        new THREE.MeshBasicMaterial({ color: 0x8a5fe0, toneMapped: false })
      );
      glowRing.rotation.x = Math.PI / 2;
      glowRing.position.y = 0.05;
      g.add(glowRing);
      stage.groundY = 0;

      // orbiting debris
      const shards = [];
      for (let i = 0; i < 60; i++) {
        const a = rand(0, TAU), r = rand(50, 190), y = rand(-40, 50);
        shards.push({
          p: [Math.cos(a) * r, y, Math.sin(a) * r],
          r: [rand(0, TAU), rand(0, TAU), rand(0, TAU)],
          s: [rand(1.5, 9), rand(1.5, 14), rand(1.5, 9)],
          c: new THREE.Color(0x4a3a7a).offsetHSL(rand(-0.05, 0.05), 0, rand(-0.05, 0.1)).getHex(),
        });
      }
      const shardMesh = instanced(new THREE.OctahedronGeometry(1, 0), toonMat(0xffffff), shards);
      g.add(shardMesh);
      let vt = 0;
      updaters.push((dt) => { vt += dt; shardMesh.rotation.y = vt * 0.035; });

      // barrier dome
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(78, 32, 24),
        new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x9a6bff) } },
          vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
            void main(){ vP=position; vec4 wp=modelMatrix*vec4(position,1.0);
            vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz);
            gl_Position=projectionMatrix*viewMatrix*wp; }`,
          fragmentShader: `uniform float uTime; uniform vec3 uColor;
            varying vec3 vP; varying vec3 vN; varying vec3 vV;
            void main(){
              float f=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.4);
              float grid=step(0.972,max(sin(vP.y*0.42+uTime*0.4),sin(atan(vP.z,vP.x)*14.0)));
              gl_FragColor=vec4(uColor*(f*1.4+grid*0.5), f*0.32+grid*0.14);
            }`,
          transparent: true, depthWrite: false, side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
        })
      );
      g.add(dome);
      updaters.push((dt) => { dome.material.uniforms.uTime.value += dt; });

      const motes = new Motes({ count: 340, range: 70, height: 60, color: 0xc8a0ff, size: 20, rise: 0.7, sway: 2.8, opacity: 0.6 });
      g.add(motes.points); updaters.push((dt) => motes.update(dt));
      stage.radius = 40; stage.ceiling = 52;
      break;
    }
  }

  scene.add(g);
  return stage;
}

/** tiny preview render used by the stage-select cards */
export function stagePreviewColors(id) {
  switch (id) {
    case 'wasteland': return ['#e8b878', '#9fb0d8', '#8a6a4c'];
    case 'city': return ['#1c2a54', '#37e0ff', '#39405a'];
    case 'sanctuary': return ['#ffd8e8', '#bfe0f8', '#7fd06a'];
    case 'arena': return ['#e0f0ff', '#8fc0f0', '#d8c090'];
    case 'volcano': return ['#d85a1e', '#6a1e14', '#2e2220'];
    case 'void': return ['#2a1050', '#8a3fd0', '#5a4a8a'];
    default: return ['#888', '#555', '#333'];
  }
}
