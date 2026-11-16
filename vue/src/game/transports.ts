import type { Entity, Unit } from './entities';
import { canTraverseTerrain, getMapTiles } from './terrain';
import { distanceFromBuildingFootprint } from './buildings';
import type { createUnitActions } from './unitActions';
export const BOAT_CAPACITY = 4;
export const passengersOf = (entities: Entity[], id: string) => entities.filter((e): e is Unit => e.kind === 'unit' && e.transportId === id && e.hp > 0);
const friends = (a: Entity, b: Entity) => (a.groupId ?? a.color) === (b.groupId ?? b.color);
const freeLand = (entities: Entity[], x: number, y: number, ignoreId?: string) => canTraverseTerrain(x,y,'land') &&
  !entities.some(e => e.id !== ignoreId && (e.kind === 'building' ? distanceFromBuildingFootprint(x,y,e) < .8 : !e.transportId && Math.hypot(e.x-x,e.y-y) < .82));

export function requestBoard(entities: Entity[], unit: Unit, boat: Unit) {
  if (unit.movementType !== 'land' || boat.movementType !== 'water' || unit.transportId || !friends(unit,boat) || unit.hp <= 0 || boat.hp <= 0) return false;
  const reserved = entities.filter(e => e.kind === 'unit' && (e.transportId === boat.id || e.boardingTargetId === boat.id) && e.id !== unit.id).length;
  if (reserved >= BOAT_CAPACITY) return false;
  unit.boardingTargetId = boat.id;
  unit.commandsQueue = []; unit.activeCommand = null;
  return true;
}
export function disembark(entities: Entity[], boat: Unit) {
  let count = 0;
  for (const unit of passengersOf(entities, boat.id)) {
    const place = getMapTiles().filter(p => Math.hypot(p.x-boat.x,p.y-boat.y) <= 2.8 && freeLand(entities,p.x,p.y))
      .sort((a,b) => Math.hypot(a.x-boat.x,a.y-boat.y)-Math.hypot(b.x-boat.x,b.y-boat.y))[0];
    if (!place) break;
    delete unit.transportId; delete unit.boardingTargetId;
    unit.x = place.x; unit.y = place.y; unit.path = []; unit.stance = 'hold'; count++;
  }
  return count;
}
export function updateTransports(entities: Entity[], combat?: ReturnType<typeof createUnitActions>) {
  for (const unit of entities) {
    if (unit.kind !== 'unit') continue;
    if (unit.transportId) {
      const boat = entities.find((e): e is Unit => e.kind === 'unit' && e.id === unit.transportId && e.hp > 0);
      if (boat) { unit.x = boat.x; unit.y = boat.y; unit.path = []; }
      else {
        // A wreck near shore allows evacuation; open-water losses do not create land units in water.
        const wreck = { ...unit, id: unit.transportId, movementType: 'water' as const };
        disembark(entities, wreck);
        if (unit.transportId) unit.hp = 0;
      }
      continue;
    }
    if (!unit.boardingTargetId) continue;
    const boat = entities.find((e): e is Unit => e.kind === 'unit' && e.id === unit.boardingTargetId && e.hp > 0);
    if (!boat || !friends(unit, boat)) { delete unit.boardingTargetId; continue; }
    if (Math.hypot(unit.x-boat.x,unit.y-boat.y) <= 2.4 && passengersOf(entities,boat.id).length < BOAT_CAPACITY) {
      combat?.cancel(unit); unit.transportId = boat.id; delete unit.boardingTargetId;
      unit.x = boat.x; unit.y = boat.y; unit.path = []; unit.isSelected = false;
    } else if (!unit.path.length) {
      const shore = getMapTiles().filter(p => Math.hypot(p.x-boat.x,p.y-boat.y) <= 2.4 && freeLand(entities,p.x,p.y,unit.id))
        .sort((a,b) => Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y))[0];
      if (shore && combat) combat.move(unit, shore);
    }
  }
}
