import type { Building, Entity, Unit } from './entities';
import type { GameEvent } from '../store/game';
import { findPath } from './pathfinding';
import { getTerrainAt, isInsideMap } from './terrain';
import { resolveEntityCollisions } from './collision';

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
    const nextX = distance <= step || distance < 0.0001
      ? target.x
      : entity.x + (dx / distance) * step;
    const nextY = distance <= step || distance < 0.0001
      ? target.y
      : entity.y + (dy / distance) * step;

    if (entity.kind === 'building' && !isBuildingPositionFree(entity, nextX, nextY, entities)) {
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
