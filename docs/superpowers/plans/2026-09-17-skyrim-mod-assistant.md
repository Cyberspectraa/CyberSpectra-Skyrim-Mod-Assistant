# CyberSpectra Skyrim Mod Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Skyrim-first Vortex extension that turns a Nexus Collections URL into a persistent, resumable queue, automatically skipping satisfied mods and guiding a free Nexus user through only the download actions Nexus still requires.

**Architecture:** Keep the queue/domain logic independent of Vortex so it can be unit-tested without the host application. Put Vortex API/event integration behind adapters for collection resolution, local state, downloads, installs, profile/game detection, and the supported browser/download flow; keep the UI as a thin Vortex page over those services. Use Vortex's current extension API package (`@nexusmods/vortex-api`), bundle the extension for Vortex, and persist only non-sensitive queue metadata locally.

**Tech Stack:** TypeScript, React, `@nexusmods/vortex-api`, Node.js build tooling, a small pure TypeScript domain layer, and Vitest for host-independent unit tests. The extension output must be a Vortex-compatible JavaScript bundle with top-level `index.js` and `info.json` packaging metadata.

**Spec:** `docs/superpowers/specs/2026-09-17-skyrim-mod-assistant-design.md`

## Global Constraints

- Skyrim is the first target, but queue/domain logic must not hard-code Skyrim-specific state transitions.
- Reuse Vortex's existing Nexus authentication/session; never ask for or store a Nexus password, session cookie, or authentication token.
- Do not bypass Nexus Premium requirements, CAPTCHA, ads, login, or other access controls.
- Use Vortex's supported collection APIs/events and browser/download workflow where available instead of scraping collection pages.
- Manual Nexus actions must be explicit queue states; never infer success from a timer or page text.
- Queue state must survive Vortex restart, extension reload, PC restart, temporary network failures, and an individual failed mod.
- Automatic retries are bounded and use increasing delay; no infinite retry loop.
- Do not run a separate always-on Windows background process.
- Do not silently make destructive changes to the user's mod setup.
- Do not claim an item is installed without Vortex/local-state confirmation.
- Avoid continuous Nexus polling, unnecessary filesystem scans, duplicate Vortex listeners, and long-running background work.
- The first usable version must support collection URL loading, persistent queueing, already-satisfied-item skipping, manual free-account download guidance, automatic Vortex download detection, pause/resume, retry, and restart recovery.

---

## File Map

Initial implementation will use the following focused files. The exact file names may be adjusted only when Vortex's current packaging/build requirements make an alternative necessary.

```text
CyberSpectra-Skyrim-Mod-Assistant/
├─ docs/
│  └─ superpowers/
│     ├─ specs/
│     │  └─ 2026-09-17-skyrim-mod-assistant-design.md
│     └─ plans/
│        └─ 2026-09-17-skyrim-mod-assistant.md
├─ src/
│  ├─ core/
│  │  ├─ types.ts                 # Queue/domain data contracts
│  │  ├─ stateMachine.ts          # Valid transitions and transition helpers
│  │  ├─ queue.ts                 # Queue construction, skip detection, progress
│  │  ├─ reconciliation.ts        # Revision-to-revision diff/reconciliation
│  │  ├─ retryPolicy.ts           # Bounded retry/backoff decisions
│  │  └─ persistence.ts           # Versioned persistence interface + serializer
│  ├─ nexus/
│  │  ├─ collectionUrl.ts         # URL parsing/normalization
│  │  ├─ collectionMapper.ts      # Nexus/Vortex collection data -> domain items
│  │  └─ manualAction.ts          # Manual/free-account action classification
│  ├─ vortex/
│  │  ├─ api.ts                   # Narrow Vortex adapter interfaces
│  │  ├─ collectionService.ts     # Collection resolution/loading adapter
│  │  ├─ downloadMonitor.ts       # Download/install event translation
│  │  ├─ browserDownload.ts       # browse-for-download integration
│  │  ├─ profileService.ts        # Skyrim/profile detection
│  │  └─ extension.ts             # Vortex init, registration, lifecycle wiring
│  └─ ui/
│     ├─ AssistantPage.tsx        # Main Vortex page
│     ├─ QueueSummary.tsx         # Counts/progress and collection summary
│     ├─ QueueList.tsx             # Queue item list
│     ├─ QueueItem.tsx             # State/action rendering for one item
│     └─ styles.ts                 # Small page-local style definitions
├─ tests/
│  ├─ core/
│  │  ├─ stateMachine.test.ts
│  │  ├─ queue.test.ts
│  │  ├─ reconciliation.test.ts
│  │  ├─ retryPolicy.test.ts
│  │  └─ persistence.test.ts
│  ├─ nexus/
│  │  ├─ collectionUrl.test.ts
│  │  └─ collectionMapper.test.ts
│  └─ integration/
│     ├─ extension.test.ts
│     └─ queueLifecycle.test.ts
├─ index.js                    # Built Vortex entry point/package output
├─ info.json                   # Vortex extension metadata
├─ index.ts                    # Source entry if the build emits index.js at root
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
├─ build.mjs
├─ README.md
└─ .gitignore
```

### Vortex API assumptions to verify during implementation

The current Vortex source exposes an extension API with `IExtensionContext`, `registerMainPage`, Redux/store access, and event registration. Current Vortex events include collection resolution/loading, download/install lifecycle, Nexus login, profile/game changes, and `browse-for-download`. The current Vortex repository's own extensions import `@nexusmods/vortex-api`; the implementation must verify the exact published version and packaging expectations before locking dependency versions.

The supported browser flow is particularly important: Vortex exposes `browse-for-download` as an async event that opens a page with instructions and resolves when a download is detected. The extension should use that mechanism for the free-account manual step rather than building a separate browser automation system.

---

## Task 1: Establish the Vortex Extension Build/Test Skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `build.mjs`
- Create: `index.ts`
- Create: `info.json`
- Create: `.gitignore`
- Modify: `README.md`
- Test: `tests/core/stateMachine.test.ts`

**Interfaces:**
- Consumes: Vortex extension packaging requirements and the approved design spec.
- Produces: A buildable TypeScript extension skeleton, a Vortex-compatible entry point, and a working host-independent test command.

- [ ] **Step 1: Confirm the current Vortex package and packaging shape**

Use the current Vortex repository as the source of truth. The current Vortex API package is named `@nexusmods/vortex-api`, and Vortex's current source uses it from extension code. Confirm the package version available from the registry at implementation time, then pin a compatible version in `package.json` rather than relying on a floating `latest` dependency.

Use Vortex's extension structure as the packaging contract: the installed extension must expose top-level `index.js` and `info.json`.

- [ ] **Step 2: Create the package manifest**

Use pnpm-compatible scripts and keep runtime dependencies minimal. The manifest should include scripts equivalent to:

```json
{
  "scripts": {
    "build": "node build.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

Use `@nexusmods/vortex-api` for Vortex types/runtime integration, React for the page, TypeScript for source, Vitest for pure tests, and the chosen bundler/build helper for producing a Vortex-compatible CommonJS bundle. Do not bundle Vortex-provided host packages into the extension when the host expects them as runtime externals.

- [ ] **Step 3: Add TypeScript and Vitest configuration**

Configure TypeScript for strict checking, JSX/React support, Node types, and the extension's source tree. Configure Vitest to run `tests/**/*.test.ts` without requiring a live Vortex instance.

- [ ] **Step 4: Add the minimal extension metadata and entry point**

Create `info.json` with the project name, author, version `0.1.0`, and a description explaining that the extension assists with Nexus collection downloads while respecting account restrictions.

Create `index.ts` with a minimal exported `init(context)` that returns successfully and does not register any game support. The extension is an assistant, not a replacement Skyrim game extension.

- [ ] **Step 5: Write the first failing domain test**

Create a minimal state-machine test that asserts a new queue item starts as `pending` and can transition to `opening`.

```ts
import { describe, expect, it } from 'vitest';
import { transition } from '../../src/core/stateMachine';

it('allows a pending item to enter opening', () => {
  expect(transition('pending', 'opening')).toBe('opening');
});
```

- [ ] **Step 6: Run the test before implementing the state machine**

Run:

```bash
pnpm test -- tests/core/stateMachine.test.ts
```

Expected: FAIL because `src/core/stateMachine.ts` does not exist yet.

- [ ] **Step 7: Add the minimum state-machine implementation**

Create the domain type and transition function needed by the test. The implementation must reject invalid transitions rather than silently accepting them.

- [ ] **Step 8: Run typecheck and tests**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands pass and the build produces the Vortex extension entry output in the packaging location required by the current build setup.

- [ ] **Step 9: Commit the skeleton**

```bash
git add package.json tsconfig.json vitest.config.ts build.mjs index.ts info.json .gitignore README.md src/core/stateMachine.ts tests/core/stateMachine.test.ts
git commit -m "build: scaffold Vortex extension"
```

---

## Task 2: Build the Queue Domain Model and State Machine

**Files:**
- Create: `src/core/types.ts`
- Modify: `src/core/stateMachine.ts`
- Create: `src/core/queue.ts`
- Create: `tests/core/queue.test.ts`
- Modify: `tests/core/stateMachine.test.ts`

**Interfaces:**
- Consumes: The Task 1 state-machine skeleton.
- Produces: `QueueItem`, `CollectionQueue`, `QueueState`, `transition`, `createQueue`, `markSatisfied`, `getProgress`.

- [ ] **Step 1: Define the queue types**

Create explicit domain types matching the approved spec:

```ts
export type QueueState =
  | 'pending'
  | 'skipped'
  | 'opening'
  | 'awaiting-user'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'blocked';

export interface QueueItem {
  id: string;
  source: string;
  sourceType: 'nexus' | 'external' | 'unknown';
  name: string;
  required: boolean;
  state: QueueState;
  modId?: number;
  fileId?: number;
  revisionId: string;
  error?: string;
  actionRequired?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionQueue {
  schemaVersion: 1;
  collectionId: string;
  revisionId: string;
  collectionName: string;
  gameId: string;
  profileId: string;
  items: QueueItem[];
  paused: boolean;
  updatedAt: string;
}
```

Use ISO timestamps so persisted state is readable and deterministic in tests.

- [ ] **Step 2: Expand state-machine tests**

Add tests for valid transitions required by the spec: `pending -> opening`, `opening -> awaiting-user`, `opening -> downloading`, `awaiting-user -> downloading`, `downloading -> downloaded`, `downloaded -> installing`, `installing -> installed`, `failed -> opening`, and `pending -> skipped`.

Add tests proving invalid transitions throw a typed error rather than changing state.

- [ ] **Step 3: Implement transition rules**

Implement the transition table as a single source of truth. Do not scatter transition checks through the UI or Vortex adapters.

- [ ] **Step 4: Write queue-construction tests**

Test that `createQueue` preserves collection identity/revision, creates stable item IDs, starts items as `pending`, initializes retry counts to zero, and does not duplicate identical source/mod/file identities.

Test that already-satisfied items are created as `skipped` when supplied a satisfaction predicate returning true.

- [ ] **Step 5: Implement queue construction and progress**

Implement `createQueue`, `markSatisfied`, and `getProgress`. Progress must count `installed` and `skipped` as complete and must never divide by zero.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm test -- tests/core/stateMachine.test.ts tests/core/queue.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS with no implicit-any or unreachable-state errors.

- [ ] **Step 8: Commit the queue domain**

```bash
git add src/core/types.ts src/core/stateMachine.ts src/core/queue.ts tests/core/stateMachine.test.ts tests/core/queue.test.ts
git commit -m "feat: add persistent collection queue domain"
```

---

## Task 3: Add Revision Reconciliation and Retry Policy

**Files:**
- Create: `src/core/reconciliation.ts`
- Create: `src/core/retryPolicy.ts`
- Create: `tests/core/reconciliation.test.ts`
- Create: `tests/core/retryPolicy.test.ts`

**Interfaces:**
- Consumes: `CollectionQueue`, `QueueItem`, `QueueState` from Task 2.
- Produces: `reconcileRevision(previous, next)`, `getRetryDecision(item, errorClass)` and typed reconciliation/retry results.

- [ ] **Step 1: Write revision reconciliation tests**

Cover four cases:

1. Same collection/revision returns the existing queue unchanged.
2. A new revision preserves already-installed/satisfied matching items.
3. New items appear as `pending`.
4. Removed items are marked as no longer present rather than silently deleting historical state.

Use a deterministic item identity such as source + mod ID + file ID when available, falling back to the collection item identifier supplied by Vortex.

- [ ] **Step 2: Implement reconciliation**

Create a new queue snapshot from the new revision while carrying forward compatible local state and a small revision-change summary. Do not copy `failed` errors to unrelated new items.

- [ ] **Step 3: Write retry-policy tests**

Test a bounded policy such as:

```ts
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];
const MAX_AUTOMATIC_RETRIES = RETRY_DELAYS_MS.length;
```

Transient errors should receive the next delay until the maximum is reached. Manual-action, authentication, CAPTCHA, unsupported external source, and invalid collection errors must not auto-retry.

- [ ] **Step 4: Implement retry classification**

Create a typed error classification with `transient`, `authentication`, `manual-action`, `unsupported-source`, `invalid-collection`, and `unknown`. Return `retry: false` for all non-transient classes.

- [ ] **Step 5: Run focused tests**

```bash
pnpm test -- tests/core/reconciliation.test.ts tests/core/retryPolicy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/reconciliation.ts src/core/retryPolicy.ts tests/core/reconciliation.test.ts tests/core/retryPolicy.test.ts
git commit -m "feat: reconcile collection revisions and retries"
```

---

## Task 4: Add Versioned Local Persistence

**Files:**
- Create: `src/core/persistence.ts`
- Create: `tests/core/persistence.test.ts`

**Interfaces:**
- Consumes: `CollectionQueue` from Task 2.
- Produces: `QueueStore` with `load()`, `save(queue)`, `remove(collectionKey)`, and `list()` semantics.

- [ ] **Step 1: Write persistence round-trip tests**

Test that a queue serializes and deserializes without losing states, revision identity, timestamps, errors, or retry counts. Test that malformed/unknown schema versions are rejected with a useful error.

- [ ] **Step 2: Define the storage abstraction**

Use a small interface:

```ts
export interface QueueStore {
  load(key: string): Promise<CollectionQueue | undefined>;
  save(queue: CollectionQueue): Promise<void>;
  remove(key: string): Promise<void>;
  list(): Promise<CollectionQueue[]>;
}
```

The domain layer must not import Vortex APIs.

- [ ] **Step 3: Implement versioned serialization**

Persist JSON with `schemaVersion: 1`. Validate required fields on load. Keep persistence writes at meaningful state transitions instead of on every React render.

- [ ] **Step 4: Add migration behavior**

Implement a migration dispatcher even though version 1 has no previous format. An unknown future version must fail clearly rather than silently corrupting data.

- [ ] **Step 5: Run tests**

```bash
pnpm test -- tests/core/persistence.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/persistence.ts tests/core/persistence.test.ts
git commit -m "feat: add versioned queue persistence"
```

---

## Task 5: Normalize Collection URLs and Nexus Collection Data

**Files:**
- Create: `src/nexus/collectionUrl.ts`
- Create: `src/nexus/collectionMapper.ts`
- Create: `src/nexus/manualAction.ts`
- Create: `tests/nexus/collectionUrl.test.ts`
- Create: `tests/nexus/collectionMapper.test.ts`

**Interfaces:**
- Consumes: Vortex/Nexus collection result shapes through plain adapter input objects.
- Produces: `parseCollectionUrl(url)`, `mapCollectionToQueueInput(collection)`, and `classifyManualAction(item, accountContext)`.

- [ ] **Step 1: Write URL parser tests**

Accept normal Nexus collection URLs, URLs with query strings, and trailing slashes. Reject unrelated hosts, malformed paths, empty slugs, and unsupported schemes.

The parser must return a normalized collection identifier plus the original normalized URL.

- [ ] **Step 2: Implement URL normalization**

Do not fetch or scrape the page in this layer. Its only responsibility is validation and normalization so the Vortex adapter can resolve the URL through `resolve-collection-url`.

- [ ] **Step 3: Define normalized collection input**

Create a plain shape containing collection ID, revision ID, name, game ID, and item metadata needed by the queue. Keep Vortex-specific types out of the core queue model.

- [ ] **Step 4: Write mapping tests**

Verify required/optional information, Nexus mod IDs, file IDs when supplied, external sources, and missing source metadata are mapped deterministically.

- [ ] **Step 5: Implement mapping and manual-action classification**

Classify an item as manual when the free-user flow cannot be started directly by Vortex. Classification must never mean “bypass it”; it means “pause here and ask the user to perform the normal action.”

For Nexus items, preserve enough metadata to open the exact mod/file page that Vortex expects. For external items, use `blocked` or `awaiting-user` with an explicit reason depending on whether Vortex can observe completion.

- [ ] **Step 6: Run tests**

```bash
pnpm test -- tests/nexus/collectionUrl.test.ts tests/nexus/collectionMapper.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/nexus tests/nexus
git commit -m "feat: normalize Nexus collection metadata"
```

---

## Task 6: Create the Vortex Adapter Layer

**Files:**
- Create: `src/vortex/api.ts`
- Create: `src/vortex/profileService.ts`
- Create: `src/vortex/collectionService.ts`
- Create: `tests/integration/extension.test.ts`

**Interfaces:**
- Consumes: Task 2-5 domain services.
- Produces: Narrow adapters that the orchestrator can mock without importing Vortex in domain tests.

- [ ] **Step 1: Define narrow adapter interfaces**

Use interfaces along these lines:

```ts
export interface VortexHost {
  getState(): unknown;
  sendNotification(input: unknown): void;
  emit(event: string, ...args: unknown[]): void;
  emitAndAwait<T = unknown>(event: string, ...args: unknown[]): Promise<T[]>;
  on(event: string, handler: (...args: any[]) => void): void;
  once(handler: () => void): void;
}

export interface CollectionResolver {
  resolveUrl(url: string): Promise<{ collectionId: string; revisionId?: string }>;
  load(collectionId: string, revisionId?: string): Promise<unknown>;
}
```

Keep these adapters small. Do not pass the entire `IExtensionApi` through every core function.

- [ ] **Step 2: Implement profile/game detection**

Read Vortex state to identify the active game/profile. The assistant must require Skyrim before starting a Skyrim queue, but it must not register or replace the Skyrim game extension.

When the active profile changes, the queue runner must stop advancing the old profile until the user resumes in the matching profile.

- [ ] **Step 3: Implement collection resolution**

Use Vortex's `resolve-collection-url`, then `get-nexus-collection` / `get-nexus-collection-revision` as appropriate. Prefer the Vortex-supported collection APIs over web scraping.

- [ ] **Step 4: Write mocked integration tests**

Create a fake Vortex host and verify that URL resolution is requested once, collection data is mapped into the domain format, and an invalid active game/profile produces a user-facing blocked result rather than starting the queue.

- [ ] **Step 5: Run integration tests and typecheck**

```bash
pnpm test -- tests/integration/extension.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/vortex/api.ts src/vortex/profileService.ts src/vortex/collectionService.ts tests/integration/extension.test.ts
git commit -m "feat: add Vortex collection and profile adapters"
```

---

## Task 7: Connect Vortex Download, Install, Login, and Browser Events

**Files:**
- Create: `src/vortex/downloadMonitor.ts`
- Create: `src/vortex/browserDownload.ts`
- Modify: `src/vortex/api.ts`
- Create: `tests/integration/queueLifecycle.test.ts`

**Interfaces:**
- Consumes: Queue state machine plus Vortex host adapters from Tasks 2 and 6.
- Produces: Event-driven queue advancement and a `requestManualDownload(item)` operation.

- [ ] **Step 1: Write download lifecycle tests**

Test these sequences with a fake Vortex event source:

```text
awaiting-user -> downloading -> downloaded -> installing -> installed
failed -> opening -> awaiting-user
```

Also test that an unrelated download does not advance the active queue item.

- [ ] **Step 2: Implement event correlation**

Correlate Vortex download/install events to queue items using the strongest available identity: download ID, source/mod/file identity, archive ID, and finally deterministic metadata. Never advance an item solely because any download finished.

- [ ] **Step 3: Handle login events**

If Vortex reports Nexus login is required, move the item to `awaiting-user`, explain that the normal Vortex Nexus login is required, and use Vortex's supported `request-nexus-login` event when the user chooses the login action.

Do not read or store credentials.

- [ ] **Step 4: Implement the supported browser/download flow**

Use:

```ts
await host.emitAndAwait(
  'browse-for-download',
  modPageUrl,
  `Open the Nexus page for ${item.name} and start the normal download. Vortex will continue automatically once it receives the download.`,
);
```

Treat an empty/canceled result as a still-pending manual action, not as success. Treat an error result as a classified failure.

- [ ] **Step 5: Ensure manual actions remain visible**

The queue item must retain `actionRequired` so the UI can show exactly what the user needs to do. The runner must never repeatedly reopen the page in a tight loop.

- [ ] **Step 6: Run lifecycle tests**

```bash
pnpm test -- tests/integration/queueLifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/vortex/api.ts src/vortex/downloadMonitor.ts src/vortex/browserDownload.ts tests/integration/queueLifecycle.test.ts

git commit -m "feat: track Vortex downloads and manual Nexus actions"
```

---

## Task 8: Implement the Queue Runner and Recovery Loop

**Files:**
- Create: `src/vortex/extension.ts`
- Create: `src/vortex/queueRunner.ts`
- Modify: `src/core/persistence.ts`
- Modify: `src/core/queue.ts`
- Modify: `tests/integration/queueLifecycle.test.ts`

**Interfaces:**
- Consumes: Domain queue, persistence, Vortex adapters, browser/download integration.
- Produces: `QueueRunner` with `loadOrCreate`, `start`, `pause`, `resume`, `retry`, and `stop` behavior.

- [ ] **Step 1: Write queue-runner tests**

Cover:

- starting a new queue
- resuming an existing queue after restart
- skipping already-installed items
- pausing before opening the next page
- stopping when manual action is required
- retrying a failed transient item
- stopping on a blocked item without affecting later persisted state
- not running two queue runners for the same collection/profile

- [ ] **Step 2: Implement serialized queue advancement**

Use one active item at a time for free-account manual downloads. This mirrors the normal Nexus free-user flow and avoids multiple browser prompts competing for attention.

Advance only after a domain transition has been persisted.

- [ ] **Step 3: Implement pause/resume**

`pause()` must prevent starting the next item but must not cancel an already-running Vortex download. `resume()` should continue from the persisted state.

- [ ] **Step 4: Implement recovery**

On extension initialization, load persisted queues and expose them to the UI. Do not automatically resume a queue that requires a different active profile or manual action; restore the state and let the user choose Resume.

- [ ] **Step 5: Implement retry/backoff**

Use the Task 3 retry policy. Persist retry count before waiting so a Vortex restart cannot reset the retry budget.

- [ ] **Step 6: Wire extension lifecycle**

Register the page and event listeners inside `context.once()` so other Vortex extensions are loaded before interacting with collection/download services. Subscribe to `gamemode-activated`, `profile-did-change`, `did-finish-download`, `did-install-mod`, `did-login`, and relevant collection lifecycle events as needed.

- [ ] **Step 7: Run tests**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/vortex/extension.ts src/vortex/queueRunner.ts src/core/persistence.ts src/core/queue.ts tests/integration/queueLifecycle.test.ts

git commit -m "feat: add resumable collection queue runner"
```

---

## Task 9: Build the Vortex UI

**Files:**
- Create: `src/ui/AssistantPage.tsx`
- Create: `src/ui/QueueSummary.tsx`
- Create: `src/ui/QueueList.tsx`
- Create: `src/ui/QueueItem.tsx`
- Create: `src/ui/styles.ts`
- Modify: `src/vortex/extension.ts`
- Create: `tests/ui/AssistantPage.test.tsx`

**Interfaces:**
- Consumes: QueueRunner commands and read-only queue snapshots.
- Produces: A native-feeling Vortex page with collection loading, progress, queue states, and manual actions.

- [ ] **Step 1: Write UI behavior tests**

Verify the page renders:

- collection URL input and Load Collection button
- collection name/revision/mod count
- progress counts
- Start/Pause/Resume controls
- queue state labels
- Retry for failed items
- Open Page for `awaiting-user`
- a clear reason for `blocked`

- [ ] **Step 2: Implement the page shell**

Register a per-game main page with an ID such as `cyberspectra-skyrim-assistant` and a label such as `Skyrim Mod Assistant`. Use Vortex's `registerMainPage` API and `show-main-page` navigation rather than opening a separate window.

- [ ] **Step 3: Implement collection loading**

Disable Load Collection while resolution is in progress. Display validation errors directly beneath the URL field. Do not make network calls from individual row components.

- [ ] **Step 4: Implement queue summary and list**

Show concise counts such as:

```text
184 total   71 complete   1 downloading   3 need attention   109 remaining
```

Use explicit status text alongside icons so the UI remains understandable without color alone.

- [ ] **Step 5: Implement manual-action controls**

`Open Page` should invoke the queue runner's manual action, not directly manipulate browser URLs from the React component. After the browser/download flow returns, the row should update from events.

- [ ] **Step 6: Implement pause/resume/retry**

Buttons must be disabled when their action is invalid for the current queue state. A paused queue should remain visibly paused after a page refresh or Vortex restart.

- [ ] **Step 7: Run UI tests**

```bash
pnpm test -- tests/ui/AssistantPage.test.tsx
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui src/vortex/extension.ts tests/ui/AssistantPage.test.tsx

git commit -m "feat: add Skyrim Mod Assistant Vortex page"
```

---

## Task 10: Add Safety, Diagnostics, and Failure UX

**Files:**
- Modify: `src/core/retryPolicy.ts`
- Modify: `src/vortex/queueRunner.ts`
- Modify: `src/ui/QueueItem.tsx`
- Modify: `src/ui/AssistantPage.tsx`
- Create: `src/vortex/diagnostics.ts`
- Create: `tests/integration/failureHandling.test.ts`

**Interfaces:**
- Consumes: Existing queue/error types.
- Produces: Classified, actionable failures and local diagnostic output without credentials or sensitive session data.

- [ ] **Step 1: Write failure tests**

Test user-visible handling for:

- invalid collection
- Nexus login required
- CAPTCHA/manual verification
- transient download failure
- external source
- incompatible profile/game
- unknown event/source
- canceled browser flow
- retry budget exhausted

- [ ] **Step 2: Implement error classification**

Convert adapter errors into stable domain classifications and user-facing messages. Preserve the raw technical error only in diagnostics, after removing URLs containing tokens, cookies, authorization headers, or other credential material.

- [ ] **Step 3: Add notifications**

Use Vortex notifications for major queue changes such as collection loaded, manual action required, item failed, and collection complete. Avoid notification spam for ordinary download progress.

- [ ] **Step 4: Add diagnostics**

Create a local in-memory/log helper that records collection ID, revision ID, item ID, state transition, and sanitized error classification. Never record Nexus passwords, session cookies, authorization headers, or raw authenticated URLs.

- [ ] **Step 5: Run tests**

```bash
pnpm test -- tests/integration/failureHandling.test.ts
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/retryPolicy.ts src/vortex/queueRunner.ts src/vortex/diagnostics.ts src/ui/QueueItem.tsx src/ui/AssistantPage.tsx tests/integration/failureHandling.test.ts

git commit -m "feat: improve failure handling and diagnostics"
```

---

## Task 11: Add Realistic End-to-End Adapter Tests

**Files:**
- Create: `tests/integration/freeAccountFlow.test.ts`
- Modify: `tests/integration/queueLifecycle.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: The complete queue runner and mocked Vortex host.
- Produces: A regression suite representing the real free-account workflow without contacting Nexus or bypassing its controls.

- [ ] **Step 1: Write the complete mocked scenario**

Model a small five-item Skyrim collection:

```text
1. already installed Nexus item -> skipped
2. Nexus item requiring manual download -> awaiting-user
3. browser flow returns a download identity -> downloading
4. download finishes and install finishes -> installed
5. transient failure -> retry -> installed
```

- [ ] **Step 2: Assert persisted state after every meaningful transition**

The test should prove that if the process stops after item 2, a newly-created runner restores the exact `awaiting-user` state and does not restart item 1.

- [ ] **Step 3: Add revision update scenario**

Load revision A, mark two items complete, then load revision B with one existing item, one changed file, and one new item. Assert only the new/changed work is pending.

- [ ] **Step 4: Run all tests**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/freeAccountFlow.test.ts tests/integration/queueLifecycle.test.ts README.md

git commit -m "test: cover free account collection lifecycle"
```

---

## Task 12: Package, Document, and Perform the First Real Vortex Smoke Test

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `info.json`
- Create: `docs/testing/vortex-smoke-test.md`
- Create: `scripts/package-extension.mjs`
- Create: `tests/packaging/package.test.ts`

**Interfaces:**
- Consumes: The completed extension.
- Produces: A reproducible extension package and a manual verification checklist for the user's actual Vortex/Skyrim installation.

- [ ] **Step 1: Write packaging tests**

Assert the package contains:

```text
index.js
info.json
```

and does not contain source maps, tests, `.env` files, or development-only files unless explicitly intended.

- [ ] **Step 2: Implement the packaging script**

Create a deterministic package directory/zip suitable for Vortex extension installation. The packaging script must copy only built runtime assets and required metadata.

- [ ] **Step 3: Document installation**

README must explain:

1. build requirements
2. `pnpm install`
3. `pnpm test`
4. `pnpm build`
5. where the development extension is placed for Vortex 2.x development (`%APPDATA%/@vortex/main/plugins`)
6. how to restart/reload Vortex
7. how to load a Nexus collection
8. what the free-account manual prompt means
9. that the extension does not bypass Nexus Premium, CAPTCHA, login, or ads

- [ ] **Step 4: Create the real smoke-test checklist**

Document these checks:

```text
[ ] Vortex loads the extension without a startup error.
[ ] Skyrim Special Edition/Skyrim profile is detected correctly.
[ ] Assistant page appears in Vortex.
[ ] A valid collection URL resolves.
[ ] Existing mods are skipped.
[ ] A free-account Nexus item opens through Vortex's browser/download flow.
[ ] Starting the normal download advances the queue automatically.
[ ] Completed downloads/installations are detected correctly.
[ ] Pause stops new actions.
[ ] Resume continues the same queue.
[ ] Restarting Vortex restores the queue.
[ ] A failed item can be retried.
[ ] CAPTCHA/login/manual steps never get bypassed.
[ ] External requirements are clearly marked.
```

- [ ] **Step 5: Run final automated verification**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm exec vitest run tests/packaging/package.test.ts
```

Expected: PASS.

- [ ] **Step 6: Perform the real Vortex smoke test**

Install the development extension into the current Vortex development plugin directory, restart Vortex, select the user's Skyrim profile, and run a small collection first. Do not begin with a hundreds-of-mod collection. Verify the complete manual-download handoff on a small collection, then test resume/recovery.

- [ ] **Step 7: Record any Vortex-version-specific findings**

If the actual installed Vortex version differs from the API/package assumptions, update dependency versions/build configuration and document the exact tested Vortex version. Do not work around an API mismatch with private/internal calls when a supported event/API exists.

- [ ] **Step 8: Commit the release preparation**

```bash
git add README.md package.json info.json docs/testing scripts/package-extension.mjs tests/packaging/package.test.ts
git commit -m "chore: package and document first Vortex release"
```

---

## Verification Matrix

Before declaring the first usable version complete, verify every acceptance criterion from the approved spec:

| Requirement | Automated coverage | Real Vortex smoke test |
| --- | --- | --- |
| Collection URL resolves | URL/adapter tests | Yes |
| Persistent queue | Persistence tests | Yes |
| Already-satisfied mods skipped | Queue tests | Yes |
| Free-account manual steps | Free-account lifecycle test | Yes |
| Vortex download detection | Lifecycle tests | Yes |
| Install detection | Lifecycle tests | Yes |
| Pause/resume | Queue-runner tests | Yes |
| Retry/backoff | Retry tests | Yes |
| Revision reconciliation | Reconciliation tests | Yes |
| Restart recovery | Persistence + lifecycle tests | Yes |
| Login handling | Failure tests | Yes |
| CAPTCHA/manual stop | Failure tests | Yes |
| External source handling | Mapping/failure tests | Yes |
| No credential storage | Packaging/source review | Yes |
| No Premium/CAPTCHA bypass | Source review + smoke test | Yes |
| No separate background service | Architecture/source review | Yes |

## Final Self-Review Against the Spec

- Goal and free-account convenience are covered by Tasks 5-9 and the smoke test.
- Explicit queue states and event-driven transitions are covered by Tasks 2, 7, and 8.
- Collection revision identity/reconciliation is covered by Task 3.
- Vortex collection APIs/events are covered by Task 6.
- `browse-for-download` is covered by Task 7.
- Authentication/privacy constraints are covered by Tasks 7 and 10.
- Skyrim-first but game-agnostic core is covered by Tasks 2 and 6.
- Versioned persistence/recovery is covered by Task 4 and Task 8.
- Bounded failure/retry behavior is covered by Tasks 3 and 10.
- Lightweight/event-driven behavior is built into Tasks 7-8; no polling loop is planned.
- Unit/integration/manual testing is covered throughout and summarized in the verification matrix.
- Future multi-game support is preserved by keeping queue/domain logic separate from the Skyrim profile adapter.
- Non-goals are explicitly enforced in Tasks 7, 10, and 12.

No placeholder steps are intentionally left in the plan. During implementation, any Vortex-version-specific API mismatch must be resolved against the current Vortex source/API documentation before code is written around private behavior.
