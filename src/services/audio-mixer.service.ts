/**
 * Audio Mixer Service
 * 
 * Responsible for handling audio processing, mixing and optimization.
 * Follows Single Responsibility Principle by focusing solely on audio processing.
 */
export class AudioMixerService {
  private audioContext: AudioContext | null = null;
  private mixedDestination: MediaStreamAudioDestinationNode | null = null;
  private analyzerNode: AnalyserNode | null = null;
  private systemSource: MediaStreamAudioSourceNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private systemGain: GainNode | null = null;
  private micGain: GainNode | null = null;

  /**
   * Create a mixed audio stream from system audio and microphone audio
   * 
   * @param systemAudio MediaStream containing system audio
   * @param micAudio MediaStream containing microphone audio
   * @returns MediaStream with processed and mixed audio
   */
  public createMixedAudioStream(systemAudio: MediaStream | null, micAudio: MediaStream | null): MediaStream | null {
    try {
      // Clean up any previous audio context
      this.cleanup();

      // Validate inputs
      if (!systemAudio && !micAudio) {
        console.warn('No audio sources provided to mixer');
        return null;
      }

      // Create new audio context
      this.audioContext = new AudioContext();
      
      // Create analyzer for level monitoring
      this.analyzerNode = this.audioContext.createAnalyser();
      this.analyzerNode.fftSize = 2048;
      
      // Create destination for mixed output
      this.mixedDestination = this.audioContext.createMediaStreamDestination();

      // Create dynamic compressor for volume management
      const compressor = this.audioContext.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 10;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.001;
      compressor.release.value = 0.1;

      // Create voice enhancer filter
      const voiceEnhancer = this.audioContext.createBiquadFilter();
      voiceEnhancer.type = 'peaking';
      voiceEnhancer.frequency.value = 2500;
      voiceEnhancer.Q.value = 1.0;
      voiceEnhancer.gain.value = 8.0;
      
      // Connect processing chain
      compressor.connect(voiceEnhancer);
      voiceEnhancer.connect(this.mixedDestination);
      voiceEnhancer.connect(this.analyzerNode);
      
      // Process system audio if available
      if (systemAudio && systemAudio.getAudioTracks().length > 0) {
        this.systemSource = this.audioContext.createMediaStreamSource(
          new MediaStream(systemAudio.getAudioTracks())
        );
        this.systemGain = this.audioContext.createGain();
        this.systemGain.gain.value = 3.0; // Boost system audio significantly
        
        this.systemSource.connect(this.systemGain);
        this.systemGain.connect(compressor);
        console.log('System audio added to mixer');
      }
      
      // Process microphone audio if available
      if (micAudio && micAudio.getAudioTracks().length > 0) {
        this.micSource = this.audioContext.createMediaStreamSource(
          new MediaStream(micAudio.getAudioTracks())
        );
        this.micGain = this.audioContext.createGain();
        this.micGain.gain.value = 2.5; // Boost microphone audio
        
        this.micSource.connect(this.micGain);
        this.micGain.connect(compressor);
        console.log('Microphone audio added to mixer');
      }
      
      // Monitor audio levels
      this.monitorLevels();
      
      return this.mixedDestination.stream;
    } catch (error) {
      console.error('Error creating mixed audio stream:', error);
      this.cleanup();
      return null;
    }
  }
  
  /**
   * Monitor audio levels for debugging purposes
   */
  private monitorLevels(): void {
    if (!this.analyzerNode) return;
    
    const bufferLength = this.analyzerNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    setTimeout(() => {
      if (this.analyzerNode) {
        this.analyzerNode.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        
        const average = sum / bufferLength;
        console.log(`Audio mixer - Average frequency magnitude: ${average.toFixed(2)}`);
        
        // Adjust gain if levels are too low
        if (average < 10 && this.systemGain && this.micGain) {
          console.log('Audio levels too low, increasing gain');
          this.systemGain.gain.value += 0.5;
          this.micGain.gain.value += 0.5;
        }
      }
    }, 1000);
  }
  
  /**
   * Clean up audio resources
   */
  public cleanup(): void {
    if (this.audioContext) {
      // Close the audio context to free resources
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(err => 
          console.warn('Error closing audio context:', err)
        );
      }
      
      // Clear all references
      this.systemSource = null;
      this.micSource = null;
      this.systemGain = null;
      this.micGain = null;
      this.mixedDestination = null;
      this.analyzerNode = null;
      this.audioContext = null;
    }
  }
}

// Singleton instance to prevent multiple audio context creations
export const audioMixer = new AudioMixerService();
