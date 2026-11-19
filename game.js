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
    successMessage: '小光找回了記憶。',
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
    successMessage: '小光修好了中繼站，訊號重新亮起。',
    duration: '約 3 分鐘',
    start: { x: 0, y: 4, direction: 0 },
    cores: [{ x: 0, y: 1 }, { x: 5, y: 1 }],
    walls: [{ x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }],
    exit: { x: 5, y: 4 }
  },
  {
    title: '穿越巡檢區',
    description: '巡檢門擋住了小光。判斷前方狀況，收集電池，再抵達安全出口。',
    hint: '若前方有牆，條件就成立，小光會右轉；前方通暢時，方向保持不變。',
    concept: '條件：如果…就…',
    coreName: '電池',
    successMessage: '小光判斷出安全路線，成功通過巡檢區。',
    duration: '約 3 分鐘',
    start: { x: 0, y: 4, direction: 0 },
    cores: [{ x: 2, y: 4 }, { x: 5, y: 2 }],
    walls: [{ x: 0, y: 3 }, { x: 4, y: 3 }],
    exit: { x: 5, y: 0 }
  },
  {
    title: '雙路徑逃生',
    description: '巡檢門後有兩條岔路。依照前方狀況選擇轉彎方向，收集晶片並抵達出口。',
    hint: '同一條件會在兩個位置各執行一次：遇到牆時右轉，前方通暢時左轉。',
    concept: '分支：如果／否則',
    coreName: '資料晶片',
    successMessage: '小光依照兩次判斷走對岔路，帶著資料安全離開。',
    duration: '約 4 分鐘',
    start: { x: 0, y: 4, direction: 0 },
    cores: [{ x: 2, y: 4 }, { x: 2, y: 2 }],
    walls: [{ x: 0, y: 3 }, { x: 1, y: 2 }, { x: 4, y: 3 }],
    exit: { x: 2, y: 0 }
  }
];

const commandInfo = {
  forward: { label: '前進', icon: '↑' },
  left: { label: '左轉', icon: '↶' },
  right: { label: '右轉', icon: '↷' },
  repeatForward: { label: '重複前進', icon: '⟳' },
  ifBlockedRight: { label: '若前方有障礙，就右轉', icon: '?' },
  ifElseBlocked: { label: '如果／否則', icon: '{ }' }
};
const levelShortNames = ['序列', '循環', '判斷', '分支'];

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
function actionLabel(action) { return action === 'left' ? '左轉' : action === 'right' ? '右轉' : '不轉彎'; }
function isBlockedAhead() {
  const direction = directions[robot.direction];
  const next = { x: robot.x + direction.x, y: robot.y + direction.y };
  return next.x < 0 || next.x >= width || next.y < 0 || next.y >= height || currentLevel().walls.some(tile => tile.x === next.x && tile.y === next.y);
}
function applyTurn(action) {
  if (action === 'left') robot.direction = (robot.direction + 3) % 4;
  if (action === 'right') robot.direction = (robot.direction + 1) % 4;
}

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
  document.querySelector('#condition-command').hidden = currentLevelIndex < 2;
  document.querySelector('#branch-control').hidden = currentLevelIndex < 3;
  nextLevelButton.hidden = true;
  renderLevelSelector();
}

function renderLevelSelector() {
  const levelList = document.querySelector('#level-list');
  levelList.replaceChildren();
  levels.forEach((level, index) => {
    const button = document.createElement('button');
    const unlocked = index <= unlockedLevelIndex;
    button.type = 'button';
    button.className = `level-tab${index === currentLevelIndex ? ' active' : ''}`;
    button.disabled = !unlocked || running;
    button.setAttribute('aria-label', unlocked ? `第 ${index + 1} 區：${level.title}` : `第 ${index + 1} 區：尚未解鎖`);
    if (index === currentLevelIndex) button.setAttribute('aria-current', 'step');
    const number = document.createElement('span');
    number.className = 'tab-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = unlocked ? levelShortNames[index] : '鎖定';
    button.append(number, name);
    button.addEventListener('click', () => loadLevel(index));
    levelList.append(button);
  });
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
      if (command.type === 'repeatForward') {
        label.textContent = `${commandInfo[command.type].label} × ${command.count}`;
      } else if (command.type === 'ifElseBlocked') {
        label.textContent = `有障礙→${actionLabel(command.blockedAction)}；否則→${actionLabel(command.clearAction)}`;
      } else {
        label.textContent = commandInfo[command.type].label;
      }
      const moveUp = document.createElement('button');
      moveUp.type = 'button';
      moveUp.className = 'move-command';
      moveUp.textContent = '↑';
      moveUp.disabled = index === 0;
      moveUp.setAttribute('aria-label', `將第 ${index + 1} 個指令上移`);
      moveUp.addEventListener('click', () => moveCommand(index, index - 1));
      const moveDown = document.createElement('button');
      moveDown.type = 'button';
      moveDown.className = 'move-command';
      moveDown.textContent = '↓';
      moveDown.disabled = index === commands.length - 1;
      moveDown.setAttribute('aria-label', `將第 ${index + 1} 個指令下移`);
      moveDown.addEventListener('click', () => moveCommand(index, index + 1));
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
      item.append(number, icon, label, moveUp, moveDown, remove);
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

function moveCommand(from, to) {
  if (running || to < 0 || to >= commands.length) return;
  [commands[from], commands[to]] = [commands[to], commands[from]];
  renderCommands();
  setMessage('指令順序已調整。執行看看新的路線吧。');
}

function setBusy(busy) {
  running = busy;
  runButton.disabled = busy;
  document.querySelectorAll('.command-button, .reset-button, .remove-command, .move-command, #clear-button, #repeat-count, #blocked-action, #clear-action').forEach(button => button.disabled = busy);
  nextLevelButton.disabled = busy;
  document.querySelectorAll('.level-tab').forEach(button => button.disabled = busy || button.getAttribute('aria-label')?.includes('尚未解鎖'));
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
  renderLevelSelector();
  playTone(660, 0.18, 'sine', 0.04);
  setTimeout(() => playTone(990, 0.3, 'sine', 0.04), 100);
  const nextAreaMessage = currentLevelIndex < levels.length - 1 ? ' 下一區已解鎖。' : '';
  setMessage(`任務完成！${currentLevel().successMessage}${nextAreaMessage}`, 'success');
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
    if (command.type === 'ifBlockedRight' || command.type === 'ifElseBlocked') {
      await delay(260);
      const blocked = isBlockedAhead();
      const action = command.type === 'ifBlockedRight' ? (blocked ? 'right' : 'stay') : (blocked ? command.blockedAction : command.clearAction);
      applyTurn(action);
      if (blocked) {
        playTone(760, 0.12, 'triangle', 0.035);
        setMessage(command.type === 'ifElseBlocked' ? `條件成立：前方有障礙，小光選擇${actionLabel(action)}。` : '條件成立：前方有障礙，小光判斷後右轉。');
      } else {
        playTone(500, 0.08, 'sine', 0.02);
        setMessage(command.type === 'ifElseBlocked' ? `條件不成立：前方通暢，小光選擇${actionLabel(action)}。` : '條件不成立：前方通暢，小光保持方向。');
      }
      renderGrid();
      continue;
    }
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

document.querySelector('#add-branch').addEventListener('click', () => {
  if (running) return;
  commands.push({
    type: 'ifElseBlocked',
    blockedAction: document.querySelector('#blocked-action').value,
    clearAction: document.querySelector('#clear-action').value
  });
  nextLevelButton.hidden = true;
  renderCommands();
  setMessage('判斷方塊已加入。小光會依照前方狀況選擇其中一個分支。');
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
