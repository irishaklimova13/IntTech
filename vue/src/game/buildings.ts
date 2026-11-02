import type { Building, BuildingType } from './entities';

export const BUILDING_TYPES: readonly BuildingType[] = [
  { id: 'house', name: 'Дом', sizeTiles: 1, color: '#eab308', maxHp: 500, height3d: 28 },
  { id: 'workshop', name: 'Мастерская', sizeTiles: 2, color: '#f97316', maxHp: 900, height3d: 40 },
  { id: 'fortress', name: 'Крепость', sizeTiles: 3, color: '#64748b', maxHp: 1600, height3d: 54 },
];

export const getBuildingType = (id: string): BuildingType | undefined =>
  BUILDING_TYPES.find((type) => type.id === id);

/** A building occupies a square of sizeTiles x sizeTiles, anchored at its top-left tile. */
export const buildingOccupiesTile = (building: Pick<Building, 'x' | 'y' | 'sizeTiles'>, tileX: number, tileY: number): boolean => {
  const left = Math.round(building.x);
  const top = Math.round(building.y);
  return tileX >= left && tileX < left + building.sizeTiles &&
    tileY >= top && tileY < top + building.sizeTiles;
};

const getFootprint = (building: Pick<Building, 'x' | 'y' | 'sizeTiles'>) => {
  const left = Math.round(building.x) - 0.5;
  const top = Math.round(building.y) - 0.5;
  return {
    left,
    top,
    right: left + building.sizeTiles,
    bottom: top + building.sizeTiles,
  };
};

export const distanceFromBuildingFootprint = (
  x: number,
  y: number,
  building: Pick<Building, 'x' | 'y' | 'sizeTiles'>,
): number => {
  const bounds = getFootprint(building);
  const dx = Math.max(bounds.left - x, 0, x - bounds.right);
  const dy = Math.max(bounds.top - y, 0, y - bounds.bottom);
  return Math.hypot(dx, dy);
};

export const buildingFootprintsOverlap = (
  first: Pick<Building, 'x' | 'y' | 'sizeTiles'>,
  second: Pick<Building, 'x' | 'y' | 'sizeTiles'>,
  padding = 0,
): boolean => {
  const a = getFootprint(first);
  const b = getFootprint(second);
  return a.left < b.right + padding && a.right + padding > b.left &&
    a.top < b.bottom + padding && a.bottom + padding > b.top;
};
