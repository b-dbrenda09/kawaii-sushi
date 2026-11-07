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
  const key=async(type,code,key,number)=>command('Input.dispatchKeyEvent',{type,code,key,windowsVirtualKeyCode:number});
  const press=async(code,k,n)=>{await key('keyDown',code,k,n);await key('keyUp',code,k,n);};
  const snapshot=()=>evaluate(`JSON.stringify({clock:__kawaiiTestGame.customerSystem.clock,score:__kawaiiTestGame.scoreSystem.score,player:__kawaiiTestGame.world.player.group.position.toArray(),orders:[...__kawaiiTestGame.orderSystem.orders.values()],camera:__kawaiiTestGame.camera.camera.projectionMatrix.toArray(),canvas:__kawaiiTestGame.renderer.domElement.getBoundingClientRect()})`);
  await evaluate('document.querySelector(".recipe-book-button").click()');
  assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'RECIPE_BOOK');
  assert.equal(await evaluate('__kawaiiTestGame.input.enabled'),false);
  const before=await snapshot();
  await key('keyDown','KeyW','w',87);await press('KeyE','e',69);await press('Space',' ',32);await delay(250);
  assert.equal(await snapshot(),before,'Book must freeze all simulation');
  await key('keyUp','KeyW','w',87);
  const recipes=await evaluate(`import('/src/game/RecipeSystem.js').then(m=>m.RECIPES.map(r=>({id:r.id,name:r.name,line:r.sequence.map(s=>m.PREPARED_NAMES[s]).join(r.orderIndependent ? ' + ' : ' \u2192 ')})))`);
  for(let page=0;page<recipes.length;page++){
    assert.equal(await evaluate('document.querySelector(".recipe-book").dataset.recipeId'),recipes[page].id);
    assert.equal(await evaluate('document.querySelector(".recipe-book h2").textContent'),recipes[page].name);
    assert.equal(await evaluate('document.querySelector(".recipe-book-ingredients").textContent'),recipes[page].line);
    assert.ok(await evaluate('document.querySelector(".recipe-book ol").textContent.includes("E")'));
    if(page<recipes.length-1)await evaluate('document.querySelector("[data-book-action=next]").click()');
  }
  await evaluate('document.querySelector("[data-book-action=previous]").click()');
  assert.equal(await evaluate('__kawaiiTestGame.recipeBookUI.page'),1);
  await press('Escape','Escape',27);
  assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'PLAYING');
  assert.equal(await evaluate('__kawaiiTestGame.input.keys.size'),0);
  await evaluate('document.querySelector(".recipe-book-button").click()');
  assert.equal(await evaluate('__kawaiiTestGame.recipeBookUI.page'),1);
  await evaluate('document.querySelector("[data-book-action=close]").click()');
  await press('Escape','Escape',27);
  assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'PAUSED');
  await evaluate('document.querySelector(".recipe-book-button").click()');
  await press('Escape','Escape',27);
  assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'PAUSED');
  await evaluate('document.querySelector("[data-action=resume]").click()');
  await evaluate('__kawaiiTestGame.customerSystem.update(40)');
  await waitFor('__kawaiiTestGame.orderUI.entries.size>0','No cards');
  const valid=await evaluate(`Promise.all([import('/src/game/RecipeSystem.js'),import('/src/game/RecipePresentation.js')]).then(([m,p])=>[...__kawaiiTestGame.orderUI.entries].every(([id,e])=>e.bubble.querySelector('.order-ingredients').textContent===p.recipeIngredients(m.RECIPES.find(r=>r.id===__kawaiiTestGame.orderSystem.getOrder(id).recipeId))))`);
  assert.ok(valid);
  const ids=await evaluate('[...__kawaiiTestGame.orderUI.entries.keys()]');
  const patience=await evaluate('__kawaiiTestGame.orderSystem.getActiveOrders()[0].remainingTime');
  await delay(250);assert.ok(await evaluate('__kawaiiTestGame.orderSystem.getActiveOrders()[0].remainingTime')<patience);
  assert.deepEqual(await evaluate('[...__kawaiiTestGame.orderUI.entries.keys()]'),ids);
  await evaluate('document.querySelector(".recipe-book-button").click()');
  const frozenOrders=await snapshot();await delay(200);assert.equal(await snapshot(),frozenOrders);
  await command('Emulation.setDeviceMetricsOverride',{width:360,height:740,deviceScaleFactor:1,mobile:false});
  assert.ok(await evaluate('document.querySelector(".recipe-book").getBoundingClientRect().right<=360'));
  assert.ok(await evaluate('document.querySelector(".recipe-book").scrollWidth<=document.querySelector(".recipe-book").clientWidth'));
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate('document.querySelector("[data-book-action=close]").click()');
  await evaluate('__kawaiiTestGame.world.player.stopMoving();__kawaiiTestGame.world.player.group.position.set(-3,0,2.4)');
  await key('keyDown','KeyD','d',68);
  await waitFor('__kawaiiTestGame.world.player.group.position.x>-2.98','Movement after book');
  await key('keyUp','KeyD','d',68);
  await evaluate(`(()=>{const g=__kawaiiTestGame;g.input.reset();g.world.player.stopMoving();g.world.player.group.position.copy(g.world.kitchen.stations.get('riceBox').getApproachPosition());})()`);
  await waitFor('__kawaiiTestGame.interactionSystem.activeStation?.id==="riceBox"','Rice selection');
  await press('KeyE','e',69);await waitFor('__kawaiiTestGame.carrySystem.carriedIngredient?.type==="rice"','Interaction after book');
  assert.deepEqual(errors,[]);
  console.log('OK: all recipe pages and shared ingredients; next/previous/close/Escape; pause origin and clocks; blocked W/E/Space; remembered page; order tutorials/patience/identity; fixed camera/canvas; mobile book; movement and interaction restored; clean console.');
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
