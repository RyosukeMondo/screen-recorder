import React, { useState, useEffect, useCallback } from 'react';
import { MediaCaptureService, MediaCaptureEvents } from '../services/media-capture.service';
import type { AudioDeviceOption } from '../services/media-capture.service';
import './MicrophoneSelector.css';

interface MicrophoneSelectorProps {
  mediaCaptureService: MediaCaptureService;
  disabled?: boolean;
  onDeviceSelected?: (deviceId: string | null) => void;
}

/**
 * MicrophoneSelector component
 * Allows users to enable/disable and select microphone input devices
 */
const MicrophoneSelector: React.FC<MicrophoneSelectorProps> = ({
  mediaCaptureService,
  disabled = false,
  onDeviceSelected
}) => {
  const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(false);

  /**
   * Load available audio devices
   */
  const loadAudioDevices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      await mediaCaptureService.getAudioInputDevices();
    } catch (error) {
      console.error('Error loading audio devices:', error);
      setError(`Failed to load microphones: ${error instanceof Error ? error.message : String(error)}`);
      setIsLoading(false);
    }
  }, [mediaCaptureService]);

  /**
   * Handle microphone toggle
   */
  const handleMicToggle = useCallback((enabled: boolean) => {
    setIsMicEnabled(enabled);
    
    if (!enabled) {
      // Disable microphone
      mediaCaptureService.setAudioDevice("");
      setSelectedDeviceId(null);
      if (onDeviceSelected) {
        onDeviceSelected(null);
      }
    } else if (audioDevices.length > 0) {
      // Enable and select first device if available
      const deviceId = selectedDeviceId || audioDevices[0].deviceId;
      setSelectedDeviceId(deviceId);
      mediaCaptureService.setAudioDevice(deviceId);
      if (onDeviceSelected) {
        onDeviceSelected(deviceId);
      }
    } else {
      // No devices available, try to load them
      loadAudioDevices();
    }
  }, [audioDevices, mediaCaptureService, onDeviceSelected, selectedDeviceId, loadAudioDevices]);

  /**
   * Handle device selection change
   */
  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
    mediaCaptureService.setAudioDevice(deviceId);
    if (onDeviceSelected) {
      onDeviceSelected(deviceId);
    }
  }, [mediaCaptureService, onDeviceSelected]);

  // Set up event listeners for audio devices
  useEffect(() => {
    const handleAudioDevicesAvailable = (devices: AudioDeviceOption[]) => {
      setAudioDevices(devices);
      setIsLoading(false);
      
      // Auto-select first device if mic is enabled and no device selected
      if (isMicEnabled && devices.length > 0 && !selectedDeviceId) {
        handleDeviceChange(devices[0].deviceId);
      }
    };

    const handleError = (errorMessage: string) => {
      setError(errorMessage);
      setIsLoading(false);
    };

    // Register event listeners
    mediaCaptureService.on(MediaCaptureEvents.AUDIO_DEVICES_AVAILABLE, handleAudioDevicesAvailable);
    mediaCaptureService.on(MediaCaptureEvents.ERROR, handleError);

    // Initial load of devices
    if (isMicEnabled && audioDevices.length === 0) {
      loadAudioDevices();
    }

    // Clean up event listeners
    return () => {
      mediaCaptureService.off(MediaCaptureEvents.AUDIO_DEVICES_AVAILABLE, handleAudioDevicesAvailable);
      mediaCaptureService.off(MediaCaptureEvents.ERROR, handleError);
    };
  }, [isMicEnabled, loadAudioDevices, mediaCaptureService, selectedDeviceId, handleDeviceChange, audioDevices.length]);

  return (
    <div className="microphone-selector">
      <div className="mic-toggle-container">
        <div className="mic-toggle-label">Record with microphone</div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={isMicEnabled}
            onChange={(e) => handleMicToggle(e.target.checked)}
            disabled={disabled}
          />
          <span className="toggle-slider"></span>
        </label>
      </div>

      {isMicEnabled && (
        <div className="mic-selection">
          {isLoading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading microphones...</p>
            </div>
          ) : audioDevices.length > 0 ? (
            <div className="device-select-container">
              <div className="select-wrapper">
                <svg className="mic-icon" viewBox="0 0 24 24" width="16" height="16">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
                <select
                  id="mic-device"
                  className="device-select"
                  value={selectedDeviceId || ''}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                  disabled={disabled || isLoading}
                >
                  {audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="refresh-button"
                onClick={loadAudioDevices}
                disabled={disabled || isLoading}
                title="Refresh microphone list"
                aria-label="Refresh microphone list"
              >
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="no-devices">
              <svg className="no-mic-icon" viewBox="0 0 24 24" width="24" height="24">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
              </svg>
              <p>No microphones found</p>
              <button 
                className="check-again-button" 
                onClick={loadAudioDevices} 
                disabled={disabled || isLoading}
              >
                {isLoading ? 'Loading...' : 'Check again'}
              </button>
            </div>
          )}
          
          {error && <p className="error-message">{error}</p>}
        </div>
      )}
    </div>
  );
};

export default MicrophoneSelector;
