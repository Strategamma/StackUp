# Player name handoff for arcade games

The arcade asks for a display name on first visit and lets players edit it from the header. It stores the name in that browser's `localStorage` and adds it to each game launch URL as a fragment:

`https://example-game.com/#arcadeName=Sam+Player`

The fragment stays in the browser during navigation; it is not sent in the HTTP request or `Referer` header. The arcade also sets `no-referrer`, leaves its visible game links free of the name, and offers **Forget name**. This is a **display name hint**, not an identity or authentication token. Anyone can edit it. Never use it to authorize a room, identify an account, or trust game actions. The name can still appear in the destination browser's history, copied links, screenshots, extensions, and game scripts; players should use a nickname rather than private information.

## Integration in each game

Find the game's existing player-name input and its initialization code. On startup, read `arcadeName` from `location.hash`, validate it, and use it only as the input's initial value. Keep the field editable. Do not overwrite a name the player has already typed, a saved game preference, or a room invite flow that needs the fragment. Read the value before your router replaces the hash, if the game uses hash routing.

```js
function takeArcadeNameFromUrl() {
  const params = new URLSearchParams(location.hash.slice(1));
  const value = params.get('arcadeName')?.trim() ?? '';
  if (params.has('arcadeName')) {
    params.delete('arcadeName');
    history.replaceState(history.state, '', location.pathname + location.search + (params.size ? `#${params}` : ''));
  }
  return value.length > 0 && value.length <= 32 ? value : null;
}

const nameInput = document.querySelector('#player-name'); // Use this game's selector.
const arcadeName = takeArcadeNameFromUrl();
if (nameInput && arcadeName && !nameInput.value.trim()) {
  nameInput.value = arcadeName;
}
```

For React or another framework, apply the same value when initializing the name state rather than assigning to the DOM. Use the game's normal validation and submit path after the player confirms or edits the name. Render it as text, never with `innerHTML`. The example removes the name from the visible game URL immediately while preserving other fragment parameters. If the game uses a hash router, adapt that removal to its routing format.

Check a fresh arcade launch, a renamed player, direct game entry without the fragment, an edited name in game, and a malformed or overlong fragment. A game opened directly should continue its normal name flow.
