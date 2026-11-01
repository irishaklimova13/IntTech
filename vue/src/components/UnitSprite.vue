<template>
  <div class="unit-shadow"></div>
  
  <div 
    class="unit-sprite" 
    :class="{ 'is-moving': isMoving }"
    :style="{ color: color }"
  >
    <svg viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <!-- Ноги -->
      <rect x="10" y="28" width="4" height="10" rx="1" fill="#475569"/>
      <rect x="18" y="28" width="4" height="10" rx="1" fill="#475569"/>
      <!-- Копье -->
      <line x1="24" y1="38" x2="24" y2="6" stroke="#78716c" stroke-width="2"/>
      <polygon points="24,2 21,8 27,8" fill="#9ca3af"/>
      <!-- Туловище -->
      <rect x="10" y="16" width="12" height="14" rx="2" fill="currentColor"/>
      <!-- Пояс -->
      <rect x="10" y="26" width="12" height="2" fill="#1e293b"/>
      <!-- Щит -->
      <circle cx="9" cy="22" r="5" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>
      <!-- Голова и шлем -->
      <circle cx="16" cy="10" r="6" fill="#fcd34d"/>
      <path d="M 10 10 A 6 6 0 0 1 22 10 L 22 8 A 6 6 0 0 0 10 8 Z" fill="#64748b"/>
    </svg>
  </div>

  <div v-if="isSelected" class="unit-ring"></div>
</template>

<script setup lang="ts">
defineProps<{
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
</style>