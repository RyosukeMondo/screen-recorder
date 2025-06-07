import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// Define progress callback type
export type ProgressCallback = (progress: number) => void;

/**
 * VideoProcessorService - Handles video processing and download functionality
 * Single responsibility: Processing video data for download
 */
export class VideoProcessorService {
  private ffmpeg: FFmpeg | null = null;
  private ffmpegLoaded = false;
  private progressCallback: ProgressCallback | null = null;
  private totalFrames = 0; // Used for duration estimation but not for direct progress calculation
  private currentFrame = 0;
  private estimatedDuration = 0;
  private lastLogMessage = '';

  /**
   * Convert recorded chunks to MP4 format and download
   * Uses proper MP4 encoding with ffmpeg.js if available, or fallback to browser's format
   * @param chunks - The recorded video chunks
   * @param title - The video title
   * @param useFFmpeg - Whether to use FFmpeg for processing
   * @param onProgress - Optional callback for progress updates
   */
  async downloadMP4(
    chunks: Blob[], 
    title: string, 
    useFFmpeg = false, 
    onProgress?: ProgressCallback
  ): Promise<void> {
    try {
      // Add property to store the last log message
      this.lastLogMessage = '';
      // Get the actual MIME type from the first chunk to determine conversion needs
      const actualType = chunks[0]?.type || '';
      console.log(`Original recording format: ${actualType}`);
      
      // Register progress callback if provided
      if (onProgress) {
        this.progressCallback = onProgress;
      }
      
      // Create blob from chunks with explicit MP4 MIME type
      const blob = await this.createMP4Blob(chunks, useFFmpeg);
      
      // Clear progress callback after completion
      this.progressCallback = null;
      const url = URL.createObjectURL(blob);
      
      // Generate filename with timestamp
      const fileName = this.generateFileName(title);
      
      // Create download link and trigger download
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading video:', error);
      throw error;
    }
  }
  
  /**
   * Create MP4 blob from recorded chunks
   * Uses FFmpeg encoding if requested, otherwise uses native browser format
   */
  private async createMP4Blob(chunks: Blob[], useFFmpeg = false): Promise<Blob> {
    // If FFmpeg is not requested, just set the MIME type correctly
    if (!useFFmpeg) {
      console.log('Using native browser encoding');
      return new Blob(chunks, { type: 'video/mp4' });
    }
    
    console.log('Using FFmpeg encoding for better compatibility');
    return await this.transcodeToMp4WithFFmpeg(chunks);
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
   * Initialize FFmpeg instance
   */
  private async loadFFmpeg(): Promise<void> {
    if (this.ffmpegLoaded) return;
    
    try {
      // Add property to store the last log message
      this.lastLogMessage = '';
      this.ffmpeg = new FFmpeg();
      
      // Log messages from FFmpeg
      this.ffmpeg.on('log', ({ message }) => {
        console.log(message);
      });
      
      // Handle progress events
      this.ffmpeg.on('progress', () => {
        // Extract frame information from FFmpeg logs
        const frameMatch = /frame=\s*(\d+)/.exec(this.lastLogMessage || '');
        // We extract time directly in the extractTimeFromLog method
        
        if (frameMatch) {
          this.currentFrame = parseInt(frameMatch[1], 10);
        }
        
        // Calculate progress based on frames or time with a more conservative approach
        let calculatedProgress = 0;
        
        // Extract encoding time from the log message if available
        const currentTimeSeconds = this.extractTimeFromLog();
        
        // If this is the first few frames, use a logarithmic scale to show initial progress
        if (this.currentFrame <= 5) {
          // Start with 5% for first frame, gradually increase to 20% for first 5 frames
          calculatedProgress = 0.05 + (this.currentFrame * 0.03);
        } 
        // If we're in the middle of processing (frames 6-50)
        else if (this.currentFrame > 5 && this.currentFrame <= 50) {
          // Scale from 20% to 70% for frames 6-50
          calculatedProgress = 0.2 + ((this.currentFrame - 5) / 45) * 0.5;
        }
        // For later frames, use time-based estimation if available
        else if (currentTimeSeconds > 0 && this.estimatedDuration > 0) {
          const timeRatio = currentTimeSeconds / this.estimatedDuration;
          // Scale from 70% to 90% based on time ratio
          calculatedProgress = 0.7 + (timeRatio * 0.2);
          calculatedProgress = Math.min(0.9, calculatedProgress);
        }
        // If we have no better information, use frame count as a rough estimate
        else {
          // Beyond frame 50, assume we're in the 70%-90% range
          calculatedProgress = 0.7 + (Math.min(this.currentFrame - 50, 100) / 100) * 0.2;
          calculatedProgress = Math.min(0.9, calculatedProgress);
        }
        
        console.log(`FFmpeg Processing: ${(calculatedProgress * 100).toFixed(2)}% (Frame: ${this.currentFrame})`);
        
        // Report progress through callback if registered
        if (this.progressCallback) {
          this.progressCallback(calculatedProgress);
        }
      });
      
      // Track FFmpeg log messages to extract frame information
      this.ffmpeg.on('log', ({ message }) => {
        this.lastLogMessage = message;
        
        // Try to extract total frames or duration information
        if (message.includes('frame=') && message.includes('fps=')) {
          const durationMatch = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(message);
          if (durationMatch) {
            const hours = parseInt(durationMatch[1], 10);
            const minutes = parseInt(durationMatch[2], 10);
            const seconds = parseFloat(durationMatch[3]);
            this.estimatedDuration = hours * 3600 + minutes * 60 + seconds;
            
            // Estimate total frames based on duration and fps
            const fpsMatch = /\b(\d+\.?\d*) fps\b/.exec(message);
            if (fpsMatch) {
              const fps = parseFloat(fpsMatch[1]);
              this.totalFrames = Math.ceil(this.estimatedDuration * fps);
            }
          }
        }
      });
      
      // Load FFmpeg WASM files
      await this.ffmpeg.load();
      
      console.log('FFmpeg loaded successfully');
      this.ffmpegLoaded = true;
    } catch (error) {
      console.error('Error loading FFmpeg:', error);
      throw new Error('Failed to load FFmpeg');
    }
  }
  
  /**
   * Transcode video to MP4 format using FFmpeg
   */
  /**
   * Extract time in seconds from FFmpeg log message
   */
  private extractTimeFromLog(): number {
    const timeMatch = /time=\s*(\d+):(\d+):(\d+\.\d+)/.exec(this.lastLogMessage || '');
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = parseFloat(timeMatch[3]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  }
  
  private async transcodeToMp4WithFFmpeg(chunks: Blob[]): Promise<Blob> {
    try {
      // Add property to store the last log message
      this.lastLogMessage = '';
      // Reset progress tracking variables
      this.totalFrames = 0;
      this.currentFrame = 0;
      this.estimatedDuration = 0;
      this.lastLogMessage = '';
      
      // Report initial progress
      if (this.progressCallback) {
        this.progressCallback(0);
      }
      // Load FFmpeg if not already loaded
      await this.loadFFmpeg();
      if (!this.ffmpeg) throw new Error('FFmpeg failed to initialize');
      
      // Create a single blob from all chunks
      const inputBlob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
      
      // Report progress - starting conversion
      if (this.progressCallback) {
        this.progressCallback(0.1);
      }
      
      // Create an input file name
      const inputFileName = 'input.webm';
      const outputFileName = 'output.mp4';
      
      // Write the input file to FFmpeg's virtual file system
      await this.ffmpeg.writeFile(inputFileName, await fetchFile(inputBlob));
      
      // Run the FFmpeg command to convert to MP4 with H.264 codec
      // -c:v libx264 sets the video codec to H.264
      // -preset fast provides a good balance between encoding speed and quality
      // -crf 22 sets constant rate factor (quality level, lower is better, 18-28 is reasonable)
      // -c:a aac sets the audio codec to AAC
      // -strict experimental is needed for some older FFmpeg versions when using AAC
      await this.ffmpeg.exec([
        '-i', inputFileName,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-c:a', 'aac',
        '-strict', 'experimental',
        outputFileName
      ]);
      
      // Read the transcoded file
      const data = await this.ffmpeg.readFile(outputFileName);
      
      // Convert the Uint8Array to a Blob
      const outputBlob = new Blob([data], { type: 'video/mp4' });
      
      console.log('FFmpeg transcoding completed successfully');
      
      // Reset progress tracking variables
      this.totalFrames = 0;
      this.currentFrame = 0;
      this.estimatedDuration = 0;
      this.lastLogMessage = '';
      
      // Report complete progress
      if (this.progressCallback) {
        this.progressCallback(1);
      }
      
      return outputBlob;
    } catch (error) {
      console.error('Error transcoding with FFmpeg:', error);
      // Fall back to simple blob creation if FFmpeg fails
      console.log('Falling back to native format');
      return new Blob(chunks, { type: 'video/mp4' });
    }
  }
}
