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
  await delay(500);
  const state = await evaluate(`(() => {
    const g = __kawaiiTestGame;
    return { stations: [...g.world.kitchen.stations.keys()], colliders: g.world.kitchen.colliders.every(c => g.collisionSystem.obstacles.has(c.id)),
      speed: g.world.player.maxSpeed, duration: g.world.player.dashDuration, cooldown: g.world.player.dashCooldown,
      draws: g.renderer.info.render.calls, camera: g.camera.camera.position.toArray(), spawn: g.world.player.group.position.toArray() };
  })()`);
  assert.equal(state.stations.length, 9);
  for (const id of ['salmonBox', 'riceBox', 'cucumberBox', 'noriBox']) assert.ok(state.stations.includes(id));
  assert.ok(!state.stations.includes('fridge') && !state.stations.includes('pantry'));
  assert.equal(state.colliders, true);
  assert.equal(state.speed, 4.2);
  assert.equal(state.duration, 0.18);
  assert.equal(state.cooldown, 0.65);
  assert.ok(state.draws > 0);
  await mkdir('artifacts', { recursive: true });
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('artifacts/kitchen.png', Buffer.from(screenshot.data, 'base64'));
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await delay(120);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16, modifiers: 8 });
  await delay(80);
  assert.equal(await evaluate('__kawaiiTestGame.world.player.state'), 'dashing');
  await delay(400);
  assert.equal(await evaluate('__kawaiiTestGame.world.player.dashRemaining'), 0, 'Segurar Shift não deve repetir dash.');
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await delay(1000);
  assert.equal(await evaluate('__kawaiiTestGame.world.player.state'), 'idle');
  assert.deepEqual(await evaluate('__kawaiiTestGame.camera.camera.position.toArray()'), state.camera);
  assert.notDeepEqual(await evaluate('__kawaiiTestGame.world.player.group.position.toArray()'), state.spawn);
  await evaluate(`(() => {
    const g = __kawaiiTestGame;
    globalThis.__interactionEvents = [];
    globalThis.__carryEvents = [];
    const original = g.interactionSystem.onInteract;
    g.interactionSystem.onInteract = event => {
      __interactionEvents.push(event.stationId);
      __carryEvents.push({ stationId: event.stationId, kind: event.kind, success: event.success });
      original?.(event);
    };
  })()`);
  const pressE = (type, autoRepeat = false) => command('Input.dispatchKeyEvent', {
    type, code: 'KeyE', key: 'e', windowsVirtualKeyCode: 69, autoRepeat,
  });
  const approach = (id) => evaluate(`(() => {
    const g = __kawaiiTestGame;
    g.input.reset();
    g.world.player.stopMoving();
    g.world.player.group.position.copy(g.world.kitchen.stations.get(${JSON.stringify(id)}).getApproachPosition());
    g.interactionSystem.reset();
  })()`);
  for (const [index, id] of state.stations.entries()) {
    await approach(id);
    await waitFor(`__kawaiiTestGame.interactionSystem.activeStation?.id === ${JSON.stringify(id)}`, `Estação ${id} não foi selecionada.`);
    assert.equal(await evaluate('__kawaiiTestGame.interactionSystem.activeStation?.id'), id);
    assert.equal(await evaluate('document.querySelector(".interaction-hint").hidden'), false);
    assert.equal(await evaluate('document.querySelector(".interaction-hint").dataset.stationId'), id);
    const label = await evaluate('document.querySelector(".interaction-hint span").textContent');
    assert.ok(label.length > 0);
    await pressE('keyDown');
    await waitFor(`__interactionEvents.length === ${index + 1}`, `E não foi processado em ${id}.`);
    assert.equal(await evaluate('__interactionEvents.length'), index + 1);
    assert.equal(await evaluate('__interactionEvents.at(-1)'), id);
    assert.equal(await evaluate('document.querySelector(".interaction-feedback").hidden'), false);
    for (let i = 0; i < 3; i++) await pressE('keyDown', true);
    await delay(60);
    assert.equal(await evaluate('__interactionEvents.length'), index + 1, 'Segurar E repete a interação.');
    await pressE('keyUp');
  }
  await approach('assembly');
  await waitFor('__kawaiiTestGame.interactionSystem.activeStation?.id === "assembly"', 'Ilha não selecionada para a captura.');
  const interactionPreview = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile('artifacts/interaction.png', Buffer.from(interactionPreview.data, 'base64'));
  // E fora do alcance não fica guardado para quando a personagem se aproximar.
  await evaluate('__kawaiiTestGame.world.player.group.position.copy(__kawaiiTestGame.world.kitchen.spawnPosition)');
  await waitFor('document.querySelector(".interaction-hint").hidden', 'Indicador permaneceu fora do alcance.');
  assert.equal(await evaluate('document.querySelector(".interaction-hint").hidden'), true);
  const beforeIgnored = await evaluate('__interactionEvents.length');
  await pressE('keyDown');
  await delay(80);
  await evaluate('__kawaiiTestGame.world.player.group.position.copy(__kawaiiTestGame.world.kitchen.stations.get("assembly").getApproachPosition())');
  await waitFor('__kawaiiTestGame.interactionSystem.activeStation?.id === "assembly"', 'Seleção não retornou depois de se aproximar.');
  await pressE('keyDown', true);
  await delay(80);
  assert.equal(await evaluate('__interactionEvents.length'), beforeIgnored);
  await pressE('keyUp');
  // Dash + E não executa uma interação, nem durante a arrancada nem ao terminar.
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16, modifiers: 8 });
  await pressE('keyDown');
  await waitFor('__kawaiiTestGame.world.player.state === "dashing" && document.querySelector(".interaction-hint").hidden', 'Indicador não foi ocultado durante o dash.');
  assert.equal(await evaluate('document.querySelector(".interaction-hint").hidden'), true);
  assert.equal(await evaluate('__interactionEvents.length'), beforeIgnored);
  await waitFor('__kawaiiTestGame.world.player.dashRemaining === 0', 'Dash não terminou.');
  await pressE('keyDown', true);
  await delay(60);
  assert.equal(await evaluate('__interactionEvents.length'), beforeIgnored);
  await pressE('keyUp');
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await approach('assembly');
  await waitFor('__kawaiiTestGame.interactionSystem.activeStation?.id === "assembly"', 'Seleção não retornou depois do dash.');
  await pressE('keyDown');
  await waitFor(`__interactionEvents.length === ${beforeIgnored + 1}`, 'Novo E não funcionou depois do dash.');
  assert.equal(await evaluate('__interactionEvents.length'), beforeIgnored + 1);
  await pressE('keyUp');
  await evaluate('window.dispatchEvent(new Event("blur"))');
  await delay(60);
  assert.equal(await evaluate('document.querySelector(".interaction-hint").hidden'), true);
  assert.equal(await evaluate('document.querySelector(".interaction-feedback").hidden'), true);
  await evaluate('window.dispatchEvent(new Event("focus"))');
  await waitFor('__kawaiiTestGame.interactionSystem.activeStation?.id === "assembly"', 'Seleção não voltou após recuperar o foco.');
  assert.equal(await evaluate('__kawaiiTestGame.interactionSystem.activeStation?.id'), 'assembly');
  assert.deepEqual(await evaluate('__kawaiiTestGame.camera.camera.position.toArray()'), state.camera);
  // O fluxo genérico recuperou nori da ilha. A tábua especializada agora rejeita nori.
  const carryAction = async (id, kind, type = null) => {
    await approach(id);
    await waitFor(`__kawaiiTestGame.interactionSystem.activeStation?.id === ${JSON.stringify(id)}`, `Seleção de ${id} não atualizou.`);
    const before = await evaluate('__carryEvents.length');
    await pressE('keyDown');
    await waitFor(`__carryEvents.length === ${before + 1}`, `Ação ${kind} não foi processada.`);
    assert.equal(await evaluate('__carryEvents.at(-1).kind'), kind);
    assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient?.type ?? null'), type);
    assert.equal(await evaluate('__kawaiiTestGame.world.player.carryAnchor.children.length'), type ? 1 : 0);
    for (let i = 0; i < 2; i++) await pressE('keyDown', true);
    await delay(80);
    assert.equal(await evaluate('__carryEvents.length'), before + 1);
    await pressE('keyUp');
  };
  const pressR = (type) => command('Input.dispatchKeyEvent', { type, code: 'KeyR', key: 'r', windowsVirtualKeyCode: 82 });
  const cancelAssembly = async () => {
    await approach('assembly');
    await waitFor('__kawaiiTestGame.interactionSystem.activeStation?.id === "assembly"', 'Ilha fora do alcance para cancelar.');
    await pressR('keyDown');
    await waitFor('__kawaiiTestGame.assemblySystem.state === "EMPTY"', 'R não cancelou a montagem.', 3500);
    await pressR('keyUp');
  };
  await cancelAssembly();
  for (const [id, type, initialState] of [
    ['salmonBox', 'salmon', 'salmon_raw'], ['riceBox', 'rice', 'rice_raw'],
    ['cucumberBox', 'cucumber', 'cucumber_whole'], ['noriBox', 'nori', 'nori_sheet'],
  ]) {
    await carryAction(id, 'pickup', type);
    assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.state'), initialState);
    assert.ok((await evaluate('document.querySelector(".interaction-hint span").textContent')).startsWith('Devolver'));
    await evaluate(`(() => {
      const p = __kawaiiTestGame.world.player;
      p.group.position.set(0, 0, 4.2); p.group.rotation.y = Math.PI / 4; p.stopMoving();
    })()`);
    await waitFor('__kawaiiTestGame.world.player.carryWeight > 0.98', 'Pose de transporte não estabilizou.');
    const clip = await evaluate(`(() => {
      const g = __kawaiiTestGame;
      const center = g.world.player.group.position.clone(); center.y += 1.3; center.project(g.camera.camera);
      return { x: (center.x + 1) * 720 - 120, y: (1 - center.y) * 500 - 150, width: 240, height: 300, scale: 2 };
    })()`);
    const heldPreview = await command('Page.captureScreenshot', { format: 'png', clip });
    await writeFile(`artifacts/carry-${type}.png`, Buffer.from(heldPreview.data, 'base64'));
    await carryAction(id, 'return');
    assert.equal(await evaluate('__kawaiiTestGame.ingredientFactory.instances.size'), 0);
  }
  await carryAction('salmonBox', 'pickup', 'salmon');
  const firstInstance = await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId');
  await carryAction('cucumberBox', 'swap', 'cucumber');
  assert.notEqual(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId'), firstInstance);
  assert.equal(await evaluate('__kawaiiTestGame.ingredientFactory.instances.size'), 1);
  await carryAction('cucumberBox', 'return');
  await carryAction('riceBox', 'pickup', 'rice');
  const riceInstance = await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId');
  await carryAction('assembly', 'unavailable', 'rice');
  assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId'), riceInstance);
  await carryAction('riceBox', 'return');
  await carryAction('salmonBox', 'pickup', 'salmon');
  await carryAction('assembly', 'unavailable', 'salmon');
  assert.equal(await evaluate('document.querySelector(".interaction-hint span").textContent'), 'Ingrediente incorreto');
  assert.equal(await evaluate('document.querySelector(".interaction-hint").dataset.available'), 'false');
  assert.equal(await evaluate('__kawaiiTestGame.assemblySystem.state'), 'EMPTY');
  await carryAction('riceCooker', 'unavailable', 'salmon');
  await carryAction('delivery', 'unavailable', 'salmon');
  await carryAction('trash', 'discard');
  await carryAction('trash', 'unavailable');
  await carryAction('cucumberBox', 'pickup', 'cucumber');
  await approach('assembly');
  await waitFor('__kawaiiTestGame.interactionSystem.activeStation?.id === "assembly"', 'Ilha não selecionada antes do dash carregado.');
  const beforeCarryDash = await evaluate('__carryEvents.length');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16, modifiers: 8 });
  await pressE('keyDown');
  await waitFor('__kawaiiTestGame.world.player.state === "dashing"', 'Dash carregado não iniciou.');
  assert.equal(await evaluate('__carryEvents.length'), beforeCarryDash);
  await waitFor('__kawaiiTestGame.world.player.dashRemaining === 0', 'Dash carregado não terminou.');
  assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.type'), 'cucumber');
  assert.equal(await evaluate('__kawaiiTestGame.world.kitchen.stations.get("assembly").storedIngredient'), null);
  const attached = await evaluate(`(() => {
    const g = __kawaiiTestGame, p = g.world.player, ingredient = g.carrySystem.carriedIngredient;
    return ingredient.model.parent === p.carryAnchor
      && ingredient.model.getWorldPosition(p.velocity.clone()).distanceTo(p.carryAnchor.getWorldPosition(p.velocity.clone())) < 1e-8;
  })()`);
  assert.equal(attached, true, 'Ingrediente ficou para trás durante o dash.');
  await pressE('keyUp');
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await carryAction('trash', 'discard');
  assert.equal(await evaluate('__kawaiiTestGame.ingredientFactory.instances.size'), 0);
  assert.equal(await evaluate('__kawaiiTestGame.cuttingSystem.strokeDuration'), 0.25);
  await evaluate(`(() => {
    const s = __kawaiiTestGame.sound;
    globalThis.__cutSounds = { hits: 0, completions: 0 };
    const chop = s.playChop.bind(s), complete = s.playComplete.bind(s);
    s.playChop = () => { __cutSounds.hits++; return chop(); };
    s.playComplete = () => { __cutSounds.completions++; return complete(); };
  })()`);
  const captureCutting = async (name) => {
    const clip = await evaluate(`(() => {
      const g = __kawaiiTestGame, center = g.world.kitchen.stations.get('cutting').position.clone().setY(2).project(g.camera.camera);
      return { x: (center.x + 1) * 720 - 190, y: (1 - center.y) * 500 - 165, width: 380, height: 350, scale: 1.5 };
    })()`);
    const screenshot = await command('Page.captureScreenshot', { format: 'png', clip });
    await writeFile(`artifacts/cutting-${name}.png`, Buffer.from(screenshot.data, 'base64'));
  };
  for (const [box, type, prepared] of [['salmonBox', 'salmon', 'salmon_cut'], ['cucumberBox', 'cucumber', 'cucumber_cut']]) {
    await carryAction(box, 'pickup', type);
    const instance = await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId');
    await carryAction('cutting', 'load-cutting');
    assert.equal(await evaluate('__kawaiiTestGame.cuttingSystem.state'), 'LOADED');
    assert.equal(await evaluate('__kawaiiTestGame.cuttingSystem.cuts'), 0);
    assert.equal(await evaluate('document.querySelector(".cutting-progress").getAttribute("aria-valuenow")'), '0');
    await captureCutting(`${type}-loaded`);
    for (let hit = 1; hit <= 5; hit++) {
      if (type === 'salmon' && hit === 1) {
        // Pausa só o loop de teste no início do golpe, sem alterar a duração de produção.
        await evaluate(`(() => {
          const g = __kawaiiTestGame, previous = g.interactionSystem.onInteract;
          globalThis.__pauseNextCut = true;
          g.world.player.group.rotation.y = -Math.PI / 2;
          g.interactionSystem.onInteract = event => {
            previous?.(event);
            if (__pauseNextCut && event.kind === 'cut-stroke') { __pauseNextCut = false; g.running = false; }
          };
        })()`);
        await carryAction('cutting', 'cut-stroke');
        const locked = await evaluate(`(() => {
          const g = __kawaiiTestGame;
          if (!g.cuttingSystem.isCutting || !g.input.actionsBlocked) throw new Error('Golpe não bloqueou os comandos.');
          cancelAnimationFrame(g.frameId);
          g.cuttingSystem.update(g.cuttingSystem.strokeDuration * 0.5);
          for (let i = 0; i < 3; i++) g.world.player.update(0.05);
          for (const code of ['KeyW', 'ShiftLeft', 'KeyE']) {
            window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
          }
          g.cuttingUI.update(g.cuttingSystem, g.camera.camera);
          g.renderer.render(g.world.scene, g.camera.camera);
          return { position: g.world.player.group.position.toArray(), rotation: g.world.player.group.rotation.y, events: __carryEvents.length };
        })()`);
        const lockedPosition = locked.position, lockedRotation = locked.rotation, lockedEvents = locked.events;
        await captureCutting('stroke');
        await evaluate(`(() => {
          const g = __kawaiiTestGame;
          cancelAnimationFrame(g.frameId); g.running = true; g.previousTime = null;
          g.frameId = requestAnimationFrame(g.tick);
        })()`);
        await waitFor('!__kawaiiTestGame.cuttingSystem.isCutting', 'Golpe não terminou.');
        assert.deepEqual(await evaluate('__kawaiiTestGame.world.player.group.position.toArray()'), lockedPosition);
        assert.equal(await evaluate('__kawaiiTestGame.world.player.group.rotation.y'), lockedRotation);
        assert.equal(await evaluate('__kawaiiTestGame.world.player.dashRemaining'), 0);
        assert.equal(await evaluate('__carryEvents.length'), lockedEvents);
        await pressE('keyDown', true);
        await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87, autoRepeat: true });
        await delay(100);
        assert.deepEqual(await evaluate('__kawaiiTestGame.world.player.group.position.toArray()'), lockedPosition);
        assert.equal(await evaluate('__kawaiiTestGame.cuttingSystem.cuts'), 1);
        assert.equal(await evaluate('__carryEvents.length'), lockedEvents);
        await pressE('keyUp');
        await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
        await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16 });
      } else {
        await carryAction('cutting', 'cut-stroke');
        await waitFor('!__kawaiiTestGame.cuttingSystem.isCutting', 'Golpe ficou bloqueado.');
      }
      assert.equal(await evaluate('__kawaiiTestGame.cuttingSystem.cuts'), hit);
      assert.equal(await evaluate('document.querySelector(".cutting-progress").getAttribute("aria-valuenow")'), String(hit * 20));
      assert.equal(await evaluate('__kawaiiTestGame.world.player.movementLocked'), false);
      assert.equal(await evaluate('__kawaiiTestGame.cuttingSystem.content.instanceId'), instance);
      if (hit === 3) {
        const position = await evaluate('__kawaiiTestGame.cuttingSystem.content.model.getWorldPosition(__kawaiiTestGame.world.player.velocity.clone()).toArray()');
        await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyA', key: 'a', windowsVirtualKeyCode: 65 });
        await delay(650);
        await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyA', key: 'a', windowsVirtualKeyCode: 65 });
        await waitFor('__kawaiiTestGame.interactionSystem.activeStation?.id !== "cutting"', 'Não foi possível sair da bancada entre golpes.');
        assert.equal(await evaluate('__kawaiiTestGame.cuttingSystem.cuts'), 3);
        assert.deepEqual(await evaluate('__kawaiiTestGame.cuttingSystem.content.model.getWorldPosition(__kawaiiTestGame.world.player.velocity.clone()).toArray()'), position);
      }
    }
    assert.equal(await evaluate('__kawaiiTestGame.cuttingSystem.state'), 'READY');
    assert.equal(await evaluate('__kawaiiTestGame.cuttingSystem.content.state'), prepared);
    assert.equal(await evaluate('document.querySelector(".cutting-progress").hidden'), true);
    await captureCutting(`${type}-ready`);
    await carryAction('noriBox', 'pickup', 'nori');
    await carryAction('cutting', 'unavailable', 'nori');
    assert.equal(await evaluate('document.querySelector(".interaction-hint span").textContent'), 'Mãos ocupadas');
    await carryAction('trash', 'discard');
    await carryAction('cutting', 'take-cut-ingredient', type);
    assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.state'), prepared);
    assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId'), instance);
    assert.equal(await evaluate('__kawaiiTestGame.cuttingSystem.state'), 'EMPTY');
    assert.equal(await evaluate('document.querySelector(".cutting-status").hidden'), true);
    await carryAction('cutting', 'unavailable', type);
    await evaluate(`(() => { const p = __kawaiiTestGame.world.player; p.stopMoving(); p.group.position.set(0, 0, 4.2); p.group.rotation.y = Math.PI / 4; })()`);
    await waitFor('__kawaiiTestGame.world.player.carryWeight > 0.98 && __kawaiiTestGame.world.player.cutWeight < 0.01', 'Pose de transporte não foi restaurada.');
    const clip = await evaluate(`(() => {
      const g = __kawaiiTestGame, center = g.world.player.group.position.clone().setY(1.3).project(g.camera.camera);
      return { x: (center.x + 1) * 720 - 120, y: (1 - center.y) * 500 - 150, width: 240, height: 300, scale: 2 };
    })()`);
    const screenshot = await command('Page.captureScreenshot', { format: 'png', clip });
    await writeFile(`artifacts/carry-${prepared}.png`, Buffer.from(screenshot.data, 'base64'));
    await carryAction('assembly', 'unavailable', type);
    assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.state'), prepared);
    await carryAction('trash', 'discard');
  }
  assert.equal(await evaluate('__cutSounds.hits'), 10);
  assert.equal(await evaluate('__cutSounds.completions'), 2);
  assert.equal(await evaluate('__kawaiiTestGame.sound.context?.state'), 'running');
  for (const [box, type] of [['riceBox', 'rice'], ['noriBox', 'nori']]) {
    await carryAction(box, 'pickup', type);
    await carryAction('cutting', 'unavailable', type);
    assert.equal(await evaluate('__kawaiiTestGame.cuttingSystem.state'), 'EMPTY');
    await carryAction(box, 'return');
  }
  const captureCooker = async (name) => {
    const clip = await evaluate(`(() => {
      const g = __kawaiiTestGame;
      const center = g.world.kitchen.stations.get('riceCooker').position.clone().setY(1.8).project(g.camera.camera);
      return { x: (center.x + 1) * 720 - 180, y: (1 - center.y) * 500 - 160, width: 360, height: 340, scale: 1.5 };
    })()`);
    const screenshot = await command('Page.captureScreenshot', { format: 'png', clip });
    await writeFile(`artifacts/rice-${name}.png`, Buffer.from(screenshot.data, 'base64'));
  };
  // Ciclo completo da panela existente, com os tempos reais de 8 e 12 segundos.
  await carryAction('riceBox', 'pickup', 'rice');
  const cookingInstance = await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId');
  await carryAction('riceCooker', 'load-rice');
  assert.equal(await evaluate('__kawaiiTestGame.riceCooker.state'), 'LOADED');
  assert.equal(await evaluate('__kawaiiTestGame.riceCooker.content.instanceId'), cookingInstance);
  assert.equal(await evaluate('document.querySelector(".interaction-hint span").textContent'), 'Iniciar cozimento');
  await carryAction('riceCooker', 'start-cooking');
  await waitFor('document.querySelector(".rice-cooker-status").dataset.state === "COOKING" && Number(document.querySelector(".rice-cooker-progress").getAttribute("aria-valuenow")) > 0', 'Barra de cozimento não foi atualizada.');
  assert.equal(await evaluate('document.querySelector(".rice-cooker-progress").hidden'), false);
  assert.equal(await evaluate('document.querySelector(".interaction-hint kbd").hidden'), true);
  await captureCooker('cooking');
  const movingWhileCooking = await evaluate('__kawaiiTestGame.world.player.group.position.toArray()');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyS', key: 's', windowsVirtualKeyCode: 83 });
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16, modifiers: 8 });
  await waitFor('__kawaiiTestGame.world.player.state === "dashing"', 'Cozimento bloqueou o dash.');
  await waitFor('__kawaiiTestGame.world.player.dashRemaining === 0', 'Dash durante cozimento não terminou.');
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyS', key: 's', windowsVirtualKeyCode: 83 });
  assert.notDeepEqual(await evaluate('__kawaiiTestGame.world.player.group.position.toArray()'), movingWhileCooking);
  await carryAction('salmonBox', 'pickup', 'salmon');
  await waitFor('__kawaiiTestGame.riceCooker.state === "READY"', 'Arroz não ficou pronto após 8 segundos.', 10000);
  await carryAction('riceCooker', 'unavailable', 'salmon');
  assert.equal(await evaluate('document.querySelector(".interaction-hint span").textContent'), 'Mãos ocupadas');
  assert.equal(await evaluate('document.querySelector(".rice-cooker-status").dataset.state'), 'READY');
  assert.equal(await evaluate('document.querySelector(".rice-cooker-progress").hidden'), true);
  assert.equal(await evaluate('__kawaiiTestGame.riceCooker.content.state'), 'rice_cooked');
  await captureCooker('ready');
  await carryAction('trash', 'discard');
  await carryAction('riceCooker', 'take-cooked-rice', 'rice');
  assert.equal(await evaluate('__kawaiiTestGame.riceCooker.state'), 'EMPTY');
  assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId'), cookingInstance);
  assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.state'), 'rice_cooked');
  await carryAction('cutting', 'unavailable', 'rice');
  assert.equal(await evaluate('document.querySelector(".rice-cooker-status").hidden'), true);
  await carryAction('riceCooker', 'unavailable', 'rice');
  assert.equal(await evaluate('__kawaiiTestGame.riceCooker.state'), 'EMPTY', 'Não deve aceitar arroz cozido como entrada.');
  await evaluate(`(() => { const p = __kawaiiTestGame.world.player; p.stopMoving(); p.group.position.set(0, 0, 4.2); p.group.rotation.y = Math.PI / 4; })()`);
  await waitFor('__kawaiiTestGame.world.player.carryWeight > 0.98', 'Pose do arroz cozido não estabilizou.');
  const cookedClip = await evaluate(`(() => {
    const g = __kawaiiTestGame, center = g.world.player.group.position.clone().setY(1.3).project(g.camera.camera);
    return { x: (center.x + 1) * 720 - 120, y: (1 - center.y) * 500 - 150, width: 240, height: 300, scale: 2 };
  })()`);
  const cookedPreview = await command('Page.captureScreenshot', { format: 'png', clip: cookedClip });
  await writeFile('artifacts/carry-rice-cooked.png', Buffer.from(cookedPreview.data, 'base64'));
  await carryAction('assembly', 'add-ingredient');
  assert.equal(await evaluate('__kawaiiTestGame.assemblySystem.ingredients[0].instanceId'), cookingInstance);
  assert.equal(await evaluate('__kawaiiTestGame.assemblySystem.analysis.possible.length'), 2);
  await cancelAssembly();
  await carryAction('riceBox', 'pickup', 'rice');
  await carryAction('riceCooker', 'load-rice');
  await carryAction('riceCooker', 'start-cooking');
  await waitFor('__kawaiiTestGame.riceCooker.state === "READY"', 'Segundo ciclo não concluiu o cozimento.', 10000);
  await waitFor('__kawaiiTestGame.riceCooker.state === "BURNT"', 'Arroz não queimou após 12 segundos adicionais.', 14000);
  await approach('riceCooker');
  await waitFor('document.querySelector(".interaction-hint span").textContent === "Descartar arroz queimado"', 'Ação de descarte não atualizou.');
  assert.equal(await evaluate('__kawaiiTestGame.riceCooker.content.state'), 'rice_burnt');
  assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient'), null);
  assert.equal(await evaluate('document.querySelector(".rice-cooker-status").dataset.state'), 'BURNT');
  assert.equal(await evaluate('__kawaiiTestGame.riceCooker.effects.particles.filter(p => p.mesh.visible).length'), 5);
  await captureCooker('burnt');
  await carryAction('riceCooker', 'discard-burnt-rice');
  assert.equal(await evaluate('__kawaiiTestGame.riceCooker.state'), 'EMPTY');
  assert.equal(await evaluate('__kawaiiTestGame.ingredientFactory.instances.size'), 0);
  assert.equal(await evaluate('document.querySelector(".rice-cooker-status").hidden'), true);
  assert.equal(await evaluate('__kawaiiTestGame.riceCooker.effects.particles.some(p => p.mesh.visible)'), false);
  // Ingredientes preparados como fixtures; os ciclos reais de corte/cozimento foram testados acima.
  const prepared = (state) => evaluate(`(() => {
    const g = __kawaiiTestGame;
    const type = ({rice_cooked:'rice', salmon_cut:'salmon', cucumber_cut:'cucumber', nori_sheet:'nori'})[${JSON.stringify(state)}];
    g.carrySystem.attach(g.ingredientFactory.create(type, ${JSON.stringify(state)}));
  })()`);
  const captureAssembly = async (name, carried = false) => {
    const clip = await evaluate(`(() => {
      const g = __kawaiiTestGame, center = ${carried ? 'g.world.player.group.position.clone().setY(1.3)' : 'g.assemblySystem.station.position.clone().setY(1.3)'}.project(g.camera.camera);
      return { x: (center.x + 1) * 720 - 220, y: (1 - center.y) * 500 - 170, width: 440, height: 340, scale: 2 };
    })()`);
    const screenshot = await command('Page.captureScreenshot', { format: 'png', clip });
    await writeFile(`artifacts/assembly-${name}.png`, Buffer.from(screenshot.data, 'base64'));
  };
  for (const [recipe, sequence] of [
    ['salmon_nigiri', ['rice_cooked', 'salmon_cut']],
    ['salmon_maki', ['nori_sheet', 'rice_cooked', 'salmon_cut']],
    ['cucumber_uramaki', ['rice_cooked', 'nori_sheet', 'cucumber_cut']],
  ]) {
    for (let i = 0; i < sequence.length; i++) {
      await prepared(sequence[i]);
      await carryAction('assembly', i === sequence.length - 1 ? 'finish-sushi' : 'add-ingredient');
      if (i < sequence.length - 1) {
        assert.equal(await evaluate('__kawaiiTestGame.assemblySystem.state'), 'ASSEMBLING');
        assert.equal(await evaluate('document.querySelector(".assembly-panel").hidden'), false);
        if (sequence[i] === 'rice_cooked' && i === 0) {
          assert.equal(await evaluate('__kawaiiTestGame.assemblySystem.analysis.possible.length'), 2);
          assert.equal(await evaluate('document.querySelector(".assembly-panel strong").textContent'), 'Montagem de sushi');
        }
        await captureAssembly(`${recipe}-step-${i + 1}`);
        await carryAction('salmonBox', 'pickup', 'salmon');
        const wrong = await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId');
        await carryAction('assembly', 'unavailable', 'salmon');
        assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId'), wrong);
        await carryAction('salmonBox', 'return');
      }
    }
    assert.equal(await evaluate('__kawaiiTestGame.assemblySystem.dish.recipeId'), recipe);
    assert.equal(await evaluate('__kawaiiTestGame.sushiFactory.instances.size'), 1);
    await captureAssembly(`${recipe}-ready`);
    await pressR('keyDown'); await delay(1100); await pressR('keyUp');
    assert.equal(await evaluate('__kawaiiTestGame.assemblySystem.state'), 'READY');
    await carryAction('assembly', 'take-sushi', 'sushi');
    const dishId = await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId');
    await evaluate(`(() => { const p = __kawaiiTestGame.world.player; p.stopMoving(); p.group.position.set(0,0,4.2); p.group.rotation.y = Math.PI / 4; })()`);
    await waitFor('__kawaiiTestGame.world.player.carryWeight > 0.98', 'Pose do prato não estabilizou.');
    await captureAssembly(`${recipe}-carried`, true);
    await command('Input.dispatchKeyEvent', { type:'keyDown', code:'KeyD', key:'d', windowsVirtualKeyCode:68 });
    await command('Input.dispatchKeyEvent', { type:'keyDown', code:'ShiftRight', key:'Shift', windowsVirtualKeyCode:16 });
    await waitFor('__kawaiiTestGame.world.player.state === "dashing"', 'Prato impediu o dash.');
    await waitFor('__kawaiiTestGame.world.player.dashRemaining === 0', 'Dash do prato não terminou.');
    await command('Input.dispatchKeyEvent', { type:'keyUp', code:'ShiftRight', key:'Shift', windowsVirtualKeyCode:16 });
    await command('Input.dispatchKeyEvent', { type:'keyUp', code:'KeyD', key:'d', windowsVirtualKeyCode:68 });
    assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.model.parent === __kawaiiTestGame.world.player.carryAnchor'), true);
    await carryAction('salmonBox', 'unavailable', 'sushi');
    await carryAction('assembly', 'place-sushi');
    await carryAction('noriBox', 'pickup', 'nori');
    await carryAction('assembly', 'unavailable', 'nori');
    await carryAction('noriBox', 'return');
    await carryAction('assembly', 'take-sushi', 'sushi');
    assert.equal(await evaluate('__kawaiiTestGame.carrySystem.carriedIngredient.instanceId'), dishId);
    await carryAction('trash', 'discard');
    assert.equal(await evaluate('__kawaiiTestGame.sushiFactory.instances.size'), 0);
  }
  await prepared('rice_cooked'); await carryAction('assembly', 'add-ingredient');
  await pressR('keyDown');
  await waitFor('__kawaiiTestGame.assemblySystem.cancelProgress > 0.15', 'Progresso de R não avançou.');
  await pressR('keyUp');
  await waitFor('__kawaiiTestGame.assemblySystem.cancelProgress === 0', 'Soltar R não reiniciou o cancelamento.');
  assert.equal(await evaluate('__kawaiiTestGame.assemblySystem.state'), 'ASSEMBLING');
  await cancelAssembly();
  assert.equal(await evaluate('__kawaiiTestGame.ingredientFactory.instances.size'), 0);
  await carryAction('riceBox', 'pickup', 'rice');
  await carryAction('riceCooker', 'load-rice');
  assert.equal(await evaluate('__kawaiiTestGame.riceCooker.state'), 'LOADED');
  assert.equal(await evaluate('__kawaiiTestGame.riceCooker.elapsed'), 0);
  const cleaned = await evaluate(`(() => {
    const g = __kawaiiTestGame; g.dispose();
    return g.ingredientFactory.instances.size === 0 && g.riceCooker.content === null && g.sushiFactory.instances.size === 0
      && document.querySelector('.rice-cooker-status') === null && document.querySelector('.assembly-panel') === null;
  })()`);
  assert.equal(cleaned, true, 'Encerrar o jogo deve liberar o conteúdo da panela e a interface.');
  assert.deepEqual(await evaluate('__kawaiiTestGame.camera.camera.position.toArray()'), state.camera);
  assert.deepEqual(errors, [], `Erros no navegador: ${JSON.stringify(errors)}`);
  await command('Page.navigate', { url: `${url}/?debugCollisions=1` });
  await delay(1500);
  assert.deepEqual(errors, [], `Erros ao ativar depuração: ${JSON.stringify(errors)}`);
  await evaluate('__kawaiiTestGame.dispose()');
  assert.equal(await evaluate('document.querySelector(".interaction-ui")'), null);
  console.log('OK: Chrome headless, três sushis, prefixos ambíguos, rejeição sem consumo, montagem progressiva, R, pratos com transporte/dash/apoio, corte, arroz 8s/12s e nenhum erro no console. Previews: artifacts/assembly-*.png');
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
