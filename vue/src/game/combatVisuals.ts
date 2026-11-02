export interface CombatVisualEvent {
  kind: 'hit' | 'death' | 'ultimate'; ultimate?: boolean; x: number; y: number; color: string;
}
export interface CombatVisual extends CombatVisualEvent { id: number; ttl: number; duration: number }

export function createCombatVisuals(items: CombatVisual[]) {
  let sequence = 0;
  return {
    add(event: CombatVisualEvent) {
      // Prefer dropping a short splash before removing older remains in huge battles.
      if (items.length >= 256) {
        const splash = items.findIndex(e => e.kind !== 'death');
        items.splice(splash < 0 ? 0 : splash, 1);
      }
      const duration = event.kind === 'death' ? 15 : event.kind === 'ultimate' ? 0.22 : 0.6;
      items.push({ ...event, id: ++sequence, ttl: duration, duration });
    },
    tick(dt: number) {
      for (let i = items.length - 1; i >= 0; i--) {
        items[i]!.ttl -= dt;
        if (items[i]!.ttl <= 0.000001) items.splice(i, 1);
      }
    },
  };
}
