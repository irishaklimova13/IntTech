import { computed, ref } from 'vue';
import { useStore, type Store } from 'vuex';
import { isoToWorld, worldToIso, type Vec2 } from './iso';
import { PRODUCER_LIMIT, producerCount, isEnemy } from './unitActions';
import { createBuilding, createUnit, type Entity, type Unit, type Building } from './entities';
import { findPath } from './pathfinding';
import { findNearestTerrainTile, getTerrainAt, isInsideMap, MAP_RADIUS } from './terrain';
import type { GameState, GameEventPayload } from '../store/game';
import { buildingOccupiesTile, distanceFromBuildingFootprint } from './buildings';
import type { BuildingType } from './entities';

export const useRtsGame = (random: () => number = Math.random, suppliedStore?: Store<any>) => {
  const store = suppliedStore ?? useStore();
  const gameState = computed(() => (store.state as { game: GameState }).game);
  const entities = computed(() => gameState.value.entities);

  const effects = computed(() => gameState.value.effects);
  const combatVisuals = computed(() => gameState.value.combatVisuals);
  const selectedBuilding = computed(() => entities.value.find((e): e is Building => e.kind === 'building' && e.isSelected));
  const selectedProducerCount = computed(() => selectedBuilding.value ? producerCount(entities.value, selectedBuilding.value.id) : 0);
  const attackMoveMode = ref(false);
  const spawnMessage = ref('');
  const healMessage = ref('');
  const isAttacking = (id: string) => entities.value.some(e => e.id === id && e.activeCommand?.type === 'ATTACK') || (effects.value[id]?.strike ?? 0) > 0;
  const healSelected = () => {
    entities.value.filter(e => e.kind === 'unit' && e.isSelected).forEach(e => enqueue({ type: 'HEAL_REQUESTED', entityId: e.id }));
    healMessage.value = 'Лечение: 2 с без врагов в радиусе 3 клеток; перерыв 12 с.';
  };

  const cameraX = ref(0);
  const cameraY = ref(0);
  const zoom = ref(1);
  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 2.5;
  const viewportW = ref(0);
  const viewportH = ref(0);
  const mapTiles = computed(() => gameState.value.mapTiles);

  const selectedEntities = computed(() => entities.value.filter((entity) => entity.isSelected));

  const destroyEntity = (id: string): boolean => {
    const index = entities.value.findIndex((entity) => entity.id === id);
    if (index < 0) return false;
    const entity = entities.value[index]!;
    entity.health = 0;
    entity.isSelected = false;
    entity.path = [];
    enqueue({ type: 'ENTITY_REMOVED', entityId: id });
    return true;
  };

  const applyDamage = (id: string, amount: number): boolean => {
    const entity = entities.value.find((candidate) => candidate.id === id);
    if (!entity || !Number.isFinite(amount) || amount < 0) return false;
    entity.health -= amount;
    if (entity.health === 0) destroyEntity(id);
    return true;
  };

  const selfDestruct = (id: string): boolean => {
    const unit = entities.value.find((entity) => entity.id === id);
    if (!unit || unit.kind !== 'unit' || !unit.isSelected) return false;
    return destroyEntity(id);
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
    const footprintOffset = entity.kind === 'building' ? (entity.sizeTiles - 1) / 2 : 0;
    const position = worldToScreen(entity.x + footprintOffset, entity.y + footprintOffset);
    if (entity.kind === 'unit') {
      const bodyCenterY = position.y - 17 * zoom.value;
      return Math.hypot(sx - position.x, sy - bodyCenterY) <= entity.radius * zoom.value;
    }
    const halfWidth = 34 * entity.sizeTiles * zoom.value;
    const top = position.y - (60 + (entity.sizeTiles - 1) * 20) * zoom.value;
    const bottom = position.y + 16 * entity.sizeTiles * zoom.value;
    return Math.abs(sx - position.x) <= halfWidth && sy >= top && sy <= bottom;
  };

  const getEntityAt = (sx: number, sy: number): Entity | null => {
    const frontToBack = [...entities.value].sort((a, b) => {
      const depth = (e: Entity) => e.x + e.y + (e.kind === 'building' ? e.sizeTiles - 1 : 0);
      return depth(b) - depth(a);
    });
    for (const entity of frontToBack) {
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

  const isTileOccupied = (tileX: number, tileY: number): boolean =>
    entities.value.some((entity) => {
      if (entity.kind === 'building') return buildingOccupiesTile(entity, tileX, tileY);
      return Math.round(entity.x) === tileX && Math.round(entity.y) === tileY;
    });

  const canPlaceBuilding = (type: BuildingType, x: number, y: number): boolean => {
    const anchorX = Math.round(x);
    const anchorY = Math.round(y);
    for (let dx = 0; dx < type.sizeTiles; dx++) {
      for (let dy = 0; dy < type.sizeTiles; dy++) {
        const tileX = anchorX + dx;
        const tileY = anchorY + dy;
        if (!isInsideMap(tileX, tileY) || getTerrainAt(tileX, tileY) !== 'land' ||
            isTileOccupied(tileX, tileY)) return false;
      }
    }
    const candidate = { x: anchorX, y: anchorY, sizeTiles: type.sizeTiles };
    return !entities.value.some((entity) =>
      entity.kind === 'unit' &&
      distanceFromBuildingFootprint(entity.x, entity.y, candidate) < 0.8
    );
  };

  const placeBuilding = (type: BuildingType, x: number, y: number): Building | null => {
    const anchorX = Math.round(x);
    const anchorY = Math.round(y);
    if (!canPlaceBuilding(type, anchorX, anchorY)) return null;
    const building = createBuilding(anchorX, anchorY, type);
    enqueue({ type: 'ENTITY_ADDED', entity: building });
    return building;
  };

  const GROUP_UNIT_SPACING = 0.8;

  const isTileBlockedForUnit = (unit: Unit, x: number, y: number): boolean =>
    !isInsideMap(x, y) ||
    getTerrainAt(x, y) !== unit.movementType ||
    entities.value.some((entity) =>
      entity.kind === 'building' && distanceFromBuildingFootprint(x, y, entity) < 0.8
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

  const commandMoveTo = (sx: number, sy: number, queued = false, withAttack = false) => {
    const aggressive = withAttack || attackMoveMode.value;
    attackMoveMode.value = false;
    const hit = getEntityAt(sx, sy);
    if (hit) {
      entities.value.filter((e): e is Unit => e.kind === 'unit' && e.isSelected && isEnemy(e, hit)).forEach(unit =>
        enqueue({ type: 'ATTACK_REQUESTED', entityId: unit.id, targetId: hit.id, queued }));
      return;
    }
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
        queued, attackMove: aggressive,
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
    store.commit('game/CONFIGURE_RANDOM', random);
    const initialEntities: Entity[] = [
      createUnit(-2, 0, '#3b82f6', 'land'),
      createUnit(2, 0, '#dc2626', 'land'),
      createUnit(0, 2, '#16a34a', 'land'),
      createUnit(-2, 2, '#9333ea', 'land'),
      createUnit(5, 4, '#38bdf8', 'water'),
      createBuilding(0, -2, '#3b82f6'),
      createBuilding(3, -4, '#dc2626'),
      createBuilding(-3, -1, '#16a34a'),
      createBuilding(1, -5),
    ];
    const harbor = createBuilding(2, 4, '#38bdf8');
    harbor.spawnType = 'water';
    initialEntities.push(harbor);
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

  const spawnUnit = () => {
    const building = selectedBuilding.value;
    if (!building) return;
    spawnMessage.value = selectedProducerCount.value >= PRODUCER_LIMIT ? 'Лимит: 20 живых юнитов.' : '';
    enqueue({ type: 'SPAWN_REQUESTED', buildingId: building.id });
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
    entities, markers, mapTiles, effects, combatVisuals, selectedBuilding, selectedProducerCount, PRODUCER_LIMIT,
    attackMoveMode, healSelected, healMessage, spawnMessage, isAttacking,
    selectedEntities,
    applyDamage, destroyEntity, selfDestruct,
    cameraWorld, zoomDisplay, entityCount,
    screenToIso, isoToScreen, worldToScreen, screenToWorld,
    selectAt, selectInBox, commandMoveTo,
    zoomAt, resetCamera, spawnUnit, canPlaceBuilding, placeBuilding,
    beginPan, movePan, endPan,
    init, destroy,
  };
};
