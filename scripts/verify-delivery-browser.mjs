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
    const timer = setTimeout(() => reject(new Error(`Chrome não iniciou: ${stderr.slice(-1000)}`)), 20000);
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
  // Captura somente a ligação de Game.tick, restaurando bind imediatamente.
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
  await command('Page.navigate', { url });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (await evaluate('Boolean(document.querySelector("canvas"))')) { ready = true; break; }
    await delay(200);
  }
  assert.ok(ready, 'Canvas não foi criado.');
  assert.ok(await evaluate('Boolean(globalThis.__kawaiiTestGame)'));
  assert.equal(await evaluate('__kawaiiTestGame.session.mode'), 'MENU');
  await evaluate('document.querySelector("[data-action=play]").click()');
  await delay(500);
  await evaluate(`(()=>{
    const g=__kawaiiTestGame;
    g.customerSystem.update(40);
    g.input.reset();g.world.player.stopMoving();
    const order=g.orderSystem.getActiveOrders()[0];
    if(!order)throw new Error('Sem pedido');
    globalThis.testOrder=order;
    return import('/src/game/RecipeSystem.js').then(({RECIPES})=>{
      const dish=g.sushiFactory.create(RECIPES.find(r=>r.id===order.recipeId));
      const bench=g.world.kitchen.stations.get('assembly');
      bench.storedIngredient=dish;bench.storage.anchor.add(dish.model);
      g.carrySystem.retrieve(bench);
      g.world.player.group.position.copy(g.world.kitchen.stations.get('delivery').getApproachPosition());
    });
  })()`);
  await waitFor('__kawaiiTestGame.interactionSystem.activeStation?.id==="delivery"','Balc?o n?o selecionado');
  assert.match(await evaluate('document.querySelector(".interaction-hint").textContent'),/Entregar sushi/);
  const canvasBefore=await evaluate('JSON.stringify(__kawaiiTestGame.renderer.domElement.getBoundingClientRect())');
  await command('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyE',key:'e',windowsVirtualKeyCode:69});
  await command('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyE',key:'e',windowsVirtualKeyCode:69});
  await waitFor('testOrder.state==="COMPLETED"','Entrega n?o concluiu');
  assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient'),null);
  assert.ok(await evaluate('__kawaiiTestGame.scoreSystem.score>=100'));
  await waitFor('!__kawaiiTestGame.orderUI.entries.has(testOrder.id)','Cart?o n?o saiu');
  assert.equal(await evaluate('JSON.stringify(__kawaiiTestGame.renderer.domElement.getBoundingClientRect())'),canvasBefore);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".score-hud")).position'),'fixed');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".score-hud")).pointerEvents'),'none');
  await evaluate('__kawaiiTestGame.world.player.group.position.set(-3,0,2.4)');
  const x=await evaluate('__kawaiiTestGame.world.player.group.position.x');
  await command('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyD',key:'d',windowsVirtualKeyCode:68});
  await delay(200);
  assert.ok(await evaluate('__kawaiiTestGame.world.player.group.position.x')>x);
  await command('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyD',key:'d',windowsVirtualKeyCode:68});
  await command('Input.dispatchKeyEvent',{type:'keyDown',code:'Escape',key:'Escape',windowsVirtualKeyCode:27});
  await command('Input.dispatchKeyEvent',{type:'keyUp',code:'Escape',key:'Escape',windowsVirtualKeyCode:27});
  const frozen=await evaluate('JSON.stringify([__kawaiiTestGame.customerSystem.clock,__kawaiiTestGame.scoreSystem.score,__kawaiiTestGame.deliverySystem.cooldown])');
  await delay(200);
  assert.equal(await evaluate('JSON.stringify([__kawaiiTestGame.customerSystem.clock,__kawaiiTestGame.scoreSystem.score,__kawaiiTestGame.deliverySystem.cooldown])'),frozen);
  await evaluate('document.querySelector("[data-action=resume]").click()');
  assert.equal(await evaluate('__kawaiiTestGame.input.keys.size'),0);
  assert.deepEqual(errors,[]);
  console.log('OK navegador: retirada do prato, E real no balc?o, HUD/score, cart?o correspondente, canvas fixo, movimento durante feedback, ESC/retomada e console sem erros.');
  await evaluate('__kawaiiTestGame.dispose()');await send('Browser.close');
} finally {
  socket?.close();
  if (browser.exitCode === null) await Promise.race([once(browser, 'exit'), delay(3000)]);
  if (browser.exitCode === null) browser.kill();
  // O único diretório removido é o perfil temporário criado por este teste.
  const absoluteProfile = resolve(profile);
  assert.equal(dirname(absoluteProfile), resolve(tmpdir()));
  assert.ok(absoluteProfile.split(/[\\/]/).at(-1).startsWith('kawaii-browser-'));
  try {
    await rm(absoluteProfile, { recursive: true, force: true, maxRetries: 1, retryDelay: 100 });
  } catch (error) {
    // Crashpad pode manter arquivos abertos após o Chrome sair no Windows.
    if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    console.warn('Perfil temporário do Chrome ainda em uso; mantido no diretório temporário.');
  }
}
