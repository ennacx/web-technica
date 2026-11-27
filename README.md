# Web-Technica

A collection of lightweight, privacy-friendly web utilities for developers. Built with Eleventy as a static Progressive Web App (PWA), hosted on GitHub Pages.

[Open Web-Technica](https://ennacx.github.io/web-technica/)

Use the tools without registration or installation. Processing runs in your browser. SRI Hasher also accepts resource URLs, which require a network request. The interface supports desktop and mobile browsers.

## Tools and usage guides

The table follows the [tool registry](src/_data/tools.json). Each guide covers usage and limitations. Routed development tools appear in the site navigation with an **In development** badge and are excluded from search indexing and the sitemap. The deployed site shows the tools included in its latest build.

| Tool / guide | Purpose | Status | Open the tool | Offline support |
|---|---|---|---|---|
| [Password Generator](src/tools/pwdgen/README.md) | Cryptographic passwords, hexadecimal strings, and UUID v4 | `published` | [Open](https://ennacx.github.io/web-technica/pwdgen/) | Offline ready |
| [URL Inspector](src/tools/url-inspector/README.md) | Inspect, edit, and rebuild URLs and query parameters | `published` | [Open](https://ennacx.github.io/web-technica/url-inspector/) | Offline ready |
| [JPEG Metadata Inspector](src/tools/jpeg-metadata/README.md) | Inspect JPEG metadata, strip supported metadata, or remove GPS data from supported Exif | `develop` | [Development build path](src/tools/jpeg-metadata/README.md#open-the-tool) | Offline ready |
| [Regex Tester](src/tools/regex-tester/README.md) | JavaScript regex matching, captures, and highlighting with Auto / Manual execution | `published` | [Open](https://ennacx.github.io/web-technica/regex-tester/) | Offline ready |
| [JSON Editor](src/tools/json-editor/README.md) | Edit, format, minify, validate, naturally sort JSON, and explore a read-only tree | `published` | [Open](https://ennacx.github.io/web-technica/json-editor/) | Offline ready |
| [Keypair Generator](src/tools/keygen/README.md) | Generate key pairs and export PEM, OpenSSH, or PPK | `published` | [Open](https://ennacx.github.io/web-technica/keygen/) | Offline ready |
| [SRI Hasher](src/tools/sri-hasher/README.md) | Generate integrity values and HTML tags for JS/CSS | `published` | [Open](https://ennacx.github.io/web-technica/sri-hasher/) | Limited offline |

## Offline availability

Capability labels describe the tool's features, not the current connection or cache state. Offline use requires a successful initial online load and offline cache setup.

| Label | Availability |
|---|---|
| Offline ready | All features work offline. |
| Limited offline | Some features work offline; others need an internet connection. SRI Hasher can hash local files offline, while URL fetching needs a connection. |
| Online only | An internet connection is required. |

## Install and use offline

Use your browser's **Install app** command, or **Add to Home Screen** on iPhone and iPad. Installation availability depends on your browser. The installed app opens the tool list.

After the initial online load and cache setup, you can open tool pages included in that build offline. The cache contains only static site files. Tool inputs and outputs, including passwords, keys, text, URLs, selected files, cleaned JPEGs, and fetched SRI resources, stay out of the offline cache.

Updates download in the background. When an update is ready, close all Web-Technica tabs and app windows, then reopen the app to apply it. Active tools are never automatically reloaded.

## License

[MIT](LICENSE). The bundled fonts retain their own licenses; see [Font licenses](https://ennacx.github.io/web-technica/assets/fonts/THIRD-PARTY-LICENSES.txt).
