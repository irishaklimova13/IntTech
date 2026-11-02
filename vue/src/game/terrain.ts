import type { TerrainType } from './entities';
import type { Point } from './pathfinding';

export const MAP_RADIUS = 12;
export const POND_CENTER = { x: 5, y: 4 };
export const POND_RADII = { x: 4.2, y: 3.2 };

export interface MapTile extends Point {
  terrain: TerrainType;
}

export const isInsideMap = (x: number, y: number): boolean =>
  Math.abs(x) <= MAP_RADIUS && Math.abs(y) <= MAP_RADIUS;

export const getTerrainAt = (x: number, y: number): TerrainType | null => {
  if (!isInsideMap(x, y)) return null;
  const nx = (x - POND_CENTER.x) / POND_RADII.x;
  const ny = (y - POND_CENTER.y) / POND_RADII.y;
  return nx * nx + ny * ny <= 1 ? 'water' : 'land';
};

export const getMapTiles = (): MapTile[] => {
  const tiles: MapTile[] = [];
  for (let x = -MAP_RADIUS; x <= MAP_RADIUS; x++) {
    for (let y = -MAP_RADIUS; y <= MAP_RADIUS; y++) {
      const terrain = getTerrainAt(x, y);
      if (terrain) tiles.push({ x, y, terrain });
    }
  }
  return tiles;
};

export const findNearestTerrainTile = (
  startX: number,
  startY: number,
  terrain: TerrainType,
  isOccupied: (x: number, y: number) => boolean = () => false,
): Point | null => {
  const originX = Math.round(startX);
  const originY = Math.round(startY);
  for (let radius = 0; radius <= MAP_RADIUS * 2; radius++) {
    let best: Point | null = null;
    let bestDistance = Infinity;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = originX + dx;
        const y = originY + dy;
        if (getTerrainAt(x, y) !== terrain || isOccupied(x, y)) continue;
        const distance = (x - startX) ** 2 + (y - startY) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x, y };
        }
      }
    }
    if (best) return best;
  }
  return null;
};
