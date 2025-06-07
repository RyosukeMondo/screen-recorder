import type { VideoInfo } from '../types/recording';

/**
 * Events emitted by MediaCaptureService
 */
export const MediaCaptureEvents = {
  DATA_AVAILABLE: 'dataAvailable',
  RECORDING_STOPPED: 'recordingStopped',
  ERROR: 'error',
} as const;

export type MediaCaptureEventType = typeof MediaCaptureEvents[keyof typeof MediaCaptureEvents];

// Define event data structure for type safety
export interface MediaCaptureEventMap {
  [MediaCaptureEvents.DATA_AVAILABLE]: [Blob];
  [MediaCaptureEvents.RECORDING_STOPPED]: [Blob[], VideoInfo];
  [MediaCaptureEvents.ERROR]: [string];
}

/**
 * Service responsible for screen media capture operations
 * Handles MediaRecorder lifecycle and screen capture streams
 */
export class MediaCaptureService {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  // Type for our event handlers - parameterized by event type
  private eventListeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  /**
   * Register event listener for MediaCaptureService events
   * @param event Event type to listen for
   * @param listener Callback function to execute when event occurs
   */
  public on<E extends MediaCaptureEventType>(
    event: E, 
    listener: (...args: E extends keyof MediaCaptureEventMap ? MediaCaptureEventMap[E] : never[]) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    // Type assertion needed for generic event handler system
    this.eventListeners.get(event)?.push(listener as (...args: unknown[]) => void);
  }

  /**
   * Remove event listener
   * @param event Event type to remove listener from
   * @param listener Listener to remove
   */
  public off<E extends MediaCaptureEventType>(
    event: E, 
    listener: (...args: E extends keyof MediaCaptureEventMap ? MediaCaptureEventMap[E] : never[]) => void
  ): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;

    // Type assertion needed for generic event handler system
    const index = listeners.indexOf(listener as (...args: unknown[]) => void);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }
  
  /**
   * Emit an event with provided arguments
   * @param event Event type to emit
   * @param args Arguments to pass to listeners
   */
  private emit<E extends MediaCaptureEventType>(
    event: E, 
    ...args: E extends keyof MediaCaptureEventMap ? MediaCaptureEventMap[E] : never[]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    
    listeners.forEach(listener => {
      listener(...args);
    });
  }
  
  /**
   * Check if recording is currently in progress
   */
  public isRecording(): boolean {
    return this.recorder !== null && this.recorder.state === 'recording';
  }

  /**
   * Start screen recording with optional audio
   * @param videoInfo Information about the recording session
   * @returns Promise that resolves when recording has started
   */
  public async startRecording(videoInfo: VideoInfo): Promise<void> {
    try {
      // Reset chunks array for new recording
      this.chunks = [];

      // Request screen capture with audio
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      // Create and configure MediaRecorder
      this.recorder = new MediaRecorder(this.stream);

      // Handle recording data
      this.recorder.ondataavailable = (e) => {
        this.chunks.push(e.data);
        this.emit(MediaCaptureEvents.DATA_AVAILABLE, e.data);
      };

      // Handle recording stop
      this.recorder.onstop = () => {
        // Emit event with all collected chunks and video info
        this.emit(MediaCaptureEvents.RECORDING_STOPPED, this.chunks, videoInfo);
      };

      // Start recording
      this.recorder.start();

      return Promise.resolve();
    } catch (error) {
      this.emit(
        MediaCaptureEvents.ERROR,
        `Failed to start recording: ${error instanceof Error ? error.message : String(error)}`
      );
      return Promise.reject(error);
    }
  }

  /**
   * Stop current recording if active
   */
  public stopRecording(): void {
    try {
      // Stop MediaRecorder if exists
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.stop();
      }

      // Stop all tracks in the stream
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }

      // Don't set to null here - need recorder to emit onstop event first
    } catch (error) {
      this.emit(
        MediaCaptureEvents.ERROR,
        `Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Clean up resources
   * Should be called after stopping recording and handling events
   */
  public cleanup(): void {
    this.recorder = null;
    this.stream = null;
  }

  /**
   * Get current recording chunks
   * Useful for immediate access to chunks without waiting for stop event
   */
  public getRecordingChunks(): Blob[] {
    return [...this.chunks];
  }
}
