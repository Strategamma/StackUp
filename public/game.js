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

const colors = { ink: '#17110e', paper: '#171311', cream: '#efddbf', card: '#e3bf86', red: '#ef4650', orange: '#f4ad3e', green: '#6fdaa5', pale: '#443a34', muted: '#b7a38f', line: 'rgba(239,221,191,.16)', panel: 'rgba(47,34,29,.9)' };
let state = { phase: 'join', players: [], rows: [], you: null, turn: 0, maxTurns: 10, lastEvents: [] };
let socket;
let hitAreas = [];
let toastTimer;
let leavePrompt = false;
let leaveTarget = 'home';
let removePromptPlayer = null;
let manualClose = false;
let visualTime = performance.now();
let sceneAnimationStart = visualTime;
let selectionAnimationStart = visualTime;
let pointerState = { x: -1, y: -1, down: false };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RESOLUTION_STEP_MS = reduceMotion ? 180 : 850;
let resolutionReplay = null;
let resolutionBaseRows = null;
let displayName = localStorage.getItem('stackup-name') || '';
nameInput.value = displayName;
const isLocalHost = /^(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3}|[^.]+(?:\.local)?)$/i.test(location.hostname);
const isLoopback = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
let lanShareOrigin = location.origin;

if (isLoopback) {
  fetch('/api/lan-addresses')
    .then((response) => response.json())
    .then((addresses) => {
      if (!Array.isArray(addresses) || !addresses.length) return;
      lanShareOrigin = addresses[0];
    })
    .catch(() => {});
}

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
    showToast('Open StackUp from its web link to play.');
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
      showToast('Seat claimed — invite your crew');
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
      state = message.state;
      if (removePromptPlayer && !state.players.some((player) => player.id === removePromptPlayer.id)) removePromptPlayer = null;
      hideJoinPanel();
      render();
    }
    if (message.type === 'left') finishLeave();
    if (message.type === 'kicked') returnToHome(message.message || 'The host removed you from the lobby.');
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
}

function send(type, extra = {}) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...extra }));
}

function returnToHome(feedback = 'You left the table') {
  manualClose = true;
  leavePrompt = false;
  removePromptPlayer = null;
  localStorage.removeItem('stackup-token');
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  state = { phase: 'join', players: [], rows: [], you: null, turn: 0, maxTurns: 10, lastEvents: [] };
  joinPanel.classList.remove('joining');
  joinPanel.classList.remove('hidden');
  arcadeLink.hidden = false;
  showToast(feedback);
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
  if (isLoopback && lanShareOrigin === location.origin) {
    try {
      const addresses = await fetch('/api/lan-addresses').then((response) => response.json());
      if (Array.isArray(addresses) && addresses.length) lanShareOrigin = addresses[0];
    } catch {}
  }
  const inviteOrigin = isLocalHost ? lanShareOrigin : location.origin;
  try {
    await navigator.clipboard.writeText(inviteOrigin);
    showToast('Invite link copied');
  } catch {
    showToast(`Invite players at ${new URL(inviteOrigin).host}`);
  }
}

async function shareResults() {
  const ranked = [...state.players].sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  const viewer = ranked.find((player) => player.id === state.you?.id);
  if (!viewer) return;
  const rank = ranked.findIndex((player) => player.score === viewer.score) + 1;
  const result = rank === 1
    ? `I won StackUp with ${viewer.score} skull${viewer.score === 1 ? '' : 's'}!`
    : `I placed ${ordinal(rank).toLowerCase()} in StackUp with ${viewer.score} skull${viewer.score === 1 ? '' : 's'}.`;
  const shareData = { title: 'StackUp results', text: `${result} Think you can beat me?`, url: location.origin };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      showToast('Bragging rights copied');
    }
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('Could not share results');
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

function fitText(value, x, y, maxWidth, size, minSize, color = colors.cream, align = 'center', weight = 700) {
  let fittedSize = size;
  ctx.font = `${weight} ${fittedSize}px Arial, Helvetica, sans-serif`;
  while (fittedSize > minSize && ctx.measureText(value).width > maxWidth) {
    fittedSize -= 1;
    ctx.font = `${weight} ${fittedSize}px Arial, Helvetica, sans-serif`;
  }
  text(value, x, y, fittedSize, color, align, weight);
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
function contains(x, y, w, h) { return pointerState.x >= x && pointerState.x <= x + w && pointerState.y >= y && pointerState.y <= y + h; }

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

function drawCard(card, x, y, w, h, selected = false, compact = false, entrance = 1, hovered = false) {
  const reveal = reduceMotion ? 1 : easeOut(entrance);
  ctx.save();
  ctx.globalAlpha = reveal;
  const hoverLift = hovered && !reduceMotion ? 5 + Math.sin(visualTime / 180) : 0;
  ctx.translate(x + w / 2, y + h / 2 + (1 - reveal) * 24 - hoverLift);
  const selectedPulse = selected && !reduceMotion ? 1 + Math.sin(visualTime / 120) * .018 : 1;
  const hoverScale = hovered && !reduceMotion ? 1.035 : 1;
  ctx.scale(selectedPulse * hoverScale * (.92 + reveal * .08), selectedPulse * hoverScale * (.92 + reveal * .08));
  ctx.translate(-x - w / 2, -y - h / 2);
  ctx.shadowColor = selected ? 'rgba(255,179,63,.5)' : 'rgba(0,0,0,.42)';
  ctx.shadowBlur = selected ? 18 : 5;
  ctx.shadowOffsetY = selected ? 7 : 3;
  roundedRect(x, y, w, h, Math.min(12, w * .17), selected ? colors.orange : hovered ? '#edcd99' : colors.card, selected ? colors.orange : hovered ? 'rgba(244,173,62,.9)' : '#624b39', selected || hovered ? 2.5 : 1.5);
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
    drawSkull(x + w / 2 - total / 2 + i * spacing, y + h * .76 + bob, skullSize, colors.red);
  }
  ctx.restore();
}

function button(label, x, y, w, h, onClick, active = true, tone = 'primary') {
  const hovered = active && contains(x, y, w, h);
  const pressed = hovered && pointerState.down;
  const lift = reduceMotion ? 0 : pressed ? 4 : hovered ? -3 : 0;
  const shadowY = pressed ? 2 : hovered ? 10 : 7;
  const surface = !active ? '#393330' : tone === 'danger' ? (hovered ? '#ff6670' : colors.red) : tone === 'secondary' ? (hovered ? '#51413a' : '#332a26') : (hovered ? '#ffc35c' : colors.orange);
  const foreground = !active ? '#a89b91' : tone === 'secondary' ? colors.cream : colors.ink;
  const edge = !active ? '#554c47' : tone === 'secondary' ? 'rgba(239,221,191,.45)' : surface;
  if (hovered) {
    ctx.save(); ctx.shadowColor = 'rgba(244,173,62,.3)'; ctx.shadowBlur = 22;
    roundedRect(x - 2, y - 3, w + 4, h + 6, 10, 'rgba(244,173,62,.08)'); ctx.restore();
  }
  roundedRect(x + 5, y + shadowY, w, h, 8, active ? (tone === 'secondary' ? '#171311' : '#822b31') : '#2a2624');
  roundedRect(x, y + lift, w, h, 8, surface, edge, 1.5);
  fitText(label.toUpperCase(), x + w / 2, y + h / 2 + lift, w - 12, 12, 9, foreground, 'center', 900);
  if (active) hitAreas.push({ x, y, w, h, onClick });
}

function headerControl(label, x, y, w, h, onClick, size = 10) {
  const hovered = contains(x, y, w, h);
  const pressed = hovered && pointerState.down;
  const offset = reduceMotion ? 0 : pressed ? 2 : hovered ? -2 : 0;
  roundedRect(x, y + offset, w, h, 8, hovered ? 'rgba(244,173,62,.15)' : 'rgba(239,221,191,.055)', hovered ? 'rgba(244,173,62,.62)' : colors.line, hovered ? 1.5 : 1);
  text(label, x + w / 2, y + h / 2 + offset, size, hovered ? colors.orange : colors.cream, 'center', 900);
  hitAreas.push({ x, y, w, h, onClick });
}

function removeSeatControl(x, y, rowH, player) {
  const size = Math.min(32, rowH - 7);
  const iconY = y + (rowH - 7 - size) / 2;
  const hovered = contains(x - 5, y - 3, size + 10, rowH - 1);
  const pressed = hovered && pointerState.down;
  const offset = reduceMotion ? 0 : pressed ? 2 : hovered ? -2 : 0;
  roundedRect(x, iconY + offset, size, size, 8, hovered ? 'rgba(239,70,80,.24)' : 'rgba(239,70,80,.08)', hovered ? colors.red : 'rgba(239,70,80,.38)', hovered ? 1.5 : 1);
  text('×', x + size / 2, iconY + size / 2 + offset - 1, 17, hovered ? '#ff7880' : colors.red, 'center', 900);
  hitAreas.push({ x: x - 5, y: y - 3, w: size + 10, h: rowH - 1, onClick: () => { removePromptPlayer = player; } });
}

function header(title, subtitle) {
  const compact = innerWidth < 560;
  headerControl(compact ? 'D' : 'D  ARCADE', 12, 4, compact ? 44 : 82, 44, () => { leaveTarget = 'arcade'; leavePrompt = true; }, compact ? 12 : 9);
  fitText(title, innerWidth / 2, 26, compact ? Math.max(100, innerWidth - 220) : Math.min(380, innerWidth - 230), innerWidth < 500 ? 10 : 13, 7, colors.cream, 'center', 900);
  headerControl('?', innerWidth - 56, 4, 44, 44, showHelp, 16);
  headerControl('LINK', innerWidth - 106, 4, 44, 44, copyInviteLink, 9);
  if (innerWidth >= 720) text(subtitle, innerWidth - 112, 26, 11, colors.muted, 'right', 800);
  ctx.strokeStyle = colors.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(18, 50); ctx.lineTo(innerWidth - 18, 50); ctx.stroke();
}

function drawLobby() {
  header('THE TABLE', `${state.players.length}/8 PLAYERS`);
  const narrow = innerWidth < 600;
  const short = innerHeight < 600;
  const panelW = Math.min(600, innerWidth - 32);
  const panelX = (innerWidth - panelW) / 2;
  const panelTop = short ? 116 : 146;
  const bottomLimit = innerHeight - 76;
  text('GATHER YOUR CREW', innerWidth / 2, short ? 72 : 88, narrow ? 25 : 34, colors.cream, 'center', 900);
  if (!short) text('Everyone joins from the same link', innerWidth / 2, 120, 12, colors.muted, 'center', 650);
  const panelH = Math.min(390, bottomLimit - panelTop - 12);
  const actionY = Math.min(bottomLimit, panelTop + panelH + 18);
  roundedRect(panelX, panelTop, panelW, panelH, 14, colors.panel, colors.line, 1.5);
  const rowH = Math.min(52, (panelH - 20) / 8);
  const isHost = state.you?.id === state.hostId;
  state.players.forEach((player, i) => {
    const y = panelTop + 12 + i * rowH;
    const rowCenter = y + (rowH - 7) / 2;
    const avatarSize = Math.min(28, rowH - 9);
    roundedRect(panelX + 12, y, panelW - 24, rowH - 7, 8, player.id === state.you?.id ? 'rgba(255,179,63,.18)' : 'rgba(255,247,233,.045)', player.id === state.you?.id ? 'rgba(255,179,63,.48)' : null);
    roundedRect(panelX + 23, rowCenter - avatarSize / 2, avatarSize, avatarSize, 9, i % 2 ? colors.green : colors.orange, colors.ink, 1.5);
    text(player.name.slice(0, 1).toUpperCase(), panelX + 23 + avatarSize / 2, rowCenter, 13, i % 2 ? '#fff' : colors.ink, 'center', 900);
    const maxName = narrow ? 13 : 18;
    const displayName = player.name.length > maxName ? `${player.name.slice(0, maxName - 1)}…` : player.name;
    text(displayName + (player.isBot ? '  · BOT' : player.left ? '  · LEFT' : player.id === state.you?.id ? '  (YOU)' : ''), panelX + 62, rowCenter, 14, colors.cream, 'left', 800);
    if (player.id === state.hostId) text('HOST', panelX + panelW - 24, rowCenter, 10, colors.red, 'right', 900);
    else if (isHost) removeSeatControl(panelX + panelW - 54, y, rowH, player);
  });
  if (!state.players.length) text('Waiting for players…', innerWidth / 2, panelTop + 74, 15, colors.muted, 'center', 700);
  if (isHost) {
    const gap = 10;
    const buttonW = Math.min(180, (innerWidth - 42 - gap) / 2);
    const x = innerWidth / 2 - buttonW - gap / 2;
    button('Add bot', x, actionY, buttonW, 48, () => send('addBot'), state.players.length < 8, 'secondary');
    button(state.players.length < 2 ? 'Need 2 players' : 'Start game', x + buttonW + gap, actionY, buttonW, 48, () => send('start'), state.players.length >= 2);
  }
  else text('The host will start the game', innerWidth / 2, actionY + 24, 13, colors.muted, 'center', 800);
}

function drawResolutionCard(replay, tableRows, top, rowH, cardW, cardH) {
  if (!replay?.active) return;
  const event = replay.active;
  const travel = easeOut(Math.min(1, replay.progress / .72));
  const destinationLength = event.taken.length ? 1 : tableRows[event.row].length + 1;
  const destinationSlots = 6;
  const destinationWidth = destinationSlots * (cardW + 5) - 5;
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

function scoreCrowns(players, turn, phase) {
  const crowns = new Map();
  const displayedRound = phase === 'playing' ? turn + 1 : turn;
  if (displayedRound < 5 || players.length < 2) return crowns;
  const scores = [...new Set(players.map((player) => player.score))].sort((a, b) => a - b);
  players.forEach((player) => {
    if (player.score === scores[0]) crowns.set(player.id, 'leader');
    else if (scores.length > 1 && player.score === scores[1]) crowns.set(player.id, 'challenger');
  });
  return crowns;
}

function drawScoreCrown(x, y, rank, index = 0) {
  const leader = rank === 'leader';
  const size = leader ? 7 : 5.4;
  const bounce = reduceMotion ? 0 : Math.sin(visualTime / 210 + index * .8) * (leader ? 1.8 : 1.1);
  ctx.save();
  if (!reduceMotion && leader) {
    ctx.shadowColor = 'rgba(244,173,62,.62)';
    ctx.shadowBlur = 10 + Math.sin(visualTime / 180) * 3;
  }
  drawCrown(x, y, size, bounce);
  ctx.restore();
}

function drawBestMedal(x, y, size = 7) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = colors.red;
  ctx.beginPath(); ctx.moveTo(-size * .75, size * .35); ctx.lineTo(-size * .25, size * 1.35); ctx.lineTo(0, size * .68); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(size * .75, size * .35); ctx.lineTo(size * .25, size * 1.35); ctx.lineTo(0, size * .68); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fillStyle = colors.orange; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = colors.ink; ctx.stroke();
  text('★', 0, 0, size * 1.1, colors.ink, 'center', 900);
  ctx.restore();
}

function drawTable() {
  const mobile = innerWidth < 650;
  const betweenRounds = state.phase === 'roundEnd';
  const replay = resolutionSnapshot();
  const replaying = Boolean(replay && !replay.done);
  const tableRows = replay ? replay.rows : state.rows;
  const choiceTitle = replaying ? `${replay.active.name.toUpperCase()} PLAYS ${replay.active.card}` : betweenRounds ? `ROUND ${state.turn} COMPLETE` : state.rowChoice ? (state.rowChoice.mine ? 'CHOOSE A ROW' : `${state.rowChoice.name.toUpperCase()} IS CHOOSING`) : `TURN ${Math.min(state.turn + 1, state.maxTurns)} OF ${state.maxTurns}`;
  const compactTitle = innerWidth < 420 && replaying ? `CARD ${replay.active.card}` : innerWidth < 420 && state.rowChoice && !state.rowChoice.mine ? 'ROW CHOICE' : choiceTitle;
  header(compactTitle, state.you ? `${state.you.score} PTS` : '');
  const playerY = mobile ? 76 : 82;
  const playerGap = Math.min(120, (innerWidth - 36) / Math.max(1, state.players.length));
  const total = playerGap * state.players.length;
  const crownRanks = scoreCrowns(state.players, state.turn, state.phase);
  state.players.forEach((player, i) => {
    const x = (innerWidth - total) / 2 + i * playerGap + playerGap / 2;
    const avatarR = mobile ? 12 : 15;
    const isYou = player.id === state.you?.id;
    const readyPulse = player.ready && !reduceMotion ? 1 + Math.sin(visualTime / 180 + i) * .1 : 1;
    if (isYou) {
      ctx.beginPath(); ctx.arc(x, playerY, avatarR + 4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(244,173,62,.13)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = colors.orange; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x, playerY, avatarR * readyPulse, 0, Math.PI * 2); ctx.fillStyle = player.ready ? colors.green : colors.pale; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = colors.ink; ctx.stroke();
    text(player.name.slice(0, 1).toUpperCase(), x, playerY, mobile ? 9 : 11, player.ready ? colors.ink : colors.cream, 'center', 900);
    const maxName = mobile ? 4 : 8;
    const shortName = player.name.length > maxName ? `${player.name.slice(0, maxName - 1)}…` : player.name;
    const displayScore = replayScore(player, replay);
    const scoreLabel = `${shortName}${isYou ? ' · YOU' : ''} · ${displayScore} PTS`;
    if (isYou) {
      const badgeW = Math.min(playerGap - 4, mobile ? 72 : 96);
      roundedRect(x - badgeW / 2, playerY + (mobile ? 14 : 18), badgeW, mobile ? 18 : 21, 10, colors.orange, colors.ink, 1);
      fitText(scoreLabel, x, playerY + (mobile ? 23 : 28.5), badgeW - 8, mobile ? 8 : 9, 6.5, colors.ink, 'center', 900);
    } else {
      fitText(scoreLabel, x, playerY + (mobile ? 19 : 24), Math.max(42, playerGap - 5), mobile ? 8 : 9, 6.5, colors.muted, 'center', 800);
    }
    const crownRank = crownRanks.get(player.id);
    if (crownRank) drawScoreCrown(x + avatarR * .72, playerY - avatarR * .8, crownRank, i);
  });

  const hand = state.you?.hand || [];
  const handColumns = mobile ? Math.min(5, Math.max(1, hand.length)) : Math.max(1, hand.length);
  const handRows = mobile ? Math.ceil(hand.length / 5) : 1;
  const handW = mobile ? Math.min(50, (innerWidth - 44) / handColumns - 6) : 70;
  const handH = mobile ? 68 : 96;
  const handRowGap = mobile ? handH + 7 : 0;
  const handBaseY = mobile ? innerHeight - handRows * handRowGap - 8 : innerHeight - 122;
  const top = mobile ? 116 : 138;
  const footerReserve = mobile ? 112 : 122;
  const tableBottom = handBaseY - footerReserve;
  const maxCardsW = Math.min(innerWidth - 40, 650);
  const widthCardW = Math.min(mobile ? 40 : 58, (maxCardsW - 30) / 6);
  const verticalCardH = Math.max(22, (tableBottom - top - 18) / 4);
  const cardW = Math.min(widthCardW, verticalCardH / 1.28);
  const cardH = cardW * 1.28;
  const rowH = Math.max(cardH + 2, (tableBottom - top - cardH) / 3);
  const previewRow = !betweenRounds && !state.you?.locked ? placementRow(state.you?.selected, tableRows) : null;
  tableRows.forEach((row, rowIndex) => {
    const y = top + rowIndex * rowH;
    const rowSlots = 6;
    const rowW = rowSlots * (cardW + 5) - 5;
    const x0 = (innerWidth - rowW) / 2;
    if (state.rowChoice?.mine) {
      const hovered = contains(12, y - 4, innerWidth - 24, cardH + 8);
      const pulse = reduceMotion ? 2 : 2 + (Math.sin(visualTime / 150) + 1) * 1.2;
      roundedRect(12, y - 4, innerWidth - 24, cardH + 8, 13, hovered ? 'rgba(244,173,62,.13)' : 'rgba(239,70,80,.06)', hovered ? colors.orange : colors.red, hovered ? 3.5 : pulse);
      hitAreas.push({ x: 12, y: y - 4, w: innerWidth - 24, h: cardH + 8, onClick: () => send('chooseRow', { row: rowIndex }) });
    } else if (previewRow === rowIndex) {
      roundedRect(12, y - 4, innerWidth - 24, cardH + 8, 13, 'rgba(57,117,103,.06)', colors.green, 2.5);
      roundedRect(innerWidth - 104, y + cardH / 2 - 11, 90, 22, 11, 'rgba(111,218,165,.12)', 'rgba(111,218,165,.35)', 1);
      text('LANDS HERE', innerWidth - 59, y + cardH / 2, 8, colors.green, 'center', 900);
    } else if (previewRow === -1 && state.you?.selected !== null) {
      roundedRect(12, y - 4, innerWidth - 24, cardH + 8, 13, 'rgba(217,85,54,.025)', '#d9a08f', 1);
    } else if (replaying && replay.active.row === rowIndex) {
      const pulse = 2 + Math.sin(visualTime / 90) * .8;
      roundedRect(12, y - 4, innerWidth - 24, cardH + 8, 13, replay.active.points ? 'rgba(217,85,54,.08)' : 'rgba(57,117,103,.06)', replay.active.points ? colors.red : colors.green, pulse);
    }
    text(`${row.reduce((sum, card) => sum + points(card), 0)} pts`, Math.max(26, x0 - 12), y + cardH / 2, 10, colors.muted, 'right', 800);
    row.forEach((card, i) => drawCard(card, x0 + i * (cardW + 5), y, cardW, cardH, false, true, clamp((visualTime - sceneAnimationStart - (rowIndex * 6 + i) * 35) / 320)));
    for (let i = row.length; i < 6; i++) {
      const slotX = x0 + i * (cardW + 5);
      const danger = i === 5;
      roundedRect(slotX, y, cardW, cardH, Math.min(10, cardW * .17), danger ? 'rgba(239,70,80,.055)' : 'rgba(227,191,134,.025)', danger ? 'rgba(239,70,80,.7)' : 'rgba(227,191,134,.48)', danger ? 1.75 : 1);
      if (danger) {
        const crossSize = Math.min(9, cardW * .22);
        const centerX = slotX + cardW / 2;
        const centerY = y + cardH / 2;
        ctx.save();
        ctx.strokeStyle = colors.red; ctx.lineWidth = mobile ? 2 : 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(centerX - crossSize, centerY - crossSize); ctx.lineTo(centerX + crossSize, centerY + crossSize); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(centerX + crossSize, centerY - crossSize); ctx.lineTo(centerX - crossSize, centerY + crossSize); ctx.stroke();
        ctx.restore();
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
  const roundSummary = penalties.length ? penalties.map((event) => `${event.name} +${event.points}`).join('  ·  ') : 'CLEAN TURN · NO SKULLS TAKEN';
  const playersToGo = state.players.filter((player) => !player.ready).length;
  const selectedCard = state.you?.selected;
  const choiceLabel = replaying
    ? (replay.active.points ? `${replay.active.name.toUpperCase()} TAKES ${replay.active.points} SKULL${replay.active.points === 1 ? '' : 'S'}` : `${replay.active.name.toUpperCase()} STACKS SAFELY`)
    : betweenRounds
      ? roundSummary
      : state.you?.locked
        ? `LOCKED · ${playersToGo} PLAYER${playersToGo === 1 ? '' : 'S'} TO GO`
        : previewRow === -1 && selectedCard !== null
          ? `${selectedCard} IS OVERSIZED · YOU'LL CHOOSE A ROW AFTER REVEAL`
          : selectedCard !== null
            ? `${selectedCard} SELECTED · LOCK IN WHEN READY`
            : 'PICK A CARD · CHANGE IT ANYTIME BEFORE LOCKING IN';
  const hasAction = !betweenRounds && !state.you?.locked && !state.rowChoice;
  const guidanceY = betweenRounds ? handY - 61 : handY - (hasAction ? (mobile ? 98 : 104) : 28);
  fitText(choiceLabel, innerWidth / 2, guidanceY, innerWidth - 32, 10, 7, betweenRounds ? colors.red : state.you?.locked ? colors.green : colors.muted, 'center', 900);
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
    const interactive = !betweenRounds && !replaying && !state.you.locked;
    const hovered = interactive && contains(x, y, handW, handH);
    drawCard(card, x, y, handW, handH, selected, false, clamp((visualTime - sceneAnimationStart - index * 45) / 380), hovered);
    if (interactive) hitAreas.push({ x, y: y - 7, w: handW, h: handH + 10, onClick: () => send('select', { card }) });
  });
  if (betweenRounds && !replaying) {
    text('NEXT ROUND STARTING…', innerWidth / 2, handY - 28, 9, colors.orange, 'center', 900);
  } else if (!state.you?.locked && !state.rowChoice) {
    const lockW = mobile ? 108 : 120;
    button('Lock in', innerWidth / 2 - lockW / 2, handY - 78, lockW, 44, () => send('confirm'), state.you?.selected !== null);
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

function drawVictoryBurst(x, y, elapsed) {
  const pulse = reduceMotion ? 1 : .92 + Math.sin(elapsed / 240) * .08;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(reduceMotion ? 0 : elapsed / 16000);
  ctx.globalAlpha = .2;
  for (let i = 0; i < 18; i++) {
    ctx.rotate(Math.PI * 2 / 18);
    ctx.fillStyle = i % 2 ? colors.orange : colors.red;
    ctx.beginPath();
    ctx.moveTo(26 * pulse, -3);
    ctx.lineTo(68 * pulse, -8);
    ctx.lineTo(68 * pulse, 8);
    ctx.lineTo(26 * pulse, 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = .35;
  ctx.strokeStyle = colors.orange;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 31 * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = .12;
  ctx.beginPath(); ctx.arc(0, 0, 78 * pulse, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function ordinal(value) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}TH`;
  return `${value}${value % 10 === 1 ? 'ST' : value % 10 === 2 ? 'ND' : value % 10 === 3 ? 'RD' : 'TH'}`;
}

function drawFinished() {
  header('FINAL SCORES', `GAME ${state.gameNumber || 1}`);
  const compact = innerWidth < 600;
  const short = innerHeight < 620;
  const ranked = [...state.players].sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  const winningScore = ranked[0]?.score ?? 0;
  const winners = ranked.filter((player) => player.score === winningScore);
  const viewer = ranked.find((player) => player.id === state.you?.id);
  const viewerRank = viewer ? ranked.findIndex((player) => player.score === viewer.score) + 1 : 0;
  const viewerWon = Boolean(viewer && viewer.score === winningScore);
  const elapsed = Math.max(0, visualTime - sceneAnimationStart);
  const reveal = reduceMotion ? 1 : easeOut(elapsed / 620);
  drawCelebration(elapsed);

  const crownY = short ? 70 : 86;
  const winnerLift = reduceMotion ? 0 : Math.sin(visualTime / 240) * 4;
  drawVictoryBurst(innerWidth / 2, crownY - 2, elapsed);
  drawCrown(innerWidth / 2, crownY, compact ? 16 : 20, winnerLift);
  const winnerTitle = winners.length === 1 ? `${winners[0].name.toUpperCase()} WINS!` : `${winners.length}-WAY TIE!`;
  const outcome = viewer
    ? viewerWon
      ? `YOU TOOK THE TABLE · ${viewer.score} SKULL${viewer.score === 1 ? '' : 'S'}`
      : `YOU PLACED ${ordinal(viewerRank)} · ${viewer.score} SKULL${viewer.score === 1 ? '' : 'S'}`
    : 'Fewest skulls takes the table.';
  const nextScore = ranked.find((player) => player.score > winningScore)?.score;
  const matchCallout = winners.length > 1 ? 'DEAD HEAT · SHARED GLORY' : nextScore === undefined ? 'TABLE CHAMPION' : `VICTORY MARGIN · ${nextScore - winningScore} SKULL${nextScore - winningScore === 1 ? '' : 'S'}`;
  ctx.save(); ctx.globalAlpha = reveal; ctx.translate(0, (1 - reveal) * 18);
  fitText(winnerTitle, innerWidth / 2, short ? 98 : 122, innerWidth - 32, compact ? 29 : 42, 17, colors.cream, 'center', 900);
  fitText(outcome, innerWidth / 2, short ? 124 : 154, innerWidth - 32, compact ? 10 : 13, 8, viewerWon ? colors.orange : colors.muted, 'center', viewerWon ? 900 : 750);
  roundedRect(innerWidth / 2 - 94, short ? 132 : 166, 188, 22, 11, 'rgba(244,173,62,.1)', 'rgba(244,173,62,.38)', 1);
  fitText(matchCallout, innerWidth / 2, short ? 143 : 177, 176, 8, 6, colors.orange, 'center', 900);
  if (!short && viewer?.session?.lastAchievement) fitText(`UNLOCKED · ${viewer.session.lastAchievement}`, innerWidth / 2, 199, innerWidth - 32, 9, 7, colors.green, 'center', 900);
  ctx.restore();

  const listTop = short ? 174 : 246;
  const panelW = Math.min(compact ? innerWidth - 24 : 760, innerWidth - 32);
  const panelX = (innerWidth - panelW) / 2;
  const sessionBest = Math.min(...ranked.map((player) => player.session?.best).filter((score) => Number.isFinite(score)));
  const gameNumber = state.gameNumber || 1;
  text(`TABLE SESSION · ${gameNumber} GAME${gameNumber === 1 ? '' : 'S'}`, innerWidth / 2, listTop - (short ? 10 : 32), 9, colors.muted, 'center', 900);
  if (!compact) {
    text('PLAYER', panelX + 52, listTop - 13, 8, colors.muted, 'left', 900);
    text('THIS GAME', panelX + panelW - 278, listTop - 13, 8, colors.muted, 'center', 900);
    text('SESSION', panelX + panelW - 20, listTop - 13, 8, colors.muted, 'right', 900);
  }

  const idealActionY = listTop + ranked.length * 48 + 18;
  const actionY = Math.min(innerHeight - 62, idealActionY);
  const rowStep = Math.min(48, (actionY - listTop - 18) / Math.max(1, ranked.length));
  const dense = rowStep < 34;
  const rowH = Math.max(22, Math.min(42, rowStep - (dense ? 4 : 6)));
  const boardBottom = listTop + Math.max(1, ranked.length) * rowStep - 6;
  const boardTopOffset = short ? 14 : 27;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.38)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 12;
  roundedRect(panelX - 14, listTop - boardTopOffset, panelW + 28, boardBottom - listTop + boardTopOffset + 16, 18, 'rgba(35,27,24,.72)', 'rgba(244,173,62,.28)', 1.5);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  for (const screwX of [panelX - 3, panelX + panelW + 3]) {
    ctx.beginPath(); ctx.arc(screwX, listTop - boardTopOffset / 2, 2.5, 0, Math.PI * 2); ctx.fillStyle = colors.orange; ctx.fill();
  }
  ctx.restore();
  ranked.forEach((player, i) => {
    const rowReveal = reduceMotion ? 1 : easeOut((elapsed - 260 - i * 85) / 420);
    const y = listTop + i * rowStep;
    const centerY = y + rowH / 2;
    const isViewer = player.id === state.you?.id;
    const isWinner = player.score === winningScore;
    const rank = ranked.findIndex((candidate) => candidate.score === player.score) + 1;
    const session = player.session || { games: 1, wins: isWinner ? 1 : 0, best: player.score };
    const hasSessionBest = session.best === sessionBest;
    ctx.save(); ctx.globalAlpha = rowReveal; ctx.translate((1 - rowReveal) * (i % 2 ? 28 : -28), 0);
    if (isWinner || isViewer) { ctx.shadowColor = isWinner ? 'rgba(244,173,62,.25)' : 'rgba(111,218,165,.2)'; ctx.shadowBlur = 16; }
    const rowFill = isWinner ? colors.orange : isViewer ? 'rgba(111,218,165,.14)' : 'rgba(255,247,233,.065)';
    const rowStroke = isViewer ? colors.green : isWinner ? colors.orange : colors.line;
    roundedRect(panelX, y, panelW, rowH, 9, rowFill, rowStroke, isViewer ? 2.5 : isWinner ? 2 : 1);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    roundedRect(panelX + 10, centerY - 11, 28, 22, 11, isWinner ? colors.ink : 'rgba(239,221,191,.08)');
    text(isWinner ? '★' : rank, panelX + 24, centerY, 11, isWinner ? colors.orange : colors.muted, 'center', 900);
    const maxName = compact ? 11 : 18;
    const baseName = player.name.length > maxName ? `${player.name.slice(0, maxName - 1)}…` : player.name;
    const nameColor = isWinner ? colors.ink : isViewer ? colors.green : colors.cream;
    const nameY = dense ? centerY : compact ? y + rowH * .34 : y + rowH * .38;
    const youChipX = compact ? panelX + panelW - 104 : panelX + Math.min(250, panelW * .36);
    const nameLaneW = isViewer ? youChipX - (panelX + 58) : compact ? panelW - 130 : panelW - 360;
    fitText(baseName, panelX + 50, nameY, nameLaneW, compact ? 11 : 13, 8, nameColor, 'left', 900);
    if (isViewer) {
      roundedRect(youChipX, nameY - 8, 38, 16, 8, 'rgba(111,218,165,.16)', colors.green, 1);
      text('YOU', youChipX + 19, nameY, 7, isWinner ? colors.ink : colors.green, 'center', 900);
    }
    if (!compact && !dense) {
      const competitiveLabel = isWinner ? 'CHAMPION' : rank === 2 ? 'RUNNER-UP' : `${ordinal(rank)} PLACE`;
      text(competitiveLabel, panelX + 50, y + rowH * .72, 7, isWinner ? '#5b2d12' : isViewer ? colors.green : colors.muted, 'left', 900);
    }

    const scoreProgress = reduceMotion ? 1 : easeOut((elapsed - 380 - i * 80) / 620);
    const visibleScore = Math.round(player.score * scoreProgress);
    if (compact) {
      drawSkull(panelX + panelW - 28, nameY - 1, 4, isWinner ? colors.red : colors.red);
      text(visibleScore, panelX + panelW - 42, nameY, 12, isWinner ? colors.ink : colors.cream, 'right', 900);
      if (!dense) {
        const awardY = y + rowH * .76;
        const visibleWins = Math.min(session.wins || 0, 3);
        if (visibleWins) {
          for (let win = 0; win < visibleWins; win++) drawScoreCrown(panelX + 55 + win * 11, awardY, 'challenger', win);
          if ((session.wins || 0) > 3) text(`×${session.wins}`, panelX + 89, awardY, 7, nameColor, 'left', 900);
        } else text('0 WINS', panelX + 50, awardY, 7, nameColor, 'left', 900);
        if (hasSessionBest) drawBestMedal(panelX + 113, awardY - 2, 4.5);
        text(`BEST ${session.best}`, panelX + (hasSessionBest ? 122 : 105), awardY, 8, nameColor, 'left', 900);
      }
    } else {
      const scoreX = panelX + panelW - 278;
      drawSkull(scoreX - 17, centerY - 1, 4.5, colors.red);
      text(visibleScore, scoreX + 2, centerY, 15, isWinner ? colors.ink : colors.cream, 'left', 900);
      const winsX = panelX + panelW - 190;
      roundedRect(winsX - 14, centerY - 13, 72, 26, 13, isWinner ? 'rgba(23,17,14,.12)' : 'rgba(239,221,191,.045)');
      const visibleWins = Math.min(session.wins || 0, 3);
      if (visibleWins) {
        for (let win = 0; win < visibleWins; win++) drawScoreCrown(winsX - 3 + win * 13, centerY, 'challenger', win);
        if ((session.wins || 0) > 3) text(`×${session.wins}`, winsX + 38, centerY, 7, isWinner ? colors.ink : colors.cream, 'left', 900);
      } else text('0 WINS', winsX + 22, centerY, 7, isWinner ? colors.ink : colors.muted, 'center', 900);
      const bestX = panelX + panelW - 102;
      roundedRect(bestX - 13, centerY - 13, 94, 26, 13, isWinner ? 'rgba(23,17,14,.12)' : 'rgba(239,221,191,.045)');
      if (hasSessionBest) drawBestMedal(bestX, centerY - 2, 5);
      text(`BEST ${session.best}`, bestX + (hasSessionBest ? 13 : -1), centerY, 8, isWinner ? colors.ink : colors.cream, 'left', 900);
    }
    ctx.restore();
  });

  const actionGap = 8;
  const actionW = Math.min(158, (innerWidth - 32 - actionGap * 2) / 3);
  const actionStart = innerWidth / 2 - (actionW * 3 + actionGap * 2) / 2;
  if (state.you?.id === state.hostId) {
    button('Rematch', actionStart, actionY, actionW, 48, () => send('start'));
  } else {
    button('Waiting for host', actionStart, actionY, actionW, 48, () => {}, false);
  }
  button('Share result', actionStart + actionW + actionGap, actionY, actionW, 48, shareResults);
  button('Arcade', actionStart + (actionW + actionGap) * 2, actionY, actionW, 48, () => { leaveTarget = 'arcade'; leavePrompt = true; }, true, 'secondary');
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
  button('Stay', x + 16, y + 132, buttonW, 48, () => { leavePrompt = false; }, true, 'secondary');
  button(leaveTarget === 'arcade' ? 'To arcade' : 'Leave', x + 30 + buttonW, y + 132, buttonW, 48, leaveRoom, true, 'danger');
}

function drawRemovePrompt() {
  if (!removePromptPlayer) return;
  hitAreas.push({ x: 0, y: 0, w: innerWidth, h: innerHeight, onClick: () => {} });
  ctx.fillStyle = 'rgba(0,0,0,.72)';
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  const w = Math.min(360, innerWidth - 32);
  const h = 210;
  const x = (innerWidth - w) / 2;
  const y = (innerHeight - h) / 2;
  roundedRect(x, y, w, h, 14, '#211b19', colors.line, 1.5);
  text(removePromptPlayer.isBot ? 'REMOVE THIS BOT?' : 'REMOVE THIS PLAYER?', innerWidth / 2, y + 46, 20, colors.cream, 'center', 900);
  text(removePromptPlayer.name, innerWidth / 2, y + 80, 14, colors.muted, 'center', 800);
  const buttonW = (w - 46) / 2;
  button('Cancel', x + 16, y + 132, buttonW, 48, () => { removePromptPlayer = null; }, true, 'secondary');
  button('Remove', x + 30 + buttonW, y + 132, buttonW, 48, () => {
    const playerId = removePromptPlayer.id;
    removePromptPlayer = null;
    send('removePlayer', { playerId });
  }, true, 'danger');
}

function render() {
  hitAreas = [];
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  const glow = ctx.createRadialGradient(innerWidth * .72, innerHeight * .22, 0, innerWidth * .72, innerHeight * .22, Math.max(innerWidth, innerHeight) * .7);
  glow.addColorStop(0, 'rgba(116,43,34,.17)'); glow.addColorStop(.46, 'rgba(69,38,29,.07)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
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
  if (removePromptPlayer && state.phase === 'lobby') drawRemovePrompt();
  if (leavePrompt && state.phase !== 'join') drawLeavePrompt();
}

function pointer(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * innerWidth / rect.width;
  const y = (event.clientY - rect.top) * innerHeight / rect.height;
  [...hitAreas].reverse().find((area) => x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h)?.onClick();
}

canvas.addEventListener('pointerup', pointer);
canvas.addEventListener('pointermove', (event) => {
  const rect = canvas.getBoundingClientRect();
  pointerState.x = (event.clientX - rect.left) * innerWidth / rect.width;
  pointerState.y = (event.clientY - rect.top) * innerHeight / rect.height;
  canvas.style.cursor = hitAreas.some((area) => pointerState.x >= area.x && pointerState.x <= area.x + area.w && pointerState.y >= area.y && pointerState.y <= area.y + area.h) ? 'pointer' : 'default';
});
canvas.addEventListener('pointerdown', () => { pointerState.down = true; });
canvas.addEventListener('pointerleave', () => { pointerState = { x: -1, y: -1, down: false }; canvas.style.cursor = 'default'; });
window.addEventListener('pointerup', () => { pointerState.down = false; });
window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});
document.addEventListener('fullscreenchange', resize);

window.render_game_to_text = () => {
  const replay = resolutionSnapshot();
  const crowns = scoreCrowns(state.players, state.turn, state.phase);
  const finalRanking = state.phase === 'finished'
    ? [...state.players].sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).map((player, index, ranked) => ({
        playerId: player.id,
        name: player.name,
        score: player.score,
        rank: ranked.findIndex((candidate) => candidate.score === player.score) + 1,
        isYou: player.id === state.you?.id,
        sessionWins: player.session?.wins || 0,
        sessionBest: player.session?.best ?? null,
      }))
    : null;
  const sessionStandings = [...state.players]
    .sort((a, b) => (b.session?.wins || 0) - (a.session?.wins || 0) || (a.session?.best ?? Infinity) - (b.session?.best ?? Infinity))
    .map((player) => ({ id: player.id, name: player.name, ...player.session }));
  return JSON.stringify({
    coordinateSystem: 'Canvas origin top-left; x increases right, y increases down.',
    phase: state.phase,
    turn: state.turn,
    you: state.you,
    players: state.players,
    competitiveCrowns: state.players.filter((player) => crowns.has(player.id)).map((player) => ({ playerId: player.id, rank: crowns.get(player.id), score: player.score })),
    session: { gameNumber: state.gameNumber || 0, standings: sessionStandings },
    finalResults: finalRanking,
    rows: (replay?.rows || state.rows).map((cards) => ({ cards, points: cards.reduce((sum, card) => sum + points(card), 0) })),
    rowChoice: state.rowChoice,
    resolution: replay ? { completed: replay.completed, total: resolutionReplay.events.length, active: replay.active, progress: replay.progress, done: replay.done } : null,
    navigation: { canReturnToArcade: true, leavePrompt, leaveTarget },
    lobbyManagement: state.phase === 'lobby' ? { canManage: state.you?.id === state.hostId, removablePlayerIds: state.players.filter((player) => player.id !== state.hostId).map((player) => player.id), pendingRemovalId: removePromptPlayer?.id || null } : null,
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
