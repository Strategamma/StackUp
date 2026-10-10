# Current task

- Goal: remove redundant game navigation and prevent guidance/action text from colliding with cards.
- Scope: active-screen header and responsive table geometry only; no rules or server changes.
- Approach: keep D Arcade as the sole confirmed exit; derive table card size/row spacing from the vertical space remaining after reserving dedicated guidance, action, and hand bands; fit long guidance to width.
- Risks: very short phone viewports, card legibility after vertical scaling, resolution travel targeting, and layout jumps between selection states.
- Verification: syntax/tests, deterministic state, Playwright attempt, screenshot-based geometry review, and source assertions for reserved bands.
