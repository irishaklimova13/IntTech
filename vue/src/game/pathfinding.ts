export interface Point {
  x: number;
  y: number;
}

interface SearchNode extends Point {
  g: number;
  f: number;
  parent: SearchNode | null;
}

/**
 * Checks a segment at small intervals so smoothing cannot skip a blocked tile.
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
 * Finds a route to one specific tile. The returned path excludes the start tile.
 */
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

/**
 * Greedily removes intermediate A* tiles when a direct segment is clear.
 */
const smoothPath = (
  start: Point,
  path: Point[],
  isBlocked: (x: number, y: number) => boolean,
): Point[] => {
  if (path.length <= 1) return path;

  const smoothed: Point[] = [];
  let from = start;
  let index = 0;

  while (index < path.length) {
    let furthestVisible = index;
    for (let candidate = path.length - 1; candidate >= index; candidate--) {
      if (hasClearLine(from, path[candidate]!, isBlocked)) {
        furthestVisible = candidate;
        break;
      }
    }

    const next = path[furthestVisible]!;
    smoothed.push(next);
    from = next;
    index = furthestVisible + 1;
  }

  return smoothed;
};

/**
 * A* on the logical tile grid.
 * A blocked destination is replaced with the nearest free tile that is
 * actually reachable from the unit. Clear routes stay as a single segment;
 * routes around obstacles are smoothed without discarding A* reachability.
 */
export const findPath = (
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  isBlocked: (x: number, y: number) => boolean,
): Point[] => {
  const start = { x: Math.round(startX), y: Math.round(startY) };
  const actualStart = { x: startX, y: startY };
  const requestedTarget = { x: Math.round(targetX), y: Math.round(targetY) };

  // Keep the exact click coordinates when the requested destination is valid.
  if (!isBlocked(requestedTarget.x, requestedTarget.y)) {
    const exactTarget = { x: targetX, y: targetY };
    if (hasClearLine(actualStart, exactTarget, isBlocked)) return [exactTarget];

    const path = findPathToTile(start, requestedTarget, isBlocked);
    if (path.length === 0) return [];
    path[path.length - 1] = exactTarget;
    return smoothPath(actualStart, path, isBlocked);
  }

  // Check free candidates from nearest to farthest, accepting only a reachable one.
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
    if (path.length > 0) return smoothPath(actualStart, path, isBlocked);
  }

  return [];
};
