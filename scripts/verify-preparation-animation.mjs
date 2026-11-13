import assert from 'node:assert/strict';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { AssemblyEffects } from '../src/game/AssemblyEffects.js';
import { RECIPES } from '../src/game/RecipeSystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { Scene } from '../src/game/Scene.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { PreparationSystem } from '../src/game/PreparationSystem.js';

const factory = new SushiFactory();
const assembly = { factory, preview: factory.preview(['rice_cooked']) };
const effects = new AssemblyEffects(assembly);
effects.place('rice_cooked');
const rice = effects.poses[0];
effects.update(.2);
assert.ok(rice.mesh.position.y > rice.position.y);
assert.ok(rice.mesh.scale.x < rice.scale.x);
effects.update(.4);
assert.equal(effects.stage, 'idle');
assert.ok(rice.mesh.position.equals(rice.position));

for (const recipe of RECIPES) {
  for (const fps of [20, 60, 144]) {
    assembly.dish = factory.create(recipe);
    const original = assembly.dish.model.children.map(mesh => mesh.visible);
    effects.finish(recipe);
    const temporary = effects.roll;
    if (recipe.model !== 'nigiri') {
      effects.update(.75);
      assert.equal(effects.stage, 'slicing-roll');
      assert.equal(effects.knife.visible, true);
      assert.ok(effects.poses.every(pose => !pose.mesh.visible));
    }
    for (let frame = 0; frame < fps * 2; frame++) effects.update(1 / fps);
    assert.equal(effects.stage, 'idle');
    assert.equal(temporary?.parent ?? null, null);
    assert.deepEqual(assembly.dish.model.children.map(mesh => mesh.visible), original);
    // Taking a dish midway must restore every part and remove the animation.
    effects.finish(recipe);
    effects.update(.2);
    effects.clear();
    assert.deepEqual(assembly.dish.model.children.map(mesh => mesh.visible), original);
    assert.ok(effects.poses.length === 0);
    assembly.dish.dispose();
  }
}
effects.dispose();
factory.dispose();
const world = new Scene({ gameMode: 'coop' }), ingredients = new IngredientFactory(), sushi = new SushiFactory();
const carries = world.players.map(player => new CarrySystem({ player, stations: world.kitchen.stations, factory: ingredients }));
const preparation = new PreparationSystem({ stations: world.kitchen.stations, carrySystem: carries[0], factory: ingredients, sushiFactory: sushi });
const cutters = [...preparation.cuttingSystems.values()];
for (const [i, type] of ['salmon', 'cucumber'].entries()) {
  const item = ingredients.create(type), cutter = cutters[i];
  carries[i].attach(item);
  assert.equal(cutter.interact(carries[i]).success, true);
  assert.equal(item.model.parent, cutter.boardAnchor);
  assert.equal(cutter.interact(carries[i]).success, true);
}
assert.ok(world.players.every(player => player.movementLocked));
assert.notEqual(world.players[0].cutAction, world.players[1].cutAction);
cutters[0].update(cutters[0].strokeDuration);
assert.equal(world.players[0].movementLocked, false);
assert.equal(world.players[1].movementLocked, true);
assert.equal(cutters[0].content.state, 'salmon_raw');
assert.equal(cutters[0].content.model.userData.completedCuts, 1);
assert.ok(cutters[0].content.model.getObjectByName('partial-salmon-0'));
assert.equal(cutters[1].cuts, 0);
cutters[1].update(cutters[1].strokeDuration);
assert.equal(cutters[1].content.state, 'cucumber_whole');
assert.ok(cutters[1].content.model.getObjectByName('partial-cucumber-0'));
for (const cutter of cutters.slice(0, 2)) {
  while (cutter.state !== 'READY') {
    cutter.interact(cutter.carrySystem);
    cutter.update(cutter.strokeDuration);
  }
  assert.ok(cutter.content.state.endsWith('_cut'));
}
const cooker = preparation.riceCookers.values().next().value;
const fx = cooker.effects;
assert.ok(fx.particles.every(({ mesh }) => !mesh.visible));
carries[0].attach(ingredients.create('rice'));
cooker.interact(carries[0]); cooker.interact(carries[0]); cooker.update(.3);
assert.equal(cooker.state, 'COOKING');
assert.ok(fx.particles.every(({ mesh }) => mesh.visible));
const particleCount = fx.particles.length;
cooker.update(cooker.cookDuration);
assert.equal(cooker.state, 'READY');
assert.equal(fx.mound.visible, true);
assert.equal(fx.glow.visible, true);
assert.ok(fx.particles.every(({ mesh }) => !mesh.visible));
cooker.update(cooker.burnDelay);
assert.equal(cooker.state, 'BURNT');
assert.equal(fx.glow.visible, false);
assert.ok(fx.particles.every(({ mesh }) => mesh.visible));
assert.equal(fx.particles.length, particleCount);
preparation.dispose(); carries.forEach(carry => carry.dispose()); ingredients.dispose(); sushi.dispose(); world.dispose();
console.log('OK: rice placement, three recipe animations at 20/60/144 FPS, slicing, final poses, early pickup and temporary model cleanup.');
console.log('OK: real cooker states and bounded steam, partial salmon/cucumber cuts, independent cooperative actions and teardown.');
