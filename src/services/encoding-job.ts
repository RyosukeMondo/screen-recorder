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
  private lastLogMessage = ''; // Used to parse FFmpeg logs
  private isCancelled = false;
  private isProcessing = false;
  private abortController: AbortController;
  private progressCallback?: ProgressCallback | null;
  private cancellationCallback?: CancellationCallback | null;
  
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
        this.extractTimeFromLog(message);
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
            console.log('FFmpeg safety timeout triggered');
            this.cancel();
            reject(new Error('Operation timed out'));
          }
        }, 60000); // 1 minute timeout
        
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
   * Extract time information and frame count from FFmpeg log message
   */
  private extractTimeFromLog(logMessage: string): void {
    // Extract frame count
    const frameMatch = /frame=\\s*(\\d+)/.exec(logMessage || '');
    
    // Extract FPS
    const fpsMatch = /fps=\\s*([\\d.]+)/.exec(logMessage || '');
    
    // Extract duration
    const durationMatch = /Duration: ([\\d:.]+)/.exec(logMessage || '');
    
    // Update total frames estimate if we have duration and fps
    if (durationMatch && fpsMatch) {
      const fps = parseFloat(fpsMatch[1]);
      const timeParts = durationMatch[1].split(':');
      
      if (timeParts.length === 3) {
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);
        const seconds = parseFloat(timeParts[2]);
        
        const durationInSeconds = (hours * 3600) + (minutes * 60) + seconds;
        this.totalFrames = Math.round(durationInSeconds * fps);
        this.estimatedDuration = durationInSeconds;
        console.log(`Estimated total frames: ${this.totalFrames} (${durationInSeconds}s at ${fps} fps)`);
      }
    }
    
    // Update current frame if available
    if (frameMatch) {
      const frameCount = parseInt(frameMatch[1], 10);
      if (!isNaN(frameCount)) {
        this.currentFrame = frameCount;
      }
    }
  }
}
