<template>
  <svg v-if="kind === 'tree'" class="tree" viewBox="0 0 54 76" aria-hidden="true">
    <ellipse cx="28" cy="65" rx="22" ry="8" fill="#152b23" opacity=".25" />
    <path d="M24 39 L30 39 L31 66 L24 66 Z" fill="#69513a" />
    <path d="M27 2 L7 31 L16 30 L2 48 L13 47 L5 58 Q27 67 49 56 L40 45 L51 46 L37 28 L45 29 Z" :fill="['#254c3d','#2b5642','#345e45'][variant]" stroke="#233f33" stroke-width=".7" />
    <path d="M27 3 L9 30 L24 26 L9 48 L26 40 L15 59 L30 58 Z" fill="#78946a" opacity=".3" />
  </svg>
  <svg v-else-if="kind === 'bridge'" class="bridge" viewBox="-32 -20 64 40" aria-hidden="true"><path d="M0 -16 L32 0 L0 16 L-32 0 Z" fill="#9e8158" stroke="#64513b" /><path d="M-24 4 L8 -12 M-16 8 L16 -8 M-8 12 L24 -4" stroke="#6b583f" stroke-width="1" /><path d="M0 -19 L32 -3 M-32 -3 L0 13" stroke="#cfb383" stroke-width="2" /></svg>
  <svg v-else-if="kind === 'ripples'" class="ground" viewBox="-24 -12 48 24" aria-hidden="true"><path d="M-16 -2 Q-10 1 -4 -2 M2 4 Q9 7 17 3 M-5 -7 L2 -7" fill="none" stroke="#9bc3b3" stroke-width=".7" opacity=".4" /></svg>
  <svg v-else class="ground" viewBox="-24 -12 48 24" aria-hidden="true">
    <g v-if="kind === 'reeds'" fill="none" stroke="#65764c" stroke-width="1"><path d="M-5 5 L-7 -7 M-3 5 L-1 -11 M0 5 L3 -4 M2 5 L7 -9" /><path d="M-7 -7 V-11 M-1 -11 V-14 M7 -9 V-13" stroke="#897052" stroke-width="1.7" /></g>
    <g v-else-if="kind === 'bush'" fill="#54764c"><ellipse cx="0" cy="2" rx="10" ry="4" fill="#223d2e" opacity=".2" /><circle cx="-4" cy="-2" r="5" /><circle cx="3" cy="-3" r="6" fill="#6c8956" /><circle cx="-1" cy="-6" r="4" fill="#829568" /></g>
    <g v-else-if="kind === 'flowers'" stroke="#72845c" stroke-width=".8"><path d="M-6 3 V-3 M0 4 L2 -4 M6 2 L9 -2" /><circle cx="-6" cy="-3" r="1.6" fill="#e1c981" /><circle cx="2" cy="-4" r="1.5" fill="#e6d9bb" /><circle cx="9" cy="-2" r="1.5" fill="#b09ab1" /></g>
    <g v-else-if="kind === 'fern'" fill="none" stroke="#8b9d65" stroke-width="1"><path d="M0 4 L-1 -9 M-1 -5 L-7 -8 M-1 -2 L-8 -4 M0 1 L-6 0 M-1 -5 L4 -9 M-1 -2 L6 -5 M0 1 L7 -1" /></g>
    <g v-else fill="none" stroke="#839067" stroke-width=".8" opacity=".6"><path d="M-12 2 L-15 -2 M-11 2 L-10 -4 M7 5 L5 1 M8 5 L11 0" /><circle v-if="variant === 0" cx="-10" cy="-4" r="1" fill="#d4c48b" stroke="none" /></g>
  </svg>
</template>
<script setup lang="ts">defineProps<{ kind: string; variant: number }>();</script>
<style scoped>
.bridge { position:absolute; left:-32px; top:-20px; width:64px; height:40px; pointer-events:none; }
.tree { position:absolute; width:54px; height:76px; left:-27px; top:-67px; pointer-events:none; }
.ground { position:absolute; width:48px; height:24px; left:-24px; top:-12px; overflow:visible; pointer-events:none; }
</style>
