# Current task

- Goal: make information messages actionable and give the table a persistent session scoreboard.
- Scope: connection/lobby/selection/resolution copy plus session games, wins, best score, streak, and end-game achievements.
- Approach: prefer contextual canvas guidance over extra toasts; retain session stats on each seat across replays; surface compact records on the final leaderboard.
- Risks: duplicate game recording, tied winners, scoreboard density with eight players, and stats surviving replay without surviving a new empty table.
- Verification: unit/integration coverage for one game and replay stats, syntax checks, deterministic state output, and Playwright attempt.
