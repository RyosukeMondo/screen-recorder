import type { VideoInfo } from '../types/recording';
import { audioMixer } from './audio-mixer.service';
import EventEmitter from 'events';

/**
 * Events emitted by MediaCaptureService
 */
export const MediaCaptureEvents = {
  DATA_AVAILABLE: 'dataAvailable',
  RECORDING_STOPPED: 'recordingStopped',
  ERROR: 'error',
  AUDIO_DEVICES_AVAILABLE: 'audioDevicesAvailable',
} as const;

export type MediaCaptureEventType = typeof MediaCaptureEvents[keyof typeof MediaCaptureEvents];

// Define event data structure for type safety
export interface MediaCaptureEventMap {
  [MediaCaptureEvents.DATA_AVAILABLE]: [Blob];
  [MediaCaptureEvents.RECORDING_STOPPED]: [Blob[], VideoInfo];
  [MediaCaptureEvents.ERROR]: [string];
  [MediaCaptureEvents.AUDIO_DEVICES_AVAILABLE]: [AudioDeviceOption[]];
}

/**
 * Interface for audio device info with user-friendly name
 */
export interface AudioDeviceOption {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
  groupId: string;
}

/**
 * Service responsible for screen media capture operations
 * Handles MediaRecorder lifecycle and screen capture streams
 * Uses EventEmitter to provide standardized event handling
 */
export class MediaCaptureService {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private selectedAudioDeviceId: string | null = null;
  private eventEmitter = new EventEmitter();

  /**
   * Register event listener for MediaCaptureService events
   * @param event Event type to listen for
   * @param listener Callback function to execute when event occurs
   */
  public on<E extends MediaCaptureEventType>(
    event: E, 
    listener: (...args: E extends keyof MediaCaptureEventMap ? MediaCaptureEventMap[E] : never[]) => void
  ): this {
    // Use composition instead of inheritance with type assertion to ensure compatibility
    this.eventEmitter.on(event, listener as unknown as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Remove event listener
   * @param event Event type to remove listener from
   * @param listener Listener to remove
   */
  public off<E extends MediaCaptureEventType>(
    event: E, 
    listener: (...args: E extends keyof MediaCaptureEventMap ? MediaCaptureEventMap[E] : never[]) => void
  ): this {
    // Use composition instead of inheritance with type assertion to ensure compatibility
    this.eventEmitter.off(event, listener as unknown as (...args: unknown[]) => void);
    return this;
  }
  
  /**
   * Emit an event with provided arguments
   * Type-safe wrapper around EventEmitter's emit method
   * 
   * @param event Event type to emit
   * @param args Arguments to pass to event handlers
   * @private Internal method for emitting events
   */
  private emit<E extends MediaCaptureEventType>(event: E, ...args: E extends keyof MediaCaptureEventMap ? MediaCaptureEventMap[E] : never[]): boolean {
    // Use composition instead of inheritance
    return this.eventEmitter.emit(event, ...args);
  }

  /**
   * Check if recording is currently in progress
   */
  public isRecording(): boolean {
    return this.recorder !== null && this.recorder.state === 'recording';
  }

  /**
   * Get available audio input devices
   * @returns Promise that resolves with a list of audio input devices
   */
  public async getAudioInputDevices(): Promise<AudioDeviceOption[]> {
    try {
      // Request microphone permission by getting a stream first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Get all media devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      // Filter for audio input devices
      const audioInputDevices: AudioDeviceOption[] = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 5)}...`,
          kind: device.kind,
          groupId: device.groupId
        }));
      
      // Emit event with the available devices
      this.emit(MediaCaptureEvents.AUDIO_DEVICES_AVAILABLE, audioInputDevices);
      
      return audioInputDevices;
    } catch (error) {
      this.emit(
        MediaCaptureEvents.ERROR,
        `Failed to get audio devices: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }
  
  /**
   * Set the audio device to use for recording
   * @param deviceId The ID of the audio device to use
   */
  public setAudioDevice(deviceId: string): void {
    this.selectedAudioDeviceId = deviceId;
    console.log(`Selected audio device: ${deviceId}`);
  }

  /**
   * Start screen recording with optional audio
   * @param videoInfo Information about the recording session
   * @returns Promise that resolves when recording has started
   */
  public async startRecording(videoInfo: VideoInfo): Promise<void> {
    try {
      // Reset chunks array for new recording and cleanup any existing streams
      this.chunks = [];
      this.cleanup();

      // Create a synchronized audio/video capture approach
      let displayStream: MediaStream | null = null;
      let micStream: MediaStream | null = null;
      let combinedStream: MediaStream;
      
      // Step 1: Always get screen display with system audio
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            // Request high-quality video
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          // Always request system audio regardless of microphone selection
          audio: true
        });
        this.stream = displayStream;
        console.log(`Screen capture acquired with ${displayStream.getVideoTracks().length} video tracks and ${displayStream.getAudioTracks().length} audio tracks`);
      } catch (error) {
        throw new Error(`Screen capture failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Step 2: Get microphone audio if selected
      if (this.selectedAudioDeviceId) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: { 
              deviceId: { exact: this.selectedAudioDeviceId },
              // Optimize audio settings for consistent volume
              echoCancellation: true,
              noiseSuppression: true,
              // Disable autoGainControl to prevent volume fluctuation
              autoGainControl: false,
              // Ensure good synchronization by matching audio parameters
              sampleRate: 48000,
              channelCount: 2
            }
          });
          this.micStream = micStream;
          console.log(`Microphone stream acquired with ${micStream.getAudioTracks().length} audio tracks`);
        } catch (micError) {
          console.warn(`Microphone access failed, continuing with display only: ${micError instanceof Error ? micError.message : String(micError)}`);
          // Continue with just the display stream
        }
      }
      
      // Step 3: Create proper audio mix using Web Audio API for better control
      if (displayStream) {
        // Extract video track for the base stream
        const videoTracks = displayStream.getVideoTracks();
        const systemAudioTracks = displayStream.getAudioTracks();
        
        // Use dedicated AudioMixerService to mix audio tracks
        if (this.selectedAudioDeviceId && micStream && micStream.getAudioTracks().length > 0 && systemAudioTracks.length > 0) {
          try {
            console.log('Using AudioMixerService for professional audio mixing');
            
            // Create separate streams for system and mic audio for mixing
            const systemStream = new MediaStream(systemAudioTracks);
            
            // Use the dedicated audio mixer to create a properly mixed audio stream
            const mixedAudioStream = audioMixer.createMixedAudioStream(systemStream, micStream);
            
            if (mixedAudioStream) {
              // Create a new stream with video and mixed audio
              combinedStream = new MediaStream([
                ...videoTracks,
                ...mixedAudioStream.getTracks()
              ]);
              console.log(`Created high-quality mixed audio stream with ${mixedAudioStream.getTracks().length} audio tracks`);
            } else {
              throw new Error('Audio mixing failed - no mixed stream created');
            }
          } catch (mixError) {
            console.warn('Audio mixing failed, falling back to standard track combination:', mixError);
            // Fall back to simple track combination
            const allTracks = [...videoTracks];
            
            console.log(`System audio tracks: ${systemAudioTracks.length}`);
            console.log(`Microphone audio tracks: ${micStream ? micStream.getAudioTracks().length : 0}`);
            
            // Choose the best approach based on available tracks
            if (systemAudioTracks.length > 0 && micStream && micStream.getAudioTracks().length > 0) {
              // Both audio sources available - prioritize system audio first, then mic
              console.log('Using both system and mic audio in fallback mode');
              allTracks.push(...systemAudioTracks);
              allTracks.push(...micStream.getAudioTracks());
            } else if (systemAudioTracks.length > 0) {
              // Only system audio
              console.log('Using only system audio in fallback mode');
              allTracks.push(...systemAudioTracks);
            } else if (micStream && micStream.getAudioTracks().length > 0) {
              // Only microphone audio
              console.log('Using only microphone audio in fallback mode');
              allTracks.push(...micStream.getAudioTracks());
            }
            
            combinedStream = new MediaStream(allTracks);
            console.log(`Created fallback stream with ${videoTracks.length} video track(s) and ${allTracks.length - videoTracks.length} audio track(s)`);
          }
        } else {
          // Standard track combination when Web Audio API mixing isn't needed or available
          // Order of tracks matters - browser may prioritize earlier tracks
          const allTracks = [...videoTracks];
          
          console.log(`Standard approach - System audio tracks: ${systemAudioTracks.length}`);
          console.log(`Standard approach - Microphone audio tracks: ${micStream ? micStream.getAudioTracks().length : 0}`);
          
          // Add system audio first to prioritize it
          if (systemAudioTracks.length > 0) {
            // Clone tracks to avoid conflicts
            systemAudioTracks.forEach(track => {
              console.log(`System audio track: ${track.label || 'unlabeled'}, kind: ${track.kind}`);
            });
            allTracks.push(...systemAudioTracks);
            console.log('Adding system audio to standard stream');
          }
          
          // Add microphone if available
          if (micStream && micStream.getAudioTracks().length > 0) {
            allTracks.push(...micStream.getAudioTracks());
            console.log('Adding microphone audio to standard stream');
          }
          
          combinedStream = new MediaStream(allTracks);
          console.log(`Created standard stream with ${videoTracks.length} video track(s) and ${allTracks.length - videoTracks.length} audio track(s)`);
        }
      } else if (micStream) {
        // Only microphone available
        combinedStream = micStream;
      } else {
        // No streams available
        throw new Error('No media streams available for recording');
      }

      // Create and configure MediaRecorder with the combined stream
      // Use higher bitrate and better audio bitrate for improved quality
      this.recorder = new MediaRecorder(combinedStream, {
        mimeType: this.getSupportedMimeType(),
        videoBitsPerSecond: 5000000, // 5 Mbps for better quality
        audioBitsPerSecond: 256000   // 256 kilobits per second for higher quality audio
      });
      
      console.log(`Using MIME type: ${this.getSupportedMimeType()}`);

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

      // Start recording with smaller time slices for better synchronization
      this.recorder.start(100); // Collect data in 100ms chunks for better sync

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
   * Ensures a clean stop with all data flushed
   */
  public stopRecording(): void {
    try {
      if (this.recorder) {
        // Make sure we get any pending data before stopping
        if (this.recorder.state === 'recording') {
          // Request any pending data to be flushed
          this.recorder.requestData();
          
          // Small delay to ensure data is processed before stopping
          setTimeout(() => {
            try {
              if (this.recorder && this.recorder.state === 'recording') {
                this.recorder.stop();
                console.log('Recording stopped after data flush');
              }
            } catch (innerError) {
              console.warn('Error in delayed stop:', innerError);
            }
          }, 200);
        } else if (this.recorder.state === 'paused') {
          this.recorder.resume();
          setTimeout(() => this.stopRecording(), 100);
        }
      }
      
      // Stop microphone tracks explicitly to ensure proper cleanup
      // This helps prevent audio sync issues on next recording
      if (this.micStream) {
        this.micStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (trackError) {
            console.warn('Error stopping microphone track:', trackError);
          }
        });
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
   * Follows single responsibility principle for proper cleanup
   */
  public cleanup(): void {
    // First make sure recording is stopped properly
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch (e) {
        console.warn('Error stopping recorder during cleanup:', e);
      }
    }

    // Properly stop all tracks in the streams to release hardware resources
    const stopTracks = (stream: MediaStream | null, label: string) => {
      if (!stream) return;
      
      stream.getTracks().forEach(track => {
        try {
          // Make sure track is not already stopped
          if (track.readyState === 'live') {
            track.stop();
            console.log(`Stopped ${label} track: ${track.kind} (${track.label || 'unlabeled'})`);
          }
        } catch (e) {
          console.warn(`Error stopping ${label} track:`, e);
        }
      });
    };

    // Stop tracks with proper error handling
    stopTracks(this.stream, 'screen');
    stopTracks(this.micStream, 'microphone');
    
    // Clean up the audio mixer
    audioMixer.cleanup();
    
    // Clean up references
    this.recorder = null;
    this.stream = null;
    this.micStream = null;
    this.chunks = [];
  }
  
  /**
   * Get supported MIME type for video recording
   * Try to use WebM with VP8/VP9 codec if supported
   */
  private getSupportedMimeType(): string {
    // Preferred MIME types for WebM encoding with audio in order of preference
    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
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

  /**
   * Get current recording chunks
   * Useful for immediate access to chunks without waiting for stop event
   */
  public getRecordingChunks(): Blob[] {
    return [...this.chunks];
  }
}
