# Current task

- Goal: bring every interactive element to a consistent premium standard and reduce gameplay contrast.
- Scope: DOM and canvas hover/press/focus feedback, cards, skulls, row choices, navigation controls, dialogs, and palette; no mechanics changes.
- Approach: add shared pointer-state animation to canvas controls, strengthen DOM micro-interactions, use warm beige cards/text, make every skull red, and soften the red background glow.
- Risks: hover hit-area drift, touch behavior, card layout clipping, reduced-motion accessibility, and readable disabled states.
- Verification: syntax/tests, deterministic state output, Playwright interaction attempt, served asset checks, and desktop/mobile visual review where host permissions allow.
