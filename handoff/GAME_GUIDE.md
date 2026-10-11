# Decadence Arcade game guide

## The experience

Build for friends and family gathered for game night, each able to play on their own phone. Make the game quick to open, easy to understand, fun to replay, and engaging for the whole room. Solo and remote play can complement this. Only claim “same Wi-Fi,” “local,” or “online” when the implemented connection flow supports it.

- **Reward wins.** Give players a clear goal and decisions that can influence the outcome. Show the decisive play, celebrate the winner in the game's visual language, explain the result to everyone, and offer an easy rematch. Make losses understandable and worth replaying.
- **Make actions intuitive.** Show the objective before the first decision. Make legal actions recognizable, respond immediately to input, and reveal rules when they become relevant. Teach the core loop through a quick playable choice rather than a long opening rulebook.
- **Keep every player oriented.** Each player should know the current phase and turn, what just happened, what they can do, and what they are waiting for. Show public scores, progress, timers, and effects clearly. Explain hidden-information outcomes without revealing secrets prematurely.
- **Guide phase by phase.** At each phase start, give a short instruction with its goal and available action. Update it after choices, during waits, and on resolution. Show cause and effect through clear transitions. Keep help available without slowing experienced players.
- **Make text look like part of the game.** Avoid default-looking paragraphs, forms, alerts, and status labels. Use intentional typography, panels, icons, motion, and illustration while preserving readability, contrast, accessibility, and precise wording.
- **Make it look and feel like a fun game.** Give this title its own cohesive style across the opening screen, play area, controls, effects, and results. Use color, artwork, animation, and sound where they add anticipation, feedback, and celebration. Avoid a generic dashboard or unstyled web form. Keep the play area readable and smooth on a phone; effects must serve the action.
- **Consider the whole room.** Keep downtime short and waiting states informative. Let players follow the action without exposing private information.

Start by naming the feeling the game should create, then build and tune a small core loop to produce it. Watch new players complete a first round without coaching and a full group finish a match. Fix confusion before adding polish. These practices draw on the [MDA framework](https://www.cs.northwestern.edu/~hunicke/MDA.pdf), [Apple's game onboarding guidance](https://developer.apple.com/app-store/onboarding-for-games/), and [iterative playtesting research](https://journals.sagepub.com/doi/pdf/10.1177/1046878111434255).

## Mobile acceptance

The complete flow must work on a phone: open, start or join, learn, take every kind of turn, see the result, and replay. Test around 320px and 390px wide and on a real touch device when available. Support portrait, and landscape if the game uses it. Keep actions and dialogs visible without horizontal scrolling. Use comfortable touch targets and readable text. Do not require hover, right click, keyboard shortcuts, or precise dragging. Check the on-screen keyboard and connection/reconnect states. Do not make color, sound, motion, or a short non-gameplay timer the only way to understand an event; consult the [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines).

## PWA and connection resilience

Make the game an installable Progressive Web App with a valid manifest, game icon, suitable start URL and display mode, secure origin, and service worker caching of the app shell and essential assets. Test install and home-screen launch, a fresh visit, a repeat visit offline, an updated deployment, and a connection drop during a match. Solo or local modes should remain usable offline where feasible. Server-backed play must clearly explain connection loss, preserve recoverable state, and offer reconnection. A PWA cannot keep a multiplayer server running or make server-backed multiplayer work offline. See [web.dev's PWA guide](https://web.dev/learn/pwa/welcome).

### Host migration

In hosted rooms and duels, a host disconnect must not automatically kill the session. Pause, inform remaining players, and let connected players choose whether to continue. If they agree, transfer the host role to an eligible online player and resume from the same authoritative state, including seats, phase or turn, scores, and private information. Prevent two simultaneous hosts; make selection deterministic and let the former host rejoin without taking control unexpectedly. If too few players remain, keep the room open for reconnection or replacement when game rules allow it and explain the options. Test disconnection before play, during a turn, during a phase transition, and during a rematch. Implement this in the multiplayer architecture; PWA caching does not provide host migration.

## Deployment and hosting

Deploy online lobby and real-time multiplayer services as **Render web services**. Render supports public WebSocket connections; use secure `wss://` from an HTTPS game. A static game front end may be hosted separately on a suitable static host, including GitHub Pages or a Render static site. A full-stack game may serve its front end from the Render web service. Record the chosen front-end URL, lobby URL, build/start commands, required environment variables, and deployment steps in the game's own repository. Give the arcade the verified public game URL only after a live end-to-end test.

Design room state to survive connection loss and service restarts where the game promises recovery; do not depend on one browser or a Render instance's local filesystem as the only copy of a live match. Test lobby creation, joining from another phone, reconnection, host migration, and a service restart against the deployed service. Check cold-start behavior on the chosen Render plan and explain any wait to players. Render's [web service](https://render.com/docs/web-services), [WebSocket](https://render.com/docs/websocket), and [free-plan](https://render.com/docs/free) docs describe the platform behavior; choose a plan that meets the game's availability needs.

## Ready-to-play check

Observe the first round and a full match from every player role. Inspect the opening, active play, waiting, and result screens on a phone for visual cohesion and game feel. Verify the win and loss result, replay, mobile touch flow, installed PWA behavior, network interruption, and host migration where the game has hosted multiplayer. For online lobbies, repeat the multiplayer flow against the deployed Render service. Fix failures in the game repository before describing these capabilities as supported.
