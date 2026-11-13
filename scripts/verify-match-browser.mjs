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

  assert.equal(await evaluate('__kawaiiTestGame.gameTimer.text'),'05:00');
  await evaluate('document.querySelector("[data-action=play]").click()');await delay(1050);
  assert.ok(await evaluate('__kawaiiTestGame.gameTimer.remaining<300 && __kawaiiTestGame.gameTimer.remaining>298'));
  for(const book of [false,true]) {
    await evaluate(book?'__kawaiiTestGame.recipeBookUI.open()':'__kawaiiTestGame.session.pause()');
    const time=await evaluate('__kawaiiTestGame.gameTimer.remaining');await delay(200);
    assert.equal(await evaluate('__kawaiiTestGame.gameTimer.remaining'),time);
    await evaluate(book?'__kawaiiTestGame.recipeBookUI.close()':'__kawaiiTestGame.session.play()');await delay(100);
    assert.ok(await evaluate('__kawaiiTestGame.gameTimer.remaining')>time-.3);
  }
  for(const [time,level] of [[30,'warning'],[10,'urgent']]) {
    await evaluate('__kawaiiTestGame.gameTimer.remaining='+time+';__kawaiiTestGame.updateSimulation(0)');
    assert.equal(await evaluate('document.querySelector(".match-timer").dataset.level'),level);
  }
  await evaluate('__kawaiiTestGame.controlSettings.setMovementMode("character")');
  const camera=await evaluate('__kawaiiTestGame.camera.camera.position.toArray()');
  for(let round=0;round<3;round++) {
    await evaluate('globalThis.g=__kawaiiTestGame;g.customerSystem.update(25)');
    assert.ok(await evaluate('g.results.generated>0'));
    const rect=await evaluate('JSON.stringify(g.renderer.domElement.getBoundingClientRect())');
    await evaluate('g.gameTimer.remaining=.001;g.updateSimulation(1)');
    assert.equal(await evaluate('g.session.state'),'FINISHED');assert.equal(await evaluate('g.gameTimer.remaining'),0);
    assert.equal(await evaluate('g.results.final.expired'),0);
    assert.equal(await evaluate('document.querySelector(".results-overlay").hidden'),false);
    assert.equal(await evaluate('JSON.stringify(g.renderer.domElement.getBoundingClientRect())'),rect);
    const frozen=await evaluate('JSON.stringify([g.scoreSystem.score,g.orderSystem.getActiveOrders(),g.customerSystem.clock,g.world.player.group.position])');
    await evaluate('g.session.play();g.recipeBookUI.open();g.updateSimulation(50);g.scoreSystem.change(500,"test");g.deliverySystem.interact();g.finish()');await delay(100);
    assert.equal(await evaluate('JSON.stringify([g.scoreSystem.score,g.orderSystem.getActiveOrders(),g.customerSystem.clock,g.world.player.group.position])'),frozen);
    await evaluate('document.querySelector(".results-panel button").click();globalThis.__kawaiiTestGame=g.nextGame');
    for(const expression of ['__kawaiiTestGame.scoreSystem.score','__kawaiiTestGame.results.generated','__kawaiiTestGame.ingredientFactory.instances.size+__kawaiiTestGame.sushiFactory.instances.size']) assert.equal(await evaluate(expression),0);
    assert.equal(await evaluate('__kawaiiTestGame.gameTimer.text'),'05:00');
    assert.equal(await evaluate('__kawaiiTestGame.controlSettings.movementMode'),'character');
    assert.equal(await evaluate('document.querySelectorAll("canvas").length'),1);
    assert.equal(await evaluate('document.querySelectorAll(".results-overlay").length'),1);
    assert.deepEqual(await evaluate('__kawaiiTestGame.camera.camera.position.toArray()'),camera);
  }
  assert.deepEqual(errors,[]);await evaluate('__kawaiiTestGame.dispose()');await send('Browser.close');
  console.log('OK: Chrome: tempo, pausa, receitas, avisos, encerramento, bloqueios, resultados, pendentes, tres reinicios, preferencias, camera, canvas e console.');
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
