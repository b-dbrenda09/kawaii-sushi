import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Execute com o servidor Vite ativo. Usa Chrome headless e CDP, sem bibliotecas extras.
const browserPath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = process.argv[2] ?? 'http://127.0.0.1:5173';
const profile = await mkdtemp(join(tmpdir(), 'kawaii-browser-'));
const browser = spawn(browserPath, ['--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
{ windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Chrome nÃ£o iniciou: ${stderr.slice(-1000)}`)), 20000);
    browser.once('error', (error) => { clearTimeout(timer); reject(error); });
    browser.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolveEndpoint(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolveRequest, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve: resolveRequest, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params = {}) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const waitFor = async (expression, message, timeout = 8000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await delay(80);
    }
    assert.fail(message);
  };
  await command('Runtime.enable');
  await command('Log.enable');
  await command('Page.enable');
  // Captura somente a ligaÃ§Ã£o de Game.tick, restaurando bind imediatamente.
  // O jogo fica inalterado; este hook existe apenas no documento do teste.
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const bind = Function.prototype.bind;
    Function.prototype.bind = function(target, ...args) {
      const bound = Reflect.apply(bind, this, [target, ...args]);
      if (this.name === 'tick' && target?.constructor?.name === 'Game') {
        globalThis.__kawaiiTestGame = target;
        Function.prototype.bind = bind;
      }
      return bound;
    };
  })();` });
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await mkdir('artifacts', { recursive: true });
  for (const mode of ['solo', 'coop']) {
    await command('Page.navigate', { url });
    await waitFor(`Boolean(document.querySelector('[data-mode=${mode}]'))`, 'Mode menu missing');
    assert.equal(await evaluate('document.title'), 'Hello Kitty Sushi');
    assert.equal(await evaluate('document.querySelector(".mode-panel h1").textContent'), 'HELLO KITTY SUSHI');
    await evaluate(`document.querySelector('[data-mode=${mode}]').click()`);
    await waitFor('Boolean(globalThis.__kawaiiTestGame?.customerSystem)', 'Game missing');
    const count = await evaluate(`(() => {
      globalThis.g=__kawaiiTestGame;g.stop();g.session.play();g.gameTimer.remaining=60;
      const system=g.customerSystem;system.phase=g.difficulty.index;system.nextArrival=Infinity;
      globalThis.guest=system.spawn();
      globalThis.originalProjection=g.camera.camera.projectionMatrix.toArray().join(',');
      g.resultsUI.update(g.gameTimer);
      g.renderer.render(g.world.scene,g.camera.camera);
      return g.players.length;
    })()`);
    assert.equal(count, mode==='coop'?2:1);
    const rendering = await evaluate(`(() => {
      const garden=g.world.exterior.group, door=g.customerSystem.entrance.group;
      garden.visible=false;door.visible=false;g.renderer.render(g.world.scene,g.camera.camera);
      const baseline=g.renderer.info.render.calls;
      garden.visible=true;door.visible=true;g.renderer.render(g.world.scene,g.camera.camera);
      return {baseline,decorated:g.renderer.info.render.calls};
    })()`);
    assert.ok(rendering.decorated-rendering.baseline<120, 'Garden and door keep bounded draw calls');
    console.log(JSON.stringify({mode,rendering}));
    assert.equal(await evaluate('guest.model.position.x>g.world.collisionBounds.maxX && guest.orderId===null'), true);
    const shot = async name => {
      await evaluate('g.updateOrderUI();g.renderer.render(g.world.scene,g.camera.camera)');
      const capture=await command('Page.captureScreenshot',{format:'png'});
      await writeFile(`artifacts/entrance-${mode}-${name}.png`,Buffer.from(capture.data,'base64'));
    };
    await shot('outside');
    const report=await evaluate(`(() => {
      const system=g.customerSystem;
      let minimum=100;
      for(let i=0;i<2400&&!guest.orderId;i++) {
        system.update(1/60);
        if(guest.model.position.distanceTo(system.route.door)<.4) minimum=Math.min(minimum,system.entrance.openAmount);
      }
      const order=system.orderSystem.getActiveOrder(guest.id);
      return {arrived:guest.arrivalComplete,minimum,patience:order?.remainingTime,max:order?.maxPatience};
    })()`);
    assert.equal(report.arrived,true);assert.ok(report.minimum>=.98);assert.equal(report.patience,report.max);
    assert.equal(await evaluate(`(() => {
      const system=g.customerSystem;
      for(let n=1;n<4;n++) {
        const next=system.spawn();if(!next)return false;
        for(let i=0;i<2400&&!next.orderId;i++)system.update(1/60);
        if(!next.orderId)return false;
      }
      return system.orderSystem.getActiveOrders().length===4;
    })()`),true);
    await shot('counter');
    assert.equal(await evaluate(`(async () => {
      const order=g.orderSystem.getActiveOrder(guest.id);
      const {RECIPES}=await import('/src/game/RecipeSystem.js');
      const dish=g.sushiFactory.create(RECIPES.find(recipe=>recipe.id===order.recipeId));
      g.carrySystem.attach(dish);
      if (!g.deliverySystem.interact().success) return false;
      const challenge=g.questionSystem.active;
      g.questionSystem.select(challenge.question.respostaCorreta,challenge.playerId);
      const answered=g.questionSystem.confirm(challenge.playerId);g.questionSystem.cancel();return answered.success;
    })()`),true);
    const exitReport=await evaluate(`(() => {
      const system=g.customerSystem;
      for(let i=0;i<2400&&guest.state!=='REMOVED';i++)system.update(1/60);
      for(const order of system.orderSystem.getActiveOrders())order.remainingTime=.01;
      for(let i=0;i<10000&&system.customers.size;i++)system.update(1/60);
      system.update(1);
      return {removed:guest.state==='REMOVED',outside:guest.model.position.distanceTo(system.entry)<.001,
        empty:system.customers.size===0,closed:system.entrance.openAmount===0,
        camera:originalProjection===g.camera.camera.projectionMatrix.toArray().join(',')};
    })()`);
    assert.deepEqual(exitReport,{removed:true,outside:true,empty:true,closed:true,camera:true});
    await shot('exited');
    for(const [width,height] of [[1920,1080],[375,812]]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await evaluate('g.resize()');await shot(String(width));
    }
    await evaluate('g.dispose()');
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  }
  assert.deepEqual(errors,[]);
  await send('Browser.close');
  console.log('OK: browser solo/coop, Hello Kitty Sushi branding, outdoor arrival, animated door, 4 active orders, actual delivery, expiry, outside exit, unchanged camera and no console errors.');
} finally {
  socket?.close();
  if (browser.exitCode === null) await Promise.race([once(browser, 'exit'), delay(3000)]);
  if (browser.exitCode === null) browser.kill();
  // O Ãºnico diretÃ³rio removido Ã© o perfil temporÃ¡rio criado por este teste.
  const absoluteProfile = resolve(profile);
  assert.equal(dirname(absoluteProfile), resolve(tmpdir()));
  assert.ok(absoluteProfile.split(/[\\/]/).at(-1).startsWith('kawaii-browser-'));
  try {
    await rm(absoluteProfile, { recursive: true, force: true, maxRetries: 1, retryDelay: 100 });
  } catch (error) {
    // Crashpad pode manter arquivos abertos apÃ³s o Chrome sair no Windows.
    if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    console.warn('Perfil temporÃ¡rio do Chrome ainda em uso; mantido no diretÃ³rio temporÃ¡rio.');
  }
}


