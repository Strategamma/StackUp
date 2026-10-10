# Current task

- Goal: make bots choose cards by safety and penalty instead of always playing the lowest.
- Scope: server bot selection and focused rule tests; preserve disconnected human fallback.
- Approach: score each card against current rows using immediate penalty, gap and row length risk, and the value of shedding a high card. Prefer the lowest score.
- Risks: simultaneous plays can change rows before a bot resolves; use a heuristic rather than assuming known opponent cards.
- Verification: targeted card-choice cases and full test suite.
