import React, { useState, useRef, useEffect } from 'react';
import { audioEngine } from './services/audioEngine';
import BandControl from './components/BandControl';
import Visualizer from './components/Visualizer';
import PythonCodeModal from './components/PythonCodeModal';
import PhaseMeter from './components/PhaseMeter';
import { BandConfig, PlaybackState, BitDepth } from './types';
import { 
    PlayIcon, PauseIcon, StopIcon, UploadIcon, CodeIcon, ShieldCheckIcon, CompareIcon,
    SkipStartIcon, SkipEndIcon, ForwardIcon, BackwardIcon, DownloadIcon
} from './icons';

const INITIAL_BANDS: BandConfig[] = [
  { id: 'low', name: 'Low', frequencyRange: '< 250Hz', pan: 0, color: '#ef4444', gain: 1 },
  { id: 'mid-low', name: 'Lo-Mid', frequencyRange: '250-2k', pan: -0.3, color: '#eab308', gain: 1 },
  { id: 'mid-high', name: 'Hi-Mid', frequencyRange: '2k-8k', pan: 0.3, color: '#10b981', gain: 1 },
  { id: 'high', name: 'High', frequencyRange: '> 8k', pan: 0.1, color: '#0ea5e9', gain: 1 },
];

const App = () => {
  // --- STATE ---
  const [bands, setBands] = useState<BandConfig[]>(INITIAL_BANDS);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.IDLE);
  const [fileName, setFileName] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  
  // DSP
  const [haasEnabled, setHaasEnabled] = useState(false);
  const [monoSafeMode, setMonoSafeMode] = useState(true);
  const [bypass, setBypass] = useState(false);
  const [masterWidth, setMasterWidth] = useState(1.0);
  
  // Transport & Timeline
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Visuals
  const [correlation, setCorrelation] = useState(1);
  const [autoCorrecting, setAutoCorrecting] = useState(false);
  
  // UI
  const [showCode, setShowCode] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<BitDepth>(24);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- LOOPS ---
  useEffect(() => {
    let frameId: number;
    let correctionCooldown = 0;

    const loop = () => {
        // Sync Time
        setCurrentTime(audioEngine.getCurrentTime());
        setDuration(audioEngine.getDuration());

        if (playbackState === PlaybackState.PLAYING) {
            const currCorr = audioEngine.getPhaseCorrelation();
            setCorrelation(prev => prev * 0.9 + currCorr * 0.1);

            // Safe Mode Logic
            if (monoSafeMode && !bypass && currCorr < 0 && correctionCooldown <= 0) {
                 if (haasEnabled) { setHaasEnabled(false); audioEngine.setHaasState(false); }
                 if (masterWidth > 0.5) { 
                     const nw = Math.max(0.5, masterWidth * 0.95); 
                     setMasterWidth(nw); 
                     audioEngine.setGlobalWidth(nw); 
                }
                setAutoCorrecting(true);
                correctionCooldown = 60;
                setTimeout(() => setAutoCorrecting(false), 1000);
            }
            if (correctionCooldown > 0) correctionCooldown--;
        }
        frameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frameId);
  }, [playbackState, haasEnabled, monoSafeMode, bypass, masterWidth]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPlaybackState(PlaybackState.LOADING);
      setFileName(file.name);
      await audioEngine.loadAudio(file);
      setAudioBuffer(audioEngine.getBuffer()); 
      setPlaybackState(PlaybackState.IDLE);
      setCurrentTime(0);
    }
  };

  const syncDSP = () => {
      audioEngine.setHaasState(haasEnabled);
      audioEngine.setBypass(bypass);
      audioEngine.setGlobalWidth(masterWidth);
      audioEngine.updateBands(bands);
  };

  const togglePlay = () => {
    if (playbackState === PlaybackState.PLAYING) {
      audioEngine.pause();
      setPlaybackState(PlaybackState.PAUSED);
    } else {
      syncDSP();
      audioEngine.play(bands, () => setPlaybackState(PlaybackState.IDLE));
      setPlaybackState(PlaybackState.PLAYING);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    setPlaybackState(PlaybackState.IDLE);
    setCurrentTime(0);
    setCorrelation(1);
  };

  const handleSeek = (time: number) => {
      setCurrentTime(time);
      audioEngine.seek(time);
  };

  const handleExport = async () => {
      setPlaybackState(PlaybackState.EXPORTING);
      const blob = await audioEngine.exportAudio(exportFormat);
      setPlaybackState(PlaybackState.IDLE);
      setShowExport(false);
      
      if(blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `MorphoStereo_Master_${exportFormat}bit.wav`;
          a.click();
      }
  };

  const fmtTime = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  return (
    <div className="h-screen w-screen bg-black text-white font-sans flex flex-col overflow-hidden">
      
      {/* 1. TOP HALF: VISUALIZER (Cinema View) */}
      <div className="flex-[4] relative bg-slate-900 border-b border-gray-800">
         <Visualizer 
            buffer={audioBuffer} 
            currentTime={currentTime} 
            duration={duration} 
            onSeek={handleSeek}
         />
         
         {/* Overlay Header Info */}
         <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none">
             <div>
                <h1 className="text-2xl font-black italic tracking-tighter text-white drop-shadow-md">MorphoStereo <span className="text-dsp-accent not-italic font-normal text-sm">DSP</span></h1>
                {fileName && <div className="text-xs font-mono text-gray-400 bg-black/50 px-2 py-1 rounded inline-block mt-1">{fileName}</div>}
             </div>
             
             <div className="flex gap-2 pointer-events-auto">
                 <button onClick={() => setShowExport(true)} className="bg-dsp-accent hover:bg-cyan-400 text-black font-bold px-4 py-1 text-xs rounded shadow-lg transition-transform hover:scale-105">
                     EXPORT
                 </button>
             </div>
         </div>
         
         {/* Phase Meter Overlay */}
         <div className="absolute bottom-4 right-4 pointer-events-none">
             <PhaseMeter correlation={correlation} isCritical={autoCorrecting} />
         </div>
      </div>

      {/* 2. BOTTOM HALF: CONSOLE (Wide Layout) */}
      <div className="flex-[3] bg-dsp-panel border-t border-white/10 flex flex-col">
          
          {/* Transport Bar (Thin strip) */}
          <div className="h-12 bg-black/40 border-b border-white/5 flex items-center justify-between px-6">
              <div className="font-mono text-dsp-accent text-sm">
                  {fmtTime(currentTime)} <span className="text-gray-600">/ {fmtTime(duration)}</span>
              </div>
              
              <div className="flex items-center gap-4">
                  <button onClick={() => handleSeek(currentTime - 5)} className="text-gray-400 hover:text-white"><BackwardIcon className="w-5 h-5" /></button>
                  <button onClick={togglePlay} className={`p-2 rounded-full transition-all ${playbackState === PlaybackState.PLAYING ? 'bg-dsp-accent text-white shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'bg-gray-700 text-gray-300'}`}>
                      {playbackState === PlaybackState.PLAYING ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6 ml-1" />}
                  </button>
                  <button onClick={handleStop} className="text-gray-400 hover:text-red-500"><StopIcon className="w-6 h-6" /></button>
                  <button onClick={() => handleSeek(currentTime + 5)} className="text-gray-400 hover:text-white"><ForwardIcon className="w-5 h-5" /></button>
              </div>

              <div className="flex items-center gap-2">
                 <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFileUpload} />
                 <button onClick={() => fileInputRef.current?.click()} className="text-xs font-bold text-gray-400 hover:text-white flex items-center gap-2 border border-white/10 px-3 py-1 rounded hover:bg-white/5">
                     <UploadIcon className="w-4 h-4" /> LOAD
                 </button>
              </div>
          </div>

          {/* Mixing Desk Grid */}
          <div className="flex-1 p-6 overflow-hidden">
              <div className="grid grid-cols-12 gap-6 h-full max-w-7xl mx-auto">
                  
                  {/* LEFT: Master Section (3 cols) */}
                  <div className="col-span-12 md:col-span-3 bg-black/20 rounded-xl border border-white/5 p-4 flex flex-col justify-between">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">MASTER FX</div>
                      
                      {/* Width Knob Simulation */}
                      <div className="flex-1 flex flex-col justify-center items-center">
                          <div className="relative w-20 h-20 rounded-full border-2 border-dsp-accent flex items-center justify-center mb-2">
                              <div className="text-xl font-bold text-white">{Math.round(masterWidth * 100)}%</div>
                              <div className="absolute text-[9px] top-full mt-1 text-gray-500">WIDTH</div>
                          </div>
                          <input 
                            type="range" min="0" max="1.5" step="0.01" 
                            value={masterWidth}
                            onChange={(e) => { setMasterWidth(parseFloat(e.target.value)); audioEngine.setGlobalWidth(parseFloat(e.target.value)); }}
                            className="w-full accent-dsp-accent"
                           />
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-4">
                          <button onClick={() => setMonoSafeMode(!monoSafeMode)} className={`text-[10px] font-bold py-2 rounded border ${monoSafeMode ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-500'}`}>
                              SAFE MODE
                          </button>
                          <button onClick={() => {setBypass(!bypass); audioEngine.setBypass(!bypass)}} className={`text-[10px] font-bold py-2 rounded border ${bypass ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'border-gray-700 text-gray-500'}`}>
                              BYPASS
                          </button>
                      </div>
                  </div>

                  {/* CENTER: 4 Band Faders (6 cols) */}
                  <div className="col-span-12 md:col-span-6 bg-black/20 rounded-xl border border-white/5 p-4 relative">
                      <div className="absolute top-3 left-4 text-xs font-bold text-gray-500 uppercase tracking-widest">SPECTRAL PANNING</div>
                      <div className="absolute top-3 right-4">
                          <button 
                            onClick={() => { setHaasEnabled(!haasEnabled); audioEngine.setHaasState(!haasEnabled); }}
                            className={`text-[9px] font-bold px-2 py-0.5 rounded ${haasEnabled ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-500'}`}
                           >
                               HAAS: {haasEnabled ? 'ON' : 'OFF'}
                           </button>
                      </div>

                      <div className="h-full pt-8 grid grid-cols-4 gap-4">
                          {bands.map(b => (
                              <BandControl 
                                key={b.id} 
                                band={b} 
                                onChangePan={(id, p) => {
                                    setBands(prev => prev.map(x => x.id === id ? { ...x, pan: p } : x));
                                    audioEngine.updateBandPan(id, p);
                                }} 
                              />
                          ))}
                      </div>
                  </div>

                  {/* RIGHT: Export/AI Info (3 cols) */}
                  <div className="col-span-12 md:col-span-3 flex flex-col gap-4">
                      <div className="bg-black/20 rounded-xl border border-white/5 p-4 flex-1 flex flex-col justify-center items-center text-center">
                          <ShieldCheckIcon className="w-8 h-8 text-gray-600 mb-2" />
                          <p className="text-[10px] text-gray-500">
                              Phase Correction Active.<br/>
                              Using WebAudio STFT.
                          </p>
                          <button onClick={() => setShowCode(true)} className="mt-4 text-[10px] text-dsp-accent border border-dsp-accent/30 px-3 py-1 rounded hover:bg-dsp-accent/10">
                              VIEW KERNEL
                          </button>
                      </div>
                  </div>

              </div>
          </div>
      </div>

      {/* --- MODALS --- */}
      <PythonCodeModal isOpen={showCode} onClose={() => setShowCode(false)} />
      
      {/* EXPORT MODAL */}
      {showExport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-gray-900 border border-white/10 p-6 rounded-xl w-full max-w-md shadow-2xl">
                  <h3 className="text-xl font-bold text-white mb-2">Export Master</h3>
                  <p className="text-xs text-gray-400 mb-6">Select format and bit-depth.</p>
                  
                  <div className="space-y-4 mb-8">
                      <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase mb-2 block">WAV (Uncompressed)</label>
                          <div className="grid grid-cols-3 gap-2">
                            {[16, 24, 32].map((bit) => (
                                <button 
                                    key={bit}
                                    onClick={() => setExportFormat(bit as BitDepth)}
                                    className={`py-2 rounded text-xs font-bold border transition-all ${exportFormat === bit ? 'bg-dsp-accent text-black border-dsp-accent' : 'bg-transparent border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                >
                                    {bit}-BIT
                                </button>
                            ))}
                          </div>
                      </div>
                  </div>

                  <div className="flex gap-3">
                      <button onClick={() => setShowExport(false)} className="flex-1 py-3 text-xs font-bold text-gray-400 hover:text-white">CANCEL</button>
                      <button 
                        onClick={handleExport}
                        disabled={playbackState === PlaybackState.EXPORTING}
                        className="flex-1 py-3 bg-white text-black rounded font-bold text-xs hover:bg-gray-200"
                      >
                          {playbackState === PlaybackState.EXPORTING ? 'RENDERING...' : 'DOWNLOAD .WAV'}
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default App;