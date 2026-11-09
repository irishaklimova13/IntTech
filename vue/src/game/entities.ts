import { WEAPONS, defaultWeapon, type WeaponType } from './weapons';
import type { UnitPose } from './unitPresentation';
import { UNIT_CHARACTERISTICS_BY_COLOR } from './unitTypes';

export type TerrainType = 'land' | 'water';
export type MovementType = TerrainType;

export interface PathNode {
  x: number;
  y: number;
}

export interface ICommand {
  type: 'MOVE' | 'ATTACK' | 'ATTACK_MOVE' | 'HEAL' | 'BUILD';
  x: number;
  y: number;
  targetId?: string;
}

export interface BuildingType {
  id: string;
  name: string;
  sizeTiles: number;
  color: string;
  maxHp: number;
  height3d: number;
}

export interface BaseEntity {
  id: string;
  x: number;
  y: number;
  isSelected: boolean;
  health: number;
  maxHealth: number;
  hp: number;
  maxHp: number;
  color: string;
  groupId?: string | number;
  commandsQueue: ICommand[];
  activeCommand: ICommand | null;
}

export interface Unit extends BaseEntity {
  kind: 'unit';
  weapon?: WeaponType;
  stance?: 'defensive' | 'hold';
  pose?: UnitPose;
  producerId?: string;
  transportId?: string;
  boardingTargetId?: string;
  avoidance?: { side: number; blocked: number; wait: number };
  strength: number;
  movementSpeed: number;
  attackSpeed: number;
  speed: number;
  radius: number;
  movementType: MovementType;
  path: PathNode[];
  attackDamage: number;
  attackRange: number;
}

export interface Building extends BaseEntity {
  kind: 'building';
  rallyPoint?: PathNode;
  spawnType?: MovementType;
  typeId: string;
  name: string;
  sizeTiles: number;
  height3d: number;
  speed: number;
  path: PathNode[];
}

export type Entity = Unit | Building;

let nextId = 1;

// Keep the existing hp/maxHp names as the single storage used by legacy code.
const healthProperties = {
  hp: 100,
  maxHp: 100,
  get health(): number { return this.hp; },
  set health(value: number) {
    if (Number.isFinite(value)) this.hp = Math.max(0, Math.min(this.maxHp, value));
  },
  get maxHealth(): number { return this.maxHp; },
  set maxHealth(value: number) {
    if (!Number.isFinite(value)) return;
    this.maxHp = Math.max(0, value);
    this.health = this.hp;
  },
};

const healthAccessors = Object.fromEntries(
  ['health', 'maxHealth'].map((key) => [key, Object.getOwnPropertyDescriptor(healthProperties, key)!]),
);

// Object spread copies accessor values, so frame copies must restore the aliases.
export const restoreEntityCharacteristics = <T extends Entity>(entity: T): T => {
  Object.defineProperties(entity, healthAccessors);
  if (entity.kind === 'unit') {
    Object.defineProperty(entity, 'movementSpeed', {
      enumerable: true,
      configurable: true,
      get(this: Unit): number { return this.speed; },
      set(this: Unit, value: number) { this.speed = nonNegative(value, this.speed); },
    });
  }
  return entity;
};

export interface UnitCharacteristics {
  weapon?: WeaponType;
  health?: number;
  maxHealth?: number;
  strength?: number;
  movementSpeed?: number;
  attackSpeed?: number;
}

const nonNegative = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? Math.max(0, value) : fallback;

export const createUnit = (
  x: number,
  y: number,
  color = '#3b82f6',
  movementType: MovementType = 'land',
  characteristics: UnitCharacteristics = {},
): Unit => {
  characteristics = { ...UNIT_CHARACTERISTICS_BY_COLOR[color.toLowerCase()], ...characteristics };
  const weapon = characteristics.weapon ?? defaultWeapon(color, movementType === 'water');
  return Object.defineProperties({
    weapon, stance: 'defensive',
    id: `unit_${nextId++}`,
    kind: 'unit',
    x, y, color,
    strength: nonNegative(characteristics.strength, 10),
    attackSpeed: nonNegative(characteristics.attackSpeed, 1),
    speed: nonNegative(characteristics.movementSpeed, 2.5),
    get movementSpeed(): number { return this.speed; },
    set movementSpeed(value: number) { this.speed = nonNegative(value, this.speed); },
    radius: 14,
    movementType,
    attackDamage: 25,
    attackRange: WEAPONS[weapon].range,
    hp: Math.min(nonNegative(characteristics.health, nonNegative(characteristics.maxHealth, 100)), nonNegative(characteristics.maxHealth, 100)),
    maxHp: nonNegative(characteristics.maxHealth, 100),
    isSelected: false,
    path: [],
    commandsQueue: [],
    activeCommand: null,
  }, healthAccessors) as Unit;
};

export const createBuilding = (
  x: number,
  y: number,
  characteristics: Partial<BuildingType> | string = {},
): Building => {
  const options: Partial<BuildingType> & { health?: number; maxHealth?: number } = typeof characteristics === 'string'
    ? { color: characteristics }
    : characteristics;

  return Object.defineProperties({
    id: `building_${nextId++}`,
    kind: 'building',
    typeId: options.id ?? 'house',
    name: options.name ?? 'Дом',
    x,
    y,
    color: options.color ?? '#475569',
    sizeTiles: options.sizeTiles ?? 1,
    height3d: options.height3d ?? 28,
    hp: Math.min(nonNegative(options.health, nonNegative(options.maxHealth ?? options.maxHp, 500)), nonNegative(options.maxHealth ?? options.maxHp, 500)),
    maxHp: nonNegative(options.maxHealth ?? options.maxHp, 500),
    isSelected: false,
    speed: 4,
    path: [],
    commandsQueue: [],
    activeCommand: null,
  }, healthAccessors) as Building;
};

export const movementSpeed = (unit: Unit): number =>
  unit.speed * (0.5 + 0.5 * Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.maxHp))));
