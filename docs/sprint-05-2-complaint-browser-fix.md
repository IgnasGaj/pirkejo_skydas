# Sprint 05.2 — Complaint form browser compatibility fix

## Goal

Fix the runtime crash when opening or using the complaint composer on a browser where `crypto.randomUUID` is unavailable. Preserve Sprint 5 and Sprint 5.1 behavior, Lithuanian UI, private data access, and save/generation idempotency.

Repository: https://github.com/IgnasGaj/pirkejo_skydas.git

## Observed error and source evidence

An actual iPhone/Safari session opened the development app through the LAN address `192.168.0.82` and displayed:

```text
Runtime TypeError
crypto.randomUUID is not a function.
(In 'crypto.randomUUID()', 'crypto.randomUUID' is undefined)
```

At inspected commit `0794a5554e1e135821a5e3bad22a9e95f45db145` on `feature/sprint-05-1-hardening`, `src/features/complaints/ComplaintComposer.tsx` calls `crypto.randomUUID()` directly in four places: initial save ID, initial generation ID, save-success ID rotation, and generation-success ID rotation. Initialization happens before the legal wizard renders, so opening the route can crash before any complaint is submitted.

The likely trigger is HTTP access through a LAN address. The screenshot does not show the URL scheme, so confirm the actual origin before claiming reproduction. Browser `randomUUID()` requires a secure context; localhost testing can succeed while LAN HTTP fails. An older browser can also lack this method.

The original Sprint 5 inspection left actual iPhone/Safari and Android checks pending. Record this as an additional P1 finding (F5) alongside the original findings, without claiming a new complete audit. The Next.js outdated badge does not establish the cause of this crash.

References:

- https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
- https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues
- https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts

## Starting point and scope

1. Read repository `AGENTS.md`, current Sprint 5 specification, inspection, and any Sprint 5.1 completion notes available in the checkout. Check Git status, branches, ancestry, and current source before changing anything. Do not assume the inspected commit is still the latest.
2. Continue from the latest Sprint 5.1 hardening work. If those changes are already merged, use the branch that contains them. Create `feature/sprint-05-2-browser-compatibility` from that base unless an equivalent active branch already exists. Preserve unrelated working changes.
3. Implement this focused fix. Keep prior hardening behavior intact; do not reopen all Sprint 5 work or add Sprint 6 features.
4. Commit and push the completed branch normally to the repository above. Do not force-push, merge into main, or deploy. Use ordinary project-focused commit messages with no AI attribution.

## Implementation requirements

### Browser-safe UUID creation

- Introduce a small shared browser-compatible UUID-v4 helper, using an existing suitable utility if present.
- Feature-detect callable `globalThis.crypto?.randomUUID` and invoke it with the correct receiver when available.
- When unavailable, construct a valid UUID v4 from cryptographically secure bytes obtained with `crypto.getRandomValues`. Set the correct version and variant bits. This API can work in insecure contexts.
- Do not use `Math.random`, timestamps alone, counters alone, or `node:crypto` imports in client components. Avoid an unnecessary dependency if a small correct helper suffices.
- If neither cryptographic API is available, use a deliberate recoverable behavior rather than crashing the component render. Disable affected operations with a clear Lithuanian explanation or provide a safe server-issued ID design. Do not silently send an invalid ID.
- Consider Next.js server rendering and client hydration: no unconditional `window` access during module evaluation and no UUID-dependent rendered markup that introduces hydration mismatches.
- Replace all four direct calls in `ComplaintComposer.tsx`. Search the remaining browser/client code for the same unsupported assumption and fix directly related cases. Distinguish browser calls from valid server-side calls.

### Preserve operation semantics

- Request IDs must remain valid for the server's existing UUID validation and database contracts.
- Preserve the existing idempotency contract: a retry of the same logical save or generation after a failed/lost response retains its ID; a new completed operation gets a fresh ID.
- Handle ID rotation without converting an already successful server save/generation into a misleading failure or losing the user's edited values.
- Retain pending-operation edit locks, dirty-state safeguards, reassessment requirements, stale-purchase protections, immutable generated versions, and authorization.
- Keep clipboard failure fallback working. If testing reveals another secure-context issue in this flow, document it and make only a directly related correction.

## Required verification

Add meaningful regression tests using the actual composer or the existing component-testing pattern:

1. With `randomUUID` absent and `getRandomValues` available, a new complaint route/component renders without the runtime error.
2. The fallback emits structurally valid UUID v4 values with correct version/variant bits; the native path also works.
3. Initial save and generation IDs, and both success rotations, use the compatible path.
4. A failed or lost-response retry preserves the logical request ID; successful completion prepares a fresh ID for the next operation. Reuse existing backend idempotency tests rather than duplicating them.
5. If no secure random API exists, the chosen recovery behavior is tested and preserves entered values.

Restore any mocked globals after each test. Do not rely exclusively on a jsdom/Node environment that supplies `randomUUID` automatically.

Run the repository's applicable commands, adapting only to actual scripts:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Run relevant browser tests, including authenticated complaint save/reopen/generate/export against a disposable backend when available. Preserve existing tests and explain any skipped checks. Do not alter production database, Auth, or deployment settings for this fix.

Exercise the browser fallback under an actual insecure origin or a meaningful test setup that exposes the same absent API. A narrow mobile viewport on localhost alone does not reproduce the reported condition.

## Actual-device acceptance checklist

Make the development server accessible on the local network using the existing project command. Record the exact protocol and origin used. Use synthetic purchase and consumer data.

On actual iPhone/Safari, and Android when available:

- Open the complaint creation route through the LAN HTTP origin that exposed the bug.
- Complete an eligible legal wizard and enter reviewed complaint facts.
- Save the draft, reopen it, edit/save again, then generate a document.
- Verify preview, PDF/text download, and copy success or the selectable-text fallback.
- Confirm no `randomUUID` runtime crash, retained form values on recoverable errors, and usable mobile keyboard/layout.

Also check a trusted HTTPS origin when available. Do not treat HTTP LAN development as the production hosting setup.

If actual devices are unavailable, provide this checklist with concrete test URLs and mark device acceptance pending. Do not claim simulated tests are actual iPhone/Safari results. Do not claim the screenshot alone proves the URL was HTTP.

## Completion report

Add a concise repository report, such as `docs/sprint-05-2-browser-compatibility-report.md`, following existing documentation conventions. Include:

- Confirmed cause, observed origin or remaining inference, and affected source paths.
- Implementation and UUID/idempotency behavior.
- Commands and results, browser/backend coverage, and actual-device results separately.
- Remaining checks and any blockers, including a manual phone checklist if needed.
- Branch, final commit, and exact-commit CI results after pushing. Pending CI remains pending.

The fix is complete when compatible UUID creation covers initialization and rotations, request retry semantics remain intact, relevant checks pass, and actual-device status is reported honestly. Do not describe the complete Sprint 5 implementation as fully re-audited based on this focused fix.

## Short execution prompt

Implement the attached `sprint-05-2-complaint-browser-fix.md` in `IgnasGaj/pirkejo_skydas`. Continue from the latest Sprint 5.1 hardening code and fix the iPhone complaint-form `crypto.randomUUID is not a function` crash. Complete the compatibility helper, all affected complaint calls, retry/idempotency regression coverage, applicable checks, and completion report. Push the finished fix branch normally and inspect its exact-commit CI; do not merge into main or deploy. Keep the UI Lithuanian and report simulated browser checks separately from actual-device results. Work through the brief to completion and clearly identify any genuinely unavailable verification.
