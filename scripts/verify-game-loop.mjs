import assert from 'node:assert/strict';
import { Scene } from '../src/game/Scene.js';
import { Camera } from '../src/game/Camera.js';
import { Game } from '../src/game/Game.js';
import { Input } from '../src/game/Input.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { CustomerSystem } from '../src/game/CustomerSystem.js';
import { PreparationSystem } from '../src/game/PreparationSystem.js';
import { SessionState } from '../src/game/SessionState.js';
import config from '../vite.config.js';

assert.equal(config.server.watch.usePolling, process.platform === 'win32');
const world=new Scene(), collision=new CollisionSystem({bounds:world.collisionBounds});
world.collisionObstacles.forEach(o=>collision.registerObstacle(o));world.player.collisionSystem=collision;
world.player.group.position.set(-3,0,2.4);
const factory=new IngredientFactory(), sushiFactory=new SushiFactory();
const carry=new CarrySystem({player:world.player,stations:world.kitchen.stations,factory});
const prep=new PreparationSystem({stations:world.kitchen.stations,carrySystem:carry,factory,sushiFactory});
const customers=new CustomerSystem({scene:world.scene,delivery:world.kitchen.stations.get('delivery'),firstArrival:0});
const target=new EventTarget(), input=new Input(null,{target,documentTarget:new EventTarget()});
const session=new SessionState(()=>input.setEnabled(!session.paused));session.play();
const interaction=new InteractionSystem({stations:world.kitchen.stations.values(),collisionSystem:collision,carrySystem:carry});
const failure=new TypeError("Cannot read properties of undefined (reading 'matrixWorldInverse')");
let renders=0, scheduled=0, uiCalls=0;const reported=[];
const previousDocument=globalThis.document, previousRAF=globalThis.requestAnimationFrame, previousError=console.error;
globalThis.document={hidden:false};globalThis.requestAnimationFrame=()=>++scheduled;console.error=(...args)=>reported.push(args);
const game=Object.create(Game.prototype);
Object.assign(game,{running:true,disposed:false,previousTime:null,session,input,world,preparation:prep,customerSystem:customers,orderSystem:customers.orderSystem,
 collisionSystem:collision,interactionSystem:interaction,camera:new Camera(1280,800,world.bounds),
 renderer:{render(){renders++;}},orderUI:{update(){uiCalls++;throw failure;}}});
try {
  const key=new Event('keydown',{cancelable:true});Object.assign(key,{code:'KeyD'});target.dispatchEvent(key);
  const start=world.player.group.position.x;
  for(let frame=0;frame<30;frame++)game.tick(frame*1000/60);
  assert.ok(world.player.group.position.x>start+.2,'Player continua andando mesmo se a apresentação falhar.');
  assert.equal(renders,30);assert.equal(scheduled,30);assert.equal(uiCalls,30);
  assert.equal(reported.length,1,'Falha repetida é registrada uma vez, sem inundar o console.');
  assert.equal(reported[0][1],failure);assert.match(reported[0][0],/Falha no HUD/);
  assert.equal(session.mode,'PLAYING');assert.equal(input.enabled,true);assert.equal(input.keys.has('KeyD'),true);
  game.orderUI.update=()=>uiCalls++;game.tick(500);assert.equal(game.orderUIError,null);
  session.pause();const frozen=world.player.group.position.clone(), clock=customers.clock;
  game.tick(1000);assert.ok(world.player.group.position.equals(frozen));assert.equal(customers.clock,clock);
  session.play();game.tick(1100);assert.equal(renders,33);
  const otherFailure=new Error('Outra falha visual identificável');game.orderUI.update=()=>{throw otherFailure;};game.tick(1116);
  assert.equal(reported.length,2);assert.equal(reported[1][1],otherFailure);
  game.running=false;const before=scheduled;game.tick(1132);assert.equal(scheduled,before);
} finally {
  console.error=previousError;
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  if(previousRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previousRAF;
  input.dispose();interaction.dispose();prep.dispose();customers.dispose();carry.dispose();factory.dispose();sushiFactory.dispose();collision.dispose();world.dispose();
}
console.log('OK: exceção real de projeção simulada não encerra RAF, render, Player ou Input; erro reportado explicitamente sem repetição; pausa e watcher preservados.');
