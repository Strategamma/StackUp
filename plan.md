# Current task

- Goal: make final scores feel like an arcade match-complete state rather than a formatted table.
- Scope: results-screen presentation and actions only; preserve authoritative scores, rankings, rematch ownership, and responsive support.
- Approach: add a victory burst and framed score cabinet, champion/rival labels, margin-of-victory callouts, animated score reveal, clearer record badges, and a share-results action for bragging rights.
- Risks: decorative layers reducing readability, three actions crowding phones, and animation accessibility. Keep effects behind content, derive action widths, and retain reduced-motion behavior.
- Verification: syntax/full tests, 2–8 player geometry checks, text-state/share-copy coverage, and the required browser-client attempt.
