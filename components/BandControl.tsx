import React from 'react';
import { BandConfig } from '../types';

interface BandControlProps {
  band: BandConfig;
  onChangePan: (id: string, val: number) => void;
}

const BandControl: React.FC<BandControlProps> = ({ band, onChangePan }) => {
  return (
    <div className="flex flex-col p-4 bg-dsp-panel/50 rounded-lg border border-white/5 hover:border-white/10 transition-all group">
      <div className="flex justify-between items-center mb-4">
        <div>
            <h3 className="text-sm font-bold tracking-wider uppercase text-gray-300" style={{ color: band.color }}>{band.name}</h3>
            <span className="text-[10px] text-gray-500 font-mono block mt-1">{band.frequencyRange}</span>
        </div>
        <div className="text-xs font-mono text-dsp-accent bg-dsp-dark px-2 py-1 rounded">
             {band.pan === 0 ? 'CTR' : band.pan > 0 ? `R ${Math.round(band.pan * 100)}` : `L ${Math.round(Math.abs(band.pan) * 100)}`}
        </div>
      </div>

      <div className="relative h-12 w-full flex items-center justify-center mb-2">
         {/* Center Line */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/10 z-0"></div>
        
        {/* Slider Input */}
        <input 
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={band.pan}
          onChange={(e) => onChangePan(band.id, parseFloat(e.target.value))}
          className="relative z-10 w-full bg-transparent appearance-none [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(255,255,255,0.5)]"
        />
      </div>
      
      <div className="flex justify-between text-[10px] text-gray-600 font-mono uppercase">
        <span>Left</span>
        <span>Center</span>
        <span>Right</span>
      </div>
    </div>
  );
};

export default BandControl;