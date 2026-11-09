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
          <select v-if="selectedBuilding.spawnType !== 'water'" v-model="spawnWeapon" aria-label="Тип бойца"><option v-for="w in LAND_WEAPONS" :key="w" :value="w">{{ WEAPONS[w].name }}</option></select>
          <button class="btn-reset" :disabled="selectedProducerCount >= PRODUCER_LIMIT" @click="spawnUnit()">{{ selectedBuilding.spawnType === 'water' ? 'Спустить лодку' : 'Нанять бойца' }}</button>
        </template>
        <span v-else class="spawn-label">Выберите здание для спавна</span>
        <span role="status">{{ spawnMessage }}</span>
        <button v-if="selectedBoat" class="btn-reset" :disabled="!passengerCount" title="Высадка до четырёх бойцов на свободный берег рядом" @click="disembarkSelected">Высадить ({{ passengerCount }}/{{ BOAT_CAPACITY }})</button>
        <button class="btn-reset" title="Оставаться на месте и атаковать только доступных врагов" @click="holdSelected">Держать позицию</button>
        <button class="btn-reset" :aria-pressed="looseFormation" @click="looseFormation = !looseFormation">{{ looseFormation ? 'Рассыпной строй' : 'Обычный строй' }}</button>
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
        <span>ПКМ по своей лодке — Посадка · ПКМ со зданием — Точка сбора</span> ·
        <span>Зажать ЛКМ — Рамка</span> ·
        <span>ПКМ — Идти / атаковать · Ctrl+ПКМ — Идти с атакой</span> ·
        <span>Shift + ПКМ — Очередь</span> ·
        <span>Суша / вода — разные юниты</span> ·
        <span>WASD — Камера</span>
      </div>
    </header>

    <section class="faction-panel" aria-label="Управление фракциями">
      <strong>Фракции:</strong>
      <span class="faction-participants">Участников: {{ factionParticipantCount }}</span>
      <div v-for="faction in factions" :key="faction.id" class="faction-item">
        <span class="faction-dot" :style="{ background: faction.color }"></span>
        <span>{{ faction.name }}</span>
        <span class="faction-role">{{ faction.isEnemy ? 'Враг' : 'Союзник' }}</span>
        <span class="faction-count">Юнитов: {{ factionUnitCounts[faction.id] ?? 0 }}</span>
        <button class="faction-action" @click="spawnFactionUnit(faction.id)">+ Юнит</button>
        <button class="faction-action" :disabled="faction.id === 1" @click="updateFaction(faction.id, { isEnemy: !faction.isEnemy })">{{ faction.isEnemy ? 'Сделать союзником' : 'Сделать врагом' }}</button>
        <button v-if="faction.id !== 1" class="faction-remove" @click="removeFaction(faction.id)" aria-label="Удалить фракцию">×</button>
      </div>
      <button class="add-faction" @click="addFaction">+ Добавить фракцию</button>
      <span class="scenario-clock">{{ gameStatusLabel }} · {{ scenarioTimeLabel }}</span>
      <button class="scenario-button" @click="startScenario">▶ Запустить сценарий</button>
      <button class="scenario-button" :disabled="gameStatus !== 'running' && gameStatus !== 'paused'" @click="togglePause">{{ gameStatus === 'paused' ? '▶ Продолжить' : 'Ⅱ Пауза' }}</button>
    </section>
    <div v-if="gameStatus !== 'running' && gameMessage" class="game-message" :class="'message-' + gameStatus">{{ gameMessage }}</div>

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
        <div v-for="tile in mapTiles" :key="'tile-' + tile.x + '-' + tile.y" class="terrain-tile" :class="'terrain-' + tile.terrain" :style="terrainTileStyle(tile.x, tile.y)"></div>

        <div v-for="d in decorViews" :key="d.id" class="landscape-decor" :class="d.kind" :style="{ left: d.left + 'px', top: d.top + 'px' }"><LandscapeDecor :kind="d.kind" :variant="d.variant" /></div>
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

        <div v-for="m in markerViews" :key="'m' + m.id" class="marker" :style="{ left: m.left + 'px', top: m.top + 'px' }"></div>

        <div
          v-if="buildingPreview"
          class="building-preview"
          :class="buildingPreview.valid ? 'valid' : 'invalid'"
          :style="buildingPreview.style"
        ></div>

        <div v-for="fx in combatVisualViews" :key="'combat-' + fx.id" class="combat-visual" :class="fx.kind" :style="{ left: fx.left + 'px', top: fx.top + 'px', opacity: fx.kind === 'death' ? Math.min(1, fx.ttl / 2) : 1 }">
          <CombatRemains v-if="fx.kind !== 'projectile'" :kind="fx.kind" :color="fx.color" :seed="fx.id" :ultimate="fx.ultimate" />
          <svg v-else class="projectile" aria-hidden="true"><g :transform="`translate(${fx.arrowX} ${fx.arrowY - 20}) rotate(${fx.arrowAngle})`"><path d="M-16 0 H2 M-2 -2 L3 0 L-2 2" fill="none" stroke="#e5d8b1" stroke-width="1.6" /><path d="M-15 -2 L-12 0 L-15 2" fill="none" stroke="#7b5640" stroke-width="1.3" /></g></svg>
        </div>
        <div v-if="rallyView" class="rally-point" :style="{ left:rallyView.left+'px',top:rallyView.top+'px',color:selectedBuilding?.color }"><svg viewBox="0 0 28 38" aria-label="Точка сбора"><ellipse cx="10" cy="34" rx="9" ry="3" fill="none" stroke="currentColor" stroke-dasharray="2 2" /><path d="M10 34 V5" stroke="#e8dcc1" stroke-width="2" /><path d="M11 5 L25 9 L11 17 Z" fill="currentColor" /></svg></div>
        <!-- Сущности -->
        <div v-for="v in entityViews" :key="v.id" class="entity" :style="{ left: v.left + 'px', top: v.top + 'px', zIndex: v.ent.kind === 'unit' && v.ent.movementType === 'water' && isBridgeTile(v.ent.x,v.ent.y) ? 0 : 2 }">
          <UnitSprite
            v-if="v.ent.kind === 'unit'"
            :color="v.ent.color"
            :is-moving="v.ent.pose?.moving ?? false"
            :pose="v.ent.pose" :weapon="v.ent.weapon" :movement-type="v.ent.movementType"
            :health-ratio="v.ent.hp / v.ent.maxHp" :holding="v.ent.stance === 'hold'"
            :is-selected="v.ent.isSelected"
            :hit="(effects[v.id]?.hit ?? 0) > 0"
            :rest="(effects[v.id]?.rest ?? 0) > 0 && v.ent.path.length === 0"
            :strike="(effects[v.id]?.strike ?? 0) > 0"
            :facing-left="isAttacking(v.id) ? effects[v.id]?.facingLeft : undefined"
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
          <strong>{{ entity.kind === 'unit' ? WEAPONS[entity.weapon ?? 'spear'].name : entity.name }}</strong>
          <div>Здоровье: {{ entity.health }} / {{ entity.maxHealth }}</div>
          <template v-if="entity.kind === 'unit'">
            <div class="unit-status">{{ unitStatus(entity) }}</div><div>{{ WEAPONS[entity.weapon ?? 'spear'].role }}</div><div>Сила: {{ entity.strength }} · Дальность: {{ entity.attackRange }}</div>
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
import { WEAPONS, LAND_WEAPONS } from '../game/weapons';
import { isBridgeTile } from '../game/terrain';
import { tileColor, landscapeDecor } from '../game/landscape';
import LandscapeDecor from '../components/LandscapeDecor.vue';
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
  selectedBoat, passengerCount, disembarkSelected, BOAT_CAPACITY, unitStatus, spawnWeapon, looseFormation, holdSelected, attackMoveMode, healSelected, healMessage, spawnMessage, isAttacking,
  selectedEntities, selfDestruct,
  factions, factionParticipantCount, factionUnitCounts, gameStatus, scenarioTime, gameMessage,
  addFaction, removeFaction, updateFaction, spawnFactionUnit, startScenario, togglePause,
  cameraWorld, zoomDisplay, entityCount,
  zoomAt,
  resetCamera, spawnUnit,
  screenToWorld, canPlaceBuilding, placeBuilding,
  selectAt, selectInBox,
  commandMoveTo,
  beginPan, movePan, endPan,
  init, destroy,
} = game;

const gameStatusLabel = computed(() => ({
  ready: 'Ожидание', running: 'Игра идёт', paused: 'Пауза', won: 'Победа', lost: 'Поражение',
}[gameStatus.value]));
const scenarioTimeLabel = computed(() => {
  const total = Math.floor(scenarioTime.value);
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
});

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

const terrainTileStyle = (x: number, y: number) => {
  const iso = worldToIso(x, y);
  return { left: `${iso.x - cameraX.value + viewportW.value / 2}px`, top: `${iso.y - cameraY.value + viewportH.value / 2}px`, backgroundColor: tileColor(x, y) };
};

// ===== Представления сущностей =====
const rallyView = computed(() => {
  const point = selectedBuilding.value?.rallyPoint;
  if (!point) return null;
  const iso = worldToIso(point.x,point.y);
  return { left:iso.x-cameraX.value+viewportW.value/2, top:iso.y-cameraY.value+viewportH.value/2 };
});
const decoration = landscapeDecor();
const decorViews = computed(() => decoration.map(d => {
  const iso = worldToIso(d.x, d.y);
  return { ...d, left: iso.x - cameraX.value + viewportW.value / 2, top: iso.y - cameraY.value + viewportH.value / 2 };
}));
const entityViews = computed(() => {
  const list = entities.value.filter(e => e.kind !== 'unit' || !e.transportId).map((ent) => {
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
  const from = worldToIso(fx.fromX ?? fx.x, fx.fromY ?? fx.y);
  const progress = 1 - fx.ttl / fx.duration;
  return { ...fx, arrowX: (from.x - iso.x) * (1 - progress), arrowY: (from.y - iso.y) * (1 - progress),
    arrowAngle: Math.atan2(iso.y - from.y, iso.x - from.x) * 180 / Math.PI, left: iso.x - cameraX.value + viewportW.value / 2,
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
.landscape-decor { position:absolute; pointer-events:none; z-index:0; }
.rally-point { position:absolute; width:28px; height:38px; transform:translate(-10px,-34px); pointer-events:none; z-index:3; }
.unit-status { color:#bde4ac; }
.landscape-decor.bridge { z-index:1; }
.landscape-decor.tree { z-index:2; }
.projectile { position:absolute; width:1px; height:1px; overflow:visible; pointer-events:none; }
.combat-visual.projectile { z-index:5; }
.actions select { color:#e6e9d9; background:#34443c; padding:5px; border:1px solid #69806b; border-radius:4px; font:inherit; }
.faction-panel { display:flex; align-items:center; flex-wrap:wrap; gap:7px; padding:7px 14px; background:#172b27; border-bottom:1px solid #40564c; color:#e2e8f0; font-size:12px; z-index:8; }
.faction-item { display:flex; align-items:center; gap:5px; padding:3px 6px; background:#263b34; border-radius:5px; }
.faction-dot { width:10px; height:10px; border-radius:50%; }
.faction-role, .scenario-clock { color:#b6c8bd; }
.faction-action, .faction-remove, .add-faction, .scenario-button { border:1px solid #526b5d; border-radius:4px; padding:4px 7px; color:#f8fafc; background:#344b40; cursor:pointer; font:inherit; }
.faction-action:disabled, .scenario-button:disabled { opacity:.45; cursor:not-allowed; }
.faction-remove { color:#fca5a5; font-size:16px; line-height:12px; }
.add-faction { background:#1d4ed8; border-color:#2563eb; }
.scenario-button { background:#0f766e; font-weight:600; }
.game-message { position:absolute; z-index:20; top:150px; left:50%; transform:translateX(-50%); padding:8px 14px; border-radius:6px; color:#f8fafc; background:rgba(15,23,42,.9); border:1px solid #64748b; font-size:13px; pointer-events:none; white-space:nowrap; }
.message-won { border-color:#22c55e; } .message-lost { border-color:#ef4444; } .message-paused { border-color:#eab308; }
.rts-container {
  display: flex; flex-direction: column; width: 100%; height: 100vh;
  background: #162b27; color: #f8fafc; overflow: hidden; user-select: none;
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

.viewport { flex: 1; position: relative; overflow: hidden; background: #203d35; cursor: crosshair; touch-action: none; }
.grid { position: absolute; inset: 0; pointer-events: none; }
.world { position: absolute; inset: 0; transform-origin: center center; will-change: transform; pointer-events: none; }

.terrain-tile { position: absolute; width: 64px; height: 32px; transform: translate(-50%, -50%); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); border: 1px solid rgba(15, 23, 42, 0.45); box-sizing: border-box; }
.terrain-land { background:#54744c; }
.terrain-water { background:#397e7e; }
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
