const width = 6;
const height = 5;
const directions = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
const levels = [
  {
    title: '找回失落記憶',
    description: '資料庫斷電了。收集散落的記憶核心，再帶小光走到出口。',
    hint: '小光一開始面向上方。先沿著直路前進，再轉向第二顆核心。',
    concept: '指令順序',
    coreName: '記憶核心',
    duration: '約 2 分鐘',
    start: { x: 0, y: 4, direction: 0 },
    cores: [{ x: 0, y: 2 }, { x: 2, y: 2 }],
    walls: [{ x: 1, y: 3 }],
    exit: { x: 5, y: 0 }
  },
  {
    title: '修復訊號中繼站',
    description: '中繼站的訊號燈熄滅了。沿著走廊收集兩枚能源晶片，再啟動出口。',
    hint: '長走廊裡有很多相同的前進動作。試著用「重複前進」縮短程式。',
    concept: '循環：重複指令',
    coreName: '能源晶片',
    duration: '約 3 分鐘',
    start: { x: 0, y: 4, direction: 0 },
    cores: [{ x: 0, y: 1 }, { x: 5, y: 1 }],
    walls: [{ x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }],
    exit: { x: 5, y: 4 }
  }
];

const commandInfo = {
  forward: { label: '前進', icon: '↑' },
  left: { label: '左轉', icon: '↶' },
  right: { label: '右轉', icon: '↷' },
  repeatForward: { label: '重複前進', icon: '⟳' }
};

let currentLevelIndex = 0;
let commands = [];
let robot = { ...levels[0].start };
let collected = new Set();
let running = false;
let soundEnabled = false;
let audioContext;
let unlockedLevelIndex = 0;

try {
  unlockedLevelIndex = Math.min(levels.length - 1, Math.max(0, Number(localStorage.getItem('glimmer-unlocked-level')) || 0));
  currentLevelIndex = Math.min(levels.length - 1, Math.max(0, Number(localStorage.getItem('glimmer-current-level')) || 0));
  currentLevelIndex = Math.min(currentLevelIndex, unlockedLevelIndex);
} catch {
  // Progress saving is optional; the current session remains playable without storage.
}

const grid = document.querySelector('#game-grid');
const sequence = document.querySelector('#sequence');
const feedback = document.querySelector('#feedback');
const runButton = document.querySelector('#run-button');
const soundButton = document.querySelector('#sound-toggle');
const nextLevelButton = document.querySelector('#next-level-button');

function currentLevel() { return levels[currentLevelIndex]; }
function isAtExit() { return robot.x === currentLevel().exit.x && robot.y === currentLevel().exit.y; }
function hasWon() { return isAtExit() && collected.size === currentLevel().cores.length; }
function repeatCount(command) { return command.type === 'repeatForward' ? command.count : 1; }

function renderLevel() {
  const level = currentLevel();
  const number = String(currentLevelIndex + 1).padStart(2, '0');
  document.querySelector('#top-level-number').textContent = number;
  document.querySelector('#level-number').textContent = number;
  document.querySelector('#level-duration').textContent = level.duration;
  document.querySelector('#mission-title').textContent = level.title;
  document.querySelector('#mission-copy').textContent = level.description;
  document.querySelector('#level-hint').textContent = level.hint;
  document.querySelector('#concept-name').textContent = level.concept;
  document.querySelector('#objective-core-label').textContent = `收集${level.coreName}`;
  document.querySelector('#repeat-control').hidden = currentLevelIndex === 0;
  nextLevelButton.hidden = true;
}

function renderGrid() {
  const level = currentLevel();
  grid.replaceChildren();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = document.createElement('div');
      const isWall = level.walls.some(tile => tile.x === x && tile.y === y);
      const coreIndex = level.cores.findIndex(tile => tile.x === x && tile.y === y);
      cell.className = 'cell';
      if (isWall) cell.classList.add('wall');
      if (robot.x === x && robot.y === y) cell.classList.add('current');
      if (coreIndex !== -1 && !collected.has(coreIndex)) cell.classList.add('core');
      if (level.exit.x === x && level.exit.y === y) cell.classList.add('goal');

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
      } else if (level.exit.x === x && level.exit.y === y) {
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
  document.querySelector('#core-count').textContent = `${level.coreName} ${collected.size} / ${level.cores.length}`;
  document.querySelector('#objective-progress').textContent = `${collected.size} / ${level.cores.length}`;
  document.querySelector('#objective-cores').classList.toggle('complete', collected.size === level.cores.length);
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
      icon.textContent = commandInfo[command.type].icon;
      const label = document.createElement('span');
      label.textContent = command.type === 'repeatForward' ? `${commandInfo[command.type].label} × ${command.count}` : commandInfo[command.type].label;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-command';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `刪除第 ${index + 1} 個指令`);
      remove.addEventListener('click', () => {
        if (running) return;
        commands.splice(index, 1);
        renderCommands();
        setMessage('已移除這個指令，可以接著調整路線。');
      });
      item.append(number, icon, label, remove);
      sequence.append(item);
    });
  }
  document.querySelector('#command-count').textContent = commands.length;
  document.querySelector('#step-count').textContent = commands.reduce((sum, command) => sum + (command.type === 'forward' ? 1 : command.type === 'repeatForward' ? command.count : 0), 0);
}

function setMessage(message, state = '') {
  feedback.textContent = message;
  feedback.className = `feedback${state ? ` ${state}` : ''}`;
}

function setBusy(busy) {
  running = busy;
  runButton.disabled = busy;
  document.querySelectorAll('.command-button, .reset-button, .remove-command, #clear-button, #repeat-count').forEach(button => button.disabled = busy);
  nextLevelButton.disabled = busy;
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function playTone(frequency, duration = 0.12, waveform = 'sine', volume = 0.035) {
  if (!soundEnabled || !audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = waveform;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function collectAtCurrentTile() {
  let didCollect = false;
  currentLevel().cores.forEach((core, index) => {
    if (core.x === robot.x && core.y === robot.y && !collected.has(index)) {
      collected.add(index);
      didCollect = true;
    }
  });
  if (didCollect) playTone(880, 0.24, 'sine', 0.045);
  return didCollect;
}

async function moveForward(commandIndex) {
  await delay(370);
  const direction = directions[robot.direction];
  const next = { x: robot.x + direction.x, y: robot.y + direction.y };
  const level = currentLevel();
  const blocked = next.x < 0 || next.x >= width || next.y < 0 || next.y >= height || level.walls.some(tile => tile.x === next.x && tile.y === next.y);
  if (blocked) {
    playTone(180, 0.2, 'triangle', 0.04);
    renderGrid();
    setMessage(`第 ${commandIndex + 1} 個指令撞到障礙物了。移除或替換它，再試一次！`, 'error');
    return false;
  }
  robot.x = next.x;
  robot.y = next.y;
  if (!collectAtCurrentTile()) playTone(430, 0.07, 'sine', 0.018);
  renderGrid();
  return true;
}

function completeLevel() {
  unlockedLevelIndex = Math.max(unlockedLevelIndex, Math.min(levels.length - 1, currentLevelIndex + 1));
  try {
    localStorage.setItem('glimmer-unlocked-level', String(unlockedLevelIndex));
  } catch {
    // The level remains unlocked for this session if storage is unavailable.
  }
  playTone(660, 0.18, 'sine', 0.04);
  setTimeout(() => playTone(990, 0.3, 'sine', 0.04), 100);
  setMessage(currentLevelIndex < levels.length - 1 ? '任務完成！小光找回記憶，下一區已解鎖。' : '任務完成！小光修好了中繼站，訊號重新亮起。', 'success');
  nextLevelButton.hidden = currentLevelIndex >= levels.length - 1;
  setBusy(false);
}

async function execute() {
  if (running) return;
  if (!commands.length) {
    setMessage('先加入幾個指令，再啟動小光。', 'error');
    return;
  }
  robot = { ...currentLevel().start };
  collected = new Set();
  nextLevelButton.hidden = true;
  renderGrid();
  setBusy(true);
  setMessage('小光啟動中…看好每個指令的執行順序。');

  for (let index = 0; index < commands.length; index++) {
    const command = commands[index];
    if (command.type === 'left' || command.type === 'right') {
      await delay(220);
      robot.direction = (robot.direction + (command.type === 'left' ? 3 : 1)) % 4;
      playTone(command.type === 'left' ? 520 : 600, 0.08, 'sine', 0.02);
      renderGrid();
      continue;
    }

    const repetitions = repeatCount(command);
    for (let count = 0; count < repetitions; count++) {
      const moved = await moveForward(index);
      if (!moved) {
        setBusy(false);
        return;
      }
      if (hasWon()) {
        await delay(250);
        completeLevel();
        return;
      }
    }
  }

  if (isAtExit() && collected.size !== currentLevel().cores.length) {
    setMessage('小光到出口了，但還有記憶核心沒找到。移除幾個指令，重新規劃路線吧。', 'error');
  } else if (collected.size < currentLevel().cores.length) {
    setMessage(`路線跑完了，還差 ${currentLevel().cores.length - collected.size} 個核心。調整指令再試試看。`, 'error');
  } else {
    setMessage('核心都找到了！再安排小光走到出口就完成任務。');
  }
  setBusy(false);
}

function resetGame(clearCommands = true) {
  robot = { ...currentLevel().start };
  collected = new Set();
  if (clearCommands) commands = [];
  nextLevelButton.hidden = true;
  renderGrid();
  renderCommands();
  setMessage('先加入幾個指令，幫小光規劃路線。');
}

function loadLevel(index) {
  if (index > unlockedLevelIndex || index >= levels.length) return;
  currentLevelIndex = index;
  commands = [];
  robot = { ...currentLevel().start };
  collected = new Set();
  try { localStorage.setItem('glimmer-current-level', String(index)); } catch { /* Optional progress save. */ }
  renderLevel();
  renderGrid();
  renderCommands();
  setMessage('新區域已開放。先觀察路線，再安排指令吧。');
}

document.querySelectorAll('.command-button[data-command]').forEach(button => {
  button.addEventListener('click', () => {
    if (running) return;
    commands.push({ type: button.dataset.command });
    nextLevelButton.hidden = true;
    renderCommands();
    setMessage('指令已加入。排好路線後，按「執行程式」看看！');
  });
});

document.querySelector('#add-repeat').addEventListener('click', () => {
  if (running) return;
  const count = Number(document.querySelector('#repeat-count').value);
  commands.push({ type: 'repeatForward', count });
  nextLevelButton.hidden = true;
  renderCommands();
  setMessage(`已加入重複前進 ${count} 次的循環指令。`);
});

document.querySelector('#clear-button').addEventListener('click', () => {
  if (running) return;
  commands = [];
  renderCommands();
  setMessage('指令已清空，重新安排一條路線吧。');
});

document.querySelector('#reset-button').addEventListener('click', () => resetGame(true));
nextLevelButton.addEventListener('click', () => loadLevel(currentLevelIndex + 1));
runButton.addEventListener('click', execute);
soundButton.addEventListener('click', async () => {
  soundEnabled = !soundEnabled;
  soundButton.classList.toggle('sound-on', soundEnabled);
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  soundButton.title = soundEnabled ? '音效開啟' : '音效關閉';
  if (soundEnabled) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContext ||= new AudioContextClass();
      if (audioContext.state === 'suspended') await audioContext.resume();
      playTone(740, 0.16, 'sine', 0.035);
    }
    setMessage('音效提示已開啟。');
  } else {
    setMessage('音效提示已關閉。');
  }
});

renderLevel();
renderGrid();
renderCommands();
