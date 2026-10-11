# Current task

- Goal: turn final scores into a polished, readable, rewarding end-of-game experience for 2–8 players.
- Scope: final-screen hierarchy, rankings, awards, session stats, responsive layout, guest/host actions, and hidden-toast artifact; preserve scoring and replay behavior.
- Approach: add personalized outcome copy and tie-aware ranking, separate player/current-score/session columns, move awards into a dedicated session area, simplify first-game stats, and show guests the rematch state beside the exit action.
- Risks: eight-player and short-phone layouts, tied winners, long names, and icon collisions. Derive compact geometry from available height and keep awards out of the name lane.
- Verification: syntax/full tests, targeted static ranking/layout assertions, representative geometry checks, and the required browser-client attempt.
