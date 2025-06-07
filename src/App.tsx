import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { VideoProcessorService } from './services/video-processor.service';
import { StorageService } from './services/storage';
import { MediaCaptureService, MediaCaptureEvents } from './services/media-capture.service';
import type { VideoInfo, VideoData } from './types/recording';
import StoredVideosList from './components/StoredVideosList';
import RecordingPanel from './components/RecordingPanel';


// Using VideoInfo and VideoData interfaces from './types/recording'

/**
 * Screen Recorder Application
 * Allows users to record their screen, save recordings to IndexedDB, and download as MP4
 */
function App() {
  // State management
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [status, setStatus] = useState<string>('Ready');
  const [error, setError] = useState<string>('');
  const [storedVideos, setStoredVideos] = useState<VideoData[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string | null>(null);
  // FFmpeg encoding is now always used for MP4 conversion
  // Global FFmpeg state is no longer needed as we track per video
  
  // Services
  const videoProcessorRef = useRef<VideoProcessorService>(new VideoProcessorService());
  const storageServiceRef = useRef<StorageService>(new StorageService());
  
  /**
   * Get all videos metadata from StorageService
   */
  const getAllVideosMetadata = useCallback(async (): Promise<VideoData[]> => {
    try {
      const videos = await storageServiceRef.current.getAllVideos();
      return videos.map(video => ({
        id: video.id,
        datetime: video.datetime,
        title: video.title,
      }));
    } catch (error) {
      console.error('Error getting videos:', error);
      setError(`Failed to retrieve videos: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }, []);
  
  /**
   * Handle FFmpeg processing cancellation for a specific video
   */
  const handleCancelProcessing = useCallback((videoId: string) => {
    if (videoProcessorRef.current) {
      videoProcessorRef.current.cancelProcessing();
      setStatus('Cancelling FFmpeg processing...');
      
      // Reset the processing state for this video
      setStoredVideos(prev => prev.map(v => 
        v.id === videoId ? { ...v, isProcessing: false, processingProgress: 0 } : v
      ));
    }
  }, []);
  
  /**
   * Download WebM video directly
   */
  const downloadWebM = useCallback((chunks: Blob[], title: string) => {
    try {
      // Direct download as WebM
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.webm`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('WebM download complete');
      setTimeout(() => setStatus('Ready'), 3000);
    } catch (error) {
      console.error('Error in downloadWebM:', error);
      setError(`Failed to download WebM: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('Error');
    }
  }, []);

  /**
   * Manually process existing video to MP4 using FFmpeg
   * This function is for converting videos that weren't automatically converted
   */
  const processToMP4 = useCallback(async (videoId: string) => {
    try {
      const videoData = await storageServiceRef.current.getVideo(videoId);
      
      if (!videoData || !videoData.chunks) {
        setError('Video data not found or corrupt');
        return;
      }
      
      // Update processing state for this specific video
      setStoredVideos(prev => prev.map(v => 
        v.id === videoId ? { ...v, isProcessing: true, processingProgress: 0 } : v
      ));
      
      setStatus('Processing with FFmpeg...');
      
      // Create progress callback specific to this video ID
      const progressCallback = (progress: number) => {
        setStoredVideos(prev => prev.map(v => 
          v.id === videoId ? { ...v, processingProgress: progress } : v
        ));
      };
      
      // Create cancellation callback specific to this video ID
      const cancelCallback = () => {
        setStoredVideos(prev => prev.map(v => 
          v.id === videoId ? { ...v, isProcessing: false, processingProgress: 0 } : v
        ));
        setStatus('FFmpeg processing cancelled');
        setTimeout(() => setStatus('Ready'), 3000);
      };
      
      // Process video with FFmpeg
      await videoProcessorRef.current.downloadMP4(
        videoData.chunks,
        videoData.title,
        true, // Always use FFmpeg for MP4 conversion
        progressCallback,
        cancelCallback
      );
      
      // Reset processing state
      setStoredVideos(prev => prev.map(v => 
        v.id === videoId ? { ...v, isProcessing: false, processingProgress: 1 } : v
      ));
      
      setStatus('MP4 Download complete');
      setTimeout(() => setStatus('Ready'), 3000);
      
      // After a moment, reset the progress display
      setTimeout(() => {
        setStoredVideos(prev => prev.map(v => 
          v.id === videoId ? { ...v, processingProgress: 0 } : v
        ));
      }, 5000);
      
    } catch (error) {
      console.error('Error in processToMP4:', error);
      setError(`Failed to process video: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('Error');
      
      // Reset processing state on error
      setStoredVideos(prev => prev.map(v => 
        v.id === videoId ? { ...v, isProcessing: false, processingProgress: 0 } : v
      ));
    }
  }, []);
  
  /**
   * Handle video after recording is stopped
   * Downloads WebM immediately and schedules MP4 conversion
   */
  const downloadMP4 = useCallback(async (chunks: Blob[], videoId: string, title: string) => {
    try {
      // First, download as WebM for immediate access
      downloadWebM(chunks, title);
      
      // Mark this video for auto-conversion after storage is ready
      setTimeout(async () => {
        try {
          const videoData = await storageServiceRef.current.getVideo(videoId);
          
          if (!videoData || !videoData.chunks) {
            console.error('Video data not found for auto-conversion');
            return;
          }
          
          // Update processing state for this video
          setStoredVideos(prev => prev.map(v => 
            v.id === videoId ? { ...v, isProcessing: true, processingProgress: 0 } : v
          ));
          
          setStatus('Auto-processing with FFmpeg...');
          
          // Create progress callback specific to this video
          const progressCallback = (progress: number) => {
            setStoredVideos(prev => prev.map(v => 
              v.id === videoId ? { ...v, processingProgress: progress } : v
            ));
          };
          
          // Create cancellation callback
          const cancelCallback = () => {
            setStoredVideos(prev => prev.map(v => 
              v.id === videoId ? { ...v, isProcessing: false, processingProgress: 0 } : v
            ));
            setStatus('FFmpeg processing cancelled');
            setTimeout(() => setStatus('Ready'), 3000);
          };
          
          // Process video with FFmpeg
          await videoProcessorRef.current.downloadMP4(
            videoData.chunks,
            videoData.title,
            true, // Always use FFmpeg for MP4 conversion
            progressCallback,
            cancelCallback
          );
          
          // Reset processing state
          setStoredVideos(prev => prev.map(v => 
            v.id === videoId ? { ...v, isProcessing: false, processingProgress: 1 } : v
          ));
          
          setStatus('MP4 Download complete');
          setTimeout(() => setStatus('Ready'), 3000);
          
          // After a moment, reset the progress display
          setTimeout(() => {
            setStoredVideos(prev => prev.map(v => 
              v.id === videoId ? { ...v, processingProgress: 0 } : v
            ));
          }, 5000);
          
        } catch (error) {
          console.error('Error in auto MP4 conversion:', error);
          setError(`Failed to auto-convert video: ${error instanceof Error ? error.message : String(error)}`);
          setStatus('Error');
          
          // Reset processing state on error
          setStoredVideos(prev => prev.map(v => 
            v.id === videoId ? { ...v, isProcessing: false, processingProgress: 0 } : v
          ));
        }
      }, 1000); // Short delay to ensure storage is ready
      
    } catch (error) {
      console.error('Error in downloadMP4:', error);
      setError(`Failed to process video: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('Error');
    }
  }, [downloadWebM]);
  
  /**
   * Display stored videos
   */
  const displayStoredVideos = useCallback(async () => {
    try {
      const videos = await getAllVideosMetadata();
      setStoredVideos(videos);
    } catch (error) {
      console.error('Error displaying stored videos:', error);
      setError(`Failed to display videos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [getAllVideosMetadata]);
  
  // References for recording
  const mediaCaptureRef = useRef<MediaCaptureService>(new MediaCaptureService());
  const timerRef = useRef<number | null>(null);

  /**
   * Format seconds to MM:SS display
   */
  const formatTime = (timeInSeconds: number): string => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

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
   * Initialize IndexedDB and load stored videos on component mount
   */
  useEffect(() => {
    // Initialize database and load videos
    displayStoredVideos();
  }, [displayStoredVideos]);

  /**
   * Setup media capture event handlers
   */
  useEffect(() => {
    const mediaCaptureService = mediaCaptureRef.current;
    
    // Handle recording stopped event
    const handleRecordingStopped = async (chunks: Blob[], videoInfo: VideoInfo) => {
      setIsRecording(false);
      downloadMP4(chunks, videoInfo.videoId, videoInfo.title);
      try {
        await storageServiceRef.current.saveVideo(chunks, videoInfo);
        displayStoredVideos();
      } catch (error) {
        console.error('Error saving video:', error);
        setError(`Failed to save video: ${error instanceof Error ? error.message : String(error)}`);
      }
      setStatus('Ready');
      
      // Clean up resources
      mediaCaptureService.cleanup();
    };
    
    // Handle recording errors
    const handleError = (errorMessage: string) => {
      console.error('Media capture error:', errorMessage);
      setError(errorMessage);
      setStatus('Error');
      setIsRecording(false);
    };
    
    // Register event listeners
    mediaCaptureService.on(MediaCaptureEvents.RECORDING_STOPPED, handleRecordingStopped);
    mediaCaptureService.on(MediaCaptureEvents.ERROR, handleError);
    
    // Cleanup event listeners on component unmount
    return () => {
      mediaCaptureService.off(MediaCaptureEvents.RECORDING_STOPPED, handleRecordingStopped);
      mediaCaptureService.off(MediaCaptureEvents.ERROR, handleError);
      
      // Stop any active recording when component unmounts
      if (mediaCaptureService.isRecording()) {
        mediaCaptureService.stopRecording();
        mediaCaptureService.cleanup();
      }
    };
  }, [displayStoredVideos, downloadMP4]);
  
  /**
   * Start screen recording
   */
  const startRecording = async () => {
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
        title: `Screen Recording${selectedMicrophoneId ? ' with Microphone' : ''} - ${beginTime}`,
      };
      
      // Set microphone device if selected
      if (selectedMicrophoneId) {
        mediaCaptureRef.current.setAudioDevice(selectedMicrophoneId);
      }
      
      // Start recording using the media capture service
      await mediaCaptureRef.current.startRecording(videoInfo);
      
      // Update UI state
      setIsRecording(true);
      setRecordingTime(0);
      setStatus('Recording');
      
    } catch (error) {
      console.error('Error starting recording:', error);
      setError(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('Error');
    }
  };

  /**
   * Stop screen recording
   */
  const stopRecording = () => {
    try {
      setStatus('Stopping...');
      
      // Stop MediaRecorder via the service
      mediaCaptureRef.current.stopRecording();
      
      // Note: state will be updated in the event handler when recording is fully stopped
      // to ensure we process the chunks after they are fully available
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError(`Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`);
      setIsRecording(false);
      setStatus('Error');
    }
  };

  // These functions have been moved before useEffect

  // The downloadMP4 function has been moved and declared above with useCallback
  
  // openDatabase method is now handled by StorageService
  
  // saveVideoToIndexedDB method is now handled by StorageService
  
  // getAllVideosMetadata function is now defined at the top of the component
  

  
  /**
   * Remove video from storage
   */
  const removeVideoFromDB = async (videoId: string) => {
    try {
      await storageServiceRef.current.removeVideo(videoId);
      // Update the stored videos list
      displayStoredVideos();
    } catch (error) {
      console.error('Error removing video:', error);
      setError(`Failed to delete video: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  /**
   * Update video title in storage
   * Implements the title update directly if the method is not available in the service
   */
  const updateVideoTitle = async (videoId: string, newTitle: string) => {
    try {
      setStatus('Updating title...');
      
      // Check if the updateVideoTitle method exists on the service
      if (typeof storageServiceRef.current.updateVideoTitle === 'function') {
        // Use the service method if available
        await storageServiceRef.current.updateVideoTitle(videoId, newTitle);
      } else {
        // Fallback implementation if the method is not available
        console.log('Using fallback title update implementation');
        
        // Get the video data
        const videoData = await storageServiceRef.current.getVideo(videoId);
        
        if (!videoData) {
          throw new Error('Video not found');
        }
        
        // Update the title
        videoData.title = newTitle;
        
        // Save the updated video data by removing and re-adding
        await storageServiceRef.current.removeVideo(videoId);
        
        // Create a VideoInfo object from the VideoData
        const videoInfo: VideoInfo = {
          videoId: videoData.id,
          beginTime: videoData.datetime,
          title: newTitle
        };
        
        // Re-save the video
        if (videoData.chunks) {
          await storageServiceRef.current.saveVideo(videoData.chunks, videoInfo);
        }
      }
      
      // Update the UI by refreshing the stored videos list
      await displayStoredVideos();
      setStatus('Title updated');
      setTimeout(() => setStatus('Ready'), 2000);
    } catch (error) {
      console.error('Error updating video title:', error);
      setError(`Failed to update title: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('Error');
    }
  };
  
  /**
   * Download video from storage as WebM
   */
  const downloadVideoFromDB = async (videoId: string) => {
    try {
      const videoData = await storageServiceRef.current.getVideo(videoId);
      
      if (videoData && videoData.chunks) {
        setStatus('Preparing download...');
        // Just use WebM download
        downloadWebM(videoData.chunks, videoData.title);
      } else {
        setError('Video data not found or corrupt');
      }
    } catch (error) {
      console.error('Error downloading video:', error);
      setError(`Failed to download video: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Screen Recorder</h1>
        <p className="subtitle">Record your screen and save as MP4</p>
      </header>

      <main>
        <RecordingPanel
          status={status}
          isRecording={isRecording}
          recordingTime={recordingTime}
          error={error}
          formatTime={formatTime}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          mediaCaptureService={mediaCaptureRef.current}
          onMicrophoneSelected={(deviceId) => setSelectedMicrophoneId(deviceId)}
        />
        
        <div className="instructions">
          <h3>How to Use:</h3>
          <ol>
            <li>Click "Start Recording"</li>
            <li>Choose what you want to share (screen, window, or tab)</li>
            <li>Click "Stop Recording" when finished</li>
            <li>WebM file will download immediately</li>
            <li>MP4 conversion will start automatically</li>
          </ol>
          <p className="note">Note: Keep this tab open while recording. Closing or navigating away will stop the recording.</p>
        </div>
        
        <div className="stored-videos-container">
          <StoredVideosList
            videos={storedVideos}
            onDownloadWebM={downloadVideoFromDB}
            onDownloadMP4={processToMP4}
            onDelete={removeVideoFromDB}
            onCancelProcessing={handleCancelProcessing}
            onEditTitle={updateVideoTitle}
          />
        </div>
      </main>

      <footer>
        <p>Screen recordings are saved locally on your device</p>
      </footer>
    </div>
  );
}

export default App;
