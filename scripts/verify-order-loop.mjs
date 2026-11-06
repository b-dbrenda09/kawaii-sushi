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
  await evaluate(`(()=>{
    const g=__kawaiiTestGame,p=g.world.player,input=g.input,canvas=g.renderer.domElement;
    const diagnostic=globalThis.__freezeDiagnostic={frames:0,playerCalls:0,uiCalls:0,transitions:[],keys:[],exceptions:[],orders:[]};
    globalThis.__freezeState=()=>({at:performance.now(),clock:g.customerSystem.clock,frames:diagnostic.frames,playerCalls:diagnostic.playerCalls,uiCalls:diagnostic.uiCalls,
      mode:g.session.mode,hidden:document.hidden,enabled:input.enabled,blocked:input.actionsBlocked,suppressed:[...input.suppressedKeys],keys:[...input.keys],
      cutLocked:p.movementLocked,cutting:g.preparation.isCutting,velocity:p.velocity.toArray(),actualSpeed:p.actualSpeed,maxSpeed:p.maxSpeed,
      position:p.group.position.toArray(),direction:input.getDirection().toArray(),focus:document.activeElement?.tagName,
      samePlayer:p===g.world.player,sameInput:input===g.input,sameCanvas:canvas===g.renderer.domElement,orders:g.orderSystem.getActiveOrders().length,ui:g.orderUI.entries.size,running:g.running});
    const simulation=g.updateSimulation;g.updateSimulation=function(...args){diagnostic.frames++;return simulation.apply(this,args);};
    const update=p.update;p.update=function(...args){diagnostic.playerCalls++;return update.apply(this,args);};
    const ui=g.orderUI.update;g.orderUI.update=function(...args){diagnostic.uiCalls++;try{return ui.apply(this,args);}catch(error){diagnostic.exceptions.push({source:'OrderUI',message:error.message,stack:error.stack,state:__freezeState()});throw error;}};
    const create=g.orderSystem.createForCustomer;g.orderSystem.createForCustomer=function(...args){const result=create.apply(this,args);if(result)diagnostic.orders.push({id:result.id,state:__freezeState()});return result;};
    const transition=g.session.onChange;g.session.onChange=function(...args){diagnostic.transitions.push({mode:g.session.mode,stack:new Error().stack});return transition.apply(this,args);};
    window.addEventListener('keydown',e=>queueMicrotask(()=>diagnostic.keys.push({code:e.code,repeat:e.repeat,target:e.target?.tagName,state:__freezeState()})));
    window.addEventListener('error',e=>diagnostic.exceptions.push({source:'window',message:e.message,stack:e.error?.stack,state:__freezeState()}));
  })()`);
  const before=await evaluate('__freezeState()');
  await waitFor(`__kawaiiTestGame.orderSystem.getActiveOrders().length>0||[...__kawaiiTestGame.customerSystem.customers.values()].some(c=>c.state==='WALKING_TO_COUNTER'&&c.waypoint===c.path.length-1&&c.model.position.distanceTo(c.slot.position)<.9)`,'Primeiro cliente não chegou naturalmente.',35000);
  assert.equal(await evaluate('typeof __kawaiiTestGame.orderUI.renderOrder'), 'function', 'O servidor deve fornecer o HUD atual, sem projeção pela câmera.');
  await evaluate(`(()=>{const p=__kawaiiTestGame.world.player;p.stopMoving();p.group.position.set(-4.5,0,2.4);})()`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
  const holding=await evaluate('__freezeState()');
  await waitFor('__kawaiiTestGame.orderUI.entries.size>0||__freezeDiagnostic.exceptions.length>0','HUD não apareceu.',10000);
  const appearance=await evaluate('__freezeState()');await delay(200);const after=await evaluate('__freezeState()');
  await command('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
  await evaluate(`(()=>{const p=__kawaiiTestGame.world.player;p.stopMoving();p.group.position.set(-3,0,2.4);})()`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyD',key:'d',windowsVirtualKeyCode:68});
  await delay(350);const newKey=await evaluate('__freezeState()');await command('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyD',key:'d',windowsVirtualKeyCode:68});
  const diagnostic=await evaluate('__freezeDiagnostic');
  const report={url,before,holding,appearance,after,newKey,diagnostic,errors};
  await writeFile('artifacts/freeze-diagnostic.json',JSON.stringify(report,null,2));
  assert.equal(holding.orders,0,'W deve ser pressionado antes do primeiro pedido.');
  assert.ok(appearance.orders>0&&appearance.keys.includes('KeyW'));
  await waitFor(`__freezeDiagnostic.frames>${appearance.frames}&&__kawaiiTestGame.world.player.group.position.x>-2.99`,'O loop deve continuar depois do pedido.');
  assert.equal(appearance.mode,'PLAYING');assert.equal(appearance.enabled,true);assert.equal(appearance.blocked,false);
  assert.ok(appearance.position[2]<holding.position[2],'W continua durante a criação do primeiro pedido.');
  assert.equal(diagnostic.transitions.length,0);assert.deepEqual(diagnostic.exceptions,[]);assert.deepEqual(errors,[]);
  const key=async(type,code,windowsVirtualKeyCode)=>command('Input.dispatchKeyEvent',{type,code,key:code==='Space'?' ':code.startsWith('Key')?code.slice(3).toLowerCase():code,windowsVirtualKeyCode});
  const walk=async()=>{
    await evaluate(`(()=>{const g=__kawaiiTestGame;g.input.reset();g.world.player.stopMoving();g.world.player.group.position.set(-3,0,2.4);})()`);
    await key('keyDown','KeyD',68);await waitFor('__kawaiiTestGame.world.player.group.position.x>-2.98','Teclado não move depois do pedido.');await key('keyUp','KeyD',68);
  };
  await evaluate('__kawaiiTestGame.customerSystem.update(21)');
  await waitFor('__kawaiiTestGame.orderUI.entries.size===2','Dois pedidos devem coexistir sem parar o loop.');await walk();
  await evaluate('__kawaiiTestGame.world.player.cooldownRemaining=0');await key('keyDown','KeyD',68);await key('keyDown','Space',32);
  await waitFor('__kawaiiTestGame.world.player.dashRemaining>0','Space deve funcionar com pedidos.');await key('keyUp','Space',32);await key('keyUp','KeyD',68);
  await waitFor('__kawaiiTestGame.world.player.dashRemaining===0','Dash não terminou.');
  await evaluate(`(()=>{const g=__kawaiiTestGame,s=g.world.kitchen.stations.get('riceBox');g.input.reset();g.world.player.stopMoving();g.world.player.group.position.copy(s.getApproachPosition());g.interactionSystem.reset();})()`);
  await waitFor('__kawaiiTestGame.interactionSystem.activeStation?.id==="riceBox"','Caixa de arroz não selecionada.');
  await key('keyDown','KeyE',69);await waitFor('__kawaiiTestGame.carrySystem.carriedIngredient?.type==="rice"','E deve pegar ingrediente com pedidos.');await key('keyUp','KeyE',69);
  await evaluate('__kawaiiTestGame.carrySystem.discard()');
  await key('keyDown','Escape',27);await key('keyUp','Escape',27);assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'PAUSED');
  const frozen=await evaluate(`JSON.stringify({player:__kawaiiTestGame.world.player.group.position.toArray(),clock:__kawaiiTestGame.customerSystem.clock,orders:__kawaiiTestGame.orderSystem.getActiveOrders()})`);
  await delay(250);assert.equal(await evaluate(`JSON.stringify({player:__kawaiiTestGame.world.player.group.position.toArray(),clock:__kawaiiTestGame.customerSystem.clock,orders:__kawaiiTestGame.orderSystem.getActiveOrders()})`),frozen);
  await evaluate('document.querySelector("[data-action=resume]").click()');await walk();
  for(let cycle=0;cycle<4;cycle++){
    await evaluate(`(()=>{const g=__kawaiiTestGame;for(const order of g.orderSystem.getActiveOrders())order.remainingTime=.001;g.customerSystem.update(.01);})()`);
    await waitFor('__kawaiiTestGame.orderUI.entries.size===0','Pedidos expirados não foram removidos.');
    await walk();
    const count=await evaluate(`(()=>{const g=__kawaiiTestGame;
      for(let i=0;i<2000&&g.orderSystem.getActiveOrders().length===0;i++)g.customerSystem.update(.05);
      return g.orderSystem.getActiveOrders().length;})()`);
    assert.ok(count>0);await waitFor(`__kawaiiTestGame.orderUI.entries.size===${count}`,'Novo pedido não foi renderizado.');await walk();
    assert.equal(await evaluate('__kawaiiTestGame.session.mode'),'PLAYING');
    assert.equal(await evaluate('__kawaiiTestGame.world.player.maxSpeed'),5.04);
  }
  const finalState=await evaluate('__freezeState()');
  assert.ok(finalState.frames>appearance.frames&&finalState.playerCalls>appearance.playerCalls);
  assert.ok(finalState.samePlayer&&finalState.sameInput&&finalState.sameCanvas);
  assert.deepEqual(await evaluate('__freezeDiagnostic.exceptions'),[]);assert.deepEqual(errors,[],JSON.stringify(errors));
  await writeFile('artifacts/order-loop-regression.json',JSON.stringify({url,before,holding,appearance,after,newKey,finalState,cycles:4,errors},null,2));
  console.log('OK: primeiro pedido natural na porta usada pelo jogo, W segurado antes/durante/depois, loop/Player/Input ativos, dois pedidos, Space, E, ESC/retomada e quatro ciclos de criação/expiração sem congelamento ou erros.');
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
