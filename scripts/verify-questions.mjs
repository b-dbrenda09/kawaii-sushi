import assert from 'node:assert/strict';
import { Scene } from '../src/game/Scene.js';
import { Camera } from '../src/game/Camera.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { Input } from '../src/game/Input.js';
import { PLAYER_CONTROLS } from '../src/game/PlayerControls.js';
import { PreparationSystem } from '../src/game/PreparationSystem.js';
import { CustomerSystem } from '../src/game/CustomerSystem.js';
import { ScoreSystem } from '../src/game/ScoreSystem.js';
import { SessionState } from '../src/game/SessionState.js';
import { GameTimer } from '../src/game/GameTimer.js';
import { Game } from '../src/game/Game.js';
import { DeliverySystem } from '../src/game/DeliverySystem.js';
import { QuestionBank, QUESTIONS } from '../src/game/QuestionBank.js';
import { QuestionSystem } from '../src/game/QuestionSystem.js';
import { FireSystem } from '../src/game/FireSystem.js';
import { RECIPES } from '../src/game/RecipeSystem.js';

assert.ok(QUESTIONS.length >= 3 && QUESTIONS.every(q => q.tema === 'a_definir'));
const invalid = { ...QUESTIONS[0], alternativas: ['a','b'] };
assert.throws(() => new QuestionBank([invalid]));
assert.throws(() => new QuestionBank([QUESTIONS[0], QUESTIONS[0]]));
assert.throws(() => new QuestionBank([{ ...QUESTIONS[0], respostaCorreta: 4 }]));
const bag = new QuestionBank(QUESTIONS, { random: () => 0 });
assert.equal(new Set(QUESTIONS.map(() => bag.next().id)).size, QUESTIONS.length);
assert.equal(new QuestionBank([]).next(), null);

const savedDocument = globalThis.document; globalThis.document = { hidden: false, createElement: () => ({ getContext: () => null }) };
try {
  for (const mode of ['solo', 'coop']) {
    const world = new Scene({ gameMode: mode }), collision = new CollisionSystem({ bounds: world.collisionBounds });
    world.collisionObstacles.forEach(o => collision.registerObstacle(o));
    world.players.forEach(p => { p.collisionSystem = collision; }); collision.players = world.players;
    const factory = new IngredientFactory(), sushi = new SushiFactory(), target = new EventTarget();
    const contexts = world.players.map((player, i) => {
      const carrySystem = new CarrySystem({ player, stations: world.kitchen.stations, factory });
      const input = new Input(null, { player, target, documentTarget: new EventTarget(), controls: mode === 'solo' ? PLAYER_CONTROLS.solo : i ? PLAYER_CONTROLS.p2 : PLAYER_CONTROLS.p1 });
      const interactionSystem = new InteractionSystem({ stations: world.kitchen.stations.values(), collisionSystem: collision, carrySystem });
      return { player, carrySystem, input, interactionSystem };
    });
    const prep = new PreparationSystem({ stations: world.kitchen.stations, carrySystem: contexts[0].carrySystem, factory, sushiFactory: sushi });
    const customers = new CustomerSystem({ scene: world.scene, architecture: world.architecture, delivery: world.kitchen.stations.get('delivery'),
      firstArrival: 9999, maxCustomers: 3 });
    customers.orderSystem.random = () => 0;
    const fire = new FireSystem({ stations: world.kitchen.stations, collisionSystem: collision });
    const session = new SessionState(() => {
      if (session.paused) fire.stopAllSpraying();
      contexts.forEach(c => { c.input.setEnabled(!session.paused); if (!session.paused) c.player.stopMoving(); });
    });
    let now = 0, happy = 0, sad = 0;
    const questions = new QuestionSystem({ session, now: () => now, bank: new QuestionBank(QUESTIONS, { random: () => 0 }) });
    const score = new ScoreSystem();
    const canChange = operation => session.mode === 'PLAYING' || (operation === 'question' && session.mode === 'QUESTION' && questions.active?.phase === 'RESOLVING');
    score.canChange = canChange; customers.orderSystem.canChange = canChange;
    const delivery = new DeliverySystem({ station: world.kitchen.stations.get('delivery'), carrySystem: contexts[0].carrySystem,
      customerSystem: customers, scoreSystem: score, questionSystem: questions,
      sound: { playComplete() { happy++; }, playError() { sad++; } }, isPaused: () => session.paused });
    const game = Object.create(Game.prototype);
    Object.assign(game, { world, disposed: false, session, players: contexts, preparation: prep, fireSystem: fire, questionSystem: questions,
      deliverySystem: delivery, customerSystem: customers, gameTimer: new GameTimer(), resultsUI: { update() {} } });
    const camera = new Camera(1440,1000,world.bounds.clone().union(customers.bounds));
    const projection = camera.camera.projectionMatrix.toArray();
    session.play();
    const actor = contexts.at(-1), otherId = actor.player.id === 'player' ? 'p2' : 'player';
    const frame = () => game.updateSimulation(1/60);
    const customerAtCounter = () => {
      const customer = customers.spawn(); assert.ok(customer);
      for (let t=0; !customer.orderId && t<40; t+=.05) customers.update(.05);
      assert.ok(customer.arrivalComplete); return customer;
    };
    const freeze = () => JSON.stringify({ timer:game.gameTimer.remaining,fire:fire.time,trail:fire.pendingSpread?.endsAt,
      orders:customers.orderSystem.getActiveOrders().map(o=>o.remainingTime),positions:world.players.map(p=>p.group.position.toArray()),
      cookers:[...prep.riceCookers.values()].map(c=>[c.state,c.elapsed]),customers:[...customers.customers.values()].map(c=>c.elapsed) });
    for (const correct of [false, false, true]) {
      const customer = customerAtCounter(), order = customers.orderSystem.getActiveOrder(customer.id);
      // Keep the existing time bonus at zero to exercise the user's -100 + 100 + 50 example.
      order.maxPatience = 1000; order.remainingTime = 1;
      actor.carrySystem.attach(sushi.create(RECIPES[0]));
      const dish = actor.carrySystem.carriedIngredient;
      actor.player.group.position.copy(delivery.station.getApproachPosition()); actor.player.stopMoving();
      if (!fire.fires.size) fire.ignite(world.kitchen.stations.get('cutting'));
      delivery.update(1);
      target.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{code:actor.input.controls.interact}));
      const before = score.score;
      frame();
      assert.equal(session.mode,'QUESTION'); assert.equal(questions.active.playerId,actor.player.id);
      assert.equal(score.score,before); assert.equal(order.state,'PENDING'); assert.equal(dish.disposed,false);
      assert.ok(dish.deliveryReservation && order.deliveryReservation); assert.equal(actor.carrySystem.discard().success,false);
      assert.equal(world.players.length,mode==='coop'?2:1); assert.ok(contexts.every(c=>!c.input.enabled));
      const frozen = freeze(); for(let i=0;i<10;i++)game.updateSimulation(5); assert.equal(freeze(),frozen);
      session.escape(); session.play(); session.settings(); session.openRecipeBook(); assert.equal(session.mode,'QUESTION');
      assert.equal(questions.open({playerId:otherId,resolve(){}}),null);
      assert.equal(delivery.interact(actor.carrySystem).success,false);
      assert.equal(questions.confirm(actor.player.id),null); assert.equal(score.score,before);
      assert.equal(questions.select(0,otherId),false); assert.equal(questions.confirm(otherId),null);
      // The other player's describe call cannot redirect the reserved inventory.
      delivery.describe(contexts[0].carrySystem);
      const selected=(questions.active.question.respostaCorreta+(correct?0:1))%4;
      assert.ok(questions.select(selected,actor.player.id));
      const result = questions.confirm(actor.player.id); assert.ok(result.success);
      assert.equal(result.correct,correct); assert.equal(result.points,correct?150:-50);
      assert.equal(score.score,before+(correct?150:-50)); assert.equal(dish.disposed,true); assert.equal(actor.carrySystem.carriedIngredient,null);
      assert.equal(order.state,correct?'COMPLETED':'REJECTED'); assert.equal(customer.serviceResult,order.state);
      assert.equal(dish.deliveryReservation,undefined); assert.equal(order.deliveryReservation,undefined);
      for(let i=0;i<20;i++) { assert.equal(questions.confirm(actor.player.id),null); assert.equal(score.answer(order,correct),0); }
      assert.equal(score.score,before+(correct?150:-50));
      assert.equal(questions.active.phase,'RESULT'); const resultFrozen=freeze(); game.updateSimulation(10); assert.equal(freeze(),resultFrozen);
      now+=1.499;questions.update();assert.equal(session.mode,'QUESTION');now+=.002;questions.update();assert.equal(session.mode,'PLAYING');
      assert.ok(contexts.every(c=>c.input.enabled)); assert.equal(questions.active,null);
      assert.equal(score.answer(order,correct),0, 'Resolved orders cannot pay or charge again after resuming');
      for(let t=0;customer.state!=='REMOVED'&&t<40;t+=.05)customers.update(.05);
      assert.equal(customer.state,'REMOVED'); assert.ok(customer.model.position.distanceTo(customers.entry)<1e-5);
      assert.equal(customer.slot.customerId,null);
    }
    assert.equal(score.score,50); assert.equal(happy,1); assert.equal(sad,2);
    assert.deepEqual(camera.camera.projectionMatrix.toArray(),projection);

    const customer = customerAtCounter(), order = customers.orderSystem.getActiveOrder(customer.id);
    actor.carrySystem.attach(sushi.create(RECIPES[0])); const dish = actor.carrySystem.carriedIngredient;
    const availableBank = questions.bank; questions.bank = new QuestionBank([]); delivery.update(1);
    assert.equal(delivery.interact(actor.carrySystem).success,false); assert.equal(session.mode,'PLAYING');
    assert.equal(dish.deliveryReservation,undefined); assert.equal(order.deliveryReservation,undefined);
    questions.bank = availableBank;
    delivery.update(1); assert.ok(delivery.interact(actor.carrySystem).success);
    // Forced external invalidation is rejected without a second charge or an item disappearing.
    order.state='EXPIRED';questions.select(0,actor.player.id); const failed=questions.confirm(actor.player.id);
    assert.equal(failed.success,false);assert.equal(score.score,50);assert.equal(dish.disposed,false);assert.equal(dish.deliveryReservation,undefined);
    questions.cancel(); actor.carrySystem.discard();
    // A pending dialog teardown releases reservations and never settles a delivery.
    order.state='PENDING';customer.serviceResult=null; actor.carrySystem.attach(sushi.create(RECIPES[0]));delivery.update(1);
    assert.ok(delivery.interact(actor.carrySystem).success);const reserved=actor.carrySystem.carriedIngredient;
    delivery.dispose();assert.equal(questions.active,null);assert.equal(reserved.deliveryReservation,undefined);assert.equal(order.deliveryReservation,undefined);
    assert.equal(score.score,50);
    contexts.forEach(c=>{c.input.dispose();c.interactionSystem.dispose();c.carrySystem.dispose();});
    prep.dispose();fire.dispose();customers.dispose();sushi.dispose();factory.dispose();collision.dispose();world.dispose();
  }
} finally {
  if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;
}
console.log('OK: demo bank/schema, valid-delivery reservation, owner-only selection, quiz before score, +base/+50 or -50 once, -50/-100/50, 1.5s result, global pause, rejected/successful exit, invalidation, cleanup and solo/coop.');
