import { computed, reactive, ref } from 'vue';
import { isoToWorld, worldToIso, TILE_H, TILE_W, type Vec2 } from './iso';
import { createBuilding, createUnit, type Entity, type Unit, type Building } from './entities';
import { findPath } from './pathfinding';
import { getTerrainAt, isInsideMap, findNearestTerrainTile, getMapTiles } from './terrain';
import type { BuildingType } from './buildings';

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
  const mapTiles = getMapTiles();

  const buildingOccupiesTile = (building: Building, tx: number, ty: number): boolean =>
    tx >= Math.round(building.x) && tx < Math.round(building.x) + building.sizeTiles &&
    ty >= Math.round(building.y) && ty < Math.round(building.y) + building.sizeTiles;

  const isTileOccupied = (tx: number, ty: number, ignoredId?: string): boolean =>
    entities.some((entity) => {
      if (entity.id === ignoredId) return false;
      if (entity.kind === 'building') return buildingOccupiesTile(entity, tx, ty);
      return Math.round(entity.x) === tx && Math.round(entity.y) === ty;
    });

  const canPlaceBuilding = (type: BuildingType, x: number, y: number): boolean => {
    const anchorX = Math.round(x);
    const anchorY = Math.round(y);
    for (let dx = 0; dx < type.sizeTiles; dx++) {
      for (let dy = 0; dy < type.sizeTiles; dy++) {
        const tx = anchorX + dx;
        const ty = anchorY + dy;
        if (!isInsideMap(tx, ty) || getTerrainAt(tx, ty) !== 'land' || isTileOccupied(tx, ty)) return false;
      }
    }
    return true;
  };

  const placeBuilding = (type: BuildingType, x: number, y: number): Building | null => {
    const anchorX = Math.round(x);
    const anchorY = Math.round(y);
    if (!canPlaceBuilding(type, anchorX, anchorY)) return null;
    const building = createBuilding(anchorX, anchorY, type);
    entities.push(building);
    return building;
  };

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
    const footprintOffset = ent.kind === 'building' ? (ent.sizeTiles - 1) / 2 : 0;
    const pos = worldToScreen(ent.x + footprintOffset, ent.y + footprintOffset);
    if (ent.kind === 'unit') {
      const bodyCY = pos.y - 17 * zoom.value;
      const r = ent.radius * zoom.value;
      return Math.hypot(sx - pos.x, sy - bodyCY) <= r;
    }
    
    const halfW = 34 * ent.sizeTiles * zoom.value;
    const top = pos.y - (60 + (ent.sizeTiles - 1) * 20) * zoom.value;
    const bottom = pos.y + 16 * ent.sizeTiles * zoom.value;
    
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
    if (!additive) for (const e of entities) e.isSelected = false;
    if (hit) hit.isSelected = additive ? !hit.isSelected : true;
  };

  const selectInBox = (sx1: number, sy1: number, sx2: number, sy2: number, additive = false) => {
    if (!additive) for (const e of entities) e.isSelected = false;
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

  // ===== Terrain + obstacles for A* =====
  const isBlocked = (tx: number, ty: number, movementType: Unit['movementType']): boolean => {
    if (!isInsideMap(tx, ty) || getTerrainAt(tx, ty) !== movementType) return true;
    return entities.some((ent) =>
      ent.kind === 'building' &&
      buildingOccupiesTile(ent, tx, ty)
    );
  };

  // ===== Приказы (ПКМ) =====
  const commandMoveTo = (sx: number, sy: number) => {
    const target = screenToWorld(sx, sy);
    const selectedUnits = entities.filter((e): e is Unit => e.kind === 'unit' && e.isSelected);
    const selectedBuildings = entities.filter((e): e is Building => e.kind === 'building' && e.isSelected);

    // Двигаем юнитов
    if (selectedUnits.length > 0) {
      selectedUnits.forEach((u, idx) => {
        let tx = target.x;
        let ty = target.y;

        // Если выделено больше одного юнита, распределяем их цели по спирали
        if (selectedUnits.length > 1) {
          const angle = idx * 2.39996; // Золотой угол (137.5 градусов) для идеального распределения
          const radius = 0.6 * Math.sqrt(idx); // Плавно увеличиваем радиус
          tx += Math.cos(angle) * radius;
          ty += Math.sin(angle) * radius;
        }

        u.path = findPath(u.x, u.y, tx, ty, (x, y) => isBlocked(x, y, u.movementType));
      });
    }

    // Переставляем домики
    if (selectedBuildings.length > 0) {
      selectedBuildings.forEach((b, idx) => {
        const a = (idx / selectedBuildings.length) * Math.PI * 2;
        const r = selectedBuildings.length > 1 ? 1.5 : 0;
        const tx = Math.round(target.x + Math.cos(a) * r);
        const ty = Math.round(target.y + Math.sin(a) * r);

        const occupied = Array.from({ length: b.sizeTiles }, (_, dx) =>
          Array.from({ length: b.sizeTiles }, (_, dy) => isTileOccupied(tx + dx, ty + dy, b.id)),
        ).flat().some(Boolean);

        if (!occupied) {
          b.path = [{ x: tx, y: ty }];
        }
      });
    }

    markers.value.push({ id: ++markerSeq, x: target.x, y: target.y, born: performance.now() });
  };

  // ===== Расталкивание юнитов (Soft Collision) =====
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
          const push = (minDist - dist);
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

  // ===== Обновление (Юниты и Здания) =====
  const updateEntities = (dt: number) => {
    for (const ent of entities) {
      if (ent.path.length === 0) continue;

      let target = ent.path[0]!;

      // Recalculate immediately if a building or terrain change blocks the
      // next waypoint after the original move order was issued.
      if (ent.kind === 'unit' && isBlocked(Math.round(target.x), Math.round(target.y), ent.movementType)) {
        ent.path = findPath(ent.x, ent.y, target.x, target.y, (x, y) => isBlocked(x, y, ent.movementType));
        target = ent.path[0]!;
        if (!target) continue;
      }

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
    entities.push(createUnit(-2, 0, '#3b82f6', 'land'));
    entities.push(createUnit(2, 0, '#dc2626', 'land'));
    entities.push(createUnit(0, 2, '#16a34a', 'land'));
    entities.push(createUnit(-2, 2, '#9333ea', 'land'));
    entities.push(createUnit(5, 4, '#38bdf8', 'water'));
    
    entities.push(createBuilding(0, -2));
    entities.push(createBuilding(3, -4));
    entities.push(createBuilding(-3, -1));
    entities.push(createBuilding(1, -5));

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

  // ===== Публичные действия =====
  const spawnUnit = (color = '#f97316', movementType: Unit['movementType'] = 'land') => {
    const center = isoToWorld(cameraX.value, cameraY.value);
    const spawn = findNearestTerrainTile(center.x, center.y, movementType, (x, y) =>
      entities.some((e) => e.kind === 'building' && buildingOccupiesTile(e, x, y)),
    );
    if (!spawn) return;
    entities.push(createUnit(spawn.x, spawn.y, color, movementType));
  };

  const cameraWorld = computed(() => {
    const w = isoToWorld(cameraX.value, cameraY.value);
    return { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10 };
  });

  const zoomDisplay = computed(() => Math.round(zoom.value * 100) / 100);
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
    entities, markers, mapTiles,
    cameraWorld, zoomDisplay, entityCount,
    screenToIso, isoToScreen, worldToScreen, screenToWorld,
    selectAt, selectInBox,
    commandMoveTo,
    zoomAt, resetCamera, spawnUnit, canPlaceBuilding, placeBuilding,
    beginPan, movePan, endPan,
    init, destroy,
  };
};
