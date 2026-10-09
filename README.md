# MAHAMAYA Image Compressor

A lightweight, browser-based image and video compressor with a target-size field. Files are processed locally on your device; this app does not upload them to a server. No paid APIs or backend are used.

## GitHub Pages URL

https://exearpan45.github.io/mahamaya-image-compressor/

## Publish on GitHub Pages (not Cloudflare)

1. Open this repository's **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Select branch **main** and folder **/(root)**, then press **Save**.
4. Wait for the Pages deployment to finish. GitHub may take a few minutes to publish the first build.

The entry file `index.html` is at the repository root and loads `styles.css` and `app.js` using relative paths, so the project URL path is handled correctly.

## Important limits

- Image target size is best-effort. Some formats cannot reach the requested size exactly; PNG may need to be re-encoded to WebP to reduce size.
- Video compression depends on browser MediaRecorder/WebM support. Encoding runs in real time, and the exact target size is not guaranteed.
- Keep the tab open during video encoding. Always review the output before deleting your original.
- This is a static GitHub Pages website. It does not require server-side code, secrets, or API keys.
