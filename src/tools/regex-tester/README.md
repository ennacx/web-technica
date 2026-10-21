# Regex Tester

[Open Regex Tester](https://ennacx.github.io/web-technica/regex-tester/) · [Web-Technica overview](../../../README.md)

Test JavaScript regular expressions in a dedicated module Worker. Inspect whole matches and captures in the results list while match highlights appear directly behind the editable test text. This initial implementation remains **In development**; PCRE2 and Python engines are planned and are not selectable yet.

## Pattern, flags, and execution

Enter a pattern without surrounding `/` delimiters and enter your test text. Both inputs start empty. Choose Load sample to try an email-matching example with named captures; it uses the same execution path as your input. Available flags are `g` (all matches), `i` (ignore case), `m` (multiline anchors), `s` (dot matches newlines), and `u` (Unicode mode). Without `g`, only the first match is returned. If either the pattern or test text is empty, Auto does not schedule execution and Run is disabled. Clearing either input cancels pending or running work and clears results; the status identifies the missing input. Whitespace is meaningful and is not trimmed. Nonempty patterns that produce zero-width matches, such as `(?:)` or lookarounds, remain supported. The engine adds `d` internally to obtain exact capture offsets.

**Auto**, the default, waits 300 ms after the last input change. **Manual** waits for **Run**. Run also executes immediately in Auto. Changing pattern, flags, text, or mode cancels pending and running work and clears obsolete matches and highlights. IME composition postpones Auto until composition ends. Scrolling or resizing the editor synchronizes its highlight layer without executing the engine.

### Empty input versus zero-width matches

Only an empty input string suppresses execution; a nonempty pattern that matches an empty range still executes. These boundary cases are regression-tested through the controller and JavaScript engine with `g`, in both Auto and Manual. Manual requires Run for executable cases. Offsets below are zero-based UTF-16, end-exclusive.

| Pattern | Test text | Expected behavior |
|---|---|---|
| `''` (empty input) | `ABCDE` | `idle`; no execution or Worker creation |
| `' '` (one space) | `A B C` | Executes; two matches at `[1, 2)` and `[3, 4)` |
| `(?:)` | `ABCDE` | Executes; six zero-width matches at offsets 0 through 5 |
| `(?=B)` | `ABCDE` | Executes; one zero-width lookahead match at `[1, 1)` |
| `A` | `''` (empty input) | `idle`; no execution or Worker creation |

The input guard belongs to the execution controller. Low-level native-engine tests also cover empty patterns to verify JavaScript matching semantics; they do not enable empty-form execution in the UI.

### Execution timeout

The controller starts a fresh Worker for each execution and terminates it after completion, cancellation, or failure. **Timeout**, beside Run mode, adjusts the execution limit from **0.5 to 10.0 seconds**, in **0.1-second steps**, initially **1.5 seconds**. Dragging updates the displayed seconds; committing a change cancels obsolete work and schedules Auto, or waits for Run in Manual. The chosen limit is captured for each request and includes Worker startup and execution. If it expires, the Worker is terminated and the mode switches to Manual. Edit the input or timeout and choose Run to retry, or explicitly switch back to Auto. Nothing is automatically retried after timeout. Load sample keeps your selected timeout; reloading restores the default. Navigating away cancels execution; returning from the browser's back/forward cache restores the selected mode.

## Results and offsets

Expand a match to inspect captures. Numbered groups and named groups are shown as separate entries; a named capture therefore also appears in the numbered list. Positions are zero-based UTF-16 code-unit offsets with an exclusive end: `[start, end)`. Emoji can occupy two code units. Lookaround captures can be outside the whole match. `(not matched)` has no offsets; `(empty)` has equal start and end. Empty whole matches have a thin vertical marker in the test-text editor, without inserting a character or shifting following text.

Matches cycle through ten muted colors in occurrence order. A match's background/underline in the test editor and its result card use the same color; match 11 reuses match 1's color. Capture entries cycle independently in their displayed order (numbered entries, then named entries), keeping their labels and offsets. Named entries are separate rows and may use a different color from their numbered counterpart. Capture colors currently apply to the list; the editor continues to highlight whole matches. Backgrounds use 20% opacity to blend with the dark theme. The palette lives in `src/assets/css/_variables.scss`; its generated CSS count controls the renderer's cycle. Color supplements match numbers, group labels, and offsets.

The lower results panel is dedicated to Matches; there are no results-view tabs. A pointer-transparent, screen-reader-hidden layer behind the test textarea paints match backgrounds and zero-width markers. The textarea keeps its native text, caret, selection, placeholder, and IME behavior. Font metrics, padding and tab stops are shared between layers; horizontal and vertical scroll offsets and the viewport excluding native scrollbars are synchronized. Input changes and pending/error states clear highlights while the entire source remains readable and editable. The backing layer preserves the full text (and a final empty line for a trailing newline) so highlighting limits do not alter scroll geometry.

Match metadata, syntax errors, no matches, waiting, running, timeout, input limits, and Worker failures appear in the input heading beside the JavaScript badge (below the heading on mobile). The status uses a single-line-height viewport, vertically centered with the heading and badge, so updates do not move the pattern field or textarea. Longer messages wrap and scroll vertically within the focusable status area. JavaScript does not supply a reliable syntax-error position, so none is invented.

The **Copy regular expression** icon at the right of the pattern field copies the entered pattern wrapped in `/` delimiters, followed by the selected flags. For example, `[^1-9a-t]` with `g` and `i` becomes `/[^1-9a-t]/gi`. The pattern is kept as entered; copying does not rewrite or validate its syntax. Only checked flags are copied, including none if all are unchecked; the internal `d` flag is not added. Copy works without test text or a completed execution, including while fixing syntax errors, and is disabled for an empty pattern or during IME composition. Success or failure appears in a separate dismissible notification below results; execution status stays intact. If clipboard access fails, check browser permissions and try again, or copy manually.

**Load sample**, below results beside Reset layout, loads the built-in example pattern, flags, and text in the current run mode. In Manual, choose Run afterwards. Match-result copying and saving are not implemented; use normal text selection. Inputs and layout reset on reload.

## Workspace layout

Drag the horizontal handle below either panel with a mouse, pen, or touch to resize that panel independently. The workspace has no fixed total height: enlarging either panel grows the page without shrinking the other. Input height ranges from 400 to 1600 pixels (mobile minimum: 480), with an initial height of 480 pixels (mobile: 560). Results range from 320 to 2400 pixels, initially 400 pixels. Both panels scroll independently. These are provisional UI sizes. Double-click a handle to restore that panel's initial height, or choose **Reset layout** to reset both panels. With a handle focused, use Up / Down to move by 10 pixels (Shift: 50), Home / End to reach the limits, and Enter to reset that panel.

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
| Highlighted ranges | Within the first 100,000 UTF-16 code units; the full test text remains visible |
| Match / capture value in list | First 1,000 code units per value, followed by an ellipsis if shortened |

Reaching an execution limit sets a truncation reason and can leave a partial result. This is distinct from no matches. Reaching the display limit shortens rendering while retaining the collected result. The overlay highlights collected matches only, and its status identifies truncated results and the highlight range limit. Test text beyond the highlight limit stays visible and editable. Narrow the input or pattern to inspect later matches.

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

Next: measure ReDoS cancellation and Worker startup costs in real browsers; profile large-input rendering and memory; tune limits, incremental rendering and pagination as evidence warrants. Then specify PCRE2 WASM / Python runtime integration and their native offset conversion. PCRE2, Python, replacement, match-result copying, and save are not implemented. Publication remains a separate step after verification.

Native matching and capture-index behavior follow the [ECMAScript RegExp specification](https://tc39.es/ecma262/multipage/text-processing.html#sec-regexp-prototype-matchall).
