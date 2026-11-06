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
  await mkdir('artifacts',{recursive:true});
  const keyCodes={KeyW:87,KeyA:65,KeyS:83,KeyD:68,ArrowUp:38,ArrowLeft:37,ArrowDown:40,ArrowRight:39,Space:32,KeyE:69,KeyR:82,Escape:27};
  const key=async(type,code,autoRepeat=false)=>command('Input.dispatchKeyEvent',{type,code,key:code==='Space'?' ':code.startsWith('Key')?code.slice(3).toLowerCase():code,windowsVirtualKeyCode:keyCodes[code],autoRepeat});
  const place=async()=>evaluate(`(()=>{const g=__kawaiiTestGame;g.input.reset();g.world.player.stopMoving();g.world.player.group.position.set(-3,0,2.4);})()`);
  const x=()=>evaluate('__kawaiiTestGame.world.player.group.position.x');
  await evaluate(`(()=>{globalThis.__popupInteractionCount=0;const system=__kawaiiTestGame.interactionSystem,previous=system.onInteract;
    system.onInteract=event=>{__popupInteractionCount++;previous?.(event);};})()`);
  const assertPlaying=async()=>{
    assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'PLAYING');
    assert.equal(await evaluate('__kawaiiTestGame.input.enabled'),true);
    assert.equal(await evaluate('document.activeElement === __kawaiiTestGame.renderer.domElement'),true);
    await waitFor('document.querySelector(".pause-overlay").hidden','Menu não terminou a animação de fechamento.');
    assert.equal(await evaluate('document.querySelector(".pause-overlay").hidden'),true);
  };
  await place();await key('keyDown','KeyD');await delay(120);
  assert.ok(await x()>-2.99,'Anda antes de existir pedido.');
  await evaluate(`(()=>{const g=__kawaiiTestGame;g.customerSystem.update(10);const c=[...g.customerSystem.customers.values()][0];
    for(let i=0;i<2000&&c.model.position.distanceTo(c.slot.position)>.06;i++)g.customerSystem.update(.01);
    if(g.orderUI.entries.size!==0)throw new Error('Preparação deve parar antes do primeiro pedido.');})()`);
  await waitFor('__kawaiiTestGame.orderUI.entries.size===1','Pedido não apareceu.');
  const entering=await evaluate(`(()=>{const g=__kawaiiTestGame,e=[...g.orderUI.entries.values()][0],a=e.bubble.getAnimations().find(a=>a.animationName==='card-in');
    return {duration:a?.effect.getTiming().duration,phase:a?.currentTime,x:g.world.player.group.position.x,badge:e.badge.textContent};})()`);
  assert.equal(entering.duration,300);assert.ok(entering.phase<300);assert.equal(entering.badge,'Novo pedido!');
  await delay(90);assert.ok(await x()>entering.x+.01,'Anda durante a animação de entrada.');await assertPlaying();
  const whileEntering=await x();
  await waitFor(`__kawaiiTestGame.world.player.group.position.x>${whileEntering+.01}`,'Anda depois de aparecer o pedido, aguardando um quadro real do jogo.');
  await key('keyUp','KeyD');await assertPlaying();
  assert.equal(await evaluate(`(()=>{const g=__kawaiiTestGame;return [...g.orderUI.entries.values()].every(e=>getComputedStyle(e.bubble).pointerEvents==='none'&&!e.bubble.querySelector('button,input,[tabindex]'))
    &&getComputedStyle(g.orderUI.root).pointerEvents==='none'&&g.orderUI.root.tabIndex===-1;})()`),true);
  await evaluate('__kawaiiTestGame.customerSystem.update(20);__kawaiiTestGame.orderUI.update(__kawaiiTestGame.orderSystem,__kawaiiTestGame.customerSystem.customers)');
  assert.equal(await evaluate('__kawaiiTestGame.orderUI.entries.size'),2);
  for(const code of ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight']){
    await evaluate(`(()=>{const g=__kawaiiTestGame;g.input.reset();g.world.player.stopMoving();g.world.player.group.position.set(0,0,2.4);})()`);
    const before=await evaluate('__kawaiiTestGame.world.player.group.position.toArray()');
    await key('keyDown',code);
    assert.equal(await evaluate('__kawaiiTestGame.input.getDirection().lengthSq()>0'),true,`${code} chega ao Input.`);
    await waitFor(`JSON.stringify(__kawaiiTestGame.world.player.group.position.toArray())!==${JSON.stringify(JSON.stringify(before))}`,`${code} deve mover com dois pedidos.`);
    await key('keyUp',code);
    assert.notDeepEqual(await evaluate('__kawaiiTestGame.world.player.group.position.toArray()'),before,`${code} funciona com dois pedidos.`);
  }
  await place();await key('keyDown','KeyD');await key('keyDown','Space');
  await waitFor('__kawaiiTestGame.world.player.dashRemaining>0','Space não iniciou dash com pedidos ativos.');
  assert.equal(await evaluate('window.scrollY'),0);await key('keyUp','Space');await key('keyUp','KeyD');await delay(250);
  // O defeito anterior pausava a partida por qualquer blur e continuava pausado após focus.
  await place();await key('keyDown','KeyD');
  await evaluate(`document.querySelector('.order-card').dispatchEvent(new FocusEvent('blur',{bubbles:true}));window.dispatchEvent(new FocusEvent('focus'))`);
  assert.equal(await evaluate('__kawaiiTestGame.input.keys.has("KeyD")'),true);
  await evaluate('window.dispatchEvent(new FocusEvent("blur"));window.dispatchEvent(new FocusEvent("focus"))');
  assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'PLAYING');
  assert.equal(await evaluate('__kawaiiTestGame.input.keys.size'),0);
  await key('keyUp','KeyD');const afterFocus=await x();await key('keyDown','KeyA');await delay(120);await key('keyUp','KeyA');
  assert.ok(await x()<afterFocus-.01,'Recupera o teclado sem precisar abrir/fechar a pausa.');
  const approach=async(id)=>{
    await evaluate(`(()=>{const g=__kawaiiTestGame,s=g.world.kitchen.stations.get('${id}');g.input.reset();g.world.player.stopMoving();
      g.world.player.group.position.copy(s.interactionArea?.position??s.getApproachPosition());g.interactionSystem.reset();})()`);
    await waitFor(`__kawaiiTestGame.interactionSystem.activeStation?.id==='${id}'`,'Estação não selecionada: '+id);
  };
  const tapE=async()=>{const before=await evaluate('__popupInteractionCount');await key('keyDown','KeyE');
    await waitFor(`__popupInteractionCount>${before}`,'E não acionou a estação com pop-ups ativos.');await key('keyUp','KeyE');};
  await approach('riceBox');await tapE();assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient?.type'),'rice');
  await approach('riceCooker');await tapE();assert.equal(await evaluate('__kawaiiTestGame.riceCooker.state'),'LOADED');
  await tapE();assert.equal(await evaluate('__kawaiiTestGame.riceCooker.state'),'COOKING');
  await approach('salmonBox');await tapE();await approach('cutting');await tapE();
  for(let i=0;i<3;i++){await tapE();await waitFor('!__kawaiiTestGame.cuttingSystem.isCutting','Corte não terminou.');}
  await tapE();assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient?.state'),'salmon_cut');
  await approach('trash');await tapE();
  await waitFor('__kawaiiTestGame.riceCooker.state==="READY"','Arroz não cozinhou com notificações.',8500);
  await approach('riceCooker');await tapE();await approach('assembly2');await tapE();
  assert.equal(await evaluate('__kawaiiTestGame.assemblySystems.get("assembly2").state'),'ASSEMBLING');
  await key('keyDown','KeyR');await waitFor('__kawaiiTestGame.assemblySystems.get("assembly2").state==="EMPTY"','R não cancelou montagem com pedidos ativos.');await key('keyUp','KeyR');
  await evaluate(`(()=>{const g=__kawaiiTestGame;g.customerSystem.maxCustomers=3;
    for(let i=0;i<1000&&g.orderSystem.getActiveOrders().length<3;i++)g.customerSystem.update(.05);
    g.orderUI.update(g.orderSystem,g.customerSystem.customers);})()`);
  assert.equal(await evaluate('__kawaiiTestGame.orderUI.entries.size'),3);
  await place();const tripleX=await x();await key('keyDown','KeyD');await delay(100);await key('keyUp','KeyD');assert.ok(await x()>tripleX+.01);await assertPlaying();
  await delay(350);
  assert.equal(await evaluate(`(()=>{const cards=[...document.querySelectorAll('.order-card')].map(e=>e.getBoundingClientRect());return cards.every((r,i)=>r.left>1100&&r.right<=1440&&r.top>=0&&cards.every((s,j)=>i===j||r.bottom<=s.top||r.top>=s.bottom));})()`),true);
  const picture=await command('Page.captureScreenshot',{format:'png'});await writeFile('artifacts/popups-orders.png',Buffer.from(picture.data,'base64'));
  const remaining=await evaluate('__kawaiiTestGame.orderSystem.getActiveOrders()[0].remainingTime');await delay(150);assert.ok(await evaluate('__kawaiiTestGame.orderSystem.getActiveOrders()[0].remainingTime')<remaining);
  await key('keyDown','Escape');await key('keyUp','Escape');
  assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'PAUSED');
  const frozen=()=>evaluate(`JSON.stringify({position:__kawaiiTestGame.world.player.group.position.toArray(),clock:__kawaiiTestGame.customerSystem.clock,
    orders:__kawaiiTestGame.orderSystem.getActiveOrders(),rice:__kawaiiTestGame.riceCooker.elapsed,keys:[...__kawaiiTestGame.input.keys]})`);
  const pauseState=await frozen();await key('keyDown','KeyW');await key('keyDown','Space');await key('keyDown','KeyE');await key('keyDown','KeyR');await delay(250);assert.equal(await frozen(),pauseState);
  assert.equal(await evaluate(`Number(getComputedStyle(document.querySelector('.pause-overlay')).zIndex)>Number(getComputedStyle(document.querySelector('.order-panel')).zIndex)`),true);
  assert.equal(await evaluate('document.querySelectorAll(".order-card:not(.is-leaving)").length'),3);
  await evaluate('document.querySelector("[data-action=resume]").click()');
  for(const code of ['KeyW','Space','KeyE','KeyR'])await key('keyUp',code);
  await delay(200);await assertPlaying();
  await place();const resumed=await x();await key('keyDown','KeyD');await delay(100);await key('keyUp','KeyD');assert.ok(await x()>resumed+.01);
  // Uma aba oculta ainda pausa de verdade; restaurar visibilidade não ignora ESC/menu.
  await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))`);
  assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'PAUSED');
  await evaluate(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));__kawaiiTestGame.session.play()`);await delay(200);
  const expired=await evaluate(`(()=>{const g=__kawaiiTestGame,o=g.orderSystem.getActiveOrders()[0];o.remainingTime=.001;
    globalThis.__leavingCustomer=g.customerSystem.customers.get(o.customerId);g.customerSystem.update(.05);g.orderUI.update(g.orderSystem,g.customerSystem.customers);
    return {id:o.id,state:o.state,customer:__leavingCustomer.state,reserved:__leavingCustomer.slot.customerId===__leavingCustomer.id};})()`);
  assert.equal(expired.state,'EXPIRED');assert.equal(expired.customer,'LEAVING');assert.equal(expired.reserved,true);
  assert.equal(await evaluate('__kawaiiTestGame.orderUI.entries.has('+JSON.stringify(expired.id)+')'),false);
  await waitFor('!document.querySelector('+JSON.stringify(`[data-order-id="${expired.id}"]`)+')','Pop-up expirado não terminou a animação de saída.');
  await evaluate('for(let i=0;i<1000&&__leavingCustomer.state!=="REMOVED";i++)__kawaiiTestGame.customerSystem.update(.05)');
  assert.equal(await evaluate('__leavingCustomer.state'),'REMOVED');assert.equal(await evaluate('__leavingCustomer.slot.customerId'),null);
  await evaluate('__kawaiiTestGame.orderUI.update(__kawaiiTestGame.orderSystem,__kawaiiTestGame.customerSystem.customers)');await delay(300);
  await command('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:false});await delay(350);
  assert.equal(await evaluate(`(()=>{const rs=[...document.querySelectorAll('.order-card')].map(e=>e.getBoundingClientRect());return rs.every(r=>r.top>=0&&r.bottom<=390&&r.right<=844);})()`),true);
  assert.deepEqual(errors,[],JSON.stringify(errors));
  await evaluate('__kawaiiTestGame.dispose()');
  console.log('OK: movimento antes/durante/depois da entrada 300ms, WASD/setas, Space, E, cozimento, três cortes, R, dois/três pop-ups, foco/blur sem falsa pausa, ESC/retomada, aba oculta, paciência, expiração e console limpo.');
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
