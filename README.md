# shakalify

Browser app that deliberately degrades images with pixelation, JPEG recompression and optional effects. Images are processed locally.

## Run

```bash
bun install --frozen-lockfile
bun run dev
```

## Controls

The main slider sets pixelation, JPEG quality and recompression count together. Expand the compression settings to change them independently; moving the main slider returns to linked settings.

For nonzero degradation, all images are processed at a common longest edge of 1024 pixels. The pixel grid is calculated directly from pixelation, with the original aspect ratio preserved to integer-pixel rounding. JPEG generations do not repeatedly shrink this grid. Small images are enlarged for this processing domain; enlarging them cannot recover their missing detail. Different content and existing compression can still produce different subjective results.

Output dimensions follow the original dimensions at 1×, 2× or 3×. Output is limited to 16,777,216 pixels and an 8192-pixel longest edge; excessive output reports an error. JPEG export uses quality 95 independently of the intentional degradation settings. PNG avoids the final JPEG encode, but intermediate JPEG passes still flatten transparency.

At 0%, the main slider disables pixelation and intermediate JPEG passes. Optional effects, export format and output scale remain active. Exporting JPEG still performs one JPEG encode; 0% does not promise a byte-for-byte original. GIF input produces a static frame.

Statistics show the actual working grid reduction (not perceptual detail loss), actual JPEG encode count including final JPEG export, and output dimensions. Obsolete processing jobs are cancelled and their object URLs are released. Failures have a retry/replace path.

## Checks

```bash
bun run lint
bun run test
bun run build
bunx playwright install chromium
bun run test:e2e
```

To use an installed Chrome instead of downloaded Chromium:

```bash
PLAYWRIGHT_CHANNEL=chrome bun run test:e2e
```
