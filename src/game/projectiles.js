/* ============================================================
   Projectiles — ki blasts and energy spheres.
   ============================================================ */
import * as THREE from 'three';
import { rand, clamp, TAU } from '../core/utils.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Projectile {
  constructor(world, o) {
    this.world = world;
    this.owner = o.owner;
    this.pos = o.origin.clone();
    this.dir = o.dir.clone().normalize();
    this.speed = o.speed ?? 40;
    this.radius = o.radius ?? 0.35;
    this.damage = o.damage ?? 16;
    this.life = o.life ?? 2.2;
    this.t = 0;
    this.homing = o.homing ?? 0;
    this.color = new THREE.Color(o.color ?? 0x66ddff);
    this.explode = o.explode ?? 0;
    this.ultimate = !!o.ultimate;
    this.dead = false;
    this.deflectable = true;

    this.mesh = world.fx.sphereMesh(0xffffff, this.color.getHex(), {
      intensity: this.ultimate ? 3.6 : 2.8, wobble: this.ultimate ? 0.05 : 0.02, fresnel: 1.4,
    });
    this.mesh.scale.setScalar(this.radius * 1.6);
    this.mesh.position.copy(this.pos);
  }

  update(dt) {
    this.t += dt;
    if (this.t > this.life) return this.finish(false);

    const foe = this.owner.foe;
    if (this.homing > 0 && foe && !foe.dead) {
      const want = _v.copy(foe.center(_v2)).sub(this.pos).normalize();
      this.dir.lerp(want, clamp(this.homing * dt, 0, 1)).normalize();
    }
    this.pos.addScaledVector(this.dir, this.speed * dt);
    this.mesh.position.copy(this.pos);
    this.mesh.material.uniforms.uTime.value = this.world.fx.time;
    const pulse = 1 + Math.sin(this.t * 26) * 0.08;
    this.mesh.scale.setScalar(this.radius * 1.6 * pulse);

    // trail
    this.world.fx.fx.ember.emit({
      x: this.pos.x + rand(-0.1, 0.1), y: this.pos.y + rand(-0.1, 0.1), z: this.pos.z + rand(-0.1, 0.1),
      vx: -this.dir.x * 4, vy: -this.dir.y * 4 + 1, vz: -this.dir.z * 4,
      size: this.radius * rand(1.2, 2.4), growth: -0.6, life: rand(0.16, 0.36),
      color: this.color, alpha: 0.9,
    });

    // ground
    if (this.pos.y <= this.world.stage.groundY + 0.1) return this.finish(true, true);

    // hit test
    if (foe && !foe.dead) {
      const c = foe.center(_v);
      const dx = this.pos.x - c.x, dy = this.pos.y - c.y, dz = this.pos.z - c.z;
      const rr = this.radius + 0.75 * (foe.spec.scale ?? 1);
      if (dx * dx + dy * dy + dz * dz < rr * rr) {
        foe.takeHit({
          damage: this.damage, kind: this.explode ? 'blast' : 'light',
          from: this.owner, point: this.pos.clone(), color: this.color.getHex(),
          knock: this.ultimate ? 42 : this.explode ? 26 : 12,
        });
        return this.finish(true);
      }
    }
    return true;
  }

  finish(impact, ground = false) {
    if (this.dead) return false;
    this.dead = true;
    const fx = this.world.fx;
    if (impact) {
      const r = this.explode || (this.radius * 4);
      fx.explosion(this.pos, this.color.getHex(), r, { shake: this.ultimate ? 2.2 : 0.5 });
      this.world.audio.explosion(clamp(r / 8, 0.35, 1.5));
      if (ground) fx.groundImpact(this.pos, clamp(r / 6, 0.5, 2));
    }
    fx.recycle('sphere', this.mesh);
    return false;
  }

  dispose() {
    if (!this.dead) { this.dead = true; this.world.fx.recycle('sphere', this.mesh); }
  }
}
