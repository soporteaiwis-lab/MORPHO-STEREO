
export interface BandConfig {
  id: string;
  name: string;
  frequencyRange: string;
  pan: number; // -1 (Left) to 1 (Right)
  color: string;
  gain: number; // 0 to 1
}

export enum PlaybackState {
  IDLE = 'IDLE',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  LOADING = 'LOADING',
  EXPORTING = 'EXPORTING'
}

export interface AudioVisualizationData {
  leftFrequency: Uint8Array;
  rightFrequency: Uint8Array;
}

export type BitDepth = 16 | 24 | 32;
