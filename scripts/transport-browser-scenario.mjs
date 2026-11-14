import assert from 'node:assert/strict';

// Runs against the real Game, Input and shared stations created by the menu browser check.
export async function verifyTransportBrowser({ evaluate, command }) {
  await evaluate(`(() => {
    const g = __testGame;
    globalThis.__transportEvents = [];
    for (const actor of g.activePlayers) {
      actor.interactionSystem.onInteract = event => __transportEvents.push({ playerId: event.playerId, kind: event.kind, success: event.success });
      actor.player.group.position.set(-6 + g.activePlayers.indexOf(actor) * 12, 0, 6);
    }
  })()`);
  const key = (index, type) => command('Input.dispatchKeyEvent', {
    type, code: index ? 'KeyP' : 'KeyE', key: index ? 'p' : 'e', windowsVirtualKeyCode: index ? 80 : 69,
  });
  const frame = () => evaluate('__testGame.updateSimulation(.05)');
  const approach = (index, stationId) => evaluate(`(() => {
    const g = __testGame, actor = g.activePlayers[${index}];
    actor.input.reset(); actor.interactionSystem.reset(); actor.player.stopMoving();
    actor.player.group.position.copy(g.world.kitchen.stations.get(${JSON.stringify(stationId)}).getApproachPosition());
  })()`);
  const tap = async (index, stationId) => {
    await approach(index, stationId);
    const before = await evaluate('__transportEvents.length');
    await key(index, 'keyDown'); await frame(); await key(index, 'keyUp'); await frame();
    const events = await evaluate(`__transportEvents.slice(${before})`);
    assert.equal(events.length, 1, JSON.stringify(events)); assert.equal(events[0].success, true, JSON.stringify(events));
    return events[0];
  };
  await evaluate(`__testGame.activePlayers[0].carrySystem.attach(__testGame.ingredientFactory.create('salmon'))`);
  assert.equal((await tap(0, 'cutting')).kind, 'load-cutting');
  assert.equal((await tap(0, 'cutting')).kind, 'take-cut-ingredient');
  assert.equal((await tap(0, 'cutting')).kind, 'load-cutting');
  // E hold commits one stroke; a P tap can then move the partially cut ingredient.
  await approach(0, 'cutting'); await key(0, 'keyDown');
  for (let i = 0; i < 7; i++) await frame();
  await key(0, 'keyUp');
  for (let i = 0; i < 7; i++) await frame();
  assert.equal(await evaluate('__testGame.cuttingSystem.cuts'), 1);
  assert.equal((await tap(1, 'cutting')).kind, 'take-cut-ingredient');
  await evaluate(`(() => {
    const item = __testGame.activePlayers[1].carrySystem.carriedIngredient;
    if (item.model.userData.completedCuts !== 1 || item.model.parent !== __testGame.activePlayers[1].player.carryAnchor) throw Error('Corte ou visual perdido');
    __testGame.activePlayers[1].carrySystem.discard();
  })()`);
  // Explicit empty plate -> ingredients -> handoff -> resume -> completed sushi.
  assert.equal((await tap(0, 'assembly')).kind, 'take-preparation');
  await evaluate('void (globalThis.__transportPlate = __testGame.activePlayers[0].carrySystem.carriedIngredient)');
  assert.equal((await tap(0, 'assembly2')).kind, 'place-preparation');
  await evaluate(`__testGame.activePlayers[1].carrySystem.attach(__testGame.ingredientFactory.create('rice', 'rice_cooked'))`);
  assert.equal((await tap(1, 'assembly2')).kind, 'add-ingredient');
  assert.equal((await tap(0, 'assembly2')).kind, 'take-preparation');
  assert.ok(await evaluate(`(() => {
    const g = __testGame, plate = g.activePlayers[0].carrySystem.carriedIngredient, system = g.assemblySystems.get('assembly2');
    g.renderer.render(g.world.scene, g.camera.camera);
    return plate === __transportPlate && plate.sequence.join() === 'rice_cooked'
      && plate.model.parent === g.activePlayers[0].player.carryAnchor && plate.model.visible
      && system.ingredients.length === 0 && system.contents.children.length === 0;
  })()`));
  assert.equal((await tap(0, 'assembly3')).kind, 'place-preparation');
  assert.equal((await tap(1, 'assembly3')).kind, 'take-preparation');
  assert.ok(await evaluate('__testGame.activePlayers[1].carrySystem.carriedIngredient === __transportPlate'));
  assert.equal((await tap(1, 'assembly')).kind, 'place-preparation');
  await evaluate(`__testGame.activePlayers[0].carrySystem.attach(__testGame.ingredientFactory.create('salmon', 'salmon_cut'))`);
  assert.equal((await tap(0, 'assembly')).kind, 'finish-sushi');
  assert.equal((await tap(1, 'assembly')).kind, 'take-sushi');
  assert.ok(await evaluate(`(() => {
    const g = __testGame, plate = g.activePlayers[1].carrySystem.carriedIngredient;
    return plate === __transportPlate && plate.recipeId === 'salmon_nigiri' && plate.model.parent === g.activePlayers[1].player.carryAnchor
      && g.ingredientFactory.instances.size === 0 && g.sushiFactory.instances.size === 1;
  })()`));
  await evaluate('__testGame.activePlayers[1].carrySystem.discard()');
  console.log('OK navegador: E/P reais, toque/segurar na tábua, corte persistente, prato vazio/parcial transportado nas três bancadas, troca de jogador, conclusão e visual único.');
}
