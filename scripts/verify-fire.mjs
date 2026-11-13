import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { Camera } from '../src/game/Camera.js';
import { CollisionSystem } from '../src/game/CollisionSystem.js';
import { KitchenNavigation } from '../src/game/KitchenNavigation.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { PreparationSystem } from '../src/game/PreparationSystem.js';
import { InteractionSystem } from '../src/game/InteractionSystem.js';
import { Input } from '../src/game/Input.js';
import { PLAYER_CONTROLS } from '../src/game/PlayerControls.js';
import { FireSystem } from '../src/game/FireSystem.js';
import { FireExtinguisher } from '../src/game/FireExtinguisher.js';
import { FireEffects } from '../src/game/FireEffects.js';
import { Game } from '../src/game/Game.js';
import { GameTimer } from '../src/game/GameTimer.js';

const close = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const oldDocument = globalThis.document;
globalThis.document = { hidden: false };

function fixture(mode = 'solo', fps = 60, config = {}) {
  const world = new Scene({ gameMode: mode });
  const collision = new CollisionSystem({ bounds: world.collisionBounds });
  world.collisionObstacles.forEach(o => collision.registerObstacle(o));
  world.players.forEach(player => { player.collisionSystem = collision; }); collision.players = world.players;
  const tool = new FireExtinguisher({ scene: world.scene }); collision.registerObstacle(tool.station.collider);
  tool.configureWorld(collision);
  const stations = new Map(world.kitchen.stations); stations.set(tool.station.id, tool.station);
  stations.set(tool.floorStation.id, tool.floorStation);
  const factory = new IngredientFactory(), sushi = new SushiFactory(), target = new EventTarget();
  const contexts = world.players.map((player, i) => {
    const carrySystem = new CarrySystem({ player, stations, factory });
    const input = new Input(null, { target, documentTarget: new EventTarget(), player,
      controls: mode === 'solo' ? PLAYER_CONTROLS.solo : i ? PLAYER_CONTROLS.p2 : PLAYER_CONTROLS.p1 });
    input.setEnabled(true);
    const interactionSystem = new InteractionSystem({ stations: stations.values(), collisionSystem: collision, carrySystem });
    return { player, carrySystem, input, interactionSystem };
  });
  const prep = new PreparationSystem({ stations: world.kitchen.stations, carrySystem: contexts[0].carrySystem, factory, sushiFactory: sushi });
  let alarms = 0;
  const fire = new FireSystem({ stations: world.kitchen.stations, extinguisher: tool, config,
    effects: new FireEffects(world.scene), sound: { playFireAlert() { alarms++; } }, collisionSystem: collision });
  contexts.forEach(c => { c.interactionSystem.fireSystem = fire; });
  const game = Object.create(Game.prototype);
  Object.assign(game, { world, players: contexts, session: { paused: false }, disposed: false, preparation: prep,
    fireSystem: fire, gameTimer: new GameTimer(), resultsUI: { update() {} }, customerSystem: { update() {} } });
  const frame = (dt = 1 / fps) => game.updateSimulation(dt);
  const advance = seconds => { for (let left = seconds; left > 1e-8;) { const dt = Math.min(left, 1 / fps); frame(dt); left -= dt; } };
  const key = (type, code) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code }));
  const press = context => key('keydown', context.input.controls.interact);
  const release = context => key('keyup', context.input.controls.interact);
  const place = (context, station) => { context.player.stopMoving(); context.player.group.position.copy(station.getApproachPosition()); };
  const load = (cooker, context = contexts[0]) => {
    context.carrySystem.attach(factory.create('rice'));
    assert.ok(context.carrySystem.interact(cooker.station).success);
    assert.ok(context.carrySystem.interact(cooker.station).success);
  };
  return { world, collision, tool, stations, factory, contexts, prep, fire, game, frame, advance, key, press, release, place, load,
    alarms: () => alarms,
    dispose() {
      fire.dispose(); tool.dispose(); contexts.forEach(c => { c.input.dispose(); c.interactionSystem.dispose(); c.carrySystem.dispose(); });
      prep.dispose(); factory.dispose(); sushi.dispose(); collision.dispose(); world.dispose();
    } };
}

try {
  for (const mode of ['solo', 'coop']) for (const fps of [20, 60, 144]) {
    const f = fixture(mode, fps), actor = f.contexts.at(-1), carry = actor.carrySystem;
    const cooker = f.prep.riceCookers.get('riceCooker');
    const camera = new Camera(1440, 1000, f.world.bounds), projection = camera.camera.projectionMatrix.toArray();
    const stationsBefore = [...f.world.kitchen.stations.values()].map(s => [s.position.toArray(), s.model.scale.toArray()]);
    f.advance(8); assert.equal(f.fire.fires.size, 0, 'No random fire');
    f.load(cooker); const rice = cooker.content;
    f.advance(6); assert.equal(cooker.state, 'READY'); assert.equal(rice.state, 'rice_cooked');
    f.advance(20); assert.equal(cooker.state, 'BURNT');
    f.advance(4.99); assert.equal(f.fire.fires.size, 0);
    f.advance(.01); assert.equal(f.fire.fires.size, 1); assert.ok(f.fire.isBurning(cooker.station));
    assert.equal(cooker.station.state, 'burning'); assert.equal(f.alarms(), 1);
    assert.equal(f.fire.ignite(cooker.station), false); assert.equal(f.fire.effects.records.size, 1);
    assert.equal(f.contexts[0].carrySystem.interact(cooker.station).message, 'Estação em chamas!');
    f.place(actor, f.tool.station);
    carry.attach(f.factory.create('salmon'));
    assert.equal(carry.interact(f.tool.station).success, false); carry.discard();
    f.press(actor); f.frame(); f.release(actor); f.frame();
    assert.equal(carry.carriedTool, f.tool); assert.equal(f.tool.owner, carry); assert.equal(carry.carriedIngredient, null);
    assert.equal(carry.interact(f.world.kitchen.stations.get('riceBox')).success, false);
    const rejected = f.factory.create('rice'); assert.throws(() => carry.attach(rejected)); rejected.dispose();
    if (mode === 'coop') {
      assert.equal(f.contexts[0].carrySystem.interact(f.tool.station).success, false, 'Only one owner');
      f.contexts[0].carrySystem.attach(f.factory.create('cucumber'));
      assert.ok(f.contexts[0].carrySystem.interact(f.world.kitchen.stations.get('noriBox')).success, 'Other player keeps working');
    }
    f.place(actor, cooker.station); f.press(actor); f.frame();
    assert.ok(actor.player.extinguishing && actor.player.movementLocked);
    const fixed = actor.player.group.position.clone();
    f.key('keydown', actor.input.controls.dash); f.key('keydown', actor.input.controls.up[0]);
    f.advance(.2);
    assert.ok(fixed.equals(actor.player.group.position)); assert.equal(actor.player.dashRemaining, 0);
    assert.ok(actor.input.isInteractionHeld(), 'Lock must preserve the held E/P key');
    let progress = f.fire.fires.get(cooker.station.id).progress;
    assert.ok(progress > .15 && progress < .3);
    f.release(actor); f.frame(); assert.equal(actor.player.movementLocked, false);
    f.advance(.7); close(f.fire.fires.get(cooker.station.id).progress, progress);
    f.advance(1.3); assert.ok(f.fire.fires.get(cooker.station.id).progress < progress);
    f.press(actor);
    for (let t = 0; f.fire.fires.size && t < 2.01; t += 1 / fps) f.frame();
    f.release(actor); f.frame();
    assert.equal(f.fire.fires.size, 0); assert.equal(cooker.state, 'EMPTY'); assert.equal(cooker.content, null);
    assert.equal(rice.disposed, true); assert.equal(actor.player.movementLocked, false);
    assert.ok(f.fire.effects.records.get(cooker.station.id).recovery > 0, 'Recovery animation');
    f.advance(1); assert.equal(f.fire.effects.records.size, 0);
    assert.ok([...f.fire.effects.sprayers.values()].every(e => !e.group.visible));
    f.place(actor, f.tool.station); f.press(actor); f.frame(); f.release(actor); f.frame();
    assert.equal(carry.carriedTool, null); assert.equal(f.tool.state, 'DOCKED'); assert.equal(f.tool.model.parent, f.tool.station.model);
    f.load(cooker, actor); f.advance(6); assert.equal(cooker.state, 'READY', 'Recovered cooker works');
    assert.deepEqual(camera.camera.projectionMatrix.toArray(), projection);
    assert.deepEqual([...f.world.kitchen.stations.values()].map(s => [s.position.toArray(), s.model.scale.toArray()]), stationsBefore);
    f.dispose();
  }

  // Full spread graph, including cutting/assembly/ingredients/delivery, with one ignition per tick.
  const spread = fixture(); const origin = spread.prep.riceCookers.get('riceCooker').station;
  spread.fire.ignite(origin);
  const order = [...spread.fire.fires.keys()];
  for (let n = 1; n < spread.fire.stations.size; n++) {
    const promised = spread.fire.pendingSpread;
    assert.ok(promised && promised.target.fireThreatened && promised.path.length >= 2);
    spread.advance(3.99); assert.equal(spread.fire.fires.size, n);
    spread.advance(.01); assert.equal(spread.fire.fires.size, n + 1);
    assert.ok(spread.fire.isBurning(promised.target), 'Only the announced destination ignites');
    order.push([...spread.fire.fires.keys()].at(-1));
  }
  assert.equal(new Set(order).size, spread.fire.stations.size); assert.equal(spread.alarms(), 1);
  assert.equal(spread.fire.effects.records.size, spread.fire.stations.size);
  const cleared = spread.fire.fires.get('assembly').station; spread.fire.extinguish(cleared);
  assert.equal(spread.fire.ignite(cleared), false, 'No reinfection in the same incident');
  spread.advance(16); assert.equal(spread.fire.isBurning(cleared), false);
  for (const { station } of [...spread.fire.fires.values()]) spread.fire.extinguish(station);
  assert.ok(spread.fire.ignite(cleared), 'A new incident may affect a recovered station');
  spread.dispose();

  const f = fixture('coop', 60, { ignitionDelay: .4, spreadInterval: 100 });
  const [p1, p2] = f.contexts, carry = p1.carrySystem;
  const cut = f.prep.cuttingSystems.get('cutting');
  carry.attach(f.factory.create('salmon')); carry.interact(cut.station); carry.interact(cut.station);
  assert.ok(p1.player.movementLocked); const content = cut.content;
  f.fire.ignite(cut.station); assert.equal(p1.player.movementLocked, false); assert.equal(cut.state, 'LOADED');
  f.advance(2); assert.equal(cut.cuts, 0); assert.equal(cut.content, content); assert.equal(content.disposed, false);
  f.fire.extinguish(cut.station); assert.ok(carry.interact(cut.station).success); f.advance(cut.strokeDuration);
  assert.equal(cut.cuts, 1); assert.equal(cut.content, content);
  const assembly = f.prep.assemblySystems.get('assembly');
  carry.attach(f.factory.create('nori')); carry.interact(assembly.station); const item = assembly.ingredients[0];
  f.fire.ignite(assembly.station);
  assembly.update(5, { selected: true, cancelHeld: true });
  assert.equal(assembly.ingredients[0], item); assert.equal(item.disposed, false); assert.equal(assembly.cancelElapsed, 0);
  f.fire.extinguish(assembly.station);
  const cooker = f.prep.riceCookers.get('riceCooker2'); f.load(cooker);
  f.advance(1); const elapsed = cooker.elapsed, heldRice = cooker.content;
  f.fire.ignite(cooker.station); f.advance(2); close(cooker.elapsed, elapsed); assert.equal(cooker.content, heldRice);
  f.fire.extinguish(cooker.station); f.advance(5); assert.equal(cooker.state, 'READY');
  cooker.discardBurnt(); // Not burnt: must be a harmless rejection.
  assert.equal(cooker.content, heldRice);
  f.advance(20.39); assert.equal(cooker.state, 'BURNT'); assert.equal(f.fire.isBurning(cooker.station), false);
  f.advance(.01); assert.ok(f.fire.isBurning(cooker.station), 'Configurable ignition delay');
  f.fire.extinguish(cooker.station);
  assert.equal(heldRice.disposed, true);
  // Discarding burnt rice before the deadline prevents ignition altogether.
  f.load(cooker); f.advance(26.2); assert.equal(cooker.state, 'BURNT'); assert.ok(cooker.discardBurnt().success);
  f.advance(1); assert.equal(f.fire.fires.size, 0);
  // GPS uses the same collision-aware safe approach predicate, even while a station burns.
  f.fire.ignite(assembly.station); assert.ok(f.tool.interact(p2.carrySystem).success);
  const navigation = new KitchenNavigation(f.collision, p2.player);
  const route = navigation.findRoute(new Vector3(0, 0, 6.8), assembly.station.position,
    point => p2.interactionSystem.canApproach(assembly.station, p2.player, point));
  assert.ok(route.length && p2.interactionSystem.canApproach(assembly.station, p2.player, route.at(-1)));
  assert.equal(p2.carrySystem.describe(assembly.station).available, true);
  assert.equal(p1.carrySystem.describe(assembly.station).available, false);
  const toolRoute = navigation.findRoute(new Vector3(0, 0, 6.8), f.tool.station.position,
    point => p2.interactionSystem.canApproach(f.tool.station, p2.player, point));
  assert.ok(toolRoute.length && p2.interactionSystem.canApproach(f.tool.station, p2.player, toolRoute.at(-1)));
  const clock = f.fire.time, timer = f.game.gameTimer.remaining;
  f.game.session.paused = true; f.advance(3); close(f.fire.time, clock); close(f.game.gameTimer.remaining, timer);
  f.game.session.paused = false; f.advance(.5); close(f.fire.time, clock + .5); close(f.game.gameTimer.remaining, timer - .5);
  f.dispose();

  // Announced trails route around solids and disappear immediately if their source is put out.
  const trail = fixture();
  const source = trail.prep.riceCookers.get('riceCooker').station;
  trail.collision.registerObstacle({ id: 'trail-divider', bounds: { minX: -6.25, maxX: -6.15, minZ: 7.3, maxZ: 10.8 } });
  trail.fire.ignite(source);
  const promised = trail.fire.pendingSpread;
  assert.equal(promised.target.id, 'riceCooker2'); assert.ok(promised.path.length > 2);
  const divider = new CollisionSystem({ bounds: trail.collision.bounds });
  divider.registerObstacle({ id: 'divider', bounds: { minX: -6.25, maxX: -6.15, minZ: 7.3, maxZ: 10.8 } });
  assert.equal(divider.hasLineOfSight(source.position, promised.target.position), false);
  for (let i = 1; i < promised.path.length; i++) assert.ok(divider.hasLineOfSight(promised.path[i - 1], promised.path[i]), 'Trail never cuts through a wall');
  trail.advance(2); assert.equal(trail.fire.pendingSpread.target, promised.target); assert.equal(trail.fire.fires.size, 1);
  assert.ok(trail.fire.effects.trail.orange.count < trail.fire.effects.trail.count);
  trail.fire.extinguish(source);
  assert.equal(trail.fire.pendingSpread, null); assert.equal(trail.fire.effects.trail, null); assert.equal(promised.target.fireThreatened, false);
  trail.advance(3); assert.equal(trail.fire.isBurning(promised.target), false);
  divider.dispose(); trail.dispose();

  for (const mode of ['solo', 'coop']) for (const [age, duration] of [[0, .8], [5, 1.3], [12, 2]]) {
    const timed = fixture(mode, 60, { spreadInterval: 100 });
    const station = timed.prep.assemblySystems.get('assembly').station, actor = timed.contexts.at(-1);
    timed.fire.ignite(station); timed.advance(age);
    close(timed.fire.durationFor(timed.fire.fires.get(station.id)), duration);
    assert.ok(timed.tool.interact(actor.carrySystem).success); timed.place(actor, station);
    timed.press(actor); timed.advance(duration - .01); assert.ok(timed.fire.isBurning(station));
    timed.advance(.01); assert.equal(timed.fire.isBurning(station), false, 'Every size is extinguished in at most 2 seconds');
    timed.release(actor); timed.dispose();
  }

  for (const ownerIndex of [0, 1]) {
    const dropped = fixture('coop'), actor = dropped.contexts[ownerIndex], other = dropped.contexts[1 - ownerIndex];
    dropped.place(actor, dropped.tool.station); dropped.press(actor); dropped.frame(); dropped.release(actor); dropped.frame();
    assert.equal(actor.carrySystem.carriedTool, dropped.tool);
    assert.deepEqual(dropped.tool.model.scale.toArray(), [1.5, 1.5, 1.5]);
    other.player.group.position.set(0,0,6.8);
    actor.player.group.position.set(0, 0, 2.8); actor.player.group.rotation.y = 0;
    dropped.key('keydown', actor.input.controls.drop); dropped.frame(); dropped.key('keyup', actor.input.controls.drop);
    assert.equal(dropped.tool.state, 'DROPPED'); assert.equal(actor.carrySystem.carriedTool, null);
    const floor = dropped.tool.floorStation, pos = floor.position.clone();
    assert.ok(dropped.collision.obstacles.has(floor.id));
    assert.equal(dropped.tool.model.parent, floor.model); assert.deepEqual(dropped.tool.model.rotation.toArray().slice(0,3), [0,0,0]);
    const box = new Box3().setFromObject(dropped.tool.model);
    close(box.min.y, 0, 1e-5);
    assert.ok(box.min.x >= floor.collider.bounds.minX && box.max.x <= floor.collider.bounds.maxX);
    assert.ok(box.min.z >= floor.collider.bounds.minZ && box.max.z <= floor.collider.bounds.maxZ);
    dropped.advance(.5); assert.ok(pos.equals(floor.position));
    const gps = new KitchenNavigation(dropped.collision, other.player);
    const route = gps.findRoute(other.player.group.position, floor.position,
      point => other.interactionSystem.canApproach(floor, other.player, point));
    assert.ok(route.length && other.interactionSystem.canApproach(floor, other.player, route.at(-1)), 'Dropped tool reachable through GPS');
    dropped.place(other, floor); dropped.press(other); dropped.frame(); dropped.release(other); dropped.frame();
    assert.equal(other.carrySystem.carriedTool, dropped.tool); assert.equal(dropped.tool.owner, other.carrySystem);
    assert.equal(dropped.collision.obstacles.has(floor.id), false); assert.equal(floor.interactionEnabled, false);
    assert.equal(other.interactionSystem.canApproach(floor, other.player, floor.getApproachPosition()), false);
    let models = 0; dropped.world.scene.traverse(o => { if (o.name === 'kawaii-fire-extinguisher') models++; }); assert.equal(models, 1);
    const p = other.player.group.position;
    dropped.collision.registerObstacle({ id: 'no-drop', bounds: { minX:p.x-3,maxX:p.x+3,minZ:p.z-3,maxZ:p.z+3 } });
    assert.equal(dropped.tool.drop(other.carrySystem).success, false); assert.equal(dropped.tool.owner, other.carrySystem);
    dropped.dispose();
  }
} finally {
  if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
}
console.log('OK: Fire 2.0: causal ignition, actual 4s routed trails/cancellation, 0.8/1.3/2s suppression, shared 1.5x tool, Q/O safe ground drop/re-pickup/GPS, recovery, ownership, unchanged framing and solo/coop at 20/60/144 FPS.');
