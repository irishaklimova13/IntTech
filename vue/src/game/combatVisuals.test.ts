import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCombatVisuals, type CombatVisual } from './combatVisuals';
import { createUnitActions } from './unitActions';
import { createUnit } from './entities';

test('blood and remains persist for 15 seconds and are then removed', () => {
  const items: CombatVisual[] = [];
  const visuals = createCombatVisuals(items);
  visuals.add({ kind: 'death', x: 0, y: 0, color: 'blue' });
  visuals.tick(14.9); assert.equal(items.length, 1);
  visuals.tick(0.1); assert.equal(items.length, 0);
});

test('effect count stays bounded, preferring to discard short hit splashes', () => {
  const items: CombatVisual[] = [];
  const visuals = createCombatVisuals(items);
  visuals.add({ kind: 'death', x: 0, y: 0, color: 'blue' });
  for (let i = 0; i < 1000; i++) visuals.add({ kind: 'hit', x: 0, y: 0, color: 'red' });
  assert.equal(items.length, 256);
  assert.equal(items[0]!.kind, 'death');
  visuals.tick(0.6); assert.equal(items.length, 1);
});

test('lethal hits create splashes and one set of remains per defeated soldier', () => {
  const items: CombatVisual[] = [];
  const visuals = createCombatVisuals(items);
  const a = createUnit(0, -6, 'blue'), b = createUnit(1, -6, 'red');
  b.hp = 20;
  const actions = createUnitActions([a, b], {}, visuals.add, () => 1);
  actions.attack(a, b);
  for (let i = 0; i < 100; i++) actions.tick(0.01);
  assert.equal(items.filter(e => e.kind === 'death').length, 1);
  assert.ok(items.some(e => e.kind === 'hit'));
});
