import React, { useState, useEffect, useCallback } from 'react';
import { MediaCaptureService, MediaCaptureEvents } from '../services/media-capture.service';
import type { AudioDeviceOption } from '../services/media-capture.service';

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
      <div className="mic-toggle">
        <label>
          <input
            type="checkbox"
            checked={isMicEnabled}
            onChange={(e) => handleMicToggle(e.target.checked)}
            disabled={disabled}
          />
          Record with microphone
        </label>
      </div>

      {isMicEnabled && (
        <div className="mic-selection">
          {isLoading ? (
            <p>Loading microphones...</p>
          ) : audioDevices.length > 0 ? (
            <div className="device-select">
              <label htmlFor="mic-device">Microphone: </label>
              <select
                id="mic-device"
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
              <button
                className="refresh-button"
                onClick={loadAudioDevices}
                disabled={disabled || isLoading}
                title="Refresh microphone list"
              >
                🔄
              </button>
            </div>
          ) : (
            <div className="no-devices">
              <p>No microphones found</p>
              <button onClick={loadAudioDevices} disabled={disabled || isLoading}>
                {isLoading ? 'Loading...' : 'Check again'}
              </button>
            </div>
          )}
          
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </div>
  );
};

export default MicrophoneSelector;
