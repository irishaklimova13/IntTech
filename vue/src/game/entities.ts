export type TerrainType = 'land' | 'water';
export type MovementType = TerrainType;

export interface PathNode {
  x: number;
  y: number;
}

export interface ICommand {
  type: 'MOVE' | 'ATTACK' | 'BUILD';
  x: number;
  y: number;
  targetId?: string;
}

export interface BaseEntity {
  id: string;
  x: number;
  y: number;
  isSelected: boolean;
  hp: number;
  maxHp: number;
  color: string;
  commandsQueue: ICommand[];
  activeCommand: ICommand | null;
}

export interface Unit extends BaseEntity {
  kind: 'unit';
  speed: number;
  radius: number;
  movementType: MovementType;
  path: PathNode[];
  attackDamage: number;
  attackRange: number;
}

export interface Building extends BaseEntity {
  kind: 'building';
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

export const createBuilding = (x: number, y: number, color = '#475569'): Building => ({
  id: `building_${nextId++}`,
  kind: 'building',
  x,
  y,
  color,
  sizeTiles: 1,
  height3d: 28,
  hp: 500,
  maxHp: 500,
  isSelected: false,
  speed: 4,
  path: [],
  commandsQueue: [],
  activeCommand: null,
});
