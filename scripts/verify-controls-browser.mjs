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
  const press=async(code,key,n)=>{await command('Input.dispatchKeyEvent',{type:'keyDown',code,key,windowsVirtualKeyCode:n});await command('Input.dispatchKeyEvent',{type:'keyUp',code,key,windowsVirtualKeyCode:n});};
  const cameraBefore=await evaluate('JSON.stringify({position:__kawaiiTestGame.camera.camera.position.toArray(),rotation:__kawaiiTestGame.camera.camera.quaternion.toArray(),projection:__kawaiiTestGame.camera.camera.projectionMatrix.toArray(),canvas:__kawaiiTestGame.renderer.domElement.getBoundingClientRect()})');
  for(const mode of ['map','camera','character']){
    await press('Escape','Escape',27);
    await evaluate('document.querySelector("[data-action=settings]").click();document.querySelector("[data-action=controls]").click()');
    assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'CONTROLS');
    const clock=await evaluate('__kawaiiTestGame.customerSystem.clock');
    await evaluate('document.querySelector("[data-movement-mode='+mode+']").click()');
    await delay(100);assert.equal(await evaluate('__kawaiiTestGame.customerSystem.clock'),clock);
    assert.equal(await evaluate('__kawaiiTestGame.controlSettings.movementMode'),mode);
    assert.equal(await evaluate('document.querySelector("[data-movement-mode='+mode+']").getAttribute("aria-pressed")'),'true');
    await press('Escape','Escape',27);assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'SETTINGS');
    await press('Escape','Escape',27);assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'PAUSED');
    await evaluate('document.querySelector("[data-action=resume]").click()');
    for(const [code,key,n] of [['KeyW','w',87],['ArrowUp','ArrowUp',38],['KeyA','a',65],['KeyS','s',83]]){
      await evaluate('(()=>{const g=__kawaiiTestGame;g.input.reset();g.world.player.stopMoving();g.world.player.group.position.set(-3,0,2.4);g.world.player.group.rotation.y=1.2;globalThis.startPosition=g.world.player.group.position.clone();})()');
      await command('Input.dispatchKeyEvent',{type:'keyDown',code,key,windowsVirtualKeyCode:n});
      await evaluate('globalThis.testDirection=__kawaiiTestGame.input.getDirection().clone()');
      await waitFor('__kawaiiTestGame.world.player.group.position.clone().sub(startPosition).dot(testDirection)>.05','Movement '+mode+' '+code);
      await command('Input.dispatchKeyEvent',{type:'keyUp',code,key,windowsVirtualKeyCode:n});
      if(mode==='character')assert.equal(await evaluate('__kawaiiTestGame.world.player.group.rotation.y'),1.2);
    }
    assert.equal(await evaluate('JSON.stringify({position:__kawaiiTestGame.camera.camera.position.toArray(),rotation:__kawaiiTestGame.camera.camera.quaternion.toArray(),projection:__kawaiiTestGame.camera.camera.projectionMatrix.toArray(),canvas:__kawaiiTestGame.renderer.domElement.getBoundingClientRect()})'),cameraBefore);
  }
  await command('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyQ',key:'q',windowsVirtualKeyCode:81});
  await waitFor('__kawaiiTestGame.world.player.group.rotation.y>1.21','Q rotates facing');
  await command('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyQ',key:'q',windowsVirtualKeyCode:81});
  await evaluate('(()=>{const g=__kawaiiTestGame;g.input.reset();g.world.player.stopMoving();g.world.player.group.position.copy(g.world.kitchen.stations.get("riceBox").getApproachPosition());})()');
  await waitFor('__kawaiiTestGame.interactionSystem.activeStation?.id==="riceBox"','Selected rice box');
  assert.equal(await evaluate('__kawaiiTestGame.world.kitchen.group.children.filter(o=>o.name==="selected-station-highlight"&&o.visible).length'),1);
  await press('KeyE','e',69);await waitFor('__kawaiiTestGame.carrySystem.carriedIngredient?.type==="rice"','E works after settings');
  await evaluate('__kawaiiTestGame.carrySystem.discard();__kawaiiTestGame.customerSystem.update(40)');
  await waitFor('__kawaiiTestGame.orderUI.entries.size>0','Order HUD still works');
  await evaluate('document.querySelector(".recipe-book-button").click()');assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'RECIPE_BOOK');
  await press('Escape','Escape',27);assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'PLAYING');
  await evaluate('globalThis.__kawaiiTestGame=null');await command('Page.reload');
  await waitFor('Boolean(globalThis.__kawaiiTestGame?.controlSettings)','Reload');
  assert.equal(await evaluate('__kawaiiTestGame.controlSettings.movementMode'),'character');
  assert.deepEqual(errors,[]);
  console.log('OK Chrome: menu Configuracoes/Controles, tres modos reais, WASD/setas, strafe/re, giro Q, pausa, troca sem reinicio, persistencia apos reload, E, destaque unico, pedidos/livro e camera/canvas fixos, console limpo.');
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
