import { computed, reactive, ref } from 'vue';
import { isoToWorld, worldToIso, TILE_H, TILE_W, type Vec2 } from './iso';
import { createBuilding, createUnit, type Entity, type Unit, type Building, type ICommand } from './entities';
import { findPath } from './pathfinding';

export const useRtsGame = () => {
  // ===== Состояние =====
  const cameraX = ref(0);
  const cameraY = ref(0);
  const zoom = ref(1);
  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 2.5;

  const viewportW = ref(0);
  const viewportH = ref(0);

  const entities = reactive<Entity[]>([]);

  interface Marker { id: number; x: number; y: number; born: number }
  const markers = ref<Marker[]>([]);
  let markerSeq = 0;

  const keys: Record<string, boolean> = {};
  let isPanning = false;
  let panLastX = 0;
  let panLastY = 0;

  let rafId: number | null = null;
  let lastTime = 0;

  // ===== Координаты =====
  const screenToIso = (sx: number, sy: number): Vec2 => ({
    x: cameraX.value + (sx - viewportW.value / 2) / zoom.value,
    y: cameraY.value + (sy - viewportH.value / 2) / zoom.value,
  });

  const isoToScreen = (ix: number, iy: number): Vec2 => ({
    x: (ix - cameraX.value) * zoom.value + viewportW.value / 2,
    y: (iy - cameraY.value) * zoom.value + viewportH.value / 2,
  });

  const worldToScreen = (wx: number, wy: number): Vec2 => {
    const iso = worldToIso(wx, wy);
    return isoToScreen(iso.x, iso.y);
  };

  const screenToWorld = (sx: number, sy: number): Vec2 => {
    const iso = screenToIso(sx, sy);
    return isoToWorld(iso.x, iso.y);
  };

  // ===== Камера =====
  const panByScreen = (dx: number, dy: number) => {
    cameraX.value -= dx / zoom.value;
    cameraY.value -= dy / zoom.value;
  };

  const zoomAt = (sx: number, sy: number, factor: number) => {
    const oldZoom = zoom.value;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor));
    if (newZoom === oldZoom) return;
    const isoBefore = screenToIso(sx, sy);
    zoom.value = newZoom;
    cameraX.value = isoBefore.x - (sx - viewportW.value / 2) / newZoom;
    cameraY.value = isoBefore.y - (sy - viewportH.value / 2) / newZoom;
  };

  const resetCamera = () => {
    cameraX.value = 0;
    cameraY.value = 0;
    zoom.value = 1;
  };

  const updateCameraFromKeys = (dt: number) => {
    const speed = (600 * dt) / zoom.value;
    if (keys['w'] || keys['arrowup']) cameraY.value -= speed;
    if (keys['s'] || keys['arrowdown']) cameraY.value += speed;
    if (keys['a'] || keys['arrowleft']) cameraX.value -= speed;
    if (keys['d'] || keys['arrowright']) cameraX.value += speed;
  };

  // ===== Хит-тест и выбор =====
  const hitTest = (ent: Entity, sx: number, sy: number): boolean => {
    const pos = worldToScreen(ent.x, ent.y);
    if (ent.kind === 'unit') {
      const bodyCY = pos.y - 17 * zoom.value;
      const r = ent.radius * zoom.value;
      return Math.hypot(sx - pos.x, sy - bodyCY) <= r;
    }

    const halfW = 34 * zoom.value;
    const top = pos.y - 60 * zoom.value;
    const bottom = pos.y + 16 * zoom.value;

    return Math.abs(sx - pos.x) <= halfW && sy >= top && sy <= bottom;
  };

  const getEntityAt = (sx: number, sy: number): Entity | null => {
    for (let i = entities.length - 1; i >= 0; i--) {
      const ent = entities[i]!;
      if (hitTest(ent, sx, sy)) return ent;
    }
    return null;
  };

  const selectAt = (sx: number, sy: number, additive = false) => {
    const hit = getEntityAt(sx, sy);
    if (!additive) {
      for (const e of entities) e.isSelected = false;
    }
    if (hit) hit.isSelected = additive ? !hit.isSelected : true;
  };

  const selectInBox = (sx1: number, sy1: number, sx2: number, sy2: number, additive = false) => {
    if (!additive) {
      for (const e of entities) e.isSelected = false;
    }
    const minX = Math.min(sx1, sx2);
    const maxX = Math.max(sx1, sx2);
    const minY = Math.min(sy1, sy2);
    const maxY = Math.max(sy1, sy2);

    for (const ent of entities) {
      if (ent.kind !== 'unit') continue;
      const pos = worldToScreen(ent.x, ent.y);
      const bodyCY = pos.y - 17 * zoom.value;

      if (pos.x >= minX && pos.x <= maxX && bodyCY >= minY && bodyCY <= maxY) {
        ent.isSelected = true;
      }
    }
  };

  // ===== Проверка препятствий (A*) =====
  const isBlocked = (tx: number, ty: number): boolean => {
    for (const ent of entities) {
      if (ent.kind === 'building') {
        if (Math.round(ent.x) === tx && Math.round(ent.y) === ty) {
          return true;
        }
      }
    }
    return false;
  };

  const isPositionFree = (x: number, y: number, minDist = 0.8): boolean => {
    if (isBlocked(Math.round(x), Math.round(y))) return false;
    for (const e of entities) {
      if (Math.hypot(e.x - x, e.y - y) < minDist) {
        return false;
      }
    }
    return true;
  };

  // Поиск точки подхода рядом с целью (для боя / стройки)
  const findApproachPoint = (fromX: number, fromY: number, targetX: number, targetY: number, range: number): Vec2 => {
    const dx = fromX - targetX;
    const dy = fromY - targetY;
    const dist = Math.hypot(dx, dy);

    if (dist <= range && !isBlocked(Math.round(fromX), Math.round(fromY))) {
      return { x: fromX, y: fromY };
    }

    const factor = Math.max(0.75, range * 0.8);
    const testX = targetX + (dist > 0 ? (dx / dist) * factor : 1);
    const testY = targetY + (dist > 0 ? (dy / dist) * factor : 0);
    return { x: testX, y: testY };
  };

  //  Надежный поиск гарантированно уникальных точек для группы
  const findUniqueGroupDestinations = (centerX: number, centerY: number, count: number): (Vec2 | null)[] => {
    const destinations: Vec2[] = [];
    const results: (Vec2 | null)[] = [];
    const minUnitSpacing = 0.9;

    for (let i = 0; i < count; i++) {
      if (i === 0 && !isBlocked(Math.round(centerX), Math.round(centerY))) {
        destinations.push({ x: centerX, y: centerY });
        results.push({ x: centerX, y: centerY });
        continue;
      }

      let step = 1;
      let candidate: Vec2 | null = null;

      // Перебираем точки по спирали Ферма до разумного радиуса
      while (!candidate && step < 250) {
        const angle = step * 2.39996; // Золотой угол
        const radius = 0.75 * Math.sqrt(step);
        const testX = centerX + Math.cos(angle) * radius;
        const testY = centerY + Math.sin(angle) * radius;

        const tileBlocked = isBlocked(Math.round(testX), Math.round(testY));
        const overlapsReserved = destinations.some(
          (d) => Math.hypot(d.x - testX, d.y - testY) < minUnitSpacing
        );

        if (!tileBlocked && !overlapsReserved) {
          candidate = { x: testX, y: testY };
        }
        step++;
      }

      if (candidate) {
        destinations.push(candidate);
        results.push(candidate);
      } else {
        results.push(null); // Сигнал, что юнит не получит приказ с дубликатом точки
      }
    }

    return results;
  };

  const assignCommand = (ent: Entity, cmd: ICommand, useQueue: boolean) => {
    if (!ent.commandsQueue) ent.commandsQueue = [];

    if (useQueue) {
      // Если юнит свободен прямо сейчас, запускаем выполнение немедленно
      if (!ent.activeCommand && ent.path.length === 0) {
        ent.activeCommand = cmd;
        let destX = cmd.x;
        let destY = cmd.y;
        if (cmd.type !== 'MOVE') {
          const pt = findApproachPoint(ent.x, ent.y, cmd.x, cmd.y, 1.2);
          destX = pt.x;
          destY = pt.y;
        }
        ent.path = findPath(ent.x, ent.y, destX, destY, isBlocked);
      } else {
        ent.commandsQueue.push(cmd);
      }
    } else {
      // Сброс старой очереди и назначение нового приказа
      ent.commandsQueue = [];
      ent.activeCommand = cmd;
      let destX = cmd.x;
      let destY = cmd.y;
      if (cmd.type !== 'MOVE') {
        const pt = findApproachPoint(ent.x, ent.y, cmd.x, cmd.y, 1.2);
        destX = pt.x;
        destY = pt.y;
      }
      if (ent.kind === 'unit') {
        ent.path = findPath(ent.x, ent.y, destX, destY, isBlocked);
      } else {
        ent.path = [{ x: destX, y: destY }];
      }
    }
  };

  // ===== Приказы (ПКМ) =====
  const commandMoveTo = (sx: number, sy: number, useQueue = false) => {
    const target = screenToWorld(sx, sy);
    const selectedUnits = entities.filter((e): e is Unit => e.kind === 'unit' && e.isSelected);
    const selectedBuildings = entities.filter((e): e is Building => e.kind === 'building' && e.isSelected);

    if (selectedUnits.length > 0) {
      const targets = findUniqueGroupDestinations(target.x, target.y, selectedUnits.length);
      selectedUnits.forEach((u, idx) => {
        const t = targets[idx];
        if (t !== null) {
          assignCommand(u, { type: 'MOVE', x: t.x, y: t.y }, useQueue);
        }
      });
    }

    if (selectedBuildings.length > 0) {
      selectedBuildings.forEach((b, idx) => {
        const a = (idx / selectedBuildings.length) * Math.PI * 2;
        const r = selectedBuildings.length > 1 ? 1.5 : 0;
        const tx = Math.round(target.x + Math.cos(a) * r);
        const ty = Math.round(target.y + Math.sin(a) * r);

        const occupied = entities.some(
          (e) => e.kind === 'building' && e.id !== b.id && Math.round(e.x) === tx && Math.round(e.y) === ty
        );

        if (!occupied) {
          assignCommand(b, { type: 'MOVE', x: tx, y: ty }, useQueue);
        }
      });
    }

    markers.value.push({ id: ++markerSeq, x: target.x, y: target.y, born: performance.now() });
  };

  const commandAction = (type: 'ATTACK' | 'BUILD', x: number, y: number, useQueue = false, targetId?: string) => {
    const selectedUnits = entities.filter((e): e is Unit => e.kind === 'unit' && e.isSelected);
    selectedUnits.forEach((u) => {
      assignCommand(u, { type, x, y, targetId }, useQueue);
    });
  };

  // ===== Расталкивание юнитов =====
  const resolveCollisions = () => {
    const units = entities.filter((e): e is Unit => e.kind === 'unit');
    const minDist = 0.8;

    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const u1 = units[i]!;
        const u2 = units[j]!;
        const dx = u2.x - u1.x;
        const dy = u2.y - u1.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0 && dist < minDist) {
          const u1Moving = u1.path.length > 0;
          const u2Moving = u2.path.length > 0;

          let weight1 = 0.5;
          let weight2 = 0.5;

          if (u1Moving && !u2Moving) {
            weight1 = 0.1;
            weight2 = 0.9;
          } else if (!u1Moving && u2Moving) {
            weight1 = 0.9;
            weight2 = 0.1;
          }

          const totalWeight = weight1 + weight2;
          const push = minDist - dist;
          const pushX = (dx / dist) * push;
          const pushY = (dy / dist) * push;

          u1.x -= pushX * (weight1 / totalWeight);
          u1.y -= pushY * (weight1 / totalWeight);
          u2.x += pushX * (weight2 / totalWeight);
          u2.y += pushY * (weight2 / totalWeight);
        }
      }
    }
  };

  //Обновление с непрерывной цепочкой команд и сохранением ATTACK / BUILD
  const updateEntities = (dt: number) => {
    for (let i = entities.length - 1; i >= 0; i--) {
      const ent = entities[i]!;

      if (ent.path.length > 0) {
        const target = ent.path[0]!;
        const dx = target.x - ent.x;
        const dy = target.y - ent.y;
        const dist = Math.hypot(dx, dy);
        const step = ent.speed * dt;

        if (dist <= step) {
          ent.x = target.x;
          ent.y = target.y;
          ent.path.shift();
        } else {
          ent.x += (dx / dist) * step;
          ent.y += (dy / dist) * step;
        }

        // Если в этом кадре юнит всё ещё идёт, переход к действию пока не выполняем
        if (ent.path.length > 0) continue;
      }

      if (ent.activeCommand) {
        const cmd = ent.activeCommand;

        if (cmd.type === 'MOVE') {
          // Приказ на перемещение завершен
          ent.activeCommand = null;
        } else if (cmd.type === 'ATTACK') {
          const dist = Math.hypot(cmd.x - ent.x, cmd.y - ent.y);
          const range = ent.kind === 'unit' ? ent.attackRange : 1.5;

          if (dist <= range) {
            // Юнит в зоне атаки — наносим урон и завершаем действие
            const targetEnt = entities.find((e) =>
              cmd.targetId ? e.id === cmd.targetId : Math.hypot(e.x - cmd.x, e.y - cmd.y) < 0.6
            );
            if (targetEnt) {
              const dmg = ent.kind === 'unit' ? ent.attackDamage : 20;
              targetEnt.hp -= dmg;
            }
            ent.activeCommand = null;
          } else {
            // Юнит ещё не дошёл: рассчитываем подход и продолжаем идти к цели
            const pt = findApproachPoint(ent.x, ent.y, cmd.x, cmd.y, range);
            ent.path = findPath(ent.x, ent.y, pt.x, pt.y, isBlocked);
            if (ent.path.length === 0) ent.activeCommand = null;
          }
        } else if (cmd.type === 'BUILD') {
          const dist = Math.hypot(cmd.x - ent.x, cmd.y - ent.y);

          if (dist <= 1.5) {
            // Юнит на месте стройки — возводим здание
            const bx = Math.round(cmd.x);
            const by = Math.round(cmd.y);
            if (!isBlocked(bx, by)) {
              entities.push(createBuilding(bx, by, ent.color));
            }
            ent.activeCommand = null;
          } else {
            // Продолжаем идти к площадке строительства
            const pt = findApproachPoint(ent.x, ent.y, cmd.x, cmd.y, 1.2);
            ent.path = findPath(ent.x, ent.y, pt.x, pt.y, isBlocked);
            if (ent.path.length === 0) ent.activeCommand = null;
          }
        }
      }

      if (!ent.activeCommand && ent.commandsQueue && ent.commandsQueue.length > 0) {
        const nextCmd = ent.commandsQueue.shift()!;
        ent.activeCommand = nextCmd;

        let destX = nextCmd.x;
        let destY = nextCmd.y;
        if (nextCmd.type !== 'MOVE') {
          const pt = findApproachPoint(ent.x, ent.y, nextCmd.x, nextCmd.y, 1.2);
          destX = pt.x;
          destY = pt.y;
        }

        if (ent.kind === 'unit') {
          ent.path = findPath(ent.x, ent.y, destX, destY, isBlocked);
        } else {
          ent.path = [{ x: destX, y: destY }];
        }
      }
    }

    // Чистка погибших сущностей в конце кадра
    for (let i = entities.length - 1; i >= 0; i--) {
      if (entities[i]!.hp <= 0) {
        entities.splice(i, 1);
      }
    }
  };

  const cleanupMarkers = () => {
    const now = performance.now();
    markers.value = markers.value.filter((m) => now - m.born < 900);
  };

  const loop = (time: number) => {
    if (!lastTime) lastTime = time;
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    updateCameraFromKeys(dt);
    updateEntities(dt);
    resolveCollisions();
    cleanupMarkers();

    rafId = requestAnimationFrame(loop);
  };

  // ===== Ввод и Lifecycle =====
  const onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    keys[e.key.toLowerCase()] = true;
  };

  const onKeyUp = (e: KeyboardEvent) => {
    keys[e.key.toLowerCase()] = false;
  };

  const onBlur = () => {
    for (const k in keys) keys[k] = false;
    isPanning = false;
  };

  const init = () => {
    if (entities.length === 0) {
      entities.push(createUnit(-2, 0, '#3b82f6'));
      entities.push(createUnit(2, 0, '#dc2626'));
      entities.push(createUnit(0, 2, '#16a34a'));
      entities.push(createUnit(-2, 2, '#9333ea'));

      entities.push(createBuilding(0, -2));
      entities.push(createBuilding(3, -4));
      entities.push(createBuilding(-3, -1));
      entities.push(createBuilding(1, -5));
    }

    lastTime = 0;
    rafId = requestAnimationFrame(loop);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
  };

  const destroy = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };

  const spawnUnit = (color = '#f97316'): boolean => {
    const center = isoToWorld(cameraX.value, cameraY.value);
    let targetX = 0;
    let targetY = 0;
    let found = false;

    for (let r = 1.0; r <= 8.0; r += 0.8) {
      const steps = Math.floor(r * 6);
      for (let s = 0; s < steps; s++) {
        const angle = (s / steps) * Math.PI * 2;
        const testX = center.x + Math.cos(angle) * r;
        const testY = center.y + Math.sin(angle) * r;

        if (isPositionFree(testX, testY)) {
          targetX = testX;
          targetY = testY;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) return false;

    entities.push(createUnit(targetX, targetY, color));
    return true;
  };

  const cameraWorld = computed(() => {
    const w = isoToWorld(cameraX.value, cameraY.value);
    return { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10 };
  });

  const zoomDisplay = computed(() => `${Math.round(zoom.value * 100)}%`);
  const entityCount = computed(() => entities.length);

  const beginPan = (x: number, y: number) => {
    isPanning = true;
    panLastX = x;
    panLastY = y;
  };

  const movePan = (x: number, y: number) => {
    if (!isPanning) return;
    panByScreen(x - panLastX, y - panLastY);
    panLastX = x;
    panLastY = y;
  };

  const endPan = () => {
    isPanning = false;
  };

  return {
    cameraX, cameraY, zoom,
    viewportW, viewportH,
    entities, markers,
    cameraWorld, zoomDisplay, entityCount,
    screenToIso, isoToScreen, worldToScreen, screenToWorld,
    selectAt, selectInBox,
    commandMoveTo,
    commandAction,
    zoomAt, resetCamera, spawnUnit,
    beginPan, movePan, endPan,
    init, destroy,
  };
};