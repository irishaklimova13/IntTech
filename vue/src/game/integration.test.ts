import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'vuex';
import gameModule, { type GameEventPayload, type GameState } from '../store/game';
import { createBuilding, createUnit, type Entity } from './entities';
import { distanceFromBuildingFootprint } from './buildings';

function setup(entities: Entity[]) {
  const store = createStore({ modules: { game: gameModule } });
  store.commit('game/CONFIGURE_RANDOM', () => 1);
  const state = () => (store.state as { game: GameState }).game;
  const event = (payload: GameEventPayload) => store.commit('game/ENQUEUE_EVENT', payload);
  entities.forEach(entity => event({ type: 'ENTITY_ADDED', entity }));
  const step = (frames = 1) => { for (let i = 0; i < frames; i++) store.commit('game/PROCESS_FRAME', 0.05); };
  const get = (id: string) => state().entities.find(e => e.id === id)!;
  step();
  return { state, event, step, get };
}

test('Vuex frames preserve Shift move queue and normal move replaces it', () => {
  const unit = createUnit(-8, -8);
  const b = setup([unit]);
  b.event({ type: 'MOVE_REQUESTED', entityId: unit.id, target: { x: -6, y: -8 } });
  b.event({ type: 'MOVE_REQUESTED', entityId: unit.id, target: { x: -6, y: -6 }, queued: true });
  b.step(); assert.equal(b.get(unit.id).commandsQueue.length, 1);
  b.step(100);
  assert.ok(Math.hypot(b.get(unit.id).x + 6, b.get(unit.id).y + 6) < 0.05);
  b.event({ type: 'MOVE_REQUESTED', entityId: unit.id, target: { x: -4, y: -6 } });
  b.event({ type: 'MOVE_REQUESTED', entityId: unit.id, target: { x: -4, y: -4 }, queued: true });
  b.event({ type: 'MOVE_REQUESTED', entityId: unit.id, target: { x: -8, y: -6 } });
  b.step(); assert.equal(b.get(unit.id).commandsQueue.length, 0);
  b.step(100); assert.ok(Math.abs(b.get(unit.id).x + 8) < 0.05);
});

test('atomic spawn events respect 20 slots and 3x3 footprints; removal frees a slot', () => {
  const building = createBuilding(-6, -6, { sizeTiles: 3, color: 'blue' });
  const b = setup([building]);
  for (let i = 0; i < 25; i++) b.event({ type: 'SPAWN_REQUESTED', buildingId: building.id });
  b.step();
  const units = b.state().entities.filter(e => e.kind === 'unit');
  assert.equal(units.length, 20);
  assert.ok(units.every(u => distanceFromBuildingFootprint(u.x, u.y, building) >= 0.8));
  assert.ok(units.every(u => u.kind === 'unit' && u.producerId === building.id));
  b.event({ type: 'ENTITY_REMOVED', entityId: units[0]!.id });
  b.event({ type: 'SPAWN_REQUESTED', buildingId: building.id });
  b.step(); assert.equal(b.state().entities.filter(e => e.kind === 'unit').length, 20);
});

test('attack approach reaches a large building and uses existing attackDamage stat', () => {
  const unit = createUnit(-4, -4, 'blue');
  unit.attackDamage = 37; unit.strength = 37;
  const building = createBuilding(0, -4, { sizeTiles: 3, color: 'red', maxHp: 5000 });
  const b = setup([unit, building]);
  b.event({ type: 'ATTACK_REQUESTED', entityId: unit.id, targetId: building.id });
  b.step(160);
  assert.ok(b.get(building.id).hp < 5000);
  assert.equal((5000 - b.get(building.id).hp) % 37, 0);
  assert.ok(distanceFromBuildingFootprint(b.get(unit.id).x, b.get(unit.id).y, building) >= 0.799);
});

test('attack then queued retreat runs through the common frame queue', () => {
  const unit = createUnit(-6, -6, 'blue'), enemy = createUnit(-5, -6, 'red');
  enemy.hp = 10; enemy.strength = 0;
  const b = setup([unit, enemy]);
  b.event({ type: 'ATTACK_REQUESTED', entityId: unit.id, targetId: enemy.id });
  b.event({ type: 'MOVE_REQUESTED', entityId: unit.id, target: { x: -9, y: -6 }, queued: true });
  b.step(100);
  assert.equal(b.state().entities.some(e => e.id === enemy.id), false);
  assert.ok(Math.abs(b.get(unit.id).x + 9) < 0.05);
  assert.equal(b.get(unit.id).commandsQueue.length, 0);
});

test('Vuex healing progresses across copied frames and a move cancels it', () => {
  const unit = createUnit(-6, -6); unit.hp = 40;
  const b = setup([unit]);
  b.event({ type: 'HEAL_REQUESTED', entityId: unit.id }); b.step(42);
  assert.equal(b.get(unit.id).hp, 75);
  b.step(250);
  b.event({ type: 'HEAL_REQUESTED', entityId: unit.id }); b.step(10);
  b.event({ type: 'MOVE_REQUESTED', entityId: unit.id, target: { x: -9, y: -6 } }); b.step(50);
  assert.equal(b.get(unit.id).hp, 75);
  assert.equal(b.state().effects[unit.id]?.healing, 0);
});

test('recruitment weapon and hold command survive the shared frame/event pipeline', () => {
  const house = createBuilding(-6, -6, 'blue');
  const b = setup([house]);
  b.event({ type: 'SPAWN_REQUESTED', buildingId: house.id, weapon: 'bow' }); b.step();
  const archer = b.state().entities.find(e => e.kind === 'unit')!;
  assert.equal(archer.kind, 'unit');
  if (archer.kind !== 'unit') return;
  assert.equal(archer.weapon, 'bow'); assert.equal(archer.attackRange, 4.5);
  b.event({ type: 'MOVE_REQUESTED', entityId: archer.id, target: { x: -9, y: -9 } }); b.step(3);
  b.event({ type: 'HOLD_REQUESTED', entityId: archer.id }); b.step();
  const held = b.get(archer.id);
  assert.equal(held.kind === 'unit' && held.stance, 'hold');
  assert.equal(held.path.length, 0); assert.equal(held.commandsQueue.length, 0);
  b.step(10);
  assert.equal(b.get(archer.id).kind === 'unit' && (b.get(archer.id) as typeof archer).pose?.moving, false);
  b.event({ type: 'MOVE_REQUESTED', entityId: archer.id, target: { x: -9, y: -9 } }); b.step();
  assert.equal((b.get(archer.id) as typeof archer).stance, 'defensive');
});
