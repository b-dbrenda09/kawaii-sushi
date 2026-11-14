import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { answerDelivery } from './answer-delivery.mjs';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { Input } from '../src/game/Input.js';
import { PLAYER_CONTROLS } from '../src/game/PlayerControls.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { PreparationSystem } from '../src/game/PreparationSystem.js';
import { Game } from '../src/game/Game.js';
import { GameTimer } from '../src/game/GameTimer.js';
import { SessionState } from '../src/game/SessionState.js';
import { RECIPES } from '../src/game/RecipeSystem.js';
import { DeliverySystem } from '../src/game/DeliverySystem.js';
import { OrderSystem } from '../src/game/OrderSystem.js';
import { ScoreSystem } from '../src/game/ScoreSystem.js';

const target = new EventTarget(), documentTarget = new EventTarget();
const key = (type, code, extra={}) => { const e=new Event(type,{cancelable:true}); Object.assign(e,{code,...extra}); target.dispatchEvent(e); return e; };
for (const mode of ['solo','coop']) {
 const world=new Scene({gameMode:mode}); assert.equal(world.players.length,mode==='solo'?1:2);
 assert.equal(Boolean(world.scene.getObjectByName('dear-daniel')),mode==='coop');
 const collision=new CollisionSystem({bounds:world.collisionBounds}); world.collisionObstacles.forEach(o=>collision.registerObstacle(o)); collision.players=world.players;
 const factory=new IngredientFactory(), sushiFactory=new SushiFactory();
 const players=world.players.map((player,i)=>{
  player.collisionSystem=collision;
  const input=new Input(null,{target,documentTarget,player,controls:mode==='solo'?PLAYER_CONTROLS.solo:i===0?PLAYER_CONTROLS.p1:PLAYER_CONTROLS.p2}); input.setEnabled(true);
  return {player,input,carrySystem:new CarrySystem({player,stations:world.kitchen.stations,factory}),interactionSystem:{update(){}}};
 });
 const prep=new PreparationSystem({stations:world.kitchen.stations,carrySystem:players[0].carrySystem,factory,sushiFactory});
 const orders=new OrderSystem(), score=new ScoreSystem(), customers=new Map();
 const delivery=new DeliverySystem({station:world.kitchen.stations.get('delivery'),carrySystem:players[0].carrySystem,
  customerSystem:{orderSystem:orders,customers},scoreSystem:score,sound:{playComplete(){},playError(){}},isPaused:()=>false});
 key('keydown','ArrowRight'); assert.equal(players[0].input.getDirection().x,mode==='solo'?1:0);
 if(mode==='coop') { assert.equal(players[1].input.getDirection().x,1); key('keydown','KeyA'); assert.equal(players[0].input.getDirection().x,-1); assert.equal(players[1].input.getDirection().x,1); }
 players.forEach(c=>c.input.reset());
 key('keydown','KeyW'); key('keydown','Space'); assert.equal(players[0].input.consumeDash(),true); key('keydown','KeyE'); assert.equal(players[0].input.consumeInteraction(),true);
 if(mode==='coop') {
  const p2=players[1].input;
  assert.equal(p2.consumeInteraction(),false);
  key('keydown','Enter'); assert.equal(p2.consumeInteraction(),false);
  key('keydown','ArrowDown'); key('keydown','ShiftRight');
  assert.equal(p2.consumeDash(),true); assert.equal(p2.consumeInteraction(),false);
  key('keyup','ShiftRight'); key('keydown','KeyP');
  assert.equal(p2.consumeInteraction(),true); assert.equal(p2.consumeDash(),false);
  assert.equal(players[0].input.consumeInteraction(),false);
  key('keydown','ControlRight',{ctrlKey:true}); assert.equal(p2.isCancelHeld(),true);
 }
 players.forEach(c=>c.input.reset());
 const cooker=prep.riceCookers.values().next().value, cut=prep.cuttingSystems.values().next().value, assembly=prep.assemblySystems.values().next().value;
 for(const recipe of RECIPES) {
  for(let i=0;i<recipe.sequence.length;i++) {
   const carry=players[i%players.length].carrySystem, state=recipe.sequence[i];
   if(state==='rice_cooked') { carry.attach(factory.create('rice')); assert.equal(cooker.interact(carry).success,true); cooker.interact(carry); cooker.update(cooker.cookDuration); assert.equal(cooker.interact(carry).success,true); }
   else if(state==='salmon_cut'||state==='cucumber_cut') {
    carry.attach(factory.create(state==='salmon_cut'?'salmon':'cucumber')); assert.equal(cut.interact(carry).success,true);
    for(let n=0;n<cut.requiredCuts;n++) { assert.equal(cut.interact(carry).success,true); if(players.length===2) { const other=players.find(c=>c.carrySystem!==carry); const old=other.player.group.position.clone(); other.player.update(.05,new Vector3(0,0,1)); assert.ok(other.player.group.position.distanceTo(old)>0); assert.equal(cut.interact(other.carrySystem).success,false); } cut.update(cut.strokeDuration); }
    assert.equal(cut.interact(carry).success,true);
   } else carry.attach(factory.create('nori'));
   assert.equal(carry.carriedIngredient.ownerId,carry.player.id); assert.equal(assembly.interact(carry).success,true); assert.equal(carry.carriedIngredient,null);
  }
  const first=players.at(-1).carrySystem; assert.equal(assembly.dish.recipeId,recipe.id); assert.equal(assembly.interact(first).success,true);
  if(players.length===2) {
   const other=players[0].carrySystem;
   assert.equal(assembly.interact(other).kind,'take-preparation');
   assert.equal(other.carriedIngredient.ingredients.length,0,'A segunda interação pega apenas um prato vazio, nunca duplica o sushi retirado.');
   assert.notEqual(other.carriedIngredient.instanceId,first.carriedIngredient.instanceId);
   other.discard();
  }
  orders.random=()=>RECIPES.indexOf(recipe)/RECIPES.length;
  const customer={id:recipe.id,state:'WAITING',arrivalComplete:true}; customers.set(customer.id,customer);
  const order=orders.createForCustomer(customer), previousScore=score.score;
  // A descrição de P1 não pode trocar o inventário usado na entrega de P2.
  delivery.describe(players[0].carrySystem);
  delivery.update(1); assert.equal(delivery.interact(first).success,true);
  answerDelivery(delivery);
  assert.equal(order.state,'COMPLETED'); assert.ok(score.score>previousScore);
  assert.equal(first.carriedIngredient,null); assert.equal(delivery.interact(first).success,false);
 }
 if(mode==='coop') {
  const [a,b]=world.players; a.stopMoving();b.stopMoving();a.group.position.set(0,0,5.7);b.group.position.set(0,0,7.2);
  for(let i=0;i<100;i++) { a.update(.05,new Vector3(0,0,1),i===0); b.update(.05,new Vector3(0,0,-1),i===0); assert.ok(a.group.position.distanceTo(b.group.position)>=a.collider.radius+b.collider.radius-1e-7); }
  assert.ok(a.group.position.z<b.group.position.z);
 }
 const session=new SessionState(), timer=new GameTimer(); const previous=globalThis.document;globalThis.document={hidden:false};
 const game=Object.assign(Object.create(Game.prototype),{world,players,session,gameTimer:timer,resultsUI:{update(){}},preparation:prep,customerSystem:{update(){}},disposed:false});
 game.updateSimulation(1);assert.equal(timer.remaining,300);session.play();game.updateSimulation(.05);assert.equal(timer.remaining,299.95);session.pause();game.updateSimulation(10);assert.equal(timer.remaining,299.95);
 globalThis.document=previous;
 players.forEach(c=>c.input.dispose()); key('keydown','KeyW'); players.forEach(c=>assert.equal(c.input.keys.size,0));
 delivery.dispose();orders.dispose();prep.dispose();players.forEach(c=>c.carrySystem.dispose());factory.dispose();sushiFactory.dispose();collision.dispose();world.dispose();
}
console.log('OK: solo e dupla, modelos, perfis exclusivos, ações simultâneas, três receitas com preparo real e colaboração, corte individual, retirada única, inventários, colisão e dash entre jogadores, pausa/tempo e descarte de controles.');
