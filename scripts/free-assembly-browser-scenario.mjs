import assert from 'node:assert/strict';

export async function verifyFreeAssemblyBrowser({ evaluate, command }) {
  await evaluate('__testGame.recipeBookUI.open()');
  assert.ok(await evaluate(`(() => {
    const g = __testGame, book = g.recipeBookUI;
    for (let page = 0; page < 3; page++) {
      book.page = page; book.render();
      if (!book.panel.textContent.includes('Adicione os ingredientes em qualquer ordem!')
        || !book.panel.querySelector('ul') || book.panel.querySelector('ol')
        || book.panel.querySelector('.recipe-book-ingredients').textContent.includes('→')
        || !book.panel.textContent.includes('Ingredientes necessários:')) return false;
    }
    const clock = g.customerSystem.clock; g.updateSimulation(10);
    return g.session.mode === 'RECIPE_BOOK' && g.customerSystem.clock === clock;
  })()`));
  await evaluate('__testGame.recipeBookUI.close()');
  await evaluate(`(() => {
    globalThis.__freeEvents = [];
    for (const actor of __testGame.activePlayers) actor.interactionSystem.onInteract = event =>
      __freeEvents.push({ kind: event.kind, success: event.success, message: event.message });
  })()`);
  const frame = () => evaluate('__testGame.updateSimulation(.05)');
  const tap = async (actor, station) => {
    await evaluate(`(() => {
      const g = __testGame, context = g.activePlayers[${actor}];
      context.input.reset(); context.interactionSystem.reset(); context.player.stopMoving();
      context.player.group.position.copy(g.world.kitchen.stations.get(${JSON.stringify(station)}).getApproachPosition());
    })()`);
    const before = await evaluate('__freeEvents.length');
    const key = actor ? { code: 'KeyP', key: 'p', windowsVirtualKeyCode: 80 } : { code: 'KeyE', key: 'e', windowsVirtualKeyCode: 69 };
    await command('Input.dispatchKeyEvent', { type: 'keyDown', ...key }); await frame();
    await command('Input.dispatchKeyEvent', { type: 'keyUp', ...key }); await frame();
    const events = await evaluate(`__freeEvents.slice(${before})`);
    assert.equal(events.length, 1); return events[0];
  };
  const make = (actor, state) => evaluate(`(() => {
    const g = __testGame, state = ${JSON.stringify(state)};
    const type = { rice_cooked: 'rice', salmon_cut: 'salmon', nori_sheet: 'nori', cucumber_cut: 'cucumber' }[state];
    g.activePlayers[${actor}].carrySystem.attach(g.ingredientFactory.create(type, state));
  })()`);
  for (const [id, sequence] of [
    ['salmon_nigiri', ['salmon_cut', 'rice_cooked']],
    ['salmon_maki', ['rice_cooked', 'salmon_cut', 'nori_sheet']],
    ['cucumber_uramaki', ['cucumber_cut', 'nori_sheet', 'rice_cooked']],
  ]) {
    await evaluate(`(() => {
      const g = __testGame;
      g.players.forEach((actor, i) => { actor.input.reset(); actor.player.stopMoving(); actor.player.group.position.set(i ? 6 : -6, 0, 6); });
      g.preparation.updateUI(g.camera.camera, g.world.kitchen.stations.get('assembly'), g.activePlayers[0].carrySystem);
      const select = document.querySelector('.assembly-panel select');
      if (select.disabled || getComputedStyle(select).pointerEvents !== 'auto') throw Error('Escolha de receita indisponível');
      select.value = ${JSON.stringify(id)}; select.dispatchEvent(new Event('change', { bubbles: true }));
      if (g.assemblySystem.targetRecipeId !== ${JSON.stringify(id)}) throw Error('Escolha da receita não aplicada');
    })()`);
    let station = 'assembly';
    for (const [step, state] of sequence.entries()) {
      await make(step % 2, state);
      const result = await tap(step % 2, station);
      assert.equal(result.kind, step === sequence.length - 1 ? 'finish-sushi' : 'add-ingredient');
      if (step === 0) {
        assert.equal((await tap(0, station)).kind, 'take-preparation');
        station = 'assembly2'; assert.equal((await tap(0, station)).kind, 'place-preparation');
        assert.ok(await evaluate(`(() => {
          const g = __testGame, system = g.assemblySystems.get('assembly2');
          g.preparation.updateUI(g.camera.camera, system.station, g.activePlayers[0].carrySystem);
          const select = document.querySelector('.assembly-panel select');
          return system.targetRecipeId === ${JSON.stringify(id)} && select.disabled && select.value === ${JSON.stringify(id)};
        })()`));
      }
    }
    await make(0, 'rice_cooked');
    const rejected = await tap(0, station);
    assert.equal(rejected.success, false); assert.equal(rejected.message, 'Este prato já está pronto!');
    assert.ok(await evaluate('__testGame.activePlayers[0].carrySystem.carriedIngredient?.state === "rice_cooked"'));
    await evaluate('__testGame.activePlayers[0].carrySystem.discard()');
    assert.equal((await tap(1, station)).kind, 'take-sushi');
    assert.equal(await evaluate('__testGame.activePlayers[1].carrySystem.carriedIngredient.recipeId'), id);
    await evaluate('__testGame.activePlayers[1].carrySystem.discard()');
  }
  console.log('OK navegador: manual sem ordem obrigatória, seletor da bancada, E/P, nigiri inverso, maki com alga por último, uramaki inverso, receita persistente no transporte e prato pronto bloqueado.');
}
