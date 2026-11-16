import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'vuex';
import gameModule, { type GameState, type GameEventPayload } from '../store/game';
import { createUnit, createBuilding, type Entity, type Unit } from './entities';
import { advanceFrame } from './frame';
import { canTraverseTerrain, getTerrainAt, isBridgeTile, riverCenter } from './terrain';
import { findPath } from './pathfinding';
import { requestBoard, disembark, passengersOf, updateTransports } from './transports';

function harness(entities: Entity[]) {
  const store = createStore({ modules: { game: gameModule } });
  store.commit('game/CONFIGURE_RANDOM', () => 1);
  const event = (e: GameEventPayload) => store.commit('game/ENQUEUE_EVENT',e);
  entities.forEach(entity => event({ type:'ENTITY_ADDED', entity }));
  const step = (n=1) => { for(let i=0;i<n;i++) store.commit('game/PROCESS_FRAME',.05); };
  const state = () => (store.state as { game:GameState }).game;
  step(); return { event, step, state };
}

test('river crosses the whole map; infantry crosses on bridges while boats pass underneath', () => {
  for (let x=-12;x<=12;x++) assert.equal(getTerrainAt(x,Math.round(riverCenter(x))),'water');
  assert.ok(isBridgeTile(-6,-1));
  assert.ok(canTraverseTerrain(-6,-1,'land')); assert.ok(canTraverseTerrain(-6,-1,'water'));
  const route = findPath(0,-4,0,5,(x,y) => !canTraverseTerrain(x,y,'land'));
  assert.ok(route.length);
  let start={x:0,y:-4};
  for(const end of route) {
    const n=Math.ceil(Math.hypot(end.x-start.x,end.y-start.y)*20);
    for(let i=1;i<=n;i++) assert.ok(canTraverseTerrain(start.x+(end.x-start.x)*i/n,start.y+(end.y-start.y)*i/n,'land'));
    start=end;
  }
  assert.ok(findPath(-12,riverCenter(-12),12,riverCenter(12),(x,y)=>!canTraverseTerrain(x,y,'water')).length);
});

test('head-on movement is bounded, does not overlap and settles without shaking', () => {
  const a=createUnit(-4,-6,'blue'), b=createUnit(0,-6,'blue');
  a.path=[{x:0,y:-6}]; b.path=[{x:-4,y:-6}];
  let entities:Entity[]=[a,b];
  for(let i=0;i<240;i++) {
    const previous=new Map(entities.map(e=>[e.id,{x:e.x,y:e.y}]));
    entities=advanceFrame(entities,[],.05);
    for(const e of entities) assert.ok(Math.hypot(e.x-previous.get(e.id)!.x,e.y-previous.get(e.id)!.y)<.17,'no teleporting collision correction');
    assert.ok(Math.hypot(entities[0]!.x-entities[1]!.x,entities[0]!.y-entities[1]!.y)>=.799);
  }
  assert.ok(Math.hypot(entities[0]!.x,entities[0]!.y+6)<.05);
  assert.ok(Math.hypot(entities[1]!.x+4,entities[1]!.y+6)<.05);
  const stable=entities.map(e=>[e.x,e.y]);
  for(let i=0;i<60;i++) entities=advanceFrame(entities,[],.05);
  assert.deepEqual(entities.map(e=>[e.x,e.y]),stable);
});

test('boat reserves four seats, carries units and disembarks onto separate safe land tiles', () => {
  const boat=createUnit(1,0,'blue','water');
  const troops=Array.from({length:5},()=>createUnit(0,-2,'blue'));
  const entities:Entity[]=[boat,...troops];
  for(let i=0;i<4;i++) assert.ok(requestBoard(entities,troops[i]!,boat));
  assert.equal(requestBoard(entities,troops[4]!,boat),false);
  // Put the waiting units at the bank within boarding distance.
  for(const u of troops.slice(0,4)) { u.x=0;u.y=-2; }
  updateTransports(entities);
  assert.equal(passengersOf(entities,boat.id).length,4);
  boat.x=4;boat.y=1; updateTransports(entities);
  assert.ok(passengersOf(entities,boat.id).every(u=>u.x===4&&u.y===1));
  assert.equal(disembark(entities,boat),4);
  const landed=troops.slice(0,4);
  assert.ok(landed.every(u=>!u.transportId&&canTraverseTerrain(u.x,u.y,'land')));
  for(let i=0;i<4;i++) for(let j=i+1;j<4;j++) assert.ok(Math.hypot(landed[i]!.x-landed[j]!.x,landed[i]!.y-landed[j]!.y)>=.8);
});

test('boarding and disembarking run through Vuex frames without passengers blocking their boat', () => {
  const boat=createUnit(1,0,'blue','water'), unit=createUnit(0,-2,'blue');
  const h=harness([boat,unit]);
  h.event({type:'BOARD_REQUESTED',entityId:unit.id,boatId:boat.id}); h.step(80);
  assert.equal((h.state().entities.find(e=>e.id===unit.id) as Unit).transportId,boat.id);
  h.event({type:'MOVE_REQUESTED',entityId:boat.id,target:{x:4,y:1}});h.step(80);
  const moved=h.state().entities.find(e=>e.id===boat.id)!;
  assert.ok(Math.hypot(moved.x-4,moved.y-1)<.2);
  h.event({type:'DISEMBARK_REQUESTED',boatId:boat.id});h.step();
  const landed=h.state().entities.find(e=>e.id===unit.id) as Unit;
  assert.equal(landed.transportId,undefined);assert.ok(canTraverseTerrain(landed.x,landed.y,'land'));
});

test('rally point sends successive recruits to distinct destinations', () => {
  const house=createBuilding(-8,-6,'blue'); const h=harness([house]);
  h.event({type:'RALLY_REQUESTED',buildingId:house.id,target:{x:-4,y:-4}});
  for(let i=0;i<4;i++) h.event({type:'SPAWN_REQUESTED',buildingId:house.id,weapon:'spear'});
  h.step();
  const troops=h.state().entities.filter((e):e is Unit=>e.kind==='unit');
  assert.equal(troops.length,4);assert.ok(troops.every(u=>u.path.length));
  const goals=troops.map(u=>u.path.at(-1)!);
  assert.equal(new Set(goals.map(p=>`${p.x}:${p.y}`)).size,4);
  h.step(160);assert.ok(troops.every(u=>u.hp>0));
});
