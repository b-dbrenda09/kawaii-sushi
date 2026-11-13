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
    const timer = setTimeout(() => reject(new Error(`Chrome nÃ£o iniciou: ${stderr.slice(-1000)}`)), 45000);
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 45000);
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
  await mkdir('artifacts',{recursive:true});
  const key=(type,code)=>command('Input.dispatchKeyEvent',{type,code,key:code==='Enter'?'Enter':code.slice(-1).toLowerCase()});
  const shot=async name=>{const capture=await command('Page.captureScreenshot',{format:'png'});await writeFile(`artifacts/questions-${name}.png`,Buffer.from(capture.data,'base64'));};
  for(const mode of ['solo','coop']) {
    await command('Page.navigate',{url});await waitFor(`Boolean(document.querySelector('[data-mode=${mode}]'))`,'Mode selection missing');
    await evaluate(`document.querySelector('[data-mode=${mode}]').click()`);await waitFor('Boolean(globalThis.__kawaiiTestGame?.questionSystem)','Question system missing');
    await evaluate('globalThis.g=__kawaiiTestGame;g.stop();g.session.play();g.controlSettings.setMovementMode("map");g.difficulty.random=()=>0;g.orderSystem.random=()=>0;g.customerSystem.nextArrival=Infinity');
    for(let round=0;round<3;round++) {
      const ownerIndex=mode==='coop'?(round===1?0:1):0;
      const correct=round===2;
      const setup=await evaluate(`(async()=>{
        g.stop();g.session.play();g.players.forEach(c=>c.input.setEnabled(true));
        globalThis.actor=g.players[${ownerIndex}];
        const system=g.customerSystem;system.nextArrival=Infinity;
        globalThis.guest=system.spawn();if(!guest)throw new Error('No customer available');
        for(let i=0;!guest.orderId&&i<2400;i++)system.update(1/60);
        globalThis.order=g.orderSystem.getActiveOrder(guest.id);order.maxPatience=1000;order.remainingTime=1;
        const {RECIPES}=await import('/src/game/RecipeSystem.js');
        actor.carrySystem.attach(g.sushiFactory.create(RECIPES.find(r=>r.id===order.recipeId)));
        globalThis.dish=actor.carrySystem.carriedIngredient;
        actor.player.group.position.copy(g.deliverySystem.station.getApproachPosition());actor.player.stopMoving();
        g.deliverySystem.update(1);
        if(!g.fireSystem.fires.size)g.fireSystem.ignite(g.world.kitchen.stations.get('cutting'));
        g.updateOrderUI();document.querySelectorAll('.order-card').forEach(e=>e.getAnimations().forEach(a=>a.finish()));
        g.renderer.render(g.world.scene,g.camera.camera);
        globalThis.hudPositions=()=>JSON.stringify(['.score-hud','.match-timer','.order-panel','.recipe-book-button'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.x,r.y];}));
        globalThis.beforeHud=hudPositions();globalThis.beforeCamera=g.camera.camera.projectionMatrix.toArray().join(',');
        return {score:g.scoreSystem.score,owner:actor.player.id};
      })()`);
      const interact=setup.owner==='p2'?'KeyP':'KeyE';
      await key('keyDown',interact);await evaluate('g.updateSimulation(1/60)');await key('keyUp',interact);await evaluate('g.start()');
      await waitFor('g.questionSystem.active?.phase==="QUESTION"','Valid dish did not open question');
      assert.equal(await evaluate('g.session.mode'),'QUESTION');
      assert.equal(await evaluate('g.scoreSystem.score'),setup.score);
      assert.equal(await evaluate('document.querySelectorAll(".question-option").length'),4);
      assert.equal(await evaluate('document.querySelector(".question-confirm").disabled'),true);
      assert.equal(await evaluate('g.pauseUI.root.hidden&&g.players.every(c=>!c.input.enabled)'),true);
      assert.equal(await evaluate('hudPositions()===beforeHud'),true,'HUD positions unchanged');
      assert.equal(await evaluate('g.questionUI.root.dataset.player'),setup.owner);
      await evaluate('globalThis.frozenQuiz=JSON.stringify({timer:g.gameTimer.remaining,fire:g.fireSystem.time,patience:order.remainingTime,players:g.world.players.map(p=>p.group.position.toArray())});g.updateSimulation(50);g.recipeBookUI.open()');
      assert.equal(await evaluate('g.recipeBookUI.root.hidden'),true);
      assert.equal(await evaluate('JSON.stringify({timer:g.gameTimer.remaining,fire:g.fireSystem.time,patience:order.remainingTime,players:g.world.players.map(p=>p.group.position.toArray())})===frozenQuiz'),true);
      await key('keyDown','Enter');await key('keyUp','Enter');assert.equal(await evaluate('g.questionSystem.active.phase'),'QUESTION');
      if(mode==='coop') {
        const other=setup.owner==='p2'?'KeyS':'ArrowDown';await key('keyDown',other);await key('keyUp',other);
        assert.equal(await evaluate('g.questionSystem.active.selectedIndex'),null,'Only delivering player can select with their controls');
      }
      if(round===0) {
        for(const [width,height] of [[1440,1000],[375,812],[812,375]]) {
          await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await evaluate('g.resize()');
          assert.equal(await evaluate('(()=>{const r=g.questionUI.panel.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})()'),true);
          assert.equal(await evaluate('getComputedStyle(document.querySelector(".question-options")).gridTemplateColumns.split(" ").length'), 2);
          await shot(`${mode}-open-${width}`);
        }
        await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await evaluate('g.resize()');
      }
      const chosen=await evaluate(`(g.questionSystem.active.question.respostaCorreta+${correct?0:1})%4`);
      await evaluate(`document.querySelector('[data-answer="${chosen}"]').click()`);
      assert.equal(await evaluate(`document.querySelector('[data-answer="${chosen}"]').getAttribute('aria-checked')`),'true');
      assert.equal(await evaluate('document.querySelector(".question-confirm").disabled'),false);
      await evaluate('for(let i=0;i<12;i++)document.querySelector(".question-confirm").click()');
      const result=await evaluate('({score:g.scoreSystem.score,disposed:dish.disposed,held:actor.carrySystem.carriedIngredient!==null,state:order.state,phase:g.questionSystem.active?.phase})');
      assert.deepEqual(result,{score:setup.score+(correct?150:-50),disposed:true,held:false,state:correct?'COMPLETED':'REJECTED',phase:'RESULT'});
      await key('keyDown','Enter');await key('keyUp','Enter');assert.equal(await evaluate('g.scoreSystem.score'),result.score);
      assert.ok((await evaluate('g.scoreUI.label.textContent')).includes(String(result.score)));
      await shot(`${mode}-${correct?'correct':'incorrect-'+round}`);
      await waitFor('!document.querySelector(".question-continue").disabled','Continue was not enabled',7000);
      assert.equal(await evaluate('g.session.mode'), 'QUESTION');
      assert.ok((await evaluate('document.querySelector(".question-explanation").textContent')).length > 0);
      assert.equal(await evaluate('document.querySelectorAll(\'.question-option[data-result="correct"]\').length'),1);
      await evaluate('document.querySelector(".question-continue").click()');
      await waitFor('g.session.mode==="PLAYING"&&!g.questionSystem.busy','Continue did not return to gameplay',5000);
      assert.equal(await evaluate('g.camera.camera.projectionMatrix.toArray().join(",")===beforeCamera'),true);
      await evaluate('g.stop();for(let i=0;guest.state!=="REMOVED"&&i<3000;i++)g.customerSystem.update(1/60)');
      assert.equal(await evaluate('guest.state==="REMOVED"&&guest.model.position.distanceTo(g.customerSystem.entry)<.001&&guest.slot.customerId===null'),true,'Correct and incorrect answers both exit through the door');
    }
    assert.equal(await evaluate('g.scoreSystem.score'),50);
    await evaluate('g.session.play();g.scoreSystem.change(-200,"Teste de pontuação negativa");g.gameTimer.remaining=.001;g.updateSimulation(.01)');
    assert.equal(await evaluate('g.results.final.score'),-150);
    assert.ok((await evaluate('g.resultsUI.root.textContent')).includes('-150'));
    await shot(`${mode}-negative-results`);
    assert.equal(await evaluate('(()=>{const old=g;g=g.restart();g.stop();return old.questionSystem.disposed&&g.questionSystem.active===null&&document.querySelectorAll(".question-overlay").length===1&&g.scoreSystem.score===0;})()'),true);
    await evaluate('g.dispose()');assert.equal(await evaluate('document.querySelectorAll(".question-overlay").length'),0);
  }
  assert.deepEqual(errors,[]);await send('Browser.close');
  console.log('OK: quiz browser solo/coop: owner controls, 4 options in 2 columns, network explanations, correct +150 / wrong -50, HUD/results negatives, single commit, pause/fire/timer, 3 responsive sizes, 3s/5s and explicit Continue, both door exits, restart and no console errors.');
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





