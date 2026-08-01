'use strict';
/* ============================================================================
   ship.js — procedural starship mesh + the flight model.

   The flight model has three regimes that blend into one another by air
   density, so there is never a moment where control "switches over":

     vacuum     — pure 6-DOF Newtonian, pulse drive available
     upper air  — drag ramps in, pulse cuts out, entry heating builds
     low air    — banked atmospheric handling with an auto-levelling assist

   Landing is assisted on purpose.  Coming down at 200 m/s and fighting a
   physics sim for the last ten metres is not the fun part; the approach is.
   ============================================================================ */

const SHIP_CFG = {
  thrustSpace: 260,        // m/s^2
  thrustAtmo: 190,
  boostMul: 3.4,
  pulseSpeed: 480000,      // m/s — crosses a system in well under a minute
  pulseAccel: 60000,
  /* Ultra drive: a hundred times the pulse drive.  At this speed a frame is
     800 km, so it is only usable because travel is clamped against every
     planet's approach sphere each step (see limitTravel below) — you arrive
     instead of passing through. */
  ultraMul: 100,
  maxSpaceSpeed: 1400,
  maxAtmoSpeed: 640,
  pitchRate: 1.5,
  yawRate: 1.1,
  rollRate: 2.4,
  hoverHeight: 4.2,
  landHeight: 3.0,
  approachRadii: 2.6       // ultra/pulse cut-out, in planet radii
};

/* ---------------------------------------------------------------------------
   Hull, decoded from the baked glTF in shipmodel.js.

   The model is one rigid part per animated bone, so it draws as a short list
   of meshes each carrying its own transform.  Vertex data arrives quantised;
   it is expanded once here rather than dequantised per-frame in a shader.
   --------------------------------------------------------------------------- */
function decodeBase64(b64) {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

function buildShipMesh(gl) {
  const M = SHIP_MODEL;
  const pos = new Int16Array(decodeBase64(M.pos));
  const nrm = new Int8Array(decodeBase64(M.nrm));
  const uv = new Uint16Array(decodeBase64(M.uv));
  const idx = new Uint16Array(decodeBase64(M.idx));

  const parts = [];
  let vo = 0, io = 0;
  for (const p of M.parts) {
    const v = new Float32Array(p.vc * 8);
    for (let i = 0; i < p.vc; i++) {
      const s = i * 8, q = (vo + i) * 3, u = (vo + i) * 2;
      v[s]     = pos[q]     / 32767 * p.ph[0] + p.pc[0];
      v[s + 1] = pos[q + 1] / 32767 * p.ph[1] + p.pc[1];
      v[s + 2] = pos[q + 2] / 32767 * p.ph[2] + p.pc[2];
      v[s + 3] = nrm[q]     / 127;
      v[s + 4] = nrm[q + 1] / 127;
      v[s + 5] = nrm[q + 2] / 127;
      v[s + 6] = uv[u]      / 65535 * p.uh[0] + p.uc[0];
      v[s + 7] = uv[u + 1]  / 65535 * p.uh[1] + p.uc[1];
    }
    const mesh = new Mesh(gl, [
      { name: 'aPos', size: 3 }, { name: 'aNormal', size: 3 }, { name: 'aUV', size: 2 }
    ]);
    mesh.upload(v, idx.slice(io, io + p.ic));
    parts.push(mesh);
    vo += p.vc; io += p.ic;
  }

  SHIP_CFG.landHeight = -M.bounds.lo[1] + 0.75;
  return parts;
}

/* Per-part transforms for the baked animation, interpolated between the two
   nearest sampled frames. */
class ShipAnimator {
  constructor() {
    const M = SHIP_MODEL;
    this.data = new Float32Array(decodeBase64(M.anim));
    this.count = M.parts.length;
    this.frames = M.frameCount;
    this.rate = M.frameRate;
    this.pos = [];
    this.rot = [];
    this.scale = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) { this.pos.push(V3.new()); this.rot.push(Q4.new()); }
    this._qa = Q4.new(); this._qb = Q4.new();
  }

  sample(time) {
    const t = (time * this.rate) % this.frames;
    const f0 = Math.floor(t);
    const f1 = (f0 + 1) % this.frames;
    const u = t - f0;
    const d = this.data, n = this.count;
    for (let k = 0; k < n; k++) {
      const a = (f0 * n + k) * 8, b = (f1 * n + k) * 8;
      const p = this.pos[k];
      p[0] = d[a] + (d[b] - d[a]) * u;
      p[1] = d[a + 1] + (d[b + 1] - d[a + 1]) * u;
      p[2] = d[a + 2] + (d[b + 2] - d[a + 2]) * u;
      const qa = this._qa, qb = this._qb;
      qa[0] = d[a + 3]; qa[1] = d[a + 4]; qa[2] = d[a + 5]; qa[3] = d[a + 6];
      qb[0] = d[b + 3]; qb[1] = d[b + 4]; qb[2] = d[b + 5]; qb[3] = d[b + 6];
      Q4.slerp(this.rot[k], qa, qb, u);
      this.scale[k] = d[a + 7] + (d[b + 7] - d[a + 7]) * u;
    }
  }
}

/* Exhaust geometry: a strip along the exhaust axis whose width the vertex
   shader turns to face the camera, plus a camera-facing disc at the throat for
   the view from directly astern. */
function buildThrusterMesh(gl) {
  const SEG = 40;
  const v = [], idx = [];
  const push = (x, y, kind, cx, cy, cz, prof) => {
    v.push(x, y, kind, 0, cx, cy, cz, prof, 0);
    return v.length / 9 - 1;
  };

  for (const e of SHIP_MODEL.engines) {
    const er = e[3] || 1;

    // beam: two vertices per station along the axis
    const base = v.length / 9;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      /* Necks in just past the throat, then swells and tapers — the shape of
         an exhaust expanding into vacuum. */
      const prof = er * (0.55 + 0.85 * Math.pow(t, 0.45)) * Math.pow(1 - t, 0.42);
      push(-1, t, 0, e[0], e[1], e[2], prof);
      push(1, t, 0, e[0], e[1], e[2], prof);
    }
    for (let i = 0; i < SEG; i++) {
      const a = base + i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }

    // throat disc, built in camera space by the vertex shader
    const d0 = v.length / 9;
    push(-1, -1, 1, e[0], e[1], e[2], er);
    push(1, -1, 1, e[0], e[1], e[2], er);
    push(1, 1, 1, e[0], e[1], e[2], er);
    push(-1, 1, 1, e[0], e[1], e[2], er);
    idx.push(d0, d0 + 1, d0 + 2, d0, d0 + 2, d0 + 3);
  }

  const mesh = new Mesh(gl, [
    { name: 'aData', size: 4 }, { name: 'aCenter', size: 3 }, { name: 'aInfo', size: 2 }
  ]);
  mesh.upload(new Float32Array(v), new Uint16Array(idx));
  return mesh;
}

/* ============================================================================
   Ship
   ============================================================================ */
class Ship {
  constructor() {
    this.pos = V3.new();
    this.vel = V3.new();
    this.rot = Q4.new();
    this.angVel = V3.new();         // body-space pitch/yaw/roll rates

    this.throttle = 0.32;
    this.boost = 0;
    this.pulse = 0;                 // 0..1 pulse-drive engagement
    this.pulseWanted = false;
    this.ultra = 0;                 // 0..1 ultra-drive engagement
    this.ultraWanted = false;
    this.inAtmoPrev = false;
    this.gear = 0;                  // 0 retracted .. 1 down
    this.landed = false;
    this.landing = false;
    this.landProgress = 0;
    this.takeoff = 0;
    this.heat = 0;
    this.thrustVis = 0;
    this.shake = 0;
    this.speed = 0;
    this.altitude = 1e9;
    this.groundAlt = 0;

    this.landPos = V3.new();
    this.landRot = Q4.new();
    this.startPos = V3.new();
    this.startRot = Q4.new();
  }

  /* ------------------------------------------------------------ helpers -- */
  forward(o) { return quatFwd(o, this.rot); }
  up(o) { return quatUp(o, this.rot); }
  right(o) { return quatRight(o, this.rot); }

  /* --------------------------------------------------------------- init -- */
  spawnInOrbit(planet) {
    const dir = V3.normalize(V3.new(), V3.new(0.35, 0.28, 1.0));
    V3.addScaled(this.pos, planet.pos, dir, planet.radius * 2.9);
    V3.zero(this.vel);
    this.orientTowards(planet);
    this.throttle = 0.35;
    this.landed = false;
    this.gear = 0;
  }

  orientTowards(planet) {
    const fwd = V3.new(), up = V3.new(), right = V3.new();
    V3.sub(fwd, planet.pos, this.pos);
    V3.normalize(fwd, fwd);
    V3.set(up, 0, 1, 0);
    V3.cross(right, fwd, up);
    if (V3.lenSq(right) < 1e-6) V3.set(right, 1, 0, 0);
    V3.normalize(right, right);
    V3.cross(up, right, fwd);
    V3.normalize(up, up);
    Q4.fromBasis(this.rot, right, up, fwd);
  }

  /* ========================================================================
     update
     ======================================================================== */
  update(dt, input, planet, game) {
    const pos = this.pos;

    /* ---- where are we relative to the world below? ---- */
    let up = _sUp, altitude = 1e9, density = 0, gravity = 0;
    let localDir = _sDir;
    if (planet) {
      V3.sub(_sRel, pos, planet.pos);
      const r = V3.len(_sRel);
      V3.scale(localDir, _sRel, 1 / r);
      V3.copy(up, localDir);
      const ground = planet.surfaceRadius(localDir[0], localDir[1], localDir[2]);
      this.groundAlt = ground - planet.radius;
      altitude = r - ground;
      this.seaAlt = planet.hasWater ? r - planet.seaRadius : altitude;
      density = planet.densityAt(r - planet.radius);
      gravity = planet.gravity * Math.pow(planet.radius / r, 2);
      this.altitudeFromCentre = r;
    } else {
      V3.set(up, 0, 1, 0);
      this.altitude = 1e9;
    }
    this.altitude = altitude;
    this.density = density;

    /* ---- landing / take-off sequences own the ship completely ---- */
    if (this.landing) { this.updateLanding(dt, planet, game); return; }
    if (this.takeoff > 0) { this.updateTakeoff(dt, planet, game); return; }
    if (this.landed) { this.updateLanded(dt, input, planet, game); return; }

    const inAtmo = density > 0.008;

    /* ---- pulse drive ----
       Half a million metres a second covers a system in half a minute, which
       also means eight thousand metres per frame.  Cutting out at a couple of
       planet radii is what turns "arriving" into an approach instead of an
       instantaneous pass straight through the world. */
    const nearWorld = planet &&
      (this.altitudeFromCentre - planet.radius) < planet.radius * (SHIP_CFG.approachRadii - 0.4);
    const pulseAllowed = !inAtmo && !nearWorld;
    if (this.pulseWanted && pulseAllowed) this.pulse = Math.min(1, this.pulse + dt * 0.55);
    else this.pulse = Math.max(0, this.pulse - dt * 2.2);
    if (this.pulse > 0.01 && !pulseAllowed) {
      game.notify(inAtmo ? 'PULSE DRIVE DISENGAGED — ATMOSPHERE'
        : 'PULSE DRIVE DISENGAGED — GRAVITY WELL', 'warn');
    }

    /* ---- ultra drive ----
       This behaves like the boost, not like the pulse drive: it engages
       wherever holding Shift would, so pressing V always does something.
       Only two things damp it — thick air, and being inside a gravity well
       close enough that the travel clamp is about to stop you anyway. */
    const ultraCeiling = inAtmo ? lerp(1.0, 0.12, saturate(density * 2.2)) : 1.0;
    if (this.ultraWanted) {
      if (this.ultra < 0.01) game.audio.ultraEngage();
      this.ultra = Math.min(ultraCeiling, this.ultra + dt * 2.2);
    } else {
      this.ultra = Math.max(0, this.ultra - dt * 3.2);
    }

    /* ---- attitude ---- */
    const authority = lerp(1.0, 0.55, saturate(this.pulse));
    const atmoAuth = lerp(1.0, 1.25, saturate(density));
    let pitch = -input.look.y * SHIP_CFG.pitchRate * authority * atmoAuth;
    let yaw = -input.look.x * SHIP_CFG.yawRate * authority * atmoAuth;
    let roll = input.roll * SHIP_CFG.rollRate * authority;

    /* Coordinated turn: yawing in atmosphere banks the ship, like NMS. */
    if (inAtmo) roll += -input.look.x * 1.6 * saturate(density * 2);

    const rate = 1 - Math.exp(-dt * 9);
    this.angVel[0] = lerp(this.angVel[0], pitch, rate);
    this.angVel[1] = lerp(this.angVel[1], yaw, rate);
    this.angVel[2] = lerp(this.angVel[2], roll, rate);

    this.applyBodyRotation(dt);

    /* Auto-level: inside an atmosphere the ship gently rights itself unless
       the player is actively rolling.  This is the single biggest reason
       atmospheric flight feels controllable rather than nauseating. */
    if (inAtmo && Math.abs(input.roll) < 0.01 && planet) {
      this.autoLevel(dt, up, saturate(density) * 1.6);
    }

    /* ---- throttle ---- */
    this.throttle = clamp(this.throttle + input.throttle * dt * 1.1, 0, 1);
    this.boost = damp(this.boost, input.boost ? 1 : 0, 6, dt);

    /* ---- forces ---- */
    const fwd = this.forward(_sFwd);
    let accel = _sAcc;
    V3.zero(accel);

    if (this.pulse > 0.02 || this.ultra > 0.02) {
      const drive = Math.max(this.pulse, this.ultra);
      const mul = 1 + this.ultra * (SHIP_CFG.ultraMul - 1);
      const target = SHIP_CFG.pulseSpeed * drive * mul;
      const cur = V3.dot(this.vel, fwd);
      const a = clamp((target - cur), -SHIP_CFG.pulseAccel * mul, SHIP_CFG.pulseAccel * mul);
      V3.addScaled(accel, accel, fwd, a);
      /* Kill lateral drift so pulse flight tracks the nose exactly. */
      const lat = _sLat;
      V3.addScaled(lat, this.vel, fwd, -cur);
      V3.addScaled(accel, accel, lat, -2.2);
    } else {
      const baseThrust = lerp(SHIP_CFG.thrustSpace, SHIP_CFG.thrustAtmo, saturate(density));
      const boostMul = 1 + this.boost * (SHIP_CFG.boostMul - 1)
                         + this.ultra * (SHIP_CFG.ultraMul - 1);
      const t = baseThrust * Math.max(this.throttle, this.ultra) * boostMul;
      V3.addScaled(accel, accel, fwd, t);
    }

    /* gravity */
    if (planet && gravity > 0) V3.addScaled(accel, accel, up, -gravity);

    /* atmospheric drag + lift */
    if (density > 0) {
      const v = V3.len(this.vel);
      if (v > 0.01) {
        const vdir = V3.scale(_sVd, this.vel, 1 / v);
        const align = Math.abs(V3.dot(vdir, fwd));
        /* Broadside presents far more area — this is what keeps entry
           angle meaningful and stops the ship skidding sideways. */
        const cd = lerp(0.055, 0.0085, align);
        const drag = cd * density * v * v * 0.5;
        V3.addScaled(accel, accel, vdir, -drag);

        /* Wings generate lift proportional to speed and how flat we are. */
        const shipUp = this.up(_sSu);
        const aoa = -V3.dot(vdir, shipUp);
        const lift = density * v * v * 0.0016 * clamp(aoa * 5 + 0.35, -1, 1.6);
        V3.addScaled(accel, accel, shipUp, lift);
      }
    }

    V3.addScaled(this.vel, this.vel, accel, dt);

    /* Speed limit blends with pulse engagement rather than switching, so
       dropping out of the pulse drive decelerates over half a second instead
       of stopping dead. */
    const normalMax = lerp(SHIP_CFG.maxSpaceSpeed, SHIP_CFG.maxAtmoSpeed, saturate(density * 3));
    const ultraMax = normalMax * (1 + this.ultra * (SHIP_CFG.ultraMul - 1));
    const pulseMax = SHIP_CFG.pulseSpeed * 1.05;
    const maxV = Math.max(lerp(normalMax, pulseMax, saturate(this.pulse)), ultraMax);
    const sp = V3.len(this.vel);
    if (sp > maxV) V3.scale(this.vel, this.vel, maxV / sp);
    if (input.brake) V3.scale(this.vel, this.vel, Math.exp(-dt * 2.4));

    /* ---- ground-proximity assist ----
       Close to the surface the flight computer bleeds off speed and caps the
       descent rate.  It is the difference between "approach and set down" and
       "fight the physics for the last twenty metres", and it makes arriving at
       a planet reliable rather than a coin flip. */
    if (planet && altitude < 260 && this.pulse < 0.02 && this.ultra < 0.02) {
      const near = 1 - smoothstep(90, 260, altitude);
      if (near > 0) {
        const cap = lerp(150, 70, near);
        const sp0 = V3.len(this.vel);
        if (sp0 > cap) {
          const k = Math.exp(-dt * 2.6 * near);
          const want = Math.max(cap, sp0 * k);
          V3.scale(this.vel, this.vel, want / sp0);
        }
        /* limit sink rate so you settle rather than slam */
        const vDown = -V3.dot(this.vel, up);
        const maxSink = lerp(60, 14, 1 - smoothstep(12, 120, altitude));
        if (vDown > maxSink) V3.addScaled(this.vel, this.vel, up, (vDown - maxSink) * near);
      }
    }

    /* At ultra speed one frame covers hundreds of kilometres, so integrating
       blindly would put the ship on the far side of a planet before any
       proximity check ran.  Shorten the step to stop exactly at the first
       approach sphere on the path instead. */
    let step = dt;
    if (this.pulse > 0.02 || this.ultra > 0.02) step = this.limitTravel(dt, game);
    V3.addScaled(pos, pos, this.vel, step);
    this.speed = V3.len(this.vel);

    /* ---- entry heating & buffet ---- */
    const q = density * this.speed * this.speed * 1.2e-5;
    this.heat = damp(this.heat, saturate(q - 0.12), 2.5, dt);

    /* Crossing into air is an audible event, not just a visual one. */
    if (inAtmo && !this.inAtmoPrev && this.speed > 60) game.audio.atmosphereEntry();
    if (!inAtmo && this.inAtmoPrev && this.speed > 60) game.audio.atmosphereExit();
    this.inAtmoPrev = inAtmo;
    this.shake = damp(this.shake, saturate(q * 0.9) + (this.pulse > 0.5 ? 0.06 : 0), 4, dt);
    this.thrustVis = damp(this.thrustVis, this.pulse > 0.02 ? 1 : this.throttle * (0.5 + this.boost * 0.5), 5, dt);

    /* ---- terrain collision, resolved as a hard floor ---- */
    if (planet) this.resolveGround(dt, planet, localDir, up, game);

    /* ---- landing prompt ---- */
    /* A landing site has to hold the whole ship, not just the point under the
       nose.  Checking a ring the width of the wingspan is what stops you
       setting down on a shoreline with one wing in the sea. */
    const inRange = !!planet && altitude < 260;
    let siteOK = true;
    if (inRange && planet.hasWater) {
      if (this._siteFrame === undefined) this._siteFrame = 0;
      if ((this._siteFrame++ & 3) === 0) {
        this._siteClear = planet.minHeightAround(localDir, 9) > planet.seaH + 1.2;
      }
      siteOK = this._siteClear !== false;
    }
    this.canLand = inRange && this.speed < 155 && siteOK;

    if (input.landPressed) {
      if (this.canLand) this.beginLanding(planet, localDir, game);
      else if (inRange && !siteOK) game.notify('NO SOLID GROUND BELOW — MOVE INLAND', 'warn');
      else if (inRange) { this.throttle = 0; game.notify('TOO FAST TO LAND — SLOW DOWN', 'warn'); }
      else game.notify('NO LANDING SITE IN RANGE', 'warn');
    }

    this.gear = damp(this.gear, this.canLand && altitude < 140 ? 1 : 0, 4, dt);
  }

  /* Largest fraction of dt we can travel without entering any planet's
     approach sphere.  Returns dt unchanged when the path is clear. */
  limitTravel(dt, game) {
    const sp = V3.len(this.vel);
    if (sp < 1e-3) return dt;
    const dir = V3.scale(_sVd, this.vel, 1 / sp);
    let maxDist = sp * dt;
    let hit = false;

    for (const p of game.system.planets) {
      const R = p.radius * SHIP_CFG.approachRadii;
      const ox = this.pos[0] - p.pos[0], oy = this.pos[1] - p.pos[1], oz = this.pos[2] - p.pos[2];
      const b = ox * dir[0] + oy * dir[1] + oz * dir[2];
      const c = ox * ox + oy * oy + oz * oz - R * R;
      if (c <= 0) continue;                      // already inside; the drive is cutting out anyway
      if (b >= 0) continue;                      // heading away
      const h = b * b - c;
      if (h < 0) continue;                       // path misses the sphere
      const t = -b - Math.sqrt(h);               // distance to the approach shell
      if (t < maxDist) { maxDist = Math.max(t, 0); hit = true; }
    }

    if (hit) {
      this.pulse = 0;
      this.ultra = 0;
      V3.scale(this.vel, this.vel, Math.min(1, SHIP_CFG.maxSpaceSpeed / sp));
    }
    return maxDist / sp;
  }

  applyBodyRotation(dt) {
    const q = _sQ;
    const ax = _sAx;
    // pitch (X), yaw (Y), roll (Z) in body space
    V3.set(ax, 1, 0, 0); Q4.fromAxisAngle(q, ax, this.angVel[0] * dt); Q4.mul(this.rot, this.rot, q);
    V3.set(ax, 0, 1, 0); Q4.fromAxisAngle(q, ax, this.angVel[1] * dt); Q4.mul(this.rot, this.rot, q);
    V3.set(ax, 0, 0, 1); Q4.fromAxisAngle(q, ax, this.angVel[2] * dt); Q4.mul(this.rot, this.rot, q);
    Q4.normalize(this.rot, this.rot);
  }

  /* Roll the ship so its up vector converges on the planet's up vector,
     leaving pitch and yaw untouched. */
  autoLevel(dt, up, strength) {
    const shipUp = this.up(_sSu);
    const shipRight = this.right(_sRt);
    const err = V3.dot(shipRight, up);          // >0 means we are rolled left
    const amount = -err * strength * dt * 2.4;
    if (Math.abs(amount) < 1e-7) return;
    const q = _sQ, ax = _sAx;
    V3.set(ax, 0, 0, 1);
    Q4.fromAxisAngle(q, ax, amount);
    Q4.mul(this.rot, this.rot, q);
    Q4.normalize(this.rot, this.rot);
  }

  /* Never let the hull pass through the ground.  Instead of a bounce (which
     reads as a bug at these speeds) we slide along the surface and bleed
     energy — the player always ends up sitting on the terrain, upright. */
  resolveGround(dt, planet, localDir, up, game) {
    const clearance = 3.4;
    const floorAlt = planet.hasWater ? Math.max(this.groundAlt, planet.seaH) : this.groundAlt;
    const surfaceR = planet.radius + floorAlt;
    V3.sub(_sRel, this.pos, planet.pos);
    const r = V3.len(_sRel);
    const pen = (surfaceR + clearance) - r;
    if (pen <= 0) return;

    const vn = V3.dot(this.vel, up);
    V3.addScaled(this.pos, this.pos, up, pen);
    if (vn < 0) {
      V3.addScaled(this.vel, this.vel, up, -vn);      // cancel downward motion
      if (vn < -55) {
        game.impact(Math.min(1, -vn / 260));
        V3.scale(this.vel, this.vel, 0.25);
      }
    }
    V3.scale(this.vel, this.vel, Math.exp(-dt * 3.2));
    this.shake = Math.max(this.shake, 0.25);
  }

  /* ---------------------------------------------------------- landing --- */
  beginLanding(planet, localDir, game) {
    this.landing = true;
    this.landProgress = 0;
    V3.copy(this.startPos, this.pos);
    Q4.copy(this.startRot, this.rot);

    /* Target: sitting on the terrain, wings level with the local horizon,
       keeping as much of the current heading as we can. */
    const n = V3.new();
    planet.normalAt(localDir, n, Math.max(planet.radius * 2e-5, 1.5));
    const ground = planet.surfaceRadius(localDir[0], localDir[1], localDir[2]);
    V3.addScaled(this.landPos, planet.pos, localDir, ground + SHIP_CFG.landHeight);

    const fwd = this.forward(V3.new());
    V3.planeProject(fwd, fwd, n);
    if (V3.lenSq(fwd) < 1e-6) {
      V3.set(fwd, 0, 1, 0);
      V3.planeProject(fwd, fwd, n);
      if (V3.lenSq(fwd) < 1e-6) V3.set(fwd, 1, 0, 0);
    }
    V3.normalize(fwd, fwd);
    const right = V3.cross(V3.new(), fwd, n);
    V3.normalize(right, right);
    Q4.fromBasis(this.landRot, right, n, fwd);

    game.notify('LANDING SEQUENCE ENGAGED', 'ok');
    game.audio.landingStart();
  }

  updateLanding(dt, planet, game) {
    this.landProgress = Math.min(1, this.landProgress + dt * 0.55);
    const t = this.landProgress;
    const e = t * t * (3 - 2 * t);

    /* Arc in with a slight overshoot upward so it reads as a controlled
       descent rather than a linear slide. */
    const lift = Math.sin(t * PI) * 12;
    V3.lerp(this.pos, this.startPos, this.landPos, e);
    const upv = V3.sub(_sUp2, this.pos, planet.pos);
    V3.normalize(upv, upv);
    V3.addScaled(this.pos, this.pos, upv, lift * (1 - e));

    Q4.slerp(this.rot, this.startRot, this.landRot, e);
    V3.zero(this.vel);
    this.gear = Math.min(1, this.gear + dt * 2.2);
    this.thrustVis = damp(this.thrustVis, 0.25, 4, dt);
    this.speed = 0;
    this.heat = damp(this.heat, 0, 3, dt);

    if (t >= 1) {
      this.landing = false;
      this.landed = true;
      this.gear = 1;
      this.shake = 0.35;
      game.audio.landingThud();
      game.notify('LANDED — ' + planet.name.toUpperCase(), 'ok');
      game.onLanded(planet);
    }
  }

  updateLanded(dt, input, planet, game) {
    /* Stay welded to the ground; the terrain under us may still be refining
       as chunks stream in, so re-seat every frame. */
    V3.sub(_sRel, this.pos, planet.pos);
    const dir = V3.normalize(_sDir, _sRel);
    const ground = planet.surfaceRadius(dir[0], dir[1], dir[2]);
    V3.addScaled(this.pos, planet.pos, dir, ground + SHIP_CFG.landHeight);
    V3.zero(this.vel);
    this.speed = 0;
    this.gear = 1;
    this.throttle = 0;
    this.thrustVis = damp(this.thrustVis, 0.12, 3, dt);
    this.shake = damp(this.shake, 0, 3, dt);
    this.heat = damp(this.heat, 0, 3, dt);

    if (input.landPressed) {
      this.landed = false;
      this.takeoff = 1;
      V3.copy(this.startPos, this.pos);
      this.throttle = 0.45;
      game.notify('LAUNCHING', 'ok');
      game.audio.takeoff();
    }
  }

  updateTakeoff(dt, planet, game) {
    this.takeoff = Math.max(0, this.takeoff - dt * 0.7);
    const up = V3.sub(_sUp2, this.pos, planet.pos);
    V3.normalize(up, up);
    const k = (1 - this.takeoff);
    V3.addScaled(this.vel, V3.zero(_sAcc), up, 55 + k * 70);
    V3.addScaled(this.pos, this.pos, this.vel, dt);
    this.speed = V3.len(this.vel);
    this.gear = damp(this.gear, 0, 2.2, dt);
    this.thrustVis = 1;
    this.shake = damp(this.shake, 0.3, 4, dt);
    if (this.takeoff <= 0) {
      this.takeoff = 0;
      this.throttle = 0.45;
    }
  }
}

const _sUp = V3.new(), _sUp2 = V3.new(), _sRel = V3.new(), _sDir = V3.new();
const _sFwd = V3.new(), _sAcc = V3.new(), _sLat = V3.new(), _sVd = V3.new();
const _sSu = V3.new(), _sRt = V3.new(), _sAx = V3.new();
const _sQ = Q4.new();
