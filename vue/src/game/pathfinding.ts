export interface Point {
  x: number;
  y: number;
}

/**
 * A* on the isometric world's logical tile grid.
 * isBlocked must reject both impassable terrain and solid buildings.
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

  // If the requested tile is unavailable, choose the closest reachable
  // tile around it. This also handles orders issued onto buildings/water.
  if (isBlocked(target.x, target.y)) {
    let bestDist = Infinity;
    let bestTile: Point | null = null;

    for (let radius = 1; radius <= 20 && !bestTile; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const nx = target.x + dx;
          const ny = target.y + dy;
          if (isBlocked(nx, ny)) continue;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            bestTile = { x: nx, y: ny };
          }
        }
      }
    }
    if (!bestTile) return [];
    target = bestTile;
  }

  if (start.x === target.x && start.y === target.y) {
    return [{ x: targetX, y: targetY }];
  }

  interface Node {
    x: number;
    y: number;
    g: number;
    f: number;
    parent: Node | null;
  }

  const getKey = (x: number, y: number) => `${x},${y}`;
  // Octile distance is admissible for the eight-direction movement below.
  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(x - target.x);
    const dy = Math.abs(y - target.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  const openList = new Map<string, Node>();
  const closedList = new Set<string>();
  const startNode: Node = {
    x: start.x,
    y: start.y,
    g: 0,
    f: heuristic(start.x, start.y),
    parent: null,
  };
  openList.set(getKey(start.x, start.y), startNode);

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

  while (openList.size > 0) {
    let currentNode: Node | null = null;
    for (const node of openList.values()) {
      if (!currentNode || node.f < currentNode.f) currentNode = node;
    }
    if (!currentNode) break;

    if (currentNode.x === target.x && currentNode.y === target.y) {
      const path: Point[] = [];
      let current: Node | null = currentNode;
      while (current) {
        path.unshift({ x: current.x, y: current.y });
        current = current.parent;
      }
      if (path.length > 0) path[path.length - 1] = { x: targetX, y: targetY };
      return path.slice(1);
    }

    const currentKey = getKey(currentNode.x, currentNode.y);
    openList.delete(currentKey);
    closedList.add(currentKey);

    for (const { dx, dy, cost } of neighbors) {
      const nx = currentNode.x + dx;
      const ny = currentNode.y + dy;
      const nextKey = getKey(nx, ny);
      if (closedList.has(nextKey) || isBlocked(nx, ny)) continue;

      // Do not cut diagonally through the corner of a building or terrain edge.
      if (dx !== 0 && dy !== 0) {
        if (
          isBlocked(currentNode.x + dx, currentNode.y) ||
          isBlocked(currentNode.x, currentNode.y + dy)
        ) continue;
      }

      const tentativeG = currentNode.g + cost;
      let neighbor = openList.get(nextKey);
      if (!neighbor) {
        neighbor = {
          x: nx,
          y: ny,
          g: tentativeG,
          f: tentativeG + heuristic(nx, ny),
          parent: currentNode,
        };
        openList.set(nextKey, neighbor);
      } else if (tentativeG < neighbor.g) {
        neighbor.g = tentativeG;
        neighbor.f = tentativeG + heuristic(nx, ny);
        neighbor.parent = currentNode;
      }
    }
  }

  return [];
};
