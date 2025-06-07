import React from 'react';

interface RecordingPanelProps {
  status: string;
  isRecording: boolean;
  recordingTime: number;
  error: string;
  formatTime: (time: number) => string;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

/**
 * RecordingPanel - UI component for recording controls
 * Single responsibility: Display recording status and controls
 */
const RecordingPanel: React.FC<RecordingPanelProps> = ({
  status,
  isRecording,
  recordingTime,
  error,
  formatTime,
  onStartRecording,
  onStopRecording
}) => {
  return (
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
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="controls">
        {!isRecording ? (
          <button 
            className="record-button"
            onClick={onStartRecording} 
            disabled={status !== 'Ready'}
          >
            Start Recording1
          </button>
        ) : (
          <button 
            className="stop-button"
            onClick={onStopRecording}
          >
            Stop Recording
          </button>
        )}
      </div>
    </div>
  );
};

export default RecordingPanel;
