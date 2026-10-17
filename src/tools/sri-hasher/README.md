# SRI Hasher

Generate Subresource Integrity values and HTML tags for JavaScript and CSS resources using SHA-256, SHA-384, or SHA-512.

[Open SRI Hasher](https://ennacx.github.io/web-technica/sri-hasher/) · [All tools and site information](../../../README.md)

## Hash a CDN resource

1. Select **CDN URL**.
2. Enter the JavaScript or CSS **Resource URL**.
3. Choose a **Hash algorithm**.
4. Select **Generate SRI**.
5. Copy the **Integrity value** with **Copy SRI**, or the generated tag with **Copy Tag**.

The URL is fetched only when you select Generate SRI. The request contacts the resource host and needs an internet connection. The host must permit cross-origin requests through CORS. HTTP resources may be blocked when the tool is opened over HTTPS.

The tool makes a CORS GET request without credentials or a referrer. It does not run the downloaded JavaScript or apply downloaded CSS. HTTP and network errors produce an error instead of an integrity value for the error response.

Supported URLs identify `.js` or `.css` resources. URLs whose resource name appears in a `file` or `filename` query parameter are also supported.

## Hash a local file

1. Select **Local File**.
2. Choose a `.js` or `.css` file from your device.
3. Choose a hash algorithm and select **Generate SRI**.
4. Copy the integrity value or tag.
5. Update the generated tag's relative file path to match where you will publish the file.

Local files are read on your device and are never uploaded. Empty JavaScript and CSS files are supported. The hash is based on the file's bytes, so changes to whitespace, line endings, or encoding change its integrity value.

If a CDN cannot be fetched because of CORS or connectivity, download the resource yourself and use Local File. Make sure that the file is the same resource you intend to publish or load.

## Use the output

An integrity value combines the algorithm name and a Base64-encoded digest, for example in the form `sha384-...`. Copy the full value, including the algorithm prefix.

For JavaScript, the tag output uses a `script` element. For CSS, it uses a stylesheet `link` element. The tag includes `integrity` and `crossorigin="anonymous"` attributes.

Use a trusted, versioned resource URL. Regenerate the integrity value whenever the resource's contents change. Cross-origin loading with SRI also needs the resource host's CORS support.

SRI checks that the served bytes match the expected digest. It does not establish whether the resource is trustworthy or safe. The tool does not deploy or modify your site's HTML; you must place the copied tag or integrity value in your own page.

## Privacy and offline use

| Mode | Network access | Offline use |
|---|---|---|
| CDN URL | Contacts the resource host when Generate SRI is selected | Requires an internet connection |
| Local File | No upload | Works offline after the site's initial load and successful cache setup |

Selected files and fetched resources are not stored in the site's offline cache. Generated results are not automatically saved in browser storage. See [installation and offline use](../../../README.md#install-and-use-offline).

## Troubleshooting

| Problem | What to check |
|---|---|
| URL is rejected | Use an HTTP(S) JavaScript or CSS URL, or a supported resource-name query parameter |
| Fetch fails | Check connectivity, the response status, CORS, and whether HTTPS is blocking an HTTP resource |
| The hash differs from a previous value | Confirm the resource version, exact bytes, line endings, and selected algorithm |
| A generated local tag points to the wrong location | Replace its relative path with the file's actual published path |
| Copy fails | Select and copy the displayed value or tag manually |

Editing the resource settings clears the old result so it is not confused with a new resource or algorithm.

## License

Part of Web-Technica, licensed under [MIT](../../../LICENSE).
