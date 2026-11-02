import { createUnit, type Building, type Entity, type Unit } from './entities';
import { findNearestTerrainTile, getTerrainAt } from './terrain';
import { findPath, type Point } from './pathfinding';
import type { CombatVisualEvent } from './combatVisuals';

export const isEnemy = (a: Entity, b: Entity) =>
  (a.groupId ?? a.color) !== (b.groupId ?? b.color);

export const buildingContains = (b: Building, x: number, y: number) =>
  Math.abs(x - b.x) < b.sizeTiles / 2 + 0.5 &&
  Math.abs(y - b.y) < b.sizeTiles / 2 + 0.5;

export const PRODUCER_LIMIT = 20;
export const producerCount = (entities: Entity[], id: string) =>
  entities.filter(e => e.kind === 'unit' && e.producerId === id && e.hp > 0).length;

export function spawnFromBuilding(entities: Entity[], building: Building): Unit | null {
  if (!entities.includes(building) || building.hp <= 0) return null;
  if (producerCount(entities, building.id) >= PRODUCER_LIMIT) return null;
  const movement = building.spawnType ?? 'land';
  const points: Point[] = [];
  const radius = Math.ceil(building.sizeTiles / 2) + 2;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      points.push({ x: Math.round(building.x) + dx, y: Math.round(building.y) + dy });
    }
  }
  points.sort((a, b) => Math.hypot(a.x - building.x, a.y - building.y) - Math.hypot(b.x - building.x, b.y - building.y));
  const place = points.find(p => getTerrainAt(p.x, p.y) === movement && !entities.some(e =>
    e.kind === 'building' ? buildingContains(e, p.x, p.y) : Math.hypot(e.x - p.x, e.y - p.y) < 0.85,
  ));
  if (!place) return null;
  const unit = createUnit(place.x, place.y, building.color, movement);
  unit.groupId = building.groupId;
  unit.producerId = building.id;
  entities.push(unit);
  return unit;
}

interface Attack {
  targetId: string;
  repath: number;
  windup: number;
  stuck: number;
  defensive: boolean;
  anchor: Point;
}
export interface UnitEffects {
  hit: number; rest: number; smoke: number; strike: number; ultimate: number;
  facingLeft: boolean; healing: number;
}

export function createUnitActions(
  entities: Entity[], effects: Record<string, UnitEffects>,
  onVisual: (event: CombatVisualEvent) => void = () => {},
  random: () => number = Math.random,
) {
  const medicines = new Map<string, { cooldown: number; drinking: number; hp: number; safe: number; pending: boolean }>();
  const medicine = (u: Unit) => {
    let state = medicines.get(u.id);
    if (!state) { state = { cooldown: 0, drinking: 0, hp: u.hp, safe: 0, pending: false }; medicines.set(u.id, state); }
    return state;
  };
  const orders = new Map<string, Attack>();
  const slots = new Map<string, { targetId: string; point: Point }>();
  const ultimateCooldowns = new Map<string, number>();
  const cooldowns = new Map<string, number>();
  const disengaged = new Map<string, number>();
  const marches = new Map<string, Point>();
  const peaceful = new Map<string, Point>();
  const ignored = new Map<string, number>();
  let clock = 0;
  let scanIn = 0;
  const effect = (id: string) => effects[id] ?? (effects[id] = {
    hit: 0, rest: 0, smoke: 0, strike: 0, ultimate: 0, facingLeft: false, healing: 0,
  });
  const blocked = (u: Unit, x: number, y: number) => getTerrainAt(x, y) !== u.movementType ||
    entities.some(e => e.kind === 'building' && buildingContains(e, x, y));
  const distance = (u: Unit, target: Entity) => target.kind === 'unit'
    ? Math.hypot(u.x - target.x, u.y - target.y)
    : Math.hypot(Math.max(0, Math.abs(u.x - target.x) - target.sizeTiles / 2), Math.max(0, Math.abs(u.y - target.y) - target.sizeTiles / 2));
  const inRange = (u: Unit, target: Entity) => distance(u, target) <= 1.15;
  const approach = (u: Unit, target: Entity, reserve = false): Point[] => {
    const available = (p: Point) => !blocked(u, Math.round(p.x), Math.round(p.y)) &&
      inRange({ ...u, ...p }, target) &&
      !entities.some(e => e.kind === 'unit' && e.id !== u.id && e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) < 0.8) &&
      ![...slots].some(([id, slot]) => id !== u.id && Math.hypot(slot.point.x - p.x, slot.point.y - p.y) < 0.8);
    const candidates: Point[] = [];
    if (target.kind === 'unit') {
      // Eight melee positions, separated by more than the collision diameter.
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        candidates.push({ x: target.x + Math.cos(angle) * 1.1, y: target.y + Math.sin(angle) * 1.1 });
      }
    } else {
      const radius = Math.ceil(target.sizeTiles / 2) + 1;
      for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
        candidates.push({ x: Math.round(target.x) + dx, y: Math.round(target.y) + dy });
      }
    }
    candidates.sort((a, b) => Math.hypot(u.x - a.x, u.y - a.y) - Math.hypot(u.x - b.x, u.y - b.y));
    const previous = slots.get(u.id);
    if (previous?.targetId === target.id && available(previous.point)) candidates.unshift(previous.point);
    for (const p of candidates) {
      if (!available(p)) continue;
      const path = findPath(u.x, u.y, p.x, p.y, (x, y) => blocked(u, x, y));
      if (path.length) {
        if (reserve) slots.set(u.id, { targetId: target.id, point: p });
        return path;
      }
    }
    if (reserve) slots.delete(u.id);
    return [];
  };
  const finish = (u: Unit, rest = false, resume = true) => {
    slots.delete(u.id);
    orders.delete(u.id); u.path = []; effect(u.id).strike = 0;
    effect(u.id).rest = rest ? 1.2 : 0;
    if (rest && u.hp < u.maxHp) { medicine(u).pending = true; medicine(u).safe = 0; }
    const goal = marches.get(u.id);
    if (resume && goal) {
      u.path = findPath(u.x, u.y, goal.x, goal.y, (x, y) => blocked(u, x, y));
      effect(u.id).rest = 0;
      if (!u.path.length) marches.delete(u.id);
    }
  };
  // A move order always wins over automatic retaliation, including during a swing.
  const cancel = (u: Unit) => { medicine(u).drinking = 0; medicine(u).pending = false; effect(u.id).healing = 0; marches.delete(u.id); peaceful.delete(u.id); finish(u); disengaged.set(u.id, 1.5); };
  const begin = (u: Unit, target: Entity, defensive: boolean) => {
    if (u.hp <= 0 || target.hp <= 0 || !isEnemy(u, target)) return false;
    const current = orders.get(u.id);
    if (current?.targetId === target.id) { if (!defensive) current.defensive = false; return true; }
    medicine(u).drinking = 0; medicine(u).pending = false; effect(u.id).healing = 0;
    finish(u, false, false);
    orders.set(u.id, { targetId: target.id, repath: 0, windup: -1, stuck: 0,
      defensive, anchor: { x: u.x, y: u.y } });
    return true;
  };
  const defend = (victim: Entity, attacker: Unit) => {
    for (const candidate of entities) {
      if (candidate.kind !== 'unit' || candidate.hp <= 0 || isEnemy(candidate, victim) ||
        !isEnemy(candidate, attacker) || candidate.path.length || orders.has(candidate.id) || (medicines.get(candidate.id)?.drinking ?? 0) > 0 ||
        (disengaged.get(candidate.id) ?? 0) > 0 || peaceful.has(candidate.id)) continue;
      if (candidate.id === victim.id || distance(candidate, victim) <= 3) begin(candidate, attacker, true);
    }
  };
  const attack = (u: Unit, target: Entity) => {
    if (u.hp <= 0 || target.hp <= 0 || !isEnemy(u, target)) return false;
    marches.delete(u.id); peaceful.delete(u.id);
    const accepted = begin(u, target, false);
    if (accepted) { disengaged.delete(u.id); defend(target, u); }
    return accepted;
  };
  const attackMove = (u: Unit, target: Point) => {
    cancel(u);
    const goal = findNearestTerrainTile(target.x, target.y, u.movementType,
      (x, y) => blocked(u, x, y));
    if (!goal) return false;
    const path = findPath(u.x, u.y, goal.x, goal.y, (x, y) => blocked(u, x, y));
    if (!path.length) return false;
    marches.set(u.id, goal);
    disengaged.delete(u.id);
    u.path = path;
    return true;
  };
  const move = (u: Unit, target: Point) => {
    cancel(u);
    // Keep a valid exact click: rounding a short retreat back to the current tile
    // would make the soldier stop and immediately acquire the same opponent again.
    const validClick = !blocked(u, Math.round(target.x), Math.round(target.y)) &&
      !entities.some(e => e.kind === 'building' &&
        Math.abs(target.x - e.x) < e.sizeTiles / 2 + 0.05 &&
        Math.abs(target.y - e.y) < e.sizeTiles / 2 + 0.05);
    const goal = validClick ? { ...target } : findNearestTerrainTile(target.x, target.y, u.movementType,
      (x, y) => blocked(u, x, y));
    if (!goal) return false;
    const path = findPath(u.x, u.y, goal.x, goal.y, (x, y) => blocked(u, x, y));
    if (!path.length) return false;
    peaceful.set(u.id, goal);
    disengaged.set(u.id, 1.5);
    u.path = path;
    return true;
  };
  const enemiesNearby = (u: Unit) => entities.some(e => e.kind === 'unit' && e.hp > 0 && isEnemy(u, e) && distance(u, e) <= 3);
  const heal = (u: Unit) => {
    const state = medicine(u);
    if (u.hp <= 0 || u.hp >= u.maxHp || state.cooldown > 0 || state.drinking > 0 || enemiesNearby(u)) return false;
    cancel(u);
    state.drinking = 2; state.hp = u.hp;
    effect(u.id).healing = 0.01;
    return true;
  };
  const tick = (dt: number) => {
    clock += dt;
    scanIn -= dt;
    const ids = new Set(entities.map(e => e.id));
    for (const [id, state] of medicines) {
      const unit = entities.find((e): e is Unit => e.kind === 'unit' && e.id === id);
      if (!unit || unit.hp <= 0) { medicines.delete(id); continue; }
      state.cooldown = Math.max(0, state.cooldown - dt);
      const safe = !orders.has(id) && !unit.path.length && !enemiesNearby(unit);
      if (state.drinking > 0) {
        if (!safe || unit.hp < state.hp) { state.drinking = 0; effect(id).healing = 0; continue; }
        state.drinking = Math.max(0, state.drinking - dt);
        effect(id).healing = (2 - state.drinking) / 2;
        if (state.drinking <= 0.000001) {
          unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * 0.35);
          state.drinking = 0; state.cooldown = 12; state.pending = false; effect(id).healing = 0;
        }
      } else if (state.pending) {
        state.safe = safe ? state.safe + dt : 0;
        if (state.safe >= 3 && state.cooldown <= 0) heal(unit);
      }
    }
    for (const [id, slot] of slots) if (!ids.has(id) || !ids.has(slot.targetId)) slots.delete(id);
    for (const id of Object.keys(effects)) {
      if (!ids.has(id)) { delete effects[id]; continue; }
      const fx = effects[id]!;
      for (const key of ['hit', 'rest', 'smoke', 'strike', 'ultimate'] as const) fx[key] = Math.max(0, fx[key] - dt);
    }
    for (const timers of [cooldowns, disengaged, ultimateCooldowns]) for (const [id, remaining] of timers) {
      if (!ids.has(id)) timers.delete(id);
      else timers.set(id, Math.max(0, remaining - dt));
    }
    for (const [id, goal] of peaceful) {
      const unit = entities.find((e): e is Unit => e.kind === 'unit' && e.id === id);
      if (!unit) { peaceful.delete(id); continue; }
      if (unit.path.length === 0) {
        if (Math.hypot(unit.x - goal.x, unit.y - goal.y) < 0.3) peaceful.delete(id);
        else unit.path = findPath(unit.x, unit.y, goal.x, goal.y, (x, y) => blocked(unit, x, y));
      }
    }
    for (const id of marches.keys()) {
      const unit = entities.find((e): e is Unit => e.kind === 'unit' && e.id === id);
      if (!unit || (unit.path.length === 0 && !orders.has(id))) marches.delete(id);
    }
    for (const [key, until] of ignored) if (until <= clock) ignored.delete(key);
    if (scanIn <= 0) {
      scanIn = 0.25;
      for (const unit of entities) {
        if (unit.kind !== 'unit' || unit.hp <= 0 || orders.has(unit.id) || (medicines.get(unit.id)?.drinking ?? 0) > 0 ||
          peaceful.has(unit.id) || (disengaged.get(unit.id) ?? 0) > 0 || (unit.path.length && !marches.has(unit.id))) continue;
        const enemies = entities.filter((e): e is Unit => e.kind === 'unit' && e.hp > 0 &&
          isEnemy(unit, e) && distance(unit, e) <= 3 && !ignored.has(unit.id + ':' + e.id));
        enemies.sort((a, b) => distance(unit, a) - distance(unit, b));
        for (const enemy of enemies) {
          if (inRange(unit, enemy) || approach(unit, enemy).length) {
            begin(unit, enemy, true); break;
          }
          ignored.set(unit.id + ':' + enemy.id, clock + 3);
        }
      }
    }
    // Collect impacts before applying them: equal duelists can land a final hit together.
    const impacts: { attacker: Unit; target: Entity; damage: number; ultimate: boolean }[] = [];
    for (const [id, order] of orders) {
      const unit = entities.find((e): e is Unit => e.id === id && e.kind === 'unit');
      const target = entities.find(e => e.id === order.targetId);
      if (!unit || unit.hp <= 0) { slots.delete(id); orders.delete(id); continue; }
      if (!target || target.hp <= 0 || !isEnemy(unit, target)) { finish(unit, true); continue; }
      if (order.defensive && Math.hypot(target.x - order.anchor.x, target.y - order.anchor.y) > 5) {
        ignored.set(id + ':' + target.id, clock + 3);
        finish(unit); continue;
      }
      effect(id).facingLeft = (target.x - unit.x) - (target.y - unit.y) < 0;
      order.repath -= dt;
      if (!inRange(unit, target)) {
        order.windup = -1;
        effect(id).strike = 0;
        if (order.repath <= 0) { unit.path = approach(unit, target, true); order.repath = 0.4; }
        order.stuck = unit.path.length ? 0 : order.stuck + dt;
        if (order.stuck > 2) { ignored.set(id + ':' + target.id, clock + 3); finish(unit); }
        continue;
      }
      unit.path = [];
      if (order.windup >= 0) {
        order.windup -= dt;
        if (order.windup > 0) continue;
        const baseDamage = Math.max(0, unit.strength ?? 20);
        const ultimate = baseDamage > 0 && (ultimateCooldowns.get(id) ?? 0) <= 0 && random() < 0.02;
        if (ultimate) ultimateCooldowns.set(id, 30);
        impacts.push({ attacker: unit, target, ultimate,
          damage: ultimate ? (target.kind === 'unit' ? target.hp : baseDamage * 3) : baseDamage });
        order.windup = -1;
      } else if ((cooldowns.get(id) ?? 0) <= 0) {
        const period = 1 / Math.max(0.05, unit.attackSpeed ?? 1);
        order.windup = Math.min(0.22, period / 2);
        effect(id).strike = Math.min(0.45, period);
        cooldowns.set(id, period);
      }
    }
    const ultimateVictims = new Set<string>();
    for (const { attacker, target, damage, ultimate } of impacts) {
      if (ultimate) {
        effect(attacker.id).ultimate = 0.3;
        onVisual({ kind: 'ultimate', x: target.x, y: target.y, color: attacker.color });
        if (target.kind === 'unit') ultimateVictims.add(target.id);
      }
      target.hp = Math.max(0, target.hp - damage);
      effect(target.id).hit = 0.35;
      if (damage > 0 && target.kind === 'unit') onVisual({ kind: 'hit', x: target.x, y: target.y, color: target.color });
      defend(target, attacker);
    }
    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i]!;
      if (entity.hp > 0) continue;
      if (entity.kind === 'unit') onVisual({ kind: 'death', x: entity.x, y: entity.y, color: entity.color, ultimate: ultimateVictims.has(entity.id) });
      entities.splice(i, 1);
    }
  };
  return { attack, attackMove, move, heal, cancel, tick, effect, isAttacking: (id: string) => orders.has(id),
    getAttackSlot: (id: string) => slots.get(id)?.point };
}
