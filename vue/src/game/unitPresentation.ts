import type { Unit } from './entities';
export interface UnitPose { moving: boolean; phase: number; facingX: number; facingY: number; direction: number }
export function updateUnitPose(unit: Unit, previous: { x: number; y: number; path: unknown[] } | undefined) {
  const pose = unit.pose ?? { moving: false, phase: 0, facingX: 1, facingY: .5, direction: 1 };
  const dx = previous ? unit.x - previous.x : 0, dy = previous ? unit.y - previous.y : 0;
  const distance = Math.hypot(dx, dy);
  const moving = distance > .001 && (!!previous?.path.length || unit.path.length > 0);
  if (moving) {
    const sx = dx - dy, sy = (dx + dy) / 2;
    const length = Math.hypot(sx, sy);
    unit.pose = { moving, phase: (pose.phase + distance * 8) % (Math.PI * 2),
      facingX: sx / length, facingY: sy / length,
      direction: (Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) + 8) % 8 };
  } else unit.pose = { ...pose, moving: false };
}
