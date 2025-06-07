import { FFmpeg } from '@ffmpeg/ffmpeg';

/**
 * FFmpegService - Responsible for FFmpeg instance lifecycle
 * Single responsibility: Managing FFmpeg instances and their lifecycle
 */
export class FFmpegService {
  /**
   * Create a new FFmpeg instance
   * Each instance is isolated and can be terminated independently
   */
  public createInstance(): Promise<FFmpeg> {
    return new Promise<FFmpeg>((resolve, reject) => {
      try {
        const ffmpeg = new FFmpeg();
        
        // Load FFmpeg
        ffmpeg.load()
          .then(() => {
            console.log('FFmpeg instance created and loaded successfully');
            resolve(ffmpeg);
          })
          .catch((error) => {
            console.error('Error loading FFmpeg:', error);
            reject(error);
          });
      } catch (error) {
        console.error('Error creating FFmpeg instance:', error);
        reject(error);
      }
    });
  }

  /**
   * Safely terminate an FFmpeg instance
   * Uses multiple approaches to ensure complete termination
   */
  public terminateInstance(ffmpegInstance: FFmpeg | null): void {
    if (!ffmpegInstance) return;
    
    try {
      console.log('Terminating FFmpeg instance');
      
      // Approach 1: Direct worker termination
      try {
        // @ts-expect-error - Accessing internal _worker property
        if (ffmpegInstance._worker) {
          // @ts-expect-error - Terminating worker
          ffmpegInstance._worker.terminate();
          console.log('FFmpeg worker terminated directly');
        }
      } catch (e) {
        console.error('Failed direct worker termination:', e);
      }
      
      // Approach 2: Using internal terminate method if available
      try {
        // @ts-expect-error - Accessing private methods
        if (ffmpegInstance._terminate) {
          // @ts-expect-error - Calling private method
          ffmpegInstance._terminate();
          console.log('Used internal terminate method');
        }
      } catch (e) {
        console.error('Failed internal terminate method:', e);
      }
      
      // Approach 3: Using exit method if available
      try {
        // @ts-expect-error - Accessing internal methods
        if (ffmpegInstance.exit) {
          // @ts-expect-error - Calling internal method
          ffmpegInstance.exit();
          console.log('Used exit method on FFmpeg instance');
        }
      } catch (e) {
        console.error('Failed exit method:', e);
      }
    } catch (error) {
      console.error('Error during FFmpeg instance termination:', error);
    }
  }
}
