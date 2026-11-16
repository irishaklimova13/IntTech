<template>
  <div class="unit-shadow" :class="{ water: movementType === 'water' }"></div>
  <div v-if="isSelected" class="unit-ring" :class="{ holding: holding }"></div>
  <div class="unit-sprite" :class="{ 'is-hit': hit, 'is-striking': strike, 'is-ultimate': ultimate, 'is-healing': healing, 'is-idle': !moving && !strike && !healing, water: movementType === 'water' }" :style="{ color }">
    <svg v-if="movementType === 'water'" viewBox="0 0 48 56" aria-hidden="true">
      <g :transform="mirror">
        <g v-if="moving" class="wake" fill="none" stroke="#b9e3d9" stroke-width="1" opacity=".55">
          <path d="M5 46 Q23 56 43 46 M9 50 Q24 57 39 50" />
        </g>
        <g :transform="`translate(0 ${moving ? Math.sin(phase) : 0})`">
          <path d="M3 38 Q24 44 45 35 L38 47 Q21 54 8 45 Z" fill="#654b32" stroke="#302b29" stroke-width="1.2" />
          <path d="M5 38 L43 36 L36 42 L11 43 Z" fill="#bd9b67" />
          <path d="M10 44 Q24 49 38 43" fill="none" stroke="currentColor" stroke-width="3" />
          <path d="M24 8 V39" stroke="#64523a" stroke-width="2" />
          <path d="M25 9 L39 32 L25 30 Z" fill="#e8e1c9" stroke="#b8b19b" stroke-width=".7" />
          <path d="M25 11 L30 20 L25 19 Z" fill="currentColor" />
          <circle cx="16" cy="30" r="4" fill="#e4b78a" /><path d="M11 30 Q16 21 21 29" fill="#657783" />
          <path d="M12 35 L20 35 L21 41 L11 41 Z" fill="currentColor" />
          <g class="weapon"><path d="M31 35 L44 26 M41 26 L44 26 L43 30" fill="none" stroke="#bcc8c9" stroke-width="1.8" /></g>
        </g>
      </g>
    </svg>
    <svg v-else viewBox="0 0 48 56" aria-hidden="true">
      <g :transform="mirror">
        <path :d="`M16 25 L30 25 L${32 + step} 45 Q24 48 ${14 - step} 44 Z`" fill="currentColor" opacity=".65" />
        <g :transform="`translate(${step} ${liftA}) rotate(${moving ? step * 5 : 0} 21 43)`">
          <path d="M18 36 L23 36 L23 49 L18 49 Z" fill="#45545b" /><path d="M18 47 L23 47 L24 53 L17 53 Z" fill="#283239" />
          <path d="M18 40 H23" stroke="#91a0a2" stroke-width="1.2" />
        </g>
        <g :transform="`translate(${-step} ${liftB}) rotate(${moving ? -step * 5 : 0} 28 43)`">
          <path d="M25 36 L30 36 L30 49 L25 49 Z" fill="#586970" /><path d="M25 47 L30 47 L32 53 L25 53 Z" fill="#303a3e" />
          <path d="M25 40 H30" stroke="#a0acae" stroke-width="1.2" />
        </g>
        <g :transform="`translate(0 ${bob})`" class="upper-body">
          <path d="M16 22 Q24 19 32 22 L33 39 Q24 43 15 39 Z" fill="currentColor" stroke="#29383b" stroke-width=".8" />
          <path d="M18 23 L29 23 L30 33 Q24 36 18 33 Z" :fill="ranged ? '#7b684b' : '#a5b5b7'" />
          <path d="M19 24 L28 24 L28 29" fill="none" stroke="#e5e9df" stroke-width=".9" opacity=".65" />
          <path d="M15 35 H33" stroke="#3e342b" stroke-width="3" /><rect x="23" y="34" width="3" height="3" fill="#c8b276" />
          <path d="M15 23 L12 27 L13 34 M32 23 L35 28 L35 33" fill="none" stroke="#64777e" stroke-width="5" stroke-linecap="round" />
          <path v-if="healthRatio < .5" d="M11 29 L15 28" stroke="#b44b45" stroke-width="2.2" />
          <g v-if="ranged" class="quiver"><path d="M15 22 L10 36 L15 38 L21 22 Z" fill="#6f4c32" /><path d="M15 23 L18 15 M17 24 L21 15 M19 25 L24 17" stroke="#c9c1a0" stroke-width="1" /></g>
          <g class="weapon" :class="{ ranged }">
            <template v-if="weapon === 'bow'"><path d="M36 13 Q48 27 36 40" fill="none" stroke="#b18853" stroke-width="2" /><path d="M36 13 L37 27 L36 40" fill="none" stroke="#ded3b6" stroke-width=".8" /><path d="M32 27 H47" stroke="#d5d5c0" stroke-width="1" /></template>
            <template v-else-if="weapon === 'crossbow'"><path d="M30 30 L45 23" stroke="#795739" stroke-width="3" /><path d="M34 18 Q43 21 43 32 M34 18 L38 26 L43 32" fill="none" stroke="#c5c9bf" stroke-width="1.4" /></template>
            <template v-else-if="weapon === 'axe'"><path d="M36 43 V9" stroke="#87633d" stroke-width="2.5" /><path d="M36 9 Q45 5 46 12 L43 19 L36 17 Z" fill="#c4ced0" stroke="#52656c" stroke-width=".8" /></template>
            <template v-else-if="weapon === 'mace'"><path d="M36 42 V17" stroke="#80603e" stroke-width="2.5" /><path d="M32 10 L36 7 L40 10 L41 17 L36 20 L31 17 Z" fill="#a8b7b9" stroke="#53656c" /></template>
            <template v-else><path d="M36 49 V7" stroke="#8c704d" stroke-width="2" /><path d="M36 1 L32 10 L36 13 L40 10 Z" fill="#d2dcda" stroke="#697f87" stroke-width=".7" /></template>
          </g>
          <g v-if="!ranged" class="shield" :transform="`translate(0 ${-step * .3})`">
            <path :d="weapon === 'mace' ? 'M6 23 L17 21 L19 35 L12 42 L5 35 Z' : 'M7 25 Q12 21 18 25 L18 34 Q13 40 7 34 Z'" fill="#c1c8be" stroke="#526771" stroke-width="1.3" />
            <path d="M9 25 L15 24 L16 33 L12 37 L8 33 Z" fill="currentColor" /><circle cx="12" cy="30" r="2" fill="#d7dfd8" />
          </g>
          <g class="head">
            <circle cx="24" cy="14" r="7" fill="#e3ba92" stroke="#62564c" stroke-width=".6" />
            <path v-if="ranged" d="M16 15 Q14 3 24 3 Q35 3 32 17 L29 12 L20 10 Z" fill="currentColor" stroke="#3f4c45" stroke-width=".8" />
            <g v-else class="helmet"><path d="M16 13 Q15 3 24 3 Q33 3 32 14 L28 12 L19 12 Z" fill="#8fa4ad" stroke="#4b626d" stroke-width=".8" /><path d="M24 4 V11 M17 12 H31" stroke="#d4dfdd" stroke-width="1.2" /><path v-if="weapon === 'axe'" d="M23 3 L24 0 L29 1 L26 5" fill="currentColor" /></g>
            <template v-if="!rear"><path d="M25 14 H28" stroke="#263b43" stroke-width="1.2" /><path d="M29 14 L31 17 L28 18" fill="#c99c78" /><path d="M22 20 Q25 23 28 20" stroke="#765b47" fill="none" stroke-width=".8" /></template>
            <path v-else d="M18 11 Q24 8 30 12 L30 19 Q24 24 18 19 Z" :fill="ranged ? color : '#6c858e'" />
          </g>
          <g v-if="healing" class="drinking-hand"><path d="M33 29 L34 20 L28 14" fill="none" stroke="#e3ba92" stroke-width="3" stroke-linecap="round" /><rect x="26" y="10" width="6" height="9" rx="2" fill="#438f68" stroke="#c6e7b5" /><path d="M29 12 V17 M27 14 H31" stroke="white" /></g>
          <g v-else-if="rest && !moving && !strike" class="wiping-hand"><path d="M32 28 L35 18 L27 10" fill="none" stroke="#e3ba92" stroke-width="3" stroke-linecap="round" /></g>
        </g>
      </g>
    </svg>
  </div>
  <span v-if="holding" class="hold-mark" title="Удерживает позицию">◆</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { UnitPose } from '../game/unitPresentation';
import { rangedWeapon, type WeaponType } from '../game/weapons';
const props = defineProps<{ color: string; isMoving: boolean; isSelected: boolean; movementType?: 'land' | 'water'; weapon?: WeaponType; pose?: UnitPose; healthRatio?: number; holding?: boolean; ultimate?: boolean; healing?: boolean; facingLeft?: boolean; hit?: boolean; rest?: boolean; strike?: boolean }>();
const moving = computed(() => !!props.pose?.moving && !props.healing);
const phase = computed(() => props.pose?.phase ?? 0);
const step = computed(() => moving.value ? Math.sin(phase.value) * 2 : 0);
const liftA = computed(() => moving.value ? -Math.max(0, Math.cos(phase.value)) * 1.6 : 0);
const liftB = computed(() => moving.value ? -Math.max(0, -Math.cos(phase.value)) * 1.6 : 0);
const bob = computed(() => moving.value ? -Math.abs(Math.sin(phase.value)) * 1.1 : 0);
const mirror = computed(() => (moving.value ? (props.pose?.facingX ?? 1) < 0 : props.facingLeft ?? (props.pose?.facingX ?? 1) < 0) ? 'translate(48 0) scale(-1 1)' : undefined);
const rear = computed(() => !props.strike && (props.pose?.facingY ?? 1) < -.25);
const ranged = computed(() => rangedWeapon(props.weapon));
</script>

<style scoped>
.unit-shadow { position:absolute; left:-15px; top:-6px; width:30px; height:12px; border-radius:50%; background:#081b18; opacity:.3; pointer-events:none; }
.unit-shadow.water { width:37px; left:-18px; background:#83c6cb; opacity:.2; }
.unit-sprite { position:absolute; left:-19px; top:-43px; width:38px; height:45px; pointer-events:none; }
.unit-sprite svg { width:100%; height:100%; overflow:visible; }
.unit-ring { position:absolute; left:-20px; top:-8px; width:40px; height:17px; border:1.5px solid #b6e3a4; border-radius:50%; box-shadow:0 0 0 2px #203a2c80; }
.unit-ring.holding { border-style:dashed; }
.hold-mark { position:absolute; left:-3px; top:5px; color:#e6d8a4; font-size:9px; pointer-events:none; }
.weapon { transform-origin:36px 30px; }
.is-striking .weapon:not(.ranged) { animation:thrust .4s ease-out; }
.is-striking .weapon.ranged { animation:recoil .25s ease-out; }
.is-ultimate .weapon:not(.ranged) { animation:finisher .3s ease-out; }
.is-ultimate .weapon { filter:drop-shadow(0 0 1px #e6bf67); }
.is-hit .head { animation:hit .3s ease-out; }
.is-hit .helmet { animation:helmet .3s ease-out; }
.drinking-hand { transform-origin:32px 27px; animation:sip .7s ease-in-out infinite alternate; }
.wiping-hand { transform-origin:32px 27px; animation:sip .5s ease-in-out 2; }
.is-idle .upper-body { animation:breathe 3s ease-in-out infinite; transform-origin:24px 36px; }
@keyframes breathe { 50% { transform:translateY(-.4px); } }
@keyframes thrust { 35% { transform:rotate(55deg) translateY(2px); } 55% { transform:rotate(70deg) translateY(-7px); } }
@keyframes recoil { 40% { transform:translateX(-3px); } }
@keyframes finisher { 30% { transform:rotate(-25deg); } 65% { transform:rotate(85deg) translateY(-4px); } }
@keyframes hit { 30% { transform:translateX(-1.5px); } }
@keyframes helmet { 40% { transform:translateY(-2px); } }
@keyframes sip { to { transform:rotate(-7deg); } }
@media (prefers-reduced-motion:reduce) { *, *::before, *::after { animation:none !important; } }
</style>
