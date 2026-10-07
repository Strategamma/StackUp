# StackUp

Browser-based local-Wi-Fi card game for 2–8 players, inspired by simultaneous-selection row-building games.

## Stack

- Node.js HTTP server with `ws` WebSockets
- Vanilla HTML/CSS/JavaScript client rendered primarily on one canvas
- Installable PWA shell with standalone display, cached assets, and Android/iOS home-screen metadata
- One server-authoritative local-network table with deck, rounds, row placement, scores, and reconnect state

## Game rules

- Each player receives 10 unique numbered cards from a 1–104 deck.
- Four stacks begin with one card each.
- Players choose simultaneously; selected cards resolve from highest to lowest to preserve descending stack order.
- Rows descend: a card joins the stack whose final card is the closest larger value, like placing a smaller plate on a larger plate.
- A card larger than every stack end requires that player to choose and collect any stack before the card starts its replacement.
- Adding a sixth card makes that player collect the prior five cards as penalty points, then their card starts the replacement stack.
- After 10 turns, the lowest penalty score wins.

## Conventions

- Keep rules and validation authoritative in `server.js`; clients only send intents.
- `public/game.js` exposes `render_game_to_text()` and `advanceTime(ms)` for deterministic QA.
- Reconnect identity is stored in browser local storage.
- Players leaving before a game free their seat and transfer host status; disconnected players auto-play their lowest remaining card so an active game cannot deadlock.
- A host can fill empty seats with simple bots, allowing immediate solo play and mixed human/bot tables.
- Browser tokens reclaim a player's reserved seat after lobby or gameplay disconnects; explicit Exit permanently releases it.
- Turn input is two-step: players may select, switch, or deselect a card until pressing **Lock in**; only locked choices count as ready.
- Resolution pauses when a card is above all four row endings, allowing that player to choose any row to collect; bots/disconnected players choose the lowest-penalty row automatically.
- Every turn ends on a score summary; the host advances to the next round, and all player scores stay visible during selection.
- The PWA is a client and still requires the central Node/WebSocket server; mobile browsers cannot host the LAN game themselves.
- Clients retain the pre-resolution rows and replay the server event log highest-to-lowest; this is presentation only and never changes authoritative state.
