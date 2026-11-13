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
  const key = (type, code) => command('Input.dispatchKeyEvent',{type,code,key:code.slice(-1).toLowerCase()});
  const advance = seconds => evaluate(`stepFire(${seconds})`);
  const shot = async name => {
    await evaluate('g.updateOrderUI();g.renderer.render(g.world.scene,g.camera.camera)');
    const capture=await command('Page.captureScreenshot',{format:'png'});
    await writeFile(`artifacts/fire-v2-${name}.png`,Buffer.from(capture.data,'base64'));
  };
  const aim = async station => {
    const [x,y]=await evaluate(`(() => {
      const s=${station},p=s.position.clone().setY(s.collider.top*.7).project(g.camera.camera),r=g.renderer.domElement.getBoundingClientRect();
      return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];
    })()`);
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,buttons:0});
  };
  for(const mode of ['solo','coop']) {
    await command('Page.navigate',{url});
    await waitFor(`Boolean(document.querySelector('[data-mode=${mode}]'))`,'Mode menu missing');
    await evaluate(`document.querySelector('[data-mode=${mode}]').click()`);
    await waitFor('Boolean(globalThis.__kawaiiTestGame?.fireSystem)','Fire system did not load');
    await evaluate(`(() => {
      globalThis.g=__kawaiiTestGame;g.stop();g.session.play();g.controlSettings.setMovementMode('map');
      globalThis.actor=g.players.at(-1);globalThis.cooker=g.riceCookers.get('riceCooker');
      globalThis.stepFire=seconds=>{for(let left=seconds;left>1e-8;){const dt=Math.min(left,1/60);g.updateSimulation(dt);left-=dt;}};
      globalThis.fireCamera=g.camera.camera.projectionMatrix.toArray().join(',');
      g.carrySystem.attach(g.ingredientFactory.create('rice'));g.carrySystem.interact(cooker.station);g.carrySystem.interact(cooker.station);
      stepFire(30.99);
    })()`);
    assert.equal(await evaluate('g.fireSystem.fires.size'),0);await advance(.01);
    assert.equal(await evaluate('g.fireSystem.fires.size===1&&g.fireSystem.pendingSpread.target.id==="riceCooker2"'),true);
    await advance(2);
    assert.equal(await evaluate('g.fireSystem.fires.size===1&&g.fireSystem.pendingSpread.target.fireThreatened'),true);
    await shot(`${mode}-trail`);
    await evaluate('actor.player.group.position.copy(g.extinguisher.station.getApproachPosition());actor.player.stopMoving()');
    const interact=mode==='coop'?'KeyP':'KeyE', drop=mode==='coop'?'KeyO':'KeyQ';
    await key('keyDown',interact);await advance(1/60);await key('keyUp',interact);await advance(1/60);
    assert.equal(await evaluate('actor.carrySystem.carriedTool===g.extinguisher&&g.extinguisher.model.scale.toArray().every(v=>v===1.5)'),true);
    await evaluate('actor.player.group.position.copy(cooker.station.getApproachPosition());actor.player.stopMoving()');
    await key('keyDown',interact);await advance(.25);
    assert.equal(await evaluate('actor.player.movementLocked&&g.fireSystem.fires.get(cooker.station.id).progress>.24'),true);
    await shot(`${mode}-spray`);
    await evaluate('g.session.pause();globalThis.frozen=g.fireSystem.time');await advance(2);
    assert.equal(await evaluate('g.fireSystem.time===frozen'),true);
    await key('keyUp',interact);await evaluate('g.session.play()');await key('keyDown',interact);
    await evaluate('for(let i=0;i<120&&g.fireSystem.isBurning(cooker.station);i++)stepFire(1/60)');
    await key('keyUp',interact);await advance(1/60);
    assert.equal(await evaluate('g.fireSystem.fires.size===0&&g.fireSystem.pendingSpread===null&&g.fireSystem.effects.trail===null&&!g.world.kitchen.stations.get("riceCooker2").fireThreatened&&cooker.state==="EMPTY"'),true);
    await advance(1);assert.equal(await evaluate('g.fireSystem.effects.records.size'),0);
    await evaluate('g.players.filter(c=>c!==actor).forEach(c=>c.player.group.position.set(0,0,6.8));actor.player.group.position.set(0,0,2.8);actor.player.group.rotation.y=0;actor.player.stopMoving()');
    await key('keyDown',drop);await advance(1/60);await key('keyUp',drop);await advance(1/60);
    const dropped=await evaluate('({state:g.extinguisher.state,empty:actor.carrySystem.carriedTool===null,enabled:g.extinguisher.floorStation.interactionEnabled,message:actor.interactionSystem.message,player:actor.player.id,owner:g.extinguisher.owner?.player.id,positions:g.world.players.map(p=>p.group.position.toArray())})');
    assert.ok(dropped.state==='DROPPED'&&dropped.empty&&dropped.enabled,JSON.stringify(dropped));
    assert.equal(await evaluate('Math.abs(g.world.bounds.clone().setFromObject(g.extinguisher.model).min.y)<.00001'),true);
    await shot(`${mode}-ground`);
    // P1 uses the existing GPS to retrieve the moved tool, including after P2 dropped it.
    await evaluate('globalThis.actor=g.players[0];actor.player.group.position.set(0,0,6.8);actor.player.stopMoving();g.controlSettings.setMovementMode("gps")');
    await aim('g.extinguisher.floorStation');await key('keyDown','KeyW');
    await evaluate('for(let i=0;i<900&&!actor.interactionSystem.canApproach(g.extinguisher.floorStation,actor.player,actor.player.group.position);i++)stepFire(1/60)');
    assert.equal(await evaluate('actor.interactionSystem.canApproach(g.extinguisher.floorStation,actor.player,actor.player.group.position)'),true,'GPS reaches the dropped extinguisher');
    await key('keyUp','KeyW');await key('keyDown','KeyE');await advance(1/60);await key('keyUp','KeyE');await advance(1/60);
    assert.equal(await evaluate('g.extinguisher.owner===actor.carrySystem&&!g.extinguisher.floorStation.interactionEnabled'),true);
    // Independent GPS-to-fire check; the earlier live trail already checked cancellation.
    await evaluate('globalThis.fireSchedule=g.fireSystem.scheduleSpread;g.fireSystem.scheduleSpread=()=>{};g.fireSystem.ignite(cooker.station)');
    await aim('cooker.station');await key('keyDown','KeyW');
    await evaluate('for(let i=0;i<900&&!actor.interactionSystem.canApproach(cooker.station,actor.player,actor.player.group.position);i++)stepFire(1/60)');
    assert.equal(await evaluate('actor.interactionSystem.canApproach(cooker.station,actor.player,actor.player.group.position)'),true);
    await key('keyUp','KeyW');await key('keyDown','KeyE');
    await evaluate('for(let i=0;i<120&&g.fireSystem.isBurning(cooker.station);i++)stepFire(1/60)');
    await key('keyUp','KeyE');await advance(1);
    assert.equal(await evaluate('g.fireSystem.fires.size===0&&g.fireSystem.effects.records.size===0'),true);
    assert.equal(await evaluate('fireCamera===g.camera.camera.projectionMatrix.toArray().join(",")'),true);
    await evaluate('g.extinguisher.dock();g.fireSystem.scheduleSpread=fireSchedule;g.fireSystem.ignite(cooker.station);globalThis.promised=g.fireSystem.pendingSpread.target;true');
    await advance(3.99);assert.equal(await evaluate('g.fireSystem.fires.size'),1);
    await advance(.01);assert.equal(await evaluate('g.fireSystem.fires.size===2&&g.fireSystem.isBurning(promised)'),true);
    await shot(`${mode}-arrival`);
    const rendering=await evaluate(`(() => {
      for(const {station}of[...g.fireSystem.fires.values()])g.fireSystem.extinguish(station);g.fireSystem.update(1);
      g.renderer.render(g.world.scene,g.camera.camera);const baseline=g.renderer.info.render.calls;
      g.fireSystem.ignite(cooker.station);g.fireSystem.update(56);g.renderer.render(g.world.scene,g.camera.camera);
      return {baseline,full:g.renderer.info.render.calls,fires:g.fireSystem.fires.size,lights:g.fireSystem.effects.lights.length};
    })()`);
    assert.equal(rendering.fires,15);assert.equal(rendering.lights,2);assert.ok(rendering.full-rendering.baseline<150);
    console.log(JSON.stringify({mode,rendering}));await shot(`${mode}-full`);
    await evaluate('g.dispose()');assert.equal(await evaluate('document.querySelectorAll(".fire-hud,.fire-alert").length'),0);
  }
  assert.deepEqual(errors,[]);
  await send('Browser.close');
  console.log('OK: Fire 2.0 browser: fluid shader layers, real 4s destination/cancellation, E/P, 1.5x tool, Q/O ground drop, P1/P2 transfer, GPS retrieval/fire suppression, pause, recovery, bounded lights/draw calls and no console errors.');
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




