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
}

export interface Unit extends BaseEntity {
  kind: 'unit';
  speed: number;
  radius: number;
  movementType: MovementType;
  path: { x: number; y: number }[];
}

export interface Building extends BaseEntity {
  kind: 'building';
  typeId: string;
  name: string;
  sizeTiles: number;
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

export const createBuilding = (
  x: number,
  y: number,
  characteristics: {
    id?: string;
    name?: string;
    sizeTiles?: number;
    color?: string;
    maxHp?: number;
    height3d?: number;
  } = {},
): Building => ({
  id: `building_${nextId++}`,
  kind: 'building',
  typeId: characteristics.id ?? 'house',
  name: characteristics.name ?? 'Дом',
  x, y, color: characteristics.color ?? '#475569',
  sizeTiles: characteristics.sizeTiles ?? 1,
  height3d: characteristics.height3d ?? 28,
  hp: characteristics.maxHp ?? 500, maxHp: characteristics.maxHp ?? 500,
  isSelected: false,
  speed: 4,
  path: [],
});
