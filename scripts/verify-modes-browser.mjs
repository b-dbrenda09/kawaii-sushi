import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { verifyServiceBrowser } from './service-browser-scenario.mjs';
import { CAMERA_CONFIG } from '../src/game/CameraConfig.js';

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
        // Captura tamb?m os rein?cios e a troca de modo.
      }
      return bound;
    };
  })();` });
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url });
  await waitFor('Boolean(document.querySelector("[data-mode=solo]"))','Sele??o ausente');
  assert.equal(await evaluate('document.querySelectorAll("canvas").length'),0);
  const selectMovement = async mode => {
    await evaluate(`g.session.pause(); g.session.settings(); g.session.controls();
      document.querySelector('[data-movement-mode="${mode}"]').click()`);
    assert.equal(await evaluate('!g.input.mouseNavigation.marker.visible'), true);
    await evaluate('g.session.back(); g.session.back(); g.session.play()');
  };
  const press = (type, code, key) => command('Input.dispatchKeyEvent', { type, code, key });
  const aim = async (x, z, y = 0) => {
    const [screenX, screenY] = await evaluate(`(() => {
      const canvas = g.renderer.domElement;
      const rect = canvas.getBoundingClientRect();
      const point = g.world.player.group.position.clone().set(${x}, ${y}, ${z}).project(g.camera.camera);
      return [rect.left + (1 + point.x) * rect.width / 2, rect.top + (1 - point.y) * rect.height / 2];
    })()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: screenX, y: screenY, buttons: 0 });
    await waitFor(`Math.abs(g.input.mouseNavigation.pointer?.x - ${screenX}) < 2 &&
      Math.abs(g.input.mouseNavigation.pointer?.y - ${screenY}) < 2`, 'Cursor não foi recebido');
  };
  const verifyGPS = async () => {
    assert.equal(await evaluate('g.input.usesGPS'), false);
    await selectMovement('gps');
    assert.equal(await evaluate('g.input.usesGPS && !document.querySelector(".mouse-joystick")'), true);
    await evaluate('g.world.player.group.position.set(0,0,6.8); g.world.player.stopMoving()');
    const other = await evaluate('g.players[1]?.player.group.position.toArray() ?? null');
    await aim(-1.4, 6.8);
    assert.equal(await evaluate('g.input.mouseNavigation.marker.visible'), false);
    assert.equal(await evaluate('g.world.player.group.position.x'), 0);
    await press('keyDown', 'KeyW', 'w');
    await waitFor('g.world.player.group.position.x < -.2', 'Hello Kitty não seguiu o cursor');
    assert.deepEqual(await evaluate('g.players[1]?.player.group.position.toArray() ?? null'), other);
    const previousDestination = await evaluate('g.input.mouseNavigation.marker.position.toArray()');
    await evaluate(`globalThis.__gpsDashEvents = 0; globalThis.__gpsOriginalDash = g.sound.playDash;
      g.sound.playDash = function(...args) { __gpsDashEvents++; return __gpsOriginalDash.apply(this, args); }`);
    // Use the retained plan: the marker hides after arrival, which may precede a CDP reply.
    await aim(-4.6, 6.8);
    await waitFor(`Math.abs(g.input.mouseNavigation.planned.x - ${previousDestination[0]}) > .3`, 'O destino não acompanhou o cursor');
    await press('keyDown', 'Space', ' ');
    await press('keyUp', 'Space', ' ');
    // Observe the accepted action, rather than a cooldown that may expire before a CDP reply.
    await waitFor('__gpsDashEvents > 0', 'Dash com GPS não iniciou');
    await evaluate('g.sound.playDash = __gpsOriginalDash; delete globalThis.__gpsOriginalDash; delete globalThis.__gpsDashEvents');
    await press('keyUp', 'KeyW', 'w');
    await waitFor('!g.input.mouseNavigation.marker.visible && g.world.player.velocity.lengthSq() === 0', 'W não interrompeu o movimento');
    const stopped = await evaluate('g.world.player.group.position.toArray()');
    await delay(180);
    assert.deepEqual(await evaluate('g.world.player.group.position.toArray()'), stopped);
    await aim(-1.4, 6.8);
    await press('keyDown', 'KeyW', 'w');
    await waitFor('g.input.mouseNavigation.marker.visible', 'Marcador ausente');
    await evaluate('g.session.pause()');
    assert.equal(await evaluate('!g.input.mouseNavigation.marker.visible && g.world.player.velocity.lengthSq() === 0'), true);
    await press('keyUp', 'KeyW', 'w');
    await evaluate('g.session.play()');
    const [x, z, y] = await evaluate(`(() => {
      const station = g.world.kitchen.stations.get('cucumberBox');
      return [station.position.x, station.position.z, station.collider.top];
    })()`);
    await aim(x, z, y);
    await press('keyDown', 'KeyW', 'w');
    await waitFor('g.input.mouseNavigation.station?.id === "cucumberBox" && g.input.mouseNavigation.stationMarker.visible', 'A caixa não foi selecionada');
    await waitFor('g.interactionSystem.activeStation?.id === "cucumberBox" && g.world.player.velocity.lengthSq() === 0', 'Hello Kitty não parou ao alcance da caixa');
    assert.equal(await evaluate('g.interactionSystem.highlight.visible && !g.interactionUI.key.hidden && g.interactionUI.key.textContent === "E"'), true);
    assert.equal(await evaluate('Boolean(g.carrySystem.carriedIngredient)'), false);
    await press('keyDown', 'KeyE', 'e');
    await press('keyUp', 'KeyE', 'e');
    await waitFor('Boolean(g.carrySystem.carriedIngredient)', 'E não pegou ingrediente com o GPS ativo');
    await press('keyUp', 'KeyW', 'w');
    await selectMovement('map');
    assert.equal(await evaluate('!g.input.usesGPS && !g.input.mouseNavigation.marker.visible'), true);
  };
  for (const mode of ['solo','coop','solo','coop']) {
    await evaluate('document.querySelector("[data-mode='+mode+']").click()');
    await waitFor('Boolean(document.querySelector("canvas"))','Canvas ausente');
    const count=mode==='solo'?1:2;
    assert.equal(await evaluate('__kawaiiTestGame.players.length'),count);
    assert.equal(await evaluate('__kawaiiTestGame.gameTimer.remaining'),300);
    assert.equal(await evaluate('document.querySelectorAll(".player-marker").length'),mode==='coop'?2:0);
    await evaluate('document.querySelector("[data-action=play]").click()');
    await waitFor('__kawaiiTestGame.gameTimer.remaining<300', 'Cron?metro n?o iniciou', 15000);
    await evaluate('globalThis.g=__kawaiiTestGame;g.world.players.forEach((p,i)=>{p.group.position.set(i*1.5,0,5.7);p.stopMoving()});');
    await evaluate('g.session.pause();g.session.settings()');
    assert.equal(await evaluate(`(() => {
      const angle = document.querySelector('[data-camera-setting=inclination]');
      const zoom = document.querySelector('[data-camera-setting=zoom]');
      angle.value = 60; angle.dispatchEvent(new Event('input', { bubbles: true }));
      zoom.value = 110; zoom.dispatchEvent(new Event('input', { bubbles: true }));
      const valid = g.camera.settings.inclination === 60 && g.camera.settings.zoom === 1.1
        && g.players.every(context => context.input.camera === g.camera.camera);
      document.querySelector('[data-action=reset-camera]').click();
      return valid && g.camera.settings.inclination === 55 && g.camera.settings.zoom === ${CAMERA_CONFIG.zoom};
    })()`),true);
    await evaluate('g.session.back();g.session.play()');
    const initial=await evaluate('g.world.players.map(p=>p.group.position.toArray())');
    await command('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyD',key:'d'});
    if(mode==='coop') await command('Input.dispatchKeyEvent',{type:'keyDown',code:'ArrowDown',key:'ArrowDown'});
    await delay(250);
    await command('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyD',key:'d'});
    if(mode==='coop') await command('Input.dispatchKeyEvent',{type:'keyUp',code:'ArrowDown',key:'ArrowDown'});
    const moved=await evaluate('g.world.players.map(p=>p.group.position.toArray())');
    assert.ok(moved[0][0]>initial[0][0]+.1);
    if(mode==='coop') assert.ok(moved[1][2]>initial[1][2]+.1);
    if(mode==='coop') {
      await evaluate('g.world.players[0].group.position.set(0,0,5.7);g.world.players[1].stopMoving();g.world.players[1].group.position.copy(g.world.kitchen.stations.get("salmonBox").getApproachPosition())');
      await waitFor('g.players[1].interactionSystem.activeStation?.id==="salmonBox"','P2 longe da caixa');
      assert.equal(await evaluate('g.players[1].interactionUI.key.textContent'),'P');
      for(const code of ['Enter','ShiftRight']) {
        await command('Input.dispatchKeyEvent',{type:'keyDown',code,key:code==='Enter'?'Enter':'Shift'});
        await command('Input.dispatchKeyEvent',{type:'keyUp',code,key:code==='Enter'?'Enter':'Shift'});
        await delay(100);
        assert.equal(await evaluate('g.players[1].carrySystem.carriedIngredient'),null);
      }
      await command('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyP',key:'p'});
      await command('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyP',key:'p'});
      await waitFor('Boolean(g.players[1].carrySystem.carriedIngredient)','P não pegou ingrediente');
      assert.equal(await evaluate('g.players[1].player.dashRemaining'),0);
      assert.equal(await evaluate('g.players[0].carrySystem.carriedIngredient'),null);
    }
    await verifyGPS();
    assert.equal(await evaluate(`(async () => {
      const { RECIPES } = await import('/src/game/RecipeSystem.js');
      const check = (value, message) => { if (!value) throw new Error(message); };
      g.session.pause();
      g.players.forEach(context => context.carrySystem.discard());
      const assembly = g.preparation.assemblySystems.values().next().value;
      for (const recipe of RECIPES) {
        for (const [index, state] of recipe.sequence.entries()) {
          const context = g.players[index % g.players.length];
          const type = { rice_cooked: 'rice', nori_sheet: 'nori', salmon_cut: 'salmon', cucumber_cut: 'cucumber' }[state];
          context.carrySystem.attach(g.ingredientFactory.create(type, state));
          check(assembly.interact(context.carrySystem).success, 'Recipe ingredient rejected');
          check(context.player.gestureKind === 'assembly', 'Wrong actor gesture');
        }
        check(assembly.dish.recipeId === recipe.id, 'Wrong finished dish');
        check(assembly.anchor.parent.name === 'assembly-bamboo-mat', 'Wrong assembly mat');
        assembly.update(.3);
        const elapsed = assembly.effects.elapsed;
        g.updateSimulation(.5);
        check(assembly.effects.elapsed === elapsed, 'Paused animation advanced');
        g.renderer.render(g.world.scene, g.camera.camera);
        for (let step = 0; step < 3; step++) assembly.update(.5);
        check(assembly.effects.stage === 'idle', 'Animation did not finish');
        const dish = assembly.dish;
        const context = g.players.at(-1);
        check(assembly.interact(context.carrySystem).success, 'Pickup rejected');
        check(dish.model.parent === context.player.carryAnchor, 'Wrong carry anchor');
        check(!dish.model.getObjectByName('assembly-rolling-sushi'), 'Temporary roll leaked');
        check(!dish.model.getObjectByName('assembly-completion-sparkles'), 'Sparkles leaked');
        context.carrySystem.discard();
      }
      g.session.play();
      return true;
    })()`), true);
    await verifyServiceBrowser({ evaluate, command, delay });
    await evaluate('g.session.pause()');const time=await evaluate('g.gameTimer.remaining');await delay(100);assert.equal(await evaluate('g.gameTimer.remaining'),time);
    await evaluate('g.recipeBookUI.open()');assert.equal(await evaluate('g.session.mode'),'RECIPE_BOOK');
    await command('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyP',key:'p'});
    await command('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyP',key:'p'});
    assert.equal(await evaluate('g.session.mode'),'RECIPE_BOOK');
    assert.equal(await evaluate('g.players.every(c=>!c.input.enabled)'),true);
    await evaluate('g.recipeBookUI.close();g.session.play()');
    await selectMovement('gps');
    await aim(0, 6.8);
    await press('keyDown', 'KeyW', 'w');
    await waitFor('g.input.mouseNavigation.marker.visible', 'Marcador ausente antes do fim da partida');
    await evaluate('g.gameTimer.remaining=.001;g.updateSimulation(1)');
    assert.equal(await evaluate('g.session.mode'),'FINISHED');assert.equal(await evaluate('g.players.every(c=>!c.input.enabled&&c.player.velocity.lengthSq()===0)'),true);
    assert.equal(await evaluate('g.input.mouseNavigation.marker.visible'), false);
    await press('keyUp', 'KeyW', 'w');
    assert.equal(await evaluate('document.querySelector(".results-overlay").hidden'),false);
    await evaluate('document.querySelector(".results-panel button").click()');
    assert.equal(await evaluate('__kawaiiTestGame.players.length'),count);
    assert.equal(await evaluate('document.querySelectorAll("canvas").length'),1);
    assert.equal(await evaluate('g.input.mouseNavigation.marker.parent === null && __kawaiiTestGame.input.mouseNavigation.marker.parent === __kawaiiTestGame.world.scene'),true);
    assert.equal(await evaluate('__kawaiiTestGame.input.usesGPS && !__kawaiiTestGame.input.mouseNavigation.marker.visible && __kawaiiTestGame.input.mouseNavigation.route.length === 0'), true);
    assert.equal(await evaluate('document.querySelectorAll(".interaction-ui").length'),count);
    assert.equal(await evaluate('__kawaiiTestGame.scoreSystem.score'),0);
    assert.equal(await evaluate('__kawaiiTestGame.players.every(c=>!c.carrySystem.carriedIngredient)'),true);
    assert.equal(await evaluate('__kawaiiTestGame.gameMode'),mode);
    assert.equal(await evaluate('__kawaiiTestGame.difficulty.index === 0 && __kawaiiTestGame.difficulty.maxOrders === 2'),true);
    await evaluate('__kawaiiTestGame.controlSettings.setMovementMode("map");__kawaiiTestGame.gameTimer.remaining=.001;__kawaiiTestGame.updateSimulation(1);document.querySelector("[data-action=mode-menu]").click()');
    assert.equal(await evaluate('document.querySelectorAll("canvas").length'),0);
    assert.equal(await evaluate('document.querySelectorAll(".interaction-ui").length'),0);
    assert.equal(await evaluate('__kawaiiTestGame.input.mouseNavigation.marker.parent === null'),true);
  }
  assert.deepEqual(errors,[]);await send('Browser.close');
  console.log('OK: navegador: GPS sem clique, destino atualizado, dash, E, parada ao soltar W, pausa, solo/dupla, receitas, fim de partida e reinício sem erros de console.');

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
