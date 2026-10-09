export interface VideoCompressionOptions {
  targetSize: number;
  targetUnit: 'KB' | 'MB';
  onProgress?: (progress: number, stage: string, details?: VideoProgressDetails) => void;
}

export interface VideoProgressDetails {
  fps?: number;
  speed?: string;
  duration?: number;
  currentTime?: number;
  stage: string;
}

export interface VideoCompressionResult {
  jobId: string;
  originalName: string;
  originalSize: number;
  compressedSize: number;
  targetBytes: number;
  differenceBytes: number;
  differencePercent: number;
  compressionPercentage: number;
  duration: number;
  outputFormat: string;
  downloadUrl: string;
  previewUrl: string;
  warning?: string;
}

export class VideoCompressorClient {
  private activeXhr: XMLHttpRequest | null = null;
  private currentJobId: string | null = null;
  private pollInterval: any = null;
  private isCancelled = false;

  async compress(
    file: File,
    options: VideoCompressionOptions
  ): Promise<VideoCompressionResult> {
    this.isCancelled = false;
    const { targetSize, targetUnit, onProgress } = options;

    if (isNaN(targetSize) || targetSize <= 0) {
      throw new Error('Please enter a valid positive number for target file size.');
    }

    // Step 1: Upload file with progress tracking
    onProgress?.(2, 'Uploading video to processor...', { stage: 'Uploading' });

    const uploadResponse = await this.uploadVideo(file, targetSize, targetUnit, (uploadPct) => {
      // Map upload to 0-25% of overall progress
      const mapped = Math.round((uploadPct / 100) * 25);
      onProgress?.(mapped, `Uploading video (${uploadPct}%)...`, { stage: 'Uploading' });
    });

    if (this.isCancelled) {
      throw new Error('Video compression was cancelled.');
    }

    const { jobId } = uploadResponse;
    this.currentJobId = jobId;

    // Step 2: Poll job status until completion
    return new Promise<VideoCompressionResult>((resolve, reject) => {
      this.pollInterval = setInterval(async () => {
        if (this.isCancelled) {
          clearInterval(this.pollInterval);
          this.pollInterval = null;
          return reject(new Error('Video compression was cancelled.'));
        }

        try {
          const res = await fetch(`/api/video/status/${jobId}`);
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            return reject(new Error(errJson.error || 'Failed to query video compression job.'));
          }

          const statusData = await res.json();

          if (statusData.status === 'failed') {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            return reject(new Error(statusData.error || 'Video compression failed.'));
          }

          if (statusData.status === 'cancelled') {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            return reject(new Error('Video compression was cancelled.'));
          }

          // Compute mapped progress: upload is 0-25%, encoding is 25-100%
          const encPct = statusData.progress || 10;
          const overallPct = Math.min(99, 25 + Math.round((encPct / 100) * 74));

          onProgress?.(overallPct, statusData.currentStage || 'Encoding video...', {
            fps: statusData.fps,
            speed: statusData.speed,
            duration: statusData.duration,
            currentTime: statusData.currentTime,
            stage: statusData.currentStage,
          });

          if (statusData.status === 'completed') {
            clearInterval(this.pollInterval);
            this.pollInterval = null;

            onProgress?.(100, 'Video compression complete.', {
              stage: 'Completed',
              duration: statusData.duration,
            });

            resolve({
              jobId: statusData.id,
              originalName: statusData.originalName,
              originalSize: statusData.originalSize,
              compressedSize: statusData.outputSize,
              targetBytes: statusData.targetBytes,
              differenceBytes: statusData.differenceBytes,
              differencePercent: statusData.differencePercent,
              compressionPercentage: statusData.compressionPercentage,
              duration: statusData.duration || 0,
              outputFormat: statusData.outputFormat || 'MP4 (H.264 / AAC)',
              downloadUrl: statusData.downloadUrl,
              previewUrl: statusData.previewUrl,
              warning: statusData.warning,
            });
          }
        } catch (fetchErr: any) {
          // If transient error, let poll retry next tick
          console.warn('Job polling warning:', fetchErr);
        }
      }, 700);
    });
  }

  cancel() {
    this.isCancelled = true;
    if (this.activeXhr) {
      try {
        this.activeXhr.abort();
      } catch {}
      this.activeXhr = null;
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.currentJobId) {
      fetch(`/api/video/cancel/${this.currentJobId}`, { method: 'POST' }).catch(() => {});
      this.currentJobId = null;
    }
  }

  private uploadVideo(
    file: File,
    targetSize: number,
    targetUnit: string,
    onUploadProgress: (pct: number) => void
  ): Promise<{ jobId: string }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.activeXhr = xhr;

      const formData = new FormData();
      formData.append('video', file);
      formData.append('targetSize', targetSize.toString());
      formData.append('targetUnit', targetUnit);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 100);
          onUploadProgress(pct);
        }
      };

      xhr.onload = () => {
        this.activeXhr = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (e) {
            reject(new Error('Invalid response from server.'));
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            reject(new Error(errData.error || `Upload failed with HTTP ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => {
        this.activeXhr = null;
        reject(new Error('Network error during video upload. Please check your connection.'));
      };

      xhr.onabort = () => {
        this.activeXhr = null;
        reject(new Error('Upload was cancelled.'));
      };

      xhr.open('POST', '/api/video/compress', true);
      xhr.send(formData);
    });
  }
}
