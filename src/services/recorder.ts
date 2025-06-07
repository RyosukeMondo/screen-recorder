import type { RecordingOptions } from '../types/recording';

/**
 * RecorderService - Handles screen recording functionality
 * Single responsibility: Managing MediaRecorder and media streams
 */
export class RecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private recordedChunks: Blob[] = [];
  private onDataAvailable: (chunks: Blob[]) => void;
  
  constructor(onDataAvailable: (chunks: Blob[]) => void) {
    this.onDataAvailable = onDataAvailable;
  }

  /**
   * Request screen recording with specified options
   */
  async startRecording(options: RecordingOptions = { video: true, audio: true }): Promise<void> {
    try {
      // Request screen capture with specified options
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: options.video || true,
        audio: options.audio || true
      });
      
      // Set up MediaRecorder with specific MIME type for MP4
      // We attempt to use MP4 with H.264 codec, but fallback to browser default if not supported
      const mimeType = this.getSupportedMimeType();
      
      // Create and configure MediaRecorder with selected mime type
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000 // 2.5 Mbps for good quality
      });
      
      this.recordedChunks = [];
      
      // Handle recording data
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      
      // Handle recording stop
      recorder.onstop = () => {
        this.onDataAvailable(this.recordedChunks);
      };
      
      // Store references
      this.mediaRecorder = recorder;
      this.mediaStream = stream;
      
      // Start recording with 1-second chunks for better streaming capability
      recorder.start(1000);
      
      return Promise.resolve();
    } catch (error) {
      console.error('Error starting recording:', error);
      return Promise.reject(error);
    }
  }

  /**
   * Stop current recording session
   */
  stopRecording(): void {
    try {
      // Stop MediaRecorder if exists
      if (this.mediaRecorder) {
        this.mediaRecorder.stop();
        
        // Stop all tracks in the stream
        if (this.mediaStream) {
          this.mediaStream.getTracks().forEach(track => track.stop());
        }
        
        // Clear references
        this.mediaRecorder = null;
        this.mediaStream = null;
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      throw error;
    }
  }
  
  /**
   * Check if recording is in progress
   */
  isRecording(): boolean {
    return !!this.mediaRecorder && this.mediaRecorder.state !== 'inactive';
  }
  
  /**
   * Get supported MIME type for video recording
   * Try to use MP4 with H.264 codec if supported
   */
  private getSupportedMimeType(): string {
    // Preferred MIME types for MP4 encoding in order of preference
    const mimeTypes = [
      'video/mp4;codecs=h264,aac',
      'video/mp4;codecs=avc1,mp4a',
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm'
    ];
    
    // Find first supported MIME type
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log(`Using MIME type: ${type}`);
        return type;
      }
    }
    
    // If no specific types are supported, let the browser decide
    console.log('No specified MIME types supported, using browser default');
    return '';
  }
}
