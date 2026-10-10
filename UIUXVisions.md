# StackUp UI/UX

- Decadence-native dark arcade aesthetic: black grid, warm cream typography/cards, amber primary controls, red depth accents, green live/ready states, and restrained red ambient glow.
- Headings are bold, condensed-feeling, uppercase, and editorial; panels are dark translucent surfaces with thin cream borders and modest corner radii.
- Penalty values use compact vector skulls, not font glyphs, for consistent rendering across devices.
- Motion communicates state: cards deal in, selected cards lift/bounce, locked avatars pulse, and selectable penalty rows breathe.
- Keep motion subtle, phone-friendly, and respectful of `prefers-reduced-motion`.
- Phone gameplay uses compact rows without empty-card outlines and a non-overlapping two-row hand grid with large tap targets.
- Every table screen uses the same top-left Exit control; destructive navigation requires confirmation and clearly explains mid-game auto-play.
- Round transitions stay inline on the table: resolved rows, hands, and scores remain visible while the host gets a centered next-round action and guests receive a waiting toast.
- Rules are available before and during play; first-time players see onboarding once, and tentative card selection previews the destination row or warns that a stack choice will be required.
- Resolution replays authoritative events one at a time: cards travel to highlighted rows, scores increment after impact, and collected stacks trigger a red skull burst with an exact penalty label.
- Decadence Arcade navigation is always obvious: direct on the join screen, confirmation-gated at an active table, and offered beside replay after the final score.
- Joining explains the flow in three steps and uses a single name field; every table header exposes invite-link copying.
- Premium motion adds card sheen, travel trails, safe-stack impact rings, and a crown/confetti/staged-rank victory sequence without changing game timing or rules.
- Interactive elements consistently lift on hover, compress on press, expose a visible focus state, and keep equivalent tap behavior on touch devices.
- Gameplay favors warm beige cards and labels over stark white, with red skulls at every penalty value and a restrained charcoal/red table glow.
- Round summaries remain visible through the resolution replay and a short reading pause, then the authoritative server advances automatically without a host click.
