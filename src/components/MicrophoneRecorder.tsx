import React from 'react';
import { useMicrophoneRecorder } from '../hooks/useMicrophoneRecorder';

/**
 * MicrophoneRecorder component
 * Demonstrates screen recording with microphone audio support
 */
export const MicrophoneRecorder: React.FC = () => {
  const {
    isRecording,
    recordingTime,
    status,
    error,
    storedVideos,
    audioDevices,
    selectedAudioDeviceId,
    isLoadingDevices,
    startRecording,
    stopRecording,
    formatTime,
    downloadVideo,
    removeVideo,
    getAudioDevices,
    selectAudioDevice,
  } = useMicrophoneRecorder();

  return (
    <div className="recorder-container">
      <h2>Screen Recorder with Microphone</h2>
      
      {/* Status and error display */}
      <div className="status-container">
        <p>Status: {status}</p>
        {error && <p className="error">{error}</p>}
      </div>
      
      {/* Audio device selection */}
      <div className="audio-devices">
        <h3>Microphone Selection</h3>
        <button 
          onClick={getAudioDevices} 
          disabled={isRecording || isLoadingDevices}
        >
          {isLoadingDevices ? 'Loading...' : 'Get Microphones'}
        </button>
        
        <div className="device-list">
          {audioDevices.length > 0 ? (
            <>
              <label htmlFor="mic-select">Select microphone:</label>
              <select
                id="mic-select"
                value={selectedAudioDeviceId || ''}
                onChange={(e) => selectAudioDevice(e.target.value)}
                disabled={isRecording}
              >
                <option value="">No microphone (system audio only)</option>
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p>{isLoadingDevices ? 'Checking for microphones...' : 'No microphones detected'}</p>
          )}
        </div>
      </div>
      
      {/* Recording controls */}
      <div className="controls">
        {!isRecording ? (
          <button
            className="start-button"
            onClick={startRecording}
            disabled={status === 'Initializing...' || status === 'Stopping...'}
          >
            Start Recording
          </button>
        ) : (
          <div className="recording-controls">
            <span className="timer">{formatTime(recordingTime)}</span>
            <button className="stop-button" onClick={stopRecording}>
              Stop Recording
            </button>
          </div>
        )}
      </div>
      
      {/* Recorded videos list */}
      <div className="recordings">
        <h3>Recorded Videos</h3>
        {storedVideos.length === 0 ? (
          <p>No recordings yet</p>
        ) : (
          <ul className="recordings-list">
            {storedVideos.map((video) => (
              <li key={video.id} className="recording-item">
                <div className="recording-info">
                  <span className="recording-title">{video.title}</span>
                  <span className="recording-date">{video.datetime}</span>
                </div>
                <div className="recording-actions">
                  <button
                    className="download-button"
                    onClick={() => downloadVideo(video.id)}
                  >
                    Download
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => removeVideo(video.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MicrophoneRecorder;
