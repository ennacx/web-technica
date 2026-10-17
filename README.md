# Web-Technica

A collection of lightweight, privacy-friendly web utilities for developers.

[Open Web-Technica](https://ennacx.github.io/web-technica/)

## Offline availability

Tool cards and tool pages show one of these capability labels. They describe which features can work offline, rather than the current connection or cache status. Offline use requires a successful initial online load and offline cache setup.

| Label | Availability |
|---|---|
| Offline ready | All features work offline. |
| Limited offline | Some features work offline; others need an internet connection. |
| Online only | An internet connection is required to use the tool. |

| Tool | Offline support | Limitations |
|---|---|---|
| [Password Generator](https://ennacx.github.io/web-technica/pwdgen/) | Offline ready | All generation features work offline. |
| [JSON Editor](https://ennacx.github.io/web-technica/json-editor/) | Offline ready | All editing, formatting, validation, and sorting features work offline. |
| [Keypair Generator](https://ennacx.github.io/web-technica/keygen/) | Offline ready | All generation and export features work offline. |
| [SRI Hasher](https://ennacx.github.io/web-technica/sri-hasher/) | Limited offline | Local files work offline. Fetching a URL requires an internet connection. |

## Password Generator

[Open Password Generator](https://ennacx.github.io/web-technica/pwdgen/)

Generate random passwords, hexadecimal strings, or version 4 UUIDs in your browser.

1. Choose a length and character types. You can exclude ambiguous characters, exclude specific symbols, or prevent repeated characters.
2. Select **Generate Password** and use the copy button to copy the result.
3. For multiple results, enter a quantity in **Batch Generation**, select **Generate Batch**, then copy or download the results as a text file. You can generate up to 10,000 results at once.

**Web Crypto** is the default randomness source for passwords. **Math** is available for non-sensitive random strings and should not be used for passwords or secrets.

Generation runs locally. Generated values are not uploaded or saved by the site. Clipboard and downloads are used only when you request them.

## JSON Editor

[Open JSON Editor](https://ennacx.github.io/web-technica/json-editor/)

Edit, format, minify, validate, and naturally sort JSON keys in your browser. This is the Phase 1 code editor; tree editing and advanced editing tools are planned for later phases.

1. Paste JSON in **Edit**, or select **Load sample** when the source is empty. Enter continues indentation, and closing braces and brackets align with their opening line.
2. Choose **Pretty Print** to rebuild the layout, **Minify** to remove whitespace outside strings, or **Indent** to change leading indentation while keeping existing line breaks. Indentation supports 2, 4, or 8 spaces.
3. Select **Sort Ascending** or **Sort Descending** to naturally sort keys in every object, including objects inside arrays. The single button shows the next direction. Array element order and duplicate keys are preserved; keys that compare equally keep their original order.
4. Use **Copy** or **Save** for the current mode's text. Select the pencil beside the file name, edit it, and confirm with the check button or Enter to change the download name. Escape cancels the rename; extensions are not added automatically.

| Operation | Edit | View |
|---|---|---|
| Direct editing | Changes the source | Read-only |
| Pretty Print / Minify / Sort / Indent | Changes the source | Changes the display only |
| Validate | Checks the source | Checks the same source |
| Copy / Save | Exports the source | Exports the displayed text |

View keeps its format, sort direction, and indentation settings. When you change the source, View regenerates from that source and those settings when needed. Invalid JSON can still be viewed, copied, and saved. Formatting and sorting are disabled until syntax errors are fixed; Indent remains available in Edit. View shows invalid source text as entered, then reapplies its saved settings after you fix it. Error locations refer to the source in Edit.

Formatting, minifying, and sorting preserve number spellings, string escapes, and duplicate keys. Sorting compares decoded key names using natural order, so `item2` precedes `item10`. Validation checks JSON syntax, not JSON Schema or duplicate-key uniqueness.

JSON stays in your browser without uploads or automatic browser storage. Copy and Save run only when requested. The code view includes syntax colors and line numbers; action feedback appears in the editor's upper-right corner.

## Keypair Generator

[Open Keypair Generator](https://ennacx.github.io/web-technica/keygen/)

Generate RSA, Ed25519, Ed448, or ECDSA key pairs locally in your browser.

1. Choose an algorithm and key size or curve, and optionally enter a comment.
2. To encrypt the private key, enable the passphrase option, enter it twice, and select a private key format.
3. Select **Generate Key Pair**, then copy or download the public and private keys. Expand **Private Key** to view its contents.

Exports include PEM, OpenSSH public keys, and PuTTY PPK v3. The legacy custom ChaCha20-Poly1305 format requires a compatible reader and is not supported by standard OpenSSH clients. Ed448 support varies by application.

Keys and passphrases are processed locally without being uploaded or saved by the site. Passphrase fields are cleared after generation. Keep private keys and passphrases secure; this site cannot recover them. Changing settings or selecting **Reset** clears the generated output.

Optional pointer sampling selects one of seven independently generated key pairs. It does not replace cryptographic randomness or measure entropy.

## SRI Hasher

[Open SRI Hasher](https://ennacx.github.io/web-technica/sri-hasher/)

Generate SHA-256, SHA-384, or SHA-512 integrity values and HTML tags for JavaScript and CSS resources.

1. Choose **CDN URL** or **Local File**, then enter the resource URL or select a `.js` or `.css` file.
2. Choose a hash algorithm and select **Generate SRI**.
3. Copy the integrity value or HTML tag. For a local file, adjust the generated relative path to its published location.

URL mode contacts the resource host and requires CORS support. Local files are read and hashed on your device without being uploaded. If a remote resource cannot be fetched, download it yourself and use **Local File**.

Use a trusted, versioned resource. Regenerate the integrity value whenever its contents change.

## Install and use offline

Use your browser's **Install app** command, or **Add to Home Screen** on iPhone and iPad. Installation availability depends on your browser. The installed app opens the tool list.

After the first successful online load and offline cache setup, all four tools can be opened offline. SRI hashing from a URL still needs an internet connection; hashing local files works offline. Only the site's static files are cached. Passwords, keys, passphrases, JSON documents and file names, selected files, and fetched SRI resources are not stored in the offline cache.

Updates download in the background. When an update is ready, close all Web-Technica tabs and app windows, then reopen the app to apply it. Active tools are never automatically reloaded.

## JSON Editor roadmap

Phase 1 provides the current text-based editor. Later phases describe future work, not currently available features.

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

[MIT](LICENSE)
