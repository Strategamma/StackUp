Original prompt: Create an HTML game with upto 8 players join via local Wifi

Current request: Integrate StackUp with decadenceinc.com, add navigation in and out, premium animations, a winning animation, richer card animation, and a more intuitive join flow.

- Chosen original title: StackUp.
- Implementing a server-authoritative WebSocket game for 2–8 players.
- Implemented lobby/reconnect, host start/replay, private hands, ten turns, placement and penalties, responsive canvas UI.
- Unit tests pass. Headless browser binary installation succeeded, but macOS denied the browser subprocess; built-in browser access to localhost was also denied by user/browser policy.
- Final verification: 5 rule/deal tests and a two-client ten-turn integration test pass; server/client syntax checks and HTTP smoke check pass.
- TODO: visual screenshot QA remains blocked by macOS/browser permission. Manually inspect desktop and phone layouts when browser access is available.
- Continued resilience pass: lobby departures now free seats/transfer host; mid-game disconnects auto-play the lowest card to prevent deadlock.
- User screenshot showed unstyled direct-file loading. Asset URLs are now relative so styling still loads, and direct-file use shows a clear message to open the local server address.
- Repeated screenshot confirmed the viewer loads only the HTML document. Embedded the complete start-screen CSS in `index.html` so its presentation no longer depends on a separate stylesheet request.
- Added visible connection feedback and host-controlled bots so the game can be started and tested with one human device.
- Replaced the singleton lobby with isolated five-character rooms and added create/join room controls.
- Card choice is now reversible until a separate **Lock in** action; readiness and resolution use locked state rather than tentative selection.
- Low-card resolution now pauses for an interactive row choice; sixth-card row collection remains automatic.
- Replaced penalty dots with vector skulls and added reduced-motion-aware deal, selection, ready, row-choice, logo, and background animations.
- Reworked phone layouts: compact player labels, smaller table cards, slot indicators instead of empty cards, two-row hand grid, and condensed join screen.
- Added persistent Exit navigation, a leave confirmation modal, clean return-to-home state, lobby seat cleanup, and safe mid-game auto-play after explicit departure.
- Removed user-facing room codes in favor of one shared table, preserved disconnected lobby seats for token reconnects, exposed all scores, and added host-controlled round-summary transitions.
- Kept round transitions on the table instead of a separate summary page; centered Lock in/Next round actions and added the guest waiting toast.
- Corrected the core StackUp variant direction: rows now descend onto the closest larger ending, and oversized cards trigger the player-chosen stack penalty.
- Added PWA manifest, service worker, install prompt, home-screen metadata, and scalable app-icon source; deployment still requires HTTPS and the Node/WebSocket server.
- Began 9/10 polish pass with first-time rules onboarding, permanent help access, skull-value legend, and live card-destination/oversized guidance.
- Ten rule/multiplayer tests and client/service-worker syntax checks pass. Playwright visual capture remains unavailable because its browser executable is blocked/missing in this macOS environment.
- Added sequential resolution replay with animated card travel, target-row emphasis, staged score increments, skull bursts, exact penalty labels, final-round replay, and text-state exposure.
- Resolution changes pass all ten rule/multiplayer tests and syntax checks; the required Playwright run was attempted again but cannot launch because the local Chromium executable is unavailable.
- Added Decadence Arcade navigation, a clearer three-step join experience, invite-link sharing, premium card sheen/shadows, resolution trails and impact rings, animated winner ranking, crown/confetti celebration, and replay/arcade actions. Server rules remain unchanged; all 10 rule/integration tests and client syntax checks pass.
- Playwright Chromium was installed to a temporary writable location and the required client was rerun, but macOS denied Chromium's Mach rendezvous process. Built-in browser access to localhost was also denied, so screenshot QA remains externally blocked; HTTP smoke checks and deterministic hooks remain healthy.
- TODO: after deployment, manually inspect the join screen, compact table header, resolution trail, and final celebration on one phone and one desktop browser.
