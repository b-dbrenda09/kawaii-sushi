import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { BALANCE } from '../src/game/Balance.js';
import { Scene } from '../src/game/Scene.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { PreparationSystem } from '../src/game/PreparationSystem.js';
import { CustomerSystem } from '../src/game/CustomerSystem.js';
import { RECIPES } from '../src/game/RecipeSystem.js';
import { SessionState } from '../src/game/SessionState.js';
import { Game } from '../src/game/Game.js';
import { Input } from '../src/game/Input.js';

const world = new Scene(), stations = world.kitchen.stations;
const factory = new IngredientFactory(), sushiFactory = new SushiFactory();
const carry = new CarrySystem({ player: world.player, stations, factory });
const prep = new PreparationSystem({ stations, carrySystem: carry, factory, sushiFactory });
assert.equal(prep.riceCookers.size, 4); assert.equal(prep.cuttingSystems.size, 3); assert.equal(prep.assemblySystems.size, 3);
assert.deepEqual([...new Set([...prep.riceCookers.values()].map(s => s.station.benchId))], ['riceBench1','riceBench2']);
assert.equal(world.player.maxSpeed, 5.04); assert.equal(world.player.maxSpeed * world.player.dashSpeedMultiplier, 11.55);
const cookers = [...prep.riceCookers.values()];
for (const [i, cooker] of cookers.entries()) {
  assert.equal(cooker.cookDuration, 6); assert.equal(cooker.burnDelay, 20);
  carry.attach(factory.create('rice')); assert.ok(carry.interact(cooker.station).success); assert.ok(carry.interact(cooker.station).success);
  cooker.update(i);
}
assert.equal(new Set(cookers.map(s => s.content)).size, 4);
assert.equal(new Set(cookers.map(s => s.effects.panel.material)).size, 4);
assert.deepEqual(cookers.map(s=>s.elapsed), [0,1,2,3]);
prep.updatePreparation(3);
assert.deepEqual(cookers.map(s=>s.state), ['COOKING','COOKING','COOKING','READY']);
prep.updatePreparation(3);
assert.ok(cookers.every(s=>s.state === 'READY'));
const held = cookers[0].content;
carry.interact(cookers[0].station); assert.equal(carry.carriedIngredient, held); carry.discard();
assert.equal(cookers[1].state, 'READY');
cookers[3].update(17); assert.equal(cookers[3].state,'BURNT'); assert.equal(cookers[1].state,'READY');
for (const [i, cutting] of [...prep.cuttingSystems.values()].entries()) {
  assert.equal(cutting.requiredCuts, 3);
  const raw = factory.create(i % 2 ? 'cucumber' : 'salmon'); carry.attach(raw); assert.ok(carry.interact(cutting.station).success);
  for (let cut=0;cut<3;cut++) {
    assert.equal(carry.interact(cutting.station).kind, 'cut-stroke');
    assert.equal(cutting.station.interactingPlayer, world.player);
    const before = world.player.group.position.clone(); world.player.update(.05,new Vector3(1,0,0),true);
    assert.ok(before.equals(world.player.group.position)); cutting.update(.25);
  }
  assert.equal(cutting.state, 'READY'); assert.equal(cutting.content,raw);
  assert.equal(cutting.station.interactingPlayer,null);
}
assert.equal(new Set([...prep.cuttingSystems.values()].map(s=>s.content)).size,3);
for (const [index, assembly] of [...prep.assemblySystems.values()].entries()) {
  const recipe=RECIPES[index];
  for (const state of recipe.sequence) {
    const type={rice_cooked:'rice',salmon_cut:'salmon',cucumber_cut:'cucumber',nori_sheet:'nori'}[state];
    carry.attach(factory.create(type,state)); assert.ok(carry.interact(assembly.station).success);
  }
  assert.equal(assembly.dish.recipeId,recipe.id); assert.equal(assembly.dish.ownerId,assembly.station.id);
}
assert.equal(new Set([...prep.assemblySystems.values()].map(s=>s.dish)).size,3);
const assemblies=[...prep.assemblySystems.values()];
carry.interact(assemblies[0].station); carry.discard();
carry.attach(factory.create('rice','rice_cooked')); carry.interact(assemblies[0].station);
prep.updateAssembly(.05,{selectedStation:assemblies[0].station,cancelHeld:true});
for(let i=0;i<20;i++)prep.updateAssembly(.05,{selectedStation:assemblies[0].station,cancelHeld:true});
assert.equal(assemblies[0].state,'EMPTY'); assert.equal(assemblies[1].state,'READY'); assert.equal(assemblies[2].state,'READY');
const customers=new CustomerSystem({scene:world.scene, delivery:stations.get('delivery')});
customers.update(9.99);assert.equal(customers.customers.size,0);
customers.update(.01);assert.equal(customers.customers.size,1);
customers.update(19.99);assert.equal(customers.customers.size,1);
customers.update(.01);assert.equal(customers.customers.size,2);
customers.update(15);assert.equal(customers.orderSystem.getActiveOrders().length,2);
assert.deepEqual(Object.values(BALANCE.patience),[100,120,120]);
customers.update(40);assert.equal(customers.customers.size,2);assert.equal(customers.spawn(),null);
const target=new EventTarget(); const input=new Input(null,{target,documentTarget:new EventTarget()});input.setEnabled(true);
const key=(type,code,repeat=false)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{code,repeat});target.dispatchEvent(e);return e;};
key('keydown','KeyW');assert.equal(key('keydown','Space').defaultPrevented,true);assert.equal(input.consumeDash(),true);
input.setEnabled(false);input.setEnabled(true);key('keydown','KeyW',true);assert.equal(input.getDirection().length(),0);
key('keyup','KeyW');key('keydown','KeyW');for(const code of ['ShiftLeft','ShiftRight']){key('keydown',code);assert.equal(input.consumeDash(),false);}
const session=new SessionState();assert.ok(session.paused);session.play();session.escape();assert.equal(session.mode,'PAUSED');session.controls();session.escape();assert.equal(session.mode,'PAUSED');session.confirmMenu();session.escape();assert.equal(session.mode,'PAUSED');session.escape();assert.equal(session.mode,'PLAYING');
// Exerce a mesma porta usada pelo RAF, sem criar um segundo loop de jogo.
const game=Object.create(Game.prototype);Object.assign(game,{session,disposed:false,preparation:prep,customerSystem:customers,world,input,
 interactionSystem:{activeStation:null,update(){},},});
globalThis.document={hidden:false};
session.pause();
const snapshot=()=>JSON.stringify({player:world.player.group.position.toArray(),phase:world.player.elapsedTime,
 rice:cookers.map(s=>[s.state,s.elapsed,s.effects.phase]),cut:[...prep.cuttingSystems.values()].map(s=>[s.cuts,s.strokeElapsed]),
 assemblies:assemblies.map(s=>[s.state,s.completionRemaining]),customers:[...customers.customers.values()].map(s=>[s.elapsed,s.model.position.toArray()]),
 clock:customers.clock,orders:customers.orderSystem.getActiveOrders()});
const before=snapshot();for(let i=0;i<120;i++)game.updateSimulation(1);assert.equal(snapshot(),before);
session.play();input.reset();game.updateSimulation(.01);assert.notEqual(snapshot(),before);
delete globalThis.document;
input.dispose();prep.dispose();customers.dispose();carry.dispose();factory.dispose();sushiFactory.dispose();world.dispose();
console.log('OK: balanceamento, quatro panelas independentes 6s/20s, três cortes de três golpes, três montagens/receitas independentes, cancelamento, chegadas 10s/20s/capacidade 2, Space, Shift desativado e pausa central sem avanço.');
