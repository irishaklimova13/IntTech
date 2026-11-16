import type { Module } from 'vuex';
import type { WeaponType } from '../game/weapons';
import type { Entity } from '../game/entities';
import { advanceFrame } from '../game/frame';
import { createUnitActions, type UnitEffects } from '../game/unitActions';
import { createCombatVisuals, type CombatVisual } from '../game/combatVisuals';
import { getMapTiles, type MapTile } from '../game/terrain';

export type GameEventPayload =
  | { type: 'ENTITY_ADDED'; entity: Entity }
  | { type: 'ENTITY_REMOVED'; entityId: string }
  | { type: 'MOVE_REQUESTED'; entityId: string; target: { x: number; y: number }; queued?: boolean; attackMove?: boolean }
  | { type: 'SPAWN_REQUESTED'; buildingId: string; weapon?: WeaponType }
  | { type: 'ATTACK_REQUESTED'; entityId: string; targetId: string; queued?: boolean }
  | { type: 'BOARD_REQUESTED'; entityId: string; boatId: string }
  | { type: 'DISEMBARK_REQUESTED'; boatId: string }
  | { type: 'RALLY_REQUESTED'; buildingId: string; target: { x: number; y: number } }
  | { type: 'HOLD_REQUESTED'; entityId: string }
  | { type: 'HEAL_REQUESTED'; entityId: string; queued?: boolean };

export type GameEvent = GameEventPayload & { id: number };

export interface GameState {
  effects: Record<string, UnitEffects>;
  combatVisuals: CombatVisual[];
  mapTiles: MapTile[];
  entities: Entity[];
  events: GameEvent[];
  nextEventId: number;
}

const runtimes = new WeakMap<GameState, { actions: ReturnType<typeof createUnitActions>; visuals: ReturnType<typeof createCombatVisuals> }>();
const runtimeFor = (state: GameState, random?: () => number) => {
  let runtime = runtimes.get(state);
  if (!runtime || random) {
    const visuals = createCombatVisuals(state.combatVisuals);
    runtime = { visuals, actions: createUnitActions(state.entities, state.effects, visuals.add, random) };
    runtimes.set(state, runtime);
  }
  return runtime;
};

const game: Module<GameState, Record<string, unknown>> = {
  namespaced: true,
  state: (): GameState => ({
    effects: {}, combatVisuals: [],
    mapTiles: getMapTiles(),
    entities: [],
    events: [],
    nextEventId: 1,
  }),
  getters: {
    mapTiles: (state) => state.mapTiles,
    entities: (state) => state.entities,
    pendingEvents: (state) => state.events,
    selectedEntities: (state) => state.entities.filter((entity) => entity.isSelected),
  },
  mutations: {
    ENQUEUE_EVENT(state, payload: GameEventPayload) {
      const event = { ...payload, id: state.nextEventId++ } as GameEvent;
      state.events.push(event);
    },
    CONFIGURE_RANDOM(state, random: () => number) { runtimeFor(state, random); },
    PROCESS_FRAME(state, deltaSeconds: number) {
      const runtime = runtimeFor(state);
      runtime.visuals.tick(Math.max(0, Math.min(deltaSeconds, 0.1)));
      state.entities = advanceFrame(state.entities, state.events, deltaSeconds, runtime.actions);
      state.events = [];
    },
    CLEAR_ENTITIES(state) {
      runtimes.delete(state); state.effects = {}; state.combatVisuals = [];
      state.entities = [];
      state.events = [];
    },
  },
  actions: {
    enqueueEvent({ commit }, payload: GameEventPayload) {
      commit('ENQUEUE_EVENT', payload);
    },
    processFrame({ commit }, deltaSeconds: number) {
      commit('PROCESS_FRAME', deltaSeconds);
    },
    clear({ commit }) {
      commit('CLEAR_ENTITIES');
    },
  },
};

export default game;
