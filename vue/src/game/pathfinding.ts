export interface Point {
  x: number;
  y: number;
}

export const findPath = (
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  isBlocked: (x: number, y: number) => boolean
): Point[] => {
  const start = { x: Math.round(startX), y: Math.round(startY) };
  let target = { x: Math.round(targetX), y: Math.round(targetY) };

  
  if (isBlocked(target.x, target.y)) {
    let bestDist = Infinity;
    let bestTile = target;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const nx = target.x + dx;
        const ny = target.y + dy;
        if (!isBlocked(nx, ny)) {
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            bestTile = { x: nx, y: ny };
          }
        }
      }
    }
    if (bestDist === Infinity) return []; 
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
  const heuristic = (x: number, y: number) => Math.abs(x - target.x) + Math.abs(y - target.y);

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
    { dx: 1, dy: 1, cost: 1.414 },
    { dx: 1, dy: -1, cost: 1.414 },
    { dx: -1, dy: 1, cost: 1.414 },
    { dx: -1, dy: -1, cost: 1.414 },
  ];

  while (openList.size > 0) {
    
    let currentNode: Node | null = null;
    for (const node of openList.values()) {
      if (!currentNode || node.f < currentNode.f) {
        currentNode = node;
      }
    }

    if (!currentNode) break;

    
    if (currentNode.x === target.x && currentNode.y === target.y) {
      const path: Point[] = [];
      let curr: Node | null = currentNode;
      while (curr) {
        path.unshift({ x: curr.x, y: curr.y });
        curr = curr.parent;
      }
      
      if (path.length > 0) {
        path[path.length - 1] = { x: targetX, y: targetY };
      }
      return path.slice(1); 
    }

    const currentKey = getKey(currentNode.x, currentNode.y);
    openList.delete(currentKey);
    closedList.add(currentKey);

    for (const { dx, dy, cost } of neighbors) {
      const nx = currentNode.x + dx;
      const ny = currentNode.y + dy;
      const nKey = getKey(nx, ny);

      if (closedList.has(nKey)) continue;
      if (isBlocked(nx, ny)) continue;

      
      if (dx !== 0 && dy !== 0) {
        if (isBlocked(currentNode.x + dx, currentNode.y) || isBlocked(currentNode.x, currentNode.y + dy)) {
          continue;
        }
      }

      const tentativeG = currentNode.g + cost;
      let neighbor = openList.get(nKey);

      if (!neighbor) {
        neighbor = {
          x: nx,
          y: ny,
          g: tentativeG,
          f: tentativeG + heuristic(nx, ny),
          parent: currentNode,
        };
        openList.set(nKey, neighbor);
      } else if (tentativeG < neighbor.g) {
        neighbor.g = tentativeG;
        neighbor.f = tentativeG + heuristic(nx, ny);
        neighbor.parent = currentNode;
      }
    }
  }

  return []; 
};