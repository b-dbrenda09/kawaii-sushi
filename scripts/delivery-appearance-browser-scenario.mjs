import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function verifyDeliveryAppearanceBrowser({ evaluate, command, mode }) {
  const appearance = await evaluate(`(() => {
    const g = __testGame, station = g.world.kitchen.stations.get('delivery');
    const parts = name => station.model.children.filter(mesh => mesh.name === name);
    return { noLiner: !g.world.scene.getObjectByName('delivery-table-liner'),
      trays: parts('delivery-tray').map(mesh => mesh.material.color.getHexString()),
      insets: parts('delivery-tray-inset').map(mesh => mesh.material.color.getHexString()),
      top: station.model.getObjectByName('work-surface').material.color.getHexString(),
      noTextures: station.model.children.every(mesh => !mesh.material?.map),
      assemblyPlates: [...g.assemblySystems.values()].every(system => system.preview.children.slice(0, 2).every(mesh => mesh.material.color.getHexString() === 'ffb6d5')),
      dimensions: station.localDimensions, collider: JSON.stringify(station.collider), storage: station.storage };
  })()`);
  assert.ok(appearance.noLiner && appearance.noTextures && appearance.assemblyPlates);
  assert.deepEqual(appearance.trays, ['fff4de', 'fff4de', 'fff4de']);
  assert.deepEqual(appearance.insets, ['ebcba3', 'ebcba3', 'ebcba3']);
  assert.equal(appearance.top, 'ebcba3');
  assert.deepEqual(appearance.dimensions, { width: 6, depth: 1.4, height: 1.16 });
  assert.equal(appearance.storage, null);

  // Render an actual finished dish on an existing tray, then pick it up and deliver it with E/P.
  await evaluate(`(async () => {
    const g = __testGame, system = g.customerSystem;
    globalThis.__linerGuest = system.spawn();
    if (!__linerGuest) throw Error('Cliente de teste não criado');
    for (let i = 0; !__linerGuest.orderId && i < 200; i++) system.update(.05);
    const order = system.orderSystem.getActiveOrder(__linerGuest.id);
    const { RECIPES } = await import('/src/game/RecipeSystem.js');
    globalThis.__linerDish = g.sushiFactory.create(RECIPES.find(recipe => recipe.id === order.recipeId));
    const station = g.world.kitchen.stations.get('delivery');
    __linerDish.model.position.set(0, 1.221, .02); station.model.add(__linerDish.model);
    g.updateOrderUI(); g.renderer.render(g.world.scene, g.camera.camera);
  })()`);
  const clip = await evaluate(`(() => {
    const g = __testGame, station = g.world.kitchen.stations.get('delivery');
    const points = [[-3, 1.16, -.7], [3, 1.16, -.7], [-3, 1.6, .7], [3, 1.6, .7]].map(coords => {
      const point = g.world.player.group.position.clone().set(...coords);
      station.model.localToWorld(point); point.project(g.camera.camera);
      return [(point.x + 1) * innerWidth / 2, (1 - point.y) * innerHeight / 2];
    });
    const x = Math.max(0, Math.floor(Math.min(...points.map(p => p[0])) - 20));
    const y = Math.max(0, Math.floor(Math.min(...points.map(p => p[1])) - 20));
    return { x, y, width: Math.min(innerWidth - x, Math.ceil(Math.max(...points.map(p => p[0])) + 20 - x)),
      height: Math.min(innerHeight - y, Math.ceil(Math.max(...points.map(p => p[1])) + 20 - y)), scale: 3 };
  })()`);
  await mkdir('artifacts', { recursive: true });
  const screenshot = await command('Page.captureScreenshot', { format: 'png', clip });
  await writeFile(`artifacts/delivery-restored-${mode}.png`, Buffer.from(screenshot.data, 'base64'));
  const actor = mode === 'coop' ? 1 : 0;
  await evaluate(`(() => {
    const g = __testGame, actor = g.activePlayers[${actor}], station = g.world.kitchen.stations.get('delivery');
    actor.input.reset(); actor.interactionSystem.reset(); actor.player.stopMoving();
    actor.player.group.position.copy(station.getApproachPosition());
    actor.carrySystem.attach(__linerDish);
  })()`);
  const key = actor ? { code: 'KeyP', key: 'p', windowsVirtualKeyCode: 80 } : { code: 'KeyE', key: 'e', windowsVirtualKeyCode: 69 };
  await command('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
  await evaluate('__testGame.updateSimulation(.05)');
  await command('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  assert.ok(await evaluate(`(() => {
    const g = __testGame, question = g.questionSystem.active;
    if (!question || g.session.mode !== 'QUESTION' || question.playerId !== g.activePlayers[${actor}].player.id) return false;
    g.questionSystem.select(question.question.respostaCorreta, question.playerId);
    const result = g.questionSystem.confirm(question.playerId); g.questionSystem.cancel();
    return result.success && result.kind === 'delivery' && __linerDish.disposed && g.session.mode === 'PLAYING';
  })()`));
  assert.equal(await evaluate('JSON.stringify(__testGame.world.kitchen.stations.get("delivery").collider)'), appearance.collider);
  console.log(`OK navegador ${mode}: bancada e bandejas nas cores originais, sem forro ou textura, pratos de montagem pastel preservados, colisão intacta e entrega real com Cisco via ${actor ? 'P' : 'E'}.`);
}
