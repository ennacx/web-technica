# Keypair Generator

Generate cryptographic key pairs and export public and private keys locally in your browser.

[Open Keypair Generator](https://ennacx.github.io/web-technica/keygen/) · [All tools and site information](../../../README.md)

## Generate a key pair

1. Select an **Algorithm** and its key size or curve.
2. Optionally enter a **Comment**. Use printable ASCII; spaces are converted to hyphens.
3. To protect the private key with a passphrase, enable **Encrypt the private key with a passphrase** and configure the options below.
4. Select **Generate Key Pair** and wait for generation to finish.
5. Copy or download the required public and private key formats. Expand **Private Key** to view its contents.

Changing settings clears generated output. **Reset** clears keys and passphrases. Save the results you need before changing settings, resetting, or closing the page.

## Algorithms

| Selection | Available sizes or curves |
|---|---|
| RSA (RSA-PSS) | 2048, 3072, or 4096 bits |
| EdDSA | Ed25519 or Ed448 |
| ECDSA | P-256, P-384, or P-521 |

Choose an algorithm and format supported by the application that will use the key. Ed448 support varies between SSH clients and other applications.

## Encrypt a private key

1. Enable the passphrase option.
2. Enter the passphrase in both fields. **Show** reveals or hides each entry.
3. Select the **Private key format**.
4. Generate the pair, then copy or download the private key.

| Format | Encryption / key derivation | Notes |
|---|---|---|
| OpenSSH | bcrypt-PBKDF + AES-256-CTR | OpenSSH private-key format |
| PKCS#8 | PBKDF2 + AES-256-CBC | Encrypted PKCS#8 PEM |
| Custom ChaCha20-Poly1305 | Legacy IETF variant | Requires a compatible custom reader; standard OpenSSH clients cannot read it |

The **PPK v3** download independently uses Argon2id + AES-256-CBC when passphrase protection is enabled. The private-key format selected above does not change PPK's encryption format.

Passphrase fields are cleared after generation. Keep the passphrase separately: the site cannot recover it or a lost private key. Without passphrase protection, exported private keys are not encrypted.

## Read and export results

| Result or button | Output |
|---|---|
| OpenSSH fingerprint | SHA-256 fingerprint of the public key |
| OpenSSH public key / OpenSSH | Public key in OpenSSH text format |
| Public Key (PEM) / Public PEM | Public key as PEM |
| Private Key | Private key in the selected format; its contents are initially folded away |
| PPK v3 | Private key in PuTTY PPK v3 format |

Copy buttons copy the associated field; download buttons save that format. The public key and its fingerprint may be shared as appropriate for your workflow. Keep private keys and passphrases secret, and copy or download them only to trusted locations.

## Optional pointer sampling

Expand **Optional pointer sampling** and enable **Choose a key using pointer samples** to use the optional interaction.

Start in the sampling area with a click, tap, or Space, then follow its prompts until the progress indicator completes. The interaction collects 128 samples and uses a digest to choose one of seven independently generated key pairs. It supports keyboard operation.

Keys still use cryptographic randomness. The interaction does not replace that randomness, and the sample count is not an entropy estimate. The expandable selection digest is not the public-key fingerprint.

## Privacy and offline use

Keys and passphrases are processed on your device without uploads or automatic browser storage. They are not written to URLs or the offline cache. Clipboard and file export occur only when requested.

All generation and export features work offline after the site's initial online load and successful offline cache setup. Cryptographic APIs require a supported browser and a secure context such as HTTPS or localhost. See [installation and offline use](../../../README.md#install-and-use-offline).

Clearing a JavaScript value or resetting the UI does not guarantee immediate erasure of all copies from browser memory.

## Troubleshooting

| Problem | What to check |
|---|---|
| Passphrase validation fails | Both entries must match; supply them again after generation clears the fields |
| Comment is rejected | Use printable ASCII |
| A client cannot read the key | Check the selected algorithm and format, especially Ed448 and the custom ChaCha20-Poly1305 format |
| Generation fails or APIs are unavailable | Use a supported browser on HTTPS or localhost; large RSA keys and passphrase derivation can take time |
| Copy fails | Use the corresponding download button or copy the visible text manually |

## Roadmap

The long-term goal is a browser-based alternative to PuTTYgen. Planned import features include passphrase-protected PPK files, public-key and fingerprint inspection, MAC and key-pair consistency checks, and private-key format conversion. Import and conversion of existing files are not implemented yet; the current tool generates and exports new key pairs.

## License

Part of Web-Technica, licensed under [MIT](../../../LICENSE). The browser bundle includes third-party cryptographic libraries; their license texts are available from [Third-party licenses](https://ennacx.github.io/web-technica/keygen/js/THIRD-PARTY-LICENSES.txt).
