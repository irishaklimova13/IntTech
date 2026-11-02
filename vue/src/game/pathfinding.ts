export interface Point {
  x: number;
  y: number;
}

interface SearchNode extends Point {
  g: number;
  f: number;
  parent: SearchNode | null;
}

/** Finds a route to one specific, already validated tile. */
const findPathToTile = (
  start: Point,
  target: Point,
  isBlocked: (x: number, y: number) => boolean,
): Point[] => {
  if (start.x === target.x && start.y === target.y) return [target];

  const key = (x: number, y: number) => `${x},${y}`;
  // Octile distance matches the costs of the eight movement directions.
  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(x - target.x);
    const dy = Math.abs(y - target.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  const open = new Map<string, SearchNode>();
  const closed = new Set<string>();
  const first: SearchNode = {
    ...start,
    g: 0,
    f: heuristic(start.x, start.y),
    parent: null,
  };
  open.set(key(first.x, first.y), first);

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
    let current: SearchNode | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.x === target.x && current.y === target.y) {
      const path: Point[] = [];
      let node: SearchNode | null = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path.slice(1);
    }

    const currentKey = key(current.x, current.y);
    open.delete(currentKey);
    closed.add(currentKey);

    for (const { dx, dy, cost } of neighbors) {
      const x = current.x + dx;
      const y = current.y + dy;
      const nextKey = key(x, y);
      if (closed.has(nextKey) || isBlocked(x, y)) continue;

      // Prevent diagonal movement through the corner of an obstacle.
      if (dx !== 0 && dy !== 0) {
        if (isBlocked(current.x + dx, current.y) || isBlocked(current.x, current.y + dy)) {
          continue;
        }
      }

      const g = current.g + cost;
      let next = open.get(nextKey);
      if (!next) {
        next = { x, y, g, f: g + heuristic(x, y), parent: current };
        open.set(nextKey, next);
      } else if (g < next.g) {
        next.g = g;
        next.f = g + heuristic(x, y);
        next.parent = current;
      }
    }
  }

  return [];
};

/**
 * A* on the logical tile grid. Blocked destinations are replaced with the
 * nearest unblocked destination that is actually reachable from the start.
 */
export const findPath = (
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  isBlocked: (x: number, y: number) => boolean,
): Point[] => {
  const start = { x: Math.round(startX), y: Math.round(startY) };
  const requestedTarget = { x: Math.round(targetX), y: Math.round(targetY) };

  // Preserve exact click coordinates only when the requested tile is valid.
  if (!isBlocked(requestedTarget.x, requestedTarget.y)) {
    const path = findPathToTile(start, requestedTarget, isBlocked);
    if (path.length > 0) path[path.length - 1] = { x: targetX, y: targetY };
    return path;
  }

  // Search candidate destinations in increasing distance order. Unlike
  // merely picking the first free tile, test reachability before accepting it.
  const candidates: Array<Point & { distance: number }> = [];
  const searchRadius = 20;
  for (let dx = -searchRadius; dx <= searchRadius; dx++) {
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = requestedTarget.x + dx;
      const y = requestedTarget.y + dy;
      if (isBlocked(x, y)) continue;
      candidates.push({ x, y, distance: dx * dx + dy * dy });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.x - b.x || a.y - b.y);

  for (const candidate of candidates) {
    const path = findPathToTile(start, candidate, isBlocked);
    if (path.length > 0) return path;
  }

  return [];
};
