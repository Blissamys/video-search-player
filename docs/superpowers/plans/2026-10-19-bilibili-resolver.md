# Bilibili Local Resolver Implementation Plan

> Inline execution in the isolated local clone, on feature/bilibili-local-resolver. Use executing-plans and test-driven-development. The user has approved the design in this conversation.

**Goal:** Paste a public Bilibili link and play its currently available MP4 stream with existing controls on the local machine.

**Architecture:** A resolver reads fixed Bilibili metadata/play endpoints and validates short-link redirects. An opaque in-memory media relay forwards only standard Bilibili CDN streams with Range and cancellation. The existing standalone player consumes the same-origin API and retains the canonical page URL for sharing.

**Tech Stack:** Node.js 18+ built-ins, node:test, vanilla JavaScript, existing HTML/CSS.

### Task 1: Resolver

Files: create lib/bilibili-resolver.js and test/bilibili-resolver.test.js.

- [x] Write and run failing tests using `node --test test/bilibili-resolver.test.js`. Fixtures supply upstream JSON; assertions verify selected CID, real quality, validated redirects, and errors before network requests for invalid input.
- [x] Export `parseBilibiliInput(value)`, `isAllowedMediaURL(value)`, `createBilibiliResolver({fetchImpl, timeoutMs})`. Parse BV/AV or supported host URLs, bound input size, validate page >= 1, follow at most 4 approved short-link redirects.
- [x] Request view and playurl with fnval=1, qn=64; reject paid/preview responses, missing/multiple/unsupported streams; retain only approved standard MP4 CDN candidates. Return `{video, streams}` with canonical page URL, page list and actual quality.
- [x] Run the resolver tests until all pass.

### Task 2: Relay and HTTP routing

Files: create lib/media-relay.js and test/server.test.js; modify server.js and package.json.

- [x] Add failing integration tests using `node --test test/server.test.js`: GET/HEAD byte ranges, expiry, unknown tokens, invalid ranges, CDN redirects, fallback, browser Origin/Host and loopback checks.
- [x] Implement `createMediaRelay({fetchImpl, now, ttlMs})` exposing `register(streams)` and `serve(req,res,token)`. Use random 32-byte tokens, bounded storage, upstream deadline, manual validated redirects, request timeout, streaming backpressure, and abort on response close.
- [x] Export `createServer(options)` without listening when required by tests. Add local-only resolve/stream routes; preserve current search/static APIs and direct execution startup. Add `npm test` as `node --test`.
- [x] Run full unit/integration suite and inspect status/headers for Range and errors.

### Task 3: Player integration

Files: modify public/player.js, public/player/index.html, public/api-config.js, public/app.js and public/index.html.

- [x] Configure loopback pages to use the local same-origin API while preserving explicit API_BASE overrides and existing hosted fallback.
- [x] Make source loading asynchronous with AbortController and a monotonically increasing request ID. Stop previous media, resolve Bili inputs, load the relay URL, display metadata, and retain canonical URL in history. Direct links and local files cancel pending resolution.
- [x] Add actual quality/source text, a part selector and original-page link. On Bili media errors, refresh at most once and restore progress; provide manual retry. Use textContent for upstream text.
- [x] Add the homepage “解析播放” link. Preserve existing official embed mode.
- [x] Test real playback, seek, rate, frame step, invalid links, part changes and switch races in a browser; regress sample and local-file playback.

### Task 4: Documentation and delivery

Files: README.md, docs/project-guide.md, local launch helper, outputs verification report and source archive.

- [x] Update current behavior and API documentation, clearly superseding historical “no stream parsing” decisions for this local testing implementation. Explain actual quality, local Node requirement, restrictions and limitations.
- [x] Run `npm test`, syntax checks, `git diff --check`, local HTTP checks and real upstream/browser smoke checks. Record observed results, without equating fixture tests with live success.
- [x] Provide the local project, one-click launcher and tested local URL. Keep changes local and leave the original downloaded guide unchanged.
