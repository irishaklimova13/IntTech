import type { TerrainType } from './entities';
import type { Point } from './pathfinding';

export const MAP_RADIUS = 12;
export const RIVER_BRIDGES = [-6, 6];
export const riverCenter = (x: number) => 1.35 * Math.sin(x * .32);
export const riverWidth = (x: number) => 1.65 + .2 * Math.cos(x * .45);
export const isRiverTile = (x: number, y: number) => isInsideMap(x, y) && Math.abs(y - riverCenter(x)) <= riverWidth(x);
export const isBridgeTile = (x: number, y: number) => isRiverTile(Math.round(x), Math.round(y)) && RIVER_BRIDGES.includes(Math.round(x));
export const canTraverseTerrain = (x: number, y: number, type: TerrainType) =>
  getTerrainAt(Math.round(x), Math.round(y)) === type || (type === 'land' && isBridgeTile(x, y));

export interface MapTile extends Point {
  terrain: TerrainType;
}

export const isInsideMap = (x: number, y: number): boolean =>
  Math.abs(x) <= MAP_RADIUS && Math.abs(y) <= MAP_RADIUS;

export const getTerrainAt = (x: number, y: number): TerrainType | null => {
  if (!isInsideMap(x, y)) return null;
  return isRiverTile(x, y) ? 'water' : 'land';
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
        if (!canTraverseTerrain(x, y, terrain) || isOccupied(x, y)) continue;
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
