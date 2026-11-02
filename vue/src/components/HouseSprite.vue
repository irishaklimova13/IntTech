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
    <div class="roof-left"></div>
    <div class="roof-right"></div>
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

const houseStyle = computed(() => ({
  transform: `scale(${1 + (props.sizeTiles - 1) * 0.45})`,
  transformOrigin: 'bottom center',
  '--building-color': props.color,
}));

const footprintStyle = computed(() => ({
  width: `${64 * props.sizeTiles}px`,
  height: `${32 * props.sizeTiles}px`,
  left: `${-32 * props.sizeTiles}px`,
  bottom: `${-16 * props.sizeTiles}px`,
  backgroundColor: props.color,
}));

const shadowStyle = computed(() => ({
  width: `${80 * props.sizeTiles}px`,
  height: `${40 * props.sizeTiles}px`,
  left: `${-40 * props.sizeTiles}px`,
  bottom: `${-4 * props.sizeTiles}px`,
}));

const ringStyle = computed(() => ({
  width: `${84 * props.sizeTiles}px`,
  height: `${42 * props.sizeTiles}px`,
  left: `${-42 * props.sizeTiles}px`,
  bottom: `${-6 * props.sizeTiles}px`,
}));
</script>

<style scoped>
.building-footprint {
  position: absolute;
  transform: rotate(26.565deg) skewX(-36.87deg) scaleY(0.707);
  transform-origin: center;
  opacity: 0.5;
  filter: brightness(0.7);
}

.building-shadow {
  position: absolute;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 50%;
}

.building-ring {
  position: absolute;
  border-radius: 50%;
  border: 2px dashed #22c55e;
  box-sizing: border-box;
  z-index: 10;
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

.roof-left {
  position: absolute;
  width: 35px;
  height: 20px;
  bottom: 26px;
  left: 0;
  background: #b91c1c;
  border-left: 1px solid #7f1d1d;
  transform-origin: bottom left;
  transform: skewY(26.56deg);
  clip-path: polygon(0 100%, 100% 100%, 100% 0);
  z-index: 2;
}

.roof-right {
  position: absolute;
  width: 35px;
  height: 20px;
  bottom: 26px;
  right: 0;
  background: #991b1b;
  border-right: 1px solid #7f1d1d;
  transform-origin: bottom right;
  transform: skewY(-26.56deg);
  clip-path: polygon(0 100%, 100% 100%, 0 0);
  z-index: 2;
}

.chimney {
  position: absolute;
  width: 8px;
  height: 16px;
  background: #71717a;
  bottom: 36px;
  left: 16px;
  border: 1px solid #3f3f46;
  z-index: 1;
}

.chimney-top {
  position: absolute;
  top: -3px;
  left: -2px;
  width: 10px;
  height: 4px;
  background: #52525b;
  border: 1px solid #27272a;
  transform: skewX(-26.56deg);
}
.heart-smoke { position:absolute; left:12px; bottom:53px; z-index:5; color:#fda4af; font-size:18px; pointer-events:none; animation:heart-smoke 1.5s ease-out forwards; }
@keyframes heart-smoke { from { opacity:0; transform:scale(.4); } 20% { opacity:.85; } to { opacity:0; transform:translate(10px,-38px) scale(1.3); } }
.house.is-hit { animation:building-hit .35s ease-out; }
@keyframes building-hit { 25% { filter:brightness(1.4); } }
@media (prefers-reduced-motion:reduce) { .heart-smoke, .house.is-hit { animation:none; } }
</style>
