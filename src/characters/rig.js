/* ============================================================
   Rig — builds a stylised humanoid out of primitives.
   No external models: bones are plain Object3Ds, meshes are
   parented to them, so posing == setting euler angles.
   ============================================================ */
import * as THREE from 'three';
import { createToonMaterial, createOutlineMaterial, createAuraMaterial } from '../graphics/materials.js';
import { TAU, rand } from '../core/utils.js';

/* ---------------- face texture ---------------- */

const faceCache = new Map();
export function faceTexture(opts = {}) {
  const key = JSON.stringify(opts);
  if (faceCache.has(key)) return faceCache.get(key);

  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const cx = W * 0.25;         // +Z faces u = 0.25
  const eyeY = H * 0.46;
  const eyeDx = W * 0.052;
  const eye = opts.eyeColor ?? '#2a3550';
  const brow = opts.browColor ?? '#1a1410';
  const angry = opts.angry ?? 0.35;
  const lash = opts.lashes ?? false;

  const drawEye = (sx) => {
    const x = cx + sx * eyeDx;
    ctx.save();
    ctx.translate(x, eyeY);
    ctx.scale(sx, 1);
    // sclera
    ctx.fillStyle = '#f7fbff';
    ctx.beginPath();
    ctx.moveTo(-15, 2);
    ctx.quadraticCurveTo(-10, -13, 8, -12);
    ctx.quadraticCurveTo(17, -10, 17, 3);
    ctx.quadraticCurveTo(6, 12, -15, 2);
    ctx.closePath(); ctx.fill();
    // iris
    ctx.fillStyle = eye;
    ctx.beginPath(); ctx.ellipse(2, -1, 7.5, 9.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0b0f1a';
    ctx.beginPath(); ctx.ellipse(2, -1, 3.6, 6.2, 0, 0, TAU); ctx.fill();
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath(); ctx.ellipse(-1.5, -5, 2.6, 3.2, 0, 0, TAU); ctx.fill();
    // upper lid line
    ctx.strokeStyle = brow; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-16, 1);
    ctx.quadraticCurveTo(-9, -15, 9, -13.5);
    ctx.quadraticCurveTo(16, -12, 18, -3);
    ctx.stroke();
    if (lash) {
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(17, -6); ctx.lineTo(25, -11); ctx.stroke();
    }
    ctx.restore();
  };

  const drawBrow = (sx) => {
    const x = cx + sx * eyeDx;
    ctx.save();
    ctx.translate(x, eyeY - H * 0.085);
    ctx.scale(sx, 1);
    ctx.rotate(angry * 0.5);
    ctx.fillStyle = brow;
    ctx.beginPath();
    ctx.moveTo(-16, 2);
    ctx.quadraticCurveTo(0, -7, 18, -1);
    ctx.quadraticCurveTo(0, -1.5, -16, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  drawEye(-1); drawEye(1);
  drawBrow(-1); drawBrow(1);

  // nose + mouth
  ctx.strokeStyle = 'rgba(60,35,25,.55)';
  ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 3, eyeY + 16); ctx.lineTo(cx + 7, eyeY + 22);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(70,30,30,.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (opts.smirk) {
    ctx.moveTo(cx - 12, eyeY + 36);
    ctx.quadraticCurveTo(cx, eyeY + 40, cx + 14, eyeY + 31);
  } else {
    ctx.moveTo(cx - 11, eyeY + 35);
    ctx.quadraticCurveTo(cx, eyeY + 38, cx + 11, eyeY + 35);
  }
  ctx.stroke();

  if (opts.scar) {
    ctx.strokeStyle = 'rgba(150,70,60,.75)'; ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(cx - 34, eyeY - 26); ctx.lineTo(cx - 26, eyeY + 12);
    ctx.stroke();
  }
  if (opts.marks) {
    ctx.fillStyle = opts.marks;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      ctx.beginPath();
      ctx.ellipse(cx + s * W * 0.085, eyeY + 4, 4, 12, s * 0.2, 0, TAU);
      ctx.fill();
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  faceCache.set(key, t);
  return t;
}

/* ---------------- geometry helpers ---------------- */

const geoCache = new Map();
function cachedGeo(key, fn) {
  if (!geoCache.has(key)) geoCache.set(key, fn());
  return geoCache.get(key);
}

function capsule(r, len, key) {
  return cachedGeo(`cap:${key}`, () => {
    const g = new THREE.CapsuleGeometry(r, len, 4, 14);
    g.translate(0, -len / 2 - r * 0.0, 0);
    return g;
  });
}

function torsoGeometry(build) {
  return cachedGeo(`torso:${build}`, () => {
    // lathe profile from waist (y=0) to neck (y=0.36)
    const wide = build === 'heavy' ? 1.28 : build === 'slim' ? 0.86 : 1.0;
    const pts = [
      [0.001, -0.02],
      [0.126 * wide, 0.0],
      [0.132 * wide, 0.08],
      [0.152 * wide, 0.17],
      [0.176 * wide, 0.25],
      [0.170 * wide, 0.31],
      [0.120 * wide, 0.355],
      [0.075 * wide, 0.375],
      [0.001, 0.378],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const g = new THREE.LatheGeometry(pts, 20);
    g.scale(1, 1, 0.68);       // flatten front-to-back
    g.computeVertexNormals();
    return g;
  });
}

function hipGeometry(build) {
  return cachedGeo(`hip:${build}`, () => {
    const wide = build === 'heavy' ? 1.2 : build === 'slim' ? 0.9 : 1.0;
    const g = new THREE.SphereGeometry(0.145 * wide, 18, 12);
    g.scale(1.05, 0.85, 0.78);
    return g;
  });
}

function headGeometry() {
  return cachedGeo('head', () => {
    const g = new THREE.SphereGeometry(0.145, 28, 22);
    g.scale(0.94, 1.06, 0.96);
    return g;
  });
}

/* ---------------- hair ---------------- */

function spike(len, base, tip = 0.012) {
  return cachedGeo(`spike:${len.toFixed(3)}:${base.toFixed(3)}`, () => {
    const g = new THREE.CylinderGeometry(tip, base, len, 6, 1);
    g.translate(0, len / 2, 0);
    return g;
  });
}

function buildHair(style, mat, outlineMat, accentMat) {
  const g = new THREE.Group();
  const add = (geo, pos, rot, scale, m = mat) => {
    if (!geo) return null;
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    if (scale) mesh.scale.set(...(Array.isArray(scale) ? scale : [scale, scale, scale]));
    g.add(mesh);
    if (outlineMat) {
      const o = new THREE.Mesh(geo, outlineMat);
      o.position.copy(mesh.position); o.rotation.copy(mesh.rotation); o.scale.copy(mesh.scale);
      g.add(o);
    }
    return mesh;
  };

  // Skull cap. It has to stop ABOVE the brow line (the face is painted
  // into the head material around theta 65..100 deg) — tilted back so the
  // nape still gets covered.
  const capGeo = (theta = 0.37) => cachedGeo(`cap:${theta}`, () => {
    const g2 = new THREE.SphereGeometry(0.1475, 24, 16, 0, TAU, 0, Math.PI * theta);
    g2.scale(0.955, 1.07, 0.975);
    return g2;
  });
  const cap = capGeo(0.37);
  const capRot = [-0.26, 0, 0];

  switch (style) {
    case 'spiky': {
      add(cap, [0, 0.004, -0.012], capRot);
      // crown ring: spikes fan outward, longest at the back
      const ring = 11;
      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * TAU + 0.28;
        const back = (1 - Math.cos(a)) * 0.5;              // 0 front .. 1 back
        const r = 0.072;
        const len = 0.17 + back * 0.15;
        const tilt = 0.72 - back * 0.18;
        add(spike(len, 0.05),
          [Math.cos(a) * r * 0.95, 0.058, Math.sin(a) * r - 0.012],
          [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt]);
      }
      // tall central plumes swept back
      add(spike(0.33, 0.052), [0.0, 0.085, -0.035], [0.30, 0, 0]);
      add(spike(0.29, 0.046), [0.062, 0.082, -0.02], [0.22, 0, -0.30]);
      add(spike(0.29, 0.046), [-0.062, 0.082, -0.02], [0.22, 0, 0.30]);
      // fringe over the brow
      add(spike(0.13, 0.038), [0.05, 0.055, 0.108], [-1.05, 0, 0.22]);
      add(spike(0.14, 0.038), [0.0, 0.062, 0.118], [-1.15, 0, 0]);
      add(spike(0.13, 0.038), [-0.05, 0.055, 0.108], [-1.05, 0, -0.22]);
      break;
    }
    case 'flame': {
      add(cap, [0, 0.004, -0.012], capRot);
      // swept-up torch silhouette
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.2;
        const back = (1 - Math.cos(a)) * 0.5;
        const r = 0.064;
        add(spike(0.24 + back * 0.20, 0.052),
          [Math.cos(a) * r * 0.95, 0.06, Math.sin(a) * r - 0.012],
          [Math.sin(a) * 0.34 + 0.1, 0, -Math.cos(a) * 0.36]);
      }
      add(spike(0.46, 0.058), [0, 0.09, -0.03], [0.16, 0, 0]);
      add(spike(0.38, 0.05), [0.055, 0.088, -0.015], [0.12, 0, -0.2]);
      add(spike(0.38, 0.05), [-0.055, 0.088, -0.015], [0.12, 0, 0.2]);
      add(spike(0.15, 0.034), [0.048, 0.058, 0.108], [-0.95, 0, 0.2]);
      add(spike(0.15, 0.034), [-0.048, 0.058, 0.108], [-0.95, 0, -0.2]);
      break;
    }
    case 'long': {
      add(capGeo(0.52), [0, 0.004, -0.006], [-0.4, 0, 0], [1.02, 1.0, 1.03]);
      const strand = cachedGeo('strand', () => {
        const g2 = new THREE.CylinderGeometry(0.028, 0.055, 0.46, 7, 1);
        g2.translate(0, -0.23, 0);
        return g2;
      });
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + (i / 6) * 1.8;
        add(strand, [Math.sin(a) * 0.10, 0.02, -0.08 - Math.cos(a) * 0.04],
          [0.22, 0, -Math.sin(a) * 0.5], [1, 1 - Math.abs(a) * 0.12, 1]);
      }
      add(spike(0.13, 0.03), [0.05, 0.05, 0.115], [-1.3, 0, 0.2]);
      add(spike(0.12, 0.028), [-0.05, 0.05, 0.115], [-1.35, 0, -0.2]);
      break;
    }
    case 'ponytail': {
      add(capGeo(0.48), [0, 0.004, -0.006], [-0.34, 0, 0]);
      const tail = cachedGeo('tail', () => {
        const g2 = new THREE.CylinderGeometry(0.022, 0.062, 0.5, 8, 1);
        g2.translate(0, -0.25, 0);
        return g2;
      });
      add(new THREE.SphereGeometry(0.05, 12, 10), [0, 0.09, -0.11]);
      add(tail, [0, 0.10, -0.13], [-0.45, 0, 0]);
      add(spike(0.14, 0.032), [0.055, 0.05, 0.11], [-1.25, 0, 0.25]);
      add(spike(0.14, 0.032), [-0.055, 0.05, 0.11], [-1.25, 0, -0.25]);
      break;
    }
    case 'horns': {
      add(capGeo(0.34), [0, 0.004, -0.01], capRot);
      const horn = cachedGeo('horn', () => {
        const g2 = new THREE.ConeGeometry(0.036, 0.20, 8);
        g2.translate(0, 0.10, 0);
        return g2;
      });
      add(horn, [0.085, 0.07, -0.01], [-0.25, 0, 0.55], 1, accentMat || mat);
      add(horn, [-0.085, 0.07, -0.01], [-0.25, 0, -0.55], 1, accentMat || mat);
      break;
    }
    case 'crest': {
      add(capGeo(0.38), [0, 0.004, -0.01], capRot);
      for (let i = 0; i < 5; i++) {
        add(spike(0.20 - i * 0.022, 0.036), [0, 0.06, -0.05 + i * 0.028], [0.35 + i * 0.1, 0, 0]);
      }
      break;
    }
    case 'bald':
    default:
      break;
  }
  return g;
}

/* ---------------- main builder ---------------- */

export function buildFighter(spec) {
  const P = spec.palette;
  const outlineMat = createOutlineMaterial(P.outline ?? 0x0a0d16, spec.build === 'heavy' ? 1.25 : 1.05);

  const mk = (color, o = {}) => createToonMaterial({
    color, energyColor: P.aura, ...o,
  });

  const M = {
    skin: mk(P.skin, { specStrength: 0.22, rimStrength: 0.6, shadowTint: 0.9 }),
    hair: mk(P.hair, { specStrength: 0.3, specPower: 44, rimStrength: 0.85, shadowTint: 0.8 }),
    primary: mk(P.primary, { specStrength: 0.18 }),
    secondary: mk(P.secondary, { specStrength: 0.3 }),
    accent: mk(P.accent, { specStrength: 0.5, specPower: 30 }),
    dark: mk(P.dark ?? 0x1b2030, { specStrength: 0.25 }),
    glow: mk(P.aura, { emissive: 0.85, specStrength: 0.7 }),
    outline: outlineMat,
  };
  const meshes = [];

  const addMesh = (parent, geo, mat, pos = [0, 0, 0], rot = null, scale = null, outline = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scale) m.scale.set(...(Array.isArray(scale) ? scale : [scale, scale, scale]));
    parent.add(m);
    meshes.push(m);
    if (outline) {
      const o = new THREE.Mesh(geo, outlineMat);
      o.position.copy(m.position); o.rotation.copy(m.rotation); o.scale.copy(m.scale);
      o.userData.outline = true;
      parent.add(o);
    }
    return m;
  };

  const B = {};
  const bone = (name, parent, x, y, z) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    o.name = name;
    parent.add(o);
    B[name] = o;
    return o;
  };

  const root = new THREE.Group();
  root.name = spec.id;

  const scale = spec.scale ?? 1;
  const inner = new THREE.Group();
  inner.scale.setScalar(scale);
  root.add(inner);

  const hips = bone('hips', inner, 0, 0.95, 0);
  const spine = bone('spine', hips, 0, 0.05, 0);
  const chest = bone('chest', spine, 0, 0.14, 0);
  const neck = bone('neck', chest, 0, 0.30, 0);
  const head = bone('head', neck, 0, 0.10, 0);

  const build = spec.build ?? 'normal';
  const armR = build === 'heavy' ? 0.062 : build === 'slim' ? 0.044 : 0.052;
  const legR = build === 'heavy' ? 0.082 : build === 'slim' ? 0.060 : 0.070;
  const shoulderX = build === 'heavy' ? 0.215 : build === 'slim' ? 0.165 : 0.185;

  /* ---- torso ---- */
  addMesh(hips, hipGeometry(build), M.primary, [0, 0.0, 0]);
  addMesh(spine, torsoGeometry(build), M.primary, [0, 0, 0]);

  const outfit = spec.outfit ?? 'gi';

  if (outfit === 'gi') {
    // undershirt collar + open jacket panels
    addMesh(chest, new THREE.SphereGeometry(0.135, 16, 12, 0, TAU, 0, Math.PI * 0.5),
      M.secondary, [0, 0.11, 0.012], [0, 0, 0], [1.05, 0.72, 0.78]);
    // sash
    addMesh(hips, new THREE.TorusGeometry(0.135, 0.036, 8, 20), M.accent, [0, 0.04, 0], [Math.PI / 2, 0, 0], [1, 1, 0.72]);
    addMesh(hips, new THREE.BoxGeometry(0.07, 0.26, 0.05), M.accent, [0.10, -0.05, 0.09], [0.1, 0, 0.18]);
  } else if (outfit === 'armor') {
    const plate = torsoGeometry(build);
    addMesh(spine, plate, M.secondary, [0, 0.005, 0], null, 1.075);
    // shoulder pads
    for (const s of [1, -1]) {
      addMesh(chest, new THREE.SphereGeometry(0.085, 14, 10),
        M.secondary, [s * (shoulderX + 0.01), 0.16, 0], null, [1.2, 0.85, 1.1]);
    }
    addMesh(hips, new THREE.TorusGeometry(0.15, 0.03, 8, 18), M.accent, [0, 0.02, 0], [Math.PI / 2, 0, 0], [1, 1, 0.72]);
  } else if (outfit === 'battlesuit') {
    addMesh(chest, new THREE.BoxGeometry(0.19, 0.14, 0.16), M.dark, [0, 0.10, 0.02], null, 1);
    addMesh(chest, new THREE.SphereGeometry(0.032, 12, 10), M.glow, [0, 0.14, 0.10]);
    for (const s of [1, -1]) {
      addMesh(chest, new THREE.BoxGeometry(0.03, 0.10, 0.02), M.glow, [s * 0.08, 0.05, 0.115], null, 1, false);
    }
    addMesh(hips, new THREE.TorusGeometry(0.15, 0.028, 8, 18), M.dark, [0, 0.02, 0], [Math.PI / 2, 0, 0], [1, 1, 0.72]);
  } else if (outfit === 'robe') {
    const skirt = cachedGeo('skirt', () => {
      const g = new THREE.CylinderGeometry(0.17, 0.31, 0.52, 18, 1, true);
      g.translate(0, -0.26, 0);
      return g;
    });
    addMesh(hips, skirt, M.secondary, [0, 0.04, 0]);
    addMesh(hips, new THREE.TorusGeometry(0.14, 0.032, 8, 18), M.accent, [0, 0.05, 0], [Math.PI / 2, 0, 0], [1, 1, 0.75]);
  } else if (outfit === 'bio') {
    for (let i = 0; i < 7; i++) {
      const a = rand(0, TAU);
      addMesh(spine, new THREE.SphereGeometry(0.035, 8, 6), M.accent,
        [Math.cos(a) * 0.13, 0.05 + Math.random() * 0.25, Math.sin(a) * 0.09], null, [1, 1, 0.6], false);
    }
    addMesh(chest, new THREE.SphereGeometry(0.135, 16, 12, 0, TAU, 0, Math.PI * 0.5),
      M.secondary, [0, 0.10, 0.01], null, [1.04, 0.7, 0.8]);
  }

  /* ---- head ---- */
  // the face is painted into the head material itself: a separate decal
  // sphere z-fights at this scale
  M.face = createToonMaterial({
    color: P.skin, energyColor: P.aura,
    specStrength: 0.2, rimStrength: 0.6, shadowTint: 0.9,
    faceMap: faceTexture(spec.face ?? {}),
  });
  const headMesh = addMesh(head, headGeometry(), M.face, [0, 0.02, 0]);

  // ears
  for (const s of [1, -1]) {
    addMesh(head, new THREE.SphereGeometry(0.028, 10, 8), M.skin,
      [s * 0.132, 0.015, -0.005], [0, 0, 0], [0.55, 1.15, 0.85], false);
  }
  // neck
  addMesh(neck, new THREE.CylinderGeometry(0.048, 0.058, 0.09, 12), M.skin, [0, 0.045, 0], null, null, false);

  const hairGroup = buildHair(spec.hair ?? 'spiky', M.hair, outlineMat, M.accent);
  hairGroup.position.set(0, 0.02, 0);
  head.add(hairGroup);
  hairGroup.traverse((o) => { if (o.isMesh && o.material !== outlineMat) meshes.push(o); });

  if (spec.headgear === 'halo') {
    const h = addMesh(head, new THREE.TorusGeometry(0.11, 0.016, 8, 20), M.glow, [0, 0.30, 0], [Math.PI / 2, 0, 0], 1, false);
    h.userData.spin = 1;
  }
  if (spec.headgear === 'visor') {
    addMesh(head, new THREE.BoxGeometry(0.26, 0.05, 0.02), M.glow, [0, 0.055, 0.128], [0.08, 0, 0], 1, false);
  }

  /* ---- arms ---- */
  const arms = {};
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const sh = bone('shoulder' + side, chest, s * shoulderX, 0.155, 0);
    const ua = bone('upperArm' + side, sh, 0, -0.02, 0);
    const fa = bone('forearm' + side, ua, 0, -0.27, 0);
    const hd = bone('hand' + side, fa, 0, -0.25, 0);
    arms[side] = { sh, ua, fa, hd };

    addMesh(sh, new THREE.SphereGeometry(armR * 1.35, 12, 10), outfit === 'armor' ? M.secondary : M.primary, [0, -0.01, 0], null, [1, 1, 1], false);
    addMesh(ua, capsule(armR, 0.24, `ua${armR}`), outfit === 'gi' || outfit === 'robe' ? M.primary : M.skin, [0, -0.02, 0]);
    addMesh(fa, capsule(armR * 0.92, 0.22, `fa${armR}`), M.skin, [0, -0.015, 0]);
    // wristband
    addMesh(fa, new THREE.CylinderGeometry(armR * 1.18, armR * 1.18, 0.06, 12), M.accent, [0, -0.215, 0], null, null, false);
    // hand
    addMesh(hd, new THREE.SphereGeometry(armR * 1.25, 12, 10), M.skin, [0, -0.02, 0], null, [0.85, 1.15, 1.0]);
  }

  /* ---- legs ---- */
  const legs = {};
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const th = bone('thigh' + side, hips, s * 0.088, -0.045, 0);
    const sn = bone('shin' + side, th, 0, -0.40, 0);
    const ft = bone('foot' + side, sn, 0, -0.38, 0);
    legs[side] = { th, sn, ft };

    addMesh(th, capsule(legR, 0.36, `th${legR}`), M.primary, [0, -0.02, 0]);
    addMesh(sn, capsule(legR * 0.82, 0.34, `sn${legR}`), outfit === 'gi' ? M.primary : M.skin, [0, -0.015, 0]);
    // boot
    addMesh(sn, new THREE.CylinderGeometry(legR * 0.95, legR * 0.88, 0.16, 12), M.secondary, [0, -0.30, 0], null, null, false);
    const foot = addMesh(ft, new THREE.BoxGeometry(0.10, 0.07, 0.20), M.secondary, [0, -0.02, 0.045]);
    foot.geometry.computeVertexNormals();
  }

  /* ---- cape ---- */
  let cape = null;
  if (spec.cape) {
    const g = new THREE.PlaneGeometry(0.46, 0.72, 6, 8);
    g.translate(0, -0.36, 0);
    const capeMat = createToonMaterial({
      color: spec.capeColor ?? P.secondary, energyColor: P.aura,
      side: THREE.DoubleSide, rimStrength: 0.7,
    });
    cape = new THREE.Mesh(g, capeMat);
    cape.position.set(0, 0.26, -0.09);
    chest.add(cape);
    meshes.push(cape);
    cape.userData.basePos = g.attributes.position.array.slice();
  }

  /* ---- tail ---- */
  let tail = null;
  if (spec.tail) {
    tail = new THREE.Group();
    const seg = cachedGeo('tailseg', () => {
      const g = new THREE.CylinderGeometry(0.026, 0.034, 0.14, 8);
      g.translate(0, -0.07, 0);
      return g;
    });
    let parent = tail;
    const tailBones = [];
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Object3D();
      b.position.set(0, i === 0 ? 0 : -0.14, 0);
      parent.add(b);
      const m = new THREE.Mesh(seg, M.hair);
      m.scale.setScalar(1 - i * 0.07);
      b.add(m);
      meshes.push(m);
      tailBones.push(b);
      parent = b;
    }
    tail.position.set(0, -0.02, -0.13);
    hips.add(tail);
    tail.userData.bones = tailBones;
  }

  /* ---- aura shell ---- */
  // truncated cone hugging the body — a needle-thin tip reads as a
  // white spike poking out of the head, so keep the top wide
  const auraGeo = cachedGeo('aura', () => {
    const g = new THREE.CylinderGeometry(0.30, 0.52, 2.5, 26, 12, true);
    g.translate(0, 1.02, 0);
    return g;
  });
  const auraMat = createAuraMaterial(P.aura, P.auraCore ?? 0xffffff);
  const aura = new THREE.Mesh(auraGeo, auraMat);
  aura.visible = false;
  aura.renderOrder = 6;
  aura.frustumCulled = false;
  inner.add(aura);

  return {
    root, inner, bones: B, arms, legs, meshes, materials: M,
    aura, auraMat, hairGroup, headMesh, cape, tail,
    outlineMat,
    height: 1.8 * scale,
  };
}

/** re-tint an existing rig (used by transformations) */
export function retint(rig, palette, opts = {}) {
  const M = rig.materials;
  if (palette.hair !== undefined) M.hair.uniforms.uColor.value.set(palette.hair);
  if (palette.skin !== undefined) {
    M.skin.uniforms.uColor.value.set(palette.skin);
    M.face?.uniforms.uColor.value.set(palette.skin);
  }
  if (palette.primary !== undefined) M.primary.uniforms.uColor.value.set(palette.primary);
  if (palette.secondary !== undefined) M.secondary.uniforms.uColor.value.set(palette.secondary);
  if (palette.accent !== undefined) M.accent.uniforms.uColor.value.set(palette.accent);
  if (palette.aura !== undefined) {
    rig.auraMat.uniforms.uColor.value.set(palette.aura);
    for (const k in M) {
      const m = M[k];
      if (m.uniforms?.uEnergyColor) m.uniforms.uEnergyColor.value.set(palette.aura);
    }
  }
  if (opts.hairStyle) {
    const head = rig.bones.head;
    head.remove(rig.hairGroup);
    const g = buildHair(opts.hairStyle, M.hair, rig.outlineMat, M.accent);
    g.position.set(0, 0.02, 0);
    head.add(g);
    rig.hairGroup = g;
    g.traverse((o) => { if (o.isMesh && o.material !== rig.outlineMat) rig.meshes.push(o); });
  }
}
