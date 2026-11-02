export interface Point {
  x: number;
  y: number;
}

/**
 * Checks a segment at small intervals so a route can be simplified without
 * cutting through blocked terrain or buildings.
 */
const hasClearLine = (
  from: Point,
  to: Point,
  isBlocked: (x: number, y: number) => boolean,
): boolean => {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance * 5));

  for (let step = 1; step <= steps; step++) {
    const progress = step / steps;
    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress;
    if (isBlocked(Math.round(x), Math.round(y))) return false;
  }
  return true;
};

/**
 * A* on the logical tile grid. The callback must reject every impassable tile.
 * Clear routes are kept as one straight segment; obstacle routes are smoothed
 * by connecting the furthest visible waypoints.
 */
export const findPath = (
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  isBlocked: (x: number, y: number) => boolean,
): Point[] => {
  const start = { x: Math.round(startX), y: Math.round(startY) };
  let target = { x: Math.round(targetX), y: Math.round(targetY) };
  let targetWasAdjusted = false;

  if (isBlocked(target.x, target.y)) {
    let bestTile: Point | null = null;
    let bestDistance = Infinity;
    for (let radius = 1; radius <= 20 && !bestTile; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = target.x + dx;
          const y = target.y + dy;
          if (isBlocked(x, y)) continue;
          const distance = dx * dx + dy * dy;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestTile = { x, y };
          }
        }
      }
    }
    if (!bestTile) return [];
    target = bestTile;
    targetWasAdjusted = true;
  }

  const finalTarget = targetWasAdjusted ? target : { x: targetX, y: targetY };
  const actualStart = { x: startX, y: startY };

  // With no obstacle in the way, the Euclidean shortest path is a straight line.
  if (hasClearLine(actualStart, finalTarget, isBlocked)) return [finalTarget];

  if (start.x === target.x && start.y === target.y) return [finalTarget];

  interface Node {
    x: number;
    y: number;
    g: number;
    f: number;
    parent: Node | null;
  }

  const key = (x: number, y: number) => `${x},${y}`;
  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(x - target.x);
    const dy = Math.abs(y - target.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  const open = new Map<string, Node>();
  const closed = new Set<string>();
  open.set(key(start.x, start.y), {
    x: start.x, y: start.y, g: 0, f: heuristic(start.x, start.y), parent: null,
  });

  const neighbors = [
    { dx: 1, dy: 0, cost: 1 },
    { dx: -1, dy: 0, cost: 1 },
    { dx: 0, dy: 1, cost: 1 },
    { dx: 0, dy: -1, cost: 1 },
    { dx: 1, dy: 1, cost: Math.SQRT2 },
    { dx: 1, dy: -1, cost: Math.SQRT2 },
    { dx: -1, dy: 1, cost: Math.SQRT2 },
    { dx: -1, dy: -1, cost: Math.SQRT2 },
  ];

  while (open.size > 0) {
    let current: Node | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.x === target.x && current.y === target.y) {
      const rawPath: Point[] = [];
      let node: Node | null = current;
      while (node) {
        rawPath.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }

      const waypoints = rawPath.slice(1);
      if (waypoints.length === 0) return [finalTarget];
      waypoints[waypoints.length - 1] = finalTarget;

      // Greedily skip intermediate A* tiles whenever a direct segment is clear.
      const smoothed: Point[] = [];
      let from = actualStart;
      let index = 0;
      while (index < waypoints.length) {
        let furthestVisible = index;
        for (let candidate = waypoints.length - 1; candidate >= index; candidate--) {
          if (hasClearLine(from, waypoints[candidate]!, isBlocked)) {
            furthestVisible = candidate;
            break;
          }
        }
        const next = waypoints[furthestVisible]!;
        smoothed.push(next);
        from = next;
        index = furthestVisible + 1;
      }
      return smoothed;
    }

    open.delete(key(current.x, current.y));
    closed.add(key(current.x, current.y));

    for (const { dx, dy, cost } of neighbors) {
      const x = current.x + dx;
      const y = current.y + dy;
      const nextKey = key(x, y);
      if (closed.has(nextKey) || isBlocked(x, y)) continue;
      if (dx !== 0 && dy !== 0) {
        if (isBlocked(current.x + dx, current.y) || isBlocked(current.x, current.y + dy)) continue;
      }

      const nextG = current.g + cost;
      let next = open.get(nextKey);
      if (!next) {
        next = { x, y, g: nextG, f: nextG + heuristic(x, y), parent: current };
        open.set(nextKey, next);
      } else if (nextG < next.g) {
        next.g = nextG;
        next.f = nextG + heuristic(x, y);
        next.parent = current;
      }
    }
  }
  return [];
};
