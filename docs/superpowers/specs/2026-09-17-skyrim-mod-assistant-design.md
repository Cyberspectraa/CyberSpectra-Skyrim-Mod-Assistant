# CyberSpectra Skyrim Mod Assistant — Design Specification

**Date:** 2026-09-17  
**Status:** Draft for review  
**Target:** Vortex extension, Skyrim-first

## 1. Goal

Create a Vortex extension that makes installing Nexus Mods collections with a free Nexus account substantially less repetitive while staying within Nexus Mods' normal access controls.

The extension should automate everything that Vortex can legitimately observe and control, but it must stop for actions that genuinely require the user, such as CAPTCHA, login, or a Nexus download initiation that cannot be performed automatically for a free account.

The extension should use Vortex's existing Nexus authentication/session rather than asking the user for a Nexus username or password and must never store those credentials.

## 2. User experience

The primary workflow is:

1. User opens the Skyrim Mod Assistant page in Vortex.
2. User pastes a Nexus Collections URL.
3. Assistant resolves the collection and revision.
4. Assistant creates or resumes a persistent local queue.
5. Already-installed or already-completed mods are detected and skipped.
6. Downloadable items are processed through Vortex where possible.
7. When a free-account/manual Nexus action is required, the queue pauses on that item and presents a clear reason plus an **Open Page** action.
8. The assistant uses Vortex's browser/download events to detect when the user has legitimately initiated the download.
9. The queue resumes automatically after Vortex receives the download.
10. Failed items can be retried without restarting the whole collection.
11. The user can pause/resume the queue at any time.
12. A changed collection revision is reconciled against the previous queue so only new/changed work is presented.

The UI should be compact and native-feeling rather than trying to replace Vortex's normal mod management UI.

## 3. Queue states

The queue uses explicit states so the application never relies on ambiguous UI text or timing guesses.

- `pending` — item has not been processed.
- `skipped` — item is already satisfied locally.
- `opening` — assistant is opening the relevant Nexus/Vortex page.
- `awaiting-user` — a legitimate manual action is required.
- `downloading` — Vortex has reported the download starting/in progress.
- `downloaded` — Vortex has received the file.
- `installing` — installation has started.
- `installed` — item is complete.
- `failed` — item failed and can be retried.
- `blocked` — item cannot currently proceed because of a prerequisite or unsupported source.

Every transition should be event-driven where possible and persisted so an interrupted Vortex session can resume safely.

## 4. Collection handling

The assistant should treat a collection revision as the identity of a specific collection snapshot.

It should record:

- collection slug/identifier
- revision identifier
- collection display name
- game/profile identifier
- item identifiers
- item source/type
- required vs optional status where exposed
- current local state
- last error/action needed
- timestamps useful for recovery/debugging

When a later revision is loaded, the assistant should compare it with the stored revision and report additions/removals/changes rather than blindly creating a duplicate queue.

The implementation should prefer Vortex's collection APIs/events rather than scraping collection pages whenever Vortex exposes the required information.

## 5. Nexus/Vortex interaction model

The extension should integrate with Vortex through its supported extension API and events.

Important integration points include collection resolution/loading, collection install/download lifecycle events, Nexus login state, mod-page opening, and Vortex's browser/download workflow.

For free-account manual downloads, the preferred path is Vortex's supported browser/download flow. The assistant should open the relevant mod page with clear instructions and then wait for a Vortex download event. It must not simulate CAPTCHA solving, bypass Premium restrictions, bypass ads/access controls, forge Nexus requests, or use stored credentials to circumvent the normal account flow.

If a mod has an external/manual source that Vortex cannot observe reliably, it should be represented as `awaiting-user` or `blocked` with a useful explanation rather than pretending it succeeded.

## 6. Authentication and privacy

- Do not ask for Nexus passwords.
- Do not store Nexus passwords, session cookies, or authentication tokens.
- Reuse Vortex's existing Nexus account/session state.
- If Vortex reports that login is required, direct the user into Vortex's normal Nexus login flow.
- Do not send collection contents, account information, or local file paths to a remote service.
- Keep queue state local to the Vortex extension unless a future feature explicitly requires another storage mechanism.

## 7. Skyrim-first architecture

The first release targets Skyrim through Vortex's game/profile APIs, but the core should not hard-code Skyrim-specific queue logic.

Proposed layers:

### `core`

Pure queue/domain logic:

- queue models
- state machine
- reconciliation
- retry policy
- persistence interfaces
- progress calculations

This layer should be testable without Vortex.

### `vortex`

Vortex adapter:

- extension initialization
- page registration
- Vortex API/event subscriptions
- profile/game detection
- collection API integration
- download/install event translation
- Nexus browser integration

### `nexus`

Nexus-specific decisions that are not simply Vortex plumbing:

- collection item classification
- manual-action requirements
- revision identity
- source metadata normalization

### `ui`

Vortex page/components:

- collection URL input
- collection summary
- queue/progress view
- item state indicators
- action buttons
- errors and attention prompts

The core should depend on interfaces/adapters rather than directly on React/Vortex globals.

## 8. Persistence and recovery

Queue state must survive:

- Vortex restart
- extension reload
- PC restart
- temporary network failures
- a failed individual mod

Persistence should be versioned so the data format can evolve without losing queues.

The assistant should write state after meaningful transitions rather than on every render/update.

## 9. Failure handling

Failures should be classified rather than shown as generic errors.

Examples:

- transient download/network failure → retryable
- missing/invalid collection → user-facing collection error
- Nexus login required → login action
- CAPTCHA/manual verification → manual action
- external source → manual/unsupported source state
- already installed → skip
- incompatible game/profile → clear profile warning
- unknown Vortex event/source → blocked with diagnostic information

Automatic retries should use a bounded retry count with increasing delay. A failure must never cause an infinite retry loop.

## 10. Performance

The extension should be lightweight and event-driven.

Avoid:

- continuous polling of Nexus pages
- repeated full collection reloads
- unnecessary filesystem scans
- duplicate Vortex event listeners
- long-running background processes outside Vortex

Use Vortex events to advance state whenever possible.

## 11. Testing strategy

The project should have a clear separation between pure logic tests and Vortex integration tests.

### Unit tests

Cover at minimum:

- queue creation
- duplicate detection
- installed-item skipping
- state transitions
- retry limits
- revision reconciliation
- pause/resume behavior
- recovery from persisted state
- manual-action transitions
- progress calculation

### Integration tests

Use mocked Vortex adapters/events to verify:

- collection loading
- download event handling
- install event handling
- profile changes
- manual browser/download flow
- restart/reload recovery

### Manual smoke test

A real Skyrim Vortex installation should verify:

- extension loads in Vortex
- Skyrim profile is detected
- collection URL resolves
- existing mods are skipped
- a free-account manual download can be opened in Vortex
- download detection advances the queue
- pause/resume works
- Vortex restart restores queue state

No test should require bypassing Nexus restrictions.

## 12. Initial project structure

A likely initial structure is:

```text
CyberSpectra-Skyrim-Mod-Assistant/
├─ docs/
│  └─ superpowers/
│     └─ specs/
│        └─ 2026-09-17-skyrim-mod-assistant-design.md
├─ src/
│  ├─ core/
│  ├─ nexus/
│  ├─ vortex/
│  └─ ui/
├─ tests/
│  ├─ core/
│  └─ integration/
├─ info.json
├─ index.ts
├─ package.json
├─ tsconfig.json
└─ README.md
```

The exact build setup should follow the current Vortex extension development guidance and package versions supported by the target Vortex release, rather than copying an obsolete extension template unchanged.

## 13. Future expansion

The architecture should leave room for:

- other Nexus-supported games
- richer optional-mod handling
- collection revision history
- better diagnostics/exportable logs
- configurable retry behavior
- additional supported mod sources
- Twitch-related integration only if it becomes relevant to the broader project

These are not part of the first implementation unless required by the foundation.

## 14. Non-goals

The first implementation will not:

- bypass Nexus Premium requirements
- defeat CAPTCHA or other anti-automation systems
- scrape or automate around ads/access controls
- collect/store Nexus passwords
- run as a separate always-on Windows background service
- silently make destructive changes to a user's mod setup
- claim an item is installed without confirmation from Vortex/local state

## 15. Acceptance criteria for the first usable version

The first usable version is successful when a Skyrim user can paste a supported Nexus collection URL into Vortex, see a persistent queue, have already-satisfied mods skipped, be guided through only the genuinely manual free-account steps, have successful Vortex downloads automatically detected, pause/resume safely, retry failures, and recover the queue after restarting Vortex — without bypassing Nexus account restrictions or requiring a separate background application.
