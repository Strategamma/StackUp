# StackUp

Browser card game for 2–8 players sharing one server-authoritative table.

## Architecture

- Node.js HTTP server with `ws`; vanilla HTML/CSS/JavaScript client drawn primarily on one canvas.
- Installable PWA with cached shell, reconnect identity in local storage, and Android/iOS metadata. It remains a client and cannot host the game.
- Production: `https://stackup-i88f.onrender.com`; canonical table: `https://stackup.decadenceinc.com`. Each server origin has its own table and reconnect identity.
- Rules and validation belong in `server.js`; clients send intents and replay authoritative event logs for presentation only.
- `public/game.js` exposes `render_game_to_text()` and `advanceTime(ms)` for deterministic QA.

## Rules

- Deal 10 unique cards per player from 1–104; seed four rows.
- Players select, change, or deselect a card, then **Lock in**. Locked cards resolve highest-to-lowest.
- Rows descend: cards join the closest larger row ending.
- A card above every ending makes that player choose and collect a row; bots/disconnected players choose the cheapest row.
- A sixth card collects the previous five as penalty points and starts a replacement row.
- After 10 turns, the lowest penalty score wins.

## Product conventions

- Joining is zero-config: the client automatically uses its opened origin. Hosted links connect online; a shared local-server link connects to that LAN table. When opened through localhost, invite sharing resolves a reachable Wi-Fi URL behind the scenes. Players never enter network addresses. Lobby leavers free their seat and transfer host status. Reconnect tokens reserve disconnected seats; confirmed Arcade departure releases them. Disconnected active players auto-play their lowest card.
- Hosts can add bots and remove non-host lobby seats. Bot selection weighs immediate penalty, gap, row length, and shedding high cards.
- The server automatically advances after each resolution animation/read pause.
- A table session persists across **Play again** while a human remains, tracking games, wins, best/average score, streaks, and achievements.
- From displayed round five, current lowest and second-lowest scores receive large/small animated crowns. The local player and score are emphasized. Final standings are tie-aware, identify the viewer and placement, separate current score from session records, show wins as crowns, and medal the session-best score; ties share awards. The match-complete screen adds victory effects, margin callouts, animated score reveal, result sharing, and a clear host-controlled rematch state.
- UI follows Decadence Arcade: near-black grid, cream/beige cards, amber actions, red depth/skulls, green status, dark panels, and reduced-motion equivalents. Six row slots remain visible; the sixth has a red X.
- The sole active leave control is **D Arcade**, with confirmation. Rows, guidance, actions, and hand use separate responsive bands.
- Browser/PWA identity uses the official `https://decadenceinc.com/assets/stackup-3d.webp` artwork and locally generated PNG sizes.
