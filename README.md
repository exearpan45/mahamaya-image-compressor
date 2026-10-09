# MAHAMAYA Image Compressor

A free, browser-based photo and video compressor. Files are processed on the device; the app does not upload user files to a server.

## Deploy on Cloudflare Pages
- Framework preset: None
- Build command: leave blank
- Build output directory: `/` (repository root)
- No environment variables or API keys are required.

## Notes
- Photo compression uses the browser canvas API. Transparent PNG images retain PNG output; other supported images are encoded as JPEG/WebP according to source format.
- Video compression uses MediaRecorder and canvas capture. Browser codec support varies. Audio may not be preserved in every browser.
- Target size is a goal, not a guarantee. Always inspect the output. Large files can fail on low-memory devices.
- No file is sent to a backend.
