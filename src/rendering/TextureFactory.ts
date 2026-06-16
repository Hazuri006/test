import * as THREE from 'three';
import { RNG } from '../core/RNG';

/**
 * Generates procedural textures on the CPU via 2D canvas.
 * All assets are original and generated at runtime — nothing is loaded from
 * disk or copied from any third party. Textures are cached by key.
 */
export class TextureFactory {
  private static cache = new Map<string, THREE.Texture>();

  private static makeCanvas(size: number): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    return { canvas, ctx };
  }

  private static finalize(canvas: HTMLCanvasElement, srgb: boolean, repeat = 1): THREE.Texture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  /** Realistic-ish plank wood albedo with grain, knots, tint variation. */
  static woodAlbedo(seed = 1, size = 256): THREE.Texture {
    const key = `wood-albedo-${seed}-${size}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const { canvas, ctx } = this.makeCanvas(size);
    const rng = new RNG(RNG.hashSeed('wood', seed));
    const baseH = rng.range(24, 36);
    ctx.fillStyle = `hsl(${baseH}, 42%, 38%)`;
    ctx.fillRect(0, 0, size, size);
    // Longitudinal grain.
    for (let i = 0; i < 220; i++) {
      const y = rng.range(0, size);
      const light = rng.range(-14, 14);
      ctx.strokeStyle = `hsla(${baseH + rng.range(-4, 4)}, 40%, ${38 + light}%, 0.4)`;
      ctx.lineWidth = rng.range(0.5, 2.2);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * rng.range(0, 2));
      }
      ctx.stroke();
    }
    // Knots.
    for (let i = 0; i < rng.int(1, 3); i++) {
      const cx = rng.range(0, size);
      const cy = rng.range(0, size);
      for (let r = 12; r > 0; r--) {
        ctx.strokeStyle = `hsla(${baseH - 6}, 50%, ${22 + r}%, 0.5)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 1.3, r, rng.range(0, Math.PI), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Plank seams.
    ctx.strokeStyle = 'rgba(20,12,6,0.55)';
    ctx.lineWidth = 2;
    const planks = 4;
    for (let i = 1; i < planks; i++) {
      const y = (i / planks) * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    // Damp/weathering blotches.
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `hsla(${baseH - 8}, 30%, 20%, ${rng.range(0.02, 0.08)})`;
      const r = rng.range(6, 28);
      ctx.beginPath();
      ctx.arc(rng.range(0, size), rng.range(0, size), r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = this.finalize(canvas, true);
    this.cache.set(key, tex);
    return tex;
  }

  /** Generic value-noise normal map. */
  static noiseNormal(seed = 1, size = 256, strength = 1): THREE.Texture {
    const key = `normal-${seed}-${size}-${strength}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const { canvas, ctx } = this.makeCanvas(size);
    const img = ctx.createImageData(size, size);
    const rng = new RNG(RNG.hashSeed('normal', seed));
    const height = new Float32Array(size * size);
    for (let i = 0; i < height.length; i++) height[i] = rng.next();
    // Cheap multi-octave smoothing.
    const smooth = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        let w = 0;
        for (let oy = -2; oy <= 2; oy++) {
          for (let ox = -2; ox <= 2; ox++) {
            const sx = (x + ox + size) % size;
            const sy = (y + oy + size) % size;
            sum += height[sy * size + sx];
            w++;
          }
        }
        smooth[y * size + x] = sum / w;
      }
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const l = smooth[y * size + ((x - 1 + size) % size)];
        const r = smooth[y * size + ((x + 1) % size)];
        const u = smooth[((y - 1 + size) % size) * size + x];
        const d = smooth[((y + 1) % size) * size + x];
        const nx = (l - r) * strength;
        const ny = (u - d) * strength;
        const nz = 1;
        const len = Math.hypot(nx, ny, nz);
        const idx = (y * size + x) * 4;
        img.data[idx] = ((nx / len) * 0.5 + 0.5) * 255;
        img.data[idx + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        img.data[idx + 2] = ((nz / len) * 0.5 + 0.5) * 255;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = this.finalize(canvas, false);
    this.cache.set(key, tex);
    return tex;
  }

  /** Sandy beach albedo with grain speckle. */
  static sandAlbedo(seed = 1, size = 256): THREE.Texture {
    const key = `sand-${seed}-${size}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const { canvas, ctx } = this.makeCanvas(size);
    const rng = new RNG(RNG.hashSeed('sand', seed));
    ctx.fillStyle = '#d8c79b';
    ctx.fillRect(0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = rng.range(-18, 18);
      img.data[i] = Math.min(255, 216 + n);
      img.data[i + 1] = Math.min(255, 199 + n);
      img.data[i + 2] = Math.min(255, 155 + n * 0.8);
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(${rng.int(90, 140)},${rng.int(80, 120)},${rng.int(50, 90)},0.5)`;
      ctx.fillRect(rng.range(0, size), rng.range(0, size), 1.4, 1.4);
    }
    const tex = this.finalize(canvas, true);
    this.cache.set(key, tex);
    return tex;
  }

  /** Brushed/oxidised metal albedo. */
  static metalAlbedo(seed = 1, size = 256): THREE.Texture {
    const key = `metal-${seed}-${size}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const { canvas, ctx } = this.makeCanvas(size);
    const rng = new RNG(RNG.hashSeed('metal', seed));
    ctx.fillStyle = '#8b9099';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 400; i++) {
      ctx.strokeStyle = `rgba(${rng.int(120, 180)},${rng.int(125, 185)},${rng.int(130, 190)},0.25)`;
      ctx.lineWidth = rng.range(0.4, 1.4);
      const y = rng.range(0, size);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + rng.range(-2, 2));
      ctx.stroke();
    }
    // Rust spots.
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${rng.int(120, 160)},${rng.int(60, 90)},${rng.int(30, 50)},${rng.range(0.1, 0.4)})`;
      ctx.beginPath();
      ctx.arc(rng.range(0, size), rng.range(0, size), rng.range(2, 10), 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = this.finalize(canvas, true);
    this.cache.set(key, tex);
    return tex;
  }

  /** Radial soft particle sprite (foam, splash, smoke). */
  static softParticle(size = 64, color = '#ffffff'): THREE.Texture {
    const key = `particle-${size}-${color}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const { canvas, ctx } = this.makeCanvas(size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, color);
    g.addColorStop(0.4, color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cache.set(key, tex);
    return tex;
  }

  static disposeAll(): void {
    for (const tex of this.cache.values()) tex.dispose();
    this.cache.clear();
  }
}
