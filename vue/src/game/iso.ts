export const TILE_W = 64;
export const TILE_H = 32;

export interface Vec2 {
  x: number;
  y: number;
}

export const worldToIso = (wx: number, wy: number): Vec2 => ({
  x: (wx - wy) * (TILE_W / 2),
  y: (wx + wy) * (TILE_H / 2),
});

export const isoToWorld = (ix: number, iy: number): Vec2 => ({
  x: ix / TILE_W + iy / TILE_H,
  y: iy / TILE_H - ix / TILE_W,
});