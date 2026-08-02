'use strict';
/* ============================================================================
   player.js — on-foot exploration.

   The walker keeps a heading/pitch pair relative to the local "up" of whatever
   planet it is standing on, so walking a full circle around a 60 km world
   never gimbal-locks or rolls the horizon.
   ============================================================================ */

const FOOT = {
  eyeHeight: 1.72,
  walkSpeed: 6.4,
  sprintSpeed: 13.5,
  accel: 34,
  jumpSpeed: 5.6,
  jetThrust: 17.0,
  jetFuelMax: 2.6,
  jetRefill: 0.55,
  boardRange: 26,
  /* How far a seated rider's root sits below where their feet would be. */
  seatDrop: 0.55
};

class Player {
  constructor() {
    this.pos = V3.new();
    this.vel = V3.new();
    this.up = V3.new(0, 1, 0);
    this.fwd = V3.new(0, 0, -1);
    this.right = V3.new(1, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = false;
    this.jetFuel = FOOT.jetFuelMax;
    this.jetting = false;
    this.bob = 0;
    this.headBob = 0;
    this.active = false;
    this.rot = Q4.new();
    this.speed = 0;
    this.altitude = 0;

    /* Third-person state.  `bodyFwd` is the direction the model faces, which
       lags the look direction so that glancing around does not spin the
       character on the spot. */
    this.bodyFwd = V3.new(0, 0, -1);
    this.groundSpeed = 0;
    this.climbRate = 0;
    this.turnRate = 0;

    /* The creature being ridden, if any.  Mounted, this is still the body that
       gets simulated — the animal is drawn under it. */
    this.mount = null;
    /* Set while walking inside a station: the walker swaps its sphere for a
       room with one up vector and four walls. */
    this.station = null;
    this.room = 'bay';
  }

  /* Riding raises the eyes to the animal's back and lifts every speed limit to
     the animal's own. */
  get rideHeight() { return this.mount ? this.mount.sp.saddleH * this.mount.size : 0; }

  /* Drop the player beside the ship, facing it. */
  disembark(ship, planet) {
    V3.sub(_pRel, ship.pos, planet.pos);
    const dir = V3.normalize(_pDir, _pRel);
    V3.copy(this.up, dir);

    const right = ship.right(_pTmp);
    V3.planeProject(right, right, dir);
    V3.normalize(right, right);

    const ground = planet.surfaceRadius(dir[0], dir[1], dir[2]);
    V3.addScaled(this.pos, planet.pos, dir, ground + FOOT.eyeHeight);
    V3.addScaled(this.pos, this.pos, right, 6.5);

    // re-seat onto the terrain at the (slightly different) offset direction
    V3.sub(_pRel, this.pos, planet.pos);
    V3.normalize(_pDir, _pRel);
    const g2 = planet.surfaceRadius(_pDir[0], _pDir[1], _pDir[2]);
    V3.addScaled(this.pos, planet.pos, _pDir, g2 + FOOT.eyeHeight);
    V3.copy(this.up, _pDir);

    // face the ship
    V3.sub(_pTmp, ship.pos, this.pos);
    V3.planeProject(_pTmp, _pTmp, this.up);
    V3.normalize(_pTmp, _pTmp);
    this.setHeading(_pTmp);

    V3.zero(this.vel);
    this.grounded = true;
    this.jetFuel = FOOT.jetFuelMax;
    this.active = true;
  }

  setHeading(dirWorld) {
    /* Store the heading as an explicit forward vector; yaw input then rotates
       it about the local up each frame. */
    V3.copy(this.fwd, dirWorld);
    V3.cross(this.right, this.fwd, this.up);
    V3.normalize(this.right, this.right);
    V3.copy(this.bodyFwd, dirWorld);
    this.pitch = 0;
  }

  /* The model's root.  `pos` tracks the eyes, so on foot this is simply the
     ground; mounted, the walker is already standing `rideHeight` up, which puts
     the same point on the animal's back — drop it by the height of a seated
     rider's hips so the legs fold round the barrel instead of dangling through
     it. */
  footPos(out) {
    return V3.addScaled(out, this.pos, this.up,
      -(FOOT.eyeHeight + (this.mount ? FOOT.seatDrop : 0)));
  }

  /* Step out onto the pad the ship is parked on. */
  disembarkStation(ship, station) {
    this.station = station;
    V3.set(_pTmp, 0, 1, 0);
    Station.axis(this.up, _pTmp);
    V3.normalize(this.up, this.up);

    const right = ship.right(_pTmp2);
    V3.planeProject(right, right, this.up);
    V3.normalize(right, right);

    this.room = 'bay';
    Station.toLocal(_pLocal, ship.pos);
    _pLocal[1] = STATION.rooms.bay.floor + FOOT.eyeHeight;
    Station.toWorld(this.pos, _pLocal);
    V3.addScaled(this.pos, this.pos, right, 9.5);

    V3.sub(_pTmp, ship.pos, this.pos);
    V3.planeProject(_pTmp, _pTmp, this.up);
    V3.normalize(_pTmp, _pTmp);
    this.setHeading(_pTmp);

    V3.zero(this.vel);
    this.grounded = true;
    this.mount = null;
    this.jetFuel = FOOT.jetFuelMax;
    this.active = true;
  }

  /* Inside the station the world is a room, not a sphere: one fixed up vector,
     a flat floor, and four walls.  Everything else about the walker — look,
     acceleration, jetpack, head bob — is the same, so only the frame and the
     collision differ. */
  updateInStation(dt, input, game) {
    const S = STATION;
    const R = STATION.rooms[this.room] || STATION.rooms.bay;
    V3.set(_pTmp, 0, 1, 0);
    Station.axis(this.up, _pTmp);
    V3.normalize(this.up, this.up);

    V3.planeProject(this.fwd, this.fwd, this.up);
    if (V3.lenSq(this.fwd) < 1e-8) V3.set(this.fwd, 1, 0, 0);
    V3.normalize(this.fwd, this.fwd);

    const yawAmt = -input.look.x * 2.6;
    if (Math.abs(yawAmt) > 1e-9) {
      Q4.fromAxisAngle(_pQ, this.up, yawAmt);
      V3.rotQuat(this.fwd, this.fwd, _pQ);
      V3.normalize(this.fwd, this.fwd);
    }
    this.pitch = clamp(this.pitch - input.look.y * 2.6, -1.45, 1.45);
    V3.cross(this.right, this.fwd, this.up);
    V3.normalize(this.right, this.right);

    const wish = _pWish;
    V3.zero(wish);
    V3.addScaled(wish, wish, this.fwd, input.move.y);
    V3.addScaled(wish, wish, this.right, input.move.x);
    const wl = V3.len(wish);
    if (wl > 1) V3.scale(wish, wish, 1 / wl);

    const sprint = input.boost && input.move.y > 0.1;
    const target = sprint ? FOOT.sprintSpeed : FOOT.walkSpeed;
    const vUp = V3.dot(this.vel, this.up);
    const vTan = _pTan;
    V3.addScaled(vTan, this.vel, this.up, -vUp);
    const control = this.grounded ? 1 : 0.30;
    V3.scale(_pDes, wish, target);
    V3.lerp(vTan, vTan, _pDes, 1 - Math.exp(-FOOT.accel * control * dt / Math.max(target, 1)));

    let newVUp = vUp - S.gravity * dt;
    this.jetting = false;
    if (input.jump && this.jetFuel > 0.02) {
      if (this.grounded && this.jetFuel > FOOT.jetFuelMax * 0.98) {
        newVUp = FOOT.jumpSpeed;
        this.grounded = false;
        game.audio.jump();
      } else {
        newVUp += FOOT.jetThrust * dt;
        this.jetFuel = Math.max(0, this.jetFuel - dt);
        this.jetting = true;
      }
    } else {
      this.jetFuel = Math.min(FOOT.jetFuelMax, this.jetFuel + dt * FOOT.jetRefill * (this.grounded ? 3.5 : 0.5));
    }

    V3.addScaled(this.vel, vTan, this.up, newVUp);
    V3.addScaled(this.pos, this.pos, this.vel, dt);

    /* Collide in the station's own frame, then take the velocity component
       along whichever axis was clamped back out. */
    Station.toLocal(_pLocal, this.pos);
    const eyeY = R.floor + FOOT.eyeHeight;
    const wasAir = !this.grounded;
    this.grounded = false;
    if (_pLocal[1] <= eyeY + 0.02) {
      _pLocal[1] = eyeY;
      this.grounded = true;
      const vn = V3.dot(this.vel, this.up);
      if (vn < 0) V3.addScaled(this.vel, this.vel, this.up, -vn);
      if (wasAir) game.audio.land();
      V3.scale(this.vel, this.vel, Math.exp(-dt * (wl > 0.05 ? 1.2 : 9.0)));
    } else if (_pLocal[1] > R.roof - 0.5) {
      _pLocal[1] = R.roof - 0.5;
      const vn = V3.dot(this.vel, this.up);
      if (vn > 0) V3.addScaled(this.vel, this.vel, this.up, -vn);
    }
    const wallX = clamp(_pLocal[0], -R.x + 2.5, R.x - 2.5);
    if (wallX !== _pLocal[0]) {
      _pLocal[0] = wallX;
      V3.set(_pTmp, 1, 0, 0); Station.axis(_pTmp2, _pTmp);
      V3.addScaled(this.vel, this.vel, _pTmp2, -V3.dot(this.vel, _pTmp2));
    }
    const wallZ = clamp(_pLocal[2], R.front + 2.5, R.back - 2.5);
    if (wallZ !== _pLocal[2]) {
      _pLocal[2] = wallZ;
      V3.set(_pTmp, 0, 0, 1); Station.axis(_pTmp2, _pTmp);
      V3.addScaled(this.vel, this.vel, _pTmp2, -V3.dot(this.vel, _pTmp2));
    }
    Station.toWorld(this.pos, _pLocal);

    this.altitude = 0;
    this.inWater = false;
    this.speed = V3.len(this.vel);
    const vUpNow = V3.dot(this.vel, this.up);
    const planar = Math.hypot(
      this.vel[0] - this.up[0] * vUpNow,
      this.vel[1] - this.up[1] * vUpNow,
      this.vel[2] - this.up[2] * vUpNow);
    this.groundSpeed = planar;
    this.climbRate = vUpNow;

    V3.copy(_pBody, this.fwd);
    if (planar > 1.2) {
      V3.addScaled(_pBody, this.vel, this.up, -vUpNow);
      V3.normalize(_pBody, _pBody);
      V3.lerp(_pBody, _pBody, this.fwd, 0.35);
    }
    V3.planeProject(_pBody, _pBody, this.up);
    if (V3.lenSq(_pBody) > 1e-8) {
      V3.normalize(_pBody, _pBody);
      const prevX = V3.dot(this.bodyFwd, this.right);
      V3.lerp(this.bodyFwd, this.bodyFwd, _pBody, 1 - Math.exp(-dt * 11));
      V3.planeProject(this.bodyFwd, this.bodyFwd, this.up);
      V3.normalize(this.bodyFwd, this.bodyFwd);
      this.turnRate = (V3.dot(this.bodyFwd, this.right) - prevX) / Math.max(dt, 1e-4);
    }

    if (this.grounded && planar > 0.6) {
      const prev = this.bob;
      this.bob += dt * planar * 1.15;
      if (Math.floor(prev / PI) !== Math.floor(this.bob / PI)) game.audio.step(false);
    }
    this.headBob = damp(this.headBob, this.grounded ? Math.sin(this.bob) * Math.min(planar / 8, 1) * 0.11 : 0, 12, dt);

    const look = _pLook;
    V3.scale(look, this.fwd, Math.cos(this.pitch));
    V3.addScaled(look, look, this.up, Math.sin(this.pitch));
    V3.normalize(look, look);
    V3.cross(_pRight2, look, this.up);
    if (V3.lenSq(_pRight2) < 1e-8) V3.copy(_pRight2, this.right);
    V3.normalize(_pRight2, _pRight2);
    V3.cross(_pUp2, _pRight2, look);
    V3.normalize(_pUp2, _pUp2);
    Q4.fromBasis(this.rot, _pRight2, _pUp2, look);

    this.nearShip = V3.dist(this.pos, game.ship.pos) < FOOT.boardRange;
  }

  update(dt, input, planet, game) {
    if (this.station) { this.updateInStation(dt, input, game); return; }
    if (!planet) return;

    V3.sub(_pRel, this.pos, planet.pos);
    const r = V3.len(_pRel);
    const dir = V3.scale(_pDir, _pRel, 1 / r);

    /* Re-derive the local frame; `up` changes continuously as we walk. */
    const prevUp = V3.copy(_pPrevUp, this.up);
    V3.copy(this.up, dir);

    /* Carry the heading across the change in up so walking doesn't drift. */
    V3.planeProject(this.fwd, this.fwd, this.up);
    if (V3.lenSq(this.fwd) < 1e-8) {
      V3.cross(this.fwd, this.up, _pAxis);
      if (V3.lenSq(this.fwd) < 1e-8) V3.set(this.fwd, 1, 0, 0);
    }
    V3.normalize(this.fwd, this.fwd);

    /* ---- look ---- */
    const yawAmt = -input.look.x * 2.6;
    if (Math.abs(yawAmt) > 1e-9) {
      Q4.fromAxisAngle(_pQ, this.up, yawAmt);
      V3.rotQuat(this.fwd, this.fwd, _pQ);
      V3.normalize(this.fwd, this.fwd);
    }
    this.pitch = clamp(this.pitch - input.look.y * 2.6, -1.45, 1.45);
    V3.cross(this.right, this.fwd, this.up);
    V3.normalize(this.right, this.right);

    /* ---- ground ---- */
    const eyeH = FOOT.eyeHeight + this.rideHeight;
    const groundR = planet.surfaceRadius(dir[0], dir[1], dir[2]);
    const seaR = planet.hasWater ? planet.seaRadius : -1;
    const floorR = Math.max(groundR, seaR > 0 ? seaR - 0.4 : -1e9);
    const feetR = r - eyeH;
    const altitude = feetR - floorR;
    this.altitude = altitude;
    this.inWater = seaR > 0 && feetR < seaR;

    const gravity = planet.gravity * Math.pow(planet.radius / r, 2);

    /* ---- movement ---- */
    const wish = _pWish;
    V3.zero(wish);
    V3.addScaled(wish, wish, this.fwd, input.move.y);
    V3.addScaled(wish, wish, this.right, input.move.x);
    const wl = V3.len(wish);
    if (wl > 1) V3.scale(wish, wish, 1 / wl);

    /* An animal carries you faster than your own legs, and a mounted sprint is
       the only way to cross a continent without the ship. */
    const sprint = input.boost && input.move.y > 0.1;
    const mnt = this.mount;
    const base = mnt
      ? (sprint ? mnt.sp.rideSpeed : mnt.sp.run * 0.62)
      : (sprint ? FOOT.sprintSpeed : FOOT.walkSpeed);
    const target = base * (this.inWater ? 0.55 : 1);

    /* Split velocity into surface-tangential and vertical parts. */
    const vUp = V3.dot(this.vel, this.up);
    const vTan = _pTan;
    V3.addScaled(vTan, this.vel, this.up, -vUp);

    const control = this.grounded ? 1 : 0.28;
    const desired = _pDes;
    V3.scale(desired, wish, target);
    V3.lerp(vTan, vTan, desired, 1 - Math.exp(-FOOT.accel * control * dt / Math.max(target, 1)));

    let newVUp = vUp - gravity * dt * (this.inWater ? 0.25 : 1);

    /* ---- jetpack ---- */
    this.jetting = false;
    if (mnt) {
      /* No jetpack from the saddle — the animal leaps instead. */
      if (input.jump && this.grounded) {
        newVUp = FOOT.jumpSpeed * 1.5;
        this.grounded = false;
        game.audio.jump();
      }
    } else if (input.jump && this.jetFuel > 0.02) {
      if (this.grounded && this.jetFuel > FOOT.jetFuelMax * 0.98) {
        newVUp = FOOT.jumpSpeed;
        this.grounded = false;
        game.audio.jump();
      } else {
        newVUp += FOOT.jetThrust * dt;
        this.jetFuel = Math.max(0, this.jetFuel - dt);
        this.jetting = true;
      }
    } else if (this.grounded) {
      this.jetFuel = Math.min(FOOT.jetFuelMax, this.jetFuel + dt * FOOT.jetRefill * 3.5);
    } else {
      this.jetFuel = Math.min(FOOT.jetFuelMax, this.jetFuel + dt * FOOT.jetRefill * 0.5);
    }
    if (this.inWater) newVUp += gravity * 0.85 * dt;    // buoyancy

    V3.addScaled(this.vel, vTan, this.up, newVUp);
    V3.addScaled(this.pos, this.pos, this.vel, dt);

    /* ---- resolve against the terrain ---- */
    V3.sub(_pRel, this.pos, planet.pos);
    const r2 = V3.len(_pRel);
    V3.scale(_pDir, _pRel, 1 / r2);
    const g2 = planet.surfaceRadius(_pDir[0], _pDir[1], _pDir[2]);
    const targetR = g2 + eyeH;

    if (r2 <= targetR) {
      V3.addScaled(this.pos, planet.pos, _pDir, targetR);
      const vn = V3.dot(this.vel, _pDir);
      if (vn < 0) {
        if (vn < -18 && !this.inWater) game.impact(Math.min(1, -vn / 45) * 0.5);
        V3.addScaled(this.vel, this.vel, _pDir, -vn);
      }
      if (!this.grounded) game.audio.land();
      this.grounded = true;
      /* Friction only once we're actually on the ground. */
      V3.scale(this.vel, this.vel, Math.exp(-dt * (wl > 0.05 ? 1.2 : 9.0)));
    } else {
      this.grounded = altitude < 0.25;
    }

    this.speed = V3.len(this.vel);

    /* ---- head bob & footsteps ---- */
    const vUpNow = V3.dot(this.vel, this.up);
    const planar = Math.hypot(
      this.vel[0] - this.up[0] * vUpNow,
      this.vel[1] - this.up[1] * vUpNow,
      this.vel[2] - this.up[2] * vUpNow
    );
    this.groundSpeed = planar;
    this.climbRate = vUpNow;

    /* ---- body facing ----
       The model turns toward where it is going when it is moving and toward
       where you are looking when it is not, easing between the two.  Turning
       the body straight onto the look vector makes the character pirouette
       every time the mouse twitches; ignoring the look vector entirely leaves
       it facing away from you when you stop. */
    V3.copy(_pBody, this.fwd);
    if (planar > 1.2) {
      V3.addScaled(_pBody, this.vel, this.up, -vUpNow);
      V3.normalize(_pBody, _pBody);
      /* Blend back toward the look direction so a strafe reads as a lean, not
         as walking sideways with the head screwed round. */
      V3.lerp(_pBody, _pBody, this.fwd, 0.35);
    }
    V3.planeProject(_pBody, _pBody, this.up);
    if (V3.lenSq(_pBody) > 1e-8) {
      V3.normalize(_pBody, _pBody);
      const prevX = V3.dot(this.bodyFwd, this.right);
      V3.lerp(this.bodyFwd, this.bodyFwd, _pBody, 1 - Math.exp(-dt * 11));
      V3.planeProject(this.bodyFwd, this.bodyFwd, this.up);
      V3.normalize(this.bodyFwd, this.bodyFwd);
      this.turnRate = (V3.dot(this.bodyFwd, this.right) - prevX) / Math.max(dt, 1e-4);
    }
    if (this.grounded && planar > 0.6) {
      const prev = this.bob;
      this.bob += dt * planar * 1.15;
      if (Math.floor(prev / PI) !== Math.floor(this.bob / PI)) game.audio.step(this.inWater);
    }
    this.headBob = damp(this.headBob, this.grounded ? Math.sin(this.bob) * Math.min(planar / 8, 1) * 0.11 : 0, 12, dt);

    /* ---- orientation quaternion for the camera ---- */
    const look = _pLook;
    V3.scale(look, this.fwd, Math.cos(this.pitch));
    V3.addScaled(look, look, this.up, Math.sin(this.pitch));
    V3.normalize(look, look);
    const rgt = _pRight2;
    V3.cross(rgt, look, this.up);
    if (V3.lenSq(rgt) < 1e-8) V3.copy(rgt, this.right);
    V3.normalize(rgt, rgt);
    const upv = _pUp2;
    V3.cross(upv, rgt, look);
    V3.normalize(upv, upv);
    Q4.fromBasis(this.rot, rgt, upv, look);

    /* ---- drive the mount from the rider ---- */
    if (mnt) {
      V3.sub(_pRel, this.pos, planet.pos);
      V3.normalize(mnt.dir, _pRel);
      V3.copy(mnt.heading, this.bodyFwd);
      V3.planeProject(mnt.heading, mnt.heading, mnt.dir);
      if (V3.lenSq(mnt.heading) < 1e-8) V3.copy(mnt.heading, this.fwd);
      V3.normalize(mnt.heading, mnt.heading);
      mnt.speed = planar;
      mnt.grazeT = 0;
    }

    /* ---- can we board? ---- */
    this.nearShip = V3.dist(this.pos, game.ship.pos) < FOOT.boardRange;
  }

  eyePos(out) {
    V3.addScaled(out, this.pos, this.up, this.headBob);
    return out;
  }
}

const _pRel = V3.new(), _pDir = V3.new(), _pTmp = V3.new(), _pWish = V3.new();
const _pTan = V3.new(), _pDes = V3.new(), _pLook = V3.new(), _pRight2 = V3.new();
const _pUp2 = V3.new(), _pPrevUp = V3.new(), _pAxis = V3.new(1, 0, 0);
const _pBody = V3.new(), _pLocal = V3.new(), _pTmp2 = V3.new();
const _pQ = Q4.new();
