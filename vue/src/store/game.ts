import type { Module } from 'vuex';
import type { Entity } from '../game/entities';
import { advanceFrame } from '../game/frame';

export type GameEventPayload =
  | { type: 'ENTITY_ADDED'; entity: Entity }
  | { type: 'ENTITY_REMOVED'; entityId: string }
  | { type: 'MOVE_REQUESTED'; entityId: string; target: { x: number; y: number } };

export type GameEvent = GameEventPayload & { id: number };

export interface GameState {
  entities: Entity[];
  events: GameEvent[];
  nextEventId: number;
}

const game: Module<GameState, Record<string, unknown>> = {
  namespaced: true,
  state: (): GameState => ({
    entities: [],
    events: [],
    nextEventId: 1,
  }),
  getters: {
    entities: (state) => state.entities,
    pendingEvents: (state) => state.events,
    selectedEntities: (state) => state.entities.filter((entity) => entity.isSelected),
  },
  mutations: {
    ENQUEUE_EVENT(state, payload: GameEventPayload) {
      const event = { ...payload, id: state.nextEventId++ } as GameEvent;
      state.events.push(event);
    },
    PROCESS_FRAME(state, deltaSeconds: number) {
      state.entities = advanceFrame(state.entities, state.events, deltaSeconds);
      state.events = [];
    },
    CLEAR_ENTITIES(state) {
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
