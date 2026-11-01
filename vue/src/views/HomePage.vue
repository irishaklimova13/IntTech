<template>
  <div class="rts-container">
    <header class="hud-bar">
      <div class="stats">
        <span>Камера: <strong>({{ cameraWorld.x }}, {{ cameraWorld.y }})</strong></span>
        <span>Зум: <strong>{{ zoomDisplay }}x</strong></span>
        <span>Сущностей: <strong>{{ entityCount }}</strong></span>
      </div>
      
      <div class="actions">
        <span class="spawn-label">+ Создать:</span>
        <button class="btn-blue" title="Синий юнит" @click="spawnUnit('#3b82f6')"></button>
        <button class="btn-red" title="Красный юнит" @click="spawnUnit('#dc2626')"></button>
        <button class="btn-green" title="Зеленый юнит" @click="spawnUnit('#16a34a')"></button>
        <button class="btn-purple" title="Фиолетовый юнит" @click="spawnUnit('#9333ea')"></button>
        <button class="btn-orange" title="Оранжевый юнит" @click="spawnUnit('#f97316')"></button>
        <button class="btn-reset" @click="resetCamera">Центр</button>
      </div>

      <div class="hints">
        <span>ЛКМ — Выбрать</span> ·
        <span>Зажать ЛКМ — Рамка</span> ·
        <span>ПКМ — Идти</span> ·
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
        <!-- Пути -->
        <svg class="paths-layer" width="100%" height="100%">
          <g v-for="p in unitPaths" :key="'path-' + p.id">
            <path :d="p.d" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="5,5" opacity="0.6" />
            <circle :cx="p.target.x" :cy="p.target.y" r="5" fill="#22c55e" opacity="0.8" />
          </g>
        </svg>

        <div class="origin" :style="{ left: (viewportW / 2 - cameraX) + 'px', top: (viewportH / 2 - cameraY) + 'px' }">
          <span class="origin-label">(0, 0)</span>
        </div>

        <div v-for="m in markerViews" :key="'m' + m.id" class="marker" :style="{ left: m.left + 'px', top: m.top + 'px' }"></div>

        <!-- Сущности -->
        <div v-for="v in entityViews" :key="v.id" class="entity" :style="{ left: v.left + 'px', top: v.top + 'px' }">
          <UnitSprite 
            v-if="v.ent.kind === 'unit'" 
            :color="v.ent.color" 
            :is-moving="v.ent.path.length > 0" 
            :is-selected="v.ent.isSelected" 
          />
          
          <HouseSprite 
            v-else-if="v.ent.kind === 'building'" 
            :is-selected="v.ent.isSelected" 
          />
        </div>
      </div>

      <div class="selection-box" :style="selectionBoxStyle"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRtsGame } from '../game/useRtsGame';
import { worldToIso, TILE_H, TILE_W } from '../game/iso';
import type { Unit } from '../game/entities';
import UnitSprite from '../components/UnitSprite.vue';
import HouseSprite from '../components/HouseSprite.vue';

const viewportRef = ref<HTMLDivElement | null>(null);

const game = useRtsGame();
const {
  cameraX, cameraY, zoom,
  viewportW, viewportH,
  entities, markers,
  cameraWorld, zoomDisplay, entityCount,
  zoomAt,
  resetCamera, spawnUnit,
  selectAt, selectInBox,
  commandMoveTo,
  beginPan, movePan, endPan,
  init, destroy,
} = game;

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

// ===== Представления сущностей =====
const entityViews = computed(() => {
  const list = entities.map((ent) => {
    const iso = worldToIso(ent.x, ent.y);
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
  return entities
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
    if (isSelecting.value) {
      isSelecting.value = false;
      if (moved) selectInBox(downX, downY, x, y, e.shiftKey);
      else selectAt(x, y, e.shiftKey);
    }
  } else if (e.button === 2) {
    commandMoveTo(x, y);
  }
  pressedButton = -1;
};

const onMouseLeave = (e: MouseEvent) => {
  if (pressedButton === 1) onMouseUp(e);
  if (isSelecting.value) isSelecting.value = false;
};

const onWheel = (e: WheelEvent) => {
  e.preventDefault();
  const { x, y } = localCoords(e);
  zoomAt(x, y, e.deltaY < 0 ? 1.15 : 0.87);
};

const onContextMenu = (e: MouseEvent) => e.preventDefault();

// ===== Lifecycle =====
onMounted(() => {
  const el = viewportRef.value;
  if (!el) return;
  updateSize();
  ro = new ResizeObserver(updateSize);
  ro.observe(el);
  init();
});

onUnmounted(() => {
  if (ro) ro.disconnect();
  destroy();
});
</script>

<style scoped>
.rts-container {
  display: flex; flex-direction: column; width: 100%; height: 100vh;
  background: #0f172a; color: #f8fafc; overflow: hidden; user-select: none;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.hud-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; height: 60px; flex-shrink: 0;
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

.btn-reset {
  width: auto !important; height: 30px !important; border-radius: 4px !important;
  background: #475569; color: #fff; padding: 0 12px !important; font-family: inherit; font-weight: bold;
}
.btn-reset:hover { background: #334155; transform: none !important; }

.viewport { flex: 1; position: relative; overflow: hidden; background: #111827; cursor: crosshair; touch-action: none; }
.grid { position: absolute; inset: 0; pointer-events: none; }
.world { position: absolute; inset: 0; transform-origin: center center; will-change: transform; pointer-events: none; }

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

.selection-box {
  position: absolute; border: 1px solid #3b82f6; background-color: rgba(59, 130, 246, 0.25);
  pointer-events: none; z-index: 100;
}
</style>