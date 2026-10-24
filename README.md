# Web-Technica

A collection of lightweight, privacy-friendly web utilities for developers. Built with Eleventy as a static Progressive Web App (PWA), hosted on GitHub Pages.

[Open Web-Technica](https://ennacx.github.io/web-technica/)

Use the tools without registration or installation. Processing runs in your browser where possible; features that fetch external resources identify their network requirements. The site uses a shared interface and supports desktop and mobile browsers.

## Tools and usage guides

Implemented tools have their own README beside their page source, with detailed instructions, settings, limitations, and offline behavior. Status values below follow the [tool registry](src/_data/tools.json): `published` tools are the site's published offerings, `develop` tools are available for testing while in development, and `planned` tools are not yet available. These categories describe the site's publication status, rather than deployment or device-testing completion.

The registry's `status` controls the shared site UI. Published tools have ordinary links; development tools with a URL appear in both the tool list and header menu with an **In development** badge. Planned tools appear as unlinked **Planned** cards and are omitted from the header. Tool page headings use the same status badge. Changing status requires rebuilding the site.

Tool pages with a status other than `published` use `noindex` and are excluded from the sitemap. Development badges and this indexing restriction are removed automatically when a tool becomes `published`.

| Tool / guide | Purpose | Status | Open the tool | Offline support |
|---|---|---|---|---|
| [Password Generator](src/tools/pwdgen/README.md) | Passwords, hexadecimal strings, and UUID v4 | `published` | [Open](https://ennacx.github.io/web-technica/pwdgen/) | Offline ready |
| [URL Inspector](src/tools/url-inspector/README.md) | Inspect, edit, and rebuild URLs and query parameters | `develop` | [Open](https://ennacx.github.io/web-technica/url-inspector/) | Offline ready |
| [Regex Tester](src/tools/regex-tester/README.md) | JavaScript regex matching, captures, and highlighting with Auto / Manual execution | `develop` | [Open](https://ennacx.github.io/web-technica/regex-tester/) | Offline ready |
| [JSON Editor](src/tools/json-editor/README.md) | Edit, format, minify, validate, and naturally sort JSON | `develop` | [Open](https://ennacx.github.io/web-technica/json-editor/) | Offline ready |
| [Keypair Generator](src/tools/keygen/README.md) | Generate key pairs and export PEM, OpenSSH, or PPK | `published` | [Open](https://ennacx.github.io/web-technica/keygen/) | Offline ready |
| [SRI Hasher](src/tools/sri-hasher/README.md) | Generate integrity values and HTML tags for JS/CSS | `published` | [Open](https://ennacx.github.io/web-technica/sri-hasher/) | Limited offline |

The [JSON Editor guide](src/tools/json-editor/README.md#roadmap) also describes its planned development phases. Future tools will have their own guides rather than adding full usage instructions to this page.

## Offline availability

Capability labels describe the tool's features, not the current connection or cache state. Offline use requires a successful initial online load and offline cache setup.

| Label | Availability |
|---|---|
| Offline ready | All features work offline. |
| Limited offline | Some features work offline; others need an internet connection. SRI Hasher can hash local files offline, while URL fetching needs a connection. |
| Online only | An internet connection is required. |

## Install and use offline

Use your browser's **Install app** command, or **Add to Home Screen** on iPhone and iPad. Installation availability depends on your browser. The installed app opens the tool list.

After the first successful online load and offline cache setup, all implemented tools listed above can be opened offline, including those in development. Planned tools are not yet available. SRI hashing from a URL still needs an internet connection; hashing local files works offline. Only the site's static files are cached. Passwords, keys, passphrases, JSON documents and file names, URLs entered into URL Inspector, regex patterns and test text, selected files, and fetched SRI resources are not stored in the offline cache.

Updates download in the background. When an update is ready, close all Web-Technica tabs and app windows, then reopen the app to apply it. Active tools are never automatically reloaded.

## License

[MIT](LICENSE). The bundled fonts retain their own licenses; see [Font licenses](https://ennacx.github.io/web-technica/assets/fonts/THIRD-PARTY-LICENSES.txt).
