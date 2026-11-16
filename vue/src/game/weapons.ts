export type WeaponType = 'spear' | 'axe' | 'mace' | 'bow' | 'crossbow' | 'harpoon';
export const WEAPONS = {
  spear: { name: 'Копейщик', weapon: 'Копьё', role: 'Держит дистанцию в ближнем бою', range: 1.7, strength: 12, health: 100, speed: 2.5, attackSpeed: 1 },
  axe: { name: 'Секироносец', weapon: 'Секира', role: 'Сильный удар в ближнем бою', range: 1.2, strength: 24, health: 110, speed: 2.2, attackSpeed: .8 },
  mace: { name: 'Щитоносец', weapon: 'Булава и щит', role: 'Выдерживает больше урона', range: 1.2, strength: 10, health: 180, speed: 1.9, attackSpeed: 1 },
  bow: { name: 'Лучник', weapon: 'Лук', role: 'Быстрый боец дальнего боя', range: 4.5, strength: 11, health: 70, speed: 3.1, attackSpeed: 1.25 },
  crossbow: { name: 'Арбалетчик', weapon: 'Арбалет', role: 'Дальний мощный, но медленный выстрел', range: 5.5, strength: 27, health: 90, speed: 2.1, attackSpeed: .55 },
  harpoon: { name: 'Дозорная лодка', weapon: 'Гарпун', role: 'Передвигается и сражается на воде', range: 3.2, strength: 18, health: 120, speed: 2.5, attackSpeed: .85 },
} as const;
export const LAND_WEAPONS = (Object.keys(WEAPONS) as WeaponType[]).filter(w => w !== 'harpoon');
export const rangedWeapon = (weapon?: WeaponType) => weapon === 'bow' || weapon === 'crossbow' || weapon === 'harpoon';
export const defaultWeapon = (color: string, water = false): WeaponType => water ? 'harpoon' :
  ({ '#dc2626': 'axe', '#16a34a': 'mace', '#9333ea': 'bow', '#f97316': 'crossbow' } as Record<string, WeaponType>)[color.toLowerCase()] ?? 'spear';
