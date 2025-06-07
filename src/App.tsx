import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { VideoProcessorService } from './services/videoProcessor';
import type { ProgressCallback } from './services/videoProcessor';


// Define TypeScript interfaces for type safety
interface VideoInfo {
  videoId: string;
  beginTime: string;
  title: string;
}

interface VideoData {
  id: string;
  datetime: string;
  title: string;
  chunks?: Blob[];
}

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
  
  // Services
  const videoProcessorRef = useRef<VideoProcessorService>(new VideoProcessorService());
  
  /**
   * Get all videos metadata from IndexedDB
   */
  const getAllVideosMetadata = useCallback(async (): Promise<VideoData[]> => {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(['videos'], 'readonly');
      const store = transaction.objectStore('videos');
      const request = store.getAll();
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const videos = request.result as VideoData[];
          resolve(videos.map(video => ({
            id: video.id,
            datetime: video.datetime,
            title: video.title,
          })));
        };
        
        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error getting videos from IndexedDB:', error);
      setError(`Failed to retrieve videos: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }, []);
  
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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
      
      // Request screen capture with audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      
      // Create and configure MediaRecorder
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      
      // Handle recording data
      recorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };
      
      // Handle recording stop
      recorder.onstop = () => {
        downloadMP4(chunksRef.current, videoInfo.videoId, videoInfo.title);
        saveVideoToIndexedDB(chunksRef.current, videoInfo);
        setStatus('Ready');
      };
      
      // Store references
      recorderRef.current = recorder;
      streamRef.current = stream;
      
      // Start recording
      recorder.start();
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
      
      // Stop MediaRecorder if exists
      if (recorderRef.current) {
        recorderRef.current.stop();
        
        // Stop all tracks in the stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        
        // Clear references
        recorderRef.current = null;
        streamRef.current = null;
        
        // Update state
        setIsRecording(false);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError(`Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`);
      setIsRecording(false);
      setStatus('Error');
    }
  };

  /**
   * Handle FFmpeg progress updates
   */
  const handleFFmpegProgress: ProgressCallback = useCallback((progress) => {
    setFfmpegProgress(progress);
  }, []);

  /**
   * Download recorded video as MP4
   */
  const downloadMP4 = async (chunks: Blob[], _videoId: string, title: string) => {
    try {
      if (useFFmpeg) {
        setIsProcessingFFmpeg(true);
        setFfmpegProgress(0);
        setStatus('Processing with FFmpeg...');
      } else {
        setStatus('Preparing download...');
      }
      
      // Use VideoProcessorService to handle download with potential FFmpeg transcoding
      await videoProcessorRef.current.downloadMP4(
        chunks, 
        title, 
        useFFmpeg, 
        useFFmpeg ? handleFFmpegProgress : undefined
      );
      
      setIsProcessingFFmpeg(false);
      setStatus('Ready');
      setError('');
    } catch (error) {
      console.error('Error downloading video:', error);
      setIsProcessingFFmpeg(false);
      setError(`Failed to download video: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('Error');
    }
  };
  
  /**
   * Open IndexedDB database
   */
  const openDatabase = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('screenRecordingsDB', 1);
      
      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };
      
      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('videos')) {
          db.createObjectStore('videos', { keyPath: 'id' });
        }
      };
    });
  };
  
  /**
   * Save video to IndexedDB
   */
  const saveVideoToIndexedDB = async (chunks: Blob[], videoInfo: VideoInfo) => {
    try {
      // Clone chunks to avoid issues with structured cloning
      const chunksClone = chunks.map(chunk => chunk);
      
      // Open database
      const db = await openDatabase();
      const transaction = db.transaction(['videos'], 'readwrite');
      const store = transaction.objectStore('videos');
      
      // Create video data object with videoId used as the id property
      const videoData: VideoData = {
        id: videoInfo.videoId, // Using videoId here as the unique key in IndexedDB
        datetime: videoInfo.beginTime,
        title: videoInfo.title,
        chunks: chunksClone
      };
      
      // Add to store
      const request = store.add(videoData);
      request.onerror = () => {
        console.error('Error saving video to IndexedDB:', request.error);
        setError('Failed to save video to local storage');
      };
      
      // Wait for transaction to complete
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
          // Update the stored videos list
          displayStoredVideos();
          setError('');
          resolve();
        };
        
        transaction.onerror = () => {
          reject(transaction.error);
        };
      });
      
      console.log('Video saved to IndexedDB successfully');
    } catch (error) {
      console.error('Error saving to IndexedDB:', error);
      setError(`Failed to save video: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // getAllVideosMetadata function is now defined at the top of the component
  

  
  /**
   * Remove video from IndexedDB
   */
  const removeVideoFromDB = async (videoId: string) => {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(['videos'], 'readwrite');
      const store = transaction.objectStore('videos');
      const request = store.delete(videoId);
      
      request.onsuccess = () => {
        // Update the stored videos list
        displayStoredVideos();
      };
      
      request.onerror = () => {
        setError(`Failed to delete video: ${request.error}`);
      };
    } catch (error) {
      console.error('Error removing video from IndexedDB:', error);
      setError(`Failed to delete video: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  /**
   * Download video from IndexedDB
   */
  const downloadVideoFromDB = async (videoId: string) => {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(['videos'], 'readonly');
      const store = transaction.objectStore('videos');
      const request = store.get(videoId);
      
      request.onsuccess = () => {
        if (request.result && request.result.chunks) {
          downloadMP4(
            request.result.chunks,
            request.result.id,
            request.result.title
          );
        }
      };
      
      request.onerror = () => {
        setError(`Failed to download video: ${request.error}`);
      };
    } catch (error) {
      console.error('Error downloading video from IndexedDB:', error);
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
