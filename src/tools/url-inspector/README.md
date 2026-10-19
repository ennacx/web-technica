# URL Inspector

Inspect, edit, and rebuild URLs and query parameters locally in your browser.

[Open URL Inspector](https://ennacx.github.io/web-technica/url-inspector/) · [All tools and site information](../../../README.md)

The current version is an interactive mockup with `develop` status. The page uses `noindex`. Additional editing features are future work, described in the [roadmap](#roadmap).

## Start editing

1. Paste or type an absolute URL into **Current URL**, or select **load a sample**.
2. Check the **Valid URL / Invalid URL** indicator. Parsing runs as you type.
3. Edit **URL Components** and select **Apply changes**, or edit rows in **Query Parameters**.
4. Use **Store as Original** to save a restore point, or **Reset** to return to it.
5. Select **Copy URL** to copy the complete Current URL.

Action results, including failed copy attempts, appear below the Current URL panel. On mobile screens, scroll the query table horizontally to reach all controls.

## Current URL and Original URL

Current URL is the editable source text. Original URL is a read-only restore point that ordinary edits do not update.

| Operation | Current URL | Original URL |
|---|---|---|
| First valid input | Keeps the text exactly as entered | Saves that text automatically once |
| Direct editing | Keeps the entered text, including incomplete or invalid input | Unchanged |
| Component or query editing | Rebuilds the URL using standard APIs | Unchanged |
| Store as Original | Unchanged; must be valid | Replaces the restore point with Current URL |
| Reset | Restores Original and synchronizes the editors | Unchanged |
| Clear | Empties Current URL | Kept for a later Reset |
| Copy URL | Copies the complete text, even if invalid | Unchanged |

Original starts unset. Once the first valid URL has been saved, further valid input does not replace it automatically. Invalid input cannot be stored as Original. Reloading the page clears both URLs.

## Edit URL components

The component form provides **Protocol**, **Hostname**, **Port**, **Pathname**, and **Fragment**. Open **Credentials** to edit **Username** and **Password**.

Protocol displays its trailing `:` as a fixed suffix, and Fragment displays its leading `#` as a fixed prefix. Enter `https` or `results` without those delimiters. Leave Fragment empty to remove it. An additional `#` typed into the Fragment field is part of the fragment content.

Draft values stay in the form until you select **Apply changes** or press Enter. Changes are applied together. If a setter rejects a value, an error identifies the field, the draft remains available to correct, and Current URL is unchanged.

The Password field is masked by default; **Show password** reveals it. Current URL and Original URL still display credentials in their complete text, and Copy URL includes them.

Direct edits to Current URL, Reset, and Clear resynchronize the component form, replacing pending component drafts.

### Path segments

A read-only breadcrumb-style list follows the Pathname field as you type, including pending edits before Apply changes. It also updates when Current URL is parsed or restored. The list does not edit the path or create navigation links.

The list always starts with `Root /`; an empty path or `/` displays only that item. Segments are split on literal `/` characters before any decoding. The initial slash is represented by Root. Empty segments within the path appear as `(empty)`, and a final empty segment appears as `Trailing /`. For example, `/a//b%2Fc/` displays `Root / › a › (empty) › b%2Fc › Trailing /`. Repeated slashes remain distinct: `//` displays `Root / › (empty) › Trailing /`. Percent-encoded text stays encoded, so `%2F` remains inside its segment. Invalid Current URL input retains the last valid path preview along with the other component values.

## Edit query parameters

The table displays decoded keys and values.

| Operation | Behavior |
|---|---|
| Edit Key / Value | Applies when the field loses focus or you press Enter |
| Add parameter | Appends a row with an empty key and value |
| Delete | Removes the selected row |
| Move up / down | Moves the selected row one position |

Duplicate keys, empty keys, and empty values are supported. Rows retain their order, and keys are never sorted automatically. Committing a text edit keeps the existing table fields in place.

For example, `?tag=photo&tag=travel` remains two separate rows. In `?a=1&b=2?c=3`, the second row has key `b` and value `2?c=3`; the second question mark does not start another parameter.

## Normalization and encoding

Parsing direct input does not rewrite Current URL. Structured edits rebuild it using the standard `URL` and `URLSearchParams` APIs, which may change its representation:

- Hostnames may become lowercase or use Punycode for internationalized domains.
- Default ports may be omitted.
- Query edits may turn spaces encoded as `%20` into `+`.
- A key-only query such as `?flag` becomes `?flag=` after query editing.
- Empty query separators may disappear.

Query editing prioritizes parameter semantics rather than preserving every original spelling. Changes to encoding or parameter order can affect signed URLs. Reset restores the exact text saved as Original.

## Invalid URLs and incomplete input

Validation uses the browser's standard `URL` API. Absolute URLs are supported; relative URLs without a base are not. Schemes are not restricted, but some components, such as opaque paths in `mailto:` URLs, cannot be changed through setters.

| Current URL state | Structured editors |
|---|---|
| Valid | Display the parsed URL and allow editing |
| Invalid or cleared after a valid URL | Show **Last valid state** and disable editing while retaining the previous parsed values |
| Invalid or empty before any valid URL | Remain empty and disabled |
| Fixed to a valid URL | Update the parsed values and enable editing again |

Current URL remains editable and retains invalid text. A successful parse checks syntax only; it does not establish whether a URL is safe or reachable.

## Privacy and offline use

URL parsing and editing run on your device. The tool does not visit input URLs, expand shortened URLs, follow redirects, or send input to external APIs. URLs are not saved to persistent browser storage. Copy runs only when requested, and reloading or closing the page does not preserve the editing session.

All current features work offline after the site's initial online load and successful offline cache setup. Only static application files are cached. See [installation and offline use](../../../README.md#install-and-use-offline).

## Troubleshooting

| Problem | What to check |
|---|---|
| Current URL is invalid | Enter an absolute URL with a scheme, such as `https://example.com/` |
| Structured editing is disabled | Fix Current URL; the visible fields may be showing the last valid state |
| A component cannot be applied | Check the indicated value and whether the URL scheme supports editing that component |
| Query encoding changes after editing | Query rebuilding uses `URLSearchParams`; use Reset to restore the saved text |
| Reset is unavailable | Original must be set and differ from Current URL |
| Copy fails | Select and copy Current URL manually |

## Roadmap

The following features are candidates, not currently available functionality:

- Undo / Redo.
- Query parameter sorting.
- General-purpose Encode / Decode operations.
- Additional copy actions and component details.
- Explicitly clearing Original.
- Relative URL resolution with a base URL.
- Normalization details and differences between original and rebuilt URLs.
- Improvements for large query tables.

Shortened URL expansion and redirect tracking are outside this tool's planned scope.

## References

- [WHATWG URL Standard](https://url.spec.whatwg.org/) — The official living standard defining URL parsing, serialization, and the URL and URLSearchParams APIs.
- [MDN: URL API](https://developer.mozilla.org/en-US/docs/Web/API/URL_API) — Developer documentation and practical examples for working with URLs in JavaScript.

## License

Part of Web-Technica, licensed under [MIT](../../../LICENSE).
