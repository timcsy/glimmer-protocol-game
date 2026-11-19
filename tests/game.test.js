const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const gameSource = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.disabled = false;
    this.hidden = false;
    this.value = '';
    this.textContent = '';
    this.className = '';
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const shouldAdd = force ?? !classes.has(name);
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        return shouldAdd;
      }
    };
  }

  replaceChildren(...children) { this.children = [...children]; }
  append(...children) { this.children.push(...children); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  getAttribute(name) { return this.attributes[name] ?? null; }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.created = [];
    this.commandButtons = ['forward', 'left', 'right', 'ifBlockedRight'].map(command => {
      const button = this.createElement('button');
      button.dataset.command = command;
      return button;
    });
  }

  querySelector(selector) {
    if (!this.elements.has(selector)) this.elements.set(selector, new FakeElement());
    return this.elements.get(selector);
  }

  querySelectorAll(selector) {
    if (selector === '.command-button[data-command]') return this.commandButtons;
    if (selector === '.level-tab') return this.querySelector('#level-list').children;
    if (selector.startsWith('.command-button, .reset-button')) {
      return this.created.filter(element => element.tagName === 'button');
    }
    return [];
  }

  createElement(tagName) {
    const element = new FakeElement(tagName);
    this.created.push(element);
    return element;
  }
}

function createGame(storage = new Map()) {
  const document = new FakeDocument();
  const context = vm.createContext({
    document,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    window: {},
    setTimeout: () => 0,
    console,
    Promise,
    Set,
    Math,
    Number,
    String
  });
  vm.runInContext(gameSource, context, { filename: 'game.js' });
  vm.runInContext('delay = async () => {}', context);
  return { context, document, storage };
}

function run(context, source) { return vm.runInContext(source, context); }

const winningRoutes = [
  [
    { type: 'forward' }, { type: 'forward' }, { type: 'right' },
    { type: 'forward' }, { type: 'forward' }, { type: 'forward' },
    { type: 'forward' }, { type: 'forward' }, { type: 'left' },
    { type: 'forward' }, { type: 'forward' }
  ],
  [
    { type: 'repeatForward', count: 3 }, { type: 'right' },
    { type: 'repeatForward', count: 5 }, { type: 'right' },
    { type: 'repeatForward', count: 3 }
  ],
  [
    { type: 'ifBlockedRight' }, { type: 'repeatForward', count: 2 },
    { type: 'repeatForward', count: 3 }, { type: 'left' },
    { type: 'repeatForward', count: 4 }
  ]
];

test('序列、循環與單分支條件關卡都能通關並解鎖下一區', async () => {
  const { context } = createGame();
  for (let level = 0; level < winningRoutes.length; level++) {
    run(context, `loadLevel(${level}); commands = ${JSON.stringify(winningRoutes[level])}; renderCommands()`);
    await run(context, 'execute()');
    assert.equal(run(context, 'hasWon()'), true, `第 ${level + 1} 區應可通關`);
    assert.equal(run(context, 'unlockedLevelIndex'), level + 1, '通關後應解鎖下一區');
  }
});

test('條件不成立時保持方向不變', async () => {
  const { context } = createGame();
  run(context, `commands = [{ type: 'ifBlockedRight' }]`);
  await run(context, 'execute()');
  assert.equal(run(context, 'robot.direction'), 0);
  assert.match(run(context, "document.querySelector('#feedback').textContent"), /核心/);
});

test('撞到邊界時保留位置並提供可重試的錯誤回饋', async () => {
  const { context, document } = createGame();
  run(context, `commands = [{ type: 'left' }, { type: 'forward' }]`);
  await run(context, 'execute()');
  assert.deepEqual(JSON.parse(JSON.stringify(run(context, '({ x: robot.x, y: robot.y })'))), { x: 0, y: 4 });
  assert.match(document.querySelector('#feedback').textContent, /撞到障礙物/);
  assert.equal(run(context, 'running'), false);
});

test('如果／否則關卡會依序執行成立與不成立兩個分支', async () => {
  const { context, document } = createGame();
  run(context, 'unlockedLevelIndex = 3');
  run(context, `loadLevel(3); document.querySelector('#blocked-action').value = 'right'; document.querySelector('#clear-action').value = 'left'; document.querySelector('#add-branch').listeners.click(); commands.push({ type: 'repeatForward', count: 2 }); document.querySelector('#add-branch').listeners.click(); commands.push({ type: 'repeatForward', count: 2 }, { type: 'repeatForward', count: 2 }); renderCommands()`);
  assert.match(document.querySelector('#sequence').children[0].children[2].textContent, /有障礙→右轉；否則→左轉/);
  await run(context, 'execute()');
  assert.equal(run(context, 'hasWon()'), true);
  assert.equal(run(context, 'unlockedLevelIndex'), 3);
});

test('指令可上移、下移與單獨刪除', () => {
  const { context, document } = createGame();
  run(context, `commands = [{ type: 'forward' }, { type: 'left' }, { type: 'right' }]; renderCommands()`);
  let firstChip = document.querySelector('#sequence').children[0];
  firstChip.children.find(button => button.className === 'move-command' && button.textContent === '↓').listeners.click();
  assert.equal(run(context, 'commands[0].type'), 'left');
  let secondChip = document.querySelector('#sequence').children[1];
  secondChip.children.find(button => button.className === 'move-command' && button.textContent === '↑').listeners.click();
  assert.equal(run(context, 'commands[0].type'), 'forward');
  firstChip = document.querySelector('#sequence').children[0];
  firstChip.children.find(button => button.className === 'remove-command').listeners.click();
  assert.equal(run(context, 'commands.length'), 2);
});

test('執行時只高亮目前的指令，並標記為目前步驟', async () => {
  const { context, document } = createGame();
  const releases = [];
  run(context, `commands = [{ type: 'forward' }, { type: 'right' }]; renderCommands(); delay = () => new Promise(resolve => globalThis.testReleases.push(resolve))`);
  context.testReleases = releases;
  const execution = run(context, 'execute()');
  const sequence = document.querySelector('#sequence');
  assert.equal(sequence.children[0].getAttribute('aria-current'), 'step');
  assert.equal(sequence.children[1].getAttribute('aria-current'), null);

  releases.shift()();
  for (let attempt = 0; attempt < 10 && releases.length === 0; attempt++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(releases.length, 1, 'the next command should begin after the first move');
  assert.equal(sequence.children[0].getAttribute('aria-current'), null);
  assert.equal(sequence.children[1].getAttribute('aria-current'), 'step');

  releases.shift()();
  await execution;
});

test('已解鎖關卡可重玩，未解鎖關卡仍鎖定，進度可跨載入保留', async () => {
  const { context, document, storage } = createGame();
  run(context, `loadLevel(0); commands = ${JSON.stringify(winningRoutes[0])}`);
  await run(context, 'execute()');
  assert.equal(document.querySelector('#level-list').children[1].disabled, false);
  assert.equal(document.querySelector('#level-list').children[2].disabled, true);

  const reloaded = createGame(storage);
  assert.equal(run(reloaded.context, 'unlockedLevelIndex'), 1);
  assert.equal(reloaded.document.querySelector('#level-list').children[1].disabled, false);
  reloaded.document.querySelector('#level-list').children[0].listeners.click();
  assert.equal(run(reloaded.context, 'currentLevelIndex'), 0);
  assert.equal(run(reloaded.context, 'commands.length'), 0);
});
