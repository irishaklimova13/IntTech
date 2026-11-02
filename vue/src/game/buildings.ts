export interface BuildingType {
  id: string;
  name: string;
  sizeTiles: number;
  color: string;
  maxHp: number;
  height3d: number;
}

export const BUILDING_TYPES: readonly BuildingType[] = [
  { id: 'house', name: 'Дом', sizeTiles: 1, color: '#eab308', maxHp: 500, height3d: 28 },
  { id: 'workshop', name: 'Мастерская', sizeTiles: 2, color: '#f97316', maxHp: 900, height3d: 40 },
  { id: 'fortress', name: 'Крепость', sizeTiles: 3, color: '#64748b', maxHp: 1600, height3d: 54 },
];

export const getBuildingType = (id: string): BuildingType | undefined =>
  BUILDING_TYPES.find((type) => type.id === id);
