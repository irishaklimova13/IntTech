<template>
  <div class="unit-shadow"></div>

  <div
    class="unit-sprite"
    :class="{ 'is-moving': isMoving, 'is-hit': hit, 'is-ultimate': ultimate, 'is-resting': rest, 'is-striking': strike }"
    :style="{ color: color }"
  >
    <svg viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <g :transform="facingLeft ? 'translate(32 0) scale(-1 1)' : undefined">
      <!-- Ноги -->
      <rect x="10" y="28" width="4" height="10" rx="1" fill="#475569"/>
      <rect x="18" y="28" width="4" height="10" rx="1" fill="#475569"/>
      <!-- Копье -->
      <g class="weapon">
      <line x1="24" y1="38" x2="24" y2="6" stroke="#78716c" stroke-width="2"/>
      <polygon points="24,2 21,8 27,8" fill="#9ca3af"/>
      </g>
      <!-- Туловище -->
      <rect x="10" y="16" width="12" height="14" rx="2" fill="currentColor"/>
      <!-- Пояс -->
      <rect x="10" y="26" width="12" height="2" fill="#1e293b"/>
      <!-- Щит -->
      <circle cx="9" cy="22" r="5" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>
      <!-- Голова и шлем -->
      <circle cx="16" cy="10" r="6" fill="#fcd34d"/>
      <path class="helmet" d="M 10 10 A 6 6 0 0 1 22 10 L 22 8 A 6 6 0 0 0 10 8 Z" fill="#64748b"/>
      <g v-if="healing" class="drinking-hand">
        <path d="M22 21 L25 13 L20 9" fill="none" stroke="#fcd34d" stroke-width="4" stroke-linecap="round" />
        <rect x="16" y="5" width="6" height="9" rx="2" fill="#16a34a" stroke="#bbf7d0" />
        <path d="M19 7 V12 M17 9.5 H21" stroke="white" stroke-width="1.3" />
      </g>
      <g v-if="rest && !healing" class="wiping-hand">
        <path d="M22 22 L25 15 L20 7" fill="none" stroke="#fcd34d" stroke-width="4" stroke-linecap="round" />
      </g>
      </g>
    </svg>
  </div>

  <div v-if="isSelected" class="unit-ring"></div>
</template>

<script setup lang="ts">
defineProps<{
  ultimate?: boolean;
  healing?: boolean;
  facingLeft?: boolean;
  hit?: boolean;
  rest?: boolean;
  strike?: boolean;
  color: string;
  isMoving: boolean;
  isSelected: boolean;
}>();
</script>

<style scoped>
.unit-shadow {
  position: absolute;
  left: -14px; top: -7px;
  width: 28px; height: 14px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
}

.unit-sprite {
  position: absolute;
  left: -16px;
  top: -36px;
  width: 32px;
  height: 40px;
  transform-origin: bottom center;
}

.unit-sprite svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.unit-sprite.is-moving {
  animation: walk 0.3s infinite ease-in-out alternate;
}

@keyframes walk {
  from { transform: rotate(0deg) translateY(0); }
  to   { transform: rotate(3deg) translateY(-2px); }
}

.unit-ring {
  position: absolute;
  left: -18px; top: -9px;
  width: 36px; height: 18px;
  border-radius: 50%;
  border: 2px dashed #22c55e;
  box-sizing: border-box;
}
.is-hit .helmet { animation: helmet-hop .35s ease-out; }
@keyframes helmet-hop { 40% { transform: translateY(-5px) rotate(-8deg); transform-origin:16px 8px; } }
.wiping-hand { animation: wipe .6s ease-in-out 2; transform-origin:22px 22px; }
@keyframes wipe { 50% { transform: rotate(-14deg); } }
.weapon { transform-origin:24px 22px; }
.is-striking .weapon { animation:spear-thrust .45s ease-out; }
@keyframes spear-thrust { 35% { transform:rotate(65deg) translateY(3px); } 55% { transform:rotate(75deg) translateY(-10px); } 75% { transform:rotate(65deg) translateY(-5px); } }
.is-hit svg { animation:impact .35s ease-out; }
@keyframes impact { 25% { filter:brightness(1.8); } 50% { transform:translateX(-2px); } }
@media (prefers-reduced-motion: reduce) { .unit-sprite, .helmet, .wiping-hand, .weapon, .unit-sprite svg { animation:none !important; } }
.drinking-hand { transform-origin:22px 21px; animation:sip .7s ease-in-out infinite alternate; }
@keyframes sip { to { transform:rotate(-8deg); } }
@media (prefers-reduced-motion:reduce) { .drinking-hand { animation:none; } }
.is-ultimate .weapon { animation:ultimate-swing .3s ease-out; }
.is-ultimate .weapon line { stroke:#fbbf24; }
@keyframes ultimate-swing { 15% { transform:rotate(-35deg) translateY(2px); } 35% { transform:rotate(85deg) translateY(-6px); } 50% { transform:rotate(-15deg); } 70% { transform:rotate(70deg) translateY(-5px); } 100% { transform:rotate(0); } }
@media (prefers-reduced-motion:reduce) { .is-ultimate .weapon { animation:none; } }
</style>
