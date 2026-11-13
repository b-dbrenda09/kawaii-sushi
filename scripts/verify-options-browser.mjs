import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

// Usa apenas o PNG original do menu como fixture em memória, sem criar outra logo.
const fixture = await readFile('public/assets/logos-personalizadas/logo-menu.png');
let logoAvailable = false;
let logoRequests = 0;
const server = await createServer({
  server: { host: '127.0.0.1', port: 0, open: false },
  plugins: [{ name: 'question-logo-fixture', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/assets/logos-perguntas/logo-perguntas.png')) return next();
      logoRequests++;
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = logoAvailable ? 200 : 404;
      if (logoAvailable) res.setHeader('Content-Type', 'image/png');
      res.end(logoAvailable ? fixture : '');
    });
  } }],
});
const profile = await mkdtemp(join(tmpdir(), 'sushi-options-browser-'));
let browser, socket, closeBrowser;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--in-process-gpu',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(Error(`Chrome indisponível: ${stderr.slice(-500)}`)), 25000);
    browser.once('error', error => { clearTimeout(timeout); reject(error); });
    browser.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data), request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timeout); pending.delete(message.id);
    if (message.error) request.reject(Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 45000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  closeBrowser = () => send('Browser.close').catch(() => {});
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params = {}) => send(method, params, sessionId);
  const evaluate = async expression => {
    const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const waitFor = async expression => {
    const deadline = Date.now() + 20000;
    do { if (await evaluate(expression)) return; await delay(100); } while (Date.now() < deadline);
    assert.fail(`Timeout: ${expression}`);
  };
  await command('Page.enable');
  await command('Network.enable');
  await command('Network.setCacheDisabled', { cacheDisabled: true });
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const bind = Function.prototype.bind;
    Function.prototype.bind = function(target, ...args) {
      if (this.name === 'tick' && target?.constructor?.name === 'Game') globalThis.__testGame = target;
      return Reflect.apply(bind, this, [target, ...args]);
    };
  })();` });
  await command('Page.navigate', { url });
  await waitFor('Boolean(document.querySelector("[data-action=options]"))');
  await waitFor('document.querySelector(".custom-asset-menuLogo")?.naturalWidth > 0');
  for (const [width, height] of [[1366, 768], [1024, 600], [390, 844], [320, 568]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const layout = await evaluate(`(() => {
      const buttons = [...document.querySelectorAll('.mode-options button')];
      const rects = buttons.map(button => button.getBoundingClientRect());
      const panel = document.querySelector('.mode-panel').getBoundingClientRect();
      return { labels: buttons.map(button => button.textContent.trim()),
        centered: rects.every(r => Math.abs((r.left + r.right - panel.left - panel.right) / 2) < 2),
        stacked: rects[0].bottom < rects[1].top && rects[1].bottom < rects[2].top,
        sameSize: rects.every(r => Math.abs(r.width - rects[0].width) < 1 && r.height === 56),
        visible: rects.every(r => r.top >= 0 && r.bottom <= innerHeight),
        noOverflow: document.querySelector('.mode-menu').scrollWidth <= innerWidth,
        noDescriptions: buttons.every(button => !button.querySelector('small, span')) };
    })()`);
    assert.deepEqual(layout.labels, ['JOGAR SOZINHO', 'JOGAR EM DUPLA', 'OPÇÕES']);
    assert.ok(layout.centered && layout.stacked && layout.sameSize && layout.visible && layout.noOverflow && layout.noDescriptions, JSON.stringify({ width, height, layout }));
  }
  await evaluate(`document.querySelector('[data-action=options]').click()`);
  assert.ok(await evaluate('!document.querySelector(".options-panel").hidden && document.querySelector(".mode-panel").hidden'));
  if (await evaluate('!document.querySelector("[data-action=fullscreen]").disabled')) {
    await evaluate('document.querySelector("[data-action=fullscreen]").click()');
    await waitFor('Boolean(document.fullscreenElement) || Boolean(document.querySelector(".options-panel [role=status]").textContent)');
    if (await evaluate('Boolean(document.fullscreenElement)')) {
      await evaluate('document.querySelector("[data-action=fullscreen]").click()');
      await waitFor('!document.fullscreenElement');
      console.log('OK: tela cheia e retorno à janela.');
    }
  }
  await evaluate(`(() => {
    for (const [key, value] of [['masterVolume', 40], ['musicVolume', 30], ['effectsVolume', 70]]) {
      const input = document.querySelector('[data-setting="' + key + '"]'); input.value = value; input.dispatchEvent(new Event('input'));
    }
    const decorations = document.querySelector('[data-setting=menuDecorations]'); decorations.checked = false; decorations.dispatchEvent(new Event('change'));
    const movement = document.querySelector('[data-setting=movementMode]'); movement.value = 'camera'; movement.dispatchEvent(new Event('change'));
  })()`);
  assert.deepEqual(await evaluate('JSON.parse(localStorage.getItem("kawaii-sushi.preferences.v1"))'), { masterVolume: .4, musicVolume: .3, effectsVolume: .7, menuDecorations: false });
  assert.equal(await evaluate('localStorage.getItem("kawaii-sushi.controls.movementMode")'), 'camera');
  assert.equal(await evaluate('document.documentElement.dataset.menuDecorations'), 'false');
  assert.ok(await evaluate('document.querySelector(".options-panel").scrollWidth <= document.querySelector(".options-panel").clientWidth'));
  await evaluate(`document.querySelector('.options-back').click()`);
  assert.ok(await evaluate('document.querySelector(".options-panel").hidden && !document.querySelector(".mode-panel").hidden'));
  await command('Page.reload', { ignoreCache: true });
  await waitFor('Boolean(document.querySelector("[data-action=options]"))');
  await evaluate(`document.querySelector('[data-action=options]').click()`);
  assert.equal(await evaluate('document.querySelector("[data-setting=masterVolume]").value'), '40');
  assert.equal(await evaluate('document.querySelector("[data-setting=movementMode]").value'), 'camera');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape' });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape' });
  assert.ok(await evaluate('document.querySelector(".options-panel").hidden'));
  console.log('OK: três botões em quatro resoluções; opções, preferências, movimentação, Voltar e Escape.');

  for (const available of [false, true]) {
    logoAvailable = available;
    const requestsBefore = logoRequests;
    await evaluate(`(async () => {
      globalThis.__questionUI?.dispose(); globalThis.__questionSystem?.dispose();
      const { QuestionUI } = await import('/src/game/QuestionUI.js');
      const { QuestionSystem } = await import('/src/game/QuestionSystem.js');
      globalThis.__questionSystem = new QuestionSystem();
      globalThis.__questionUI = new QuestionUI(document.querySelector('#app'), __questionSystem);
      __questionSystem.open({ playerId: 'p1', orderId: 'test', resolve: () => ({ success: true }) });
    })()`);
    if (available) {
      await waitFor('document.querySelector(".custom-asset-questionLogo")?.naturalWidth > 0');
      assert.ok(await evaluate('document.querySelector(".question-ribbon").hidden'));
      assert.ok(await evaluate('document.querySelector(".custom-asset-questionLogo").getBoundingClientRect().width <= 240'));
    } else {
      await delay(500);
      assert.ok(await evaluate('!document.querySelector(".custom-asset-questionLogo") && !document.querySelector(".question-ribbon").hidden'));
    }
    assert.ok(logoRequests > requestsBefore);
    assert.equal(await evaluate('document.querySelectorAll(".question-option").length'), 4);
    await evaluate('__questionSystem.select(__questionSystem.active.question.respostaCorreta, "p1"); document.querySelector(".question-confirm").click()');
    assert.ok(await evaluate('!document.querySelector(".question-result").hidden && document.querySelector(".question-continue").disabled'));
  }
  await evaluate('__questionUI.dispose(); __questionSystem.dispose()');
  console.log('OK: logo da pergunta ausente/presente, cabeçalho padrão, quatro alternativas, confirmação e resultado.');
  // Aqui verificamos a ligação menu→Game e sua inicialização, sem executar um
  // benchmark de renderização contínua no SwiftShader. A simulação dos dois
  // jogadores é coberta por verify-modes.mjs e verify-questions.mjs.
  await evaluate('globalThis.__originalAnimationFrame = requestAnimationFrame; globalThis.requestAnimationFrame = () => 0');
  for (const mode of ['solo', 'coop']) {
    console.log(`Verificando inicialização: ${mode}`);
    await command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.querySelector('[data-mode=${mode}]').click()`);
    await waitFor('Boolean(globalThis.__testGame?.running)');
    assert.equal(await evaluate('__testGame.gameMode'), mode);
    assert.equal(await evaluate('__testGame.world.players.length'), mode === 'solo' ? 1 : 2);
    assert.equal(await evaluate('__testGame.controlSettings.movementMode'), 'camera');
    await evaluate('__testGame.session.play()');
    assert.equal(await evaluate('__testGame.session.mode'), 'PLAYING');
    await evaluate('__testGame.onMainMenu(); globalThis.__testGame = null');
    await waitFor('Boolean(document.querySelector("[data-action=options]"))');
  }
  await evaluate('globalThis.requestAnimationFrame = __originalAnimationFrame');
  console.log('OK: solo e dupla iniciam, usam preferências existentes e retornam ao menu.');
} finally {
  await closeBrowser?.();
  socket?.close();
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(3000)]);
    if (browser.exitCode === null && browser.signalCode === null) browser.kill();
  }
  await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(error => {
    if (!['EBUSY', 'EPERM'].includes(error.code)) throw error;
    console.warn(`Perfil temporário ainda bloqueado pelo Chrome: ${profile}`);
  });
}
