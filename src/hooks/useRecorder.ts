import { useState, useEffect, useRef, useCallback } from 'react';
import { RecorderService } from '../services/recorder';
import { StorageService } from '../services/storage';
import { VideoProcessorService } from '../services/video-processor.service';
import type { VideoData, VideoInfo } from '../types/recording';

/**
 * Custom hook for managing screen recording functionality
 * Encapsulates recording state and operations
 */
export const useRecorder = () => {
  // State management
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [status, setStatus] = useState<string>('Ready');
  const [error, setError] = useState<string>('');
  const [storedVideos, setStoredVideos] = useState<VideoData[]>([]);
  
  // Service references
  const recorderServiceRef = useRef<RecorderService | null>(null);
  const storageServiceRef = useRef<StorageService>(new StorageService());
  const videoProcessorRef = useRef<VideoProcessorService>(new VideoProcessorService());
  
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
   * Load stored videos on component mount
   */
  useEffect(() => {
    displayStoredVideos();
  }, [displayStoredVideos]);

  /**
   * Handle timer for recording duration
   */
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

  /**
   * Handle recording data when chunks are available
   */
  const handleRecordingData = useCallback(async (chunks: Blob[]) => {
    try {
      if (chunks.length === 0) {
        console.warn('No chunks received from recording');
        return;
      }
      
      const videoInfo = recorderServiceRef.current?.videoInfo;
      if (!videoInfo) {
        throw new Error('Video info not available');
      }
      
      // Download as MP4
      await videoProcessorRef.current.downloadMP4(chunks, videoInfo.title);
      
      // Save to IndexedDB
      await storageServiceRef.current.saveVideo(chunks, videoInfo);
      
      // Update stored videos list
      await displayStoredVideos();
      
      setStatus('Ready');
      setError('');
    } catch (error) {
      console.error('Error processing recording:', error);
      setError(`Failed to process recording: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('Error');
    }
  }, [displayStoredVideos]);

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
        title: `Screen Recording - ${beginTime}`,
      };
      
      // Initialize recorder service if needed
      if (!recorderServiceRef.current) {
        recorderServiceRef.current = new RecorderService(handleRecordingData);
        // Add video info to recorder service
        recorderServiceRef.current.videoInfo = videoInfo;
      }
      
      // Start recording
      await recorderServiceRef.current.startRecording();
      setIsRecording(true);
      setRecordingTime(0);
      setStatus('Recording');
    } catch (error) {
      console.error('Error starting recording:', error);
      setError(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('Error');
    }
  }, [handleRecordingData]);

  /**
   * Stop screen recording
   */
  const stopRecording = useCallback(() => {
    try {
      setStatus('Stopping...');
      
      // Stop recording if service exists
      if (recorderServiceRef.current) {
        recorderServiceRef.current.stopRecording();
        setIsRecording(false);
      }
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

  return {
    // State
    isRecording,
    recordingTime,
    status,
    error,
    storedVideos,
    
    // Methods
    startRecording,
    stopRecording,
    formatTime,
    downloadVideo,
    removeVideo,
  };
};

// Add the videoInfo property to RecorderService type
declare module '../services/recorder' {
  interface RecorderService {
    videoInfo?: VideoInfo;
  }
}
