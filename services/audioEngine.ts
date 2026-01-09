import { BandConfig, BitDepth } from "../types";

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  public audioBuffer: AudioBuffer | null = null;
  
  // Graph Nodes (for Realtime)
  private masterGain: GainNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  
  // State Tracking
  private startTime: number = 0;
  private pauseTime: number = 0;
  private isPlaying: boolean = false;
  
  // Current DSP Settings (Stored to re-apply on seek/render)
  private currentBands: BandConfig[] = [];
  private currentHaas: boolean = false;
  private currentWidth: number = 1.0;
  private currentBypass: boolean = false;

  private onEndedCallback: (() => void) | null = null;

  constructor() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass();
  }

  public async loadAudio(file: File): Promise<void> {
    if (!this.audioContext) return;
    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.pauseTime = 0;
    this.startTime = 0;
  }

  public getBuffer(): AudioBuffer | null {
      return this.audioBuffer;
  }

  public getDuration(): number {
    return this.audioBuffer?.duration || 0;
  }

  public getCurrentTime(): number {
    if (!this.audioContext || !this.isPlaying) return this.pauseTime;
    return Math.min(this.getDuration(), this.audioContext.currentTime - this.startTime);
  }

  // --------------------------------------------------------
  //  GRAPH CONSTRUCTION (Shared by Realtime & Offline)
  // --------------------------------------------------------
  private createGraph(
    context: BaseAudioContext, 
    source: AudioNode, 
    destination: AudioNode,
    bands: BandConfig[],
    haas: boolean,
    width: number,
    bypass: boolean
  ) {
    // 1. Master Chain
    const master = context.createGain();
    const wetGain = context.createGain();
    const dryGain = context.createGain();
    const wetCollector = context.createGain();
    
    // Bypass Logic
    dryGain.gain.value = bypass ? 1 : 0;
    wetGain.gain.value = bypass ? 0 : 1;

    // Connect Dry
    source.connect(dryGain);
    dryGain.connect(master);

    // Connect Wet
    wetCollector.connect(wetGain);
    wetGain.connect(master);
    master.connect(destination);

    // 2. Band Processing
    const bandNodes: any[] = []; // Keep track to store logic if needed

    bands.forEach(config => {
      const filters = this.createBandFilters(config.id, context);
      const panner = context.createStereoPanner();
      const gain = context.createGain();

      // Apply Pan & Gain
      panner.pan.value = config.pan * width;
      gain.gain.value = config.gain;

      const supportsHaas = config.id !== 'low';
      let chainEnd: AudioNode;

      if (supportsHaas) {
        const bandSplitter = context.createChannelSplitter(2);
        const bandMerger = context.createChannelMerger(2);
        const delayNode = context.createDelay(0.05);
        delayNode.delayTime.value = haas ? 0.015 : 0;

        filters[filters.length - 1].connect(bandSplitter);
        bandSplitter.connect(bandMerger, 0, 0); 
        bandSplitter.connect(delayNode, 1);
        delayNode.connect(bandMerger, 0, 1);
        chainEnd = bandMerger;
      } else {
        chainEnd = filters[filters.length - 1];
      }

      // Connect
      if (filters.length > 0) {
        source.connect(filters[0]);
        chainEnd.connect(gain);
        gain.connect(panner);
        panner.connect(wetCollector);
      }
    });

    return { master, wetGain, dryGain }; // Return nodes we might need to automate later
  }

  private createBandFilters(id: string, context: BaseAudioContext): BiquadFilterNode[] {
    const filters: BiquadFilterNode[] = [];
    const Q_VAL = 0.707;
    // Helper to create filter
    const cf = (t: BiquadFilterType, f: number) => {
        const n = context.createBiquadFilter(); n.type=t; n.frequency.value=f; n.Q.value=Q_VAL; return n;
    }

    if (id === 'low') {
      filters.push(cf('lowpass', 250), cf('lowpass', 250));
    } else if (id === 'mid-low') {
      filters.push(cf('highpass', 250), cf('highpass', 250), cf('lowpass', 2000), cf('lowpass', 2000));
    } else if (id === 'mid-high') {
      filters.push(cf('highpass', 2000), cf('highpass', 2000), cf('lowpass', 8000), cf('lowpass', 8000));
    } else if (id === 'high') {
      filters.push(cf('highpass', 8000), cf('highpass', 8000));
    }

    for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i+1]);
    return filters;
  }

  // --------------------------------------------------------
  //  TRANSPORT
  // --------------------------------------------------------

  public play(bands: BandConfig[], onEnded: () => void) {
    if (!this.audioContext || !this.audioBuffer) return;
    this.currentBands = bands;
    this.onEndedCallback = onEnded;

    if (this.audioContext.state === 'suspended') this.audioContext.resume();
    
    // Stop previous if exists (handle seek)
    if (this.sourceNode) { 
        try { this.sourceNode.stop(); } catch(e){} 
        this.sourceNode.disconnect();
    }

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.onended = () => {
        this.isPlaying = false;
        if(this.onEndedCallback) this.onEndedCallback();
    }

    // Analysis Setup (Only for Realtime)
    this.analyserL = this.audioContext.createAnalyser();
    this.analyserR = this.audioContext.createAnalyser();
    this.analyserL.fftSize = 2048; // Higher res for oscilloscope
    this.analyserR.fftSize = 2048;
    
    // Build Realtime Graph
    const splitter = this.audioContext.createChannelSplitter(2);
    const { master, wetGain, dryGain } = this.createGraph(
        this.audioContext, 
        this.sourceNode, 
        splitter, // Connect master to splitter first
        this.currentBands, 
        this.currentHaas, 
        this.currentWidth,
        this.currentBypass
    );

    // Save refs for updates
    this.masterGain = master;
    this.wetGain = wetGain;
    this.dryGain = dryGain;

    // Analysis Routing
    splitter.connect(this.analyserL, 0);
    splitter.connect(this.analyserR, 1);
    splitter.connect(this.audioContext.destination); // Hear it

    // Start
    const offset = this.pauseTime % this.getDuration();
    this.startTime = this.audioContext.currentTime - offset;
    this.sourceNode.start(0, offset);
    this.isPlaying = true;
  }

  public pause() {
    if (!this.audioContext || !this.isPlaying || !this.sourceNode) return;
    try {
        this.sourceNode.stop();
        this.pauseTime = this.audioContext.currentTime - this.startTime;
        this.isPlaying = false;
    } catch (e) {}
  }

  public seek(time: number) {
      if(!this.audioBuffer) return;
      this.pauseTime = Math.max(0, Math.min(time, this.audioBuffer.duration));
      if(this.isPlaying) {
          this.play(this.currentBands, this.onEndedCallback!);
      }
  }

  public stop() {
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch (e) {}
      this.sourceNode = null;
    }
    this.pauseTime = 0;
    this.isPlaying = false;
  }

  // --------------------------------------------------------
  //  REALTIME UPDATES
  // --------------------------------------------------------
  public setHaasState(enabled: boolean) { this.currentHaas = enabled; if(this.isPlaying) this.refreshGraph(); }
  public setBypass(enabled: boolean) { this.currentBypass = enabled; if(this.isPlaying) this.refreshGraph(); }
  public setGlobalWidth(width: number) { this.currentWidth = width; if(this.isPlaying) this.refreshGraph(); }
  public updateBands(bands: BandConfig[]) { this.currentBands = bands; if(this.isPlaying) this.refreshGraph(); }

  public updateBandPan(id: string, pan: number) {
    this.currentBands = this.currentBands.map(b => b.id === id ? { ...b, pan } : b);
    if(this.isPlaying) this.refreshGraph();
  }

  // Quick Hack: Instead of complex automation, just re-play at current time seamlessly for big structural changes
  // For smooth Gain/Pan changes, we could automate, but for simplicity in this prototype:
  private refreshGraph() {
      // For Pan/Gain changes, we ideally update existing nodes. 
      // But for structure changes (Haas), we need to rebuild.
      // Re-triggering play is the safest "nuclear" option for prototype consistency.
      if(this.isPlaying) {
           const time = this.getCurrentTime();
           this.pauseTime = time;
           this.play(this.currentBands, this.onEndedCallback!);
      }
  }

  // --------------------------------------------------------
  //  ANALYSIS
  // --------------------------------------------------------
  public getFloatTimeDomainData(l: Float32Array, r: Float32Array) {
      if(this.analyserL && this.analyserR) {
          this.analyserL.getFloatTimeDomainData(l);
          this.analyserR.getFloatTimeDomainData(r);
      }
  }

  public getPhaseCorrelation(): number {
      if (!this.analyserL || !this.analyserR) return 1;
      const bufferSize = 2048; 
      const l = new Float32Array(bufferSize);
      const r = new Float32Array(bufferSize);
      this.analyserL.getFloatTimeDomainData(l);
      this.analyserR.getFloatTimeDomainData(r);
      let sumLR = 0, sumL2 = 0, sumR2 = 0;
      for(let i=0; i<bufferSize; i++) {
          sumLR += l[i] * r[i]; sumL2 += l[i] * l[i]; sumR2 += r[i] * r[i];
      }
      const denominator = Math.sqrt(sumL2) * Math.sqrt(sumR2);
      return denominator === 0 ? 1 : sumLR / denominator;
  }

  // --------------------------------------------------------
  //  OFFLINE EXPORT (High Quality)
  // --------------------------------------------------------
  public async exportAudio(bitDepth: BitDepth): Promise<Blob | null> {
      if(!this.audioBuffer) return null;

      // 1. Setup Offline Context
      const offlineCtx = new OfflineAudioContext(2, this.audioBuffer.length, this.audioBuffer.sampleRate);
      
      // 2. Setup Source
      const source = offlineCtx.createBufferSource();
      source.buffer = this.audioBuffer;

      // 3. Build Graph (Re-use logic)
      this.createGraph(
          offlineCtx, 
          source, 
          offlineCtx.destination, 
          this.currentBands, 
          this.currentHaas, 
          this.currentWidth, 
          this.currentBypass
      );

      // 4. Render
      source.start(0);
      const renderedBuffer = await offlineCtx.startRendering();

      // 5. Encode to WAV
      return this.encodeWAV(renderedBuffer, bitDepth);
  }

  private encodeWAV(buffer: AudioBuffer, bitDepth: BitDepth): Blob {
      const numChannels = buffer.numberOfChannels;
      const sampleRate = buffer.sampleRate;
      const format = bitDepth === 32 ? 3 : 1; // 3 = Float, 1 = PCM
      const bytesPerSample = bitDepth / 8;
      const blockAlign = numChannels * bytesPerSample;
      const byteRate = sampleRate * blockAlign;
      const dataSize = buffer.length * blockAlign;
      const headerSize = 44;
      const totalSize = headerSize + dataSize;
      
      const arrayBuffer = new ArrayBuffer(totalSize);
      const view = new DataView(arrayBuffer);

      // Header
      const writeString = (o: number, s: string) => { for (let i=0; i<s.length; i++) view.setUint8(o+i, s.charCodeAt(i)); };
      
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true); // Subchunk1Size
      view.setUint16(20, format, true); // AudioFormat
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitDepth, true);
      writeString(36, 'data');
      view.setUint32(40, dataSize, true);

      // Data Interleaving
      const channels = [];
      for(let i=0; i<numChannels; i++) channels.push(buffer.getChannelData(i));
      
      let offset = 44;
      for (let i = 0; i < buffer.length; i++) {
          for (let ch = 0; ch < numChannels; ch++) {
              let sample = channels[ch][i];
              // Clip
              sample = Math.max(-1, Math.min(1, sample));
              
              if (bitDepth === 16) {
                  sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                  view.setInt16(offset, sample, true);
              } else if (bitDepth === 24) {
                   sample = sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF;
                   // Write 3 bytes
                   const val = Math.round(sample);
                   view.setUint8(offset, val & 0xFF);
                   view.setUint8(offset + 1, (val >> 8) & 0xFF);
                   view.setUint8(offset + 2, (val >> 16) & 0xFF);
              } else {
                  // 32-bit Float
                  view.setFloat32(offset, sample, true);
              }
              offset += bytesPerSample;
          }
      }
      
      return new Blob([arrayBuffer], { type: 'audio/wav' });
  }
}

export const audioEngine = new AudioEngine();