const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { WebSocket } = require('ws');
const path = require('node:path');

function waitFor(stream, text) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${text}`)), 5000);
    stream.on('data', (chunk) => {
      if (chunk.toString().includes(text)) { clearTimeout(timer); resolve(); }
    });
  });
}

function makeClient(name, port = 8099, autoChoose = true) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = [];
  const waiting = [];
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    messages.push(message);
    for (const waiter of [...waiting]) {
      if (waiter.match(message)) { waiting.splice(waiting.indexOf(waiter), 1); waiter.resolve(message); }
    }
    if (autoChoose && message.type === 'state' && message.state.rowChoice?.mine) {
      ws.send(JSON.stringify({ type: 'chooseRow', row: 0 }));
    }
  });
  const next = (match) => new Promise((resolve, reject) => {
    const found = messages.find(match);
    if (found) return resolve(found);
    const waiter = { match, resolve };
    waiting.push(waiter);
    setTimeout(() => { const index = waiting.indexOf(waiter); if (index >= 0) waiting.splice(index, 1); reject(new Error(`${name} timed out`)); }, 5000);
  });
  const nextFresh = (match) => new Promise((resolve, reject) => {
    const waiter = { match, resolve };
    waiting.push(waiter);
    setTimeout(() => { const index = waiting.indexOf(waiter); if (index >= 0) waiting.splice(index, 1); reject(new Error(`${name} timed out waiting for a fresh message`)); }, 5000);
  });
  return { ws, next, nextFresh };
}

test('two clients can join and finish all ten simultaneous turns', { timeout: 15000 }, async (t) => {
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '8099' } });
  t.after(() => child.kill());
  await waitFor(child.stdout, 'ready');
  const a = makeClient('Ada');
  let b = makeClient('Ben');
  t.after(() => { a.ws.close(); b.ws.close(); });
  await Promise.all([
    new Promise((resolve) => a.ws.once('open', resolve)),
    new Promise((resolve) => b.ws.once('open', resolve)),
  ]);
  a.ws.send(JSON.stringify({ type: 'join', name: 'Ada' }));
  b.ws.send(JSON.stringify({ type: 'join', name: 'Ben' }));
  const joinedB = await b.next((m) => m.type === 'joined');
  await Promise.all([a.next((m) => m.type === 'state' && m.state.players.length === 2), b.next((m) => m.type === 'state' && m.state.players.length === 2)]);
  a.ws.send(JSON.stringify({ type: 'start' }));
  let stateA = (await a.next((m) => m.type === 'state' && m.state.phase === 'playing')).state;
  let stateB = (await b.next((m) => m.type === 'state' && m.state.phase === 'playing')).state;
  const testCard = stateA.you.hand[0];
  const selectedUpdate = a.nextFresh((m) => m.type === 'state' && m.state.you?.selected === testCard && !m.state.you.locked);
  a.ws.send(JSON.stringify({ type: 'select', card: testCard }));
  await selectedUpdate;
  const deselectedUpdate = a.nextFresh((m) => m.type === 'state' && m.state.you?.selected === null && !m.state.you.locked);
  a.ws.send(JSON.stringify({ type: 'select', card: testCard }));
  await deselectedUpdate;
  for (let turn = 0; turn < 10; turn++) {
    if (turn === 0) {
      b.ws.close();
      a.ws.send(JSON.stringify({ type: 'select', card: stateA.you.hand[0] }));
      a.ws.send(JSON.stringify({ type: 'confirm' }));
      stateA = (await a.next((m) => m.type === 'state' && m.state.turn === 1 && m.state.phase === 'roundEnd')).state;
      b = makeClient('Ben');
      await new Promise((resolve) => b.ws.once('open', resolve));
      b.ws.send(JSON.stringify({ type: 'join', name: 'Ben', token: joinedB.token }));
      stateB = (await b.next((m) => m.type === 'state' && m.state.turn === 1 && m.state.phase === 'roundEnd')).state;
      [stateA, stateB] = await Promise.all([
        a.next((m) => m.type === 'state' && m.state.turn === 1 && m.state.phase === 'playing').then((m) => m.state),
        b.next((m) => m.type === 'state' && m.state.turn === 1 && m.state.phase === 'playing').then((m) => m.state),
      ]);
      continue;
    }
    a.ws.send(JSON.stringify({ type: 'select', card: stateA.you.hand[0] }));
    b.ws.send(JSON.stringify({ type: 'select', card: stateB.you.hand[0] }));
    a.ws.send(JSON.stringify({ type: 'confirm' }));
    b.ws.send(JSON.stringify({ type: 'confirm' }));
    const expectedPhase = turn === 9 ? 'finished' : 'roundEnd';
    const expectedTurn = turn + 1;
    [stateA, stateB] = await Promise.all([
      a.next((m) => m.type === 'state' && m.state.turn === expectedTurn && m.state.phase === expectedPhase).then((m) => m.state),
      b.next((m) => m.type === 'state' && m.state.turn === expectedTurn && m.state.phase === expectedPhase).then((m) => m.state),
    ]);
    if (turn < 9) {
      a.ws.send(JSON.stringify({ type: 'nextRound' }));
      [stateA, stateB] = await Promise.all([
        a.next((m) => m.type === 'state' && m.state.turn === expectedTurn && m.state.phase === 'playing').then((m) => m.state),
        b.next((m) => m.type === 'state' && m.state.turn === expectedTurn && m.state.phase === 'playing').then((m) => m.state),
      ]);
    }
  }
  assert.equal(stateA.phase, 'finished');
  assert.equal(stateA.you.hand.length, 0);
  assert.equal(stateB.you.hand.length, 0);
  assert.equal(stateA.players.length, 2);
  assert.equal(stateA.gameNumber, 1);
  assert.equal(stateA.players.every((player) => player.session.games === 1), true);
  assert.equal(stateA.players.some((player) => player.session.wins === 1), true);
  assert.equal(stateA.players.every((player) => typeof player.session.lastAchievement === 'string'), true);
});

test('table caps at eight players and explicitly leaving frees the seat', { timeout: 15000 }, async (t) => {
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '8100' } });
  t.after(() => child.kill());
  await waitFor(child.stdout, 'ready');
  const clients = Array.from({ length: 9 }, (_, index) => makeClient(`P${index + 1}`, 8100));
  t.after(() => clients.forEach((client) => client.ws.close()));
  await Promise.all(clients.map((client) => new Promise((resolve) => client.ws.once('open', resolve))));
  for (let index = 0; index < 8; index++) clients[index].ws.send(JSON.stringify({ type: 'join', name: `P${index + 1}` }));
  await clients[0].next((m) => m.type === 'state' && m.state.players.length === 8);
  clients[8].ws.send(JSON.stringify({ type: 'join', name: 'P9' }));
  const rejection = await clients[8].next((m) => m.type === 'error');
  assert.equal(rejection.message, 'This table is full.');
  const departure = clients[0].nextFresh((m) => m.type === 'state' && m.state.players.length === 7);
  const left = clients[7].nextFresh((m) => m.type === 'left');
  clients[7].ws.send(JSON.stringify({ type: 'leave' }));
  await left;
  await departure;
  clients[8].ws.send(JSON.stringify({ type: 'join', name: 'P9' }));
  const admitted = await clients[8].next((m) => m.type === 'state' && m.state.players.length === 8);
  assert.equal(admitted.state.players.some((player) => player.name === 'P9'), true);
});

test('a disconnected lobby player can reclaim their reserved seat', { timeout: 15000 }, async (t) => {
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '8101' } });
  t.after(() => child.kill());
  await waitFor(child.stdout, 'ready');
  let player = makeClient('Returner', 8101);
  t.after(() => player.ws.close());
  await new Promise((resolve) => player.ws.once('open', resolve));
  player.ws.send(JSON.stringify({ type: 'join', name: 'Returner' }));
  const joined = await player.next((m) => m.type === 'joined');
  const original = await player.next((m) => m.type === 'state' && m.state.players.length === 1);
  player.ws.close();
  player = makeClient('Returner', 8101);
  await new Promise((resolve) => player.ws.once('open', resolve));
  player.ws.send(JSON.stringify({ type: 'join', name: 'Returner', token: joined.token }));
  const restored = await player.next((m) => m.type === 'state' && m.state.players.length === 1 && m.state.you?.id === original.state.you.id);
  assert.equal(restored.state.you.name, 'Returner');
});

test('only the host can remove bots or guests from the lobby', { timeout: 15000 }, async (t) => {
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '8102' } });
  t.after(() => child.kill());
  await waitFor(child.stdout, 'ready');
  const host = makeClient('Host', 8102);
  const guest = makeClient('Guest', 8102);
  t.after(() => { host.ws.close(); guest.ws.close(); });
  await Promise.all([
    new Promise((resolve) => host.ws.once('open', resolve)),
    new Promise((resolve) => guest.ws.once('open', resolve)),
  ]);
  host.ws.send(JSON.stringify({ type: 'join', name: 'Host' }));
  guest.ws.send(JSON.stringify({ type: 'join', name: 'Guest' }));
  const joinedGuest = await guest.next((message) => message.type === 'joined');
  const lobby = await host.next((message) => message.type === 'state' && message.state.players.length === 2);
  const guestId = lobby.state.players.find((player) => player.name === 'Guest').id;

  host.ws.send(JSON.stringify({ type: 'addBot' }));
  const withBot = await host.nextFresh((message) => message.type === 'state' && message.state.players.some((player) => player.isBot));
  const botId = withBot.state.players.find((player) => player.isBot).id;
  guest.ws.send(JSON.stringify({ type: 'removePlayer', playerId: botId }));
  const denied = await guest.nextFresh((message) => message.type === 'error');
  assert.equal(denied.message, 'Only the host can remove players.');

  host.ws.send(JSON.stringify({ type: 'removePlayer', playerId: botId }));
  await host.nextFresh((message) => message.type === 'state' && message.state.players.length === 2 && !message.state.players.some((player) => player.isBot));
  const kicked = guest.nextFresh((message) => message.type === 'kicked');
  host.ws.send(JSON.stringify({ type: 'removePlayer', playerId: guestId }));
  assert.equal((await kicked).message, 'The host removed you from the lobby.');
  await host.nextFresh((message) => message.type === 'state' && message.state.players.length === 1);

  const rejoinedState = guest.nextFresh((message) => message.type === 'state' && message.state.players.length === 2);
  guest.ws.send(JSON.stringify({ type: 'join', name: 'Guest', token: joinedGuest.token }));
  const rejoined = await rejoinedState;
  assert.notEqual(rejoined.state.you.id, guestId);
});
