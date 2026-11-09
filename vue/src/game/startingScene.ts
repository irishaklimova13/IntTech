import { createBuilding, createUnit, type Entity } from './entities';
import { WEAPONS, type WeaponType } from './weapons';

/** Camps are related by a half-turn, just like the river and its bridges. */
export function createStartingEntities(): Entity[] {
  return ([['#3b82f6', 1], ['#dc2626', -1]] as const).flatMap(([color, side]) => {
    const fighter = (x: number, y: number, weapon: WeaponType) => {
      const profile = WEAPONS[weapon];
      return createUnit(x * side, y * side, color, weapon === 'harpoon' ? 'water' : 'land', {
        weapon, health: profile.health, maxHealth: profile.health,
        strength: profile.strength, movementSpeed: profile.speed, attackSpeed: profile.attackSpeed,
      });
    };
    const hut = createBuilding(-7 * side, -7 * side, { name: 'Хижина', color });
    const secondHut = createBuilding(-4 * side, -8 * side, { name: 'Хижина', color });
    const harbor = createBuilding(-3 * side, -3 * side, { name: 'Причал', color });
    harbor.spawnType = 'water';
    const boat = fighter(-3, -1, 'harpoon');
    const passengers = [fighter(-3, -1, 'spear'), fighter(-3, -1, 'bow')];
    passengers.forEach(unit => { unit.transportId = boat.id; });
    return [hut, secondHut, harbor, fighter(-7, -5, 'spear'), fighter(-5, -6, 'bow'), boat, ...passengers];
  });
}
