# JSON Editor

Edit, format, minify, validate, and naturally sort JSON keys locally in your browser.

[Open JSON Editor](https://ennacx.github.io/web-technica/json-editor/) · [All tools and site information](../../../README.md)

The current release is Phase 1: a single-document code editor. Tree editing and advanced editing features are future work, described in the [roadmap](#roadmap).

## Start editing

1. Paste or type JSON in **Edit**. If the source is empty, **Load sample** fills it with an example and opens View.
2. Read the syntax indicator below the editor. Validation runs after a short typing pause, or immediately with **Validate**.
3. Use **Pretty Print**, **Minify**, **Sort Ascending / Descending**, or **Indent** as needed.
4. Select **View** to inspect the text with syntax colors and line numbers, or **Edit** to return to the editable source.
5. Use the copy or save icon in the document bar to export the current mode's text.

Action results, including failed copy or download attempts, appear in the editor's upper-right **Last action** notification. Typing or switching modes clears that notification.

## Edit and View are independent

Edit holds the source text. View derives a separate display from that source and its own settings.

| Operation | Edit | View |
|---|---|---|
| Direct editing | Changes the source | Read-only |
| Pretty Print | Rebuilds the source layout | Selects a pretty display without changing the source |
| Minify | Removes whitespace outside source strings | Selects a compact display without changing the source |
| Sort | Reorders source object members | Applies a display-only sort |
| Indent | Adjusts source leading indentation | Adjusts display indentation |
| Validate | Checks the source | Checks the same source |
| Copy / Save | Exports the source | Exports the displayed text |
| Character / line counts | Counts the source | Counts the displayed text |

View starts by showing the source as entered. It remembers its format, sort direction, and indentation. Switching modes alone retains the display. After the source or display settings change, View regenerates when needed. Edit-side changes do not reset View's settings.

For example, select Pretty Print and 4 spaces in View, then return to Edit. The source still has its original layout. If you edit it and open View again, it is shown using Pretty Print and 4 spaces.

## Pretty Print, Minify, and Indent

These operations have different purposes:

| Operation | Effect |
|---|---|
| Pretty Print | Reconstructs line breaks and indentation throughout the document |
| Minify | Removes whitespace and line breaks outside quoted strings |
| Indent | Changes leading indentation on existing lines, retaining line breaks and inline spacing |

**Indent** supports 2, 4, or 8 spaces and applies when you change the selection. It does not require pressing Pretty Print. For existing space-indented text, the smallest positive indentation on a nonblank line is used to infer its unit; additional alignment spaces smaller than that unit are kept. Tabs are converted using the relevant mode's indentation width.

In View, Minify keeps the display compact even if you change the indentation preference. Switching back to Pretty Print uses that saved width.

Only whitespace is changed by formatting or minifying. Number spellings, string escapes, and duplicate keys are retained. For example, these values are not rounded or rewritten:

```json
{
  "id": 9007199254740993,
  "decimal": 1.0000000000000000001,
  "exponent": 1e400,
  "escaped": "\u0061"
}
```

## Natural key sorting

The single sort button shows the **next action**, rather than the current sort state. It initially says **Sort Ascending**. After it runs, it changes to **Sort Descending**, then alternates. Edit and View keep independent sort directions.

- Keys are compared as decoded strings using natural order: `item1`, `item2`, `item10`.
- Numeric keys sort as `1, 2, 3, 10, 20, 100, 110` in ascending order.
- Every object is sorted, including nested objects and objects inside arrays.
- Array elements retain their order.
- Duplicate keys remain present. Keys that compare equally retain their original relative order, including in descending sorts.
- Key and value spellings are kept, including escaped key names, number notation, and string escapes.

The comparison uses an English collator with numeric comparison so it does not switch to the browser's UI locale. Sorting alone preserves the existing whitespace layout rather than also running Pretty Print or Minify.

View applies sorting before its selected display format, so sorting works together with Pretty Print, Minify, or indentation-only display. The setting is retained when you edit the source or temporarily introduce syntax errors.

## Syntax errors and incomplete input

Validation checks the source in Edit, regardless of the active mode. Error text and any reported line or column refer to that source, not the formatted display. The diagnostic wording and position details depend on the browser.

| Source state | Edit | View |
|---|---|---|
| Valid JSON | Editing, formatting, sorting, and Indent are available | Displays the selected format, sorting, and indentation |
| Invalid JSON | Editing and Indent remain available; formatting and sorting are disabled | Shows the source as entered; formatting, sorting, and Indent are disabled |
| Empty source | Ready for input; formatting and sorting are disabled | Shows the empty state; display operations are disabled |
| Fixed JSON | Normal editing resumes | Reapplies its saved settings |

You can switch to View while JSON is invalid. Syntax colors and line numbers remain available where possible. View settings are retained: if you were using Pretty Print / 4 spaces, that presentation returns after you fix the source.

Nonempty invalid JSON can still be copied or saved. A syntax error does not delete your text. The explanation beneath the editor describes which operations are unavailable.

Validation covers JSON syntax only. It does not validate JSON Schema or enforce unique keys. Duplicate keys are preserved, but other applications may interpret them differently.

## Typing assistance

In Edit:

- Enter inherits the current line's indentation.
- Enter immediately after `{` or `[` adds one level using the selected width.
- Enter between matching brackets, such as `{}` or `[]`, creates an inner editing line and a separate closing line.
- Typing `}` or `]` after only leading whitespace aligns it with its matching opening line. If no opening bracket is available, it reduces indentation by one level.

The assistance is local to the edit. It does not reformat the whole document or insert missing brackets. Strings and escapes are respected; IME composition and pasted chunks are not automatically adjusted. Browser support for cancellable input events and native Undo behavior varies. A dedicated document-wide Undo / Redo feature is not yet implemented.

## Copy, save, and rename

**Copy** copies the current mode's complete text. **Save** downloads that same text using the confirmed document name. In View this includes the display's formatting and sorting; it does not silently export the unmodified source.

To change the default `document.json` name:

1. Select the pencil beside the name.
2. Enter the new file name.
3. Select the highlighted check button or press Enter.

Escape cancels the rename. Blank names cannot be confirmed. The confirmed name is shared between modes and is used for downloads. A pending edit to the name is not used until confirmed. Extensions are not added automatically, so include `.json` if you want it.

## Privacy and offline use

JSON and file names stay in your browser. The tool does not upload them, save them to browser storage, write them into URLs, or cache them for offline use. Copy and Save run only when requested. Reloading or closing the page does not preserve the document.

All current features work offline after the site's initial online load and successful offline cache setup. Only static application files are cached. See [installation and offline use](../../../README.md#install-and-use-offline).

## Roadmap

Phase 1 provides the current text-based editor. The following features are plans, not currently available functionality.

### Phase 2 — Tree Viewer / Editor

- Display objects and arrays as a tree.
- Expand and collapse nodes.
- Edit values with awareness of their types.
- Add and remove keys and array elements.
- Synchronize the tree with the code view.

The goal includes editing directly in the tree, beyond a read-only viewer.

### Phase 3 — Usability and polish

- Undo / Redo.
- Search.
- Navigation by JSON path.
- Restore the original input.
- Improve large-document handling and performance.

### Phase 4 and beyond — JSON Diff and other ideas (tentative)

- Two-pane JSON comparison.
- Textual and structural differences.
- Rules for key order and array order.

Diff has lower priority and will be reconsidered when needed. It may become a separate tool.

## License

Part of Web-Technica, licensed under [MIT](../../../LICENSE).
