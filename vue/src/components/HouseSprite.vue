<template>
  <div class="building-footprint" :style="footprintStyle"></div>
  <div class="building-shadow" :style="shadowStyle"></div>
  <div class="building-ring" v-if="isSelected" :style="ringStyle"></div>

  <div class="house" :class="{ 'is-hit': hit }" :style="houseStyle">
    <div class="house-base"></div>
    <div class="wall-left">
      <div class="wall-door"></div>
      <div class="wall-window"></div>
    </div>
    <div class="wall-right">
      <div class="wall-window"></div>
    </div>
    <svg class="roof" viewBox="0 0 72 46" aria-hidden="true">
      <polygon class="roof-face-left" points="3,28 36,1 36,45 -1,28" />
      <polygon class="roof-face-right" points="36,1 69,28 65,28 36,45" />
      <path class="roof-ridge" d="M36 1 V45" />
      <path class="roof-eave" d="M-1 28 L36 45 L65 28" />
    </svg>
    <span v-if="smoke" class="heart-smoke" aria-hidden="true">♥</span>
    <div class="chimney">
      <div class="chimney-top"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  isSelected: boolean;
  smoke?: boolean;
  hit?: boolean;
  sizeTiles: number;
  color: string;
}>();

const buildingScale = computed(() => 1 + (props.sizeTiles - 1) * 0.45);

const houseStyle = computed(() => ({
  transform: `scale(${buildingScale.value})`,
  transformOrigin: 'bottom center',
  '--building-color': props.color,
}));

const footprintStyle = computed(() => ({
  width: `${64 * props.sizeTiles}px`,
  height: `${32 * props.sizeTiles}px`,
  left: `${-32 * props.sizeTiles}px`,
  bottom: `${-16 * props.sizeTiles}px`,
  backgroundColor: 'rgba(0, 0, 0, 0.16)',
}));

const shadowStyle = computed(() => ({
  width: `${64 * buildingScale.value + 10}px`,
  height: `${32 * buildingScale.value + 8}px`,
  left: `${-32 * buildingScale.value + 12}px`,
  bottom: '-10px',
}));

const ringStyle = computed(() => {
  const width = 64 * buildingScale.value;
  const height = 17 * buildingScale.value;
  return {
    width: `${width}px`,
    height: `${height}px`,
    left: `${-width / 2}px`,
    top: `${-height / 2}px`,
  };
});
</script>

<style scoped>
.building-footprint {
  position: absolute;
  transform: rotate(26.565deg) skewX(-36.87deg) scaleY(0.707);
  transform-origin: center;
  opacity: 0.28;
  filter: blur(1px);
}

.building-shadow {
  position: absolute;
  transform: rotate(26.565deg) skewX(-36.87deg) scaleY(0.707);
  transform-origin: center;
  background: rgba(0, 0, 0, 0.22);
  border-radius: 48%;
  filter: blur(5px);
  pointer-events: none;
}

.building-ring {
  position: absolute;
  border: 1.5px solid #b6e3a4;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(32, 58, 44, 0.5);
  box-sizing: border-box;
  pointer-events: none;
}

.house {
  position: absolute;
  width: 64px;
  height: 64px;
  bottom: -8px;
  left: -32px;
}

.house-base {
  position: absolute;
  width: 64px;
  height: 32px;
  bottom: 8px;
  left: 0;
  background: #52525b;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  box-shadow: inset 0 0 0 1px #71717a;
}

.wall-left, .wall-right {
  position: absolute;
  width: 34px;
  height: 26px;
  bottom: 0;
  box-sizing: border-box;
}

.wall-left {
  left: -1px;
  background: var(--building-color, #eab308);
  border-left: 1px solid #a16207;
  border-bottom: 1px solid #a16207;
  transform-origin: bottom left;
  transform: skewY(26.56deg);
}

.wall-right {
  right: -1px;
  background: var(--building-color, #eab308);
  filter: brightness(0.8);
  border-right: 1px solid #854d0e;
  border-bottom: 1px solid #854d0e;
  transform-origin: bottom right;
  transform: skewY(-26.56deg);
}

.wall-door {
  position: absolute;
  bottom: 0;
  left: 13px;
  width: 8px;
  height: 15px;
  background: #451a03;
  border-radius: 4px 4px 0 0;
  border: 1px solid #270f01;
}

.wall-window {
  position: absolute;
  top: 6px;
  left: 5px;
  width: 6px;
  height: 6px;
  background: #fef08a;
  border: 1px solid #451a03;
  box-shadow: 0 0 8px #fef08a;
}

.wall-right .wall-window {
  left: auto;
  right: 9px;
}

.roof {
  position: absolute;
  left: -4px;
  top: 10px;
  width: 72px;
  height: 46px;
  overflow: visible;
  z-index: 2;
  pointer-events: none;
}

.roof-face-left,
.roof-face-right {
  fill: var(--building-color, #eab308);
  stroke: rgba(35, 35, 35, 0.35);
  stroke-width: 1;
  stroke-linejoin: round;
}

.roof-face-right {
  filter: brightness(0.78);
}

.roof-ridge,
.roof-eave {
  fill: none;
  stroke: #7f1d1d;
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chimney {
  position: absolute;
  width: 8px;
  height: 16px;
  left: 15px;
  bottom: 42px;
  box-sizing: border-box;
  background: linear-gradient(90deg, #85858b 0 45%, #62626a 46% 100%);
  border: 1px solid #414149;
  border-bottom: 0;
  z-index: 3;
}

.chimney-top {
  position: absolute;
  top: -4px;
  left: -3px;
  width: 12px;
  height: 5px;
  box-sizing: border-box;
  background: #a1a1aa;
  border: 1px solid #414149;
  border-radius: 1px;
  transform: skewX(-26.56deg);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
}
.heart-smoke { position:absolute; left:12px; bottom:53px; z-index:5; color:#fda4af; font-size:18px; pointer-events:none; animation:heart-smoke 1.5s ease-out forwards; }
@keyframes heart-smoke { from { opacity:0; transform:scale(.4); } 20% { opacity:.85; } to { opacity:0; transform:translate(10px,-38px) scale(1.3); } }
.house.is-hit { animation:building-hit .35s ease-out; }
@keyframes building-hit { 25% { filter:brightness(1.4); } }
@media (prefers-reduced-motion:reduce) { .heart-smoke, .house.is-hit { animation:none; } }
</style>
