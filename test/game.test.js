const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { cardPoints, chooseRow, resolveSelections, placeCard, selectForDisconnectedPlayers, createGame, startGame } = require('../server');

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
