/* ============================================================
   BattleCamera — lock-on chase cam with cinematic takeovers.
   ============================================================ */
import * as THREE from 'three';
import { damp, clamp, lerp, TAU, easeInOut } from '../core/utils.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class BattleCamera {
  constructor(aspect = 16 / 9) {
    this.camera = new THREE.PerspectiveCamera(52, aspect, 0.14, 1200);
    this.pos = new THREE.Vector3(0, 6, -14);
    this.look = new THREE.Vector3();
    this.fov = 52;
    this.cine = null;
    this.cineT = 0;
    this.shake = new THREE.Vector3();
    this.roll = 0;
    // manual mouse-look offsets applied on top of the lock-on framing
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.manual = false;
  }

  /** feed a mouse delta (in pixels) into the orbit offsets */
  addLook(dx, dy) {
    this.lookYaw -= dx * 0.0028;
    this.lookPitch = clamp(this.lookPitch - dy * 0.0022, -0.5, 0.95);
    // keep the yaw wrapped so it never drifts to huge values
    if (this.lookYaw > Math.PI) this.lookYaw -= TAU;
    if (this.lookYaw < -Math.PI) this.lookYaw += TAU;
  }

  recenter() { this.lookYaw = 0; this.lookPitch = 0; }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  /** dramatic camera for ultimates */
  playCinematic(kind, caster, target, dur = 2.6) {
    this.cine = { kind, caster, target, dur };
    this.cineT = 0;
  }

  cancelCinematic() { this.cine = null; }

  update(dt, self, foe, fx, snap = false) {
    const cam = this.camera;
    let targetFov = 52;

    if (this.cine) {
      this.cineT += dt;
      const k = clamp(this.cineT / this.cine.dur, 0, 1);
      const c = this.cine.caster;
      const t = this.cine.target;
      const mid = _v.copy(c.pos).setY(c.pos.y + 1.2);
      const dir = _v2.copy(t.pos).sub(c.pos).setY(0).normalize();
      const side = _v3.set(-dir.z, 0, dir.x);

      if (this.cine.kind === 'charge') {
        // low orbit around the caster
        const ang = k * 2.2;
        const r = lerp(7.5, 4.6, easeInOut(k));
        this.pos.set(
          mid.x + Math.cos(ang) * side.x * r + Math.sin(ang) * dir.x * r,
          mid.y + lerp(0.4, 2.2, k),
          mid.z + Math.cos(ang) * side.z * r + Math.sin(ang) * dir.z * r
        );
        this.look.copy(mid);
        targetFov = lerp(48, 40, k);
        this.roll = damp(this.roll, Math.sin(k * 3.2) * 0.06, 4, dt);
      } else {
        // side shot framing the beam
        const r = lerp(9, 15, k);
        this.pos.copy(mid)
          .addScaledVector(side, r * 0.85)
          .addScaledVector(dir, lerp(2, 9, k));
        this.pos.y = mid.y + lerp(1.8, 4.2, k);
        this.look.copy(mid).addScaledVector(dir, lerp(4, 14, k));
        targetFov = lerp(56, 66, k);
        this.roll = damp(this.roll, 0.04, 3, dt);
      }

      if (this.cineT >= this.cine.dur) this.cine = null;
    } else {
      this.roll = damp(this.roll, 0, 6, dt);
      // when mouse-look is off the offsets ease back to the default framing
      if (!this.manual) {
        this.lookYaw = damp(this.lookYaw, 0, 4, dt);
        this.lookPitch = damp(this.lookPitch, 0, 4, dt);
      }

      const sep = self.pos.distanceTo(foe.pos);
      const dir = _v.copy(self.pos).sub(foe.pos);
      dir.y = 0;
      if (dir.lengthSq() < 0.001) dir.set(0, 0, -1);
      dir.normalize();
      // orbit the chase direction by the mouse yaw
      if (this.lookYaw !== 0) dir.applyAxisAngle(UP, this.lookYaw);

      const dist = clamp(4.4 + sep * 0.28, 4.4, 13);
      const height = clamp(1.9 + sep * 0.075 + (self.pos.y - foe.pos.y) * 0.13, 1.5, 5.6)
        + this.lookPitch * dist * 0.85;

      // over-the-shoulder offset, otherwise the player's own back hides the foe
      const side = _v3.set(-dir.z, 0, dir.x);
      const desired = _v2.copy(self.pos)
        .addScaledVector(dir, dist)
        .addScaledVector(side, 1.35)
        .setY(self.pos.y + height);
      desired.y = Math.max(desired.y, self.world?.stage?.groundY ?? 0 + 1.2);

      const lam = snap ? 1000 : (self.state === 'boost' || self.state === 'rushin' ? 5.5 : 7.5);
      this.pos.x = damp(this.pos.x, desired.x, lam, dt);
      this.pos.y = damp(this.pos.y, desired.y, lam * 0.9, dt);
      this.pos.z = damp(this.pos.z, desired.z, lam, dt);

      // look at a point biased toward the opponent
      const lookAt = _v.copy(self.pos).lerp(foe.pos, 0.55);
      lookAt.y += 1.15 + clamp(sep * 0.022, 0, 0.9) + this.lookPitch * 1.1;
      this.look.lerp(lookAt, snap ? 1 : 1 - Math.exp(-9 * dt));

      const speed = self.vel.length();
      targetFov = 52 + clamp(speed * 0.5, 0, 14);
    }

    this.fov = damp(this.fov, targetFov, 6, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();

    fx?.shakeOffset(this.shake);
    cam.position.copy(this.pos).add(this.shake);
    cam.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    cam.lookAt(this.look);
  }
}
