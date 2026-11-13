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
  await waitFor('Boolean(document.querySelector("[data-mode=solo]"))', 'Menu de modo ausente.');
  await evaluate('document.querySelector("[data-mode=solo]").click()');
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
  await mkdir('artifacts',{recursive:true});
  await evaluate(`(()=>{const g=__kawaiiTestGame;g.running=false;cancelAnimationFrame(g.frameId);
    let index=0;g.orderSystem.random=()=> (index++%3+.1)/3;
    globalThis.__hudLayout=()=>({canvas:g.renderer.domElement.getBoundingClientRect().toJSON(),pixels:[g.renderer.domElement.width,g.renderer.domElement.height],
      container:[g.container.clientWidth,g.container.clientHeight],renderer:g.renderer.getSize({set:(w,h)=>[w,h]}),
      camera:g.camera.camera.position.toArray(),rotation:g.camera.camera.quaternion.toArray(),projection:g.camera.camera.projectionMatrix.toArray(),
      map:g.world.kitchen.group.matrixWorld.toArray(),screenPoint:g.world.kitchen.stations.get('assembly').position.clone().project(g.camera.camera).toArray()});
  })()`);
  const layout=await evaluate('__hudLayout()');
  for(const count of [1,2,3]){
    const state=await evaluate(`(()=>{const g=__kawaiiTestGame;g.customerSystem.maxCustomers=${count===3?3:2};
      for(let i=0;i<15000&&g.orderSystem.getActiveOrders().length<${count};i++)g.customerSystem.update(.01);
      g.orderUI.update(g.orderSystem,g.customerSystem.customers);
      return {count:g.orderUI.entries.size,layout:__hudLayout(),orders:g.orderSystem.getActiveOrders()};})()`);
    assert.equal(state.count,count);assert.deepEqual(state.layout,layout,`${count} pedidos não podem alterar mapa, câmera, canvas ou aspect ratio.`);
    if(count===1){
      assert.equal(state.orders[0].remainingTime,state.orders[0].maxPatience,'Pedido começa com tempo máximo.');
      assert.equal(await evaluate('[...__kawaiiTestGame.orderUI.entries.values()][0].fill.style.transform'),'scaleX(1)');
      const unchanged=await evaluate(`(()=>{const g=__kawaiiTestGame,before=JSON.stringify(g.orderSystem.getActiveOrders());
        for(let i=0;i<1000;i++)g.orderUI.update(g.orderSystem,g.customerSystem.customers);return before===JSON.stringify(g.orderSystem.getActiveOrders());})()`);
      assert.equal(unchanged,true,'Atualizar HUD não reinicia nem consome paciência.');
      const smooth=await evaluate(`(()=>{const g=__kawaiiTestGame,o=g.orderSystem.getActiveOrders()[0];g.orderSystem.update(.125);g.orderUI.update(g.orderSystem,g.customerSystem.customers);
        return {ratio:o.remainingTime/o.maxPatience,scale:Number(g.orderUI.entries.get(o.id).fill.style.transform.slice(7,-1))};})()`);
      assert.ok(smooth.ratio<1);assert.ok(Math.abs(smooth.ratio-smooth.scale)<1e-10,'Barra conserva frações em vez de saltar em percentuais inteiros.');
    }
  }
  await waitFor(`[...document.querySelectorAll('.order-card')].every(e=>e.getAnimations().every(a=>a.playState==='finished'))`,'Entrada dos pedidos não terminou.');
  const cards=await evaluate(`(()=>{const g=__kawaiiTestGame,root=g.orderUI.root,r=root.getBoundingClientRect();return {
    position:getComputedStyle(root).position,top:r.top,right:innerWidth-r.right,gap:getComputedStyle(root).gap,
    pointer:getComputedStyle(root).pointerEvents,focus:document.activeElement===g.renderer.domElement,
    cards:[...root.children].map(e=>({rect:e.getBoundingClientRect().toJSON(),name:e.querySelector('.order-name').textContent,
      ingredients:e.querySelector('.order-ingredients').textContent,animal:e.querySelector('.order-animal').textContent,icon:e.querySelector('.order-sushi').dataset.model,
      time:e.querySelector('.order-time').textContent,barHeight:e.querySelector('.order-patience').getBoundingClientRect().height,
      pointer:getComputedStyle(e).pointerEvents}))};})()`);
  assert.equal(cards.position,'static');assert.ok(cards.top>12);assert.equal(cards.right,12);assert.equal(cards.gap,'6px');assert.equal(cards.pointer,'none');assert.ok(cards.focus);
  cards.cards.forEach((card,i)=>{assert.equal(card.rect.width,220);assert.ok(card.rect.height<120);assert.ok(card.name&&card.ingredients&&card.animal&&card.icon&&card.time);assert.equal(card.barHeight,4);assert.equal(card.pointer,'none');
    if(i)assert.ok(Math.abs(card.rect.top-cards.cards[i-1].rect.bottom-6)<.1);});
  const independence=await evaluate(`(()=>{const g=__kawaiiTestGame,orders=g.orderSystem.getActiveOrders(),before=orders.map(o=>o.remainingTime);
    g.orderSystem.update(1.25);g.orderUI.update(g.orderSystem,g.customerSystem.customers);
    return orders.map((o,i)=>({difference:before[i]-o.remainingTime,scale:Number(g.orderUI.entries.get(o.id).fill.style.transform.slice(7,-1)),ratio:o.remainingTime/o.maxPatience}));})()`);
  // O CSSOM serializa transformações com precisão menor que os números do modelo.
  assert.ok(independence.every(o=>Math.abs(o.difference-1.25)<1e-8&&Math.abs(o.scale-o.ratio)<1e-6),JSON.stringify(independence));
  assert.equal(new Set(independence.map(o=>o.ratio)).size,3,'Paciências independentes.');
  for(const [ratio,level,color] of [[1,'calm','rgb(148, 203, 162)'],[.6001,'calm','rgb(148, 203, 162)'],[.6,'concerned','rgb(234, 197, 108)'],[.3,'concerned','rgb(234, 197, 108)'],[.299,'impatient','rgb(207, 104, 121)']]){
    const percent=await evaluate(`(()=>{const g=__kawaiiTestGame,o=g.orderSystem.getActiveOrders()[0];o.remainingTime=o.maxPatience*${ratio};g.orderUI.update(g.orderSystem,g.customerSystem.customers);
      const e=g.orderUI.entries.get(o.id);return {scale:e.fill.style.transform,level:e.bubble.dataset.level,value:e.track.getAttribute('aria-valuenow')};})()`);
    assert.ok(Math.abs(Number(percent.scale.slice(7,-1))-ratio)<1e-8);assert.equal(percent.level,level);assert.equal(Number(percent.value),Math.round(ratio*100));
    await waitFor(`getComputedStyle([...__kawaiiTestGame.orderUI.entries.values()][0].fill).backgroundColor===${JSON.stringify(color)}`,'Cor incorreta da barra.');
  }
  for(const [ratio,expected] of [[1.2,1],[-.2,0]]){
    const clamped=await evaluate(`(()=>{const g=__kawaiiTestGame,o=g.orderSystem.getActiveOrders()[0];o.remainingTime=o.maxPatience*${ratio};g.orderUI.update(g.orderSystem,g.customerSystem.customers);return g.orderUI.entries.get(o.id).fill.style.transform;})()`);
    assert.equal(clamped,`scaleX(${expected})`,'Percentual limitado entre 0 e 100.');
  }
  await evaluate(`(()=>{const g=__kawaiiTestGame;g.orderSystem.getActiveOrders().forEach((o,i)=>{o.remainingTime=o.maxPatience*[.29,.6,1][i];});
    g.orderUI.update(g.orderSystem,g.customerSystem.customers);g.renderer.render(g.world.scene,g.camera.camera);})()`);
  await delay(350);
  const hudShot=await command('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/compact-hud.png',Buffer.from(hudShot.data,'base64'));
  assert.deepEqual(await evaluate('__hudLayout()'),layout);
  await evaluate(`(()=>{const g=__kawaiiTestGame;g.input.reset();g.world.player.stopMoving();g.world.player.group.position.set(-3,0,2.4);
    g.running=true;g.previousTime=null;g.frameId=requestAnimationFrame(g.tick);})()`);
  const key=async(type,code,keyCode)=>command('Input.dispatchKeyEvent',{type,code,key:code.startsWith('Key')?code.slice(3).toLowerCase():code,windowsVirtualKeyCode:keyCode});
  const x=await evaluate('__kawaiiTestGame.world.player.group.position.x');await key('keyDown','KeyD',68);
  await waitFor(`__kawaiiTestGame.world.player.group.position.x>${x+.01}`,'Hello Kitty não se move com HUD.');await key('keyUp','KeyD',68);
  assert.equal(await evaluate('__kawaiiTestGame.input.enabled&&!__kawaiiTestGame.session.paused&&document.activeElement===__kawaiiTestGame.renderer.domElement'),true);
  assert.deepEqual(await evaluate('__hudLayout()'),layout);
  await key('keyDown','Escape',27);await key('keyUp','Escape',27);
  const frozen=await evaluate(`JSON.stringify({orders:__kawaiiTestGame.orderSystem.getActiveOrders(),bars:[...__kawaiiTestGame.orderUI.entries.values()].map(e=>[e.fill.style.transform,e.track.getAttribute('aria-valuenow')]),clock:__kawaiiTestGame.customerSystem.clock})`);
  await delay(400);
  assert.equal(await evaluate(`JSON.stringify({orders:__kawaiiTestGame.orderSystem.getActiveOrders(),bars:[...__kawaiiTestGame.orderUI.entries.values()].map(e=>[e.fill.style.transform,e.track.getAttribute('aria-valuenow')]),clock:__kawaiiTestGame.customerSystem.clock})`),frozen);
  await evaluate('document.querySelector("[data-action=resume]").click()');
  const remaining=await evaluate('__kawaiiTestGame.orderSystem.getActiveOrders()[0].remainingTime');
  await waitFor(`__kawaiiTestGame.orderSystem.getActiveOrders()[0].remainingTime<${remaining}`,'Paciência não retomou após ESC.');
  const expired=await evaluate(`(()=>{const g=__kawaiiTestGame,o=g.orderSystem.getActiveOrders()[0],e=g.orderUI.entries.get(o.id);o.remainingTime=.001;
    g.customerSystem.update(.01);g.orderUI.update(g.orderSystem,g.customerSystem.customers);const c=g.customerSystem.customers.get(o.customerId);
    return {id:o.id,time:o.remainingTime,state:o.state,scale:e.fill.style.transform,percent:e.track.getAttribute('aria-valuenow'),
      leaving:e.bubble.classList.contains('is-leaving'),customer:c.state,reserved:c.slot.customerId===c.id};})()`);
  assert.equal(expired.time,0);assert.equal(expired.state,'EXPIRED');assert.equal(expired.scale,'scaleX(0)');assert.equal(expired.percent,'0');assert.ok(expired.leaving&&expired.reserved);assert.equal(expired.customer,'LEAVING');
  await waitFor('!document.querySelector('+JSON.stringify(`[data-order-id="${expired.id}"]`)+')','Pedido expirado não foi removido.');
  assert.deepEqual(await evaluate('__hudLayout()'),layout);
  for(const [width,height] of [[390,844],[844,390]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(350);
    const mobile=await evaluate(`(()=>{const g=__kawaiiTestGame;g.orderUI.root.hidden=true;const before=__hudLayout();g.orderUI.update(g.orderSystem,g.customerSystem.customers);
      const after=__hudLayout();return {same:JSON.stringify(before)===JSON.stringify(after),rect:g.orderUI.root.getBoundingClientRect().toJSON(),viewport:[innerWidth,innerHeight]};})()`);
    assert.ok(mobile.same);assert.ok(mobile.rect.top>12);assert.equal(width-mobile.rect.right,12);assert.equal(mobile.rect.width,220);assert.ok(mobile.rect.bottom<=height);
  }
  assert.deepEqual(errors,[],JSON.stringify(errors));await evaluate('__kawaiiTestGame.dispose()');
  console.log('OK: HUD fixo 220px/12px/6px, cartões compactos, canvas/câmera/mapa idênticos com 0/1/2/3 pedidos, paciência 100%→0% limitada e independente, cores, atualização sem reinício, pausa/retomada, movimento e console limpo.');
  await send('Browser.close');
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
