import { canTraverseTerrain } from './terrain';
import type { Building, Entity, Unit } from './entities';
import { getTerrainAt } from './terrain';
import { buildingFootprintsOverlap, distanceFromBuildingFootprint } from './buildings';

const UNIT_SEPARATION = 0.8;
const UNIT_BUILDING_SEPARATION = 0.8;
const BUILDING_SEPARATION = 1;
const EPSILON = 0.0001;

const directionForPair = (firstId: string, secondId: string) => {
  let hash = 0;
  for (const char of firstId + secondId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
  return { x: Math.cos(angle), y: Math.sin(angle) };
};

const canPlaceUnit = (unit: Unit, x: number, y: number, entities: Entity[]) => {
  if (!canTraverseTerrain(x, y, unit.movementType)) return false;
  for (const entity of entities) {
    if (entity.id === unit.id || (entity.kind === 'unit' && entity.transportId)) continue;
    const distance = Math.hypot(x - entity.x, y - entity.y);
    if (entity.kind === 'building' && distanceFromBuildingFootprint(x, y, entity) < UNIT_BUILDING_SEPARATION - EPSILON) return false;
    if (entity.kind === 'unit' && distance < UNIT_SEPARATION - EPSILON) return false;
  }
  return true;
};

const canPlaceBuilding = (building: Building, x: number, y: number, entities: Entity[]) => {
  const candidate = { ...building, x, y };
  for (const entity of entities) {
    if (entity.id === building.id) continue;
    if (entity.kind === 'building') {
      if (buildingFootprintsOverlap(candidate, entity, BUILDING_SEPARATION)) return false;
      continue;
    }
    if (distanceFromBuildingFootprint(entity.x, entity.y, candidate) < UNIT_BUILDING_SEPARATION - EPSILON) return false;
  }
  return true;
};

const moveUnitAway = (
  unit: Unit,
  other: Entity,
  dx: number,
  dy: number,
  overlap: number,
  entities: Entity[],
) => {
  const length = Math.hypot(dx, dy);
  const direction = length > EPSILON
    ? { x: dx / length, y: dy / length }
    : directionForPair(unit.id, other.id);

  for (const sign of [1]) {
    const x = unit.x + direction.x * overlap * sign;
    const y = unit.y + direction.y * overlap * sign;
    if (canPlaceUnit(unit, x, y, entities)) {
      unit.x = x;
      unit.y = y;
      return;
    }
  }

  for (let step = 1; step <= 8; step++) {
    const distance = overlap + step * 0.2;
    for (const sign of [1]) {
      const x = unit.x + direction.x * distance * sign;
      const y = unit.y + direction.y * distance * sign;
      if (canPlaceUnit(unit, x, y, entities)) {
        unit.x = x;
        unit.y = y;
        return;
      }
    }
  }
};

const moveBuildingAway = (
  building: Building,
  other: Entity,
  dx: number,
  dy: number,
  overlap: number,
  entities: Entity[],
) => {
  const length = Math.hypot(dx, dy);
  const direction = length > EPSILON
    ? { x: dx / length, y: dy / length }
    : directionForPair(building.id, other.id);

  for (const sign of [1, -1]) {
    const x = building.x + direction.x * overlap * sign;
    const y = building.y + direction.y * overlap * sign;
    if (canPlaceBuilding(building, x, y, entities)) {
      building.x = x;
      building.y = y;
      return;
    }
  }
};

export const resolveEntityCollisions = (entities: Entity[]): void => {
  const units = entities.filter((entity): entity is Unit => entity.kind === 'unit' && !entity.transportId);
  const buildings = entities.filter((entity): entity is Building => entity.kind === 'building');

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const first = units[i]!;
        const second = units[j]!;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= UNIT_SEPARATION) continue;

        const overlap = UNIT_SEPARATION - distance + EPSILON;
        const direction = distance > EPSILON
          ? { x: dx / distance, y: dy / distance }
          : directionForPair(first.id, second.id);
        const firstMoving = first.path.length > 0;
        const secondMoving = second.path.length > 0;

        if (firstMoving && !secondMoving) {
          moveUnitAway(first, second, -direction.x, -direction.y, overlap, entities);
        } else {
          moveUnitAway(second, first, direction.x, direction.y, overlap, entities);
          if (!firstMoving && !secondMoving) {
            const remaining = Math.hypot(second.x - first.x, second.y - first.y);
            if (remaining < UNIT_SEPARATION - EPSILON) {
              moveUnitAway(first, second, -direction.x, -direction.y, overlap, entities);
            }
          }
        }
      }
    }

    for (const unit of units) {
      for (const building of buildings) {
        const dx = unit.x - building.x;
        const dy = unit.y - building.y;
        const distance = Math.hypot(dx, dy);
        if (distance < UNIT_BUILDING_SEPARATION) {
          moveUnitAway(unit, building, dx, dy, UNIT_BUILDING_SEPARATION - distance + EPSILON, entities);
        }
      }
    }

    for (let i = 0; i < buildings.length; i++) {
      for (let j = i + 1; j < buildings.length; j++) {
        const first = buildings[i]!;
        const second = buildings[j]!;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= BUILDING_SEPARATION) continue;
        const direction = distance > EPSILON
          ? { x: dx / distance, y: dy / distance }
          : directionForPair(first.id, second.id);
        const overlap = BUILDING_SEPARATION - distance + EPSILON;
        if (first.path.length > 0 && second.path.length === 0) {
          moveBuildingAway(first, second, -direction.x, -direction.y, overlap, entities);
        } else {
          moveBuildingAway(second, first, direction.x, direction.y, overlap, entities);
        }
      }
    }
  }
};
