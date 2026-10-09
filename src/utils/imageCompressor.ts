export interface ImageCompressionOptions {
  targetBytes: number;
  outputFormat?: 'auto' | 'image/jpeg' | 'image/webp' | 'image/png' | 'image/avif';
  onProgress?: (progress: number, stage: string) => void;
}

export interface ImageCompressionResult {
  blob: Blob;
  blobUrl: string;
  originalSize: number;
  compressedSize: number;
  targetBytes: number;
  differenceBytes: number;
  differencePercent: number;
  compressionPercentage: number;
  originalWidth: number;
  originalHeight: number;
  outputWidth: number;
  outputHeight: number;
  outputFormat: string;
  mimeType: string;
  qualityUsed: number;
  scaleUsed: number;
  hasAlpha: boolean;
  isLargerThanOriginal: boolean;
  warning?: string;
}

// Check if browser supports specific MIME type in canvas.toBlob
const mimeSupportCache: Record<string, boolean> = {};

export async function isMimeSupported(mime: string): Promise<boolean> {
  if (mimeSupportCache[mime] !== undefined) {
    return mimeSupportCache[mime];
  }
  return new Promise((resolve) => {
    try {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      c.toBlob((blob) => {
        const supported = !!blob && blob.type === mime;
        mimeSupportCache[mime] = supported;
        resolve(supported);
      }, mime);
    } catch {
      mimeSupportCache[mime] = false;
      resolve(false);
    }
  });
}

// Detect alpha transparency
function detectTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    // Sample step to be fast on huge images
    const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 10000)));
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let i = 3; i < data.length; i += 4 * step) {
      if (data[i] < 250) {
        return true;
      }
    }
  } catch {
    // Security or canvas error fallback
  }
  return false;
}

// Convert canvas to blob promise
function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Failed to encode canvas to ${mimeType}`));
        }
      },
      mimeType,
      quality
    );
  });
}

// Load image file into an HTMLImageElement
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image. The file may be corrupt or an unsupported format.'));
    };
    img.src = url;
  });
}

export async function compressImage(
  file: File,
  options: ImageCompressionOptions
): Promise<ImageCompressionResult> {
  const { targetBytes, onProgress } = options;
  const originalSize = file.size;

  onProgress?.(5, 'Loading and parsing image...');
  const img = await loadImage(file);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  if (origW === 0 || origH === 0) {
    throw new Error('Image has zero dimensions or could not be rendered.');
  }

  // Draw on working canvas to inspect transparency
  const testCanvas = document.createElement('canvas');
  testCanvas.width = Math.min(origW, 400);
  testCanvas.height = Math.min(origH, 400);
  const testCtx = testCanvas.getContext('2d', { willReadFrequently: true });
  let hasAlpha = false;
  if (testCtx) {
    testCtx.drawImage(img, 0, 0, testCanvas.width, testCanvas.height);
    hasAlpha = detectTransparency(testCtx, testCanvas.width, testCanvas.height);
  }

  // Determine output format
  let chosenMime = options.outputFormat || 'auto';
  let warning: string | undefined;

  if (chosenMime === 'auto') {
    if (file.type === 'image/webp') {
      chosenMime = 'image/webp';
    } else if (file.type === 'image/png') {
      // If PNG has transparency, WebP preserves transparency with superior compression
      chosenMime = hasAlpha ? 'image/webp' : 'image/jpeg';
    } else if (file.type === 'image/avif') {
      const avifSupported = await isMimeSupported('image/avif');
      chosenMime = avifSupported ? 'image/avif' : 'image/webp';
    } else {
      // Default for JPG/JPEG or others
      chosenMime = 'image/jpeg';
    }
  }

  // Verify chosen format support
  if (chosenMime === 'image/avif') {
    const supported = await isMimeSupported('image/avif');
    if (!supported) {
      chosenMime = 'image/webp';
      warning = 'AVIF encoding is not supported by your browser. Falling back to WebP.';
    }
  }

  if (hasAlpha && chosenMime === 'image/jpeg') {
    warning = 'Image has transparency, but JPEG does not support alpha channels. Background will be filled with white. Switch to WebP or PNG to keep transparency.';
  }

  onProgress?.(15, 'Calibrating optimal quality and resolution...');

  // Helper to draw at given scale
  const renderCanvasAtScale = (scale: number) => {
    const curW = Math.max(16, Math.round(origW * scale));
    const curH = Math.max(16, Math.round(origH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = curW;
    canvas.height = curH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not acquire 2D canvas rendering context.');

    if (chosenMime === 'image/jpeg') {
      // White background for JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, curW, curH);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, curW, curH);
    return { canvas, curW, curH };
  };

  // If PNG without lossy canvas support, check if target requires JPEG or WebP
  // Note: Canvas.toBlob('image/png') ignores quality argument according to HTML spec!
  if (chosenMime === 'image/png') {
    // Warn user that PNG is lossless, so size control primarily relies on resizing
    warning = (warning ? warning + ' ' : '') + 'PNG uses lossless compression. File size is controlled primarily through dimensions.';
  }

  let bestBlob: Blob | null = null;
  let bestQuality = 0.85;
  let bestScale = 1.0;
  let bestW = origW;
  let bestH = origH;

  // Step A: First attempt at scale = 1.0 (no resizing)
  let { canvas, curW, curH } = renderCanvasAtScale(1.0);

  if (chosenMime === 'image/png') {
    // PNG doesn't support quality parameter
    let testBlob = await canvasToBlob(canvas, chosenMime, 1.0);
    bestBlob = testBlob;
    bestScale = 1.0;

    // If too large, downscale proportionally
    if (testBlob.size > targetBytes) {
      let scale = Math.min(0.95, Math.sqrt(targetBytes / testBlob.size) * 0.98);
      for (let pass = 0; pass < 5; pass++) {
        onProgress?.(30 + pass * 12, `Adjusting dimensions for PNG (${Math.round(scale * 100)}%)...`);
        const scaled = renderCanvasAtScale(scale);
        const nextBlob = await canvasToBlob(scaled.canvas, chosenMime, 1.0);
        bestBlob = nextBlob;
        bestScale = scale;
        bestW = scaled.curW;
        bestH = scaled.curH;

        if (nextBlob.size <= targetBytes && nextBlob.size >= targetBytes * 0.75) {
          break;
        }
        if (nextBlob.size > targetBytes) {
          scale *= Math.min(0.95, Math.sqrt(targetBytes / nextBlob.size) * 0.98);
        } else {
          // A bit too small, can step up slightly
          scale = Math.min(1.0, scale * 1.08);
          break;
        }
        scale = Math.max(0.08, scale);
      }
    }
  } else {
    // Lossy format (JPEG, WebP, AVIF): Binary search on quality at 1.0 scale
    let lowQ = 0.05;
    let highQ = 0.98;
    let closestUnderBlob: Blob | null = null;
    let closestUnderQ = 0.5;

    // Check high quality first
    onProgress?.(25, 'Testing full resolution at high quality...');
    let highBlob = await canvasToBlob(canvas, chosenMime, 0.92);

    if (highBlob.size <= targetBytes) {
      // Even high quality is within target!
      bestBlob = highBlob;
      bestQuality = 0.92;
      bestScale = 1.0;
    } else {
      // Check low quality floor at scale 1.0
      onProgress?.(35, 'Testing full resolution minimum quality...');
      let lowBlob = await canvasToBlob(canvas, chosenMime, 0.08);

      if (lowBlob.size <= targetBytes) {
        // Can reach target via quality adjustment alone! No resizing needed!
        let iterCount = 7;
        lowQ = 0.08;
        highQ = 0.92;

        for (let i = 0; i < iterCount; i++) {
          const midQ = (lowQ + highQ) / 2;
          onProgress?.(40 + i * 7, `Searching optimal quality (${Math.round(midQ * 100)}%)...`);
          const testBlob = await canvasToBlob(canvas, chosenMime, midQ);

          if (testBlob.size <= targetBytes) {
            closestUnderBlob = testBlob;
            closestUnderQ = midQ;
            // Try higher quality to get closer to target without exceeding
            lowQ = midQ;
          } else {
            highQ = midQ;
          }
        }

        bestBlob = closestUnderBlob || lowBlob;
        bestQuality = closestUnderQ;
        bestScale = 1.0;
      } else {
        // Quality alone at full resolution cannot reach target size.
        // Must perform controlled, proportional downscaling.
        onProgress?.(60, 'Target requires proportional downscaling...');
        
        let currentScale = Math.min(0.92, Math.sqrt(targetBytes / lowBlob.size) * 0.95);
        currentScale = Math.max(0.08, currentScale);

        for (let scalePass = 0; scalePass < 4; scalePass++) {
          const scaled = renderCanvasAtScale(currentScale);
          canvas = scaled.canvas;
          curW = scaled.curW;
          curH = scaled.curH;

          // Test quality range at this scale
          lowQ = 0.2;
          highQ = 0.88;
          let candidateBlob: Blob | null = null;
          let candidateQ = 0.5;

          for (let qStep = 0; qStep < 5; qStep++) {
            const midQ = (lowQ + highQ) / 2;
            const b = await canvasToBlob(canvas, chosenMime, midQ);
            if (b.size <= targetBytes) {
              candidateBlob = b;
              candidateQ = midQ;
              lowQ = midQ;
            } else {
              highQ = midQ;
            }
          }

          if (candidateBlob && candidateBlob.size <= targetBytes) {
            bestBlob = candidateBlob;
            bestQuality = candidateQ;
            bestScale = currentScale;
            bestW = curW;
            bestH = curH;
            if (candidateBlob.size >= targetBytes * 0.80) {
              break; // Great hit!
            }
          }

          if (!candidateBlob) {
            // Even lowest quality at this scale is too big, shrink more
            currentScale *= 0.8;
          } else {
            break;
          }
        }

        if (!bestBlob) {
          // Fallback to lowest possible
          const fallback = renderCanvasAtScale(currentScale);
          bestBlob = await canvasToBlob(fallback.canvas, chosenMime, 0.1);
          bestScale = currentScale;
          bestQuality = 0.1;
          bestW = fallback.curW;
          bestH = fallback.curH;
        }
      }
    }
  }

  if (!bestBlob) {
    throw new Error('Could not generate compressed image blob.');
  }

  onProgress?.(95, 'Verifying compressed output...');

  const compressedSize = bestBlob.size;
  const differenceBytes = compressedSize - targetBytes;
  const differencePercent = (differenceBytes / targetBytes) * 100;
  const compressionPercentage = Math.round(((originalSize - compressedSize) / originalSize) * 1000) / 10;
  const isLargerThanOriginal = compressedSize >= originalSize;

  // Friendly format name
  const formatNames: Record<string, string> = {
    'image/jpeg': 'JPEG',
    'image/webp': 'WebP',
    'image/png': 'PNG',
    'image/avif': 'AVIF',
  };

  const blobUrl = URL.createObjectURL(bestBlob);

  onProgress?.(100, 'Compression complete.');

  return {
    blob: bestBlob,
    blobUrl,
    originalSize,
    compressedSize,
    targetBytes,
    differenceBytes,
    differencePercent,
    compressionPercentage,
    originalWidth: origW,
    originalHeight: origH,
    outputWidth: bestW,
    outputHeight: bestH,
    outputFormat: formatNames[chosenMime] || chosenMime,
    mimeType: chosenMime,
    qualityUsed: Math.round(bestQuality * 100),
    scaleUsed: Math.round(bestScale * 100),
    hasAlpha,
    isLargerThanOriginal,
    warning,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatNumberWithCommas(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
