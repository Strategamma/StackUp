# Current task

- Goal: remove all manual Wi-Fi-address entry from joining and invitation.
- Scope: join screen, origin selection, LAN invite sharing, and durable UI documentation; preserve gameplay and server topology.
- Approach: automatically use the origin the player opened. Hosted URLs connect online; local/LAN URLs connect locally. When the host opened localhost, resolve the machine's shareable Wi-Fi URL behind the invite button.
- Risks: browsers cannot discover an arbitrary server on another device; joining that local server must happen through the host's shared link. Never expose the underlying address as a form field.
- Verification: syntax/full tests, hosted and local HTTP smoke checks, automatic invite-origin checks, and the required browser-client attempt.
