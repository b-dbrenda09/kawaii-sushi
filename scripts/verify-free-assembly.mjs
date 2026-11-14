import assert from 'node:assert/strict';
import { Scene } from '../src/game/Scene.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { PreparationSystem } from '../src/game/PreparationSystem.js';
import { RecipeSystem, RECIPES } from '../src/game/RecipeSystem.js';
import { recipeIngredients } from '../src/game/RecipePresentation.js';
import { AssemblySystem } from '../src/game/AssemblySystem.js';
import { Station } from '../src/game/Station.js';
import { OrderSystem } from '../src/game/OrderSystem.js';
import { DeliverySystem } from '../src/game/DeliverySystem.js';
import { ScoreSystem } from '../src/game/ScoreSystem.js';
import { answerDelivery } from './answer-delivery.mjs';

const permutations = values => values.length ? values.flatMap((value, i) =>
  permutations(values.filter((_, index) => i !== index)).map(rest => [value, ...rest])) : [[]];
const types = { rice_cooked: 'rice', rice_raw: 'rice', rice_burnt: 'rice', salmon_cut: 'salmon', salmon_raw: 'salmon',
  cucumber_cut: 'cucumber', cucumber_whole: 'cucumber', nori_sheet: 'nori' };
const recipes = new RecipeSystem();
for (const recipe of RECIPES) for (const sequence of permutations(recipe.sequence)) {
  for (let size = 0; size < sequence.length; size++) {
    const analysis = recipes.analyze(sequence.slice(0, size), recipe.id);
    assert.equal(analysis.complete, null); assert.ok(analysis.possible.some(candidate => candidate.id === recipe.id));
    assert.ok(analysis.next.includes(sequence[size]));
  }
  assert.equal(recipes.analyze(sequence, recipe.id).complete.id, recipe.id);
  assert.ok(recipes.analyze(sequence).matches.some(candidate => candidate.id === recipe.id));
  assert.equal(recipes.analyze([...sequence, sequence[0]], recipe.id).possible.length, 0);
}
const repeated = { id: 'quantity-test', name: 'Teste de quantidades', model: 'nigiri', sequence: ['rice_cooked', 'rice_cooked', 'salmon_cut'] };
const repeatedRecipes = new RecipeSystem([repeated]);
for (const sequence of permutations(repeated.sequence)) assert.equal(repeatedRecipes.analyze(sequence).complete.id, repeated.id);
assert.equal(repeatedRecipes.analyze(['rice_cooked', 'salmon_cut']).complete, null);
assert.deepEqual(repeatedRecipes.analyze(['rice_cooked', 'salmon_cut']).next, ['rice_cooked']);
assert.equal(repeatedRecipes.analyze(['rice_cooked', 'rice_cooked', 'rice_cooked']).possible.length, 0);
assert.equal(repeatedRecipes.analyze(['rice_raw', 'rice_cooked', 'salmon_cut']).possible.length, 0);
assert.ok(recipeIngredients(repeated).includes('2 × arroz cozido'));

let completed = 0;
for (const mode of ['solo', 'coop']) {
  const world = new Scene({ gameMode: mode }), stations = world.kitchen.stations;
  const factory = new IngredientFactory(), sushi = new SushiFactory();
  const carries = world.players.map(player => new CarrySystem({ player, stations, factory }));
  const prep = new PreparationSystem({ stations, carrySystem: carries[0], factory, sushiFactory: sushi });
  const benches = [...prep.assemblySystems.values()];
  const orders = new OrderSystem(), customerMap = new Map(), score = new ScoreSystem();
  const delivery = new DeliverySystem({ station: stations.get('delivery'), carrySystem: carries[0],
    customerSystem: { orderSystem: orders, customers: customerMap }, scoreSystem: score,
    isPaused: () => false, sound: { playComplete() {}, playError() {} } });
  const make = state => factory.create(types[state], state);
  const reject = (system, carry, state, message) => {
    const item = make(state), sequence = [...system.sequence]; carry.attach(item);
    const response = carry.interact(system.station);
    assert.equal(response.success, false); if (message) assert.equal(response.message, message);
    assert.ok(carry.carriedIngredient === item); assert.equal(item.disposed, false);
    assert.deepEqual(system.sequence, sequence); carry.discard();
  };
  try {
    for (const [start, startingBench] of benches.entries()) for (const recipe of RECIPES) for (const sequence of permutations(recipe.sequence)) {
      let system = startingBench, actor = 0; const consumed = [];
      assert.equal(system.selectRecipe(recipe.id), true);
      reject(system, carries[actor], 'rice_raw');
      for (let index = 0; index < sequence.length; index++) {
        const item = make(sequence[index]); consumed.push(item); carries[actor].attach(item);
        const response = carries[actor].interact(system.station);
        assert.equal(response.kind, index === sequence.length - 1 ? 'finish-sushi' : 'add-ingredient', `${mode}/${recipe.id}/${sequence}`);
        if (index < sequence.length - 1) {
          assert.equal(system.state, 'ASSEMBLING'); assert.deepEqual(system.sequence, sequence.slice(0, index + 1));
          assert.equal(system.selectRecipe(RECIPES.find(other => other.id !== recipe.id).id), false);
          for (const bad of ['rice_raw', 'rice_burnt', 'salmon_raw', 'cucumber_whole', sequence[index]]) reject(system, carries[actor], bad);
          const incompatible = recipe.id === 'cucumber_uramaki' ? 'salmon_cut' : recipe.id === 'salmon_maki' ? 'cucumber_cut' : 'nori_sheet';
          reject(system, carries[actor], incompatible);
          assert.equal(carries[actor].interact(system.station).kind, 'take-preparation');
          const plate = carries[actor].carriedIngredient;
          assert.equal(plate.targetRecipeId, recipe.id); assert.deepEqual(plate.sequence, sequence.slice(0, index + 1));
          assert.ok(consumed.every(ingredient => !ingredient.disposed)); assert.equal(system.contents.children.length, 0);
          system = benches[(start + index + 1) % benches.length];
          assert.equal(carries[actor].interact(system.station).kind, 'place-preparation');
          assert.equal(system.targetRecipeId, recipe.id);
          actor = (actor + 1) % carries.length;
        }
      }
      assert.equal(system.state, 'READY'); assert.equal(system.dish.recipeId, recipe.id);
      assert.ok(consumed.every(item => item.disposed)); assert.equal(factory.instances.size, 0);
      const dish = system.dish;
      reject(system, carries[actor], 'rice_cooked', 'Este prato já está pronto!');
      assert.ok(system.dish === dish); assert.equal(system.selectRecipe(null), false);
      carries[actor].interact(system.station);
      for (const bench of benches) {
        assert.equal(carries[actor].interact(bench.station).kind, 'place-sushi');
        actor = (actor + 1) % carries.length;
        assert.equal(carries[actor].interact(bench.station).kind, 'take-sushi');
        assert.ok(carries[actor].carriedIngredient === dish);
        assert.equal(dish.kind, 'sushi'); assert.equal(dish.completionState, 'READY');
      }
      const customer = { id: `free-assembly-${++completed}`, state: 'WAITING', arrivalComplete: true };
      customerMap.set(customer.id, customer); orders.random = () => RECIPES.indexOf(recipe) / RECIPES.length;
      const order = orders.createForCustomer(customer), before = score.score;
      delivery.update(1); assert.equal(delivery.interact(carries[actor]).kind, 'delivery-question');
      assert.equal(answerDelivery(delivery).kind, 'delivery');
      assert.equal(order.state, 'COMPLETED'); assert.ok(score.score > before); assert.equal(dish.disposed, true);
      assert.equal(sushi.instances.size, 0); assert.equal(carries[actor].carriedIngredient, null);
      customerMap.delete(customer.id); orders.removeForCustomer(customer.id);
    }
    // A portable plate uses the same target/quantity matcher on a generic surface.
    const station = new Station({ id: 'free-test-counter', type: 'assembly', position: [0, 0], width: 2, depth: 2, height: 1 });
    station.configureStorage({ position: [0, 1, 0], width: 1, depth: 1 }); stations.set(station.id, station);
    const plate = sushi.createPreparation([], recipes, 'salmon_maki');
    carries[0].attach(plate); carries[0].interact(station);
    for (const state of ['salmon_cut', 'rice_cooked', 'nori_sheet']) {
      carries.at(-1).attach(make(state)); assert.ok(carries.at(-1).interact(station).success);
      if (state !== 'nori_sheet') {
        assert.equal(plate.kind, 'preparation');
        carries[0].interact(station); assert.ok(carries[0].carriedIngredient === plate); carries[0].interact(station);
      }
    }
    assert.equal(plate.recipeId, 'salmon_maki'); assert.equal(plate.kind, 'sushi');
    const held = make('rice_cooked'); carries.at(-1).attach(held);
    assert.equal(carries.at(-1).interact(station).message, 'Este prato já está pronto!');
    assert.ok(carries.at(-1).carriedIngredient === held); carries.at(-1).discard();
    carries[0].interact(station); carries[0].discard();

    // Required repeated units are accepted until the precise quantity, then locked.
    const custom = new AssemblySystem({ station, carrySystem: carries[0], factory: sushi, recipes: repeatedRecipes });
    custom.selectRecipe(repeated.id);
    for (const state of ['salmon_cut', 'rice_cooked', 'rice_cooked']) {
      carries[0].attach(make(state)); assert.ok(carries[0].interact(station).success);
    }
    assert.equal(custom.state, 'READY'); assert.equal(custom.dish.recipeId, repeated.id);
    reject(custom, carries[0], 'rice_cooked', 'Este prato já está pronto!');
    carries[0].interact(station); carries[0].discard(); custom.dispose();
    assert.equal(factory.instances.size, 0); assert.equal(sushi.instances.size, 0);
  } finally {
    delivery.dispose(); orders.dispose(); prep.dispose(); carries.forEach(carry => carry.dispose());
    factory.dispose(); sushi.dispose(); world.dispose();
  }
}
assert.equal(completed, 84);
console.log('OK: 84 montagens/entregas (todas as permutações de 3 receitas × 3 bancadas × solo/dupla), escolha persistente no transporte, maki com alga por último, quantidades repetidas, rejeição sem consumo e bloqueio de pratos prontos.');
