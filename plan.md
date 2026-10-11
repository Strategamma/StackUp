# Current task

- Goal: make personal score/status unmistakable, add competitive crowns from round five, enrich session records with win/best-score iconography, and adopt the current StackUp logo from Decadence.
- Scope: canvas HUD and final leaderboard, deterministic text-state metadata, browser/PWA icon assets; no rules or scoring changes.
- Approach: visually prioritize the local player, rank current scores for in-game crowns, render session wins as crown icons and the session-best holder as a medal, then replace favicon/PWA assets from the official 3D source.
- Risks: icon rows becoming crowded on phones, ties in crown/best-score awards, and animation causing distraction; use compact responsive layouts, award tied scores consistently, and honor reduced motion.
- Verification: syntax and full tests, deterministic ranking checks, asset/manifest smoke checks, and the required browser screenshot attempt.
