import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  Download,
  AlertCircle,
  CheckCircle2,
  FileImage,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Scale,
  Zap,
} from 'lucide-react';
import {
  compressImage,
  formatBytes,
  formatNumberWithCommas,
  ImageCompressionResult,
} from '../utils/imageCompressor';
import { ImageComparison } from './ImageComparison';

export const PhotoCompressor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [targetSizeInput, setTargetSizeInput] = useState<string>('250');
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>('KB');
  const [formatChoice, setFormatChoice] = useState<'auto' | 'image/jpeg' | 'image/webp' | 'image/png' | 'image/avif'>('auto');

  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [progressStage, setProgressStage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImageCompressionResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Clean up object URLs on unmount or file change
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
      if (result?.blobUrl) URL.revokeObjectURL(result.blobUrl);
    };
  }, []);

  const handleFileSelect = (selectedFile: File) => {
    setError(null);
    setResult(null);

    // Validate image format
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
    const isSupported =
      supportedTypes.includes(selectedFile.type) ||
      /\.(jpe?g|png|webp|avif)$/i.test(selectedFile.name);

    if (!isSupported) {
      setError(
        `Unsupported image format (${selectedFile.type || 'unknown'}). Supported formats are JPEG, PNG, WebP, and AVIF.`
      );
      return;
    }

    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    const newPreview = URL.createObjectURL(selectedFile);
    setFile(selectedFile);
    setFilePreviewUrl(newPreview);

    // Default target: suggest ~50% of original or reasonable target
    const origKb = selectedFile.size / 1024;
    if (origKb > 2048) {
      // > 2MB, suggest 1 MB
      setTargetSizeInput(Math.max(1, Math.round(origKb / 2048)).toString());
      setTargetUnit('MB');
    } else {
      // Suggest ~50% of KB
      const suggestedKb = Math.max(20, Math.round(origKb * 0.5));
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

  // Convert input value to target bytes
  const getParsedTargetBytes = (): { targetBytes: number; error?: string } => {
    const val = parseFloat(targetSizeInput.trim());
    if (isNaN(val) || val <= 0) {
      return { targetBytes: 0, error: 'Please enter a valid positive number for target file size.' };
    }
    const bytes = Math.round(val * (targetUnit === 'KB' ? 1024 : 1024 * 1024));
    if (bytes < 512) {
      return { targetBytes: 0, error: 'Target size cannot be less than 512 bytes.' };
    }
    return { targetBytes: bytes };
  };

  const handleCompress = async () => {
    if (!file) {
      setError('Please select an image file first.');
      return;
    }

    const { targetBytes, error: targetError } = getParsedTargetBytes();
    if (targetError) {
      setError(targetError);
      return;
    }

    setError(null);
    setIsCompressing(true);
    setProgress(5);
    setProgressStage('Initializing real photo compression...');

    try {
      const res = await compressImage(file, {
        targetBytes,
        outputFormat: formatChoice,
        onProgress: (pct, stage) => {
          setProgress(pct);
          setProgressStage(stage);
        },
      });

      setResult(res);
      setIsCompressing(false);
    } catch (err: any) {
      console.error('Image compression failed:', err);
      setError(err.message || 'Compression failed unexpectedly.');
      setIsCompressing(false);
    }
  };

  const handleDownload = () => {
    if (!result || !file) return;
    const a = document.createElement('a');
    a.href = result.blobUrl;
    const originalBase = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const ext =
      result.mimeType === 'image/jpeg'
        ? '.jpg'
        : result.mimeType === 'image/webp'
        ? '.webp'
        : result.mimeType === 'image/png'
        ? '.png'
        : result.mimeType === 'image/avif'
        ? '.avif'
        : '.jpg';
    a.download = `${originalBase}_compressed${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const resetAll = () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    if (result?.blobUrl) URL.revokeObjectURL(result.blobUrl);
    setFile(null);
    setFilePreviewUrl(null);
    setResult(null);
    setError(null);
    setIsCompressing(false);
  };

  // Preset quick chips
  const applyPresetPercentage = (fraction: number) => {
    if (!file) return;
    const bytes = Math.round(file.size * fraction);
    if (bytes >= 1024 * 1024) {
      setTargetSizeInput((bytes / (1024 * 1024)).toFixed(2));
      setTargetUnit('MB');
    } else {
      setTargetSizeInput(Math.round(bytes / 1024).toString());
      setTargetUnit('KB');
    }
  };

  const applyPresetSize = (val: number, unit: 'KB' | 'MB') => {
    setTargetSizeInput(val.toString());
    setTargetUnit(unit);
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Upload Zone (when no file selected) */}
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
              ? 'border-emerald-400 bg-emerald-950/20 scale-[1.01]'
              : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/90'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
          />

          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
              <UploadCloud className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-white">
                Drop your photo here or <span className="text-emerald-400 underline underline-offset-2">browse files</span>
              </h3>
              <p className="text-sm text-slate-400">
                Supports JPEG, PNG, WebP, and AVIF • Up to 50 MB
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <span className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 font-mono">JPG / JPEG</span>
              <span className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 font-mono">PNG (Alpha)</span>
              <span className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 font-mono">WebP</span>
              <span className="px-2.5 py-1 text-xs rounded-md bg-slate-800 text-slate-300 font-mono">AVIF</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 pt-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500/70" />
              <span>100% Client-Side Processing • Your photos never leave your device</span>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-start gap-3 animate-in fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-rose-200">Unable to compress photo</p>
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

      {/* Main Workspace when file is selected */}
      {file && (
        <div className="space-y-6">
          {/* File Card & Settings */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">
            {/* Top Bar: File preview chip & Reset button */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                {filePreviewUrl && (
                  <img
                    src={filePreviewUrl}
                    alt="Original thumbnail"
                    className="w-12 h-12 object-cover rounded-lg border border-slate-700 bg-black flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
                    {file.name}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-emerald-400 font-medium">{formatBytes(file.size)}</span>
                    <span>•</span>
                    <span className="font-mono text-[11px] text-slate-500">{formatNumberWithCommas(file.size)} bytes</span>
                    <span>•</span>
                    <span className="uppercase text-[11px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                      {file.type.replace('image/', '') || 'IMAGE'}
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
                <RefreshCw className="w-3.5 h-3.5" /> Choose Different Photo
              </button>
            </div>

            {/* Target Size Configuration */}
            <div className="space-y-4">
              <div>
                <label htmlFor="photoTargetInput" className="block text-sm font-bold text-white mb-1.5 tracking-tight flex items-center justify-between">
                  <span>Target File Size</span>
                  <span className="text-xs font-normal text-slate-400">
                    Original: <strong className="text-slate-300 font-mono">{formatBytes(file.size)}</strong>
                  </span>
                </label>
                <p className="text-xs text-slate-400 mb-3">
                  Specify the maximum target size you want the compressed image to achieve.
                </p>

                {/* Primary Target Size Input Field */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      id="photoTargetInput"
                      type="number"
                      step="any"
                      min="1"
                      value={targetSizeInput}
                      onChange={(e) => {
                        setTargetSizeInput(e.target.value);
                        setError(null);
                      }}
                      disabled={isCompressing}
                      placeholder="e.g. 250"
                      className="w-full bg-slate-950 border-2 border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-lg font-mono font-bold text-white placeholder-slate-600 focus:outline-none transition shadow-inner"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono pointer-events-none">
                      {targetUnit === 'KB' ? 'Kilobytes' : 'Megabytes'}
                    </div>
                  </div>

                  {/* Unit Selector Toggle */}
                  <div className="flex bg-slate-950 border-2 border-slate-700 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setTargetUnit('KB')}
                      disabled={isCompressing}
                      className={`px-4 py-2.5 rounded-lg text-sm font-bold transition font-mono ${
                        targetUnit === 'KB'
                          ? 'bg-emerald-500 text-slate-950 shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      KB
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetUnit('MB')}
                      disabled={isCompressing}
                      className={`px-4 py-2.5 rounded-lg text-sm font-bold transition font-mono ${
                        targetUnit === 'MB'
                          ? 'bg-emerald-500 text-slate-950 shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      MB
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Target Preset Chips */}
              <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
                <span className="text-slate-500 font-medium">Quick Target:</span>
                <button
                  type="button"
                  onClick={() => applyPresetPercentage(0.5)}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  50% of Original
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetPercentage(0.25)}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  75% Smaller
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetSize(100, 'KB')}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  100 KB
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetSize(250, 'KB')}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  250 KB
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetSize(500, 'KB')}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  500 KB
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetSize(1, 'MB')}
                  disabled={isCompressing}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition border border-slate-700/60"
                >
                  1 MB
                </button>
              </div>

              {/* Format selection */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-slate-800/70">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">Output Format:</span>
                  <select
                    value={formatChoice}
                    onChange={(e: any) => setFormatChoice(e.target.value)}
                    disabled={isCompressing}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value="auto">Auto (Preserves transparency / optimal)</option>
                    <option value="image/jpeg">JPEG (Universal photo standard)</option>
                    <option value="image/webp">WebP (Modern high-efficiency)</option>
                    <option value="image/png">PNG (Lossless)</option>
                    <option value="image/avif">AVIF (Next-gen)</option>
                  </select>
                </div>
                <div className="text-[11px] text-slate-500">
                  Adaptive bisection encoder preserves aspect ratio &amp; metadata
                </div>
              </div>
            </div>

            {/* Target warning if target is larger than original */}
            {(() => {
              const { targetBytes } = getParsedTargetBytes();
              if (targetBytes > file.size && !isNaN(targetBytes)) {
                return (
                  <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                    <span>
                      Target size ({formatBytes(targetBytes)}) is larger than the original file ({formatBytes(file.size)}).
                      Compression reduces size; the original quality will be preserved without inflating bytes.
                    </span>
                  </div>
                );
              }
              return null;
            })()}

            {/* Compress Action Button */}
            <div>
              <button
                type="button"
                onClick={handleCompress}
                disabled={isCompressing}
                className="w-full py-4 px-6 rounded-xl font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.99] transition shadow-lg shadow-emerald-950/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base"
              >
                {isCompressing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Compressing Photo... ({progress}%)</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 fill-slate-950" />
                    <span>Compress Photo to Target Size</span>
                  </>
                )}
              </button>
            </div>

            {/* Real-time Progress Bar */}
            {isCompressing && (
              <div className="space-y-2 pt-2 animate-in fade-in">
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono text-emerald-400">{progressStage}</span>
                  <span className="font-mono">{progress}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Results Card */}
          {result && (
            <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-5 sm:p-7 shadow-2xl space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Header with success badge */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Photo Compression Results</h3>
                    <p className="text-xs text-slate-400">
                      Achieved target compression with minimal perceptual loss
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold">
                    {result.outputFormat} • {result.outputWidth} × {result.outputHeight} px
                  </span>
                </div>
              </div>

              {/* Warnings if any */}
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

                {/* 2. Compressed Size */}
                <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5">
                  <span className="text-[11px] font-medium text-emerald-400 block uppercase tracking-wider">Final Size</span>
                  <span className="text-lg font-bold font-mono text-emerald-300 mt-1 block">
                    {formatBytes(result.compressedSize)}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400/80 block truncate">
                    {result.compressionPercentage > 0
                      ? `${result.compressionPercentage}% reduction`
                      : 'Preserved size'}
                  </span>
                </div>

                {/* 3. Requested Target */}
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
                      result.differenceBytes <= 0 ? 'text-emerald-400' : 'text-amber-400'
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

              {/* Technical details strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <div className="flex items-center gap-4">
                  <span>Quality Factor: <strong className="text-slate-200 font-mono">{result.qualityUsed}%</strong></span>
                  <span>Scale Ratio: <strong className="text-slate-200 font-mono">{result.scaleUsed}%</strong></span>
                  <span>Dimensions: <strong className="text-slate-200 font-mono">{result.outputWidth} × {result.outputHeight}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Real Encoded Output</span>
                </div>
              </div>

              {/* Visual Comparison: Slider or Side-by-side */}
              {filePreviewUrl && (
                <div className="pt-2">
                  <ImageComparison
                    originalUrl={filePreviewUrl}
                    compressedUrl={result.blobUrl}
                    originalSizeStr={formatBytes(result.originalSize)}
                    compressedSizeStr={formatBytes(result.compressedSize)}
                  />
                </div>
              )}

              {/* Download & Actions bar */}
              <div className="pt-3 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full sm:flex-1 py-4 px-6 rounded-xl font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.99] transition shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 text-base cursor-pointer"
                >
                  <Download className="w-5 h-5" />
                  <span>Download Compressed Photo ({formatBytes(result.compressedSize)})</span>
                </button>

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
