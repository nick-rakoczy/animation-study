# Clip Studio Paint compatibility test

## Target

- Clip Studio Paint EX 5.1.4
- Windows 10 or Windows 11, 64-bit
- Animation Study export preset: exposure cels

Clip Studio Paint 5.1.4 was released on September 8, 2026. The official system requirements list 64-bit Windows 10 and Windows 11.

## Fixture

Use a six-frame source with three distinct adjacent exposures:

```text
A A B B C C
```

Select all six source frames and export them. The chosen parent directory must contain exactly this folder and these three opaque PNG files:

```text
fixture.mp4_frames/
  1_0001.png
  1_0002.png
  1_0003.png
```

Before opening Clip Studio Paint, verify that every PNG has the source's decoded display dimensions and that the three files show A, B, and C in order.

## Import test

1. In Clip Studio Paint EX, create an animation canvas with at least six timeline frames.
2. Create or select an animation folder.
3. Turn off `Preferences > Animation > Add cel to frame when adding layer`.
4. Use `File > Import` and select all three PNGs at once.
5. Confirm that the animation folder contains three cels in filename order and that Clip Studio Paint has not assigned them to timeline frames.
6. Assign `1_0001`, `1_0002`, and `1_0003` to frames 1, 3, and 5. Use the timeline context menu or `Animation > Edit track > Assign cel to frame`.
7. Scrub frames 1 through 6. Confirm that A appears on frames 1 and 2, B on frames 3 and 4, and C on frames 5 and 6.
8. Save the result as `clip-studio-exposure-import.clip` beside this document's test record.
9. Repeat the import with `Add cel to frame when adding layer` turned on. Record whether multi-file import assigns the cels and the frame interval it uses. Do not use that automatic assignment for irregular holds unless its result matches the source timing.

## Expected result

Clip Studio Paint imports all three PNGs as cels. Manual assignments preserve the two-frame holds. Automatic import may assign new cels when the preference is enabled, but a PNG folder alone cannot encode irregular hold lengths.

The official manual states that selecting an animation folder allows multiple image files to be imported as cels. The `Add cel to frame when adding layer` preference controls whether imported layers are assigned to the timeline. Existing cels can be assigned from the timeline context menu or `Animation > Edit track > Assign cel to frame`.

## Test record

| Field | Result |
| --- | --- |
| Application | Clip Studio Paint EX 5.1.4 |
| Operating system | Pending Windows test |
| Test date | Pending |
| Imported layer names and order | Pending |
| Preference off behavior | Pending |
| Preference on behavior | Pending |
| Manual hold assignment | Pending |
| Saved `.clip` fixture | Pending |

## Official references

- [Clip Studio Paint 5.1.4 release notes](https://www.clipstudio.net/en/dl/release_note/latest/)
- [Clip Studio Paint system requirements](https://www.clipstudio.net/en/dl/system/)
- [Animation folders and cels](https://help.clip-studio.com/en-us/manual_en/600_animation/Animation_folders_and_cels.htm)
- [Assigning cels to the timeline](https://help.clip-studio.com/en-us/manual_en/600_animation/Assigning_cels_to_the_timeline.htm)
