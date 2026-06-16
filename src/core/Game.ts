import * as THREE from 'three';
import { EventBus, type GameEvents } from './EventBus';
import { SettingsManager } from './SettingsManager';
import { InputManager } from './InputManager';
import { AudioManager } from './AudioManager';
import { SaveManager } from './SaveManager';
import { RNG } from './RNG';

import { Renderer } from '../rendering/Renderer';
import { Sky } from '../rendering/Sky';
import { OceanManager } from '../world/ocean/OceanManager';
import { DayNightCycle } from '../world/DayNightCycle';
import { WeatherSystem, type WeatherKind } from '../world/WeatherSystem';
import { IslandManager, type IslandSnapshot } from '../world/IslandManager';
import { FloatingDebrisManager } from '../world/FloatingDebrisManager';

import { Inventory, type InventorySnapshot } from '../inventory/Inventory';
import { ItemDatabase } from '../inventory/ItemDatabase';
import { CraftingSystem } from '../crafting/CraftingSystem';
import { PlayerStats, type StatsSnapshot } from '../player/PlayerStats';
import { PlayerController } from '../player/PlayerController';

import { RaftManager, type RaftSnapshot } from '../raft/RaftManager';
import { CELL_SIZE } from '../raft/RaftMeshes';
import { BuildingSystem } from '../raft/BuildingSystem';
import { Shark, type SharkSnapshot } from '../entities/Shark';

import { HookSystem } from '../systems/HookSystem';
import { FishingSystem } from '../systems/FishingSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { ProcessingSystem } from '../systems/ProcessingSystem';
import { InteractionSystem } from '../systems/InteractionSystem';

import { HUD } from '../ui/HUD';
import { InventoryScreen } from '../ui/InventoryScreen';
import { MainMenu, SettingsMenu, PauseMenu, DeathScreen, LoadingScreen } from '../ui/Menus';

export const SAVE_VERSION = 1;

export interface GameState {
  seed: number;
  player: ReturnType<PlayerController['serialize']>;
  stats: StatsSnapshot;
  inventory: InventorySnapshot;
  crafting: { unlocked: string[] };
  raft: RaftSnapshot;
  islands: IslandSnapshot;
  shark: SharkSnapshot;
  time: { hour: number; day: number };
  weather: { kind: WeatherKind };
  processing: ReturnType<ProcessingSystem['serialize']>;
}

type Mode = 'menu' | 'playing' | 'paused' | 'dead';

/**
 * Top-level orchestrator: owns the scene graph, all subsystems and the UI, and
 * runs the fixed-clamped game loop. Wires inputs to gameplay and manages
 * save/load and the menu/play/pause/death state machine.
 */
export class Game {
  private readonly bus = new EventBus<GameEvents>();
  private readonly settings = new SettingsManager();
  private readonly input: InputManager;
  private readonly audio: AudioManager;
  private readonly save = new SaveManager<GameState>(SAVE_VERSION);

  private readonly scene = new THREE.Scene();
  private readonly renderer: Renderer;
  private readonly sky: Sky;
  private readonly ocean: OceanManager;
  private readonly dayNight: DayNightCycle;
  private readonly weather: WeatherSystem;
  private readonly islands: IslandManager;
  private readonly debris: FloatingDebrisManager;

  private readonly inventory = new Inventory(24, 5);
  private readonly stats: PlayerStats;
  private readonly crafting: CraftingSystem;
  private readonly player: PlayerController;
  private readonly raft: RaftManager;
  private readonly building: BuildingSystem;
  private readonly shark: Shark;

  private readonly hook: HookSystem;
  private readonly fishing: FishingSystem;
  private readonly combat: CombatSystem;
  private readonly processing: ProcessingSystem;
  private readonly interaction: InteractionSystem;

  private readonly hud: HUD;
  private readonly invScreen: InventoryScreen;
  private readonly mainMenu: MainMenu;
  private readonly settingsMenu: SettingsMenu;
  private readonly pauseMenu: PauseMenu;
  private readonly deathScreen: DeathScreen;
  private readonly loading: LoadingScreen;

  private mode: Mode = 'menu';
  private seed = 12345;
  private slot = 'auto';
  private last = performance.now();
  private autosaveTimer = 0;
  private menuCamAngle = 0;
  private readonly fog: THREE.FogExp2;
  private readonly tmpAim = new THREE.Vector3();
  private readonly raftCenter = new THREE.Vector3();
  private readonly lookDir = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    const graphics = this.settings.graphics();
    this.input = new InputManager(canvas, this.settings);
    this.audio = new AudioManager(this.settings);
    this.renderer = new Renderer(canvas, graphics, this.settings.get().fov);

    // Scene + atmosphere.
    this.fog = new THREE.FogExp2(0xbfd8e8, 0.0016);
    this.scene.fog = this.fog;
    this.sky = new Sky(graphics.shadowMapSize, graphics.shadowsEnabled);
    this.scene.add(this.sky.group);
    this.ocean = new OceanManager(graphics);
    this.scene.add(this.ocean.mesh);
    this.dayNight = new DayNightCycle(this.bus);
    this.weather = new WeatherSystem(this.bus, graphics);
    this.scene.add(this.weather.group);
    this.islands = new IslandManager(this.scene, this.bus, graphics);
    this.debris = new FloatingDebrisManager(
      this.scene,
      this.ocean,
      this.bus,
      graphics.debrisBudget,
    );

    // Player + raft + entities.
    this.stats = new PlayerStats(this.bus);
    this.crafting = new CraftingSystem(this.inventory, this.bus);
    this.player = new PlayerController(
      this.renderer.camera,
      this.input,
      this.settings,
      this.audio,
      this.stats,
    );
    this.raft = new RaftManager(this.scene, this.bus);
    this.building = new BuildingSystem(this.scene, this.raft, this.inventory, this.bus);
    this.shark = new Shark(this.scene, this.bus, this.ocean);

    // Systems.
    this.hook = new HookSystem(
      this.scene,
      this.renderer.camera,
      this.input,
      this.inventory,
      this.debris,
      this.ocean,
      this.bus,
      this.audio,
    );
    this.fishing = new FishingSystem(
      this.scene,
      this.renderer.camera,
      this.input,
      this.inventory,
      this.ocean,
      this.bus,
      this.audio,
    );
    this.combat = new CombatSystem(
      this.islands,
      () => this.shark,
      this.inventory,
      this.audio,
      this.bus,
    );
    this.processing = new ProcessingSystem(
      this.inventory,
      this.audio,
      this.bus,
      () => !this.dayNight.isNight(),
    );
    this.interaction = new InteractionSystem(
      this.raft,
      this.islands,
      this.debris,
      this.processing,
      this.inventory,
      this.bus,
      () => this.openResearch(),
    );

    this.renderer.attachScene(this.scene);

    // UI.
    this.hud = new HUD(uiRoot);
    this.hud.onHotbarClick = (i) => this.inventory.selectHotbar(i);
    this.invScreen = new InventoryScreen(uiRoot, this.inventory, this.crafting, {
      onUseItem: (i) => this.useItem(i),
      onEnterBuild: (id) => this.building.setActive(id),
      onDropItem: (i) => this.dropItem(i),
    });
    this.mainMenu = new MainMenu(uiRoot, {
      onNew: (slot) => void this.newGame(slot),
      onContinue: (slot) => void this.continueGame(slot),
      onLoad: (slot) => void this.continueGame(slot),
      onDelete: (slot) => this.save.delete(slot),
      getSaves: () => this.save.list(),
      onSettings: () => this.settingsMenu.show(),
    });
    this.settingsMenu = new SettingsMenu(uiRoot, this.settings, {
      onClose: () => this.settingsMenu.hide(),
      onApplyLive: () => this.applyLiveSettings(),
    });
    this.pauseMenu = new PauseMenu(uiRoot, {
      onResume: () => this.resume(),
      onSave: () => void this.autosave(true),
      onSettings: () => this.settingsMenu.show(),
      onQuit: () => this.quitToMenu(),
    });
    this.deathScreen = new DeathScreen(uiRoot, {
      onRespawn: () => this.respawn(),
      onQuit: () => this.quitToMenu(),
    });
    this.loading = new LoadingScreen(uiRoot);
    this.loading.hide();

    this.hud.buildHotbar(this.inventory);
    this.hud.hide();

    this.wireEvents(canvas);
    this.bootMenuScene();
    requestAnimationFrame(() => this.frame());
  }

  // --------------------------------------------------------------------------
  private wireEvents(canvas: HTMLCanvasElement): void {
    window.addEventListener('resize', () => this.renderer.resize());

    canvas.addEventListener('mousedown', () => {
      this.audio.resume();
      if (this.mode === 'playing' && !this.invScreen.open) this.input.requestPointerLock();
    });

    this.bus.on('notify', ({ message, kind }) => this.hud.notify(message, kind ?? 'info'));
    this.bus.on('player:statsChanged', (s) =>
      this.hud.setStats({ ...s, temperature: this.stats.temperature }),
    );
    this.bus.on('inventory:changed', () => this.hud.refreshHotbar(this.inventory));
    this.inventory.onChange(() => this.hud.refreshHotbar(this.inventory));
    this.bus.on('player:damage', ({ amount }) => this.hud.flashDamage(Math.min(1, amount / 20)));
    this.bus.on('player:death', ({ cause }) => this.onDeath(cause));
    this.bus.on('item:collected', ({ itemId, amount }) => {
      const def = ItemDatabase.get(itemId);
      this.bus.emit('notify', { message: `+${amount} ${def.name}`, kind: 'good' });
    });
    this.bus.on('inventory:full', ({ itemId }) =>
      this.bus.emit('notify', { message: `Inventaire plein (${itemId})`, kind: 'warn' }),
    );

    // Shark consequences.
    this.shark.setActions({
      bitePlayer: () => {
        this.stats.damage(18, 'requin');
        this.audio.play('sharkGrowl', 1);
        this.audio.play('damage', 0.8);
      },
      attackRaft: (pos) => {
        const f = this.raft.nearestFoundation(pos);
        if (f) this.raft.damagePiece(f, 14);
        this.audio.play('sharkGrowl', 0.8);
      },
      dropLoot: () => {
        this.inventory.add('scrap', 3);
        this.inventory.add('raw_fish', 2);
        this.bus.emit('notify', {
          message: 'Le requin laisse 3 ferraille et 2 poissons',
          kind: 'good',
        });
      },
    });
  }

  // --------------------------------------------------------------------------
  private bootMenuScene(): void {
    this.islands.generate(this.seed);
    this.raft.initStarterRaft();
    this.player.spawn(new THREE.Vector3(CELL_SIZE * 0.5, 3, CELL_SIZE * 0.5));
    this.dayNight.setHour(8);
    this.mainMenu.show();
  }

  private async newGame(slot: string): Promise<void> {
    this.loading.show();
    this.loading.set('Génération du monde…');
    this.slot = slot;
    this.seed = RNG.hashSeed(slot, Date.now());
    await this.delay(60);

    this.islands.generate(this.seed);
    this.raft.initStarterRaft();
    this.inventory.clear();
    this.inventory.add('hook', 1);
    this.inventory.add('wood', 4);
    this.inventory.add('plastic', 2);
    this.inventory.selectHotbar(0);
    this.crafting.load({ unlocked: [] });
    this.stats.reset();
    this.dayNight.setHour(8);
    this.dayNight.day = 1;
    this.weather.setWeather('clear');

    this.raftCenter.set(CELL_SIZE * 0.5, 1, CELL_SIZE * 0.5);
    this.player.spawn(new THREE.Vector3(CELL_SIZE * 0.5, 2.5, CELL_SIZE * 0.5));
    this.spawnSharkNearRaft();
    this.debris.prime(this.player.position);

    this.startPlaying(true);
    this.loading.hide();
    await this.autosave(false);
  }

  private async continueGame(slot: string): Promise<void> {
    this.loading.show();
    this.loading.set('Chargement…');
    const state = await this.save.load(slot);
    await this.delay(60);
    if (!state) {
      this.loading.hide();
      this.bus.emit('notify', { message: 'Sauvegarde introuvable ou corrompue', kind: 'bad' });
      return;
    }
    this.slot = slot;
    this.applyState(state);
    this.startPlaying(false);
    this.loading.hide();
  }

  private applyState(s: GameState): void {
    this.seed = s.seed;
    this.islands.generate(this.seed);
    this.islands.load(s.islands);
    this.raft.load(s.raft);
    this.inventory.load(s.inventory);
    this.crafting.load(s.crafting);
    this.stats.load(s.stats);
    this.player.load(s.player);
    this.dayNight.load(s.time);
    this.weather.load(s.weather);
    this.shark.load(s.shark);
    this.processing.load(s.processing);
    this.debris.prime(this.player.position);
  }

  private captureState(): GameState {
    return {
      seed: this.seed,
      player: this.player.serialize(),
      stats: this.stats.serialize(),
      inventory: this.inventory.serialize(),
      crafting: this.crafting.serialize(),
      raft: this.raft.serialize(),
      islands: this.islands.serialize(),
      shark: this.shark.serialize(),
      time: this.dayNight.serialize(),
      weather: this.weather.serialize(),
      processing: this.processing.serialize(),
    };
  }

  private startPlaying(_isNew: boolean): void {
    this.mode = 'playing';
    this.mainMenu.hide();
    this.settingsMenu.hide();
    this.pauseMenu.hide();
    this.deathScreen.hide();
    this.hud.show();
    this.input.requestPointerLock();
    this.audio.resume();
  }

  private spawnSharkNearRaft(): void {
    this.raft.center(this.raftCenter);
    const a = Math.random() * Math.PI * 2;
    this.shark.spawn(
      new THREE.Vector3(
        this.raftCenter.x + Math.cos(a) * 40,
        this.ocean.getHeight(0, 0) - 3,
        this.raftCenter.z + Math.sin(a) * 40,
      ),
    );
  }

  // --------------------------------------------------------------------------
  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    this.handleGlobalKeys();
    const sim = this.mode === 'playing' && !this.invScreen.open;

    // Atmosphere always animates for ambiance.
    const skyParams = this.dayNight.update(dt);
    const camPos = this.renderer.camera.position;
    this.sky.apply(skyParams, camPos);
    this.ocean.setSkyUniforms({
      zenith: skyParams.zenith,
      horizon: skyParams.horizon,
      sunColor: skyParams.sunColor,
      sunDir: skyParams.sunDir,
      sunIntensity: skyParams.sunIntensity,
      fog: skyParams.fog,
    });
    this.weather.update(dt, camPos, this.dayNight.isNight());
    this.ocean.setSeaState(this.weather.seaAmplitude);
    this.fog.color.copy(skyParams.fog);
    this.fog.density = 0.0014 * this.weather.fogDensity;
    this.renderer.setExposure(1.05 + this.weather.flash * 0.8);
    this.audio.setWind(this.weather.windIntensity);
    this.ocean.update(dt, camPos);

    if (this.mode === 'menu') {
      this.updateMenuCamera(dt);
    } else if (sim) {
      this.updatePlay(dt);
    }

    // Raft floats even when paused so it doesn't jump on resume.
    this.raft.update(dt, this.ocean);

    this.renderer.render(dt);
    this.input.endFrame();
    requestAnimationFrame(() => this.frame());
  }

  private updateMenuCamera(dt: number): void {
    this.menuCamAngle += dt * 0.05;
    const cam = this.renderer.camera;
    cam.position.set(Math.cos(this.menuCamAngle) * 14, 6, Math.sin(this.menuCamAngle) * 14);
    cam.lookAt(0, 1.5, 0);
  }

  private updatePlay(dt: number): void {
    // Environment queries for the player.
    const env = {
      groundHeightAt: (x: number, z: number): number | null => {
        const r = this.raft.deckHeightAt(x, z);
        const i = this.islands.groundHeightAt(x, z);
        if (r === null) return i;
        if (i === null) return r;
        return Math.max(r, i);
      },
      oceanHeightAt: (x: number, z: number): number => this.ocean.getHeight(x, z),
    };

    const fs = this.player.update(dt, env);
    const cold =
      (this.dayNight.isNight() ? 0.25 : 0) +
      (this.weather.kind === 'storm' ? 0.4 : 0) +
      (fs.underwater ? 0.3 : 0);
    this.stats.update(dt, {
      sprinting: fs.sprinting,
      underwater: fs.underwater,
      moving: fs.moving,
      cold,
    });

    // Audio + visual underwater transition.
    this.audio.setUnderwater(fs.underwater);
    this.hud.setUnderwater(fs.underwater);

    this.handleHotbarSelection();
    this.handleToolUse(dt, fs);

    // Shark.
    this.raft.center(this.raftCenter);
    const raftRadius = Math.sqrt(this.raft.foundationCount()) * CELL_SIZE * 0.6 + 3;
    this.shark.update(dt, {
      playerPos: this.player.position,
      playerInWater: fs.swimming,
      raftCenter: this.raftCenter,
      raftRadius,
      islands: this.islands.obstacles(),
    });

    // World streaming + stations.
    this.debris.update(dt, this.player.position, this.weather.windVector);
    this.islands.update(this.player.position);
    this.processing.update(dt);

    // Interaction prompt (suppressed in build mode).
    if (!this.building.isActive()) {
      const prompt = this.interaction.update(this.player.position);
      this.hud.showPrompt(prompt);
      if (prompt && this.input.actionPressed('interact')) this.interaction.execute();
    } else {
      this.hud.showPrompt('<b>Clic</b> poser · <b>R</b> pivoter · <b>Clic droit</b> annuler');
    }

    // HUD periodic info.
    this.hud.setCharge(
      this.hook.state === 'idle' && this.hook.charge > 0 ? this.hook.charge : null,
    );
    this.hud.setTopbar({
      day: this.dayNight.day,
      hour: this.dayNight.hour,
      weather: this.weatherLabel(),
      foundations: this.raft.foundationCount(),
    });

    // Periodic autosave.
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= 60) {
      this.autosaveTimer = 0;
      void this.autosave(false);
    }
  }

  private handleHotbarSelection(): void {
    for (let i = 0; i < 5; i++) {
      if (this.input.actionPressed(`hotbar${i + 1}`)) {
        this.inventory.selectHotbar(i);
        if (this.building.isActive()) this.refreshBuildMode();
      }
    }
    if (this.input.wheel !== 0) {
      const next =
        (this.inventory.selected + (this.input.wheel > 0 ? 1 : -1) + this.inventory.hotbarSize) %
        this.inventory.hotbarSize;
      this.inventory.selectHotbar(next);
      if (this.building.isActive()) this.refreshBuildMode();
    }
  }

  private refreshBuildMode(): void {
    const sel = this.inventory.selectedStack();
    const def = sel ? ItemDatabase.get(sel.itemId) : null;
    if (def?.placeableId) this.building.setActive(def.placeableId);
    else this.building.setActive(null);
  }

  private handleToolUse(dt: number, fs: { swimming: boolean }): void {
    const sel = this.inventory.selectedStack();
    const id = sel?.itemId ?? null;

    // Build mode.
    if (this.input.actionPressed('build')) {
      if (this.building.isActive()) this.building.setActive(null);
      else this.refreshBuildMode();
    }
    if (this.building.isActive()) {
      this.building.update(this.renderer.camera);
      if (this.input.leftPressed && this.building.tryPlace()) this.audio.play('build', 0.8);
      if (this.input.actionPressed('rotate')) this.building.rotate();
      if (this.input.rightPressed) this.building.setActive(null);
      return;
    }

    // Tool-specific left/right click behaviour.
    const hookActive = id === 'hook';
    const fishingActive = id === 'fishing_rod';
    this.hook.update(dt, hookActive);
    this.fishing.update(dt, fishingActive);
    if (hookActive || fishingActive) return;

    if (this.input.leftPressed) {
      if (id === 'hammer') {
        this.building.tryRepair(this.renderer.camera);
      } else if (id && ItemDatabase.get(id).placeableId) {
        this.refreshBuildMode();
      } else if (id && ItemDatabase.get(id).tool) {
        const eye = this.player.eyePosition(this.tmpAim);
        this.player.lookDirection(this.lookDir);
        this.combat.swing(eye, this.lookDir, sel);
      }
    }
    if (this.input.rightPressed && id === 'hammer') {
      this.building.tryDemolish(this.renderer.camera);
    }
    void fs;
  }

  // --------------------------------------------------------------------------
  private useItem(index: number): void {
    const stack = this.inventory.getSlot(index);
    if (!stack) return;
    const def = ItemDatabase.get(stack.itemId);
    if (def.food) {
      this.stats.applyFood(def.food);
      this.inventory.consumeSlot(index, 1);
      this.audio.play(def.category === 'drink' ? 'drink' : 'eat', 0.7);
      this.bus.emit('notify', { message: `${def.name} consommé`, kind: 'good' });
    } else if (def.placeableId) {
      this.building.setActive(def.placeableId);
      this.invScreen.close();
    } else if (index >= this.inventory.hotbarSize) {
      // Move tools/weapons to the selected hotbar slot for quick equip.
      this.inventory.moveSlot(index, this.inventory.selected);
    }
  }

  private dropItem(index: number): void {
    const stack = this.inventory.getSlot(index);
    if (!stack) return;
    this.inventory.removeFromSlot(index, stack.count);
    this.bus.emit('notify', {
      message: `${ItemDatabase.get(stack.itemId).name} jeté`,
      kind: 'info',
    });
  }

  private openResearch(): void {
    if (!this.invScreen.open) {
      this.invScreen.openScreen();
      this.input.exitPointerLock();
    }
  }

  // --------------------------------------------------------------------------
  private handleGlobalKeys(): void {
    if (this.input.actionPressed('menu')) {
      if (this.settingsMenu.root && !this.settingsMenu.root.classList.contains('hidden')) {
        this.settingsMenu.hide();
      } else if (this.invScreen.open) {
        this.invScreen.close();
        if (this.mode === 'playing') this.input.requestPointerLock();
      } else if (this.mode === 'playing') {
        this.pause();
      } else if (this.mode === 'paused') {
        this.resume();
      }
    }

    if (this.mode === 'playing' && this.input.actionPressed('inventory')) {
      this.invScreen.toggle();
      if (this.invScreen.open) {
        this.building.setActive(null);
        this.input.exitPointerLock();
      } else {
        this.input.requestPointerLock();
      }
    }
  }

  private pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.pauseMenu.show();
    this.input.exitPointerLock();
  }

  private resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.pauseMenu.hide();
    this.settingsMenu.hide();
    this.input.requestPointerLock();
  }

  private onDeath(cause: string): void {
    this.mode = 'dead';
    this.hook.reset();
    this.fishing.reset();
    this.building.setActive(null);
    this.deathScreen.show(cause);
    this.input.exitPointerLock();
  }

  private respawn(): void {
    this.stats.reset();
    this.raft.center(this.raftCenter);
    this.player.spawn(
      new THREE.Vector3(this.raftCenter.x, this.raftCenter.y + 1.5, this.raftCenter.z),
    );
    this.deathScreen.hide();
    this.startPlaying(false);
  }

  private quitToMenu(): void {
    void this.autosave(false);
    this.mode = 'menu';
    this.hud.hide();
    this.invScreen.close();
    this.pauseMenu.hide();
    this.deathScreen.hide();
    this.settingsMenu.hide();
    this.building.setActive(null);
    this.input.exitPointerLock();
    this.mainMenu.show();
  }

  private async autosave(manual: boolean): Promise<void> {
    if (this.mode === 'menu') return;
    try {
      await this.save.save(this.slot, this.captureState());
      if (manual) this.bus.emit('notify', { message: 'Partie sauvegardée', kind: 'good' });
      this.bus.emit('save:done', { slot: this.slot });
    } catch {
      this.bus.emit('notify', { message: 'Échec de la sauvegarde', kind: 'bad' });
    }
  }

  private applyLiveSettings(): void {
    this.renderer.setFov(this.settings.get().fov);
  }

  private weatherLabel(): string {
    return { clear: 'Clair', cloudy: 'Nuageux', rain: 'Pluie', storm: 'Tempête' }[
      this.weather.kind
    ];
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
