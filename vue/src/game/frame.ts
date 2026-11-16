import { canTraverseTerrain } from './terrain';
import type { Building, Entity, ICommand, Unit } from './entities';
import { requestBoard, disembark, updateTransports } from './transports';
import { findNearestTerrainTile } from './terrain';
import { updateUnitPose } from './unitPresentation';
import type { GameEvent } from '../store/game';
import { findPath } from './pathfinding';
import { buildingFootprintsOverlap, buildingOccupiesTile, distanceFromBuildingFootprint } from './buildings';
import { getTerrainAt, isInsideMap } from './terrain';
import { movementSpeed, restoreEntityCharacteristics } from './entities';
import { spawnFromBuilding, type createUnitActions } from './unitActions';
type Combat = ReturnType<typeof createUnitActions>;

import { resolveEntityCollisions } from './collision';

const UNIT_SEPARATION = 0.8;

const isBlockedFor = (entities: Entity[], movementType: Unit['movementType'], x: number, y: number) => {
  if (!isInsideMap(x, y) || !canTraverseTerrain(x, y, movementType)) return true;
  return entities.some((entity) =>
    entity.kind === 'building' && distanceFromBuildingFootprint(x, y, entity) < 0.8 - 0.0001
  );
};

const findUnitPath = (unit: Unit, target: { x: number; y: number }, entities: Entity[]) =>
  findPath(
    unit.x,
    unit.y,
    target.x,
    target.y,
    (x, y) => {
      if (!canTraverseTerrain(x, y, unit.movementType)) return true;
      const nearBuilding = (p: { x: number; y: number }) => entities.some(e => e.kind === 'building' && distanceFromBuildingFootprint(p.x, p.y, e) < 0.8 - 0.0001);
      if (x === Math.round(target.x) && y === Math.round(target.y) && !nearBuilding(target)) return false;
      if (x === Math.round(unit.x) && y === Math.round(unit.y) && !nearBuilding(unit)) return false;
      return isBlockedFor(entities, unit.movementType, x, y);
    },
  );

const startMoveCommand = (unit: Unit, command: ICommand, entities: Entity[], combat?: Combat) => {
  if (combat) {
    const accepted = command.type === 'ATTACK' ? (() => {
      const target = entities.find(e => e.id === command.targetId);
      return target ? combat.attack(unit, target) : false;
    })() : command.type === 'HEAL' ? combat.heal(unit)
      : command.type === 'ATTACK_MOVE' ? combat.attackMove(unit, command) : combat.move(unit, command);
    unit.activeCommand = accepted ? command : null;
    return;
  }
  unit.activeCommand = command;
  unit.path = findUnitPath(unit, command, entities);
  if (unit.path.length === 0) unit.activeCommand = null;
};

const startNextQueuedCommand = (unit: Unit, entities: Entity[], combat?: Combat) => {
  while (!unit.activeCommand && unit.commandsQueue.length > 0) {
    const nextCommand = unit.commandsQueue.shift()!;
    if (['MOVE', 'ATTACK_MOVE', 'ATTACK', 'HEAL'].includes(nextCommand.type)) {
      startMoveCommand(unit, nextCommand, entities, combat);
    }
    // Unsupported or invalid commands are skipped so the queue keeps progressing.
  }
};

const finishMoveCommandIfNeeded = (unit: Unit, entities: Entity[], combat?: Combat) => {
  if (unit.path.length > 0 || combat?.isBusy(unit.id)) return;
  if (unit.activeCommand) unit.activeCommand = null;
  startNextQueuedCommand(unit, entities, combat);
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
      !canTraverseTerrain(x, y, unit.movementType)) return false;

  return entities.every((entity) => {
    if (entity.id === unit.id || (entity.kind === 'unit' && entity.transportId)) return true;
    return entity.kind === 'unit'
      ? Math.hypot(x - entity.x, y - entity.y) >= UNIT_SEPARATION - 0.0001
      : distanceFromBuildingFootprint(x, y, entity) >= 0.8 - 0.0001;
  });
};

const applyEvents = (entities: Entity[], events: GameEvent[], combat?: Combat) => {
  for (const event of events) {
    switch (event.type) {
      case 'ENTITY_ADDED':
        if (!entities.some((entity) => entity.id === event.entity.id)) {
          entities.push(restoreEntityCharacteristics({
            ...event.entity,
            path: event.entity.path.map((point) => ({ ...point })),
            commandsQueue: event.entity.commandsQueue.map((command) => ({ ...command })),
            activeCommand: event.entity.activeCommand ? { ...event.entity.activeCommand } : null,
          }));
        }
        break;
      case 'ENTITY_REMOVED': {
        const index = entities.findIndex((entity) => entity.id === event.entityId);
        if (index !== -1) entities.splice(index, 1);
        break;
      }
      case 'SPAWN_REQUESTED': {
        const building = entities.find((e): e is Building => e.kind === 'building' && e.id === event.buildingId);
        if (building) {
          const unit = spawnFromBuilding(entities, building, event.weapon);
          if (unit && combat) {
            combat.effect(building.id).smoke = 1.5;
            if (building.rallyPoint) {
              const point = findNearestTerrainTile(building.rallyPoint.x, building.rallyPoint.y, unit.movementType,
                (x,y) => entities.some(e => e.id !== unit.id && (e.kind === 'building' ? distanceFromBuildingFootprint(x,y,e) < .8 : !e.transportId &&
                  (Math.hypot(e.x-x,e.y-y) < .85 || (e.path.length > 0 && Math.hypot(e.path.at(-1)!.x-x,e.path.at(-1)!.y-y) < .85)))));
              if (point) combat.move(unit,point);
            }
          }
        }
        break;
      }
      case 'BOARD_REQUESTED': {
        const unit = entities.find((e): e is Unit => e.kind === 'unit' && e.id === event.entityId);
        const boat = entities.find((e): e is Unit => e.kind === 'unit' && e.id === event.boatId);
        if (unit && boat && requestBoard(entities,unit,boat)) combat?.cancel(unit);
        break;
      }
      case 'DISEMBARK_REQUESTED': {
        const boat = entities.find((e): e is Unit => e.kind === 'unit' && e.id === event.boatId);
        if (boat) disembark(entities,boat);
        break;
      }
      case 'RALLY_REQUESTED': {
        const building = entities.find((e): e is Building => e.kind === 'building' && e.id === event.buildingId);
        if (building) {
          const point = findNearestTerrainTile(event.target.x,event.target.y,building.spawnType ?? 'land');
          if (point) building.rallyPoint = point;
        }
        break;
      }
      case 'HOLD_REQUESTED': {
        const unit = entities.find((e): e is Unit => e.kind === 'unit' && e.id === event.entityId);
        if (unit && combat) { combat.hold(unit); unit.commandsQueue = []; unit.activeCommand = null; }
        break;
      }
      case 'ATTACK_REQUESTED':
      case 'HEAL_REQUESTED': {
        const unit = entities.find((e): e is Unit => e.kind === 'unit' && e.id === event.entityId);
        if (!unit || !combat) break;
        const command: ICommand = event.type === 'ATTACK_REQUESTED'
          ? { type: 'ATTACK', x: 0, y: 0, targetId: event.targetId }
          : { type: 'HEAL', x: unit.x, y: unit.y };
        if (event.queued && (unit.activeCommand || unit.path.length || combat.isBusy(unit.id))) unit.commandsQueue.push(command);
        else {
          if (event.type === 'ATTACK_REQUESTED') { unit.commandsQueue = []; combat.cancel(unit); }
          startMoveCommand(unit, command, entities, combat);
        }
        break;
      }
      case 'MOVE_REQUESTED': {
        const entity = entities.find((item) => item.id === event.entityId);
        if (!entity) break;
        if (entity.kind === 'unit' && entity.transportId) break;
        if (entity.kind === 'unit') {
          delete entity.boardingTargetId;
          const command: ICommand = { type: event.attackMove ? 'ATTACK_MOVE' : 'MOVE', x: event.target.x, y: event.target.y };
          if (event.queued) {
            if (entity.activeCommand || entity.path.length > 0) {
              entity.commandsQueue.push(command);
            } else {
              startMoveCommand(entity, command, entities, combat);
            }
          } else {
            // A regular move order replaces the current order immediately.
            entity.commandsQueue = [];
            entity.activeCommand = null;
            entity.path = [];
            startMoveCommand(entity, command, entities, combat);
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
  dt: number,
): { x: number; y: number; direct: boolean } => {
  const avoidance = unit.avoidance ?? (unit.avoidance = { side: unit.id.charCodeAt(unit.id.length - 1) % 2 ? -1 : 1, blocked: 0, wait: 0 });
  if (avoidance.wait > 0) { avoidance.wait = Math.max(0, avoidance.wait - dt); return { x: unit.x, y: unit.y, direct: false }; }
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.0001) return { x: target.x, y: target.y, direct: true };

  const directX = distance <= step ? target.x : unit.x + (dx / distance) * step;
  const directY = distance <= step ? target.y : unit.y + (dy / distance) * step;
  if (isUnitPositionFree(unit, directX, directY, entities)) {
    avoidance.blocked = 0;
    return { x: directX, y: directY, direct: true };
  }

  // Keep a detour side between frames. Trying opposite sides every frame creates visible jitter.
  const sideX = -dy / distance, sideY = dx / distance;
  for (const angle of [Math.PI / 4, Math.PI * .4, Math.PI / 2, Math.PI * .65]) {
    const x = unit.x + (dx / distance * Math.cos(angle) + sideX * Math.sin(angle) * avoidance.side) * step;
    const y = unit.y + (dy / distance * Math.cos(angle) + sideY * Math.sin(angle) * avoidance.side) * step;
    if (isUnitPositionFree(unit, x, y, entities)) {
      avoidance.blocked = 0;
      return { x, y, direct: false };
    }
  }
  avoidance.blocked += dt;
  if (avoidance.blocked >= .6) { avoidance.side *= -1; avoidance.blocked = 0; avoidance.wait = .15; }

  return { x: unit.x, y: unit.y, direct: false };
};

const advanceMovement = (entities: Entity[], deltaSeconds: number, combat?: Combat) => {
  for (const entity of entities) {
    if (entity.kind === 'unit' && entity.transportId) continue;
    if (entity.kind === 'unit' && entity.path.length === 0) {
      finishMoveCommandIfNeeded(entity, entities, combat);
    }
    if (entity.path.length === 0) continue;

    let target = entity.path[0]!;
    if (entity.kind === 'unit') {
      // Collisions can displace a unit off a smoothed path near a shore/corner.
      // Validate the segment from its actual position before following it again.
      const samples = Math.max(1, Math.ceil(Math.hypot(target.x - entity.x, target.y - entity.y) * 10));
      let clear = true;
      for (let i = 1; i <= samples; i++) {
        const x = entity.x + (target.x - entity.x) * i / samples;
        const y = entity.y + (target.y - entity.y) * i / samples;
        if (!canTraverseTerrain(x, y, entity.movementType) ||
          entities.some(e => e.kind === 'building' && distanceFromBuildingFootprint(x, y, e) < 0.8 - 0.0001)) { clear = false; break; }
      }
      if (!clear) {
        entity.path = findUnitPath(entity, entity.path[entity.path.length - 1]!, entities);
        target = entity.path[0]!;
        if (!target) { finishMoveCommandIfNeeded(entity, entities, combat); continue; }
      }
    }
    if (entity.kind === 'unit' && isBlockedFor(
      entities,
      entity.movementType,
      target.x,
      target.y,
    )) {
      entity.path = findUnitPath(entity, target, entities);
      target = entity.path[0]!;
      if (!target) {
        finishMoveCommandIfNeeded(entity, entities, combat);
        continue;
      }
    }

    const dx = target.x - entity.x;
    const dy = target.y - entity.y;
    const distance = Math.hypot(dx, dy);
    const step = (entity.kind === 'unit' ? movementSpeed(entity) : entity.speed) * deltaSeconds;

    if (entity.kind === 'unit') {
      const next = findSafeUnitStep(entity, target, step, entities, deltaSeconds);
      entity.x = next.x;
      entity.y = next.y;
      if (next.direct && (distance <= step || distance < 0.0001)) entity.path.shift();
      if (entity.path.length === 0) finishMoveCommandIfNeeded(entity, entities, combat);
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
  combat?: Combat,
): Entity[] => {
  const entities = currentEntities.map((entity) => restoreEntityCharacteristics({
    ...entity,
    ...(entity.kind === 'unit' && entity.avoidance ? { avoidance: { ...entity.avoidance } } : {}),
    path: entity.path.map((point) => ({ ...point })),
    commandsQueue: entity.commandsQueue.map((command) => ({ ...command })),
    activeCommand: entity.activeCommand ? { ...entity.activeCommand } : null,
  }));
  combat?.setEntities(entities);
  applyEvents(entities, pendingEvents, combat);
  const dt = Math.max(0, Math.min(deltaSeconds, 0.1));
  updateTransports(entities, combat);
  combat?.tick(dt);
  advanceMovement(entities, dt, combat);
  resolveEntityCollisions(entities);
  updateTransports(entities, combat);
  const previous = new Map(currentEntities.map(e => [e.id, e]));
  for (const entity of entities) if (entity.kind === 'unit') updateUnitPose(entity, previous.get(entity.id));
  return entities;
};
