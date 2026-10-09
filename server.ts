import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { spawn, execFile, ChildProcess } from 'child_process';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const JOBS_DIR = path.join('/tmp', 'optisqueeze_jobs');

// Ensure jobs directory exists
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

interface VideoJob {
  id: string;
  originalName: string;
  originalSize: number;
  targetBytes: number;
  status: 'uploading' | 'analyzing' | 'encoding' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0 - 100
  currentStage: string;
  fps?: number;
  speed?: string;
  duration?: number;
  currentTime?: number;
  eta?: string;
  outputSize?: number;
  differenceBytes?: number;
  differencePercent?: number;
  compressionPercentage?: number;
  outputFormat?: string;
  width?: number;
  height?: number;
  error?: string;
  warning?: string;
  inputPath: string;
  outputPath?: string;
  createdAt: number;
  ffmpegProcess?: ChildProcess;
}

const jobs = new Map<string, VideoJob>();

// Clean up old jobs periodically (older than 20 minutes)
setInterval(() => {
  const now = Date.now();
  const maxAge = 20 * 60 * 1000;

  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > maxAge) {
      if (job.ffmpegProcess && !job.ffmpegProcess.killed) {
        try {
          job.ffmpegProcess.kill('SIGKILL');
        } catch {}
      }
      const jobDir = path.join(JOBS_DIR, id);
      if (fs.existsSync(jobDir)) {
        try {
          fs.rmSync(jobDir, { recursive: true, force: true });
        } catch {}
      }
      jobs.delete(id);
    }
  }
}, 2 * 60 * 1000);

// Setup multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobId = crypto.randomUUID();
    (req as any).jobId = jobId;
    const jobDir = path.join(JOBS_DIR, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    cb(null, jobDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `input${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1 GB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'video/x-matroska',
      'video/x-msvideo',
      'video/mpeg',
      'video/ogg',
      'video/3gpp',
    ];
    const allowedExts = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v', '.ogv', '.3gp'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext) || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported video format (${file.mimetype || ext}). Supported: MP4, MOV, WebM, MKV, AVI.`));
    }
  },
});

const app = express();
app.use(express.json());

// API Routes

// Health check / Capability check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    features: ['photo-compressor', 'video-compressor'],
    ffmpeg: true,
  });
});

// Start video compression
app.post('/api/video/compress', upload.single('video'), async (req: Request, res: Response) => {
  const file = req.file;
  const jobId = (req as any).jobId as string;

  if (!file || !jobId) {
    return res.status(400).json({ error: 'No video file provided.' });
  }

  const targetSizeNum = parseFloat(req.body.targetSize);
  const targetUnit = (req.body.targetUnit || 'MB').toUpperCase();

  if (isNaN(targetSizeNum) || targetSizeNum <= 0) {
    // Clean up uploaded file
    try {
      fs.rmSync(path.join(JOBS_DIR, jobId), { recursive: true, force: true });
    } catch {}
    return res.status(400).json({ error: 'Please enter a valid positive target file size.' });
  }

  const multiplier = targetUnit === 'KB' ? 1024 : 1024 * 1024;
  const targetBytes = Math.round(targetSizeNum * multiplier);

  if (targetBytes < 10 * 1024) {
    // Below 10 KB
    try {
      fs.rmSync(path.join(JOBS_DIR, jobId), { recursive: true, force: true });
    } catch {}
    return res.status(400).json({
      error: 'Target size is too small. Minimum supported target size is 10 KB.',
    });
  }

  const job: VideoJob = {
    id: jobId,
    originalName: file.originalname,
    originalSize: file.size,
    targetBytes,
    status: 'analyzing',
    progress: 5,
    currentStage: 'Analyzing video streams and metadata...',
    inputPath: file.path,
    createdAt: Date.now(),
  };

  jobs.set(jobId, job);

  // Send back jobId immediately
  res.json({
    jobId,
    originalName: file.originalname,
    originalSize: file.size,
    targetBytes,
  });

  // Start asynchronous background compression
  processVideoJob(job).catch((err) => {
    console.error(`Error processing job ${jobId}:`, err);
    job.status = 'failed';
    job.error = err.message || 'Video compression encountered an unexpected error.';
  });
});

// Probe and process video job
async function processVideoJob(job: VideoJob) {
  const jobDir = path.dirname(job.inputPath);
  const outputPath = path.join(jobDir, 'compressed_output.mp4');
  job.outputPath = outputPath;

  // Step 1: Probe video with ffprobe
  let probeData: any;
  try {
    probeData = await probeMedia(job.inputPath);
  } catch (err: any) {
    job.status = 'failed';
    job.error = `Unable to inspect video file: ${err.message || 'Corrupt or unreadable media'}.`;
    return;
  }

  const format = probeData.format || {};
  const streams = probeData.streams || [];
  const videoStream = streams.find((s: any) => s.codec_type === 'video');
  const audioStream = streams.find((s: any) => s.codec_type === 'audio');

  if (!videoStream) {
    job.status = 'failed';
    job.error = 'No valid video track found in the uploaded file.';
    return;
  }

  const durationSec = parseFloat(format.duration || videoStream.duration || '0');
  if (durationSec <= 0 || isNaN(durationSec)) {
    job.status = 'failed';
    job.error = 'Could not determine video duration. File may be incomplete or corrupted.';
    return;
  }

  job.duration = durationSec;
  const origW = parseInt(videoStream.width, 10) || 1280;
  const origH = parseInt(videoStream.height, 10) || 720;
  job.width = origW;
  job.height = origH;

  // Check technical feasibility:
  // A video of duration D needs some minimal bits to not dissolve into corrupt macroblocks.
  const targetBps = (job.targetBytes * 8) / durationSec;
  const minFeasibleBps = 24000; // 24 kbps absolute floor
  const minFeasibleBytes = Math.ceil((minFeasibleBps * durationSec) / 8);

  if (job.targetBytes < minFeasibleBytes) {
    job.status = 'failed';
    job.error = `The requested target size (${formatSizeStr(job.targetBytes)}) is too small for a ${durationSec.toFixed(1)}s video (requires ${(targetBps / 1000).toFixed(1)} kbps). The technical minimum is approx ${formatSizeStr(minFeasibleBytes)} to produce a playable video.`;
    return;
  }

  if (job.targetBytes > job.originalSize * 1.5) {
    job.warning = 'Target size is significantly larger than original video. Compression will maintain high quality without artificial bloating.';
  }

  // Audio budget allocation
  let audioBps = 0;
  let audioCodecArgs: string[] = ['-an'];

  if (audioStream) {
    if (targetBps > 1200000) {
      audioBps = 128000;
    } else if (targetBps > 600000) {
      audioBps = 96000;
    } else if (targetBps > 250000) {
      audioBps = 64000;
    } else if (targetBps > 90000) {
      audioBps = 48000;
    } else {
      audioBps = 32000;
    }
    audioCodecArgs = ['-c:a', 'aac', '-b:a', `${audioBps}`];
  }

  // Container overhead reserve (MP4 moov header, index tables)
  // ~2-3% or min 16KB, max 64KB
  const containerOverheadBytes = Math.min(64 * 1024, Math.max(16 * 1024, Math.round(job.targetBytes * 0.025)));
  const audioBytesTotal = (audioBps * durationSec) / 8;
  const videoBytesBudget = Math.max(1024, job.targetBytes - audioBytesTotal - containerOverheadBytes);

  let videoBps = Math.floor((videoBytesBudget * 8) / durationSec);
  // Ensure sanity
  videoBps = Math.max(16000, videoBps);

  // Adaptive smart scaling if bitrate is low to prevent macroblock pixelation:
  // For standard h264:
  // if videoBps < 120 kbps: max 360p / 480p
  // if videoBps < 300 kbps: max 720p
  // if videoBps < 700 kbps: max 1080p
  let scaleFilter: string | null = null;
  let targetMaxDimension = origW;

  if (videoBps < 120000 && origW > 480 && origH > 360) {
    targetMaxDimension = 480;
  } else if (videoBps < 300000 && origW > 854 && origH > 480) {
    targetMaxDimension = 854;
  } else if (videoBps < 750000 && origW > 1280 && origH > 720) {
    targetMaxDimension = 1280;
  } else if (videoBps < 1600000 && origW > 1920 && origH > 1080) {
    targetMaxDimension = 1920;
  }

  if (targetMaxDimension < Math.max(origW, origH)) {
    // Keep aspect ratio, ensure even numbers (divisible by 2) for H.264
    if (origW >= origH) {
      scaleFilter = `scale='min(${targetMaxDimension},iw)':-2`;
    } else {
      scaleFilter = `scale=-2:'min(${targetMaxDimension},ih)'`;
    }
  }

  job.status = 'encoding';
  job.currentStage = 'Encoding video with calibrated target bitrate...';
  job.progress = 10;

  // Run FFmpeg with progress monitoring
  const maxrate = Math.floor(videoBps * 1.15);
  const bufsize = Math.floor(videoBps * 2);

  const ffmpegArgs = [
    '-y',
    '-i', job.inputPath,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-b:v', `${videoBps}`,
    '-maxrate', `${maxrate}`,
    '-bufsize', `${bufsize}`,
    ...(scaleFilter ? ['-vf', scaleFilter] : []),
    '-pix_fmt', 'yuv420p',
    ...audioCodecArgs,
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    outputPath,
  ];

  await runFfmpegWithProgress(job, ffmpegArgs, durationSec);

  // Check output file
  if (!fs.existsSync(outputPath)) {
    throw new Error('Encoding finished but output file was not produced.');
  }

  const stat = fs.statSync(outputPath);
  const outputSize = stat.size;

  if (outputSize === 0) {
    throw new Error('Produced video file is 0 bytes.');
  }

  // Check if output significantly exceeded target (> 12% over target)
  // If so, and target was substantially smaller than original, perform a fast corrective pass
  if (outputSize > job.targetBytes * 1.12 && outputSize < job.originalSize) {
    job.currentStage = 'Fine-tuning video to reach target file size...';
    const calibrationRatio = (job.targetBytes / outputSize) * 0.94;
    const recalibratedVideoBps = Math.max(16000, Math.floor(videoBps * calibrationRatio));
    const recalibratedMaxrate = Math.floor(recalibratedVideoBps * 1.15);
    const recalibratedBufsize = Math.floor(recalibratedVideoBps * 2);

    const correctiveOutputPath = path.join(jobDir, 'calibrated_output.mp4');
    const correctiveArgs = [
      '-y',
      '-i', job.inputPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-b:v', `${recalibratedVideoBps}`,
      '-maxrate', `${recalibratedMaxrate}`,
      '-bufsize', `${recalibratedBufsize}`,
      ...(scaleFilter ? ['-vf', scaleFilter] : []),
      '-pix_fmt', 'yuv420p',
      ...audioCodecArgs,
      '-movflags', '+faststart',
      '-progress', 'pipe:1',
      correctiveOutputPath,
    ];

    try {
      await runFfmpegWithProgress(job, correctiveArgs, durationSec);
      if (fs.existsSync(correctiveOutputPath) && fs.statSync(correctiveOutputPath).size > 0) {
        fs.unlinkSync(outputPath);
        fs.renameSync(correctiveOutputPath, outputPath);
      }
    } catch (e) {
      console.warn('Corrective pass skipped:', e);
    }
  }

  const finalStat = fs.statSync(outputPath);
  const finalSize = finalStat.size;

  job.outputSize = finalSize;
  job.differenceBytes = finalSize - job.targetBytes;
  job.differencePercent = ((finalSize - job.targetBytes) / job.targetBytes) * 100;
  job.compressionPercentage = Math.round(((job.originalSize - finalSize) / job.originalSize) * 1000) / 10;
  job.outputFormat = 'MP4 (H.264 / AAC)';
  job.status = 'completed';
  job.progress = 100;
  job.currentStage = 'Compression complete. Ready for preview and download.';
}

function probeMedia(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(stderr || err.message));
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed);
        } catch (parseErr) {
          reject(parseErr);
        }
      }
    );
  });
}

function runFfmpegWithProgress(job: VideoJob, args: string[], durationSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args);
    job.ffmpegProcess = ff;

    let buffer = '';

    ff.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts[1].trim();

          if (key === 'out_time_ms') {
            const timeMicros = parseInt(val, 10);
            if (!isNaN(timeMicros) && durationSec > 0) {
              const currentSec = timeMicros / 1000000;
              job.currentTime = currentSec;
              const pct = Math.min(98, Math.max(10, Math.round((currentSec / durationSec) * 90) + 10));
              job.progress = pct;
            }
          } else if (key === 'fps') {
            const fpsVal = parseFloat(val);
            if (!isNaN(fpsVal)) job.fps = fpsVal;
          } else if (key === 'speed') {
            job.speed = val;
          }
        }
      }
    });

    let stderrBuf = '';
    ff.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      // Keep only last 2000 chars of stderr for diagnostics
      if (stderrBuf.length > 4000) {
        stderrBuf = stderrBuf.slice(-2000);
      }
    });

    ff.on('error', (err) => {
      reject(err);
    });

    ff.on('close', (code) => {
      job.ffmpegProcess = undefined;
      if (job.status === 'cancelled') {
        return reject(new Error('Compression cancelled by user.'));
      }
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}. ${stderrBuf.slice(-300)}`));
      }
    });
  });
}

// Get video job status
app.get('/api/video/status/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found or expired.' });
  }

  res.json({
    id: job.id,
    originalName: job.originalName,
    originalSize: job.originalSize,
    targetBytes: job.targetBytes,
    status: job.status,
    progress: job.progress,
    currentStage: job.currentStage,
    fps: job.fps,
    speed: job.speed,
    duration: job.duration,
    currentTime: job.currentTime,
    outputSize: job.outputSize,
    differenceBytes: job.differenceBytes,
    differencePercent: job.differencePercent,
    compressionPercentage: job.compressionPercentage,
    outputFormat: job.outputFormat,
    error: job.error,
    warning: job.warning,
    downloadUrl: `/api/video/download/${job.id}`,
    previewUrl: `/api/video/preview/${job.id}`,
  });
});

// Cancel video job
app.post('/api/video/cancel/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  job.status = 'cancelled';
  job.currentStage = 'Compression cancelled.';
  if (job.ffmpegProcess && !job.ffmpegProcess.killed) {
    try {
      job.ffmpegProcess.kill('SIGKILL');
    } catch {}
  }

  res.json({ message: 'Job cancelled successfully.' });
});

// Stream video for download
app.get('/api/video/download/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job || !job.outputPath || !fs.existsSync(job.outputPath)) {
    return res.status(404).json({ error: 'Compressed video file not found or expired.' });
  }

  const baseName = path.parse(job.originalName).name || 'video';
  const downloadName = `${baseName}_compressed.mp4`;

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
  res.setHeader('Content-Length', fs.statSync(job.outputPath).size);

  const stream = fs.createReadStream(job.outputPath);
  stream.pipe(res);
});

// Stream video for in-browser playback preview (supports HTTP Range)
app.get('/api/video/preview/:jobId', (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job || !job.outputPath || !fs.existsSync(job.outputPath)) {
    return res.status(404).json({ error: 'Compressed video preview not found.' });
  }

  const filePath = job.outputPath;
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    const chunksize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    });

    const fileStream = fs.createReadStream(filePath, { start, end });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Format byte sizes for readability
function formatSizeStr(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Start Server with Vite
async function startServer() {
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OptiSqueeze Compressor Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
