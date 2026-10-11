const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocket } = require('ws');
const { cardPoints, chooseRow, chooseBotCard, resolveSelections, placeCard, selectForDisconnectedPlayers, createGame, startGame, recordSessionGame } = require('../server');

test('joining never asks a player for a network address', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const client = fs.readFileSync(path.join(__dirname, '../public/game.js'), 'utf8');
  assert.match(html, /id="join-form"/);
  assert.doesNotMatch(html, /lan-address|HOST'S WI-FI ADDRESS|Open LAN table/i);
  assert.doesNotMatch(client, /chooseTable|lanAddress|tableMode/);
  assert.match(client, /fetch\('\/api\/lan-addresses'\)/);
});

test('final scores separate current results, session awards, and rematch state', () => {
  const client = fs.readFileSync(path.join(__dirname, '../public/game.js'), 'utf8');
  assert.match(client, /THIS GAME/);
  assert.match(client, /SESSION/);
  assert.match(client, /YOU PLACED/);
  assert.match(client, /Waiting for host/);
  assert.match(client, /finalResults: finalRanking/);
  assert.match(client, /function drawVictoryBurst/);
  assert.match(client, /function shareResults/);
  assert.match(client, /Share result/);
  assert.match(client, /SESSION SCOREBOARD/);
  assert.match(client, /SESSION RECORD/);
  assert.match(client, /More games/);
  assert.match(client, /tone === 'share'/);
  assert.doesNotMatch(client, /\$\{player\.score\} NOW/);
});

test('penalty points follow the deck markings', () => {
  assert.equal(cardPoints(55), 7);
  assert.equal(cardPoints(22), 5);
  assert.equal(cardPoints(40), 3);
  assert.equal(cardPoints(25), 2);
  assert.equal(cardPoints(7), 1);
});

test('a card joins the nearest larger row ending', () => {
  assert.equal(chooseRow([[10], [20], [30], [40]], 37), 3);
});

test('an oversized card defaults to the lowest-penalty row', () => {
  assert.equal(chooseRow([[55], [11], [7], [20]], 101), 2);
});

test('sixth card takes the prior five and scores them', () => {
  const game = createGame();
  game.phase = 'playing';
  game.rows = [[10, 9, 8, 7, 6], [20], [40], [60]];
  game.players = [{ id: '1', name: 'A', hand: [5], score: 0, selected: 5 }];
  resolveSelections(game);
  assert.deepEqual(game.rows[0], [5]);
  assert.equal(game.players[0].score, 7);
});

test('start deals unique cards and four row starters', () => {
  const game = createGame();
  game.players = Array.from({ length: 8 }, (_, i) => ({ id: String(i), hand: [] }));
  startGame(game, () => 0.42);
  const all = [...game.players.flatMap((p) => p.hand), ...game.rows.flat()];
  assert.equal(all.length, 84);
  assert.equal(new Set(all).size, 84);
});

test('disconnected players automatically choose their lowest card', () => {
  const game = createGame();
  game.phase = 'playing';
  game.players = [
    { hand: [9, 20], selected: null, ws: { readyState: WebSocket.CLOSED } },
    { hand: [7, 30], selected: null, ws: { readyState: WebSocket.OPEN } },
  ];
  selectForDisconnectedPlayers(game);
  assert.equal(game.players[0].selected, 9);
  assert.equal(game.players[0].locked, true);
  assert.equal(game.players[1].selected, null);
});

test('bots favor a tight safe placement over a lower exposed card', () => {
  assert.equal(chooseBotCard([13, 64], [[20], [65], [80], [90]]), 64);
});

test('bots can shed 104 when taking a cheap row', () => {
  assert.equal(chooseBotCard([13, 104], [[20], [45], [70], [90]]), 104);
});

test('bots play 103 beneath 104 without taking a row', () => {
  assert.equal(chooseBotCard([13, 103], [[20], [45], [70], [104]]), 103);
});

test('bots avoid collecting an expensive full row', () => {
  assert.equal(chooseBotCard([64, 103], [[65, 55, 44, 33, 22], [90], [100], [104]]), 103);
});

test('an oversized card pauses resolution until its player chooses a row', () => {
  const game = createGame();
  const player = { id: '1', name: 'A', hand: [97], score: 0, selected: 97, locked: true, ws: { readyState: WebSocket.OPEN } };
  game.phase = 'playing';
  game.players = [player];
  game.rows = [[10], [20], [25, 30], [85]];
  assert.equal(resolveSelections(game), false);
  assert.equal(game.pendingChoice.playerId, '1');
  const play = game.resolutionQueue.shift();
  placeCard(game, player, play.card, 2, true);
  game.pendingChoice = null;
  assert.equal(resolveSelections(game), true);
  assert.deepEqual(game.rows[2], [97]);
  assert.equal(player.score, 5);
});

test('session records wins, best scores, streaks, and each game only once', () => {
  const game = createGame();
  game.gameNumber = 1;
  game.players = [
    { name: 'A', score: 0 },
    { name: 'B', score: 8 },
  ];
  recordSessionGame(game);
  recordSessionGame(game);
  assert.deepEqual(game.players[0].session, { games: 1, wins: 1, best: 0, total: 0, streak: 1, bestStreak: 1, lastAchievement: 'FLAWLESS WIN' });
  assert.equal(game.players[1].session.lastAchievement, '');

  game.gameNumber = 2;
  game.players[0].score = 3;
  game.players[1].score = 7;
  recordSessionGame(game);
  assert.equal(game.players[0].session.wins, 2);
  assert.equal(game.players[0].session.streak, 2);
  assert.equal(game.players[0].session.lastAchievement, '2-WIN STREAK');
  assert.equal(game.players[1].session.games, 2);
  assert.equal(game.players[1].session.best, 7);
  assert.equal(game.players[1].session.lastAchievement, 'PERSONAL BEST');
});
