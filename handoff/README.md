# Decadence Arcade game handoff

Copy this entire `handoff/` folder into the root of a new game's repository. It is self-contained; the game agent does not need access to the arcade repository.

Copy `handoff/AGENTS.md` to the **root** of the game repository as `AGENTS.md`. If the game already has a root `AGENTS.md`, merge these instructions into it instead of replacing its existing rules. An `AGENTS.md` left only inside `handoff/` does not automatically govern work elsewhere in the repository.

Tell the game agent: **“Read `handoff/GAME_GUIDE.md` and `handoff/PLAYER_NAME_HANDOFF.md` before designing or building this game. Treat the requirements as acceptance criteria, adapt them to this game's rules, and verify them before calling it ready.”**

The arcade homepage is a catalog; each game is hosted and maintained separately. Online lobby services belong on Render. Verify the game's actual player count, modes, and live URL before listing it in the arcade.
