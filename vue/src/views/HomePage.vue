<template>
  <div class="rts-container">
    <header class="hud-bar">
      <div class="stats">
        <span>Камера: <strong>({{ cameraWorld.x }}, {{ cameraWorld.y }})</strong></span>
        <span>Зум: <strong>{{ zoomDisplay }}x</strong></span>
        <span>Сущностей: <strong>{{ entityCount }}</strong></span>
      </div>

      <div class="actions">
        <template v-if="selectedBuilding">
          <span class="spawn-label">{{ selectedBuilding.spawnType === 'water' ? 'Причал' : selectedBuilding.name }} · {{ selectedProducerCount }}/{{ PRODUCER_LIMIT }}</span>
          <button class="btn-reset" :disabled="selectedProducerCount >= PRODUCER_LIMIT" @click="spawnUnit()">Создать {{ selectedBuilding.spawnType === 'water' ? 'водного юнита' : 'солдата' }}</button>
        </template>
        <span v-else class="spawn-label">Выберите здание для спавна</span>
        <span role="status">{{ spawnMessage }}</span>
        <button class="btn-reset" title="35% HP за 2 с. Враги должны быть дальше 3 клеток. Перерыв 12 с." @click="healSelected">Выпить лекарство</button>
        <span role="status" class="heal-message">{{ healMessage }}</span>
        <button class="btn-reset" title="Следующий приказ движения будет с атакой" :aria-pressed="attackMoveMode" :class="{ 'mode-active': attackMoveMode }" @click="attackMoveMode = !attackMoveMode">Идти с атакой</button>
        <div class="build-menu">
          <button class="btn-build" :class="{ active: isBuildMenuOpen }" @click="toggleBuildMenu">Строительство</button>
          <div v-if="isBuildMenuOpen" class="build-options">
            <button
              v-for="type in BUILDING_TYPES"
              :key="type.id"
              :class="{ selected: selectedBuildingType?.id === type.id }"
              @click="selectBuildingType(type)"
            >
              <span>{{ type.name }}</span>
              <small>{{ type.sizeTiles }}×{{ type.sizeTiles }}</small>
            </button>
          </div>
        </div>
        <button class="btn-reset" @click="resetCamera">Центр</button>
      </div>

      <div class="hints">
        <span>{{ selectedBuildingType ? 'ЛКМ — Построить · ПКМ/Esc — Отмена' : 'ЛКМ — Выбрать' }}</span> ·
        <span>Зажать ЛКМ — Рамка</span> ·
        <span>ПКМ — Идти / атаковать · Ctrl+ПКМ — Идти с атакой</span> ·
        <span>Shift + ПКМ — Очередь</span> ·
        <span>Суша / вода — разные юниты</span> ·
        <span>WASD — Камера</span>
      </div>
    </header>

    <div
      ref="viewportRef"
      class="viewport"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseLeave"
      @wheel="onWheel"
      @contextmenu="onContextMenu"
    >
      <div class="grid" :style="gridStyle"></div>

      <div class="world" :style="worldStyle">
        <!-- Карта: отдельные клетки суши и воды -->
        <div v-for="tile in terrainTileViews" :key="'tile-' + tile.x + '-' + tile.y" class="terrain-tile" :class="['terrain-' + tile.terrain, { 'terrain-shore': tile.shore, 'terrain-water-edge': tile.waterEdge }, 'terrain-variant-' + tile.variant]" :style="terrainTileStyle(tile.x, tile.y)"></div>

        <!-- Пути -->
        <svg class="paths-layer" width="100%" height="100%">
          <g v-for="p in unitPaths" :key="'path-' + p.id">
            <path :d="p.d" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="5,5" opacity="0.6" />
            <circle :cx="p.target.x" :cy="p.target.y" r="5" fill="#22c55e" opacity="0.8" />
          </g>
          <g v-for="q in queuedTargets" :key="q.id">
            <circle :cx="q.x" :cy="q.y" r="6" fill="#f59e0b" stroke="#fff" stroke-width="1" opacity="0.95" />
          </g>
        </svg>

        <div class="origin" :style="{ left: (viewportW / 2 - cameraX) + 'px', top: (viewportH / 2 - cameraY) + 'px' }">
          <span class="origin-label">(0, 0)</span>
        </div>

        <div v-for="m in markerViews" :key="'m' + m.id" class="marker" :style="{ left: m.left + 'px', top: m.top + 'px' }"></div>

        <div
          v-if="buildingPreview"
          class="building-preview"
          :class="buildingPreview.valid ? 'valid' : 'invalid'"
          :style="buildingPreview.style"
        ></div>

        <div v-for="fx in combatVisualViews" :key="'combat-' + fx.id" class="combat-visual" :class="fx.kind" :style="{ left: fx.left + 'px', top: fx.top + 'px', opacity: fx.kind === 'death' ? Math.min(1, fx.ttl / 2) : 1 }">
          <CombatRemains :kind="fx.kind" :color="fx.color" :seed="fx.id" :ultimate="fx.ultimate" />
        </div>
        <!-- Сущности -->
        <div v-for="v in entityViews" :key="v.id" class="entity" :style="{ left: v.left + 'px', top: v.top + 'px' }">
          <UnitSprite
            v-if="v.ent.kind === 'unit'"
            :color="v.ent.color"
            :is-moving="v.ent.path.length > 0"
            :is-selected="v.ent.isSelected"
            :hit="(effects[v.id]?.hit ?? 0) > 0"
            :rest="(effects[v.id]?.rest ?? 0) > 0 && v.ent.path.length === 0"
            :strike="(effects[v.id]?.strike ?? 0) > 0"
            :facing-left="effects[v.id]?.facingLeft"
            :healing="(effects[v.id]?.healing ?? 0) > 0"
            :ultimate="(effects[v.id]?.ultimate ?? 0) > 0"
          />

          <HouseSprite
            v-else-if="v.ent.kind === 'building'"
            :is-selected="v.ent.isSelected"
            :size-tiles="v.ent.sizeTiles"
            :smoke="(effects[v.id]?.smoke ?? 0) > 0"
            :hit="(effects[v.id]?.hit ?? 0) > 0"
            :color="v.ent.color"
          />
          <div v-if="v.ent.isSelected || v.ent.hp < v.ent.maxHp" class="health" :class="{ 'building-health': v.ent.kind === 'building' }" :title="`${v.ent.hp} / ${v.ent.maxHp} HP`">
            <div :style="{ width: `${100 * v.ent.hp / v.ent.maxHp}%`, backgroundColor: v.ent.color }"></div>
          </div>
        </div>
      </div>

      <aside
        v-if="selectedEntities.length"
        class="object-panel"
        aria-label="Выбранные объекты"
        @mousedown.stop
        @mousemove.stop
        @mouseup.stop
        @wheel.stop
        @contextmenu.stop.prevent
      >
        <section v-for="entity in selectedEntities" :key="entity.id">
          <strong>{{ entity.kind === 'unit' ? 'Персонаж' : entity.name }}</strong>
          <small>{{ entity.id }}</small>
          <div>Здоровье: {{ entity.health }} / {{ entity.maxHealth }}</div>
          <template v-if="entity.kind === 'unit'">
            <div>Сила: {{ entity.strength }}</div>
            <div>Скорость передвижения: {{ entity.movementSpeed }}</div>
            <div>Скорость атаки: {{ entity.attackSpeed }}</div>
            <button type="button" @click="selfDestruct(entity.id)">Самоуничтожение</button>
          </template>
          <div v-else>Размер: {{ entity.sizeTiles }}×{{ entity.sizeTiles }}</div>
        </section>
      </aside>
      <div class="selection-box" :style="selectionBoxStyle"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRtsGame } from '../game/useRtsGame';
import { worldToIso, TILE_H, TILE_W } from '../game/iso';
import type { Unit } from '../game/entities';
import { BUILDING_TYPES } from '../game/buildings';
import type { BuildingType } from '../game/entities';
import UnitSprite from '../components/UnitSprite.vue';
import HouseSprite from '../components/HouseSprite.vue';
import CombatRemains from '../components/CombatRemains.vue';

const viewportRef = ref<HTMLDivElement | null>(null);

const game = useRtsGame();
const {
  cameraX, cameraY, zoom,
  viewportW, viewportH,
  entities, markers, mapTiles, effects, combatVisuals, selectedBuilding, selectedProducerCount, PRODUCER_LIMIT,
  attackMoveMode, healSelected, healMessage, spawnMessage, isAttacking,
  selectedEntities, selfDestruct,
  cameraWorld, zoomDisplay, entityCount,
  zoomAt,
  resetCamera, spawnUnit,
  screenToWorld, canPlaceBuilding, placeBuilding,
  selectAt, selectInBox,
  commandMoveTo,
  beginPan, movePan, endPan,
  init, destroy,
} = game;

const isBuildMenuOpen = ref(false);
const selectedBuildingType = ref<BuildingType | null>(null);
const previewTile = ref<{ x: number; y: number } | null>(null);

const cancelBuilding = () => {
  selectedBuildingType.value = null;
  previewTile.value = null;
};

const toggleBuildMenu = () => {
  isBuildMenuOpen.value = !isBuildMenuOpen.value;
  if (!isBuildMenuOpen.value) cancelBuilding();
};

const selectBuildingType = (type: BuildingType) => {
  selectedBuildingType.value = type;
  previewTile.value = null;
};

// ===== Сетка (SVG-паттерн) =====
const gridSvg =
  `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE_W}' height='${TILE_H}'>` +
  `<path d='M0,0 L${TILE_W},${TILE_H} M0,${TILE_H} L${TILE_W},0' stroke='#334d66' stroke-width='1' fill='none'/>` +
  `</svg>`;

const gridStyle = computed(() => {
  const scaledTileW = TILE_W * zoom.value;
  const scaledTileH = TILE_H * zoom.value;
  const offsetX = viewportW.value / 2 - cameraX.value * zoom.value - scaledTileW / 2;
  const offsetY = viewportH.value / 2 - cameraY.value * zoom.value - scaledTileH / 2;

  return {
    backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(gridSvg)}")`,
    backgroundSize: `${scaledTileW}px ${scaledTileH}px`,
    backgroundPosition: `${offsetX}px ${offsetY}px`,
  };
});

const worldStyle = computed(() => ({ transform: `scale(${zoom.value})` }));

const terrainTileViews = computed(() => {
  const tiles = mapTiles.value;
  const terrainByCoordinate = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile.terrain]));
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

  return tiles.map((tile) => {
    const adjacentTerrains = neighbors.map(([dx, dy]) => terrainByCoordinate.get(`${tile.x + dx},${tile.y + dy}`));
    const hasWaterNeighbor = adjacentTerrains.includes('water');
    const hasLandNeighbor = adjacentTerrains.includes('land');
    const seed = Math.abs((tile.x * 73856093) ^ (tile.y * 19349663)) % 6;

    return {
      ...tile,
      shore: tile.terrain === 'land' && hasWaterNeighbor,
      waterEdge: tile.terrain === 'water' && hasLandNeighbor,
      variant: seed,
    };
  });
});

const terrainTileStyle = (x: number, y: number) => {
  const iso = worldToIso(x, y);
  return { left: `${iso.x - cameraX.value + viewportW.value / 2}px`, top: `${iso.y - cameraY.value + viewportH.value / 2}px` };
};

// ===== Представления сущностей =====
const entityViews = computed(() => {
  const list = entities.value.map((ent) => {
    const offset = ent.kind === 'building' ? (ent.sizeTiles - 1) / 2 : 0;
    const iso = worldToIso(ent.x + offset, ent.y + offset);
    return {
      id: ent.id,
      ent,
      left: iso.x - cameraX.value + viewportW.value / 2,
      top:  iso.y - cameraY.value + viewportH.value / 2,
    };
  });
  list.sort((a, b) => a.top - b.top);
  return list;
});

const buildingPreview = computed(() => {
  const type = selectedBuildingType.value;
  const tile = previewTile.value;
  if (!type || !tile) return null;
  const centerOffset = (type.sizeTiles - 1) / 2;
  const iso = worldToIso(tile.x + centerOffset, tile.y + centerOffset);
  return {
    valid: canPlaceBuilding(type, tile.x, tile.y),
    style: {
      left: `${iso.x - cameraX.value + viewportW.value / 2}px`,
      top: `${iso.y - cameraY.value + viewportH.value / 2}px`,
      width: `${TILE_W * type.sizeTiles}px`,
      height: `${TILE_H * type.sizeTiles}px`,
    },
  };
});

// ===== Маркеры =====
const combatVisualViews = computed(() => combatVisuals.value.map(fx => {
  const iso = worldToIso(fx.x, fx.y);
  return { ...fx, left: iso.x - cameraX.value + viewportW.value / 2,
    top: iso.y - cameraY.value + viewportH.value / 2 };
}));

const markerViews = computed(() =>
  markers.value.map((m) => {
    const iso = worldToIso(m.x, m.y);
    return {
      id: m.id,
      left: iso.x - cameraX.value + viewportW.value / 2,
      top:  iso.y - cameraY.value + viewportH.value / 2,
    };
  })
);

// ===== Линии пути =====
const unitPaths = computed(() => {
  return entities.value
    .filter((e): e is Unit => e.kind === 'unit' && e.isSelected && e.path.length > 0)
    .map((u) => {
      const points = [{ x: u.x, y: u.y }, ...u.path];
      const screenPoints = points.map((p) => {
        const iso = worldToIso(p.x, p.y);
        return {
          x: iso.x - cameraX.value + viewportW.value / 2,
          y: iso.y - cameraY.value + viewportH.value / 2,
        };
      });
      const d = screenPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const target = screenPoints[screenPoints.length - 1]!;
      return { id: u.id, d, target };
    });
});

// ===== Отображение точек команд в очереди =====
const queuedTargets = computed(() =>
  entities.value
    .filter((entity): entity is Unit => entity.kind === 'unit' && entity.isSelected)
    .flatMap((unit) =>
      unit.commandsQueue
        .filter((command) => command.type === 'MOVE')
        .map((command, index) => {
          const iso = worldToIso(command.x, command.y);
          return {
            id: `${unit.id}-queued-${index}`,
            x: iso.x - cameraX.value + viewportW.value / 2,
            y: iso.y - cameraY.value + viewportH.value / 2,
          };
        }),
    ),
);

// ===== Resize =====
let ro: ResizeObserver | null = null;
const updateSize = () => {
  const el = viewportRef.value;
  if (!el) return;
  viewportW.value = el.clientWidth;
  viewportH.value = el.clientHeight;
};

// ===== Mouse =====
const localCoords = (e: MouseEvent) => {
  if (!viewportRef.value) return { x: 0, y: 0 };
  const rect = viewportRef.value.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

const isSelecting = ref(false);
const selStartX = ref(0);
const selStartY = ref(0);
const selEndX = ref(0);
const selEndY = ref(0);

const selectionBoxStyle = computed(() => {
  if (!isSelecting.value) return { display: 'none' };
  const left = Math.min(selStartX.value, selEndX.value);
  const top = Math.min(selStartY.value, selEndY.value);
  const width = Math.abs(selStartX.value - selEndX.value);
  const height = Math.abs(selStartY.value - selEndY.value);
  return { display: 'block', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` };
});

let pressedButton = -1;
let downX = 0;
let downY = 0;

const onMouseDown = (e: MouseEvent) => {
  const { x, y } = localCoords(e);
  pressedButton = e.button;
  downX = x;
  downY = y;

  if (e.button === 0) {
    if (selectedBuildingType.value) return;
    isSelecting.value = true;
    selStartX.value = x;
    selStartY.value = y;
    selEndX.value = x;
    selEndY.value = y;
  } else if (e.button === 1) {
    beginPan(x, y);
    e.preventDefault();
  }
};

const onMouseMove = (e: MouseEvent) => {
  const { x, y } = localCoords(e);
  if (selectedBuildingType.value) {
    const world = screenToWorld(x, y);
    previewTile.value = { x: Math.round(world.x), y: Math.round(world.y) };
  }
  if (isSelecting.value) {
    selEndX.value = x;
    selEndY.value = y;
  }
  if (pressedButton === 1) movePan(x, y);
};

const onMouseUp = (e: MouseEvent) => {
  const { x, y } = localCoords(e);
  const moved = Math.hypot(x - downX, y - downY) > 4;

  if (e.button === 1) {
    endPan();
  } else if (e.button === 0) {
    if (selectedBuildingType.value) {
      const world = screenToWorld(x, y);
      placeBuilding(selectedBuildingType.value, Math.round(world.x), Math.round(world.y));
      pressedButton = -1;
      return;
    }
    if (isSelecting.value) {
      isSelecting.value = false;
      if (moved) selectInBox(downX, downY, x, y, e.shiftKey);
      else selectAt(x, y, e.shiftKey);
    }
  } else if (e.button === 2) {
    if (selectedBuildingType.value) cancelBuilding();
    else commandMoveTo(x, y, e.shiftKey, e.ctrlKey);
  }
  pressedButton = -1;
};

const onMouseLeave = (e: MouseEvent) => {
  if (pressedButton === 1) onMouseUp(e);
  if (isSelecting.value) isSelecting.value = false;
  previewTile.value = null;
};

const onWheel = (e: WheelEvent) => {
  e.preventDefault();
  const { x, y } = localCoords(e);
  zoomAt(x, y, e.deltaY < 0 ? 1.15 : 0.87);
};

const onContextMenu = (e: MouseEvent) => e.preventDefault();

const onBuildKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') cancelBuilding();
};

// ===== Lifecycle =====
onMounted(() => {
  const el = viewportRef.value;
  if (!el) return;
  updateSize();
  ro = new ResizeObserver(updateSize);
  ro.observe(el);
  init();
  window.addEventListener('keydown', onBuildKeyDown);
});

onUnmounted(() => {
  if (ro) ro.disconnect();
  destroy();
  window.removeEventListener('keydown', onBuildKeyDown);
});
</script>

<style scoped>
.rts-container {
  display: flex; flex-direction: column; width: 100%; height: 100vh;
  background: #0f172a; color: #f8fafc; overflow: hidden; user-select: none;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.combat-visual { position:absolute; pointer-events:none; z-index:1; }
.combat-visual.ultimate { z-index:1; }
.combat-visual.hit { z-index:5; }
.heal-message { font-size:11px; max-width:250px; white-space:normal; color:#86efac; }
.health { position:absolute; top:-48px; left:-18px; width:36px; height:4px; border:1px solid #94a3b8; background:#172033; border-radius:3px; overflow:hidden; }
.health > div { height:100%; }
.building-health { top:-72px; }
.attack-indicator { position:absolute; left:18px; top:-38px; color:#fbbf24; font-size:14px; }
.hud-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px; min-height: 60px; flex-wrap:wrap; gap:10px; flex-shrink: 0;
  background: #1e293b; border-bottom: 2px solid #334155; font-size: 14px; z-index: 10;
}
.stats, .actions, .hints { display: flex; align-items: center; white-space: nowrap; }
.stats span { margin-right: 15px; }
.hints { color: #94a3b8; font-size: 12px; gap: 4px; }
.actions { display: flex; align-items: center; gap: 8px; }
.spawn-label { margin-right: 4px; color: #cbd5e1; font-size: 13px; }

.actions button {
  width: 26px; height: 26px; border: 2px solid #475569; border-radius: 50%;
  cursor: pointer; padding: 0; box-sizing: border-box; transition: transform 0.1s, border-color 0.1s;
}
.actions button:hover { transform: scale(1.15); border-color: #f8fafc; }
.btn-blue { background: #3b82f6; } .btn-red { background: #dc2626; }
.btn-green { background: #16a34a; } .btn-purple { background: #9333ea; }
.btn-orange { background: #f97316; }
.btn-water { width: 30px !important; height: 30px !important; border-radius: 6px !important; background: #0369a1; color: #e0f2fe; font-size: 17px; }

.btn-reset {
  width: auto !important; height: 30px !important; border-radius: 4px !important;
  background: #475569; color: #fff; padding: 0 12px !important; font-family: inherit; font-weight: bold;
}
.actions button:disabled { opacity:.4; cursor:not-allowed; }
.actions .mode-active { background:#166534; }
.btn-reset:hover { background: #334155; transform: none !important; }

.build-menu { position: relative; }
.actions .btn-build {
  width: auto; height: 30px; border-radius: 4px; padding: 0 10px; color: #f8fafc;
  background: #0f766e; font-family: inherit; font-weight: bold;
}
.actions .btn-build.active { border-color: #5eead4; }
.build-options {
  position: absolute; top: 38px; left: 50%; transform: translateX(-50%); min-width: 190px;
  padding: 8px; border: 1px solid #475569; border-radius: 6px; background: #1e293b;
  box-shadow: 0 12px 30px rgba(0, 0, 0, .45); z-index: 30;
}
.actions .build-options button {
  display: flex; justify-content: space-between; align-items: center; width: 100%; height: 34px;
  margin: 2px 0; padding: 0 9px; border-radius: 4px; color: #e2e8f0; background: #334155;
  font-family: inherit;
}
.actions .build-options button.selected { border-color: #4ade80; background: #166534; }
.build-options small { color: #cbd5e1; }

.viewport { flex: 1; position: relative; overflow: hidden; background: #111827; cursor: crosshair; touch-action: none; }
.grid { position: absolute; inset: 0; pointer-events: none; opacity: .22; }
.world { position: absolute; inset: 0; transform-origin: center center; will-change: transform; pointer-events: none; }

.terrain-tile {
  position: absolute; width: 64px; height: 32px; transform: translate(-50%, -50%);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  box-sizing: border-box; overflow: hidden;
}
.terrain-tile::before, .terrain-tile::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
}
.terrain-land {
  background-color: #496b3d;
  background-image:
    radial-gradient(ellipse at 18% 24%, rgba(170, 190, 105, .30) 0%, rgba(170, 190, 105, .12) 24%, transparent 48%),
    radial-gradient(ellipse at 76% 72%, rgba(24, 53, 31, .34) 0%, rgba(24, 53, 31, .12) 30%, transparent 58%),
    radial-gradient(ellipse at 54% 42%, rgba(116, 139, 70, .22) 0%, transparent 52%),
    linear-gradient(145deg, #587747 0%, #496b3d 52%, #36583a 100%);
}
.terrain-land::before {
  background-image:
    radial-gradient(ellipse at 28% 62%, rgba(205, 194, 132, .20) 0 1px, transparent 3px),
    radial-gradient(ellipse at 68% 28%, rgba(27, 45, 26, .24) 0 1px, transparent 3px),
    radial-gradient(ellipse at 82% 76%, rgba(191, 205, 128, .16) 0 1px, transparent 2px);
  opacity: .75;
}
.terrain-land.terrain-variant-1 { background-position: 3px 7px, 11px 1px, 0 0, 0 0; }
.terrain-land.terrain-variant-2 { background-position: 13px 2px, 2px 10px, 8px 4px, 0 0; }
.terrain-land.terrain-variant-3 { background-position: 8px 11px, 15px 3px, 2px 7px, 0 0; }
.terrain-land.terrain-variant-4 { background-position: 1px 4px, 8px 12px, 14px 1px, 0 0; }
.terrain-land.terrain-variant-5 { background-position: 12px 8px, 4px 2px, 7px 11px, 0 0; }
.terrain-water {
  background-color: #07516d;
  background-image:
    radial-gradient(ellipse at 24% 26%, rgba(129, 205, 218, .34) 0%, rgba(75, 161, 184, .14) 26%, transparent 54%),
    radial-gradient(ellipse at 78% 76%, rgba(2, 35, 63, .38) 0%, transparent 58%),
    radial-gradient(ellipse at 58% 42%, rgba(40, 135, 160, .30) 0%, transparent 52%),
    linear-gradient(145deg, #247e91 0%, #0b617b 48%, #073e5c 100%);
}
.terrain-water::before {
  background-image:
    radial-gradient(ellipse 13px 2px at 26% 35%, rgba(205, 240, 241, .22), transparent 100%),
    radial-gradient(ellipse 9px 1.5px at 72% 64%, rgba(180, 225, 232, .18), transparent 100%),
    radial-gradient(ellipse 7px 1px at 48% 82%, rgba(210, 241, 239, .15), transparent 100%);
  opacity: .9;
}
.terrain-water.terrain-variant-1 { background-position: 8px 2px, 2px 9px, 12px 4px, 0 0; }
.terrain-water.terrain-variant-2 { background-position: 1px 8px, 12px 2px, 4px 11px, 0 0; }
.terrain-water.terrain-variant-3 { background-position: 11px 5px, 5px 12px, 1px 3px, 0 0; }
.terrain-water.terrain-variant-4 { background-position: 4px 12px, 9px 4px, 13px 8px, 0 0; }
.terrain-water.terrain-variant-5 { background-position: 14px 3px, 1px 7px, 8px 12px, 0 0; }
.terrain-shore {
  background-image:
    radial-gradient(ellipse at 24% 34%, rgba(218, 198, 143, .42) 0%, rgba(190, 169, 112, .20) 30%, transparent 62%),
    radial-gradient(ellipse at 76% 72%, rgba(102, 91, 56, .20) 0%, transparent 54%),
    linear-gradient(145deg, #8b9560 0%, #687d4b 48%, #496b3d 100%);
}
.terrain-shore::before {
  background-image:
    radial-gradient(ellipse at 34% 62%, rgba(225, 211, 164, .32) 0 1px, transparent 3px),
    radial-gradient(ellipse at 72% 28%, rgba(67, 76, 43, .22) 0 1px, transparent 3px);
}
.terrain-water-edge::after {
  background-image:
    radial-gradient(ellipse 9px 2px at 20% 24%, rgba(207, 239, 239, .34), transparent 100%),
    radial-gradient(ellipse 7px 1.5px at 72% 72%, rgba(207, 239, 239, .25), transparent 100%);
  opacity: .85;
}
.paths-layer { position: absolute; inset: 0; overflow: visible; pointer-events: none; z-index: 1; }

.origin { position: absolute; width: 10px; height: 10px; background: #f59e0b; border-radius: 50%; transform: translate(-50%, -50%); }
.origin-label { position: absolute; left: 12px; top: -18px; color: #f59e0b; font-size: 11px; white-space: nowrap; }

.marker {
  position: absolute; width: 20px; height: 10px; border: 2px solid #22c55e; border-radius: 50%;
  transform: translate(-50%, -50%); animation: markerFade 0.9s ease-out forwards;
}
@keyframes markerFade {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  to { opacity: 0; transform: translate(-50%, -50%) scale(2.6); }
}

.entity { position: absolute; width: 0; height: 0; z-index: 2; }

.building-preview {
  position: absolute; transform: translate(-50%, -50%);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  box-sizing: border-box; z-index: 3; opacity: .72;
}
.building-preview.valid { background: rgba(34, 197, 94, .55); outline: 2px solid #86efac; }
.building-preview.invalid { background: rgba(239, 68, 68, .6); outline: 2px solid #fca5a5; }

.object-panel { position: absolute; right: 16px; bottom: 16px; z-index: 20; max-height: 50%; overflow: auto; padding: 14px; border: 1px solid #475569; border-radius: 6px; background: #1e293b; font-size: 13px; line-height: 1.7; }
.object-panel section + section { margin-top: 12px; border-top: 1px solid #475569; padding-top: 12px; }
.object-panel small { display: block; color: #94a3b8; }
.object-panel button { margin-top: 8px; padding: 6px 10px; background: #991b1b; color: white; border: 1px solid #f87171; border-radius: 4px; cursor: pointer; }

.selection-box {
  position: absolute; border: 1px solid #3b82f6; background-color: rgba(59, 130, 246, 0.25);
  pointer-events: none; z-index: 100;
}
</style>
