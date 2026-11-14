import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { Input } from '../src/game/Input.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { RiceCookerSystem } from '../src/game/RiceCookerSystem.js';
import { CuttingSystem } from '../src/game/CuttingSystem.js';
import { RecipeSystem, RECIPES } from '../src/game/RecipeSystem.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { AssemblySystem } from '../src/game/AssemblySystem.js';

const recipes = new RecipeSystem();
assert.equal(RECIPES.length, 3);
assert.equal(recipes.analyze(['rice_cooked']).possible.length, 3);
assert.equal(recipes.analyze(['rice_cooked']).complete, null);
assert.deepEqual(recipes.analyze(['rice_cooked']).next, ['salmon_cut', 'nori_sheet', 'cucumber_cut']);
assert.deepEqual(recipes.analyze(['rice_cooked', 'nori_sheet']).possible.map(recipe => recipe.id), ['salmon_maki', 'cucumber_uramaki']);
assert.equal(recipes.analyze(['salmon_raw']).possible.length, 0);
const extensible = new RecipeSystem([...RECIPES, { id: 'future', sequence: ['rice_cooked', 'salmon_cut', 'nori_sheet'] }]);
assert.equal(extensible.analyze(['rice_cooked', 'salmon_cut'], 'future').complete, null, 'Escolher a receita maior impede finalizar o nigiri antes da alga.');

const world = new Scene(), player = world.player, stations = world.kitchen.stations;
const station = stations.get('assembly');
const originalCollider = JSON.stringify(station.collider), originalPosition = station.position.clone();
const factory = new IngredientFactory(), sushiFactory = new SushiFactory();
const carry = new CarrySystem({ player, stations, factory });
const assembly = new AssemblySystem({ station, carrySystem: carry, factory: sushiFactory });
const cooker = new RiceCookerSystem({ station: stations.get('riceCooker'), carrySystem: carry, factory });
const cutting = new CuttingSystem({ station: stations.get('cutting'), player, carrySystem: carry, factory });
const collision = new CollisionSystem({ bounds: world.collisionBounds });
world.collisionObstacles.forEach((obstacle) => collision.registerObstacle(obstacle));
player.collisionSystem = collision;
const interaction = new InteractionSystem({ stations: stations.values(), collisionSystem: collision, carrySystem: carry });
const target = new EventTarget(), input = new Input(new PerspectiveCamera(), { target, documentTarget: new EventTarget() });
input.setEnabled(true);
function key(type, code, repeat = false) {
  const event = new Event(type, { cancelable: true }); Object.assign(event, { code, repeat }); target.dispatchEvent(event);
}
function approach(id = 'assembly') {
  input.reset(); player.stopMoving(); player.group.position.copy(stations.get(id).getApproachPosition()); interaction.reset();
}
function frame(dt = 0.02) {
  const event = interaction.update(dt, player, { interactPressed: input.consumeInteraction() });
  assembly.update(dt, { selected: interaction.activeStation === station, cancelHeld: input.isCancelHeld() });
  return event;
}
function press(id = 'assembly') {
  approach(id); key('keydown', 'KeyE'); const event = frame(); key('keyup', 'KeyE'); return event;
}
function obtain(state) {
  const type = { rice_cooked: 'rice', salmon_cut: 'salmon', cucumber_cut: 'cucumber', nori_sheet: 'nori' }[state];
  carry.attach(factory.create(type, state)); return carry.carriedIngredient;
}

for (const recipe of RECIPES) {
  const consumed = [];
  for (let i = 0; i < recipe.sequence.length; i++) {
    const ingredient = obtain(recipe.sequence[i]); consumed.push(ingredient);
    const result = press(); assert.equal(result.success, true);
    assert.equal(result.kind, i === recipe.sequence.length - 1 ? 'finish-sushi' : 'add-ingredient');
    assert.equal(carry.carriedIngredient, null);
    key('keydown', 'KeyE', true); frame(); key('keyup', 'KeyE');
    if (i < recipe.sequence.length - 1) {
      assert.equal(assembly.state, 'ASSEMBLING');
      assert.deepEqual(assembly.sequence, recipe.sequence.slice(0, i + 1));
      assert.deepEqual(assembly.preview.userData.sequence, assembly.sequence);
      assert.equal(ingredient.model.parent, assembly.contents);
      assert.equal(ingredient.disposed, false);
      carry.attach(factory.create('salmon'));
      const held = carry.carriedIngredient;
      const snapshot = [...assembly.sequence];
      assert.equal(press().success, false);
      assert.equal(carry.carriedIngredient, held);
      assert.deepEqual(assembly.sequence, snapshot);
      carry.discard();
    }
  }
  assert.equal(assembly.state, 'READY');
  assert.equal(assembly.dish.recipeId, recipe.id);
  assert.equal(assembly.dish.model.userData.recipeId, recipe.id);
  assert.ok(consumed.every((ingredient) => ingredient.disposed));
  assert.equal(factory.instances.size, 0);
  assert.equal(sushiFactory.instances.size, 1);
  const dish = assembly.dish, instance = dish.instanceId;
  obtain('nori_sheet'); assert.equal(press().success, false); assert.equal(assembly.dish, dish); carry.discard();
  assert.equal(press().kind, 'take-sushi');
  assert.equal(carry.carriedIngredient, dish);
  assert.equal(dish.model.parent, player.carryAnchor);
  assert.equal(dish.completionState, 'READY');
  assert.equal(assembly.state, 'EMPTY');
  assert.equal(press('salmonBox').success, false, 'Caixas não podem apagar um prato pronto.');
  assert.equal(carry.carriedIngredient, dish);
  assert.throws(() => carry.attach({ disposed: false }), /dois/);
  player.group.position.set(0, 0, 2.4);
  const before = player.group.position.clone();
  player.update(0.05, new Vector3(1, 0, 0), true);
  assert.equal(player.state, 'dashing');
  for (let i = 0; i < 30; i++) player.update(0.05, new Vector3(0, 0, 1));
  assert.ok(player.group.position.distanceTo(before) > 0.1);
  assert.equal(dish.model.parent, player.carryAnchor);
  assert.equal(dish.model.getWorldQuaternion(player.group.quaternion.clone()).angleTo(player.carryAnchor.getWorldQuaternion(player.group.quaternion.clone())) < 1e-7, true);
  player.stopMoving();
  assert.equal(press().kind, 'place-sushi');
  assert.equal(assembly.dish, dish);
  assert.equal(dish.model.parent, assembly.anchor);
  assert.equal(dish.instanceId, instance);
  const dishPosition = dish.model.getWorldPosition(new Vector3());
  approach('trash'); frame();
  assert.deepEqual(dish.model.getWorldPosition(new Vector3()), dishPosition);
  assert.equal(press().kind, 'take-sushi');
  assert.equal(carry.carriedIngredient.instanceId, instance);
  assert.equal(press('trash').kind, 'discard');
  assert.equal(sushiFactory.instances.size, 0);
}

for (const [type, state] of [['rice', 'rice_raw'], ['rice', 'rice_burnt'], ['salmon', 'salmon_raw'], ['cucumber', 'cucumber_whole']]) {
  carry.attach(factory.create(type, state));
  const held = carry.carriedIngredient;
  assert.equal(press().success, true); assert.equal(carry.carriedIngredient, null); assert.equal(assembly.state, 'EMPTY');
  assert.equal(press().success, true); assert.equal(carry.carriedIngredient, held); carry.discard();
}
obtain('rice_cooked'); press();
const ingredient = assembly.ingredients[0];
approach(); key('keydown', 'KeyR');
for (let i = 0; i < 20; i++) frame();
assert.equal(assembly.state, 'ASSEMBLING'); assert.ok(assembly.cancelProgress > 0);
key('keyup', 'KeyR'); frame(); assert.equal(assembly.cancelProgress, 0);
key('keydown', 'KeyR'); for (let i = 0; i < 20; i++) frame();
player.group.position.set(0, 0, 4.2); frame(); assert.equal(assembly.cancelProgress, 0);
assert.equal(assembly.ingredients[0], ingredient);
approach(); obtain('nori_sheet'); key('keydown', 'KeyR'); for (let i = 0; i < 70; i++) frame();
assert.equal(assembly.state, 'ASSEMBLING'); assert.equal(assembly.cancelProgress, 0);
carry.discard(); key('keyup', 'KeyR'); frame();
key('keydown', 'KeyR'); frame();
for (let i = 0; i < 49; i++) frame();
assert.equal(assembly.state, 'ASSEMBLING'); frame();
assert.equal(assembly.state, 'EMPTY'); assert.equal(ingredient.disposed, true); assert.equal(factory.instances.size, 0);
key('keyup', 'KeyR'); frame();
obtain('nori_sheet'); press(); approach(); key('keydown', 'KeyR'); frame(); frame(0.05);
target.dispatchEvent(new Event('blur')); frame(); assert.equal(assembly.cancelProgress, 0);
assembly.update(10, { selected: true, cancelHeld: true, disabled: true }); assert.equal(assembly.state, 'ASSEMBLING');
assembly.dispose(); assert.equal(factory.instances.size, 0);

// Preparo existente continua produzindo exatamente os estados exigidos pelas receitas.
carry.attach(factory.create('rice')); assert.equal(carry.interact(stations.get('riceCooker')).kind, 'load-rice');
carry.interact(stations.get('riceCooker')); cooker.update(6); assert.equal(cooker.state, 'READY');
carry.interact(stations.get('riceCooker')); assert.equal(carry.carriedIngredient.state, 'rice_cooked'); carry.discard();
carry.attach(factory.create('salmon')); carry.interact(stations.get('cutting'));
for (let i = 0; i < 3; i++) { carry.interact(stations.get('cutting')); cutting.update(0.25); }
assert.equal(cutting.state, 'READY'); carry.interact(stations.get('cutting'));
assert.equal(carry.carriedIngredient.state, 'salmon_cut'); carry.discard();
assert.deepEqual(station.position, originalPosition); assert.equal(JSON.stringify(station.collider), originalCollider);
assert.equal(player.maxSpeed, 5.04); assert.equal(player.dashDuration, 0.18); assert.equal(player.dashCooldown, 0.65);
input.dispose(); interaction.dispose(); cutting.dispose(); cooker.dispose(); carry.dispose(); factory.dispose(); sushiFactory.dispose(); collision.dispose(); world.dispose();
assert.equal(sushiFactory.instances.size, 0);
console.log('OK: 3 receitas, prefixos ambíguos, ordem/rejeição sem consumo, montagem progressiva, pratos únicos, transporte/dash, apoio/retirada, cancelamento R de 1s e regressão de arroz/corte.');
