# CyberSpectra Skyrim Mod Assistant

A Skyrim-first Vortex extension that makes Nexus Mods collection downloads less repetitive for free Nexus accounts while respecting Nexus Mods access controls.

## Current state

The project is now moving from the approved design into implementation. The implementation is being built around a persistent queue and a small, host-independent domain layer so the important behavior can be tested without requiring Vortex to be running.

The extension will reuse Vortex's existing Nexus authentication and supported download/browser flow. It will never ask for or store a Nexus password, session cookie, or authentication token, and it will not bypass Premium requirements, CAPTCHA, ads, login, or other access controls.

## Development

Requirements:

- Node.js 22+
- pnpm 11+

Commands:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

The build produces the Vortex entry point as `index.js`. Vortex packaging metadata is kept in `info.json`.

## Project documents

- `docs/superpowers/specs/2026-09-17-skyrim-mod-assistant-design.md` — approved architecture and behavior.
- `docs/superpowers/plans/2026-09-17-skyrim-mod-assistant.md` — task-by-task implementation plan.

## Safety and account boundaries

This project is an assistant for legitimate Vortex/Nexus workflows. It does not automate around account restrictions or security challenges. When Nexus requires a user action, the queue will stop at an explicit manual-action state and wait for the user to complete that action through the supported Vortex flow.
