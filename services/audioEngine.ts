import { BandConfig } from "../types";

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  
  // Routing
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  
  // Analysis
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  
  // Bands
  private bands: Map<string, {
    filters: BiquadFilterNode[]; 
    panner: StereoPannerNode;
    gain: GainNode;
    haasDelayNode?: DelayNode;
    basePan: number; // Store the original intended pan
  }> = new Map();

  // State
  private haasEnabled: boolean = false;
  private globalWidth: number = 1.0; // 0.0 to 1.0

  constructor() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass();
  }

  public async loadAudio(file: File): Promise<void> {
    if (!this.audioContext) return;
    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
  }

  private createBandFilters(id: string, context: AudioContext): BiquadFilterNode[] {
    const filters: BiquadFilterNode[] = [];
    const Q_VAL = 0.707;

    if (id === 'low') {
      // Lowpass at 250Hz
      const f1 = context.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.value = 250; f1.Q.value = Q_VAL;
      const f2 = context.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 250; f2.Q.value = Q_VAL;
      filters.push(f1, f2);

    } else if (id === 'mid-low') {
      // Bandpass 250Hz - 2000Hz
      const hp1 = context.createBiquadFilter(); hp1.type = 'highpass'; hp1.frequency.value = 250; hp1.Q.value = Q_VAL;
      const hp2 = context.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 250; hp2.Q.value = Q_VAL;
      const lp1 = context.createBiquadFilter(); lp1.type = 'lowpass'; lp1.frequency.value = 2000; lp1.Q.value = Q_VAL;
      const lp2 = context.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 2000; lp2.Q.value = Q_VAL;
      filters.push(hp1, hp2, lp1, lp2);

    } else if (id === 'mid-high') {
      // Bandpass 2000Hz - 8000Hz
      const hp1 = context.createBiquadFilter(); hp1.type = 'highpass'; hp1.frequency.value = 2000; hp1.Q.value = Q_VAL;
      const hp2 = context.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 2000; hp2.Q.value = Q_VAL;
      const lp1 = context.createBiquadFilter(); lp1.type = 'lowpass'; lp1.frequency.value = 8000; lp1.Q.value = Q_VAL;
      const lp2 = context.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 8000; lp2.Q.value = Q_VAL;
      filters.push(hp1, hp2, lp1, lp2);

    } else if (id === 'high') {
      // Highpass > 8000Hz
      const f1 = context.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = 8000; f1.Q.value = Q_VAL;
      const f2 = context.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 8000; f2.Q.value = Q_VAL;
      filters.push(f1, f2);
    }

    // Series connection
    for (let i = 0; i < filters.length - 1; i++) {
      filters[i].connect(filters[i+1]);
    }

    return filters;
  }

  public setHaasState(enabled: boolean) {
    this.haasEnabled = enabled;
    this.bands.forEach((band) => {
        if (band.haasDelayNode) {
            const targetDelay = enabled ? 0.015 : 0;
            const now = this.audioContext?.currentTime || 0;
            band.haasDelayNode.delayTime.setTargetAtTime(targetDelay, now, 0.1);
        }
    });
  }

  public setBypass(bypass: boolean) {
    const now = this.audioContext?.currentTime || 0;
    // Crossfade Dry/Wet
    this.dryGain?.gain.setTargetAtTime(bypass ? 1 : 0, now, 0.1);
    this.wetGain?.gain.setTargetAtTime(bypass ? 0 : 1, now, 0.1);
  }

  public setGlobalWidth(width: number) {
      this.globalWidth = Math.max(0, Math.min(1, width));
      this.bands.forEach(band => {
          // Apply scaling to the base pan
          const effectivePan = band.basePan * this.globalWidth;
          band.panner.pan.setTargetAtTime(effectivePan, this.audioContext?.currentTime || 0, 0.05);
      });
  }

  public play(bandConfigs: BandConfig[], onEnded: () => void) {
    if (!this.audioContext || !this.audioBuffer) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.stop();

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.onended = onEnded;

    // Master Output Chain
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1.0;

    // A/B Chain
    this.dryGain = this.audioContext.createGain();
    this.wetGain = this.audioContext.createGain();
    this.dryGain.gain.value = 0; // Default to processed
    this.wetGain.gain.value = 1;

    // Connect Source to both Dry and Wet paths
    // 1. Dry Path (Source -> DryGain -> Master)
    this.sourceNode.connect(this.dryGain);
    this.dryGain.connect(this.masterGain);

    // 2. Wet Path (Source -> Splitter logic below... -> WetGain -> Master)
    // Note: We need a node to collect all bands before WetGain
    const wetCollector = this.audioContext.createGain();
    wetCollector.connect(this.wetGain);
    this.wetGain.connect(this.masterGain);

    // Visualization Analysis (Tap from Master)
    this.analyserL = this.audioContext.createAnalyser();
    this.analyserR = this.audioContext.createAnalyser();
    this.analyserL.fftSize = 2048;
    this.analyserR.fftSize = 2048;
    this.analyserL.smoothingTimeConstant = 0.85;
    this.analyserR.smoothingTimeConstant = 0.85;

    this.splitter = this.audioContext.createChannelSplitter(2);
    this.masterGain.connect(this.splitter);
    this.splitter.connect(this.analyserL, 0);
    this.splitter.connect(this.analyserR, 1);
    this.masterGain.connect(this.audioContext.destination);

    // Build Bands
    bandConfigs.forEach(config => {
      if (!this.audioContext) return;

      const filters = this.createBandFilters(config.id, this.audioContext);
      const panner = this.audioContext.createStereoPanner();
      const gain = this.audioContext.createGain();

      // Apply initial pan scaled by global width
      panner.pan.value = config.pan * this.globalWidth;
      gain.gain.value = config.gain;

      const supportsHaas = config.id !== 'low';
      let chainEnd: AudioNode;

      if (supportsHaas) {
          const bandSplitter = this.audioContext.createChannelSplitter(2);
          const bandMerger = this.audioContext.createChannelMerger(2);
          const delayNode = this.audioContext.createDelay(0.05);
          
          delayNode.delayTime.value = this.haasEnabled ? 0.015 : 0;
          
          filters[filters.length - 1].connect(bandSplitter);
          bandSplitter.connect(bandMerger, 0, 0); // L -> L
          bandSplitter.connect(delayNode, 1); // R -> Delay
          delayNode.connect(bandMerger, 0, 1); // Delay -> R
          
          chainEnd = bandMerger;
          
          this.bands.set(config.id, { filters, panner, gain, haasDelayNode: delayNode, basePan: config.pan });
      } else {
          chainEnd = filters[filters.length - 1];
          this.bands.set(config.id, { filters, panner, gain, basePan: config.pan });
      }

      // Connect Band
      if (this.sourceNode && filters.length > 0) {
        // Input to filters
        this.sourceNode.connect(filters[0]);
        // Output to Collector
        chainEnd.connect(gain);
        gain.connect(panner);
        panner.connect(wetCollector); // Connect to Wet path
      }
    });

    this.sourceNode.start(0);
  }

  public pause() {
    if (this.audioContext?.state === 'running') this.audioContext.suspend();
  }

  public resume() {
    if (this.audioContext?.state === 'suspended') this.audioContext.resume();
  }

  public stop() {
    if (this.sourceNode) {
      try { this.sourceNode.stop(); this.sourceNode.disconnect(); } catch (e) {}
      this.sourceNode = null;
    }
    
    this.bands.forEach(band => {
        band.panner.disconnect();
        band.gain.disconnect();
        band.filters.forEach(f => f.disconnect());
        if(band.haasDelayNode) band.haasDelayNode.disconnect();
    });
    this.bands.clear();

    if (this.dryGain) this.dryGain.disconnect();
    if (this.wetGain) this.wetGain.disconnect();
    if (this.masterGain) this.masterGain.disconnect();
    if (this.splitter) this.splitter.disconnect();
    if (this.analyserL) this.analyserL.disconnect();
    if (this.analyserR) this.analyserR.disconnect();
  }

  public updateBandPan(id: string, val: number) {
    const band = this.bands.get(id);
    if (band) {
      band.basePan = val;
      // Re-apply with current global width
      band.panner.pan.setTargetAtTime(val * this.globalWidth, this.audioContext?.currentTime || 0, 0.1);
    }
  }

  public getAnalysisData(dataL: Uint8Array, dataR: Uint8Array) {
    if (this.analyserL && this.analyserR) {
      this.analyserL.getByteFrequencyData(dataL);
      this.analyserR.getByteFrequencyData(dataR);
    }
  }

  public getPhaseCorrelation(): number {
      if (!this.analyserL || !this.analyserR) return 1;

      const bufferSize = 2048; 
      const l = new Float32Array(bufferSize);
      const r = new Float32Array(bufferSize);

      this.analyserL.getFloatTimeDomainData(l);
      this.analyserR.getFloatTimeDomainData(r);

      let sumL = 0, sumR = 0, sumLR = 0, sumL2 = 0, sumR2 = 0;
      
      for(let i=0; i<bufferSize; i++) {
          sumLR += l[i] * r[i];
          sumL2 += l[i] * l[i];
          sumR2 += r[i] * r[i];
      }
      
      const denominator = Math.sqrt(sumL2) * Math.sqrt(sumR2);
      if (denominator === 0) return 1; 
      return sumLR / denominator;
  }
}

export const audioEngine = new AudioEngine();