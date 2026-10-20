# Regex Tester

[Open Regex Tester](https://ennacx.github.io/web-technica/regex-tester/) · [Web-Technica overview](../../../README.md)

Test JavaScript regular expressions in a dedicated module Worker. Inspect whole matches, numbered and named captures, and a read-only highlighted view of the test text. This initial implementation remains **In development**; PCRE2 and Python engines are planned and are not selectable yet.

## Pattern, flags, and execution

Enter a pattern without surrounding `/` delimiters and enter your test text. Both inputs start empty. Choose Load sample to try an email-matching example with named captures; it uses the same execution path as your input. Available flags are `g` (all matches), `i` (ignore case), `m` (multiline anchors), `s` (dot matches newlines), and `u` (Unicode mode). Without `g`, only the first match is returned. If either the pattern or test text is empty, Auto does not schedule execution and Run is disabled. Clearing either input cancels pending or running work and clears results; the status identifies the missing input. Whitespace is meaningful and is not trimmed. Nonempty patterns that produce zero-width matches, such as `(?:)` or lookarounds, remain supported. The engine adds `d` internally to obtain exact capture offsets.

**Auto**, the default, waits 300 ms after the last input change. **Manual** waits for **Run**. Run also executes immediately in Auto. Changing pattern, flags, text, or mode cancels pending and running work and clears obsolete results. IME composition postpones Auto until composition ends. Results view changes do not execute the engine.

The controller starts a fresh Worker for each execution and terminates it after completion, cancellation, or failure. **Timeout**, beside Run mode, adjusts the execution limit from **0.5 to 10.0 seconds**, in **0.1-second steps**, initially **1.5 seconds**. Dragging updates the displayed seconds; committing a change cancels obsolete work and schedules Auto, or waits for Run in Manual. The chosen limit is captured for each request and includes Worker startup and execution. If it expires, the Worker is terminated and the mode switches to Manual. Edit the input or timeout and choose Run to retry, or explicitly switch back to Auto. Nothing is automatically retried after timeout. Load sample keeps your selected timeout; reloading restores the default. Navigating away cancels execution; returning from the browser's back/forward cache restores the selected mode.

## Results and offsets

Expand a match to inspect captures. Numbered groups and named groups are shown as separate entries; a named capture therefore also appears in the numbered list. Positions are zero-based UTF-16 code-unit offsets with an exclusive end: `[start, end)`. Emoji can occupy two code units. Lookaround captures can be outside the whole match. `(not matched)` has no offsets; `(empty)` has equal start and end. Empty whole matches have a visible marker in Highlight.

Choose **Highlight** to inspect a read-only rendering of the executed text snapshot, or **Matches** to return to the list. Source text remains editable and selectable in its textarea. Match metadata, syntax errors, no matches, waiting, running, timeout, input limits, and Worker failures appear in the input heading beside the JavaScript badge (below the heading on mobile). The status uses a single-line-height viewport, vertically centered with the heading and badge, so updates do not move the pattern field or textarea. Longer messages wrap and scroll vertically within the focusable status area. JavaScript does not supply a reliable syntax-error position, so none is invented.

**Load sample**, below results beside Reset layout, loads the built-in example pattern, flags, and text in the current run mode. In Manual, choose Run afterwards. There is no copy or save command yet; use normal text selection. Inputs and layout reset on reload.

## Workspace layout

Drag the horizontal handle with a mouse, pen, or touch to resize the input panel. The workspace has no fixed total height: enlarging the input panel grows the page without shrinking results. Input height ranges from 400 to 1600 pixels (mobile minimum: 480), with an initial height of 480 pixels (mobile: 560). Results have their own viewport-based height of 320–560 pixels. These are provisional UI sizes. Double-click the handle or choose **Reset layout** to restore the initial input height. With the handle focused, use Up / Down to move by 10 pixels (Shift: 50), Home / End to reach the limits, and Enter to reset.

Test text and results scroll independently. The stacked layout remains on mobile; the page also scrolls when taller than the viewport.

## Initial execution and display limits

These provisional limits provide a starting guard while ReDoS and DOM performance measurements remain on the roadmap. They are centralized in `js/result.js` and are not a performance guarantee.

| Limit | Initial value |
|---|---|
| Pattern / test text | 10,000 / 1,000,000 UTF-16 code units |
| Execution timeout | 500–10,000 ms; initial 1,500 ms; step 100 ms |
| Auto debounce | 300 ms |
| Collected matches | 1,000 |
| Collected capture entries | 10,000, counting numbered and named entries |
| Visible match cards | First 100 |
| Visible capture entries per card | First 100 |
| Highlighted text | First 100,000 UTF-16 code units |
| Match / capture value in list | First 1,000 code units per value, followed by an ellipsis if shortened |

Reaching an execution limit sets a truncation reason and can leave a partial result. This is distinct from no matches. Reaching the display limit shortens rendering while retaining the collected result. Highlight shows collected matches only, and its status identifies truncated results and shortened text. Narrow the input or pattern to inspect later results.

## Compatibility, privacy, and offline use

Use a modern browser supporting module Workers and RegExp match indices (`d`), plus CSS Grid, Pointer Events, ResizeObserver, and dynamic viewport units for the workspace. Enable JavaScript and serve over HTTP(S), rather than opening the HTML as a local file. If a Worker cannot load, check browser support and whether the site's scripts are available; no main-thread execution fallback is used. If results have cleared in Manual, choose Run. For syntax errors, correct the pattern or flags; for input limits, reduce the input; for timeouts, simplify the pattern or shorten the text before retrying.

Patterns and test text stay in browser memory: they are not uploaded, logged, added to the URL, or saved to browser storage. Worker and engine modules are static site assets included in the shared PWA cache. Offline execution requires an initial successful load and cache setup. Real-browser module Worker loading, mobile touch, assistive technology, and installed PWA behavior still need device verification; automated tests include a Node Worker bridge rather than a browser engine.

## Implementation boundaries and roadmap

The current flow stays within the tool, using native ES modules without a bundler or new dependencies:

| File in `js/` | Responsibility |
|---|---|
| `index.js` | DOM input entry point: snapshot pattern, flags, text and mode; handle input / IME events; connect controller, rendering, layout and page lifecycle |
| `controller.js` | Debounce, monotonic request IDs, cancellation, timeout, mode and adapter lifecycle |
| `engine-adapter.js` | Create engine-specific module Worker, send requests, report results and transport failures |
| `workers/javascript.worker.js` | Worker message entry point |
| `engines/javascript.js` | Native RegExp execution and normalized ranges |
| `result.js` | Shared result / error contract and provisional limits |
| `render.js` | Text-only DOM rendering, bounded match list, highlight and status |
| `split-pane.js` | Independent workspace height control |

Requests include `requestId`, `engine`, `pattern`, `flags`, `text`, and the controller's bounded `timeoutMs`. Timeout bounds, default and step live in `LIMITS`; the controller also clamps and rounds direct callers' settings. Results include `requestId`, `engine`, `offsetUnit: 'utf-16'`, `status`, `matches`, `truncated`, `truncationReason`, `elapsedMs`, and `error`. Matches carry `start`, `end`, numbered `groups`, and `namedGroups`. Capture ranges have nullable `start` and `end`; named ranges use `name`, numbered ranges use `index`. Text is derived from the request snapshot instead of repeated in Worker messages. Errors carry `code`, `message`, and nullable `position`. Future engines must normalize their native offsets before returning this contract.

Next: measure ReDoS cancellation and Worker startup costs in real browsers; profile large-input rendering and memory; tune limits, incremental rendering and pagination as evidence warrants. Then specify PCRE2 WASM / Python runtime integration and their native offset conversion. PCRE2, Python, replacement, copy, and save are not implemented. Publication remains a separate step after verification.

Native matching and capture-index behavior follow the [ECMAScript RegExp specification](https://tc39.es/ecma262/multipage/text-processing.html#sec-regexp-prototype-matchall).
