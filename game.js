const width = 6;
const height = 5;
const start = { x: 0, y: 4, direction: 0 };
const cores = [{ x: 0, y: 2 }, { x: 2, y: 2 }];
const walls = [{ x: 1, y: 3 }];
const exit = { x: 5, y: 0 };
const directions = [{ x: 0, y: -1, icon: '↑' }, { x: 1, y: 0, icon: '→' }, { x: 0, y: 1, icon: '↓' }, { x: -1, y: 0, icon: '←' }];
const commandInfo = {
  forward: { label: '前進', icon: '↑' },
  left: { label: '左轉', icon: '↶' },
  right: { label: '右轉', icon: '↷' }
};
let commands = [];
let robot = { ...start };
let collected = new Set();
let running = false;
let soundEnabled = false;

const grid = document.querySelector('#game-grid');
const sequence = document.querySelector('#sequence');
const feedback = document.querySelector('#feedback');
const runButton = document.querySelector('#run-button');
const soundButton = document.querySelector('#sound-toggle');

function renderGrid() {
  grid.replaceChildren();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = document.createElement('div');
      const isWall = walls.some(tile => tile.x === x && tile.y === y);
      const coreIndex = cores.findIndex(tile => tile.x === x && tile.y === y);
      cell.className = 'cell';
      if (isWall) cell.classList.add('wall');
      if (robot.x === x && robot.y === y) cell.classList.add('current');
      if (coreIndex !== -1 && !collected.has(coreIndex)) cell.classList.add('core');
      if (exit.x === x && exit.y === y) cell.classList.add('goal');

      if (robot.x === x && robot.y === y) {
        const icon = document.createElement('span');
        icon.className = 'cell-icon robot';
        icon.textContent = '✦';
        icon.style.transform = `rotate(${robot.direction * 90}deg)`;
        cell.append(icon);
      } else if (coreIndex !== -1 && !collected.has(coreIndex)) {
        const icon = document.createElement('span');
        icon.className = 'cell-icon';
        icon.textContent = '◆';
        cell.append(icon);
      } else if (exit.x === x && exit.y === y) {
        const icon = document.createElement('span');
        icon.className = 'cell-icon';
        icon.textContent = '◎';
        cell.append(icon);
      } else if (isWall) {
        cell.textContent = '▪';
      }
      grid.append(cell);
    }
  }
  document.querySelector('#coords').textContent = `X ${String(robot.x + 1).padStart(2, '0')} · Y ${String(robot.y + 1).padStart(2, '0')}`;
  document.querySelector('#core-count').textContent = `核心 ${collected.size} / ${cores.length}`;
  document.querySelector('#objective-progress').textContent = `${collected.size} / ${cores.length}`;
  document.querySelector('#objective-cores').classList.toggle('complete', collected.size === cores.length);
  document.querySelector('#objective-exit').classList.toggle('complete', isAtExit());
  document.querySelector('#objective-exit strong').textContent = isAtExit() ? '已抵達' : '未抵達';
}

function renderCommands() {
  sequence.replaceChildren();
  if (!commands.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-sequence';
    empty.textContent = '你的指令會出現在這裡…';
    sequence.append(empty);
  } else {
    commands.forEach((command, index) => {
      const item = document.createElement('li');
      item.className = 'command-chip';
      const number = document.createElement('span');
      number.className = 'number';
      number.textContent = String(index + 1).padStart(2, '0');
      const icon = document.createElement('span');
      icon.className = 'chip-icon';
      icon.textContent = commandInfo[command].icon;
      const label = document.createElement('span');
      label.textContent = commandInfo[command].label;
      item.append(number, icon, label);
      sequence.append(item);
    });
  }
  document.querySelector('#command-count').textContent = commands.length;
  document.querySelector('#step-count').textContent = commands.filter(command => command === 'forward').length;
}

function isAtExit() { return robot.x === exit.x && robot.y === exit.y; }
function setMessage(message, state = '') {
  feedback.textContent = message;
  feedback.className = `feedback${state ? ` ${state}` : ''}`;
}
function setBusy(busy) {
  running = busy;
  runButton.disabled = busy;
  document.querySelectorAll('.command-button, .reset-button').forEach(button => button.disabled = busy);
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function execute() {
  if (running) return;
  if (!commands.length) {
    setMessage('先加入幾個指令，再啟動小光。', 'error');
    return;
  }
  if (isAtExit() && collected.size === cores.length) resetGame(false);
  robot = { ...start };
  collected = new Set();
  renderGrid();
  setBusy(true);
  setMessage('小光啟動中…看好指令的執行順序。');

  for (let i = 0; i < commands.length; i++) {
    await delay(450);
    const command = commands[i];
    if (command === 'left') robot.direction = (robot.direction + 3) % 4;
    if (command === 'right') robot.direction = (robot.direction + 1) % 4;
    if (command === 'forward') {
      const direction = directions[robot.direction];
      const next = { x: robot.x + direction.x, y: robot.y + direction.y };
      const blocked = next.x < 0 || next.x >= width || next.y < 0 || next.y >= height || walls.some(tile => tile.x === next.x && tile.y === next.y);
      if (blocked) {
        renderGrid();
        setMessage(`第 ${i + 1} 個指令撞到障礙物了。調整一下順序，再試一次！`, 'error');
        setBusy(false);
        return;
      }
      robot.x = next.x;
      robot.y = next.y;
      cores.forEach((core, index) => {
        if (core.x === robot.x && core.y === robot.y) collected.add(index);
      });
    }
    renderGrid();
    if (isAtExit() && collected.size === cores.length) {
      await delay(350);
      setMessage('任務完成！小光找回了記憶，也找到回家的路。', 'success');
      setBusy(false);
      return;
    }
  }

  if (isAtExit() && collected.size !== cores.length) {
    setMessage('小光到出口了，但還有記憶核心沒找到。再規劃一次路線吧。', 'error');
  } else if (collected.size < cores.length) {
    setMessage(`路線跑完了，還差 ${cores.length - collected.size} 個記憶核心。改改指令順序試試看。`, 'error');
  } else {
    setMessage('核心都找到了！再安排小光走到出口就完成任務。');
  }
  setBusy(false);
}

function resetGame(clearCommands = true) {
  robot = { ...start };
  collected = new Set();
  if (clearCommands) commands = [];
  renderGrid();
  renderCommands();
  setMessage('先加入幾個指令，幫小光規劃路線。');
}

document.querySelectorAll('.command-button[data-command]').forEach(button => {
  button.addEventListener('click', () => {
    if (running) return;
    commands.push(button.dataset.command);
    renderCommands();
    setMessage('指令已加入。排好路線後，按「執行程式」看看！');
  });
});
document.querySelector('#clear-button').addEventListener('click', () => {
  if (running) return;
  commands = [];
  renderCommands();
  setMessage('指令已清空，重新安排一條路線吧。');
});
document.querySelector('#reset-button').addEventListener('click', () => resetGame(true));
runButton.addEventListener('click', execute);
soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundButton.classList.toggle('sound-on', soundEnabled);
  soundButton.title = soundEnabled ? '音效開啟' : '音效關閉';
  setMessage(soundEnabled ? '音效提示已開啟。' : '音效提示已關閉。');
});

renderGrid();
renderCommands();
