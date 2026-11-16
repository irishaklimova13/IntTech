import { getTerrainAt, MAP_RADIUS, riverCenter, riverWidth, isBridgeTile } from './terrain';
export const tileVariation = (x: number, y: number) => ((x + 31) * 73856093 ^ (y + 31) * 19349663) >>> 0;
export const tileColor = (x: number, y: number) => {
  const n = tileVariation(x, y);
  if (getTerrainAt(x, y) === 'water') {
    const depth = Math.abs(y - riverCenter(x)) / riverWidth(x);
    return depth > .65 ? ['#4d9390', '#529a93', '#579b90'][n % 3] : ['#367878', '#397e7e', '#3c8180'][n % 3];
  }
  const shore = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => getTerrainAt(x + dx!, y + dy!) === 'water');
  return shore ? ['#899569', '#91986c', '#7f9267'][n % 3] : ['#506e49', '#54744c', '#57754e', '#506f48', '#59764f'][n % 5];
};
export function landscapeDecor() {
  const decor: { id: string; x: number; y: number; kind: 'tree' | 'grass' | 'reeds' | 'ripples' | 'bridge' | 'flowers' | 'fern' | 'bush'; variant: number }[] = [];
  for (let x = -MAP_RADIUS; x <= MAP_RADIUS; x++) for (let y = -MAP_RADIUS; y <= MAP_RADIUS; y++) {
    const n = tileVariation(x, y);
    const terrain = getTerrainAt(x,y);
    const shore = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => getTerrainAt(x + dx!, y + dy!) === 'water');
    if (isBridgeTile(x,y)) decor.push({ id:`b${x}:${y}`, x,y,kind:'bridge',variant:0 });
    if (terrain === 'water' && n % 3 === 0) decor.push({ id:`w${x}:${y}`, x,y,kind:'ripples',variant:n%3 });
    if (terrain === 'land' && (shore || n % 7 === 0)) decor.push({ id:`g${x}:${y}`,x,y,kind:shore?'reeds':(['grass','flowers','fern','bush'] as const)[n % 4]!,variant:n%3 });
  }
  // Trees are outside the playable footprint, so decorative scenery never blocks a route.
  for (let i = -MAP_RADIUS - 1; i <= MAP_RADIUS + 1; i += 2) for (const [x,y] of [[i,-MAP_RADIUS-1],[-MAP_RADIUS-1,i],[MAP_RADIUS+1,i],[i,MAP_RADIUS+1]]) {
    decor.push({ id:`t${x}:${y}`,x:x!,y:y!,kind:'tree',variant:tileVariation(x!,y!)%3 });
  }
  return decor;
}
