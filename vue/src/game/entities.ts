export type TerrainType = 'land' | 'water';
export type MovementType = TerrainType;

export interface BaseEntity {
  id: string;
  x: number;
  y: number;
  isSelected: boolean;
  hp: number;
  maxHp: number;
  color: string;
  // Optional integration point for the team's faction implementation.
  groupId?: string | number;
}

export interface Unit extends BaseEntity {
  kind: 'unit';
  producerId?: string;
  speed: number;
  radius: number;
  movementType: MovementType;
  strength?: number;
  attackSpeed?: number; // attacks per second
  path: { x: number; y: number }[];
}

export interface Building extends BaseEntity {
  kind: 'building';
  sizeTiles: number;
  spawnType?: MovementType;
  height3d: number;
  speed: number;
  path: { x: number; y: number }[];
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
  x, y, color,
  speed: 2.5,
  radius: 14,
  movementType,
  hp: 100, maxHp: 100,
  isSelected: false,
  path: [],
});

export const createBuilding = (x: number, y: number, color = '#475569'): Building => ({
  id: `building_${nextId++}`,
  kind: 'building',
  x, y, color,
  sizeTiles: 1,
  height3d: 28,
  hp: 500, maxHp: 500,
  isSelected: false,
  speed: 4,
  path: [],
});

// Wounds affect actual movement without overwriting the base speed statistic.
export const movementSpeed = (unit: Unit): number => {
  const health = Math.max(0, Math.min(1, unit.hp / Math.max(1, unit.maxHp)));
  return unit.speed * (0.5 + health * 0.5);
};
