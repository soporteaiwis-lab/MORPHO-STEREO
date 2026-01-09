import React from 'react';
import { BandConfig } from '../types';

interface BandControlProps {
  band: BandConfig;
  onChangePan: (id: string, val: number) => void;
}

const BandControl: React.FC<BandControlProps> = ({ band, onChangePan }) => {
  return (
    <div className="flex flex-col items-center bg-gray-900 border border-white/5 rounded-lg p-2 h-full shadow-lg">
      {/* Header */}
      <div className="text-center mb-2 w-full border-b border-white/5 pb-1">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 truncate">{band.name}</h3>
        <span className="text-[9px] text-gray-600 font-mono">{band.frequencyRange}</span>
      </div>

      {/* Pan Display */}
      <div className="mb-2 text-[9px] font-mono text-dsp-accent bg-black/40 px-2 py-0.5 rounded w-full text-center">
         {band.pan === 0 ? 'C' : band.pan > 0 ? `R${Math.round(band.pan * 100)}` : `L${Math.round(Math.abs(band.pan) * 100)}`}
      </div>

      {/* Vertical Fader Area */}
      <div className="relative flex-1 w-8 bg-gray-950 rounded-full border border-white/5 mx-auto mb-2 group">
        {/* Center Line */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/20"></div>

        {/* The Input Range Rotated */}
        <input 
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={band.pan * -1} /* Invert because CSS rotate flips it */
          onChange={(e) => onChangePan(band.id, parseFloat(e.target.value) * -1)}
          className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-ns-resize rotate-[-90deg] origin-center opacity-0 z-10"
        />
        
        {/* Visual Knob */}
        <div 
            className="absolute left-1 right-1 h-3 bg-gray-300 rounded shadow-md pointer-events-none transition-transform duration-75"
            style={{ 
                top: '50%', 
                marginTop: '-6px',
                transform: `translateY(${band.pan * -30}px)` // Map -1..1 to pixels
            }}
        >
            <div className="w-full h-px bg-black/50 mt-[6px]"></div>
        </div>
      </div>
      
      {/* Channel Label Color */}
      <div className="w-full h-1 rounded-full mt-auto" style={{ backgroundColor: band.color }}></div>
    </div>
  );
};

export default BandControl;