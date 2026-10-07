# Current task

- Goal: make card resolution and penalties clear, sequential, and dramatic.
- Scope: highest-to-lowest card replay, destination highlighting, stack-take feedback, animated score increments, and gated next-round action.
- Approach: replay the server-authoritative `lastEvents` log from the client’s pre-resolution row snapshot without changing game rules.
- Risks: forced-row pauses creating partial snapshots, reconnects joining mid-summary, and animations obscuring phone layouts.
- Verification: event-order/rule tests, deterministic text-state exposure, client syntax, complete multiplayer regression, and visual QA when browser permission is available.
