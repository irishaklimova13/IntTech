import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUnit, createBuilding, type Entity } from './entities';
import { updateUnitPose } from './unitPresentation';
import { LAND_WEAPONS, WEAPONS } from './weapons';
import { createUnitActions, spawnFromBuilding } from './unitActions';
import { landscapeDecor, tileColor } from './landscape';
import { isInsideMap } from './terrain';
import type { CombatVisualEvent } from './combatVisuals';

test('blocked units do not walk in place, direction persists after stopping', () => {
  const unit = createUnit(0, -6);
  unit.path = [{ x: 2, y: -6 }];
  updateUnitPose(unit, { x: 0, y: -6, path: unit.path });
  assert.equal(unit.pose?.moving, false);
  unit.x = -.2;
  updateUnitPose(unit, { x: 0, y: -6, path: unit.path });
  assert.ok(unit.pose!.facingX < 0);
  const phase = unit.pose!.phase;
  const direction = unit.pose!.direction;
  updateUnitPose(unit, { x: -.2, y: -6, path: unit.path });
  assert.equal(unit.pose?.moving, false);
  assert.equal(unit.pose?.phase, phase);
  assert.equal(unit.pose?.direction, direction);
});

test('gait follows distance rather than frame count and does not mutate the previous pose', () => {
  const one = createUnit(1, -6), split = createUnit(0, -6);
  one.path = split.path = [{ x: 3, y: -6 }];
  updateUnitPose(one, { x: 0, y: -6, path: one.path });
  for (let i = 1; i <= 10; i++) {
    const previous = split.x;
    split.x = i / 10;
    updateUnitPose(split, { x: previous, y: -6, path: split.path });
  }
  assert.ok(Math.abs(one.pose!.phase - split.pose!.phase) < 1e-8);
  const pose = one.pose!;
  one.x = 1.2; updateUnitPose(one, { x: 1, y: -6, path: one.path });
  assert.notEqual(one.pose, pose);
  assert.equal(pose.phase, split.pose?.phase);
});

test('a producer can recruit different real weapons without changing faction identity', () => {
  for (const weapon of LAND_WEAPONS) {
    const house = createBuilding(0, -6, 'blue'); house.groupId = 2;
    const unit = spawnFromBuilding([house], house, weapon)!;
    assert.ok(unit); assert.equal(unit.weapon, weapon);
    assert.equal(unit.groupId, 2); assert.equal(unit.color, 'blue');
    assert.equal(unit.attackRange, WEAPONS[weapon].range);
    assert.equal(unit.strength, WEAPONS[weapon].strength);
    assert.equal(unit.maxHp, WEAPONS[weapon].health);
  }
  const harbor = createBuilding(2, -2, 'blue'); harbor.spawnType = 'water';
  assert.equal(spawnFromBuilding([harbor], harbor, 'axe')?.weapon, 'harpoon');
});

test('hold position prevents chase, but allows in-range attack; moving releases hold', () => {
  const unit = createUnit(0, -6), enemy = createUnit(2.5, -6, 'red');
  const actions = createUnitActions([unit, enemy], {}, undefined, () => 1);
  actions.hold(unit); actions.tick(.1);
  assert.equal(actions.isAttacking(unit.id), false); assert.equal(unit.path.length, 0);
  enemy.x = 1;
  for (let i = 0; i < 8; i++) actions.tick(.1);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.equal(unit.x, 0); assert.equal(unit.path.length, 0);
  actions.move(unit, { x: -6, y: -6 }); assert.equal(unit.stance, 'defensive');
});

test('archers fire projectiles from range but cannot shoot through buildings', () => {
  for (const obstruction of [false, true]) {
    const archer = createUnit(0, -6, 'blue', 'land', { weapon: 'bow' });
    const enemy = createUnit(4, -6, 'red'); enemy.strength = 0;
    const entities: Entity[] = [archer, enemy];
    if (obstruction) entities.push(createBuilding(2, -6, 'stone'));
    const events: CombatVisualEvent[] = [];
    const actions = createUnitActions(entities, {}, e => events.push(e), () => 1);
    actions.attack(archer, enemy);
    for (let i = 0; i < 8; i++) actions.tick(.05);
    assert.equal(events.some(e => e.kind === 'projectile'), !obstruction);
    assert.equal(enemy.hp < enemy.maxHp, !obstruction);
    if (!obstruction) assert.equal(archer.path.length, 0);
  }
});

test('scenery is deterministic and trees stay outside playable tiles', () => {
  assert.deepEqual(landscapeDecor(), landscapeDecor());
  assert.ok(landscapeDecor().filter(d => d.kind === 'tree').every(d => !isInsideMap(d.x, d.y)));
  assert.equal(tileColor(1, 2), tileColor(1, 2));
});
