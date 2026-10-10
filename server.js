const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const MAX_PLAYERS = 8;
const HAND_SIZE = 10;
const RESOLUTION_STEP_MS = 850;
const ROUND_READING_PAUSE_MS = 1500;
let roundAdvanceTimer;

function cardPoints(value) {
  if (value === 55) return 7;
  if (value % 11 === 0) return 5;
  if (value % 10 === 0) return 3;
  if (value % 5 === 0) return 2;
  return 1;
}

function createSessionStats() {
  return { games: 0, wins: 0, best: null, total: 0, streak: 0, bestStreak: 0, lastAchievement: '' };
}

function ensureSessionStats(player) {
  if (!player.session) player.session = createSessionStats();
  return player.session;
}

function shuffle(values, random = Math.random) {
  const cards = [...values];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function chooseRow(rows, card) {
  let choice = -1;
  let gap = Infinity;
  rows.forEach((row, index) => {
    const end = row[row.length - 1];
    if (end > card && end - card < gap) {
      choice = index;
      gap = end - card;
    }
  });
  if (choice >= 0) return choice;
  return rows.reduce((best, row, index) => {
    const points = row.reduce((sum, value) => sum + cardPoints(value), 0);
    return points < best.points ? { index, points } : best;
  }, { index: 0, points: Infinity }).index;
}

function chooseBotCard(hand, rows) {
  return hand.reduce((best, card) => {
    const row = rows[chooseRow(rows, card)];
    const end = row[row.length - 1];
    const takesRow = card > Math.max(...rows.map((candidate) => candidate[candidate.length - 1])) || row.length === 5;
    const points = takesRow ? row.reduce((sum, value) => sum + cardPoints(value), 0) : 0;
    // A narrow gap is harder for another player's higher card to disrupt.
    const risk = takesRow ? 0 : (end - card) * 0.5 + row.length * 1.5;
    const score = points * 12 + risk - card * 0.3;
    return score < best.score ? { card, score } : best;
  }, { card: hand[0], score: Infinity }).card;
}

function resolveSelections(game) {
  if (!game.resolving) {
    game.resolving = true;
    game.resolutionQueue = game.players
      .map((player) => ({ playerId: player.id, card: player.selected }))
      .sort((a, b) => b.card - a.card);
    game.lastEvents = [];
  }
  while (game.resolutionQueue.length) {
    const play = game.resolutionQueue[0];
    const player = game.players.find((candidate) => candidate.id === play.playerId);
    const isOversizedCard = play.card > Math.max(...game.rows.map((row) => row[row.length - 1]));
    if (isOversizedCard) {
      const connected = player.ws && player.ws.readyState === WebSocket.OPEN;
      if (!player.isBot && connected) {
        game.pendingChoice = { playerId: player.id, name: player.name, card: play.card };
        return false;
      }
    }
    game.resolutionQueue.shift();
    placeCard(game, player, play.card, chooseRow(game.rows, play.card), isOversizedCard);
  }
  game.turn += 1;
  game.phase = game.turn >= HAND_SIZE ? 'finished' : 'roundEnd';
  game.resolving = false;
  if (game.phase === 'finished') recordSessionGame(game);
  if (game.phase === 'roundEnd') scheduleNextRound(game);
  return true;
}

function recordSessionGame(game) {
  if (game.recordedGame === game.gameNumber) return;
  const winningScore = Math.min(...game.players.map((player) => player.score));
  for (const player of game.players) {
    const session = ensureSessionStats(player);
    const previousBest = session.best;
    const winner = player.score === winningScore;
    session.games += 1;
    session.total += player.score;
    session.best = previousBest === null ? player.score : Math.min(previousBest, player.score);
    session.wins += winner ? 1 : 0;
    session.streak = winner ? session.streak + 1 : 0;
    session.bestStreak = Math.max(session.bestStreak, session.streak);
    if (winner && player.score === 0) session.lastAchievement = 'FLAWLESS WIN';
    else if (winner && session.streak >= 2) session.lastAchievement = `${session.streak}-WIN STREAK`;
    else if (winner) session.lastAchievement = 'TABLE WIN';
    else if (previousBest !== null && player.score < previousBest) session.lastAchievement = 'PERSONAL BEST';
    else session.lastAchievement = '';
  }
  game.recordedGame = game.gameNumber;
}

function placeCard(game, player, card, rowIndex, takeRow = false) {
  const row = game.rows[rowIndex];
  let taken = [];
  if (takeRow || row.length === 5) {
    taken = [...row];
    game.rows[rowIndex] = [card];
  } else {
    row.push(card);
  }
  const points = taken.reduce((sum, value) => sum + cardPoints(value), 0);
  player.score += points;
  player.hand = player.hand.filter((value) => value !== card);
  game.lastEvents.push({ playerId: player.id, name: player.name, card, row: rowIndex, taken, points });
  player.selected = null;
  player.locked = false;
}

function selectForDisconnectedPlayers(game) {
  if (game.phase !== 'playing') return;
  for (const player of game.players) {
    const connected = player.ws && player.ws.readyState === WebSocket.OPEN;
    if ((player.isBot || !connected) && !player.locked && player.hand.length) {
      player.selected = player.isBot ? chooseBotCard(player.hand, game.rows) : player.hand[0];
      player.locked = true;
    }
  }
}

function createGame() {
  return { phase: 'lobby', turn: 0, gameNumber: 0, recordedGame: 0, players: [], rows: [], lastEvents: [], resolving: false, resolutionQueue: [], pendingChoice: null, hostId: null };
}

function startGame(game, random = Math.random) {
  clearTimeout(roundAdvanceTimer);
  const deck = shuffle(Array.from({ length: 104 }, (_, i) => i + 1), random);
  game.turn = 0;
  game.gameNumber += 1;
  game.phase = 'playing';
  game.lastEvents = [];
  game.resolutionQueue = [];
  game.pendingChoice = null;
  game.resolving = false;
  for (const player of game.players) {
    player.hand = deck.splice(0, HAND_SIZE).sort((a, b) => a - b);
    player.score = 0;
    player.selected = null;
    player.locked = false;
  }
  game.rows = deck.splice(0, 4).map((card) => [card]);
}

const game = createGame();
let nextId = 1;

function publicState(game, viewer) {
  return {
    phase: game.phase,
    turn: game.turn,
    maxTurns: HAND_SIZE,
    hostId: game.hostId,
    you: viewer ? { id: viewer.id, name: viewer.name, hand: viewer.hand, selected: viewer.selected, locked: Boolean(viewer.locked), score: viewer.score } : null,
    gameNumber: game.gameNumber,
    players: game.players.map((p) => {
      const session = ensureSessionStats(p);
      return { id: p.id, name: p.name, score: p.score, connected: p.isBot || Boolean(p.ws && p.ws.readyState === WebSocket.OPEN), ready: Boolean(p.locked), cards: p.hand.length, isBot: Boolean(p.isBot), left: Boolean(p.left), session: { ...session, average: session.games ? Math.round(session.total / session.games) : null } };
    }),
    rows: game.rows,
    rowChoice: game.pendingChoice ? { ...game.pendingChoice, mine: game.pendingChoice.playerId === viewer?.id } : null,
    lastEvents: game.lastEvents,
  };
}

function send(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(game) {
  for (const player of game.players) send(player.ws, { type: 'state', state: publicState(game, player) });
}

function scheduleNextRound(game) {
  clearTimeout(roundAdvanceTimer);
  const completedTurn = game.turn;
  const delay = game.lastEvents.length * RESOLUTION_STEP_MS + ROUND_READING_PAUSE_MS;
  roundAdvanceTimer = setTimeout(() => {
    if (game.phase !== 'roundEnd' || game.turn !== completedTurn) return;
    game.phase = 'playing';
    broadcast(game);
  }, delay);
  roundAdvanceTimer.unref?.();
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 18);
}

function handleMessage(ws, raw) {
  let message;
  try { message = JSON.parse(raw); } catch { return send(ws, { type: 'error', message: 'Invalid message.' }); }

  if (message.type === 'join') {
    const token = String(message.token || '');
    let player = game.players.find((p) => p.token === token && token);
    if (!player) {
      if (game.phase !== 'lobby') return send(ws, { type: 'error', message: 'A game is already in progress.' });
      if (game.players.length >= MAX_PLAYERS) return send(ws, { type: 'error', message: 'This table is full.' });
      const name = cleanName(message.name);
      if (!name) return send(ws, { type: 'error', message: 'Enter a name first.' });
      const id = String(nextId++);
      player = { id, token: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, name, hand: [], score: 0, selected: null, locked: false, ws, session: createSessionStats() };
      game.players.push(player);
      if (!game.hostId) game.hostId = id;
    } else {
      player.ws = ws;
      if (game.phase === 'lobby') player.name = cleanName(message.name) || player.name;
    }
    ws.playerId = player.id;
    send(ws, { type: 'joined', token: player.token });
    return broadcast(game);
  }

  const player = game.players.find((p) => p.id === ws.playerId);
  if (!player) return send(ws, { type: 'error', message: 'Join the table first.' });
  if (message.type === 'start') {
    if (player.id !== game.hostId) return send(ws, { type: 'error', message: 'Only the host can start.' });
    if (game.players.length < 2) return send(ws, { type: 'error', message: 'At least 2 players are needed.' });
    if (game.phase !== 'lobby' && game.phase !== 'finished') return;
    startGame(game);
    return broadcast(game);
  }
  if (message.type === 'addBot') {
    if (player.id !== game.hostId) return send(ws, { type: 'error', message: 'Only the host can add bots.' });
    if (game.phase !== 'lobby') return;
    if (game.players.length >= MAX_PLAYERS) return send(ws, { type: 'error', message: 'This table is full.' });
    const botNumber = game.players.filter((candidate) => candidate.isBot).length + 1;
    game.players.push({ id: String(nextId++), token: '', name: `Bot ${botNumber}`, hand: [], score: 0, selected: null, locked: false, ws: null, isBot: true, session: createSessionStats() });
    return broadcast(game);
  }
  if (message.type === 'removePlayer') {
    if (player.id !== game.hostId) return send(ws, { type: 'error', message: 'Only the host can remove players.' });
    if (game.phase !== 'lobby') return send(ws, { type: 'error', message: 'Players can only be removed before the game starts.' });
    const target = game.players.find((candidate) => candidate.id === String(message.playerId));
    if (!target || target.id === game.hostId) return send(ws, { type: 'error', message: 'That seat cannot be removed.' });
    game.players = game.players.filter((candidate) => candidate !== target);
    target.token = '';
    if (target.ws) {
      target.ws.playerId = null;
      send(target.ws, { type: 'kicked', message: 'The host removed you from the lobby.' });
    }
    return broadcast(game);
  }
  if (message.type === 'nextRound') {
    if (player.id !== game.hostId) return send(ws, { type: 'error', message: 'Only the host can start the next round.' });
    if (game.phase !== 'roundEnd') return;
    clearTimeout(roundAdvanceTimer);
    game.phase = 'playing';
    return broadcast(game);
  }
  if (message.type === 'select') {
    if (game.phase !== 'playing' || game.resolutionQueue.length || game.pendingChoice) return;
    const card = Number(message.card);
    if (player.locked || !player.hand.includes(card)) return send(ws, { type: 'error', message: 'That card cannot be selected.' });
    player.selected = player.selected === card ? null : card;
    return broadcast(game);
  }
  if (message.type === 'confirm') {
    if (game.phase !== 'playing' || player.locked || game.resolutionQueue.length || game.pendingChoice) return;
    if (player.selected === null) return send(ws, { type: 'error', message: 'Choose a card first.' });
    player.locked = true;
    selectForDisconnectedPlayers(game);
    if (game.players.every((p) => p.locked)) resolveSelections(game);
    return broadcast(game);
  }
  if (message.type === 'chooseRow') {
    if (!game.pendingChoice || game.pendingChoice.playerId !== player.id) return send(ws, { type: 'error', message: 'It is not your row choice.' });
    const rowIndex = Number(message.row);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= game.rows.length) return send(ws, { type: 'error', message: 'Choose a valid row.' });
    const play = game.resolutionQueue.shift();
    placeCard(game, player, play.card, rowIndex, true);
    game.pendingChoice = null;
    resolveSelections(game);
    return broadcast(game);
  }
  if (message.type === 'leave') {
    send(ws, { type: 'left' });
    if (game.phase === 'lobby') {
      game.players = game.players.filter((candidate) => candidate !== player);
    } else {
      player.left = true;
      player.token = '';
      player.ws = null;
      if (game.pendingChoice?.playerId === player.id) {
        const play = game.resolutionQueue.shift();
        placeCard(game, player, play.card, chooseRow(game.rows, play.card), true);
        game.pendingChoice = null;
        resolveSelections(game);
      }
      selectForDisconnectedPlayers(game);
      if (!game.resolving && game.players.every((candidate) => candidate.locked)) resolveSelections(game);
    }
    const humans = game.players.filter((candidate) => !candidate.isBot && !candidate.left);
    if (!humans.length) {
      Object.assign(game, createGame());
    } else {
      if (game.hostId === player.id) game.hostId = humans[0].id;
      broadcast(game);
    }
    ws.playerId = null;
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const publicDir = path.join(__dirname, 'public');
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(publicDir, relative);
  if (!file.startsWith(publicDir + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.on('message', (raw) => handleMessage(ws, raw.toString()));
  ws.on('close', () => {
    const player = game.players.find((candidate) => candidate.id === ws.playerId && candidate.ws === ws);
    if (!player) return;
    if (game.phase === 'lobby') {
      const connectedHumans = game.players.filter((candidate) => !candidate.isBot && candidate.ws?.readyState === WebSocket.OPEN);
      if (game.hostId === player.id && connectedHumans.length) game.hostId = connectedHumans[0].id;
    } else if (game.phase === 'playing') {
      if (game.pendingChoice?.playerId === player.id) {
        const play = game.resolutionQueue.shift();
        placeCard(game, player, play.card, chooseRow(game.rows, play.card), true);
        game.pendingChoice = null;
        resolveSelections(game);
      }
      selectForDisconnectedPlayers(game);
      if (!game.resolutionQueue.length && !game.pendingChoice && game.players.every((candidate) => candidate.locked)) resolveSelections(game);
    }
    if ((game.phase === 'roundEnd' || game.phase === 'finished') && game.hostId === player.id) {
      const connectedHuman = game.players.find((candidate) => !candidate.isBot && !candidate.left && candidate.ws?.readyState === WebSocket.OPEN);
      if (connectedHuman) game.hostId = connectedHuman.id;
    }
    broadcast(game);
  });
});

function localAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((info) => info && info.family === 'IPv4' && !info.internal).map((info) => `http://${info.address}:${PORT}`);
}

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`StackUp is ready at http://localhost:${PORT}`);
    for (const address of localAddresses()) console.log(`Wi-Fi: ${address}`);
  });
}

module.exports = { cardPoints, chooseRow, chooseBotCard, resolveSelections, placeCard, selectForDisconnectedPlayers, createGame, startGame, recordSessionGame, server };
