import React from 'react';
import type { VideoData } from '../types/recording';

interface StoredVideosListProps {
  videos: VideoData[];
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * StoredVideosList - UI component for displaying stored videos
 * Single responsibility: Display and manage saved video list
 */
const StoredVideosList: React.FC<StoredVideosListProps> = ({
  videos,
  onDownload,
  onDelete
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
      <div className="video-grid">
        {videos.map((video) => (
          <div className="video-item" key={video.id}>
            <div className="video-info">
              <h3>{video.title}</h3>
              <p className="video-date">{video.datetime}</p>
            </div>
            <div className="video-actions">
              <button 
                className="action-button download"
                onClick={() => onDownload(video.id)}
                title="Download"
              >
                Download
              </button>
              <button 
                className="action-button delete"
                onClick={() => onDelete(video.id)}
                title="Delete"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StoredVideosList;
