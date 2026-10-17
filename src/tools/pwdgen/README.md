# Password Generator

Generate random passwords, hexadecimal strings, or version 4 UUIDs locally in your browser.

[Open Password Generator](https://ennacx.github.io/web-technica/pwdgen/) · [All tools and site information](../../../README.md)

## Generate a password

1. Set **Password Length** with the slider or number field. The range is 4–256 characters.
2. Choose the allowed **Character Types**: uppercase, lowercase, numbers, and symbols.
3. Adjust the options below if needed.
4. Select **Generate Password**.
5. Use the copy icon beside **Generated Password** to copy the result.

The selected character types define the pool of allowed characters. They do not require every result to contain a character from each selected type.

## Settings

| Setting | Behavior |
|---|---|
| Password Length | Sets the number of characters, except in UUID mode |
| Uppercase / Lowercase / Numbers / Symbols | Adds the corresponding characters to the allowed pool |
| Exclude these symbols | Removes specified symbols when symbols are enabled |
| Exclude ambiguous characters | Removes the characters listed beside this option |
| Do not repeat characters | Prevents a character from appearing twice within one result |
| Generate as a hex string | Uses lowercase hexadecimal characters |
| Generate UUID (v4) | Generates a UUID with a fixed length of 36 characters, including hyphens |

Selecting a special mode disables settings that do not apply. UUID mode uses the browser's UUID generator and does not use the configurable password character pool.

With **Do not repeat characters**, the requested length cannot exceed the available character pool. This option applies within each result; it does not promise uniqueness across a batch.

## Generate multiple results

1. Configure the generation options above.
2. Open **Batch Generation** directly, or select **Generate Multiple** to move to it.
3. Enter a whole-number **Quantity** from 1 to 10,000. Presets are available for 100, 1,000, and 10,000 results.
4. Select **Generate Batch**.
5. Select **Copy All** or **Download .txt**. Results are separated by line breaks.

Batch generation uses the same options as single generation, including hex and UUID modes. Large batches run in chunks so the page can remain responsive.

## Randomness and result statistics

**Web Crypto** is the default randomness source. The tool does not automatically fall back to Math if Web Crypto is unavailable.

**Randomness source** also offers **Math (non-sensitive strings only)**. Use that option only for non-sensitive data; it is not suitable for passwords or other secrets. UUID generation requires the browser's UUID API independently of this selection.

The result shows its length, character-pool size, estimated entropy, and generation time. The entropy estimate describes the number of possible outputs under the chosen settings. It does not measure the security of a particular account or guarantee resistance to every attack. The no-repeat estimate accounts for sampling without replacement.

## Privacy and offline use

Generation runs on your device. The tool does not upload results or save them in browser storage, URLs, or logs. Copy and downloads run only when requested.

All generation features work offline after the site's initial online load and successful offline cache setup. A supported browser with the required Web Crypto APIs is still needed. See [installation and offline use](../../../README.md#install-and-use-offline).

## Troubleshooting

| Problem | What to check |
|---|---|
| No characters are available | Select at least one character type and review exclusions |
| No-repeat generation is rejected | Reduce the length or expand the character pool |
| Length or quantity is rejected | Enter a whole number within the displayed range |
| Web Crypto or UUID generation is unavailable | Use a supported browser on HTTPS or localhost |
| Copy fails | Select and copy the result manually; batch results can also be downloaded |

## License

Part of Web-Technica, licensed under [MIT](../../../LICENSE).
