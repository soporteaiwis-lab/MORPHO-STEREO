import React from 'react';

interface PhaseMeterProps {
  correlation: number; // -1 to 1
  isCritical: boolean;
}

const PhaseMeter: React.FC<PhaseMeterProps> = ({ correlation, isCritical }) => {
  // Map -1..1 to 0..100% for the marker
  // -1 -> 0% (Left)
  // 0 -> 50% (Center)
  // +1 -> 100% (Right)
  const percent = ((correlation + 1) / 2) * 100;

  return (
    <div className="flex flex-col gap-1 w-full max-w-[200px]">
      <div className="flex justify-between text-[9px] font-mono text-gray-500 uppercase">
        <span className={correlation < 0 ? 'text-red-500 font-bold' : ''}>-1 (Phase)</span>
        <span>0</span>
        <span className="text-dsp-success">+1 (Mono)</span>
      </div>
      <div className="relative h-3 bg-gray-900 rounded-full border border-white/10 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/50 via-transparent to-green-500/50 opacity-30"></div>
        
        {/* Warning Flash */}
        {isCritical && (
            <div className="absolute inset-0 bg-red-500/50 animate-pulse"></div>
        )}

        {/* Center Line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20"></div>

        {/* Marker */}
        <div 
            className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_white] transition-all duration-100 ease-linear"
            style={{ left: `${Math.max(0, Math.min(100, percent))}%` }}
        ></div>
      </div>
      <div className={`text-center text-[10px] font-mono ${isCritical ? 'text-red-400 animate-pulse font-bold' : 'text-gray-500'}`}>
        {isCritical ? "PHASE ISSUE DETECTED" : "CORRELATION"}
      </div>
    </div>
  );
};

export default PhaseMeter;