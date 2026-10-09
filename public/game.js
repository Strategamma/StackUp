const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const joinPanel = document.querySelector('#join');
const joinForm = document.querySelector('#join-form');
const nameInput = document.querySelector('#name');
const installButton = document.querySelector('#install-app');
const showHelpButton = document.querySelector('#show-help');
const helpPanel = document.querySelector('#help');
const closeHelpButton = document.querySelector('#close-help');
const toast = document.querySelector('#toast');
const arcadeLink = document.querySelector('.arcade-link');

const colors = { ink: '#11100f', paper: '#100f0e', cream: '#fff7e9', red: '#ff454d', orange: '#ffb33f', green: '#66efad', pale: '#3a3430', muted: '#b9aea6', line: 'rgba(255,247,233,.14)', panel: 'rgba(49,30,27,.82)' };
let state = { phase: 'join', players: [], rows: [], you: null, turn: 0, maxTurns: 10, lastEvents: [] };
let socket;
let hitAreas = [];
let toastTimer;
let leavePrompt = false;
let leaveTarget = 'home';
let manualClose = false;
let visualTime = performance.now();
let sceneAnimationStart = visualTime;
let selectionAnimationStart = visualTime;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RESOLUTION_STEP_MS = reduceMotion ? 180 : 850;
let resolutionReplay = null;
let resolutionBaseRows = null;
let waitingToastTimer;
let displayName = localStorage.getItem('stackup-name') || '';
nameInput.value = displayName;

let installPrompt;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = null;
  installButton.hidden = true;
});
window.addEventListener('appinstalled', () => { installButton.hidden = true; });

function showHelp() { helpPanel.hidden = false; }
function closeHelp() {
  helpPanel.hidden = true;
  localStorage.setItem('stackup-seen-rules', '1');
}
showHelpButton.addEventListener('click', showHelp);
closeHelpButton.addEventListener('click', closeHelp);
helpPanel.addEventListener('click', (event) => { if (event.target === helpPanel) closeHelp(); });

function hideJoinPanel() {
  arcadeLink.hidden = true;
  if (joinPanel.classList.contains('hidden') || joinPanel.classList.contains('joining')) return;
  joinPanel.classList.add('joining');
  setTimeout(() => joinPanel.classList.add('hidden'), reduceMotion ? 0 : 260);
}

function connect(name) {
  if (location.protocol === 'file:') {
    showToast('Start the game server, then open its Wi-Fi address.');
    return;
  }
  displayName = name;
  manualClose = false;
  localStorage.setItem('stackup-name', name);
  showToast('Connecting to the table…');
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${location.host}`);
  socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'join', name, token: localStorage.getItem('stackup-token') || '' })));
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === 'joined') {
      localStorage.setItem('stackup-token', message.token);
      hideJoinPanel();
      showToast('Joined the table');
      if (!localStorage.getItem('stackup-seen-rules')) showHelp();
    }
    if (message.type === 'state') {
      const now = performance.now();
      const enteredRowChoice = Boolean(message.state.rowChoice) && !state.rowChoice;
      if (enteredRowChoice) resolutionBaseRows = state.rows.map((row) => [...row]);
      const enteredResolution = (message.state.phase === 'roundEnd' || message.state.phase === 'finished') && state.phase === 'playing';
      if (enteredResolution && message.state.lastEvents.length) {
        resolutionReplay = {
          initialRows: (resolutionBaseRows || state.rows).map((row) => [...row]),
          events: message.state.lastEvents.map((event) => ({ ...event, taken: [...event.taken] })),
          startedAt: now,
        };
        resolutionBaseRows = null;
      }
      if (message.state.phase === 'playing' && state.phase === 'roundEnd') resolutionReplay = null;
      if (message.state.phase !== state.phase || message.state.turn !== state.turn || message.state.rowChoice?.playerId !== state.rowChoice?.playerId) sceneAnimationStart = now;
      if (message.state.you?.selected !== state.you?.selected) selectionAnimationStart = now;
      const enteredRoundEnd = message.state.phase === 'roundEnd' && state.phase !== 'roundEnd';
      state = message.state;
      hideJoinPanel();
      clearTimeout(waitingToastTimer);
      if (enteredRoundEnd && state.you?.id !== state.hostId) {
        const delay = resolutionReplay ? resolutionReplay.events.length * RESOLUTION_STEP_MS + 150 : 0;
        waitingToastTimer = setTimeout(() => { if (state.phase === 'roundEnd') showToast('Waiting for the host to start the round'); }, delay);
      }
      render();
    }
    if (message.type === 'left') finishLeave();
    if (message.type === 'error') showToast(message.message);
  });
  socket.addEventListener('close', () => {
    if (!manualClose) showToast('Connection lost — reconnecting…');
    if (!manualClose && localStorage.getItem('stackup-token')) setTimeout(() => connect(displayName), 1500);
  });
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (name) connect(name);
});

if (location.protocol === 'file:') {
  setTimeout(() => showToast('This page needs the local game server.'), 100);
} else if (displayName && localStorage.getItem('stackup-token')) {
  connect(displayName);
}

function send(type, extra = {}) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...extra }));
}

function returnToHome() {
  manualClose = true;
  leavePrompt = false;
  localStorage.removeItem('stackup-token');
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  state = { phase: 'join', players: [], rows: [], you: null, turn: 0, maxTurns: 10, lastEvents: [] };
  joinPanel.classList.remove('joining');
  joinPanel.classList.remove('hidden');
  arcadeLink.hidden = false;
  showToast('You left the table');
  render();
}

function finishLeave() {
  const destination = leaveTarget;
  leaveTarget = 'home';
  returnToHome();
  if (destination === 'arcade') location.assign('https://decadenceinc.com');
}

function leaveRoom() {
  if (socket?.readyState !== WebSocket.OPEN) return finishLeave();
  send('leave');
  setTimeout(() => { if (!manualClose) finishLeave(); }, 800);
}

async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(location.origin);
    showToast('Invite link copied');
  } catch {
    showToast(`Invite players at ${location.host}`);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function roundedRect(x, y, w, h, r, fill, stroke = null, line = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function text(value, x, y, size, color = colors.cream, align = 'left', weight = 700, family = 'Arial, Helvetica, sans-serif') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y);
}

function points(card) {
  if (card === 55) return 7;
  if (card % 11 === 0) return 5;
  if (card % 10 === 0) return 3;
  if (card % 5 === 0) return 2;
  return 1;
}

function placementRow(card, rows) {
  if (card === null || card === undefined) return null;
  let choice = -1;
  let gap = Infinity;
  rows.forEach((row, index) => {
    const end = row[row.length - 1];
    if (end > card && end - card < gap) {
      choice = index;
      gap = end - card;
    }
  });
  return choice;
}

function applyResolutionEvent(rows, event) {
  if (event.taken.length) rows[event.row] = [event.card];
  else rows[event.row].push(event.card);
}

function resolutionSnapshot() {
  if (!resolutionReplay || (state.phase !== 'roundEnd' && state.phase !== 'finished')) return null;
  const elapsed = Math.max(0, visualTime - resolutionReplay.startedAt);
  const completed = Math.min(resolutionReplay.events.length, Math.floor(elapsed / RESOLUTION_STEP_MS));
  const rows = resolutionReplay.initialRows.map((row) => [...row]);
  for (let i = 0; i < completed; i++) applyResolutionEvent(rows, resolutionReplay.events[i]);
  const active = completed < resolutionReplay.events.length ? resolutionReplay.events[completed] : null;
  return {
    rows,
    completed,
    active,
    progress: active ? clamp((elapsed - completed * RESOLUTION_STEP_MS) / RESOLUTION_STEP_MS) : 1,
    done: completed >= resolutionReplay.events.length,
  };
}

function replayScore(player, replay) {
  if (!replay) return player.score;
  let pending = 0;
  for (let i = replay.completed; i < resolutionReplay.events.length; i++) {
    if (resolutionReplay.events[i].playerId === player.id) pending += resolutionReplay.events[i].points;
  }
  return player.score - pending;
}

function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); }
function easeOut(value) { return 1 - Math.pow(1 - clamp(value), 3); }

function drawSkull(x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -size * .18, size, Math.PI, 0);
  ctx.lineTo(size * .82, size * .55);
  ctx.lineTo(size * .38, size * .92);
  ctx.lineTo(-size * .38, size * .92);
  ctx.lineTo(-size * .82, size * .55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colors.cream;
  ctx.beginPath(); ctx.arc(-size * .38, size * .12, size * .25, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(size * .38, size * .12, size * .25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colors.ink;
  ctx.beginPath(); ctx.moveTo(0, size * .3); ctx.lineTo(-size * .15, size * .52); ctx.lineTo(size * .15, size * .52); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = colors.cream; ctx.lineWidth = Math.max(.7, size * .12);
  for (const offset of [-.22, .22]) { ctx.beginPath(); ctx.moveTo(size * offset, size * .58); ctx.lineTo(size * offset, size * .9); ctx.stroke(); }
  ctx.restore();
}

function drawCard(card, x, y, w, h, selected = false, compact = false, entrance = 1) {
  const reveal = reduceMotion ? 1 : easeOut(entrance);
  ctx.save();
  ctx.globalAlpha = reveal;
  ctx.translate(x + w / 2, y + h / 2 + (1 - reveal) * 24);
  const selectedPulse = selected && !reduceMotion ? 1 + Math.sin(visualTime / 120) * .018 : 1;
  ctx.scale(selectedPulse * (.92 + reveal * .08), selectedPulse * (.92 + reveal * .08));
  ctx.translate(-x - w / 2, -y - h / 2);
  ctx.shadowColor = selected ? 'rgba(255,179,63,.5)' : 'rgba(0,0,0,.42)';
  ctx.shadowBlur = selected ? 18 : 5;
  ctx.shadowOffsetY = selected ? 7 : 3;
  roundedRect(x, y, w, h, Math.min(12, w * .17), selected ? colors.orange : colors.cream, selected ? colors.orange : 'rgba(255,247,233,.62)', selected ? 3 : 1.5);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x + 2, y + 2, w - 4, h - 4, Math.min(10, w * .14)); ctx.clip();
  const sheen = ctx.createLinearGradient(x, y, x + w, y + h);
  const shimmer = reduceMotion ? .28 : (Math.sin(visualTime / 700 + card * .17) + 1) / 2;
  sheen.addColorStop(0, `rgba(255,255,255,${.36 + shimmer * .08})`);
  sheen.addColorStop(.42, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(23,33,31,.055)');
  ctx.fillStyle = sheen; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 10, y + 7); ctx.lineTo(x + w - 10, y + 7); ctx.stroke();
  text(card, x + w / 2, y + h * .43, compact ? Math.max(13, w * .32) : Math.max(18, w * .35), colors.ink, 'center', 900);
  if (!compact && w >= 56) text(card, x + 9, y + 11, 8, '#6f625a', 'center', 900);
  const count = points(card);
  const skullSize = Math.min(4.8, w / (count * 1.75 + 1));
  const spacing = skullSize * 1.75;
  const total = (count - 1) * spacing;
  for (let i = 0; i < count; i++) {
    const bob = reduceMotion ? 0 : Math.sin(visualTime / 180 + i * .9) * .7;
    drawSkull(x + w / 2 - total / 2 + i * spacing, y + h * .76 + bob, skullSize, count >= 5 ? colors.red : colors.green);
  }
  ctx.restore();
}

function button(label, x, y, w, h, onClick, active = true) {
  roundedRect(x + 5, y + 7, w, h, 8, active ? colors.red : '#2a2624');
  roundedRect(x, y, w, h, 8, active ? colors.orange : '#393330', active ? colors.orange : '#554c47', 1.5);
  text(label.toUpperCase(), x + w / 2, y + h / 2, 12, active ? colors.ink : '#817771', 'center', 900);
  if (active) hitAreas.push({ x, y, w, h, onClick });
}

function header(title, subtitle) {
  const compact = innerWidth < 560;
  roundedRect(12, 10, compact ? 38 : 82, 34, 8, 'rgba(255,247,233,.06)', colors.line, 1);
  text(compact ? 'D' : 'D  ARCADE', 12 + (compact ? 19 : 41), 27, compact ? 12 : 9, colors.cream, 'center', 900);
  hitAreas.push({ x: 12, y: 10, w: compact ? 38 : 82, h: 34, onClick: () => { leaveTarget = 'arcade'; leavePrompt = true; } });
  const exitX = compact ? 56 : 94;
  roundedRect(exitX, 10, compact ? 38 : 54, 34, 8, 'rgba(255,247,233,.06)', colors.line, 1);
  text(compact ? '×' : 'EXIT', exitX + (compact ? 19 : 27), 27, compact ? 16 : 9, colors.cream, 'center', 900);
  hitAreas.push({ x: exitX, y: 10, w: compact ? 38 : 54, h: 34, onClick: () => { leaveTarget = 'home'; leavePrompt = true; } });
  text(title, innerWidth / 2, 27, innerWidth < 500 ? 10 : 13, colors.cream, 'center', 900);
  roundedRect(innerWidth - 46, 10, 34, 34, 8, 'rgba(255,247,233,.06)', colors.line, 1);
  text('?', innerWidth - 29, 27, 15, colors.cream, 'center', 900);
  hitAreas.push({ x: innerWidth - 46, y: 10, w: 34, h: 34, onClick: showHelp });
  roundedRect(innerWidth - 86, 10, 34, 34, 8, 'rgba(255,247,233,.06)', colors.line, 1);
  text('↗', innerWidth - 69, 27, 15, colors.cream, 'center', 900);
  hitAreas.push({ x: innerWidth - 86, y: 10, w: 34, h: 34, onClick: copyInviteLink });
  if (innerWidth >= 720) text(subtitle, innerWidth - 98, 27, 11, colors.muted, 'right', 800);
  ctx.strokeStyle = colors.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(18, 50); ctx.lineTo(innerWidth - 18, 50); ctx.stroke();
}

function drawLobby() {
  header('THE TABLE', `${state.players.length}/8 PLAYERS`);
  const narrow = innerWidth < 600;
  const panelW = Math.min(600, innerWidth - 32);
  const panelX = (innerWidth - panelW) / 2;
  text('GATHER YOUR CREW', innerWidth / 2, 88, narrow ? 25 : 34, colors.cream, 'center', 900);
  text('Everyone joins from the same link', innerWidth / 2, 120, 12, colors.muted, 'center', 650);
  roundedRect(panelX, 146, panelW, Math.min(innerHeight - 250, 390), 14, colors.panel, colors.line, 1.5);
  const rowH = Math.min(52, (Math.min(innerHeight - 265, 380) - 24) / 8);
  state.players.forEach((player, i) => {
    const y = 158 + i * rowH;
    roundedRect(panelX + 12, y, panelW - 24, rowH - 7, 8, player.id === state.you?.id ? 'rgba(255,179,63,.18)' : 'rgba(255,247,233,.045)', player.id === state.you?.id ? 'rgba(255,179,63,.48)' : null);
    roundedRect(panelX + 23, y + 8, 28, 28, 9, i % 2 ? colors.green : colors.orange, colors.ink, 1.5);
    text(player.name.slice(0, 1).toUpperCase(), panelX + 37, y + 22, 13, i % 2 ? '#fff' : colors.ink, 'center', 900);
    text(player.name + (player.isBot ? '  · BOT' : player.left ? '  · LEFT' : player.id === state.you?.id ? '  (YOU)' : ''), panelX + 62, y + 21, 14, colors.cream, 'left', 800);
    if (player.id === state.hostId) text('HOST', panelX + panelW - 24, y + 21, 10, colors.red, 'right', 900);
  });
  if (!state.players.length) text('Waiting for players…', innerWidth / 2, 220, 15, colors.muted, 'center', 700);
  const isHost = state.you?.id === state.hostId;
  if (isHost) {
    const gap = 10;
    const buttonW = Math.min(180, (innerWidth - 42 - gap) / 2);
    const x = innerWidth / 2 - buttonW - gap / 2;
    button('Add bot', x, innerHeight - 80, buttonW, 50, () => send('addBot'), state.players.length < 8);
    button(state.players.length < 2 ? 'Need 2 players' : 'Start game', x + buttonW + gap, innerHeight - 80, buttonW, 50, () => send('start'), state.players.length >= 2);
  }
  else text('The host will start the game', innerWidth / 2, innerHeight - 54, 13, colors.muted, 'center', 800);
}

function drawResolutionCard(replay, tableRows, top, rowH, cardW, cardH) {
  if (!replay?.active) return;
  const event = replay.active;
  const travel = easeOut(Math.min(1, replay.progress / .72));
  const destinationLength = event.taken.length ? 1 : tableRows[event.row].length + 1;
  const destinationWidth = destinationLength * (cardW + 5) - 5;
  const targetX = (innerWidth - destinationWidth) / 2 + (destinationLength - 1) * (cardW + 5);
  const targetY = top + event.row * rowH;
  const startX = innerWidth / 2 - cardW / 2;
  const startY = 52;
  const x = startX + (targetX - startX) * travel;
  const y = startY + (targetY - startY) * travel;
  if (!reduceMotion && travel < .98) {
    ctx.save();
    for (let i = 3; i >= 1; i--) {
      const trailT = Math.max(0, travel - i * .075);
      ctx.globalAlpha = .09 * (4 - i);
      const trailX = startX + (targetX - startX) * trailT;
      const trailY = startY + (targetY - startY) * trailT;
      roundedRect(trailX, trailY, cardW, cardH, Math.min(10, cardW * .17), colors.orange);
    }
    ctx.restore();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(23,33,31,.32)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 7;
  drawCard(event.card, x, y, cardW, cardH, true, true, 1);
  ctx.restore();

  if (event.points > 0 && replay.progress > .52) {
    const impact = clamp((replay.progress - .52) / .25);
    const fade = 1 - clamp((replay.progress - .78) / .22);
    ctx.save();
    ctx.globalAlpha = fade;
    const burstX = targetX + cardW / 2;
    const burstY = targetY + cardH / 2;
    for (let i = 0; i < Math.min(12, event.points + 5); i++) {
      const angle = (Math.PI * 2 * i) / Math.min(12, event.points + 5) - Math.PI / 2;
      const distance = 18 + impact * (28 + (i % 3) * 8);
      drawSkull(burstX + Math.cos(angle) * distance, burstY + Math.sin(angle) * distance, 5, colors.red);
    }
    roundedRect(innerWidth / 2 - 72, Math.max(104, targetY - 28), 144, 30, 15, colors.red, colors.ink, 1.5);
    text(`+${event.points} SKULL${event.points === 1 ? '' : 'S'}`, innerWidth / 2, Math.max(119, targetY - 13), 12, '#fff', 'center', 900);
    ctx.restore();
  } else if (replay.progress > .62) {
    const impact = clamp((replay.progress - .62) / .25);
    ctx.save(); ctx.globalAlpha = 1 - impact; ctx.strokeStyle = colors.green; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(targetX + cardW / 2, targetY + cardH / 2, 14 + impact * 28, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}

function drawTable() {
  const mobile = innerWidth < 650;
  const betweenRounds = state.phase === 'roundEnd';
  const replay = resolutionSnapshot();
  const replaying = Boolean(replay && !replay.done);
  const tableRows = replay ? replay.rows : state.rows;
  const choiceTitle = replaying ? `${replay.active.name.toUpperCase()} PLAYS ${replay.active.card}` : betweenRounds ? `ROUND ${state.turn} COMPLETE` : state.rowChoice ? (state.rowChoice.mine ? 'CHOOSE A ROW' : `${state.rowChoice.name.toUpperCase()} IS CHOOSING`) : `TURN ${Math.min(state.turn + 1, state.maxTurns)} OF ${state.maxTurns}`;
  header(choiceTitle, state.you ? `${state.you.score} PTS` : '');
  const playerY = 72;
  const playerGap = Math.min(120, (innerWidth - 36) / Math.max(1, state.players.length));
  const total = playerGap * state.players.length;
  state.players.forEach((player, i) => {
    const x = (innerWidth - total) / 2 + i * playerGap + playerGap / 2;
    const avatarR = mobile ? 12 : 15;
    const readyPulse = player.ready && !reduceMotion ? 1 + Math.sin(visualTime / 180 + i) * .1 : 1;
    ctx.beginPath(); ctx.arc(x, playerY, avatarR * readyPulse, 0, Math.PI * 2); ctx.fillStyle = player.ready ? colors.green : colors.pale; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = colors.ink; ctx.stroke();
    text(player.name.slice(0, 1).toUpperCase(), x, playerY, mobile ? 9 : 11, player.ready ? colors.ink : colors.cream, 'center', 900);
    const maxName = mobile ? 4 : 8;
    const shortName = player.name.length > maxName ? `${player.name.slice(0, maxName - 1)}…` : player.name;
    text(`${shortName} · ${replayScore(player, replay)}`, x, playerY + (mobile ? 19 : 24), mobile ? 8 : 9, colors.muted, 'center', 800);
  });

  const hand = state.you?.hand || [];
  const handColumns = mobile ? Math.min(5, Math.max(1, hand.length)) : Math.max(1, hand.length);
  const handRows = mobile ? Math.ceil(hand.length / 5) : 1;
  const handW = mobile ? Math.min(50, (innerWidth - 44) / handColumns - 6) : 70;
  const handH = mobile ? 68 : 96;
  const handRowGap = mobile ? handH + 7 : 0;
  const handBaseY = mobile ? innerHeight - handRows * handRowGap - 8 : innerHeight - 122;
  const top = mobile ? 108 : 122;
  const available = mobile ? Math.max(190, handBaseY - top - 28) : Math.min(innerHeight * .47, innerHeight - 275);
  const rowH = available / 4;
  const maxCardsW = Math.min(innerWidth - 40, 650);
  const cardW = Math.min(mobile ? 40 : 58, (maxCardsW - 30) / 6);
  const cardH = cardW * 1.28;
  const previewRow = !betweenRounds && !state.you?.locked ? placementRow(state.you?.selected, tableRows) : null;
  tableRows.forEach((row, rowIndex) => {
    const y = top + rowIndex * rowH;
    const rowW = row.length * (cardW + 5) - 5;
    const x0 = (innerWidth - rowW) / 2;
    if (state.rowChoice?.mine) {
      const pulse = reduceMotion ? 2 : 2 + (Math.sin(visualTime / 150) + 1) * 1.2;
      roundedRect(12, y - 4, innerWidth - 24, cardH + 8, 13, 'rgba(217,85,54,.06)', colors.red, pulse);
      hitAreas.push({ x: 12, y: y - 4, w: innerWidth - 24, h: cardH + 8, onClick: () => send('chooseRow', { row: rowIndex }) });
    } else if (previewRow === rowIndex) {
      roundedRect(12, y - 4, innerWidth - 24, cardH + 8, 13, 'rgba(57,117,103,.06)', colors.green, 2.5);
      text('LANDS HERE', innerWidth - 20, y + cardH / 2, 9, colors.green, 'right', 900);
    } else if (previewRow === -1 && state.you?.selected !== null) {
      roundedRect(12, y - 4, innerWidth - 24, cardH + 8, 13, 'rgba(217,85,54,.025)', '#d9a08f', 1);
    } else if (replaying && replay.active.row === rowIndex) {
      const pulse = 2 + Math.sin(visualTime / 90) * .8;
      roundedRect(12, y - 4, innerWidth - 24, cardH + 8, 13, replay.active.points ? 'rgba(217,85,54,.08)' : 'rgba(57,117,103,.06)', replay.active.points ? colors.red : colors.green, pulse);
    }
    text(`${row.reduce((sum, card) => sum + points(card), 0)} pts`, Math.max(26, x0 - 12), y + cardH / 2, 10, colors.muted, 'right', 800);
    row.forEach((card, i) => drawCard(card, x0 + i * (cardW + 5), y, cardW, cardH, false, true, clamp((visualTime - sceneAnimationStart - (rowIndex * 6 + i) * 35) / 320)));
    if (!mobile) {
      for (let i = row.length; i < 6; i++) roundedRect(x0 + i * (cardW + 5), y, cardW, cardH, 10, null, '#d4c9a5', 1);
    } else {
      const slotY = y + cardH + 5;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.arc(innerWidth / 2 - 16 + i * 8, slotY, 1.7, 0, Math.PI * 2);
        ctx.fillStyle = i < row.length ? colors.red : '#cfc4a4'; ctx.fill();
      }
    }
  });
  drawResolutionCard(replay, tableRows, top, rowH, cardW, cardH);

  const handY = handBaseY;
  const gap = mobile ? handW + 6 : Math.min(57, (innerWidth - 36) / Math.max(hand.length, 1));
  const widestRow = mobile ? Math.min(5, hand.length) : hand.length;
  const totalW = gap * Math.max(0, widestRow - 1) + handW;
  const startX = (innerWidth - totalW) / 2;
  const penalties = state.lastEvents.filter((event) => event.points > 0);
  const roundSummary = penalties.length ? penalties.map((event) => `${event.name} +${event.points}`).join('  ·  ') : 'NO SKULLS COLLECTED';
  const choiceLabel = replaying ? (replay.active.points ? `${replay.active.name.toUpperCase()} COLLECTS ${replay.active.points} SKULL${replay.active.points === 1 ? '' : 'S'}` : `${replay.active.name.toUpperCase()} STACKS SAFELY`) : betweenRounds ? roundSummary : state.you?.locked ? 'LOCKED · WAITING FOR OTHERS' : previewRow === -1 && state.you?.selected !== null ? 'OVERSIZED · YOU WILL CHOOSE A STACK' : state.you?.selected !== null ? 'TAP AGAIN TO DESELECT' : 'CHOOSE A CARD';
  text(choiceLabel, innerWidth / 2, handY - 19, 10, betweenRounds ? colors.red : state.you?.locked ? colors.green : colors.muted, 'center', 900);
  hand.forEach((card, index) => {
    const handRow = mobile ? Math.floor(index / 5) : 0;
    const handColumn = mobile ? index % 5 : index;
    const rowCount = mobile ? Math.min(5, hand.length - handRow * 5) : hand.length;
    const rowWidth = gap * Math.max(0, rowCount - 1) + handW;
    const rowStartX = mobile ? (innerWidth - rowWidth) / 2 : startX;
    const x = rowStartX + handColumn * gap;
    const selected = state.you.selected === card;
    const selectionBounce = selected && !reduceMotion ? Math.sin(clamp((visualTime - selectionAnimationStart) / 260) * Math.PI) * 7 : 0;
    const y = handY + handRow * handRowGap - (selected ? 6 + selectionBounce : 0);
    drawCard(card, x, y, handW, handH, selected, false, clamp((visualTime - sceneAnimationStart - index * 45) / 380));
    if (!betweenRounds && !replaying && !state.you.locked) hitAreas.push({ x, y, w: handW, h: handH, onClick: () => send('select', { card }) });
  });
  if (betweenRounds && !replaying) {
    if (state.you?.id === state.hostId) button('Start next round', innerWidth / 2 - 76, handY - 58, 152, 34, () => send('nextRound'));
  } else if (!state.you?.locked && !state.rowChoice) {
    const lockW = mobile ? 92 : 110;
    button('Lock in', innerWidth / 2 - lockW / 2, handY - 58, lockW, 34, () => send('confirm'), state.you?.selected !== null);
  }
}

function drawCrown(x, y, size, lift = 0) {
  ctx.save(); ctx.translate(x, y - lift);
  ctx.fillStyle = colors.orange; ctx.strokeStyle = colors.ink; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-size, size * .4); ctx.lineTo(-size * .78, -size * .7); ctx.lineTo(-size * .25, -size * .15);
  ctx.lineTo(0, -size); ctx.lineTo(size * .25, -size * .15); ctx.lineTo(size * .78, -size * .7); ctx.lineTo(size, size * .4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  roundedRect(-size, size * .34, size * 2, size * .38, size * .12, colors.orange, colors.ink, 2);
  for (const px of [-.78, 0, .78]) { ctx.beginPath(); ctx.arc(size * px, px === 0 ? -size : -size * .7, size * .1, 0, Math.PI * 2); ctx.fillStyle = colors.red; ctx.fill(); }
  ctx.restore();
}

function drawCelebration(elapsed) {
  if (reduceMotion) return;
  const palette = [colors.red, colors.orange, colors.green, '#f5d982', '#72aeb7'];
  ctx.save();
  for (let i = 0; i < 54; i++) {
    const seedX = ((i * 83) % 101) / 101;
    const delay = (i % 9) * 90;
    const fall = Math.max(0, elapsed - delay);
    const x = seedX * innerWidth + Math.sin(fall / 420 + i) * 22;
    const y = ((fall * (.055 + (i % 5) * .009) + i * 31) % (innerHeight + 70)) - 50;
    const size = 4 + (i % 4) * 1.5;
    ctx.save(); ctx.translate(x, y); ctx.rotate(fall / 260 + i);
    ctx.fillStyle = palette[i % palette.length];
    if (i % 3 === 0) { ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(-size / 2, -size / 3, size, size * .66);
    ctx.restore();
  }
  ctx.restore();
}

function drawFinished() {
  header('FINAL SCORES', 'GAME OVER');
  const ranked = [...state.players].sort((a, b) => a.score - b.score);
  const elapsed = Math.max(0, visualTime - sceneAnimationStart);
  const reveal = reduceMotion ? 1 : easeOut(elapsed / 620);
  drawCelebration(elapsed);
  const winnerLift = reduceMotion ? 0 : Math.sin(visualTime / 240) * 4;
  drawCrown(innerWidth / 2, 82, innerWidth < 500 ? 17 : 21, winnerLift);
  ctx.save(); ctx.globalAlpha = reveal; ctx.translate(0, (1 - reveal) * 18);
  text(`${(ranked[0]?.name || 'Nobody').toUpperCase()} WINS!`, innerWidth / 2, 124, innerWidth < 500 ? 30 : 42, colors.cream, 'center', 900);
  text('Fewest skulls. Finest play.', innerWidth / 2, 158, 13, colors.muted, 'center', 700);
  ctx.restore();
  const panelW = Math.min(520, innerWidth - 32);
  const panelX = (innerWidth - panelW) / 2;
  ranked.forEach((player, i) => {
    const rowReveal = reduceMotion ? 1 : easeOut((elapsed - 260 - i * 85) / 420);
    const y = 190 + i * 46;
    ctx.save(); ctx.globalAlpha = rowReveal; ctx.translate((1 - rowReveal) * (i % 2 ? 28 : -28), 0);
    if (i === 0) { ctx.shadowColor = 'rgba(245,166,35,.28)'; ctx.shadowBlur = 18; }
    roundedRect(panelX, y, panelW, 38, 8, i === 0 ? colors.orange : 'rgba(255,247,233,.07)', i === 0 ? colors.orange : colors.line, i === 0 ? 2 : 1);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    text(i === 0 ? '★' : `${i + 1}`, panelX + 24, y + 20, 14, i === 0 ? colors.red : colors.muted, 'center', 900);
    text(player.name, panelX + 48, y + 20, 14, i === 0 ? colors.ink : colors.cream, 'left', 800);
    text(`${player.score} points`, panelX + panelW - 18, y + 20, 13, i === 0 ? colors.ink : colors.cream, 'right', 900);
    ctx.restore();
  });
  const actionY = Math.min(innerHeight - 70, 206 + ranked.length * 46);
  if (state.you?.id === state.hostId) {
    const actionW = Math.min(156, (innerWidth - 46) / 2);
    button('Play again', innerWidth / 2 - actionW - 6, actionY, actionW, 46, () => send('start'));
    button('Back to arcade', innerWidth / 2 + 6, actionY, actionW, 46, () => { leaveTarget = 'arcade'; leavePrompt = true; });
  } else button('Back to arcade', innerWidth / 2 - 84, actionY, 168, 46, () => { leaveTarget = 'arcade'; leavePrompt = true; });
}

function drawLeavePrompt() {
  hitAreas.push({ x: 0, y: 0, w: innerWidth, h: innerHeight, onClick: () => {} });
  ctx.fillStyle = 'rgba(0,0,0,.72)';
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  const w = Math.min(360, innerWidth - 32);
  const h = 210;
  const x = (innerWidth - w) / 2;
  const y = (innerHeight - h) / 2;
  roundedRect(x, y, w, h, 14, '#211b19', colors.line, 1.5);
  text(leaveTarget === 'arcade' ? 'RETURN TO THE ARCADE?' : 'LEAVE THIS TABLE?', innerWidth / 2, y + 48, 20, colors.cream, 'center', 900);
  const warning = state.phase === 'playing' ? 'Your remaining cards will be auto-played.' : leaveTarget === 'arcade' ? 'You will return to Decadence Inc.' : 'You can take another seat anytime.';
  text(warning, innerWidth / 2, y + 82, 12, colors.muted, 'center', 650);
  const buttonW = (w - 46) / 2;
  button('Stay', x + 16, y + 132, buttonW, 48, () => { leavePrompt = false; });
  button(leaveTarget === 'arcade' ? 'To arcade' : 'Leave', x + 30 + buttonW, y + 132, buttonW, 48, leaveRoom);
}

function render() {
  hitAreas = [];
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  const glow = ctx.createRadialGradient(innerWidth * .72, innerHeight * .22, 0, innerWidth * .72, innerHeight * .22, Math.max(innerWidth, innerHeight) * .7);
  glow.addColorStop(0, 'rgba(142,36,30,.28)'); glow.addColorStop(.46, 'rgba(69,26,22,.10)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.strokeStyle = 'rgba(255,247,233,.055)'; ctx.lineWidth = 1;
  for (let x = 0; x < innerWidth; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, innerHeight); ctx.stroke(); }
  for (let y = 0; y < innerHeight; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(innerWidth, y); ctx.stroke(); }
  if (state.phase === 'lobby') drawLobby();
  if (state.phase === 'playing' || state.phase === 'roundEnd') drawTable();
  if (state.phase === 'finished') {
    const finalReplay = resolutionSnapshot();
    if (finalReplay && !finalReplay.done) drawTable();
    else drawFinished();
  }
  if (leavePrompt && state.phase !== 'join') drawLeavePrompt();
}

function pointer(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * innerWidth / rect.width;
  const y = (event.clientY - rect.top) * innerHeight / rect.height;
  [...hitAreas].reverse().find((area) => x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h)?.onClick();
}

canvas.addEventListener('pointerup', pointer);
window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});
document.addEventListener('fullscreenchange', resize);

window.render_game_to_text = () => {
  const replay = resolutionSnapshot();
  return JSON.stringify({
    coordinateSystem: 'Canvas origin top-left; x increases right, y increases down.',
    phase: state.phase,
    turn: state.turn,
    you: state.you,
    players: state.players,
    rows: (replay?.rows || state.rows).map((cards) => ({ cards, points: cards.reduce((sum, card) => sum + points(card), 0) })),
    rowChoice: state.rowChoice,
    resolution: replay ? { completed: replay.completed, total: resolutionReplay.events.length, active: replay.active, progress: replay.progress, done: replay.done } : null,
    navigation: { canExit: state.phase !== 'join', canReturnToArcade: true, leavePrompt, leaveTarget },
    guidance: state.phase === 'playing' ? { selectedCard: state.you?.selected, destinationRow: placementRow(state.you?.selected, state.rows), oversized: state.you?.selected !== null && placementRow(state.you?.selected, state.rows) === -1 } : null,
    lastEvents: state.lastEvents,
  });
};
window.advanceTime = (ms = 16.67) => { visualTime += ms; render(); };

resize();
function animationFrame(now) {
  visualTime = now;
  render();
  requestAnimationFrame(animationFrame);
}
requestAnimationFrame(animationFrame);
