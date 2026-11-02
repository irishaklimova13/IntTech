import type { Building, Entity, Unit } from './entities';
import type { GameEvent } from '../store/game';
import { findPath } from './pathfinding';
import { getTerrainAt, isInsideMap } from './terrain';
import { resolveEntityCollisions } from './collision';

const UNIT_SEPARATION = 0.8;

const isBlockedFor = (entities: Entity[], movementType: Unit['movementType'], x: number, y: number) => {
  if (!isInsideMap(x, y) || getTerrainAt(x, y) !== movementType) return true;
  return entities.some((entity) =>
    entity.kind === 'building' &&
    Math.round(entity.x) === x &&
    Math.round(entity.y) === y
  );
};

const isBuildingPositionFree = (building: Building, x: number, y: number, entities: Entity[]) =>
  entities.every((entity) => {
    if (entity.id === building.id) return true;
    const requiredDistance = entity.kind === 'building' ? 1 : 0.8;
    return Math.hypot(x - entity.x, y - entity.y) >= requiredDistance;
  });

const isUnitPositionFree = (unit: Unit, x: number, y: number, entities: Entity[]) => {
  if (!isInsideMap(Math.round(x), Math.round(y)) ||
      getTerrainAt(Math.round(x), Math.round(y)) !== unit.movementType) return false;

  return entities.every((entity) => {
    if (entity.id === unit.id) return true;
    const distance = Math.hypot(x - entity.x, y - entity.y);
    const requiredDistance = entity.kind === 'unit' ? UNIT_SEPARATION : 0.8;
    return distance >= requiredDistance - 0.0001;
  });
};

const applyEvents = (entities: Entity[], events: GameEvent[]) => {
  for (const event of events) {
    switch (event.type) {
      case 'ENTITY_ADDED':
        if (!entities.some((entity) => entity.id === event.entity.id)) {
          entities.push({ ...event.entity, path: [...event.entity.path] });
        }
        break;
      case 'ENTITY_REMOVED': {
        const index = entities.findIndex((entity) => entity.id === event.entityId);
        if (index !== -1) entities.splice(index, 1);
        break;
      }
      case 'MOVE_REQUESTED': {
        const entity = entities.find((item) => item.id === event.entityId);
        if (!entity) break;
        if (entity.kind === 'unit') {
          entity.path = findPath(
            entity.x,
            entity.y,
            event.target.x,
            event.target.y,
            (x, y) => isBlockedFor(entities, entity.movementType, x, y),
          );
        } else {
          const x = Math.round(event.target.x);
          const y = Math.round(event.target.y);
          if (isBuildingPositionFree(entity, x, y, entities)) entity.path = [{ x, y }];
        }
        break;
      }
    }
  }
};

const findSafeUnitStep = (
  unit: Unit,
  target: { x: number; y: number },
  step: number,
  entities: Entity[],
): { x: number; y: number; direct: boolean } => {
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.0001) return { x: target.x, y: target.y, direct: true };

  const directX = distance <= step ? target.x : unit.x + (dx / distance) * step;
  const directY = distance <= step ? target.y : unit.y + (dy / distance) * step;
  if (isUnitPositionFree(unit, directX, directY, entities)) {
    return { x: directX, y: directY, direct: true };
  }

  // If another unit blocks the direct step, slide sideways instead of pushing
  // against it every frame. The original waypoint remains the movement target.
  const sideX = -dy / distance;
  const sideY = dx / distance;
  const preferredSign = unit.id.charCodeAt(unit.id.length - 1) % 2 === 0 ? 1 : -1;
  for (const sign of [preferredSign, -preferredSign]) {
    const x = unit.x + sideX * step * sign;
    const y = unit.y + sideY * step * sign;
    if (isUnitPositionFree(unit, x, y, entities)) {
      return { x, y, direct: false };
    }
  }

  return { x: unit.x, y: unit.y, direct: false };
};

const advanceMovement = (entities: Entity[], deltaSeconds: number) => {
  for (const entity of entities) {
    if (entity.path.length === 0) continue;

    let target = entity.path[0]!;
    if (entity.kind === 'unit' && isBlockedFor(
      entities,
      entity.movementType,
      Math.round(target.x),
      Math.round(target.y),
    )) {
      entity.path = findPath(
        entity.x,
        entity.y,
        target.x,
        target.y,
        (x, y) => isBlockedFor(entities, entity.movementType, x, y),
      );
      target = entity.path[0]!;
      if (!target) continue;
    }

    const dx = target.x - entity.x;
    const dy = target.y - entity.y;
    const distance = Math.hypot(dx, dy);
    const step = entity.speed * deltaSeconds;

    if (entity.kind === 'unit') {
      const next = findSafeUnitStep(entity, target, step, entities);
      entity.x = next.x;
      entity.y = next.y;
      if (next.direct && (distance <= step || distance < 0.0001)) entity.path.shift();
      continue;
    }

    const nextX = distance <= step || distance < 0.0001
      ? target.x
      : entity.x + (dx / distance) * step;
    const nextY = distance <= step || distance < 0.0001
      ? target.y
      : entity.y + (dy / distance) * step;

    if (!isBuildingPositionFree(entity, nextX, nextY, entities)) {
      entity.path = [];
      continue;
    }

    entity.x = nextX;
    entity.y = nextY;
    if (distance <= step || distance < 0.0001) entity.path.shift();
  }
};

export const advanceFrame = (
  currentEntities: Entity[],
  pendingEvents: GameEvent[],
  deltaSeconds: number,
): Entity[] => {
  const entities = currentEntities.map((entity) => ({
    ...entity,
    path: entity.path.map((point) => ({ ...point })),
  }));
  applyEvents(entities, pendingEvents);
  advanceMovement(entities, Math.max(0, Math.min(deltaSeconds, 0.1)));
  resolveEntityCollisions(entities);
  return entities;
};
