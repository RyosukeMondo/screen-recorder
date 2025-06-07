import { useState, useEffect, useRef, useCallback } from 'react';
import { MediaCaptureService, MediaCaptureEvents } from '../services/media-capture.service';
import type { AudioDeviceOption } from '../services/media-capture.service';
import { StorageService } from '../services/storage';
import { VideoProcessorService } from '../services/video-processor.service';
import type { VideoData, VideoInfo } from '../types/recording';

/**
 * Custom hook for managing screen recording with microphone audio support
 * Encapsulates recording state and operations
 */
export const useMicrophoneRecorder = () => {
  // State management
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [status, setStatus] = useState<string>('Ready');
  const [error, setError] = useState<string>('');
  const [storedVideos, setStoredVideos] = useState<VideoData[]>([]);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);
  const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(false);
  
  // Service references using refs to maintain singleton instances
  const mediaCaptureServiceRef = useRef<MediaCaptureService>(new MediaCaptureService());
  const storageServiceRef = useRef<StorageService>(new StorageService());
  const videoProcessorRef = useRef<VideoProcessorService>(new VideoProcessorService());
  
  // Video info for current recording
  const currentVideoInfoRef = useRef<VideoInfo | null>(null);
  
  // Timer reference for recording duration
  const timerRef = useRef<number | null>(null);

  /**
   * Format seconds to MM:SS display
   */
  const formatTime = useCallback((timeInSeconds: number): string => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  /**
   * Display stored videos
   */
  const displayStoredVideos = useCallback(async () => {
    try {
      const videos = await storageServiceRef.current.getAllVideos();
      setStoredVideos(videos);
    } catch (error) {
      console.error('Error displaying stored videos:', error);
      setError(`Failed to display videos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  /**
   * Get available audio input devices
   */
  const getAudioDevices = useCallback(async () => {
    try {
      setIsLoadingDevices(true);
      setError('');
      await mediaCaptureServiceRef.current.getAudioInputDevices();
    } catch (error) {
      console.error('Error getting audio devices:', error);
      setError(`Failed to get audio devices: ${error instanceof Error ? error.message : String(error)}`);
      setIsLoadingDevices(false);
    }
  }, []);
  
  /**
   * Select audio device to use for recording
   */
  const selectAudioDevice = useCallback((deviceId: string) => {
    setSelectedAudioDeviceId(deviceId);
    mediaCaptureServiceRef.current.setAudioDevice(deviceId);
  }, []);

  /**
   * Start screen recording
   */
  const startRecording = useCallback(async () => {
    try {
      setError('');
      setStatus('Initializing...');
      
      // Generate video info with unique ID and timestamp
      const videoId = `video_${Date.now()}`;
      const now = new Date();
      const beginTime = now.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      
      const videoInfo: VideoInfo = {
        videoId,
        beginTime,
        title: `Screen Recording${selectedAudioDeviceId ? ' with Microphone' : ''} - ${beginTime}`,
      };
      
      // Store current video info
      currentVideoInfoRef.current = videoInfo;
      
      // Start recording with the MediaCaptureService
      await mediaCaptureServiceRef.current.startRecording(videoInfo);
      setIsRecording(true);
      setRecordingTime(0);
      setStatus('Recording');
    } catch (error) {
      console.error('Error starting recording:', error);
      setError(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('Error');
    }
  }, [selectedAudioDeviceId]);

  /**
   * Stop screen recording
   */
  const stopRecording = useCallback(() => {
    try {
      setStatus('Stopping...');
      mediaCaptureServiceRef.current.stopRecording();
      setIsRecording(false);
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError(`Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`);
      setIsRecording(false);
      setStatus('Error');
    }
  }, []);
  
  /**
   * Download video from IndexedDB
   */
  const downloadVideo = useCallback(async (videoId: string) => {
    try {
      const videoData = await storageServiceRef.current.getVideo(videoId);
      
      if (videoData && videoData.chunks) {
        await videoProcessorRef.current.downloadMP4(
          videoData.chunks,
          videoData.title
        );
      }
    } catch (error) {
      console.error('Error downloading video:', error);
      setError(`Failed to download video: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);
  
  /**
   * Remove video from IndexedDB
   */
  const removeVideo = useCallback(async (videoId: string) => {
    try {
      await storageServiceRef.current.removeVideo(videoId);
      await displayStoredVideos();
    } catch (error) {
      console.error('Error removing video:', error);
      setError(`Failed to remove video: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [displayStoredVideos]);

  // Handle recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  // Setup and cleanup event listeners
  useEffect(() => {
    const mediaService = mediaCaptureServiceRef.current;
    
    // Handle recording stopped event
    const handleRecordingStopped = async (chunks: Blob[], videoInfo: VideoInfo) => {
      try {
        if (chunks.length === 0) {
          console.warn('No chunks received from recording');
          return;
        }
        
        // Download as MP4
        await videoProcessorRef.current.downloadMP4(chunks, videoInfo.title);
        
        // Save to IndexedDB
        await storageServiceRef.current.saveVideo(chunks, videoInfo);
        
        // Update stored videos list
        await displayStoredVideos();
        
        setStatus('Ready');
        setError('');
        
        // Clean up resources
        mediaService.cleanup();
      } catch (error) {
        console.error('Error processing recording:', error);
        setError(`Failed to process recording: ${error instanceof Error ? error.message : String(error)}`);
        setStatus('Error');
      }
    };
    
    // Handle audio devices available event
    const handleAudioDevicesAvailable = (devices: AudioDeviceOption[]) => {
      setAudioDevices(devices);
      setIsLoadingDevices(false);
      
      // Auto-select the first device if available
      if (devices.length > 0 && !selectedAudioDeviceId) {
        setSelectedAudioDeviceId(devices[0].deviceId);
        mediaService.setAudioDevice(devices[0].deviceId);
      }
    };
    
    // Handle errors
    const handleError = (errorMessage: string) => {
      setError(errorMessage);
      setStatus('Error');
      setIsLoadingDevices(false);
    };
    
    // Register event listeners
    mediaService.on(MediaCaptureEvents.RECORDING_STOPPED, handleRecordingStopped);
    mediaService.on(MediaCaptureEvents.AUDIO_DEVICES_AVAILABLE, handleAudioDevicesAvailable);
    mediaService.on(MediaCaptureEvents.ERROR, handleError);
    
    // Load videos on mount
    displayStoredVideos();
    
    // Cleanup function to remove event listeners
    return () => {
      mediaService.off(MediaCaptureEvents.RECORDING_STOPPED, handleRecordingStopped);
      mediaService.off(MediaCaptureEvents.AUDIO_DEVICES_AVAILABLE, handleAudioDevicesAvailable);
      mediaService.off(MediaCaptureEvents.ERROR, handleError);
    };
  }, [displayStoredVideos, selectedAudioDeviceId]);

  return {
    // State
    isRecording,
    recordingTime,
    status,
    error,
    storedVideos,
    audioDevices,
    selectedAudioDeviceId,
    isLoadingDevices,
    
    // Methods
    startRecording,
    stopRecording,
    formatTime,
    downloadVideo,
    removeVideo,
    getAudioDevices,
    selectAudioDevice,
  };
};
