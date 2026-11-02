import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import { isoToWorld, worldToIso, type Vec2 } from './iso';
import { createBuilding, createUnit, type Entity, type Unit, type Building } from './entities';
import { findPath } from './pathfinding';
import { findNearestTerrainTile, getTerrainAt, isInsideMap, MAP_RADIUS } from './terrain';
import type { GameState, GameEventPayload } from '../store/game';

export const useRtsGame = () => {
  const store = useStore();
  const gameState = computed(() => (store.state as { game: GameState }).game);
  const entities = computed(() => gameState.value.entities);

  const cameraX = ref(0);
  const cameraY = ref(0);
  const zoom = ref(1);
  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 2.5;
  const viewportW = ref(0);
  const viewportH = ref(0);
  const mapTiles = computed(() => gameState.value.mapTiles);

  interface Marker { id: number; x: number; y: number; born: number }
  const markers = ref<Marker[]>([]);
  let markerSeq = 0;

  const keys: Record<string, boolean> = {};
  let isPanning = false;
  let panLastX = 0;
  let panLastY = 0;
  let rafId: number | null = null;
  let lastTime = 0;
  let initialized = false;

  const enqueue = (event: GameEventPayload) => store.dispatch('game/enqueueEvent', event);
  const processFrame = (deltaSeconds: number) => store.dispatch('game/processFrame', deltaSeconds);

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

  const panByScreen = (dx: number, dy: number) => {
    cameraX.value -= dx / zoom.value;
    cameraY.value -= dy / zoom.value;
  };

  const zoomAt = (sx: number, sy: number, factor: number) => {
    const oldZoom = zoom.value;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor));
    if (nextZoom === oldZoom) return;
    const pointBeforeZoom = screenToIso(sx, sy);
    zoom.value = nextZoom;
    cameraX.value = pointBeforeZoom.x - (sx - viewportW.value / 2) / nextZoom;
    cameraY.value = pointBeforeZoom.y - (sy - viewportH.value / 2) / nextZoom;
  };

  const resetCamera = () => {
    cameraX.value = 0;
    cameraY.value = 0;
    zoom.value = 1;
  };

  const updateCameraFromKeys = (deltaSeconds: number) => {
    const speed = (600 * deltaSeconds) / zoom.value;
    if (keys.w || keys.arrowup) cameraY.value -= speed;
    if (keys.s || keys.arrowdown) cameraY.value += speed;
    if (keys.a || keys.arrowleft) cameraX.value -= speed;
    if (keys.d || keys.arrowright) cameraX.value += speed;
  };

  const hitTest = (entity: Entity, sx: number, sy: number): boolean => {
    const position = worldToScreen(entity.x, entity.y);
    if (entity.kind === 'unit') {
      const bodyCenterY = position.y - 17 * zoom.value;
      return Math.hypot(sx - position.x, sy - bodyCenterY) <= entity.radius * zoom.value;
    }
    const halfWidth = 34 * zoom.value;
    return Math.abs(sx - position.x) <= halfWidth &&
      sy >= position.y - 60 * zoom.value &&
      sy <= position.y + 16 * zoom.value;
  };

  const getEntityAt = (sx: number, sy: number): Entity | null => {
    for (let index = entities.value.length - 1; index >= 0; index--) {
      const entity = entities.value[index]!;
      if (hitTest(entity, sx, sy)) return entity;
    }
    return null;
  };

  const selectAt = (sx: number, sy: number, additive = false) => {
    const hit = getEntityAt(sx, sy);
    if (!additive) for (const entity of entities.value) entity.isSelected = false;
    if (hit) hit.isSelected = additive ? !hit.isSelected : true;
  };

  const selectInBox = (
    sx1: number,
    sy1: number,
    sx2: number,
    sy2: number,
    additive = false,
  ) => {
    if (!additive) for (const entity of entities.value) entity.isSelected = false;
    const minX = Math.min(sx1, sx2);
    const maxX = Math.max(sx1, sx2);
    const minY = Math.min(sy1, sy2);
    const maxY = Math.max(sy1, sy2);

    for (const entity of entities.value) {
      if (entity.kind !== 'unit') continue;
      const position = worldToScreen(entity.x, entity.y);
      const bodyCenterY = position.y - 17 * zoom.value;
      if (position.x >= minX && position.x <= maxX && bodyCenterY >= minY && bodyCenterY <= maxY) {
        entity.isSelected = true;
      }
    }
  };

  const GROUP_UNIT_SPACING = 0.8;

  const isTileBlockedForUnit = (unit: Unit, x: number, y: number): boolean =>
    !isInsideMap(x, y) ||
    getTerrainAt(x, y) !== unit.movementType ||
    entities.value.some((entity) =>
      entity.kind === 'building' &&
      Math.round(entity.x) === x &&
      Math.round(entity.y) === y
    );

  const createGroupDestinationCandidates = (target: Vec2): Vec2[] => {
    const searchCenter = {
      x: Math.max(-MAP_RADIUS, Math.min(MAP_RADIUS, target.x)),
      y: Math.max(-MAP_RADIUS, Math.min(MAP_RADIUS, target.y)),
    };
    const candidates: Vec2[] = [];
    const seenTiles = new Set<string>();

    const addCandidate = (point: Vec2) => {
      const tileX = Math.round(point.x);
      const tileY = Math.round(point.y);
      const key = `${tileX},${tileY}`;
      if (!isInsideMap(tileX, tileY) || seenTiles.has(key)) return;
      seenTiles.add(key);
      candidates.push(point);
    };

    if (isInsideMap(Math.round(target.x), Math.round(target.y))) {
      addCandidate({ x: target.x, y: target.y });
    } else {
      addCandidate({ x: Math.round(searchCenter.x), y: Math.round(searchCenter.y) });
    }

    // Spiral candidates cover the map while keeping nearby destinations first.
    for (let step = 1; step <= 600; step++) {
      const angle = step * 2.39996;
      const radius = 0.8 * Math.sqrt(step);
      addCandidate({
        x: Math.round(searchCenter.x + Math.cos(angle) * radius),
        y: Math.round(searchCenter.y + Math.sin(angle) * radius),
      });
    }

    candidates.sort((a, b) => {
      const distanceA = (a.x - target.x) ** 2 + (a.y - target.y) ** 2;
      const distanceB = (b.x - target.x) ** 2 + (b.y - target.y) ** 2;
      return distanceA - distanceB || a.x - b.x || a.y - b.y;
    });
    return candidates;
  };

  const findGroupDestinations = (target: Vec2, units: Unit[]): (Vec2 | null)[] => {
    const selectedUnitIds = new Set(units.map((unit) => unit.id));
    const reservedDestinations: Vec2[] = [];
    const candidates = createGroupDestinationCandidates(target);

    return units.map((unit) => {
      for (const candidate of candidates) {
        const tileX = Math.round(candidate.x);
        const tileY = Math.round(candidate.y);
        if (isTileBlockedForUnit(unit, tileX, tileY)) continue;

        const overlapsAnotherUnit = entities.value.some((entity) =>
          entity.kind === 'unit' &&
          !selectedUnitIds.has(entity.id) &&
          Math.hypot(entity.x - candidate.x, entity.y - candidate.y) < GROUP_UNIT_SPACING
        );
        if (overlapsAnotherUnit) continue;

        const overlapsReservedDestination = reservedDestinations.some(
          (destination) =>
            Math.hypot(destination.x - candidate.x, destination.y - candidate.y) < GROUP_UNIT_SPACING
        );
        if (overlapsReservedDestination) continue;

        // A free tile is not enough: each unit must be able to reach its own destination.
        const path = findPath(
          unit.x,
          unit.y,
          candidate.x,
          candidate.y,
          (x, y) => isTileBlockedForUnit(unit, x, y),
        );
        if (path.length === 0) continue;

        reservedDestinations.push(candidate);
        return candidate;
      }

      return null;
    });
  };

  const commandMoveTo = (sx: number, sy: number, queued = false) => {
    const target = screenToWorld(sx, sy);
    const selectedUnits = entities.value.filter(
      (entity): entity is Unit => entity.kind === 'unit' && entity.isSelected,
    );
    const selectedBuildings = entities.value.filter(
      (entity): entity is Building => entity.kind === 'building' && entity.isSelected,
    );

    const unitDestinations = findGroupDestinations(target, selectedUnits);
    selectedUnits.forEach((unit, index) => {
      const destination = unitDestinations[index];
      if (!destination) return;
      enqueue({
        type: 'MOVE_REQUESTED',
        entityId: unit.id,
        target: destination,
        queued,
      });
    });

    selectedBuildings.forEach((building, index) => {
      const angle = (index / selectedBuildings.length) * Math.PI * 2;
      const radius = selectedBuildings.length > 1 ? 1.5 : 0;
      enqueue({
        type: 'MOVE_REQUESTED',
        entityId: building.id,
        target: {
          x: Math.round(target.x + Math.cos(angle) * radius),
          y: Math.round(target.y + Math.sin(angle) * radius),
        },
      });
    });

    markers.value.push({ id: ++markerSeq, x: target.x, y: target.y, born: performance.now() });
  };

  const cleanupMarkers = () => {
    const now = performance.now();
    markers.value = markers.value.filter((marker) => now - marker.born < 900);
  };

  const loop = (time: number) => {
    if (!lastTime) lastTime = time;
    const deltaSeconds = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    updateCameraFromKeys(deltaSeconds);
    processFrame(deltaSeconds);
    cleanupMarkers();
    rafId = requestAnimationFrame(loop);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    keys[event.key.toLowerCase()] = true;
  };
  const onKeyUp = (event: KeyboardEvent) => { keys[event.key.toLowerCase()] = false; };
  const onBlur = () => {
    for (const key in keys) keys[key] = false;
    isPanning = false;
  };

  const init = () => {
    if (initialized) return;
    initialized = true;
    store.dispatch('game/clear');
    const initialEntities: Entity[] = [
      createUnit(-2, 0, '#3b82f6', 'land'),
      createUnit(2, 0, '#dc2626', 'land'),
      createUnit(0, 2, '#16a34a', 'land'),
      createUnit(-2, 2, '#9333ea', 'land'),
      createUnit(5, 4, '#38bdf8', 'water'),
      createBuilding(0, -2),
      createBuilding(3, -4),
      createBuilding(-3, -1),
      createBuilding(1, -5),
    ];
    initialEntities.forEach((entity) => enqueue({ type: 'ENTITY_ADDED', entity }));

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
    initialized = false;
  };

  const spawnUnit = (color = '#f97316', movementType: Unit['movementType'] = 'land') => {
    const center = isoToWorld(cameraX.value, cameraY.value);
    const spawn = findNearestTerrainTile(center.x, center.y, movementType, (x, y) =>
      entities.value.some((entity) =>
        (entity.kind === 'building' || entity.kind === 'unit') &&
        Math.round(entity.x) === x &&
        Math.round(entity.y) === y
      ),
    );
    if (spawn) enqueue({ type: 'ENTITY_ADDED', entity: createUnit(spawn.x, spawn.y, color, movementType) });
  };

  const cameraWorld = computed(() => {
    const world = isoToWorld(cameraX.value, cameraY.value);
    return { x: Math.round(world.x * 10) / 10, y: Math.round(world.y * 10) / 10 };
  });
  const zoomDisplay = computed(() => Math.round(zoom.value * 100) / 100);
  const entityCount = computed(() => entities.value.length);

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
  const endPan = () => { isPanning = false; };

  return {
    cameraX, cameraY, zoom,
    viewportW, viewportH,
    entities, markers, mapTiles,
    cameraWorld, zoomDisplay, entityCount,
    screenToIso, isoToScreen, worldToScreen, screenToWorld,
    selectAt, selectInBox, commandMoveTo,
    zoomAt, resetCamera, spawnUnit,
    beginPan, movePan, endPan,
    init, destroy,
  };
};
