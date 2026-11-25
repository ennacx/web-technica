# JPEG Metadata Inspector

Inspect the marker structure and Exif metadata of one JPEG, then prepare a cleaned copy. The tool is in development.

## Open the tool

The tool path is [`/web-technica/jpeg-metadata/`](https://ennacx.github.io/web-technica/jpeg-metadata/) on GitHub Pages and `/jpeg-metadata/` in a root build. Public availability depends on deployment. See the [site README](../../../README.md) for the tool list and offline setup.

## Inspect and clean

1. Choose a JPEG up to 32 MiB. The tool checks JPEG bytes and shows a local preview beside the file details when the browser can display it. **Inspect** shows Exif fields and their sources and the presence of a GPS directory. Expand **GPS tag values** to see the stored references and fractions, or **JPEG segments** for marker names, byte offsets, lengths, and recognized payloads.
2. Select a cleanup mode and choose **Prepare cleaned JPEG**.
3. Review the size, removed segment counts, retained metadata, and any orientation warning. Choose **Download** for a new `-cleaned.jpg` file. If no matching data is found, the tool reports no changes and offers no download.

Exif dates use the browser's locale while preserving the recorded date and time. Exposure compensation is shown in EV. Focal length and 35 mm equivalent focal length are shown as separate fields in millimeters when their tags are present.

Inspect shows exposure program and mode, metering, flash, white balance, and lens specifications when those tags are present. It translates recognized numeric codes and flash flags into labels. Unknown codes remain visible as numbers.

Expand **Other Exif tags** for additional fields, including standard tag names where available, offsets, and subsecond timestamps. Each entry shows the tag ID, directory, TIFF type, element count, byte length, JPEG APP1 offset, and TIFF-relative value offset. Text and numeric values use a bounded preview. Opaque binary values such as MakerNote show up to 32 bytes in hexadecimal and printable ASCII.

**Remove metadata** deletes detected Exif APP1 segments (including embedded Exif thumbnails), standard and extended XMP APP1, recognized Photoshop/IPTC APP13, and COM comments. It retains ICC color profiles, Adobe APP14, and JFIF/JFXX, which may contain thumbnails. Removing an Orientation value other than 1 can change how the image appears. The reported dimensions come from the JPEG frame.

**Remove location only** rebuilds a single supported Exif APP1 from its retained values and removes the GPS directory and its separately stored data. Typical supported retained tags include camera make/model, Orientation, dates, software, copyright, ISO, focal length, and exposure. Files containing unknown or unsupported Exif tags, MakerNote, extra directories, thumbnails, overlapping TIFF references or unexplained nonzero TIFF data are refused. XMP, IPTC, ICC, comments and other potentially opaque metadata also cause this mode to refuse output. Selecting **Remove metadata** is a separate choice.

## Compatibility and privacy

- Cleanup supports single-frame, 8-bit baseline and progressive JPEGs, including multiple scans. MPF/MPO, APP11/JUMBF, unknown APP payloads, unsupported coding markers, and bytes after EOI prevent cleanup. Some unusual JPEGs can be inspected with cleanup disabled. PNG, WebP, HEIC, RAW, and other formats are outside scope.
- Exif inspection follows IFD0, Exif SubIFD, GPS IFD and the first thumbnail directory in either byte order. XMP, IPTC, ICC and MakerNote contents are opaque to the viewer. JPEG validation covers marker boundaries and selected headers. It does not decode pixel data or validate every compression table.
- The tool checks the rewritten marker structure and compares compressed scans byte for byte. Location-only cleanup also checks the retained Exif types, counts, and value bytes. Metadata cleanup cannot guarantee anonymity. Image content and retained metadata may disclose personal information.
- Files and results are processed in memory without uploads or browser storage. The input file stays intact. After the PWA cache is ready, the tool works offline. Reading and cleanup may temporarily hold several copies of the file in memory.
- If the tool reports an invalid structure or unsupported file, select another JPEG or use software that supports the detected structure.

## Roadmap

Phase 2 will consider editing a limited set of Exif tags with validated values and an explicit change summary.
