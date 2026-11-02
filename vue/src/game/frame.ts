import type { Building, Entity, ICommand, Unit } from './entities';
import type { GameEvent } from '../store/game';
import { findPath } from './pathfinding';
import { buildingFootprintsOverlap, buildingOccupiesTile, distanceFromBuildingFootprint } from './buildings';
import { getTerrainAt, isInsideMap } from './terrain';
import { resolveEntityCollisions } from './collision';

const UNIT_SEPARATION = 0.8;

const isBlockedFor = (entities: Entity[], movementType: Unit['movementType'], x: number, y: number) => {
  if (!isInsideMap(x, y) || getTerrainAt(x, y) !== movementType) return true;
  return entities.some((entity) =>
    entity.kind === 'building' && buildingOccupiesTile(entity, x, y)
  );
};

const findUnitPath = (unit: Unit, target: { x: number; y: number }, entities: Entity[]) =>
  findPath(
    unit.x,
    unit.y,
    target.x,
    target.y,
    (x, y) => isBlockedFor(entities, unit.movementType, x, y),
  );

const startMoveCommand = (unit: Unit, command: ICommand, entities: Entity[]) => {
  unit.activeCommand = command;
  unit.path = findUnitPath(unit, command, entities);
  if (unit.path.length === 0) unit.activeCommand = null;
};

const startNextQueuedCommand = (unit: Unit, entities: Entity[]) => {
  while (!unit.activeCommand && unit.commandsQueue.length > 0) {
    const nextCommand = unit.commandsQueue.shift()!;
    if (nextCommand.type === 'MOVE') {
      startMoveCommand(unit, nextCommand, entities);
    }
    // ATTACK and BUILD will be handled when those command types are integrated.
  }
};

const finishMoveCommandIfNeeded = (unit: Unit, entities: Entity[]) => {
  if (unit.path.length > 0) return;
  if (unit.activeCommand) unit.activeCommand = null;
  startNextQueuedCommand(unit, entities);
};

const isBuildingPositionFree = (building: Building, x: number, y: number, entities: Entity[]) => {
  const candidate = { ...building, x, y };
  return entities.every((entity) => {
    if (entity.id === building.id) return true;
    if (entity.kind === 'building') return !buildingFootprintsOverlap(candidate, entity, 1);
    return distanceFromBuildingFootprint(entity.x, entity.y, candidate) >= 0.8;
  });
};

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
          entities.push({
            ...event.entity,
            path: event.entity.path.map((point) => ({ ...point })),
            commandsQueue: event.entity.commandsQueue.map((command) => ({ ...command })),
            activeCommand: event.entity.activeCommand ? { ...event.entity.activeCommand } : null,
          });
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
          const command: ICommand = { type: 'MOVE', x: event.target.x, y: event.target.y };
          if (event.queued) {
            if (entity.activeCommand || entity.path.length > 0) {
              entity.commandsQueue.push(command);
            } else {
              startMoveCommand(entity, command, entities);
            }
          } else {
            // A regular move order replaces the current order immediately.
            entity.commandsQueue = [];
            entity.activeCommand = null;
            entity.path = [];
            startMoveCommand(entity, command, entities);
          }
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
    if (entity.kind === 'unit' && entity.path.length === 0) {
      finishMoveCommandIfNeeded(entity, entities);
    }
    if (entity.path.length === 0) continue;

    let target = entity.path[0]!;
    if (entity.kind === 'unit' && isBlockedFor(
      entities,
      entity.movementType,
      Math.round(target.x),
      Math.round(target.y),
    )) {
      entity.path = findUnitPath(entity, target, entities);
      target = entity.path[0]!;
      if (!target) {
        finishMoveCommandIfNeeded(entity, entities);
        continue;
      }
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
      if (entity.path.length === 0) finishMoveCommandIfNeeded(entity, entities);
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
    commandsQueue: entity.commandsQueue.map((command) => ({ ...command })),
    activeCommand: entity.activeCommand ? { ...entity.activeCommand } : null,
  }));
  applyEvents(entities, pendingEvents);
  advanceMovement(entities, Math.max(0, Math.min(deltaSeconds, 0.1)));
  resolveEntityCollisions(entities);
  return entities;
};
