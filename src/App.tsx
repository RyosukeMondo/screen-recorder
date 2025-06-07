import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { VideoProcessorService } from './services/video-processor.service';
import { StorageService } from './services/storage';
import { MediaCaptureService, MediaCaptureEvents } from './services/media-capture.service';
import type { ProgressCallback } from './services/encoding-job';
import type { VideoInfo, VideoData } from './types/recording';


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
  const [useFFmpeg, setUseFFmpeg] = useState<boolean>(false);
  const [ffmpegProgress, setFfmpegProgress] = useState<number>(0);
  const [isProcessingFFmpeg, setIsProcessingFFmpeg] = useState<boolean>(false);
  const [ffmpegCancellable, setFfmpegCancellable] = useState<boolean>(false);
  
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
   * Handle FFmpeg progress updates
   */
  const handleFFmpegProgress: ProgressCallback = useCallback((progress) => {
    setFfmpegProgress(progress);
  }, []);
  
  /**
   * Handle FFmpeg processing cancellation
   */
  const handleFFmpegCancel = useCallback(() => {
    if (videoProcessorRef.current) {
      videoProcessorRef.current.cancelProcessing();
      setStatus('Cancelling FFmpeg processing...');
    }
  }, []);

  /**
   * Handle when FFmpeg processing is cancelled
   */
  const handleFFmpegCancelled = useCallback(() => {
    setIsProcessingFFmpeg(false);
    setFfmpegCancellable(false);
    setStatus('FFmpeg processing cancelled');
    setTimeout(() => setStatus('Ready'), 3000);
  }, []);
  
  /**
   * Download recorded video as MP4
   */
  const downloadMP4 = useCallback(async (chunks: Blob[], _videoId: string, title: string) => {
    try {
      if (useFFmpeg) {
        setIsProcessingFFmpeg(true);
        setFfmpegCancellable(true);
        setFfmpegProgress(0);
        setStatus('Processing with FFmpeg...');
        
        // Process video with FFmpeg
        await videoProcessorRef.current.downloadMP4(
          chunks,
          title,
          true, // useFFmpeg
          handleFFmpegProgress,
          handleFFmpegCancelled // Use the cancellation handler
        );
        
        setStatus('Download complete');
        setTimeout(() => setStatus('Ready'), 3000);
        setIsProcessingFFmpeg(false);
        setFfmpegCancellable(false);
      } else {
        // Direct download without FFmpeg processing
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
        setStatus('Download complete');
        setTimeout(() => setStatus('Ready'), 3000);
      }
    } catch (error) {
      console.error('Error in downloadMP4:', error);
      setError(`Failed to process video: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('Error');
      setIsProcessingFFmpeg(false);
      setFfmpegCancellable(false);
    }
  }, [useFFmpeg, handleFFmpegProgress, handleFFmpegCancelled]);
  
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
        title: `Screen Recording - ${beginTime}`,
      };
      
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
   * Download video from storage
   */
  const downloadVideoFromDB = async (videoId: string) => {
    try {
      const videoData = await storageServiceRef.current.getVideo(videoId);
      
      if (videoData && videoData.chunks) {
        setStatus('Preparing download...');
        // Process and download the video
        await downloadMP4(videoData.chunks, videoData.id, videoData.title);
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
        <div className="recorder-container">
          <div className="status-panel">
            <div className="status-indicator">
              <div className={`status-dot ${isRecording ? 'recording' : status.toLowerCase().replace(/\s+/g, '-')}`}></div>
              <span>{status}</span>
              
              {isRecording && (
                <div className="recording-time">
                  Recording time: {formatTime(recordingTime)}
                </div>
              )}
            </div>
            
            {/* FFmpeg Processing Progress Bar */}
            {isProcessingFFmpeg && (
              <div className="ffmpeg-progress-container">
                <div className="ffmpeg-progress-label">
                  FFmpeg Processing: {Math.round(ffmpegProgress * 100)}%
                </div>
                <div className="ffmpeg-progress-bar">
                  <div 
                    className="ffmpeg-progress-fill" 
                    style={{ width: `${ffmpegProgress * 100}%` }}
                  ></div>
                </div>
                
                {/* Cancel button for FFmpeg processing */}
                {ffmpegCancellable && (
                  <button
                    className="ffmpeg-cancel-button"
                    onClick={handleFFmpegCancel}
                    title="Cancel FFmpeg processing"
                  >
                    Cancel Processing
                  </button>
                )}
              </div>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="controls">
            {!isRecording ? (
              <button 
                className="record-button"
                onClick={startRecording} 
              >
                Start Recording
              </button>
            ) : (
              <button 
                className="stop-button"
                onClick={stopRecording}
              >
                Stop Recording
              </button>
            )}
            
            <div className="encoding-options">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={useFFmpeg}
                  onChange={(e) => setUseFFmpeg(e.target.checked)}
                  disabled={isRecording}
                />
                <span className="toggle-slider"></span>
                <span className="toggle-label">Use FFmpeg Encoding</span>
              </label>
              {useFFmpeg && <div className="encoding-note">Using FFmpeg for better compatibility (may take longer)</div>}
            </div>
          </div>
        </div>
        
        <div className="instructions">
          <h3>How to Use:</h3>
          <ol>
            <li>Click "Start Recording"</li>
            <li>Choose what you want to share (screen, window, or tab)</li>
            <li>Click "Stop Recording" when finished</li>
            <li>The MP4 file will be automatically downloaded and saved locally</li>
          </ol>
          <p className="note">Note: Keep this tab open while recording. Closing or navigating away will stop the recording.</p>
        </div>
        
        <div className="stored-videos-container">
          <h3>Saved Recordings</h3>
          {storedVideos.length === 0 ? (
            <p>No recordings found in local storage.</p>
          ) : (
            <div className="videos-list">
              {storedVideos.map((video) => (
                <div key={video.id} className="video-item">
                  <div className="video-info">
                    <p className="video-title">{video.title}</p>
                    <p className="video-date">{video.datetime}</p>
                  </div>
                  <div className="video-actions">
                    <button 
                      className="download-button"
                      onClick={() => downloadVideoFromDB(video.id)}
                      title="Download"
                    >
                      Download
                    </button>
                    <button 
                      className="delete-button"
                      onClick={() => removeVideoFromDB(video.id)}
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer>
        <p>Screen recordings are saved locally on your device</p>
      </footer>
    </div>
  );
}

export default App;
