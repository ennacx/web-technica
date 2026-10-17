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

After the first successful online load and offline cache setup, all three tools can be opened offline. SRI hashing from a URL still needs an internet connection; hashing local files works offline. Only the site's static files are cached. Passwords, keys, passphrases, selected files, and fetched SRI resources are not stored in the offline cache.

Updates download in the background. When an update is ready, close all Web-Technica tabs and app windows, then reopen the app to apply it. Active tools are never automatically reloaded.

## Search Console and search indexing

The shared layout renders the Google ownership verification meta tag from `src/_data/site.json`. Keep the token after verification. `site.url` is the production origin (without a path); Eleventy's `pathPrefix` supplies the deployment subdirectory.

Eleventy generates `/sitemap.xml` from its HTML page collection and adds an absolute canonical URL to each indexable page. New pages are included automatically. Use `sitemap: false` to omit a page from the sitemap, or `noindex: true` to also render a robots `noindex` meta tag. Pages with `eleventyExcludeFromCollections: true` are omitted; 404 and offline fallback pages also use `noindex`.

After deploying:

1. Verify the URL-prefix property `https://ennacx.github.io/web-technica/` in Google Search Console using the HTML meta tag method.
2. Submit `https://ennacx.github.io/web-technica/sitemap.xml` in the Sitemaps report.
3. Use URL Inspection to check the home page and tool pages.

No project-level `robots.txt` is generated: crawlers only use `https://ennacx.github.io/robots.txt`, not `/web-technica/robots.txt`. Submit the sitemap directly in Search Console. `lastmod` is intentionally omitted because build time and source file timestamps do not reliably describe meaningful page updates.

References: [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [robots.txt location](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec).

## License

[MIT](LICENSE)
