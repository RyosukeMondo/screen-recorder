import { FFmpeg } from '@ffmpeg/ffmpeg';
import { FFmpegService } from './ffmpeg.service';

/**
 * Callback for reporting progress during encoding
 */
export type ProgressCallback = (progress: number) => void;

/**
 * Callback for when encoding is cancelled
 */
export type CancellationCallback = () => void;

/**
 * EncodingJob - Self-contained encoding job that can be destroyed
 * Single responsibility: Managing a single video encoding task
 */
export class EncodingJob {
  private ffmpeg: FFmpeg | null = null;
  private ffmpegService: FFmpegService;
  private currentFrame = 0;
  private totalFrames = 0;
  private estimatedDuration = 0; // Used for progress calculation
  private lastLogMessage = ''; // Stores latest FFmpeg log message for debugging
  private isCancelled = false;
  private isProcessing = false;
  private abortController: AbortController;
  private progressCallback?: ProgressCallback | null;
  private cancellationCallback?: CancellationCallback | null;
  private safetyTimeoutMs: number = 180000; // Default to 3 minutes timeout
  
  constructor(
    progressCallback?: ProgressCallback | null,
    cancellationCallback?: CancellationCallback | null
  ) {
    this.progressCallback = progressCallback;
    this.cancellationCallback = cancellationCallback;
    this.ffmpegService = new FFmpegService();
    this.abortController = new AbortController();
  }
  
  /**
   * Start encoding a video from the provided chunks
   * Returns the encoded blob
   */
  public async encode(chunks: Blob[]): Promise<Blob> {
    if (this.isProcessing) {
      throw new Error('Job is already processing');
    }
    
    this.isProcessing = true;
    this.isCancelled = false;
    
    try {
      // Initialize FFmpeg
      this.ffmpeg = await this.initializeFFmpeg();
      
      // Report initial progress
      if (this.progressCallback) {
        this.progressCallback(0.05);
      }
      
      // Process video
      const result = await this.transcodeToMp4(chunks);
      
      // Report complete
      if (this.progressCallback && !this.isCancelled) {
        this.progressCallback(1);
      }
      
      return result;
    } catch (error) {
      // Only call cancellation callback if it was actually cancelled
      if (this.isCancelled && this.cancellationCallback) {
        this.cancellationCallback();
      }
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Cancel the current encoding job
   * Fully terminates all resources
   */
  public cancel(): void {
    if (!this.isProcessing) return;
    
    console.log('Encoding job cancellation requested');
    this.isCancelled = true;
    
    // Abort any pending operations
    this.abortController.abort();
    
    // Terminate FFmpeg instance
    this.terminateFFmpeg();
    
    // Signal cancellation
    if (this.cancellationCallback) {
      this.cancellationCallback();
    }
  }
  
  /**
   * Release all resources related to this job
   * Call this when the job is no longer needed
   */
  public destroy(): void {
    // If still processing, cancel first
    if (this.isProcessing) {
      this.cancel();
    }
    
    // Clean up resources
    this.terminateFFmpeg();
    this.progressCallback = null;
    this.cancellationCallback = null;
    this.lastLogMessage = '';
    this.currentFrame = 0;
    this.totalFrames = 0;
    this.estimatedDuration = 0;
  }
  
  /**
   * Initialize FFmpeg instance with event handlers
   */
  private async initializeFFmpeg(): Promise<FFmpeg> {
    try {
      const ffmpeg = await this.ffmpegService.createInstance();
      
      // Setup log handler
      ffmpeg.on('log', ({ message }) => {
        if (this.isCancelled) return;
        
        this.lastLogMessage = message;
        console.log(message);
        
        // Extract timing information
        this.extractTimeFromLog(this.lastLogMessage);
      });
      
      // Setup progress handler
      ffmpeg.on('progress', () => {
        if (this.isCancelled) return;
        
        // Calculate progress based on frames
        const calculatedProgress = this.calculateProgress();
        
        // Report progress
        if (this.progressCallback && !this.isCancelled) {
          this.progressCallback(calculatedProgress);
          console.log(`FFmpeg Processing: ${(calculatedProgress * 100).toFixed(2)}% (Frame: ${this.currentFrame}/${this.totalFrames || '?'})`);
        }
      });
      
      return ffmpeg;
    } catch (error) {
      console.error('Failed to initialize FFmpeg:', error);
      throw new Error('Failed to initialize FFmpeg');
    }
  }
  
  /**
   * Pre-analyze video to extract metadata before encoding
   * This helps determine duration, fps and frame count more reliably
   */
  private async preAnalyzeVideo(inputFileName: string): Promise<void> {
    if (!this.ffmpeg) throw new Error('FFmpeg not initialized');
    
    try {
      console.log('Pre-analyzing video metadata...');
      
      // Run FFmpeg with -i flag to just get file info
      await this.ffmpeg.exec([
        '-i', inputFileName
      ]).catch((ffmpegError) => {
        // This will intentionally error but give us file metadata in logs
        // The error message contains valuable information about the input file
        console.log('Pre-analysis complete - metadata extracted from error output');
        // Log the error details for debugging purposes
        console.debug('FFmpeg info output:', ffmpegError);
      });
      
      // If we still don't have a total frame estimate, set a reasonable default
      if (this.totalFrames <= 0) {
        console.log('Setting default frame count estimate after pre-analysis');
        this.totalFrames = 300; // Conservative default
      }
    } catch (err) {
      console.log('Pre-analysis failed, continuing with defaults', err);
    }
  }
  
  /**
   * Transcode blobs to MP4 using FFmpeg
   */
  private async transcodeToMp4(chunks: Blob[]): Promise<Blob> {
    if (!this.ffmpeg) throw new Error('FFmpeg not initialized');
    
    const inputFileName = 'input.webm';
    const outputFileName = 'output.mp4';
    
    try {
      // Check if already cancelled before starting
      if (this.isCancelled) {
        throw new Error('Operation cancelled');
      }
      
      // Create input file
      const webmFile = new Uint8Array(
        await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()
      );
      await this.ffmpeg.writeFile(inputFileName, webmFile);
      
      // Pre-analyze video to get duration and frame count
      await this.preAnalyzeVideo(inputFileName);
      
      // Get signal for aborting
      const signal = this.abortController.signal;
      
      await new Promise<void>((resolve, reject) => {
        // Check if already cancelled
        if (this.isCancelled) {
          reject(new Error('Operation cancelled'));
          return;
        }
        
        // Listen for abort signal
        signal.addEventListener('abort', () => {
          console.log('FFmpeg operation aborted via controller');
          reject(new Error('Operation cancelled'));
        });
        
        // Set up cancellation check interval
        const checkCancellation = setInterval(() => {
          if (this.isCancelled) {
            clearInterval(checkCancellation);
            this.terminateFFmpeg();
            reject(new Error('Operation cancelled'));
          }
        }, 20); // Check every 20ms
        
        // Safety timeout
        const safetyTimeout = setTimeout(() => {
          if (!this.isCancelled) {
            console.log(`FFmpeg safety timeout triggered after ${this.safetyTimeoutMs/1000}s`);
            this.cancel();
            reject(new Error('Operation timed out'));
          }
        }, this.safetyTimeoutMs); // Configurable timeout based on video complexity
        
        // Run FFmpeg command
        if (this.ffmpeg) {
          this.ffmpeg.exec([
            '-i', inputFileName,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '22',
            '-c:a', 'aac',
            '-strict', 'experimental',
            outputFileName
          ]).then(() => {
            // Success path
            clearInterval(checkCancellation);
            clearTimeout(safetyTimeout);
            
            if (this.isCancelled) {
              reject(new Error('Operation cancelled'));
            } else {
              resolve();
            }
          }).catch((error) => {
            // Error path
            clearInterval(checkCancellation);
            clearTimeout(safetyTimeout);
            reject(error);
          });
        } else {
          clearInterval(checkCancellation);
          clearTimeout(safetyTimeout);
          reject(new Error('FFmpeg not initialized'));
        }
      });
      
      // Read the output file
      const data = await this.ffmpeg.readFile(outputFileName);
      
      // Clean up files
      await this.ffmpeg.deleteFile(inputFileName);
      await this.ffmpeg.deleteFile(outputFileName);
      
      // Create output blob
      return new Blob([data as Uint8Array], { type: 'video/mp4' });
    } catch (error) {
      console.error('Error transcoding with FFmpeg:', error);
      
      if (this.isCancelled) {
        throw new Error('Operation cancelled');
      }
      
      // Fall back to native format on non-cancellation errors
      console.log('Falling back to native format');
      return new Blob(chunks, { type: 'video/mp4' });
    }
  }
  
  /**
   * Terminate FFmpeg instance and clean up
   */
  private terminateFFmpeg(): void {
    if (this.ffmpeg) {
      this.ffmpegService.terminateInstance(this.ffmpeg);
      this.ffmpeg = null;
    }
  }
  
  /**
   * Calculate progress based on frame count and duration
   */
  private calculateProgress(): number {
    // Use staged progress for better UX
    if (this.currentFrame === 0) {
      return 0.05; // Show some initial progress
    }
    
    // Use totalFrames if we have a good estimate
    if (this.totalFrames > this.currentFrame && this.totalFrames > 10) {
      const frameProgress = this.currentFrame / this.totalFrames;
      return Math.min(0.1 + frameProgress * 0.9, 0.99);
    }
    
    // Fall back to frame-based heuristic
    const frameBasedProgress = 0.1 + Math.min(this.currentFrame, 300) / 300 * 0.89;
    return Math.min(frameBasedProgress, 0.99);
  }

  /**
   * Extract timing information from FFmpeg log
   */
  private extractTimeFromLog(message: string): void {
    // Extract current frame information
    const frameMatch = message.match(/frame=\s*(\d+)/);
    if (frameMatch && frameMatch[1]) {
      this.currentFrame = parseInt(frameMatch[1], 10);
    }
    
    // Extract total duration if available
    const durationMatch = message.match(/Duration:\s*([\d:.]+)/);
    if (durationMatch && durationMatch[1] && !this.estimatedDuration) {
      const durationParts = durationMatch[1].split(':');
      if (durationParts.length === 3) {
        const hours = parseInt(durationParts[0], 10) || 0;
        const minutes = parseInt(durationParts[1], 10) || 0;
        const seconds = parseFloat(durationParts[2]) || 0;
        this.estimatedDuration = hours * 3600 + minutes * 60 + seconds;
        
        // Rough estimation of total frames based on fps from video stream
        if (this.totalFrames <= 0) {
          // Default to 30fps if we can't determine it
          this.totalFrames = Math.round(this.estimatedDuration * 30);
        }
      }
    }
    
    // Look for fps information in video stream metadata
    const fpsMatch = message.match(/(\d+(?:\.\d+)?)\s*fps/);
    if (fpsMatch && fpsMatch[1]) {
      const fps = parseFloat(fpsMatch[1]);
      if (fps > 0 && this.estimatedDuration && this.totalFrames <= 0) {
        this.totalFrames = Math.round(this.estimatedDuration * fps);
        console.log(`Estimated total frames: ${this.totalFrames} (${fps} fps, ${this.estimatedDuration}s)`);
      }
    }
    
    // Look specifically for Stream information that contains fps
    if (message.includes('Video:') && message.includes('fps')) {
      const streamFpsMatch = message.match(/(\d+(?:\.\d+)?)\s*fps/);
      if (streamFpsMatch && streamFpsMatch[1]) {
        const streamFps = parseFloat(streamFpsMatch[1]);
        if (streamFps > 0 && this.estimatedDuration) {
          this.totalFrames = Math.round(this.estimatedDuration * streamFps);
          console.log(`Stream info - Total frames: ${this.totalFrames} (${streamFps} fps, ${this.estimatedDuration}s)`);
        }
      }
    }
    
    // Handle special case for webm files that might report N/A duration
    if (message.includes('Duration: N/A') && message.includes('Video:')) {
      // Try to get resolution and use it as a complexity factor
      const resolutionMatch = message.match(/(\d+)x(\d+)/);
      if (resolutionMatch && resolutionMatch[1] && resolutionMatch[2]) {
        const width = parseInt(resolutionMatch[1]);
        const height = parseInt(resolutionMatch[2]);
        const pixelCount = width * height;
        
        // Use pixel count as a complexity heuristic for timeouts
        // Higher resolution = more processing time needed
        const complexityFactor = Math.min(pixelCount / (1920 * 1080), 4); // Cap at 4x 1080p complexity
        
        // For WebM with unknown duration, set a default frame count based on resolution
        this.totalFrames = Math.max(this.totalFrames, Math.round(1800 * complexityFactor)); // ~60s at 30fps adjusted for complexity
        
        // Adjust safety timeout based on resolution complexity
        this.adjustSafetyTimeout(complexityFactor);
        console.log(`WebM with N/A duration - Estimated frames: ${this.totalFrames} (based on ${width}x${height} resolution)`);
      }
    }
  }

  /**
   * Adjusts the safety timeout based on video complexity
   */
  private adjustSafetyTimeout(complexityFactor: number): void {
    // Base timeout of 3 minutes (180000ms)
    // Increase by complexity factor (with a maximum of 10 minutes for very complex videos)
    const baseTimeout = 180000; // 3 minutes
    this.safetyTimeoutMs = Math.min(baseTimeout * complexityFactor, 600000); // Cap at 10 minutes
    console.log(`Adjusted safety timeout to ${this.safetyTimeoutMs/1000} seconds based on complexity factor ${complexityFactor.toFixed(2)}`);
  }
}
