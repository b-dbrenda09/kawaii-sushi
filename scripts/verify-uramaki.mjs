import assert from 'node:assert/strict';
import { Scene } from '../src/game/Scene.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { PreparationSystem } from '../src/game/PreparationSystem.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { Input } from '../src/game/Input.js';
import { RecipeSystem } from '../src/game/RecipeSystem.js';
import { CustomerSystem } from '../src/game/CustomerSystem.js';
import { ScoreSystem } from '../src/game/ScoreSystem.js';
import { DeliverySystem } from '../src/game/DeliverySystem.js';

const permutations = values => values.length ? values.flatMap((value, i) =>
  permutations(values.filter((_, index) => index !== i)).map(rest => [value, ...rest])) : [[]];
const orders = permutations(['nori_sheet', 'rice_cooked', 'cucumber_cut']);
const recipes = new RecipeSystem();
assert.deepEqual(recipes.analyze(['nori_sheet', 'rice_cooked']).possible.map(r => r.id), ['salmon_maki', 'cucumber_uramaki']);
assert.equal(recipes.analyze(['nori_sheet', 'rice_cooked']).complete, null);
assert.deepEqual(recipes.analyze(['nori_sheet', 'rice_cooked']).next, ['salmon_cut', 'cucumber_cut']);
for (const order of orders) {
  for (let i = 0; i < order.length; i++) assert.equal(recipes.analyze(order.slice(0, i)).complete, null);
  assert.equal(recipes.analyze(order).complete.id, 'cucumber_uramaki');
  assert.equal(recipes.analyze([...order, order[0]]).possible.length, 0);
}

const world = new Scene(), stations = world.kitchen.stations;
const factory = new IngredientFactory(), sushi = new SushiFactory();
const carry = new CarrySystem({ player: world.player, stations, factory });
const prep = new PreparationSystem({ stations, carrySystem: carry, factory, sushiFactory: sushi });
const collision = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach(o => collision.registerObstacle(o)); world.player.collisionSystem = collision;
const target = new EventTarget(), input = new Input(null, { target, documentTarget: new EventTarget() }); input.setEnabled(true);
const interaction = new InteractionSystem({ stations: stations.values(), collisionSystem: collision, carrySystem: carry });
const customers = new CustomerSystem({ scene: world.scene, delivery: stations.get('delivery'), firstArrival: 9999 });
customers.orderSystem.random = () => .99;
const customer = customers.spawn(); for (let i = 0; i < 300; i++) customers.update(.05);
const pending = customers.orderSystem.getActiveOrder(customer.id); assert.equal(pending.recipeId, 'cucumber_uramaki');
const score = new ScoreSystem();
const delivery = new DeliverySystem({ station: stations.get('delivery'), carrySystem: carry, customerSystem: customers,
  scoreSystem: score, sound: { playComplete() {}, playError() {} }, isPaused: () => false });
const key = (type, repeat = false) => { const event = new Event(type, { cancelable: true }); Object.assign(event, { code: 'KeyE', repeat }); target.dispatchEvent(event); };
function press(station) {
  world.player.stopMoving(); world.player.group.position.copy(station.getApproachPosition()); interaction.reset();
  key('keydown'); const result = interaction.update(.02, world.player, { interactPressed: input.consumeInteraction() });
  key('keydown', true); assert.equal(input.consumeInteraction(), false); key('keyup');
  return result;
}
const types = { nori_sheet: 'nori', rice_cooked: 'rice', cucumber_cut: 'cucumber' };
try {
  let count = 0;
  for (const assembly of prep.assemblySystems.values()) {
    for (const sequence of orders) {
      for (let i = 0; i < sequence.length; i++) {
        const state = sequence[i];
        if (state === 'cucumber_cut') {
          const cutting = prep.cuttingSystems.values().next().value;
          carry.attach(factory.create('cucumber')); assert.equal(press(cutting.station).success, true);
          for (let stroke = 0; stroke < cutting.requiredCuts; stroke++) {
            assert.equal(press(cutting.station).success, true); cutting.update(cutting.strokeDuration);
          }
          assert.equal(press(cutting.station).success, true);
          assert.equal(carry.carriedIngredient.state, 'cucumber_cut');
          assert.equal(carry.carriedIngredient.type, 'cucumber');
        } else carry.attach(factory.create(types[state], state));
        const held = carry.carriedIngredient;
        assert.equal(held.model.parent, world.player.carryAnchor);
        const result = press(assembly.station); assert.equal(result.success, true);
        assert.equal(carry.carriedIngredient, null);
        if (i < 2) {
          assert.equal(assembly.state, 'ASSEMBLING'); assert.equal(held.disposed, false);
          for (const [type, invalidState] of [[types[state], state], ['cucumber', 'cucumber_whole'], ['rice', 'rice_burnt'], ['salmon', 'salmon_raw']]) {
            carry.attach(factory.create(type, invalidState)); const invalid = carry.carriedIngredient;
            const before = [...assembly.sequence];
            assert.equal(press(assembly.station).success, false);
            assert.equal(carry.carriedIngredient, invalid); assert.equal(invalid.disposed, false);
            assert.deepEqual(assembly.sequence, before); carry.discard();
          }
        }
      }
      assert.equal(assembly.state, 'READY'); assert.equal(assembly.dish.recipeId, 'cucumber_uramaki');
      assert.equal(press(assembly.station).kind, 'take-sushi');
      const dish = carry.carriedIngredient;
      if (count++ === 0) {
        assert.equal(press(stations.get('delivery')).kind, 'delivery');
        assert.equal(pending.state, 'COMPLETED'); assert.equal(dish.disposed, true); assert.ok(score.score >= 120);
      } else carry.discard();
      assert.equal(assembly.state, 'EMPTY'); assert.equal(assembly.ingredients.length, 0);
    }
  }
  assert.equal(count, orders.length * prep.assemblySystems.size);
  assert.equal(factory.instances.size, 0); assert.equal(sushi.instances.size, 0);
  console.log(`OK: ${count} montagens, seis ordens em cada bancada, pepino cortado de verdade, E sem repeticao, transporte, ambiguidades, duplicados/crus sem consumo, entrega e pontos.`);
} finally {
  delivery.dispose(); customers.dispose(); input.dispose(); interaction.dispose(); prep.dispose(); carry.dispose(); factory.dispose(); sushi.dispose(); collision.dispose(); world.dispose();
}
