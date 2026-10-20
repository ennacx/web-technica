# Regex Tester — UI mockup

[Open Regex Tester](https://ennacx.github.io/web-technica/regex-tester/) · [Web-Technica overview](../../../README.md)

This development mockup explores the layout with a fixed email-matching sample. It does not execute regular expressions. The JavaScript engine label, flags, and disabled Auto / Run controls illustrate the proposed interface; Worker execution and execution limits remain future work.

## Explore the interface

The upper panel contains a pattern field, flag checkboxes, and editable test text. The lower panel shows three sample matches. Each panel has its own border and background, with a resize handle in the space between them. Expand a match to inspect its numbered, named capture groups. Choose **Highlight** for a read-only highlighted sample, or **Matches** to return to the list. Editing the pattern, text, or flags clears the sample results and shows Not run. **Restore sample**, below the results beside Reset layout, restores the inputs and sample results. The page omits development explanation banners; execution remains unimplemented and the tool remains in development until functionality is ready for release.

Drag the horizontal handle with a mouse, pen, or touch to resize the input panel. The workspace has no fixed total height: enlarging the input panel grows the page without shrinking results. Input height ranges from 400 to 1600 pixels (mobile minimum: 480), with an initial height of 480 pixels (mobile: 560). Results have their own viewport-based height of 320–560 pixels. These are provisional UI sizes. Double-click the handle or choose **Reset layout** to restore the initial input height. With the handle focused, use Up / Down to move by 10 pixels (Shift: 50), Home / End to reach the limits, and Enter to reset.

Test text and results scroll independently. The stacked layout remains on mobile; on short screens the page also scrolls. There is no copy or save command yet; text remains selectable using normal browser controls. Inputs and layout reset on reload.

## Compatibility, privacy, and offline use

Use a modern browser supporting CSS Grid, Pointer Events, ResizeObserver, and dynamic viewport units. If resizing is unavailable, the initial stacked layout remains visible. Enable JavaScript for sample controls and resizing. If results have cleared, choose Restore sample; edits are intentionally not evaluated.

Patterns and test text are not uploaded, logged, added to the URL, or saved to browser storage. Static mockup assets can work offline after a successful initial load and shared PWA cache setup; the Offline ready label describes this mockup. Real-browser mobile touch, assistive technology, and installed PWA behavior still need device verification.

## Next development steps

Implement JavaScript RegExp execution inside a Worker with cancellation, timeout, stale-result handling, bounded output, and normalized UTF-16 match positions before enabling live results. Auto / Manual behavior and limits need specification. PCRE2, Python, replacement, copy, and save are not implemented or included in this mockup.
