import assert from 'node:assert/strict';
import { Scene } from '../src/game/Scene.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { PreparationSystem } from '../src/game/PreparationSystem.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { Input } from '../src/game/Input.js';
import { PLAYER_CONTROLS } from '../src/game/PlayerControls.js';
import { Station } from '../src/game/Station.js';
import { RECIPES } from '../src/game/RecipeSystem.js';
import { CustomerSystem } from '../src/game/CustomerSystem.js';
import { DeliverySystem } from '../src/game/DeliverySystem.js';
import { ScoreSystem } from '../src/game/ScoreSystem.js';
import { answerDelivery } from './answer-delivery.mjs';

const world = new Scene({ gameMode: 'coop' }), stations = world.kitchen.stations;
const factory = new IngredientFactory(), sushi = new SushiFactory();
const carries = world.players.map(player => new CarrySystem({ player, stations, factory }));
const prep = new PreparationSystem({ stations, carrySystem: carries[0], factory, sushiFactory: sushi });
const assembly = [...prep.assemblySystems.values()];
const [board, otherBoard] = [...prep.cuttingSystems.values()];
const collision = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach(obstacle => collision.registerObstacle(obstacle));
const target = new EventTarget();
const inputs = world.players.map((player, index) => {
  const input = new Input(null, { target, documentTarget: new EventTarget(), player, controls: PLAYER_CONTROLS[index ? 'p2' : 'p1'] });
  input.setEnabled(true); return input;
});
const interactions = carries.map(carrySystem => new InteractionSystem({ stations: stations.values(), collisionSystem: collision, carrySystem }));
const loose = new Station({ id: 'transport-test-counter', type: 'assembly', position: [0, 0], width: 2, depth: 2, height: 1 });
loose.configureStorage({ position: [0, 1, 0], width: 1, depth: 1 });
stations.set(loose.id, loose);
const key = (index, type) => {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code: PLAYER_CONTROLS[index ? 'p2' : 'p1'].interact }); target.dispatchEvent(event);
};
const frame = (index, dt = .05) => interactions[index].update(dt, world.players[index], {
  interactPressed: inputs[index].consumeInteraction(), interactHeld: inputs[index].isInteractionHeld(),
  interactionEpoch: inputs[index].interactionEpoch,
});
function approach(index, station) {
  inputs[index].reset(); interactions[index].reset();
  world.players[index].stopMoving(); world.players[index].group.position.copy(station.getApproachPosition());
}
function tap(index, station) {
  approach(index, station); key(index, 'keydown');
  const first = frame(index); key(index, 'keyup'); return frame(index) ?? first;
}
function holdCut(index, system) {
  approach(index, system.station); key(index, 'keydown'); assert.equal(frame(index), null);
  let result;
  for (let i = 0; i < 6; i++) result = frame(index) ?? result;
  key(index, 'keyup'); assert.equal(result?.kind, 'cut-stroke');
  system.update(system.strokeDuration);
}
const make = state => factory.create({ salmon_raw: 'salmon', salmon_cut: 'salmon', cucumber_whole: 'cucumber',
  cucumber_cut: 'cucumber', rice_cooked: 'rice', rice_raw: 'rice', nori_sheet: 'nori' }[state], state);

try {
  // Raw/prepared ingredients keep their exact identity through repeated moves by either player.
  for (const state of ['salmon_raw', 'salmon_cut', 'rice_raw', 'cucumber_cut']) {
    const item = make(state); carries[0].attach(item);
    for (let i = 0; i < 8; i++) {
      const from = i % 2, to = 1 - from, station = state.endsWith('_cut') ? loose : assembly[i % assembly.length].station;
      assert.ok(carries[from].interact(station).success);
      assert.equal(carries[from].carriedIngredient, null);
      assert.ok(carries[to].interact(station).success);
      assert.ok(carries[to].carriedIngredient === item);
      assert.equal(item.state, state); assert.equal(item.model.parent, carries[to].player.carryAnchor);
      assert.equal(station.storedIngredient, null);
    }
    carries[0].discard(); assert.equal(item.disposed, true);
  }

  // Both actual E/P profiles use tap to retrieve and hold to cut; progress follows the ingredient.
  for (const index of [0, 1]) {
    const item = make('salmon_raw'); carries[index].attach(item);
    assert.equal(tap(index, board.station).kind, 'load-cutting');
    assert.equal(tap(index, board.station).kind, 'take-cut-ingredient');
    assert.ok(carries[index].carriedIngredient === item);
    tap(index, board.station); holdCut(index, board);
    assert.equal(board.cuts, 1); assert.equal(item.model.userData.completedCuts, 1);
    // Losing focus or pausing while deciding between tap/hold never picks up or cuts.
    approach(index, board.station); key(index, 'keydown'); frame(index);
    inputs[index].reset(); assert.equal(frame(index), null);
    assert.ok(board.content === item); assert.equal(board.cuts, 1);
    const other = 1 - index;
    approach(index, board.station); approach(other, board.station);
    key(index, 'keydown'); key(other, 'keydown'); frame(index); frame(other);
    key(index, 'keyup'); assert.equal(frame(index).success, true);
    key(other, 'keyup'); assert.equal(frame(other), null, 'O segundo jogador não recupera uma cópia do mesmo objeto.');
    assert.equal(carries[other].carriedIngredient, null);
    assert.equal(board.content, null); assert.equal(board.boardAnchor.children.length, 0);
    assert.equal(carries[index].interact(assembly[0].station).success, true);
    assert.equal(carries[other].interact(assembly[0].station).success, true);
    assert.equal(tap(other, otherBoard.station).kind, 'load-cutting');
    assert.equal(otherBoard.cuts, 1);
    for (let cut = 1; cut < otherBoard.requiredCuts; cut++) holdCut(other, otherBoard);
    assert.equal(item.state, 'salmon_cut');
    assert.equal(tap(other, otherBoard.station).success, true);
    assert.ok(carries[other].carriedIngredient === item);
    // Completed ingredients may be parked on a board without restarting the cuts.
    assert.equal(tap(other, board.station).success, true); assert.equal(board.state, 'READY');
    assert.equal(tap(index, board.station).success, true);
    assert.ok(carries[index].carriedIngredient === item);
    assert.equal(tap(other, board.station).success, false);
    carries[index].discard();
  }

  // Every recipe can move between all assembly stations after every partial step.
  for (const recipe of RECIPES) {
    const ingredients = [];
    let index = 0, current = assembly[0];
    for (let step = 0; step < recipe.sequence.length; step++) {
      const ingredient = make(recipe.sequence[step]); ingredients.push(ingredient); carries[index].attach(ingredient);
      assert.ok(carries[index].interact(current.station).success);
      if (step === recipe.sequence.length - 1) break;
      const snapshot = [...current.sequence];
      assert.equal(carries[index].interact(current.station).kind, 'take-preparation');
      const plate = carries[index].carriedIngredient;
      assert.deepEqual(plate.sequence, snapshot); assert.equal(current.ingredients.length, 0);
      assert.equal(current.contents.children.length, 0);
      assert.equal(carries[index].interact(stations.get('noriBox')).success, false);
      assert.ok(carries[index].carriedIngredient === plate);
      assert.ok(carries[index].interact(loose).success);
      index = 1 - index;
      assert.ok(carries[index].interact(loose).success);
      assert.ok(carries[index].carriedIngredient === plate);
      assert.throws(() => carries[1 - index].attach(plate), /outro jogador/);
      const spare = sushi.createPreparation();
      assert.throws(() => carries[index].attach(spare), /dois/); spare.dispose();
      current = assembly[(step + 1) % assembly.length];
      assert.equal(carries[index].interact(current.station).kind, 'place-preparation');
      assert.deepEqual(current.sequence, snapshot);
      assert.ok(ingredients.every(item => !item.disposed));
    }
    const complete = current.dish;
    assert.equal(complete.recipeId, recipe.id); assert.ok(ingredients.every(item => item.disposed));
    assert.equal(factory.instances.size, 0);
    assert.equal(carries[index].interact(current.station).kind, 'take-sushi');
    for (const station of assembly.map(system => system.station)) {
      assert.ok(carries[index].interact(station).success);
      assert.equal(carries[index].carriedIngredient, null);
      index = 1 - index; assert.ok(carries[index].interact(station).success);
      assert.ok(carries[index].carriedIngredient === complete);
    }
    carries[index].discard(); assert.equal(sushi.instances.size, 0);
  }

  // Discard/cancel after moving also releases every nested ingredient exactly once.
  for (const cancel of [false, true]) {
    carries[0].attach(make('rice_cooked')); carries[0].interact(assembly[0].station);
    carries[0].interact(assembly[0].station);
    if (cancel) {
      carries[0].interact(assembly[1].station);
      assembly[1].update(0, { selected: true, cancelHeld: true });
      assembly[1].update(1, { selected: true, cancelHeld: true });
      assert.equal(assembly[1].state, 'EMPTY');
    } else carries[0].discard();
    assert.equal(factory.instances.size, 0); assert.equal(sushi.instances.size, 0);
  }

  // An explicit empty plate can be filled and finished on a plain counter as one object.
  assert.equal(carries[0].interact(assembly[0].station).kind, 'take-preparation');
  const plate = carries[0].carriedIngredient;
  carries[0].interact(loose);
  const rice = make('rice_cooked'); carries[1].attach(rice);
  assert.equal(carries[1].describe(loose).action, 'Adicionar ingrediente ao prato');
  assert.equal(carries[1].interact(loose).kind, 'add-ingredient');
  carries[0].interact(loose); assert.ok(carries[0].carriedIngredient === plate);
  carries[0].interact(assembly[1].station); carries[1].interact(assembly[1].station);
  assert.ok(carries[1].carriedIngredient === plate); assert.deepEqual(plate.sequence, ['rice_cooked']);
  carries[1].interact(loose);
  const wrong = make('rice_raw'); carries[0].attach(wrong);
  assert.equal(carries[0].interact(loose).success, false); assert.equal(carries[0].carriedIngredient, wrong);
  carries[0].discard(); carries[0].attach(make('salmon_cut'));
  assert.equal(carries[0].interact(loose).kind, 'finish-sushi');
  assert.ok(loose.storedIngredient === plate); assert.equal(plate.kind, 'sushi');
  carries[1].interact(loose); assert.ok(carries[1].carriedIngredient === plate);
  assert.equal(plate.recipeId, 'salmon_nigiri'); assert.equal(rice.disposed, true);

  // Transported completed plate still uses the unchanged Cisco question and scoring transaction.
  const station = stations.get('delivery');
  const customers = new CustomerSystem({ scene: world.scene, delivery: station, firstArrival: 9999 });
  customers.orderSystem.random = () => 0;
  const customer = customers.spawn();
  for (let time = 0; !customer.orderId && time < 40; time += .05) customers.update(.05);
  const delivery = new DeliverySystem({ station, carrySystem: carries[1], customerSystem: customers,
    scoreSystem: new ScoreSystem(), sound: { playComplete() {}, playError() {} }, isPaused: () => false });
  assert.equal(delivery.interact(carries[1]).kind, 'delivery-question');
  assert.equal(answerDelivery(delivery).kind, 'delivery');
  assert.equal(plate.disposed, true); assert.equal(carries[1].carriedIngredient, null);
  delivery.dispose(); customers.dispose();
  assert.equal(factory.instances.size, 0); assert.equal(sushi.instances.size, 0);
  console.log('OK: E/P, crus/cortados, cortes persistentes entre tábuas, três receitas transportadas, prato vazio/parcial/completo, montagem após transporte, identidade única em dupla e entrega Cisco.');
} finally {
  interactions.forEach(system => system.dispose()); inputs.forEach(input => input.dispose());
  prep.dispose(); carries.forEach(carry => carry.dispose()); factory.dispose(); sushi.dispose(); world.dispose();
}
