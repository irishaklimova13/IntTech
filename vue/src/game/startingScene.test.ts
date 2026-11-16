import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStartingEntities } from './startingScene';
import { getMapTiles, getTerrainAt, isBridgeTile, canTraverseTerrain } from './terrain';
import { buildingOccupiesTile, distanceFromBuildingFootprint } from './buildings';

test('central river and both crossings are symmetric under a half-turn', () => {
  assert.equal(getTerrainAt(0, 0), 'water');
  for (const p of getMapTiles()) {
    assert.equal(p.terrain, getTerrainAt(-p.x, -p.y));
    assert.equal(isBridgeTile(p.x, p.y), isBridgeTile(-p.x, -p.y));
  }
});

test('both camps have identical buildings, troops, transport and safe starting positions', () => {
  const entities = createStartingEntities();
  const blue = entities.filter(e => e.color === '#3b82f6');
  const red = entities.filter(e => e.color === '#dc2626');
  assert.equal(blue.length, red.length);
  for (const a of blue) {
    const b = red.find(e => e.kind === a.kind && e.x === -a.x && e.y === -a.y &&
      (e.kind !== 'unit' || a.kind !== 'unit' || e.weapon === a.weapon));
    assert.ok(b);
    assert.equal(a.hp, b.hp); assert.equal(a.maxHp, b.maxHp);
    if (a.kind === 'building' && b.kind === 'building') {
      assert.equal(a.sizeTiles, b.sizeTiles); assert.equal(a.spawnType, b.spawnType);
      assert.equal(a.name, b.name);
    } else if (a.kind === 'unit' && b.kind === 'unit') {
      assert.equal(a.strength, b.strength); assert.equal(a.speed, b.speed);
      assert.equal(a.attackSpeed, b.attackSpeed); assert.equal(a.attackRange, b.attackRange);
      assert.equal(!!a.transportId, !!b.transportId);
    }
  }
  for (const e of entities) {
    if (e.kind === 'building') {
      for (const p of getMapTiles().filter(p => buildingOccupiesTile(e,p.x,p.y))) assert.equal(p.terrain,'land');
    } else if (!e.transportId) {
      assert.ok(canTraverseTerrain(e.x,e.y,e.movementType));
      assert.ok(!entities.some(b => b.kind === 'building' && distanceFromBuildingFootprint(e.x,e.y,b)<.8));
    }
  }
});
