import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

export async function verifyServiceBrowser({ evaluate, command, delay }) {
  assert.equal(await evaluate(`(() => {
    g.stop();
    const system = g.customerSystem;
    globalThis.__serviceRestore = { remaining: g.gameTimer.remaining, clock: system.clock,
      nextArrival: system.nextArrival, lastAttempt: system.lastAttempt, phase: system.phase,
      typeIndex: system.typeIndex, random: g.difficulty.random };
    system.customers.forEach(customer => { system.orderSystem.removeForCustomer(customer.id); customer.dispose(); });
    system.customers.clear(); system.slots.forEach(slot => slot.customerId = null); system.transitId = null;
    g.orderUI.entries.clear(); g.orderUI.retiring.clear(); g.orderUI.root.replaceChildren();
    g.gameTimer.remaining = 60; system.phase = g.difficulty.index; system.nextArrival = Infinity;
    const before = g.camera.camera.projectionMatrix.toArray().join(',');
    const species = ['rabbit', 'bear', 'cat', 'dog'];
    const indices = [0, 1, 3, 4];
    const samples = [0, .6, .9, .6];
    for (let i = 0; i < 4; i++) {
      system.typeIndex = indices[i]; g.difficulty.random = () => samples[i];
      const customer = system.spawn();
      if (!customer || customer.type !== species[i]) throw new Error('Missing customer species');
      for (let step = 0; !customer.orderId && step < 2400; step++) system.update(1 / 60);
      if (!customer.orderId) throw new Error('Customer did not reach the counter through the garden');
    }
    g.resultsUI.update(g.gameTimer); g.updateOrderUI(); g.renderer.render(g.world.scene, g.camera.camera);
    if (before !== g.camera.camera.projectionMatrix.toArray().join(',')) throw new Error('Arrival moved camera');
    return g.orderSystem.getActiveOrders().length === 4 && g.difficulty.index === 2;
  })()`), true);
  assert.equal(await evaluate(`(() => {
    const cards = [...document.querySelectorAll('.order-card:not(.is-leaving)')];
    return cards.length === 4 && new Set(cards.map(card => card.dataset.orderId)).size === 4
      && ['normal', 'urgent', 'speed'].every(type => cards.some(card => card.dataset.type === type))
      && cards.every(card => card.querySelector('.order-bonus').textContent.startsWith('Bônus +'))
      && cards.filter(card => card.dataset.type === 'urgent').every(card => !card.querySelector('.order-new').hidden);
  })()`), true);
  // Measure settled cards, rather than their offscreen entrance animation.
  await evaluate(`Promise.all([...document.querySelectorAll('.order-card')]
    .flatMap(card => card.getAnimations()).map(animation => animation.finished.catch(() => {})))`);
  await mkdir('artifacts', { recursive: true });
  for (const [width, height] of [[1440, 1000], [1280, 720], [390, 844], [812, 375], [768, 1024]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(100);
    // A zero-time game frame also reprojects P1/P2 labels after the viewport changes.
    await evaluate('g.resize(); g.previousTime = null; g.running = true; g.tick(performance.now()); g.stop()');
    assert.equal(await evaluate(`(() => {
      const rect = g.renderer.domElement.getBoundingClientRect();
      const center = g.camera.bounds.getCenter(g.world.player.group.position.clone()).project(g.camera.camera);
      return Math.abs(rect.width - innerWidth) < 1 && Math.abs(rect.height - innerHeight) < 1
        && Math.abs(rect.left) < 1 && Math.abs(rect.top) < 1
        && Math.abs(center.x) < 1e-8 && Math.abs(center.y) < 1e-8
        && g.world.players.every(player => player.modelScale === .8);
    })()`), true, 'Full canvas, centered geometry and reduced character scales');
    for (const count of [3, 4]) {
    await evaluate(`(() => {
      const orders = g.orderSystem.getActiveOrders().slice(0, ${count});
      g.orderUI.update({ getActiveOrders: () => orders, getOrder: id => g.orderSystem.getOrder(id) }, g.customerSystem.customers);
    })()`);
    await evaluate(`Promise.all([...document.querySelectorAll('.order-card')]
      .flatMap(card => card.getAnimations()).map(animation => animation.finished.catch(() => {})))`);
    const layout = await evaluate(`(() => {
      const cards = [...document.querySelectorAll('.order-card:not(.is-leaving)')];
      return cards.map(card => { const box = card.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
          width: box.width, viewportWidth: innerWidth, viewportHeight: innerHeight,
          pointer: getComputedStyle(card).pointerEvents }; });
    })()`);
    assert.ok(layout.length === count && layout.every(box => box.left >= 0 && box.right <= box.viewportWidth
      && box.top >= 0 && box.bottom <= box.viewportHeight && box.width >= 150 && box.pointer === 'none'),
    `${count} cards fit ${width}x${height}: ${JSON.stringify(layout)}`);
    const covered = await evaluate(`(() => {
      const overlays = [...document.querySelectorAll('.order-card:not(.is-leaving), .score-hud, .match-timer')]
        .map(element => element.getBoundingClientRect());
      const points = [...g.world.kitchen.stations.values()].map(station => ({
        name: station.id, point: station.position.clone().setY(station.collider.top)
      }));
      for (const player of g.world.players) points.push({ name: player.id, point: player.head.getWorldPosition(player.group.position.clone()) });
      for (const customer of g.customerSystem.customers.values()) points.push({ name: customer.id, point: customer.rig.head.getWorldPosition(customer.model.position.clone()) });
      return points.filter(({ point }) => {
        point.project(g.camera.camera);
        const x = (point.x + 1) * innerWidth / 2, y = (1 - point.y) * innerHeight / 2;
        return x < 0 || x > innerWidth || y < 0 || y > innerHeight
          || overlays.some(box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
      }).map(({ name }) => name);
    })()`);
    assert.deepEqual(covered, [], `Stations, players and clients clear the HUD at ${width}x${height}`);
    }
    const { data } = await command('Page.captureScreenshot', { format: 'png' });
    const mode = await evaluate('g.gameMode');
    await writeFile(`artifacts/service-${mode}-${width}.png`, Buffer.from(data, 'base64'));
  }
  await evaluate(`g.session.pause(); globalThis.__serviceFrozen = JSON.stringify({
    phase: g.difficulty.index, time: g.gameTimer.remaining,
    orders: g.orderSystem.getActiveOrders().map(order => order.remainingTime),
    customers: [...g.customerSystem.customers.values()].map(customer => customer.elapsed)
  }); g.updateSimulation(15)`);
  assert.equal(await evaluate(`JSON.stringify({ phase: g.difficulty.index, time: g.gameTimer.remaining,
    orders: g.orderSystem.getActiveOrders().map(order => order.remainingTime),
    customers: [...g.customerSystem.customers.values()].map(customer => customer.elapsed)
  }) === __serviceFrozen`), true);
  await evaluate(`(() => {
    const system = g.customerSystem;
    system.customers.forEach(customer => { system.orderSystem.removeForCustomer(customer.id); customer.dispose(); });
    system.customers.clear(); system.slots.forEach(slot => slot.customerId = null); system.transitId = null;
    g.gameTimer.remaining = __serviceRestore.remaining; system.clock = __serviceRestore.clock;
    g.resultsUI.update(g.gameTimer);
    system.nextArrival = __serviceRestore.nextArrival; system.lastAttempt = __serviceRestore.lastAttempt;
    system.phase = __serviceRestore.phase; system.typeIndex = __serviceRestore.typeIndex;
    g.difficulty.random = __serviceRestore.random;
    g.orderUI.entries.clear(); g.orderUI.retiring.clear(); g.orderUI.root.replaceChildren(); g.updateOrderUI();
    delete globalThis.__serviceRestore; delete globalThis.__serviceFrozen;
    g.session.play(); g.start();
  })()`);
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
}
