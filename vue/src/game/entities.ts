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
  hp: number;
  maxHp: number;
  color: string;
  groupId?: string | number;
  commandsQueue: ICommand[];
  activeCommand: ICommand | null;
}

export interface Unit extends BaseEntity {
  kind: 'unit';
  producerId?: string;
  strength?: number;
  attackSpeed?: number;
  speed: number;
  radius: number;
  movementType: MovementType;
  path: PathNode[];
  attackDamage: number;
  attackRange: number;
}

export interface Building extends BaseEntity {
  kind: 'building';
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

export const createUnit = (
  x: number,
  y: number,
  color = '#3b82f6',
  movementType: MovementType = 'land',
): Unit => ({
  id: `unit_${nextId++}`,
  kind: 'unit',
  x,
  y,
  color,
  speed: 2.5,
  radius: 14,
  movementType,
  attackDamage: 25,
  attackRange: 1.2,
  hp: 100,
  maxHp: 100,
  isSelected: false,
  path: [],
  commandsQueue: [],
  activeCommand: null,
});

export const createBuilding = (
  x: number,
  y: number,
  characteristics: Partial<BuildingType> | string = {},
): Building => {
  const options: Partial<BuildingType> = typeof characteristics === 'string'
    ? { color: characteristics }
    : characteristics;

  return {
    id: `building_${nextId++}`,
    kind: 'building',
    typeId: options.id ?? 'house',
    name: options.name ?? 'Дом',
    x,
    y,
    color: options.color ?? '#475569',
    sizeTiles: options.sizeTiles ?? 1,
    height3d: options.height3d ?? 28,
    hp: options.maxHp ?? 500,
    maxHp: options.maxHp ?? 500,
    isSelected: false,
    speed: 4,
    path: [],
    commandsQueue: [],
    activeCommand: null,
  };
};

export const movementSpeed = (unit: Unit): number =>
  unit.speed * (0.5 + 0.5 * Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.maxHp))));
