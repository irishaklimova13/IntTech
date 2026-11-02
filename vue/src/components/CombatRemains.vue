<template>
  <svg class="combat-remains" :class="[kind, { empowered: ultimate }]" viewBox="-60 -65 120 100" aria-hidden="true">
    <g v-if="kind === 'death'">
      <g class="blood-pool">
        <ellipse cx="0" cy="1" rx="29" ry="12" fill="#8b1027" opacity=".95" />
        <ellipse cx="-9" cy="-2" rx="15" ry="7" fill="#c51932" />
        <ellipse cx="19" cy="9" rx="11" ry="5" fill="#9f1239" />
        <circle v-for="i in 9" :key="i" :cx="Math.cos(i * 2.4 + seed) * (27 + i % 3 * 5)" :cy="Math.sin(i * 2.4 + seed) * 15" :r="1.5 + i % 3" fill="#be123c" />
      </g>
      <g class="body-piece">
        <rect x="-7" y="-7" width="14" height="16" rx="2" :fill="color" transform="rotate(65)" />
        <path d="M-9 -5 L-3 -8" stroke="#9f1239" stroke-width="3" />
      </g>
      <g class="head-piece">
        <circle cx="22" cy="-11" r="5.5" fill="#fcd34d" />
        <path d="M17 -13 Q22 -21 27 -13" stroke="#64748b" stroke-width="4" fill="none" />
        <path d="M19 -6 L23 -6" stroke="#be123c" stroke-width="2.5" />
      </g>
      <g class="limbs">
        <path d="M-18 -9 L-26 -15 M10 10 L20 17" stroke="#fcd34d" stroke-width="4" stroke-linecap="round" />
        <path d="M-13 11 L-23 15 M4 10 L7 21" stroke="#475569" stroke-width="5" stroke-linecap="round" />
        <path d="M-17 -9 L-20 -11 M10 10 L13 12" stroke="#be123c" stroke-width="4" />
        <circle cx="-19" cy="-1" r="6" fill="#94a3b8" stroke="#475569" stroke-width="1.5" />
        <path d="M-5 -18 L28 10" stroke="#78716c" stroke-width="2" />
      </g>
    </g>
    <g v-else-if="kind === 'ultimate'" class="ultimate-trail">
      <path d="M-8 -20 Q0 -12 9 -17" fill="none" stroke="#fbbf24" stroke-width="1.5" stroke-linecap="round" />
    </g>
    <g v-else class="blood-splash">
      <circle v-for="i in 10" :key="i" :cx="Math.cos(i * 2.4 + seed) * (10 + i * 2)" :cy="-20 + Math.sin(i * 2.4 + seed) * 18" :r="1.5 + i % 3" fill="#dc143c" />
    </g>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ kind: 'hit' | 'death' | 'ultimate'; ultimate?: boolean; color: string; seed: number }>();
</script>

<style scoped>
.combat-remains { position:absolute; width:120px; height:100px; left:-60px; top:-65px; overflow:visible; pointer-events:none; }
.blood-pool { animation:pool-spread .6s ease-out both; transform-origin:0 0; }
.head-piece { animation:head-roll .5s ease-out; }
.limbs { animation:scatter .4s ease-out; }
.blood-splash { animation:splash .6s ease-out both; transform-origin:0 -20px; }
@keyframes pool-spread { from { transform:scale(.3); opacity:.5; } to { transform:scale(1); opacity:1; } }
@keyframes head-roll { from { transform:translate(-19px,9px) rotate(-20deg); } to { transform:translate(0,0); } }
@keyframes scatter { from { transform:scale(.3); } to { transform:scale(1); } }
@keyframes splash { from { transform:scale(.1); opacity:1; } 35% { opacity:1; } to { transform:scale(1.25) translateY(7px); opacity:0; } }
@media (prefers-reduced-motion:reduce) { * { animation:none !important; } }
.ultimate-trail { opacity:0; animation:short-trail .22s ease-out both; }
@keyframes short-trail { 0% { opacity:0; } 25% { opacity:.6; } 100% { opacity:0; } }
.empowered .head-piece { animation:ultimate-head .65s ease-out; }
.empowered .limbs { animation:ultimate-scatter .55s ease-out; }
@keyframes ultimate-head { from { transform:translate(-22px,10px) rotate(-70deg); } 45% { transform:translate(7px,-11px) rotate(10deg); } to { transform:translate(0,0); } }
@keyframes ultimate-scatter { from { transform:scale(.4) rotate(-35deg); } 55% { transform:scale(1.1) rotate(5deg); } to { transform:scale(1); } }
@media (prefers-reduced-motion:reduce) { * { animation:none !important; } }
</style>
