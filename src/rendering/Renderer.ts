import * as THREE from 'three';
import { PostProcessing } from './PostProcessing';
import type { GraphicsConfig } from '../core/SettingsManager';

/**
 * Owns the WebGLRenderer, camera and (optional) post-processing.
 * Cinematic look comes from ACES tone mapping + exposure; HDR-ish lighting is
 * approximated via physically-based materials and the procedural sky.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  private post: PostProcessing | null = null;
  private config: GraphicsConfig;
  private scene: THREE.Scene | null = null;

  constructor(canvas: HTMLCanvasElement, config: GraphicsConfig, fov: number) {
    this.config = config;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: config.antialias && !config.postProcessing,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * config.renderScale);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = config.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(
      fov,
      window.innerWidth / window.innerHeight,
      0.1,
      config.viewDistance,
    );
    this.camera.position.set(0, 3, 0);

    this.resize();
  }

  /** Builds the post-processing chain once the scene exists. */
  attachScene(scene: THREE.Scene): void {
    this.scene = scene;
    if (this.config.postProcessing) {
      this.post = new PostProcessing(
        this.renderer,
        scene,
        this.camera,
        this.config,
        window.innerWidth,
        window.innerHeight,
      );
    }
  }

  setExposure(v: number): void {
    this.renderer.toneMappingExposure = v;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h);
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number): void {
    if (!this.scene) return;
    if (this.post) {
      this.post.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  info(): { calls: number; triangles: number; geometries: number; textures: number } {
    const info = this.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  dispose(): void {
    this.post?.dispose();
    this.renderer.dispose();
  }
}
