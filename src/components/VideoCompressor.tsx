import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  Download,
  AlertCircle,
  CheckCircle2,
  Video,
  RefreshCw,
  Film,
  X,
  Play,
  Clock,
  Zap,
  Activity,
  ShieldCheck,
  Gauge,
  SlidersHorizontal,
} from 'lucide-react';
import {
  VideoCompressorClient,
  VideoCompressionResult,
  VideoProgressDetails,
} from '../utils/videoClient';
import { formatBytes, formatNumberWithCommas } from '../utils/imageCompressor';

export const VideoCompressor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);

  const [targetSizeInput, setTargetSizeInput] = useState<string>('10');
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('MB');

  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [progressStage, setProgressStage] = useState<string>('');
  const [progressDetails, setProgressDetails] = useState<VideoProgressDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VideoCompressionResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<VideoCompressorClient | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  useEffect(() => {
    return () => {
      if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
      if (clientRef.current) clientRef.current.cancel();
    };
  }, []);

  const handleFileSelect = (selectedFile: File) => {
    setError(null);
    setResult(null);

    const supportedTypes = [
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'video/x-matroska',
      'video/x-msvideo',
      'video/mpeg',
    ];
    const isSupported =
      supportedTypes.includes(selectedFile.type) ||
      /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(selectedFile.name);

    if (!isSupported) {
      setError(
        `Unsupported video format (${selectedFile.type || 'unknown'}). Supported formats include MP4, MOV, WebM, MKV, and AVI.`
      );
      return;
    }

    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    const newLocalUrl = URL.createObjectURL(selectedFile);
    setFile(selectedFile);
    setLocalVideoUrl(newLocalUrl);

    // Read metadata via temporary HTML5 video element
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      setVideoDuration(v.duration);
      if (v.videoWidth && v.videoHeight) {
        setVideoResolution({ width: v.videoWidth, height: v.videoHeight });
      }
    };
    v.onerror = () => {
      // Server will still probe with ffprobe if browser cannot decode locally
      setVideoDuration(null);
    };
    v.src = newLocalUrl;

    // Suggest default target: ~40% of original or 10 MB
    const origMb = selectedFile.size / (1024 * 1024);
    if (origMb > 25) {
      const suggested = Math.max(5, Math.round(origMb * 0.4));
      setTargetSizeInput(suggested.toString());
      setTargetUnit('MB');
    } else if (origMb > 5) {
      const suggested = Math.max(2, Math.round(origMb * 0.5));
      setTargetSizeInput(suggested.toString());
      setTargetUnit('MB');
    } else {
      // Small video, suggest KB
      const suggestedKb = Math.max(500, Math.round((selectedFile.size * 0.5) / 1024));
      setTargetSizeInput(suggestedKb.toString());
      setTargetUnit('KB');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const getTargetBytes = (): { targetBytes: number; error?: string } => {
    const val = parseFloat(targetSizeInput.trim());
    if (isNaN(val) || val <= 0) {
      return { targetBytes: 0, error: 'Please enter a valid positive number for target file size.' };
    }
    const multiplier = targetUnit === 'KB' ? 1024 : 1024 * 1024;
    const bytes = Math.round(val * multiplier);
    if (bytes < 10 * 1024) {
      return { targetBytes: 0, error: 'Target size cannot be less than 10 KB.' };
    }
    return { targetBytes: bytes };
  };

  // Bitrate estimation helper for UI
  const calculateEstimatedBitrate = () => {
    if (!videoDuration || videoDuration <= 0) return null;
    const { targetBytes, error: targetError } = getTargetBytes();
    if (targetError || targetBytes <= 0) return null;

    // Target bitrate ≈ (targetBytes * 8 * 0.95) / duration
    const totalBps = (targetBytes * 8 * 0.95) / videoDuration;
    const totalKbps = Math.round(totalBps / 1000);
    return totalKbps;
  };

  const handleCompress = async () => {
    if (!file) {
      setError('Please select a video file first.');
      return;
    }

    const { targetBytes, error: targetErr } = getTargetBytes();
    if (targetErr) {
      setError(targetErr);
      return;
    }

    // Feasibility check if duration is known
    if (videoDuration && videoDuration > 0) {
      const minBps = 24000; // 24 kbps
      const minFeasibleBytes = Math.ceil((minBps * videoDuration) / 8);
      if (targetBytes < minFeasibleBytes) {
        setError(
          `The requested target size (${formatBytes(targetBytes)}) is too small for a ${videoDuration.toFixed(
            1
          )}s video. Minimum achievable size is approx ${formatBytes(minFeasibleBytes)}.`
        );
        return;
      }
    }

    setError(null);
    setIsCompressing(true);
    setProgress(2);
    setProgressStage('Preparing video for encoding...');
    setProgressDetails(null);

    const client = new VideoCompressorClient();
    clientRef.current = client;

    try {
      const val = parseFloat(targetSizeInput.trim());
      const res = await client.compress(file, {
        targetSize: val,
        targetUnit,
        onProgress: (pct, stage, details) => {
          setProgress(pct);
          setProgressStage(stage);
          if (details) setProgressDetails(details);
        },
      });

      setResult(res);
      setIsCompressing(false);
      clientRef.current = null;
    } catch (err: any) {
      console.error('Video compression error:', err);
      setError(err.message || 'Compression failed.');
      setIsCompressing(false);
      clientRef.current = null;
    }
  };

  const handleCancel = () => {
    if (clientRef.current) {
      clientRef.current.cancel();
      clientRef.current = null;
    }
    setIsCompressing(false);
    setProgress(0);
    setProgressStage('');
    setError('Video compression was cancelled.');
  };

  const resetAll = () => {
    if (clientRef.current) {
      clientRef.current.cancel();
      clientRef.current = null;
    }
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    setFile(null);
    setLocalVideoUrl(null);
    setVideoDuration(null);
    setVideoResolution(null);
    setResult(null);
    setError(null);
    setIsCompressing(false);
  };

  const applyPresetSize = (val: number, unit: 'KB' | 'MB') => {
    setTargetSizeInput(val.toString());
    setTargetUnit(unit);
  };

  const applyPresetFraction = (fraction: number) => {
    if (!file) return;
    const bytes = Math.round(file.size * fraction);
    if (bytes >= 1024 * 1024) {
      setTargetSizeInput((bytes / (1024 * 1024)).toFixed(1));
      setTargetUnit('MB');
    } else {
      setTargetSizeInput(Math.round(bytes / 1024).toString());
      setTargetUnit('KB');
    }
  };

  const estKbps = calculateEstimatedBitrate();

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Upload Zone */}
      {!file && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-10 sm:p-14 text-center cursor-pointer transition-all duration-200 ${
            isDragOver
              ? 'border-indigo-400 bg-indigo-950/20 scale-[1.01]'
              : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/90'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,.mp4,.mov,.webm,.mkv,.avi"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
              <Film className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-white">
                Drop your video here or <span className="text-indigo-400 underline underline-offset-2">browse files</span>
              </h3>
              <p className="text-sm text-slate-400">
                Supports MP4, MOV, WebM, MKV, AVI • Genuine FFmpeg Encoding
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <span className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 font-mono">MP4 (H.264)</span>
              <span className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 font-mono">Apple MOV</span>
              <span className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 font-mono">WebM</span>
              <span className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 font-mono">MKV</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 pt-2">
              <ShieldCheck className="w-4 h-4 text-indigo-500/70" />
              <span>Real 2-Pass Bitrate Controller • Preserves Audio &amp; Video Sync</span>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-start gap-3 animate-in fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-rose-200">Unable to compress video</p>
            <p className="mt-0.5 text-rose-300/90">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-semibold px-2 py-1 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace when video is selected */}
      {file && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">
            {/* Top Bar: File preview chip & Reset button */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-lg bg-indigo-950/60 border border-indigo-700/50 flex items-center justify-center text-indigo-400 flex-shrink-0">
                  <Video className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
                    {file.name}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-indigo-400 font-medium">{formatBytes(file.size)}</span>
                    {videoDuration && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-slate-300">{videoDuration.toFixed(1)}s</span>
                      </>
                    )}
                    {videoResolution && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-slate-400">{videoResolution.width} × {videoResolution.height}</span>
                      </>
                    )}
                    <span>•</span>
                    <span className="uppercase text-[11px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                      {file.type.replace('video/', '') || 'VIDEO'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={resetAll}
                disabled={isCompressing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-lg transition disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Choose Different Video
              </button>
            </div>

            {/* Target Size Configuration */}
            <div className="space-y-4">
              <div>
                <label htmlFor="videoTargetInput" className="block text-sm font-bold text-white mb-1.5 tracking-tight flex items-center justify-between">
                  <span>Target File Size</span>
                  <span className="text-xs font-normal text-slate-400">
                    Original: <strong className="text-slate-300 font-mono">{formatBytes(file.size)}</strong>
                  </span>
                </label>
                <p className="text-xs text-slate-400 mb-3">
                  Enter your desired target video file size. FFmpeg will encode with calculated video &amp; audio bitrates.
                </p>

                {/* Primary Input */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      id="videoTargetInput"
                      type="number"
                      step="any"
                      min="1"
                      value={targetSizeInput}
                      onChange={(e) => {
                        setTargetSizeInput(e.target.value);
                        setError(null);
                      }}
                      disabled={isCompressing}
                      placeholder="e.g. 10"
                      className="w-full bg-slate-950 border-2 border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-3 text-lg font-mono font-bold text-white placeholder-slate-600 focus:outline-none transition shadow-inner"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono pointer-events-none">
                      {targetUnit === 'KB' ? 'Kilobytes' : 'Megabytes'}
                    </div>
                  </div>

                  {/* Unit Selector Toggle */}
                  <div className="flex bg-slate-950 border-2 border-slate-700 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setTargetUnit('MB')}
                      disabled={isCompressing}
                      className={`px-4 py-2.5 rounded-lg text-sm font-bold transition font-mono ${
                        targetUnit === 'MB'
                          ? 'bg-indigo-500 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      MB
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetUnit('KB')}
                      disabled={isCompressing}
                      className={`px-4 py-2.5 rounded-lg text-sm font-bold transition font-mono ${
                        targetUnit === 'KB'
                          ? 'bg-indigo-500 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      KB
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
                <span className="text-slate-500 font-medium">Quick Target:</span>
                <button
                  type="button"
                  onClick={() => applyPresetFraction(0.5)}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  50% of Original
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetFraction(0.25)}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  75% Smaller
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetSize(5, 'MB')}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  5 MB
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetSize(10, 'MB')}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  10 MB
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetSize(25, 'MB')}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  25 MB
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetSize(50, 'MB')}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  50 MB
                </button>
              </div>

              {/* Bitrate & Quality Assessment Preview */}
              {estKbps !== null && (
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-indigo-400" />
                    <span className="text-slate-400">Target Bitrate Allocation:</span>
                    <strong className="text-indigo-300 font-mono">~{estKbps} kbps</strong>
                  </div>

                  <div className="text-[11px] font-mono">
                    {estKbps > 1500 ? (
                      <span className="text-emerald-400 font-medium">● High Definition Visual Quality</span>
                    ) : estKbps > 600 ? (
                      <span className="text-indigo-400 font-medium">● Balanced Quality (720p/1080p)</span>
                    ) : estKbps > 200 ? (
                      <span className="text-amber-400 font-medium">● Compact Quality (480p/720p)</span>
                    ) : (
                      <span className="text-rose-400 font-medium">● Aggressive Compression (low bitrate)</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Target warning if target is larger than original */}
            {(() => {
              const { targetBytes } = getTargetBytes();
              if (targetBytes > file.size && !isNaN(targetBytes)) {
                return (
                  <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                    <span>
                      Target size ({formatBytes(targetBytes)}) is larger than the original video ({formatBytes(file.size)}).
                      Compression maintains clean playback without artificially inflating file size.
                    </span>
                  </div>
                );
              }
              return null;
            })()}

            {/* Compress Action / Cancel Button */}
            <div>
              {!isCompressing ? (
                <button
                  type="button"
                  onClick={handleCompress}
                  className="w-full py-4 px-6 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] transition shadow-lg shadow-indigo-950/40 flex items-center justify-center gap-2 text-base cursor-pointer"
                >
                  <Zap className="w-5 h-5 fill-white" />
                  <span>Compress Video to Target Size</span>
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 py-4 px-6 rounded-xl font-bold text-white bg-indigo-900/60 border border-indigo-700/60 flex items-center justify-center gap-2 text-base cursor-not-allowed">
                    <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                    <span>Compressing Video... ({progress}%)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="py-4 px-5 rounded-xl font-semibold text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 transition flex items-center gap-1.5 text-sm"
                  >
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Real-time Video Encoding Progress */}
            {isCompressing && (
              <div className="space-y-3 pt-2 animate-in fade-in">
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-indigo-500 h-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                  <div className="flex items-center gap-2 font-mono">
                    <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                    <span className="text-indigo-300 font-medium">{progressStage}</span>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
                    {progressDetails?.fps && (
                      <span>Speed: <strong className="text-slate-200">{progressDetails.fps.toFixed(0)} fps</strong></span>
                    )}
                    {progressDetails?.speed && (
                      <span>Rate: <strong className="text-slate-200">{progressDetails.speed}</strong></span>
                    )}
                    <span className="font-bold text-white">{progress}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results Card */}
          {result && (
            <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Video Compression Completed</h3>
                    <p className="text-xs text-slate-400">
                      Target file size achieved with synchronized audio/video stream
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold">
                    {result.outputFormat}
                  </span>
                </div>
              </div>

              {/* Warning if any */}
              {result.warning && (
                <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
                  <span>{result.warning}</span>
                </div>
              )}

              {/* 4 KPI Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Original Size */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Original Size</span>
                  <span className="text-lg font-bold font-mono text-slate-200 mt-1 block">
                    {formatBytes(result.originalSize)}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 block truncate">
                    {formatNumberWithCommas(result.originalSize)} bytes
                  </span>
                </div>

                {/* 2. Final Compressed Size */}
                <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-xl p-3.5">
                  <span className="text-[11px] font-medium text-indigo-400 block uppercase tracking-wider">Final Size</span>
                  <span className="text-lg font-bold font-mono text-indigo-300 mt-1 block">
                    {formatBytes(result.compressedSize)}
                  </span>
                  <span className="text-[10px] font-mono text-indigo-400/80 block truncate">
                    {result.compressionPercentage > 0
                      ? `${result.compressionPercentage}% reduction`
                      : 'Preserved size'}
                  </span>
                </div>

                {/* 3. Target Size */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Target Requested</span>
                  <span className="text-lg font-bold font-mono text-slate-300 mt-1 block">
                    {formatBytes(result.targetBytes)}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 block truncate">
                    {formatNumberWithCommas(result.targetBytes)} bytes
                  </span>
                </div>

                {/* 4. Variance */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
                  <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Target Variance</span>
                  <span
                    className={`text-lg font-bold font-mono mt-1 block ${
                      result.differenceBytes <= 0 ? 'text-indigo-400' : 'text-amber-400'
                    }`}
                  >
                    {result.differenceBytes <= 0 ? '' : '+'}
                    {formatBytes(Math.abs(result.differenceBytes))}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 block truncate">
                    {result.differencePercent.toFixed(1)}% vs target
                  </span>
                </div>
              </div>

              {/* Playable In-Browser Video Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-medium text-slate-300 flex items-center gap-1.5">
                    <Play className="w-4 h-4 text-indigo-400" /> Playable Video Preview
                  </span>
                  <span className="font-mono text-[11px]">
                    Duration: {result.duration.toFixed(1)}s
                  </span>
                </div>

                <div className="rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video max-h-96 flex items-center justify-center">
                  <video
                    controls
                    preload="metadata"
                    className="w-full h-full object-contain"
                    src={result.previewUrl}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>

              {/* Download & Actions Bar */}
              <div className="pt-3 flex flex-col sm:flex-row items-center gap-3">
                <a
                  href={result.downloadUrl}
                  download
                  className="w-full sm:flex-1 py-4 px-6 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] transition shadow-lg shadow-indigo-950/40 flex items-center justify-center gap-2 text-base text-center cursor-pointer"
                >
                  <Download className="w-5 h-5" />
                  <span>Download Compressed Video ({formatBytes(result.compressedSize)})</span>
                </a>

                <button
                  type="button"
                  onClick={resetAll}
                  className="w-full sm:w-auto py-4 px-6 rounded-xl font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center justify-center gap-2 text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Compress Another</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
