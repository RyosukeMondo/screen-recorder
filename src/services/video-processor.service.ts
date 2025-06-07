import { ProcessingJobFactory } from './processing-job-factory';
import { EncodingJob } from './encoding-job';
import type { ProgressCallback, CancellationCallback } from './encoding-job';

/**
 * VideoProcessorService - Orchestrates video processing
 * Single responsibility: Coordinating the video processing workflow
 */
export class VideoProcessorService {
  private jobFactory: ProcessingJobFactory;
  private activeJob: EncodingJob | null = null;
  
  constructor() {
    this.jobFactory = new ProcessingJobFactory();
  }
  
  /**
   * Convert recorded chunks to MP4 format and download
   * Uses proper MP4 encoding with FFmpeg if available, or fallback to browser's format
   * @param chunks - The recorded video chunks
   * @param title - The video title
   * @param useFFmpeg - Whether to use FFmpeg for processing
   * @param onProgress - Optional callback for progress updates
   * @param onCancelled - Optional callback for when operation is cancelled
   */
  async downloadMP4(
    chunks: Blob[], 
    title: string, 
    useFFmpeg = false, 
    onProgress?: ProgressCallback,
    onCancelled?: CancellationCallback
  ): Promise<void> {
    try {
      console.log(`Downloading MP4${useFFmpeg ? ' with FFmpeg' : ' with native format'}`);
      console.log(`Original recording format: ${chunks[0]?.type || 'unknown'}`);
      
      // Create blob from chunks
      const blob = await this.createMP4Blob(chunks, useFFmpeg, onProgress, onCancelled);
      
      // Generate filename with timestamp
      const fileName = this.generateFileName(title);
      
      // Trigger download
      this.downloadBlob(blob, fileName);
    } catch (error) {
      console.error('Error downloading video:', error);
      throw error;
    }
  }
  
  /**
   * Cancel the current video processing operation
   */
  cancelProcessing(): void {
    console.log('VideoProcessor: Cancellation requested');
    
    if (this.activeJob) {
      this.activeJob.cancel();
      this.activeJob = null;
    }
  }
  
  /**
   * Create MP4 blob from recorded chunks
   * Uses FFmpeg encoding if requested, otherwise uses native browser format
   */
  private async createMP4Blob(
    chunks: Blob[], 
    useFFmpeg = false,
    onProgress?: ProgressCallback,
    onCancelled?: CancellationCallback
  ): Promise<Blob> {
    // If FFmpeg is not requested, just set the MIME type correctly
    if (!useFFmpeg) {
      console.log('Using native browser encoding');
      return new Blob(chunks, { type: 'video/mp4' });
    }
    
    console.log('Using FFmpeg encoding for better compatibility');
    
    try {
      // Create a new encoding job
      const job = this.jobFactory.createEncodingJob(onProgress, onCancelled);
      
      // Store reference to active job for cancellation
      this.activeJob = job;
      
      // Start encoding
      const result = await job.encode(chunks);
      
      // Clear active job reference
      this.activeJob = null;
      
      return result;
    } catch (error) {
      // Clear active job reference on error
      this.activeJob = null;
      
      // If it was cancelled, propagate the error
      if (error instanceof Error && error.message === 'Operation cancelled') {
        throw error;
      }
      
      // For other errors, fall back to native format
      console.error('Error using FFmpeg, falling back to native format:', error);
      return new Blob(chunks, { type: 'video/mp4' });
    }
  }
  
  /**
   * Generate standardized filename for downloaded video
   */
  private generateFileName(title: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}_${hours}-${minutes}_${title}.mp4`;
  }
  
  /**
   * Download a blob as a file
   */
  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    
    // Create download link and trigger download
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    a.click();
    
    // Clean up
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);
  }
}
