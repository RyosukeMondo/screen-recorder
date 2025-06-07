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
      this.audioContext = new AudioContext({ latencyHint: 'interactive' });
      
      // Create analyzer for level monitoring
      this.analyzerNode = this.audioContext.createAnalyser();
      this.analyzerNode.fftSize = 2048;
      this.analyzerNode.smoothingTimeConstant = 0.8;
      
      // Create destination for mixed output
      this.mixedDestination = this.audioContext.createMediaStreamDestination();

      // Create separate processing chains for microphone and system audio
      // to maintain better volume balance between them
      
      // Create a separate compressor for the microphone to ensure it stays audible
      const micCompressor = this.audioContext.createDynamicsCompressor();
      micCompressor.threshold.value = -24; // Lower threshold for mic to maintain presence
      micCompressor.knee.value = 12;
      micCompressor.ratio.value = 4; // Lower ratio for more natural sound
      micCompressor.attack.value = 0.002;
      micCompressor.release.value = 0.15;
      
      // Create a separate compressor for system audio to prevent it from overwhelming the mic
      const systemCompressor = this.audioContext.createDynamicsCompressor();
      systemCompressor.threshold.value = -15; // Higher threshold for system audio
      systemCompressor.knee.value = 10;
      systemCompressor.ratio.value = 7; // Higher ratio to control system audio peaks
      systemCompressor.attack.value = 0.001;
      systemCompressor.release.value = 0.1;

      // Create voice enhancer filter for microphone
      const voiceEnhancer = this.audioContext.createBiquadFilter();
      voiceEnhancer.type = 'peaking';
      voiceEnhancer.frequency.value = 2500;
      voiceEnhancer.Q.value = 1.0;
      voiceEnhancer.gain.value = 6.0;
      
      // Create a final limiter to prevent clipping
      const finalLimiter = this.audioContext.createDynamicsCompressor();
      finalLimiter.threshold.value = -3.0;  // Only limit the loudest peaks
      finalLimiter.knee.value = 0.0;       // Hard knee for true limiting
      finalLimiter.ratio.value = 20.0;     // High ratio for brick wall limiting
      finalLimiter.attack.value = 0.001;   // Fast attack
      finalLimiter.release.value = 0.1;    // Moderate release
      
      // Connect the final limiter to output
      finalLimiter.connect(this.mixedDestination);
      finalLimiter.connect(this.analyzerNode);
      
      // Process microphone audio if available
      if (micAudio && micAudio.getAudioTracks().length > 0) {
        this.micSource = this.audioContext.createMediaStreamSource(
          new MediaStream(micAudio.getAudioTracks())
        );
        this.micGain = this.audioContext.createGain();
        this.micGain.gain.value = 2.8; // Boost microphone audio slightly higher
        
        // Create a priority compressor for microphone to maintain presence
        const micPresenceCompressor = this.audioContext.createDynamicsCompressor();
        micPresenceCompressor.threshold.value = -40;  // Very low threshold
        micPresenceCompressor.knee.value = 30;        // Very soft knee
        micPresenceCompressor.ratio.value = 12;       // High ratio
        micPresenceCompressor.attack.value = 0.003;   // Slightly slower attack
        micPresenceCompressor.release.value = 0.25;   // Slower release
        
        // Connect microphone chain
        this.micSource.connect(this.micGain);
        this.micGain.connect(micPresenceCompressor);
        micPresenceCompressor.connect(voiceEnhancer);
        voiceEnhancer.connect(micCompressor);
        micCompressor.connect(finalLimiter);
        
        console.log('Microphone audio added to mixer with enhanced presence');
      }
      
      // Process system audio if available
      if (systemAudio && systemAudio.getAudioTracks().length > 0) {
        this.systemSource = this.audioContext.createMediaStreamSource(
          new MediaStream(systemAudio.getAudioTracks())
        );
        this.systemGain = this.audioContext.createGain();
        this.systemGain.gain.value = 1.5; // Reduce system audio gain to not overpower mic
        
        // Connect system audio chain
        this.systemSource.connect(this.systemGain);
        this.systemGain.connect(systemCompressor);
        systemCompressor.connect(finalLimiter);
        console.log('System audio added to mixer with controlled volume');
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
   * Continuously monitors levels to ensure consistent audio balance
   */
  private monitorLevels(): void {
    if (!this.analyzerNode) return;
    
    const bufferLength = this.analyzerNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let frameCount = 0;
    
    // Continuous monitoring for better diagnostics
    const checkLevels = () => {
      if (!this.analyzerNode || !this.audioContext) return;
      
      this.analyzerNode.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      
      const average = sum / bufferLength;
      
      // Only log occasionally to avoid console spam
      if (frameCount % 50 === 0) {
        console.log(`Audio mixer - Average frequency magnitude: ${average.toFixed(2)}`);
        
        // Auto-adjust if needed
        this.autoAdjustLevels(average);
      }
      
      frameCount++;
      
      // Continue monitoring if audio context is active
      if (this.audioContext.state === 'running') {
        requestAnimationFrame(checkLevels);
      }
    };
    
    // Start monitoring
    requestAnimationFrame(checkLevels);
  }
  
  /**
   * Automatically adjust audio levels based on real-time monitoring
   * @param averageLevel Current average audio level
   */
  private autoAdjustLevels(averageLevel: number): void {
    // If audio is too quiet overall
    if (averageLevel < 10 && this.micGain && this.systemGain) {
      // Gradually increase both gains
      const currentMicGain = this.micGain.gain.value;
      const currentSysGain = this.systemGain.gain.value;
      
      if (currentMicGain < 4.0) { // Max safety limit
        this.micGain.gain.value = Math.min(currentMicGain * 1.1, 4.0);
        console.log(`Auto-adjusted mic gain up to ${this.micGain.gain.value.toFixed(2)}`);
      }
      
      if (currentSysGain < 2.5) { // Max safety limit
        this.systemGain.gain.value = Math.min(currentSysGain * 1.05, 2.5);
        console.log(`Auto-adjusted system gain up to ${this.systemGain.gain.value.toFixed(2)}`);
      }
    }
    // If audio is too loud
    else if (averageLevel > 100 && this.micGain && this.systemGain) {
      // Slightly decrease system gain first to prevent drowning out mic
      const currentSysGain = this.systemGain.gain.value;
      
      if (currentSysGain > 0.5) {
        this.systemGain.gain.value = Math.max(currentSysGain * 0.95, 0.5);
        console.log(`Auto-adjusted system gain down to ${this.systemGain.gain.value.toFixed(2)}`);
      }
    }
  }

  /**
   * Clean up all audio resources
   */
  public cleanup(): void {
    // Clean up any existing audio nodes to prevent memory leaks
    if (this.audioContext) {
      // Try to close the audio context
      try {
        this.audioContext.close();
        console.log('Audio context closed successfully');
      } catch (err) {
        console.warn('Error closing AudioContext:', err);
      }
    }
    
    // Explicitly disconnect all nodes to ensure proper cleanup
    const disconnectNode = (node: AudioNode | null) => {
      if (node) {
        try {
          node.disconnect();
        } catch {
          // Ignore, may already be disconnected
        }
      }
    };
    
    disconnectNode(this.systemSource);
    disconnectNode(this.micSource);
    disconnectNode(this.systemGain);
    disconnectNode(this.micGain);
    disconnectNode(this.analyzerNode);
    
    // Reset all references
    this.audioContext = null;
    this.mixedDestination = null;
    this.analyzerNode = null;
    this.systemSource = null;
    this.micSource = null;
    this.systemGain = null;
    this.micGain = null;
    
    console.log('Audio mixer resources cleaned up successfully');
  }
}

// Singleton instance to prevent multiple audio context creations
export const audioMixer = new AudioMixerService();
