import type { UnitCharacteristics } from './entities';

export const UNIT_CHARACTERISTICS_BY_COLOR: Readonly<Record<string, Readonly<UnitCharacteristics>>> = {
  '#3b82f6': { maxHealth: 100, strength: 10, movementSpeed: 2.5 },
  '#dc2626': { maxHealth: 80, strength: 20, movementSpeed: 2.5 },
  '#16a34a': { maxHealth: 150, strength: 8, movementSpeed: 2 },
  '#9333ea': { maxHealth: 70, strength: 12, movementSpeed: 3.5 },
  '#f97316': { maxHealth: 120, strength: 15, movementSpeed: 2 },
};
