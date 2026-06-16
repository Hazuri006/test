import type { EventBus, GameEvents } from '../core/EventBus';

export interface StatsSnapshot {
  health: number;
  hunger: number;
  thirst: number;
  stamina: number;
  oxygen: number;
  temperature: number;
}

export interface StatsConfig {
  hungerDrainPerSec: number;
  thirstDrainPerSec: number;
  staminaDrainSprint: number;
  staminaRegen: number;
  oxygenDrain: number;
  oxygenRegen: number;
  starveDamage: number;
  dehydrateDamage: number;
  drownDamage: number;
  healthRegen: number;
}

const DEFAULT_CONFIG: StatsConfig = {
  hungerDrainPerSec: 0.32,
  thirstDrainPerSec: 0.45,
  staminaDrainSprint: 16,
  staminaRegen: 9,
  oxygenDrain: 9,
  oxygenRegen: 22,
  starveDamage: 1.4,
  dehydrateDamage: 1.8,
  drownDamage: 7,
  healthRegen: 0.7,
};

/**
 * Survival statistics with drain, penalties and death.
 * Emits 'player:statsChanged' whenever a value moves enough to matter.
 */
export class PlayerStats {
  health = 100;
  hunger = 100;
  thirst = 100;
  stamina = 100;
  oxygen = 100;
  temperature = 50; // 0 cold .. 100 hot, 50 comfortable

  readonly maxHealth = 100;
  dead = false;

  private staminaBuffTimer = 0;
  private emitAccumulator = 0;

  constructor(
    private readonly bus: EventBus<GameEvents>,
    private readonly config: StatsConfig = DEFAULT_CONFIG,
  ) {}

  reset(): void {
    this.health = 100;
    this.hunger = 100;
    this.thirst = 100;
    this.stamina = 100;
    this.oxygen = 100;
    this.temperature = 50;
    this.dead = false;
    this.staminaBuffTimer = 0;
    this.emit();
  }

  canSprint(): boolean {
    return this.stamina > 5;
  }

  /** Apply a stamina cost from a discrete action (jump, swing). Returns success. */
  spendStamina(amount: number): boolean {
    if (this.stamina < amount) return false;
    this.stamina = Math.max(0, this.stamina - amount);
    return true;
  }

  damage(amount: number, cause = 'unknown'): void {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.bus.emit('player:damage', { amount, cause });
    if (this.health <= 0) this.die(cause);
    this.emit();
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  applyFood(food: {
    hunger?: number;
    thirst?: number;
    health?: number;
    staminaBuff?: number;
  }): void {
    if (food.hunger) this.hunger = clamp(this.hunger + food.hunger, 0, 100);
    if (food.thirst) this.thirst = clamp(this.thirst + food.thirst, 0, 100);
    if (food.health) this.health = clamp(this.health + food.health, 0, this.maxHealth);
    if (food.staminaBuff) this.staminaBuffTimer = Math.max(this.staminaBuffTimer, food.staminaBuff);
    this.emit();
  }

  private die(cause: string): void {
    if (this.dead) return;
    this.dead = true;
    this.bus.emit('player:death', { cause });
  }

  /**
   * Advance survival simulation.
   * @param dt seconds
   * @param ctx context flags affecting drains
   */
  update(
    dt: number,
    ctx: { sprinting: boolean; underwater: boolean; moving: boolean; cold: number },
  ): void {
    if (this.dead) return;

    this.hunger = Math.max(0, this.hunger - this.config.hungerDrainPerSec * dt);
    this.thirst = Math.max(0, this.thirst - this.config.thirstDrainPerSec * dt);

    // Stamina.
    if (ctx.sprinting && ctx.moving) {
      this.stamina = Math.max(0, this.stamina - this.config.staminaDrainSprint * dt);
    } else {
      const buff = this.staminaBuffTimer > 0 ? 1.6 : 1;
      this.stamina = Math.min(100, this.stamina + this.config.staminaRegen * buff * dt);
    }
    if (this.staminaBuffTimer > 0) this.staminaBuffTimer -= dt;

    // Oxygen.
    if (ctx.underwater) {
      this.oxygen = Math.max(0, this.oxygen - this.config.oxygenDrain * dt);
      if (this.oxygen <= 0) this.damage(this.config.drownDamage * dt, 'noyade');
    } else {
      this.oxygen = Math.min(100, this.oxygen + this.config.oxygenRegen * dt);
    }

    // Temperature drifts toward comfortable, pushed by cold context.
    const target = 50 - ctx.cold * 35;
    this.temperature += (target - this.temperature) * Math.min(1, dt * 0.2);

    // Starvation / dehydration penalties.
    if (this.hunger <= 0) this.health = Math.max(0, this.health - this.config.starveDamage * dt);
    if (this.thirst <= 0) this.health = Math.max(0, this.health - this.config.dehydrateDamage * dt);

    // Passive regen only when well-fed and hydrated.
    if (this.hunger > 55 && this.thirst > 55 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + this.config.healthRegen * dt);
    }

    if (this.health <= 0 && !this.dead) this.die(this.thirst <= 0 ? 'déshydratation' : 'famine');

    this.emitAccumulator += dt;
    if (this.emitAccumulator >= 0.25) {
      this.emitAccumulator = 0;
      this.emit();
    }
  }

  private emit(): void {
    this.bus.emit('player:statsChanged', {
      health: this.health,
      hunger: this.hunger,
      thirst: this.thirst,
      stamina: this.stamina,
      oxygen: this.oxygen,
    });
  }

  serialize(): StatsSnapshot {
    return {
      health: this.health,
      hunger: this.hunger,
      thirst: this.thirst,
      stamina: this.stamina,
      oxygen: this.oxygen,
      temperature: this.temperature,
    };
  }

  load(s: StatsSnapshot): void {
    this.health = s.health;
    this.hunger = s.hunger;
    this.thirst = s.thirst;
    this.stamina = s.stamina;
    this.oxygen = s.oxygen;
    this.temperature = s.temperature ?? 50;
    this.dead = false;
    this.emit();
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
