# Current task

- Goal: make every join, table, lobby, final-score, and dialog button clear, well placed, and easy to tap.
- Scope: button styling and responsive layout only; preserve actions and game rules.
- Approach: audit each control, enlarge small touch targets where space permits, separate primary/secondary/destructive actions, and fit final-score actions below the leaderboard.
- Risks: narrow phones and eight-player layouts can crowd controls; derive positions from viewport space and keep labels readable.
- Verification: syntax and existing tests, plus targeted geometry checks at representative phone and desktop sizes. Browser preview remains blocked by the current local-access denial.
