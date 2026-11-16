import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movementSpeed, createBuilding, createUnit as createDefaultUnit, type Entity } from './entities';
import { PRODUCER_LIMIT, producerCount, buildingContains, createUnitActions as createRandomActions, type UnitEffects, spawnFromBuilding } from './unitActions';
import type { CombatVisualEvent } from './combatVisuals';
const createUnitActions = (entities: Entity[], effects: Record<string, UnitEffects>, onVisual?: (event: CombatVisualEvent) => void) => createRandomActions(entities, effects, onVisual, () => 1);

const createUnit = (...args: Parameters<typeof createDefaultUnit>) => { const unit = createDefaultUnit(...args); unit.attackDamage = 20; unit.strength = 20; unit.hp = unit.maxHp = 100; unit.weapon = 'spear'; unit.attackRange = 1.2; return unit; };

import { getTerrainAt } from './terrain';

test('spawn inherits producer identity and respects terrain and occupancy', () => {
  const building = createBuilding(0, -2, 'blue');
  building.groupId = 7;
  const entities: Entity[] = [building];
  for (let i = 0; i < 8; i++) {
    const unit = spawnFromBuilding(entities, building)!;
    assert.ok(unit);
    assert.equal(unit.groupId, 7);
    assert.equal(unit.color, building.color);
    assert.equal(getTerrainAt(unit.x, unit.y), 'land');
    assert.equal(buildingContains(building, unit.x, unit.y), false);
    assert.ok(entities.every(e => e.id === unit.id || Math.hypot(e.x - unit.x, e.y - unit.y) >= 0.85));
  }
  assert.equal(spawnFromBuilding([], building), null);
});

test('water producer creates only water units, full neighborhood refuses spawn', () => {
  const harbor = createBuilding(2, -2, 'cyan');
  harbor.spawnType = 'water';
  const entities: Entity[] = [harbor];
  let count = 0;
  while (count < 100) {
    const unit = spawnFromBuilding(entities, harbor);
    if (!unit) break;
    assert.equal(unit.movementType, 'water');
    assert.equal(getTerrainAt(unit.x, unit.y), 'water');
    count++;
  }
  assert.ok(count > 0 && count < 100);
  assert.equal(spawnFromBuilding(entities, harbor), null);
});

test('friendly fire is refused; damage uses strength and attack interval; cancel stops damage', () => {
  const unit = createUnit(0, 0, 'blue');
  const friend = createUnit(-10, -10, 'green');
  unit.groupId = friend.groupId = 'allies';
  const enemy = createUnit(1, 0, 'red');
  enemy.groupId = 'enemy';
  unit.strength = 15; unit.attackSpeed = 2;
  const actions = createUnitActions([unit, friend, enemy], {});
  assert.equal(actions.attack(unit, friend), false);
  assert.equal(actions.attack(unit, enemy), true);
  actions.tick(0.01); assert.equal(enemy.hp, 100);
  actions.tick(0.22); assert.equal(enemy.hp, 85);
  actions.tick(0.25); assert.equal(enemy.hp, 85);
  actions.tick(0.25); assert.equal(enemy.hp, 85);
  actions.tick(0.22); assert.equal(enemy.hp, 70);
  actions.cancel(unit); actions.tick(1); assert.equal(enemy.hp, 70);
});

test('out-of-range attack plans a route without damaging target; lost target clears order', () => {
  const unit = createUnit(-4, 0, 'blue');
  const enemy = createUnit(1, 0, 'red');
  const entities: Entity[] = [unit, enemy];
  const actions = createUnitActions(entities, {});
  actions.attack(unit, enemy); actions.tick(0.01);
  assert.equal(enemy.hp, 100);
  assert.ok(unit.path.length > 0);
  entities.pop(); actions.tick(0.01);
  assert.equal(unit.path.length, 0);
  assert.equal(actions.isAttacking(unit.id), false);
});

test('destroyed unit or building is removed, attacker rests, new order interrupts rest', () => {
  for (const target of [createUnit(1, 0, 'red'), createBuilding(1, 0, 'red')]) {
    const unit = createUnit(0, 0, 'blue');
    const entities: Entity[] = [unit, target];
    target.hp = 10;
    const effects = {};
    const actions = createUnitActions(entities, effects);
    actions.attack(unit, target); actions.tick(0.01); actions.tick(0.22);
    assert.equal(target.hp, 0);
    assert.equal(entities.includes(target), false);
    actions.tick(0.01);
    assert.ok(actions.effect(unit.id).rest > 0);
    actions.cancel(unit);
    assert.equal(actions.effect(unit.id).rest, 0);
  }
});

test('reissuing attacks cannot reset the cooldown', () => {
  const unit = createUnit(0, 0, 'blue');
  const enemy = createUnit(1, 0, 'red');
  const actions = createUnitActions([unit, enemy], {});
  for (let i = 0; i < 5; i++) { actions.attack(unit, enemy); actions.tick(0.1); }
  assert.equal(enemy.hp, 80);
});

const advance = (actions: ReturnType<typeof createUnitActions>, seconds: number) => {
  for (let t = 0; t < seconds - 0.0001; t += 0.01) actions.tick(0.01);
};

test('defender answers; equal duelists exchange lethal blows together after windup', () => {
  const a = createUnit(0, 0, 'blue'), b = createUnit(1, 0, 'red');
  a.hp = b.hp = 20;
  const entities: Entity[] = [a, b];
  const actions = createUnitActions(entities, {});
  actions.attack(a, b);
  assert.ok(actions.isAttacking(b.id));
  advance(actions, 0.1);
  assert.equal(a.hp, 20); assert.equal(b.hp, 20);
  advance(actions, 0.2);
  assert.equal(a.hp, 0); assert.equal(b.hp, 0); assert.equal(entities.length, 0);
});

test('move cancels a pending swing and prevents retaliation while retreating', () => {
  const a = createUnit(0, 0, 'blue'), b = createUnit(1, 0, 'red');
  const actions = createUnitActions([a, b], {});
  actions.attack(a, b); advance(actions, 0.1);
  actions.cancel(a); a.path = [{ x: -4, y: 0 }];
  advance(actions, 0.3);
  assert.equal(b.hp, 100); assert.equal(a.hp, 80);
  assert.equal(actions.isAttacking(a.id), false);
});

test('defenders stop pursuit beyond their leash', () => {
  const a = createUnit(0, 0, 'blue'), b = createUnit(1, 0, 'red');
  const actions = createUnitActions([a, b], {});
  actions.attack(a, b); a.x = -10; actions.tick(0.01);
  assert.equal(actions.isAttacking(b.id), false); assert.equal(b.path.length, 0);
});

test('idle allies protect their building; moving allies keep their orders', () => {
  const a = createUnit(0, 0, 'blue'), house = createBuilding(1, 0, 'red');
  const guard = createUnit(2, 0, 'red'), moving = createUnit(2, 1, 'red');
  moving.path = [{ x: 5, y: 0 }];
  const actions = createUnitActions([a, house, guard, moving], {});
  actions.attack(a, house);
  assert.ok(actions.isAttacking(guard.id));
  assert.equal(actions.isAttacking(moving.id), false);
});

test('out of range during windup cancels impact; unreachable target is abandoned', () => {
  const a = createUnit(0, -3, 'blue'), b = createUnit(1, -3, 'red');
  const actions = createUnitActions([a, b], {});
  actions.attack(a, b); advance(actions, 0.1);
  b.x = 0; b.y = 0;
  advance(actions, 2.6);
  assert.equal(b.hp, 100); assert.equal(actions.isAttacking(a.id), false);
});

test('each producer has 20 living slots; a death frees a slot; surviving troops outlive producer', () => {
  const house = createBuilding(0, -6, 'blue');
  const other = createBuilding(8, -6, 'blue');
  const entities: Entity[] = [house, other];
  for (let i = 0; i < PRODUCER_LIMIT; i++) assert.ok(spawnFromBuilding(entities, house));
  assert.equal(producerCount(entities, house.id), 20);
  assert.equal(spawnFromBuilding(entities, house), null);
  assert.ok(spawnFromBuilding(entities, other));
  const casualty = entities.find(e => e.kind === 'unit' && e.producerId === house.id)!;
  casualty.hp = 0;
  assert.equal(producerCount(entities, house.id), 19);
  assert.ok(spawnFromBuilding(entities, house));
  house.hp = 0;
  assert.equal(spawnFromBuilding(entities, house), null);
  assert.equal(producerCount(entities, house.id), 20);
});

test('idle soldiers acquire enemies automatically, ignoring allies and distant units', () => {
  const a = createUnit(0, -6, 'blue'), ally = createUnit(0, -5, 'blue');
  const near = createUnit(1, -6, 'red'), far = createUnit(10, -6, 'red');
  const actions = createUnitActions([a, ally, near, far], {});
  advance(actions, 0.3);
  assert.ok(actions.isAttacking(a.id));
  assert.ok(near.hp < 100);
  assert.equal(far.hp, 100);
});

test('attack-move defeats an encountered enemy and reaches original destination', () => {
  const a = createUnit(0, -6, 'blue'), enemy = createUnit(2, -6, 'red');
  enemy.hp = 20; enemy.strength = 0;
  const entities: Entity[] = [a, enemy];
  const actions = createUnitActions(entities, {});
  assert.ok(actions.attackMove(a, { x: 6, y: -6 }));
  for (let i = 0; i < 800; i++) {
    actions.tick(0.01);
    for (const unit of entities) {
      const p = unit.path[0];
      if (!p) continue;
      const dx = p.x - unit.x, dy = p.y - unit.y, d = Math.hypot(dx, dy);
      const step = unit.speed * 0.01;
      if (d <= step) { unit.x = p.x; unit.y = p.y; unit.path.shift(); }
      else { unit.x += dx / d * step; unit.y += dy / d * step; }
    }
  }
  assert.equal(entities.includes(enemy), false);
  assert.ok(Math.hypot(a.x - 6, a.y + 6) < 0.01);
});

test('ordinary movement overrides attack-move and does not acquire enemies along the way', () => {
  const a = createUnit(0, -6, 'blue'), enemy = createUnit(2, -6, 'red');
  enemy.strength = 0;
  const actions = createUnitActions([a, enemy], {});
  actions.attackMove(a, { x: 6, y: -6 });
  actions.tick(0.01);
  actions.cancel(a); a.path = [{ x: -6, y: -6 }];
  advance(actions, 2);
  assert.equal(actions.isAttacking(a.id), false);
  assert.equal(enemy.hp, 100);
  assert.deepEqual(a.path, [{ x: -6, y: -6 }]);
});

test('wounds reduce movement speed smoothly to half, without changing base stats', () => {
  const unit = createUnit(0, 0);
  assert.equal(movementSpeed(unit), 2.5);
  unit.hp = 50; assert.equal(movementSpeed(unit), 1.875);
  unit.hp = 1; assert.ok(movementSpeed(unit) > 1.25 && movementSpeed(unit) < 1.27);
  unit.hp = -5; assert.equal(movementSpeed(unit), 1.25);
  unit.hp = 200; assert.equal(movementSpeed(unit), 2.5);
  assert.equal(unit.speed, 2.5);
});

test('short retreat preserves an exact point inside the current tile', () => {
  const a = createUnit(0, -6, 'blue'), b = createUnit(1, -6, 'red');
  const actions = createUnitActions([a, b], {});
  actions.attack(a, b); advance(actions, 0.3);
  assert.ok(actions.move(a, { x: -0.4, y: -6 }));
  assert.deepEqual(a.path.at(-1), { x: -0.4, y: -6 });
  assert.equal(actions.isAttacking(a.id), false);
  advance(actions, 0.5);
  assert.equal(actions.isAttacking(a.id), false);
});

test('medicine takes two seconds, restores 35 percent and has a twelve second cooldown', () => {
  const u = createUnit(0, -6); u.hp = 50;
  const actions = createUnitActions([u], {});
  assert.ok(actions.heal(u));
  advance(actions, 1.9); assert.equal(u.hp, 50);
  advance(actions, 0.11); assert.equal(u.hp, 85);
  assert.equal(actions.heal(u), false);
  advance(actions, 12);
  assert.ok(actions.heal(u)); advance(actions, 2.01);
  assert.equal(u.hp, 100);
});

test('medicine is refused near enemies and interrupted by movement, damage or enemy arrival', () => {
  const u = createUnit(0, -6, 'blue'), enemy = createUnit(1, -6, 'red'); u.hp = 50;
  const entities = [u, enemy];
  const actions = createUnitActions(entities, {});
  assert.equal(actions.heal(u), false);
  enemy.x = 10;
  assert.ok(actions.heal(u)); advance(actions, 0.5);
  actions.move(u, { x: -5, y: -6 }); advance(actions, 2);
  assert.equal(u.hp, 50);
  u.path = []; assert.ok(actions.heal(u));
  u.hp = 45; advance(actions, 2.1); assert.equal(u.hp, 45);
  assert.ok(actions.heal(u)); enemy.x = 2; actions.tick(0.01);
  assert.equal(actions.effect(u.id).healing, 0);
});

test('victorious wounded soldier drinks automatically after three safe seconds', () => {
  const u = createUnit(0, -6, 'blue'), enemy = createUnit(1, -6, 'red');
  u.hp = 50; enemy.hp = 20; enemy.strength = 0;
  const actions = createUnitActions([u, enemy], {});
  actions.attack(u, enemy); advance(actions, 3);
  assert.equal(u.hp, 50);
  advance(actions, 2.5);
  assert.equal(u.hp, 85);
  advance(actions, 20);
  assert.equal(u.hp, 85, 'automatic medicine applies once per completed battle');
});

test('ultimate kills a full-health soldier and emits a special impact and remains', () => {
  const a = createUnit(0, -6, 'blue'), b = createUnit(1, -6, 'red');
  b.hp = b.maxHp = 1000; b.strength = 0;
  const events: CombatVisualEvent[] = [];
  const entities: Entity[] = [a, b];
  const actions = createRandomActions(entities, {}, event => events.push(event), () => 0);
  actions.attack(a, b); advance(actions, 0.3);
  assert.equal(b.hp, 0);
  assert.equal(entities.includes(b), false);
  assert.ok(events.some(e => e.kind === 'ultimate'));
  assert.ok(events.some(e => e.kind === 'death' && e.ultimate));
});

test('ultimate triples building damage, respects cooldown and never rerolls on order cancellation', () => {
  const a = createUnit(0, -6, 'blue'), house = createBuilding(1, -6, 'red');
  a.strength = 10;
  let rolls = 0;
  const actions = createRandomActions([a, house], {}, undefined, () => { rolls++; return 0; });
  actions.attack(a, house); advance(actions, 0.1);
  assert.equal(rolls, 0);
  actions.cancel(a); actions.attack(a, house); advance(actions, 0.1);
  assert.equal(rolls, 0);
  advance(actions, 1.2);
  assert.equal(house.hp, 470); assert.equal(rolls, 1);
  advance(actions, 1);
  assert.equal(house.hp, 460); assert.equal(rolls, 1);
  advance(actions, 30);
  assert.ok(rolls >= 2);
});

test('roll at 2 percent boundary causes an ordinary hit', () => {
  const a = createUnit(0, -6, 'blue'), b = createUnit(1, -6, 'red');
  b.strength = 0;
  const actions = createRandomActions([a, b], {}, undefined, () => 0.02);
  actions.attack(a, b); advance(actions, 0.3);
  assert.equal(b.hp, 80);
});
