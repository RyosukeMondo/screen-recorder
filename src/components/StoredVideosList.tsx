import React from 'react';
import type { VideoData } from '../types/recording';
import './StoredVideosList.css';

interface StoredVideosListProps {
  videos: VideoData[];
  onDownloadWebM: (id: string) => void;
  onDownloadMP4: (id: string) => void;
  onDelete: (id: string) => void;
  onCancelProcessing?: (id: string) => void;
}

/**
 * StoredVideosList - UI component for displaying stored videos
 * Single responsibility: Display and manage saved video list
 */
const StoredVideosList: React.FC<StoredVideosListProps> = ({
  videos,
  onDownloadWebM,
  onDownloadMP4,
  onDelete,
  onCancelProcessing
}) => {
  if (videos.length === 0) {
    return (
      <div className="video-list-empty">
        <p>No recordings saved yet.</p>
      </div>
    );
  }

  return (
    <div className="video-list">
      <h2>Saved Recordings</h2>
      <div className="videos-list">
        {videos.map((video) => (
          <div className="video-item" key={video.id}>
            <div className="video-info">
              <p className="video-title">{video.title}</p>
              <p className="video-date">{video.datetime}</p>
            </div>
            <div className="video-actions">
              {/* Progress bar for this video if it's being processed */}
              {video.isProcessing && (
                <div className="video-progress-container">
                  <div className="video-progress-label">
                    MP4 Processing: {Math.round((video.processingProgress || 0) * 100)}%
                  </div>
                  <div className="video-progress-bar">
                    <div 
                      className="video-progress-fill" 
                      style={{ width: `${(video.processingProgress || 0) * 100}%` }}
                    ></div>
                  </div>
                  {onCancelProcessing && (
                    <button
                      className="cancel-button"
                      onClick={() => onCancelProcessing(video.id)}
                      title="Cancel Processing"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
              
              <div className="button-group">
                <button 
                  className="download-button"
                  onClick={() => onDownloadWebM(video.id)}
                  title="Download as WebM"
                >
                  WebM
                </button>
                <button 
                  className="mp4-button"
                  onClick={() => onDownloadMP4(video.id)}
                  disabled={video.isProcessing}
                  title="Convert to MP4 and download"
                >
                  MP4
                </button>
                <button 
                  className="delete-button"
                  onClick={() => onDelete(video.id)}
                  title="Delete"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StoredVideosList;
