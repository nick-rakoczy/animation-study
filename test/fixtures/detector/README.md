# Detector fixtures

`test/detector-fixtures.test.ts` creates the fixture videos with FFmpeg for each test run. The repository stores the filter definitions instead of generated video binaries.

The set covers:

- an exact clean hold;
- a static drawing with low-level temporal noise and heavy H.264 compression;
- camera motion, which must remain frame-by-frame;
- a dissolve, which must remain frame-by-frame;
- variable presentation timestamps around a held drawing change;
- a drawing that returns after a different drawing;
- an intentional one-frame drawing.

At the default sensitivity, clean and noisy holds must fall at or below the same threshold. Every deliberate change must meet or exceed the changed threshold. A returning drawing must create a new chronological exposure.

On the Linux reference environment, the noisy hold's largest component difference is `0.000361`. The smallest deliberate change is `0.107789`. The existing default thresholds of `0.01` for same and `0.04` for changed leave both sets clear of the uncertain interval, so this fixture pass does not change them.
