import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createStore } from 'vuex';
import gameModule from '../store/game';
import { useRtsGame } from './useRtsGame';
import { createBuilding, createUnit, type Unit } from './entities';
import { buildingContains, createUnitActions } from './unitActions';
import { getMapTiles, getTerrainAt } from './terrain';

test('attackers reserve distinct melee positions and release them on cancellation', () => {
  const target = createUnit(0, -6, 'red');
  target.path = [{ x: 0, y: -7 }]; // no automatic counter-order while positioning
  const units = Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4;
    return createUnit(Math.cos(angle) * 4, -6 + Math.sin(angle) * 4, 'blue');
  });
  const actions = createUnitActions([target, ...units], {});
  for (const u of units) actions.attack(u, target);
  actions.tick(0.01);
  const places = units.map(u => actions.getAttackSlot(u.id));
  assert.ok(places.every(Boolean));
  for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) {
    assert.ok(Math.hypot(places[i]!.x - places[j]!.x, places[i]!.y - places[j]!.y) >= 0.8);
  }
  actions.cancel(units[0]!);
  assert.equal(actions.getAttackSlot(units[0]!.id), undefined);
});

// Drive the actual game's frame loop, movement and collisions, without DOM rendering.
function battlefield(random: () => number = () => 1) {
  let frame: FrameRequestCallback = () => {};
  Object.assign(globalThis, {
    window: new EventTarget(),
    requestAnimationFrame: (callback: FrameRequestCallback) => { frame = callback; return 1; },
    cancelAnimationFrame: () => {},
  });
  const store = createStore({ modules: { game: gameModule } });
  const game = useRtsGame(random, store);
  game.init();
  store.commit('game/CLEAR_ENTITIES');
  store.commit('game/CONFIGURE_RANDOM', random);
  const houses = [createBuilding(0, 0, 'blue'), createBuilding(4, -1, 'red')];
  const tiles = getMapTiles().filter(p => p.terrain === 'land' && !houses.some(b => buildingContains(b, p.x, p.y)));
  const occupied = new Set<string>();
  const armies: Unit[][] = [];
  for (const [x, color] of [[-4, 'blue'], [9, 'red']] as const) {
    const candidates = [...tiles].sort((a, b) => Math.hypot(a.x - x, a.y - 2) - Math.hypot(b.x - x, b.y - 2));
    const army: Unit[] = [];
    for (const p of candidates) {
      const key = p.x + ':' + p.y;
      if (occupied.has(key)) continue;
      occupied.add(key); army.push(createUnit(p.x, p.y, color));
      if (army.length === 20) break;
    }
    armies.push(army);
  }
  game.entities.value.splice(0, game.entities.value.length, ...houses, ...armies.flat());
  game.viewportW.value = 1200; game.viewportH.value = 720;
  let time = 1000;
  const timings: number[] = [];
  const step = () => {
    time += 50;
    const start = performance.now(); frame(time); timings.push(performance.now() - start);
    for (const u of game.entities.value) {
      assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y));
      if (u.kind !== 'unit') continue;
      assert.equal(getTerrainAt(Math.round(u.x), Math.round(u.y)), u.movementType, `invalid terrain ${u.id} (${u.x},${u.y})`);
      assert.ok(!houses.some(b => Math.abs(u.x - b.x) < b.sizeTiles / 2 && Math.abs(u.y - b.y) < b.sizeTiles / 2), `inside building: ${u.id}`);
    }
  };
  const command = (army: Unit[], x: number, y: number, attack = true) => {
    for (const e of game.entities.value) e.isSelected = army.some(u => u.id === e.id);
    const p = game.worldToScreen(x, y);
    game.commandMoveTo(p.x, p.y, false, attack);
  };
  return { game, armies, step, command, timings };
}

test('20 vs 20: terrain, buildings, target changes and frame cost over 60 simulated seconds', () => {
  const b = battlefield();
  try {
    b.command(b.armies[0]!, 9, 0);
    b.command(b.armies[1]!, -6, 0);
    let checkpoint = new Map<string, { x: number; y: number }>();
    for (let i = 0; i < 1200; i++) {
      b.step();
      if (i === 900) checkpoint = new Map(b.game.entities.value.map(u => [u.id, { x: u.x, y: u.y }]));
    }
    const survivors = b.game.entities.value.filter(e => e.kind === 'unit');
    assert.ok(survivors.length < 40, 'combat must cause casualties');
    assert.ok(survivors.every(e => e.hp > 0));
    for (const u of survivors) {
      const before = checkpoint.get(u.id);
      if (before && u.path.length) assert.ok(Math.hypot(u.x - before.x, u.y - before.y) > 0.2, `stuck soldier ${JSON.stringify({ id:u.id, before, x:u.x, y:u.y, next:u.path.slice(0,3), fighting:b.game.isAttacking(u.id) })}`);
    }
    const sorted = [...b.timings].sort((a, c) => a - c);
    console.log(JSON.stringify({ scenario: '20v20', survivors: survivors.length,
      teams: Object.fromEntries(['blue', 'red'].map(color => [color, survivors.filter(u => u.color === color).length])),
      frames: b.timings.length, meanMs: b.timings.reduce((a, c) => a + c, 0) / b.timings.length,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)], maxMs: sorted.at(-1) }));
  } finally { b.game.destroy(); }
});

test('20 vs 20: retreat overrides combat and units move toward the retreat point', () => {
  const b = battlefield();
  try {
    b.command(b.armies[0]!, 9, 0); b.command(b.armies[1]!, -6, 0);
    for (let i = 0; i < 60; i++) b.step();
    const survivors = b.game.entities.value.filter((e): e is Unit => e.kind === 'unit' && e.color === 'blue');
    assert.ok(survivors.length);
    const before = new Map(survivors.map(u => [u.id, Math.hypot(u.x + 10, u.y + 8)]));
    b.command(survivors, -10, -8, false);
    for (let i = 0; i < 100; i++) {
      b.step();
      for (const u of b.game.entities.value) if (u.kind === 'unit' && u.color === 'blue' && u.path.length) {
        assert.equal(b.game.isAttacking(u.id), false);
      }
    }
    const escaped = b.game.entities.value.filter((e): e is Unit => e.kind === 'unit' && before.has(e.id));
    assert.ok(escaped.some(u => Math.hypot(u.x + 10, u.y + 8) < before.get(u.id)! - 2));
  } finally { b.game.destroy(); }
});

test('armed attack command is one-shot; a soldier retreats after a hit while pursued', () => {
  const b = battlefield();
  try {
    const a = createUnit(0, -6, 'blue'), enemy = createUnit(1, -6, 'red');
    b.game.entities.value.splice(0, b.game.entities.value.length, a, enemy);
    // Access the reactive soldier instances actually used by the game loop.
    let runner = b.game.entities.value[0] as Unit;
    let pursuer = b.game.entities.value[1] as Unit;
    runner.isSelected = true;
    b.game.attackMoveMode.value = true;
    const target = b.game.worldToScreen(pursuer.x, pursuer.y);
    b.game.commandMoveTo(target.x, target.y - 17);
    assert.equal(b.game.attackMoveMode.value, false);
    for (let i = 0; i < 8; i++) b.step();
    runner = b.game.entities.value.find(e => e.id === a.id) as Unit;
    pursuer = b.game.entities.value.find(e => e.id === enemy.id) as Unit;
    assert.ok(runner.hp < 100, 'retreat must be tested after an actual hit');
    const startX = runner.x;
    const goal = b.game.worldToScreen(-6, -6);
    b.game.commandMoveTo(goal.x, goal.y);
    b.step();
    assert.equal(b.game.isAttacking(runner.id), false);
    for (let i = 0; i < 20; i++) {
      b.step();
      assert.equal(b.game.isAttacking(runner.id), false);
    }
    runner = b.game.entities.value.find(e => e.id === a.id) as Unit;
    pursuer = b.game.entities.value.find(e => e.id === enemy.id) as Unit;
    assert.ok(runner.x < startX - 1.5, 'runner must move even when the opponent follows');
    assert.ok(pursuer.x < 1, 'opponent really pursues the retreating soldier');
  } finally { b.game.destroy(); }
});

test('20 vs 20 with seeded ultimate hits and healing stays within terrain and effect limits', () => {
  let seed = 42;
  const b = battlefield(() => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; });
  try {
    b.command(b.armies[0]!, 9, 0); b.command(b.armies[1]!, -6, 0);
    let ultimates = 0;
    for (let i = 0; i < 600; i++) {
      b.step();
      assert.ok(b.game.combatVisuals.value.length <= 256);
      if (b.game.combatVisuals.value.some(e => e.kind === 'ultimate')) ultimates++;
    }
    assert.ok(ultimates > 0);
    assert.ok(b.game.entities.value.filter(e => e.kind === 'unit').length < 40);
  } finally { b.game.destroy(); }
});
