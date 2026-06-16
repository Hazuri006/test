import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import type { GraphicsConfig } from '../core/SettingsManager';

/**
 * Optional post-processing chain. RenderPass renders the scene linearly (tone
 * mapping is deferred), UnrealBloomPass adds a very modest glow, SMAA smooths
 * edges, and OutputPass performs tone mapping + sRGB conversion at the screen.
 */
export class PostProcessing {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass | null = null;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    config: GraphicsConfig,
    width: number,
    height: number,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(scene, camera));

    if (config.bloom) {
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.28, // strength — deliberately subtle
        0.5, // radius
        0.82, // luminance threshold
      );
      this.composer.addPass(this.bloom);
    }

    this.composer.addPass(new OutputPass());

    if (config.antialias) {
      this.composer.addPass(new SMAAPass(width, height));
    }
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloom?.setSize(width, height);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
