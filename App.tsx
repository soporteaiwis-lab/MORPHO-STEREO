
import React, { useState, useRef, useEffect } from 'react';
import { audioEngine } from './services/audioEngine';
import BandControl from './components/BandControl';
import Visualizer from './components/Visualizer';
import PythonCodeModal from './components/PythonCodeModal';
import PhaseMeter from './components/PhaseMeter';
import { BandConfig, PlaybackState, BitDepth } from './types';
import { 
    PlayIcon, PauseIcon, StopIcon, UploadIcon, CodeIcon, ShieldCheckIcon, CompareIcon,
    SkipStartIcon, SkipEndIcon, ForwardIcon, BackwardIcon, DownloadIcon, ZoomInIcon, ZoomOutIcon
} from './icons';

const INITIAL_BANDS: BandConfig[] = [
  { id: 'low', name: 'Low / Bass', frequencyRange: '< 250 Hz', pan: 0, color: '#ef4444', gain: 1 },
  { id: 'mid-low', name: 'Low Mids', frequencyRange: '250 Hz - 2 kHz', pan: -0.3, color: '#eab308', gain: 1 },
  { id: 'mid-high', name: 'High Mids', frequencyRange: '2 kHz - 8 kHz', pan: 0.3, color: '#10b981', gain: 1 },
  { id: 'high', name: 'High / Air', frequencyRange: '> 8 kHz', pan: 0.1, color: '#0ea5e9', gain: 1 },
];

const App = () => {
  // --- STATE ---
  const [bands, setBands] = useState<BandConfig[]>(INITIAL_BANDS);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.IDLE);
  const [fileName, setFileName] = useState<string | null>(null);
  
  // DSP
  const [haasEnabled, setHaasEnabled] = useState(false);
  const [monoSafeMode, setMonoSafeMode] = useState(true);
  const [bypass, setBypass] = useState(false);
  const [masterWidth, setMasterWidth] = useState(1.0);
  
  // Transport & Timeline
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  
  // Visuals
  const [zoomLevel, setZoomLevel] = useState(1);
  const [ampScale, setAmpScale] = useState(1);
  const [correlation, setCorrelation] = useState(1);
  const [autoCorrecting, setAutoCorrecting] = useState(false);
  
  // UI
  const [showCode, setShowCode] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<BitDepth>(24);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- LOOPS ---

  // 1. Time & Analysis Loop
  useEffect(() => {
    let frameId: number;
    let correctionCooldown = 0;

    const loop = () => {
        if (!isScrubbing) {
            setCurrentTime(audioEngine.getCurrentTime());
        }
        setDuration(audioEngine.getDuration());

        if (playbackState === PlaybackState.PLAYING) {
            const currCorr = audioEngine.getPhaseCorrelation();
            setCorrelation(prev => prev * 0.9 + currCorr * 0.1);

            // Safe Mode
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
  }, [playbackState, haasEnabled, monoSafeMode, bypass, masterWidth, isScrubbing]);

  // --- HANDLERS ---

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPlaybackState(PlaybackState.LOADING);
      setFileName(file.name);
      await audioEngine.loadAudio(file);
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

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      setCurrentTime(time);
      audioEngine.seek(time);
  };

  const handleSkip = (val: number) => {
      const newTime = Math.max(0, Math.min(currentTime + val, duration));
      setCurrentTime(newTime);
      audioEngine.seek(newTime);
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
          a.download = `MorphoStereo_Export_${exportFormat}bit.wav`;
          a.click();
      }
  };

  // --- FORMATTERS ---
  const fmtTime = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  return (
    <div className="h-screen bg-dsp-dark text-white font-sans flex flex-col overflow-hidden">
      
      {/* --- TOP BAR --- */}
      <header className="h-14 flex-shrink-0 flex justify-between items-center px-6 border-b border-white/5 bg-dsp-dark/95 backdrop-blur z-20">
        <div className="flex items-center gap-4">
            <h1 className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-dsp-accent to-dsp-secondary">
            MorphoStereo
            </h1>
            <div className="h-4 w-px bg-white/20"></div>
            <span className="text-xs font-mono text-gray-400">PROTOTYPE v2.0</span>
        </div>
        <div className="flex items-center gap-3">
             <button 
                onClick={() => setShowExport(!showExport)}
                disabled={!fileName}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-all disabled:opacity-50"
            >
                <DownloadIcon className="w-4 h-4" />
                EXPORT
            </button>
            <button 
                onClick={() => setShowCode(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-dsp-accent bg-dsp-accent/10 hover:bg-dsp-accent/20 rounded border border-dsp-accent/20 transition-all"
            >
                <CodeIcon className="w-4 h-4" />
                AI KERNEL
            </button>
        </div>
      </header>

      {/* --- MAIN WORKSPACE --- */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* LEFT SIDEBAR: DSP CONTROLS (Scrollable on mobile) */}
        <aside className="w-full lg:w-80 flex-shrink-0 bg-dsp-panel border-r border-white/5 flex flex-col z-10 overflow-y-auto">
            <div className="p-4 border-b border-white/5">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Channel Strip</h2>
                <div className="flex flex-col gap-2 mb-4">
                     <button 
                        onClick={() => setMonoSafeMode(!monoSafeMode)}
                        className={`flex items-center p-3 rounded border transition-all ${monoSafeMode ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-black/20 border-white/5'}`}
                    >
                        <ShieldCheckIcon className={`w-4 h-4 mr-3 ${monoSafeMode ? 'text-emerald-400' : 'text-gray-500'}`} />
                        <div className="text-left">
                            <div className={`text-xs font-bold ${monoSafeMode ? 'text-emerald-400' : 'text-gray-400'}`}>Mono Safe</div>
                        </div>
                    </button>
                    <button 
                        onClick={() => { setBypass(!bypass); audioEngine.setBypass(!bypass); }}
                        className={`flex items-center p-3 rounded border transition-all ${bypass ? 'bg-orange-900/20 border-orange-500/50' : 'bg-black/20 border-white/5'}`}
                    >
                        <CompareIcon className={`w-4 h-4 mr-3 ${bypass ? 'text-orange-400' : 'text-gray-500'}`} />
                        <div className="text-left">
                            <div className={`text-xs font-bold ${bypass ? 'text-orange-400' : 'text-gray-400'}`}>Bypass</div>
                        </div>
                    </button>
                </div>
                
                <div className="mb-2">
                    <div className="flex justify-between text-xs font-bold text-gray-400 mb-1">
                        <span>Stereo Width</span>
                        <span className="text-dsp-accent">{Math.round(masterWidth * 100)}%</span>
                    </div>
                    <input 
                        type="range" min="0" max="1" step="0.01" value={masterWidth}
                        onChange={(e) => {setMasterWidth(parseFloat(e.target.value)); audioEngine.setGlobalWidth(parseFloat(e.target.value));}}
                        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:bg-dsp-accent [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3"
                    />
                </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
                 <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Spectral Bands</h2>
                    <button onClick={() => { setHaasEnabled(!haasEnabled); audioEngine.setHaasState(!haasEnabled); }} className={`text-[9px] px-2 py-0.5 rounded font-bold ${haasEnabled ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-400'}`}>HAAS: {haasEnabled ? 'ON' : 'OFF'}</button>
                </div>
                <div className="flex flex-col gap-3">
                    {bands.map(b => (
                        <BandControl key={b.id} band={b} onChangePan={(id, p) => {
                            setBands(prev => prev.map(x => x.id === id ? { ...x, pan: p } : x));
                            audioEngine.updateBandPan(id, p);
                        }} />
                    ))}
                </div>
            </div>
        </aside>

        {/* CENTER: VISUALIZER & TIMELINE */}
        <div className="flex-1 flex flex-col bg-black relative">
            
            {/* 1. VISUALIZER AREA */}
            <div className="flex-1 relative overflow-hidden p-4">
                <Visualizer isPlaying={true} zoomLevel={zoomLevel} amplitudeScale={ampScale} />
                
                {/* Floating HUD */}
                <div className="absolute top-6 right-6 flex flex-col gap-2">
                     <div className="bg-black/80 backdrop-blur border border-white/10 rounded-lg p-2 flex flex-col gap-2">
                         <span className="text-[9px] font-bold text-gray-500 uppercase text-center">Zoom View</span>
                         <div className="flex gap-2">
                             <button onClick={() => setZoomLevel(Math.min(5, zoomLevel + 0.5))} className="p-1 hover:bg-white/10 rounded text-gray-300"><ZoomInIcon className="w-4 h-4"/></button>
                             <button onClick={() => setZoomLevel(Math.max(1, zoomLevel - 0.5))} className="p-1 hover:bg-white/10 rounded text-gray-300"><ZoomOutIcon className="w-4 h-4"/></button>
                         </div>
                         <div className="h-px bg-white/10 w-full"></div>
                         <div className="flex gap-2">
                             <button onClick={() => setAmpScale(Math.min(3, ampScale + 0.5))} className="text-[10px] text-gray-400 hover:text-white font-mono">Y+</button>
                             <button onClick={() => setAmpScale(Math.max(0.5, ampScale - 0.5))} className="text-[10px] text-gray-400 hover:text-white font-mono">Y-</button>
                         </div>
                     </div>
                </div>

                <div className="absolute bottom-6 right-6">
                    <PhaseMeter correlation={correlation} isCritical={autoCorrecting} />
                </div>
            </div>

            {/* 2. TRANSPORT BAR */}
            <div className="h-24 bg-dsp-panel border-t border-white/5 p-4 flex flex-col justify-center z-20">
                {/* Scrubber */}
                <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-mono text-gray-400 w-10 text-right">{fmtTime(currentTime)}</span>
                    <div className="flex-1 relative h-6 flex items-center group">
                        <div className="absolute inset-0 bg-black/30 rounded-full h-1.5 top-1/2 -translate-y-1/2"></div>
                        <div 
                            className="absolute h-1.5 bg-dsp-accent rounded-full top-1/2 -translate-y-1/2" 
                            style={{width: `${(currentTime / (duration || 1)) * 100}%`}}
                        ></div>
                        <input 
                            type="range" min="0" max={duration || 1} step="0.01"
                            value={currentTime}
                            onMouseDown={() => setIsScrubbing(true)}
                            onMouseUp={() => setIsScrubbing(false)}
                            onChange={handleSeek}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                    </div>
                    <span className="text-[10px] font-mono text-gray-400 w-10">{fmtTime(duration)}</span>
                </div>

                {/* Buttons */}
                <div className="flex items-center justify-between">
                     {/* File Input Hidden */}
                     <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFileUpload} />
                     
                     <div className="flex items-center gap-4">
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white">
                            <UploadIcon className="w-4 h-4" />
                            <span className="hidden md:inline">{fileName ? fileName.substring(0, 15) + '...' : "LOAD FILE"}</span>
                        </button>
                     </div>

                     <div className="flex items-center gap-4 absolute left-1/2 -translate-x-1/2">
                        <button onClick={() => handleSkip(-currentTime)} className="text-gray-400 hover:text-white"><SkipStartIcon className="w-5 h-5"/></button>
                        <button onClick={() => handleSkip(-5)} className="text-gray-400 hover:text-white"><BackwardIcon className="w-5 h-5"/></button>
                        
                        <button 
                            onClick={togglePlay}
                            disabled={!fileName}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${playbackState === PlaybackState.PLAYING ? 'bg-dsp-accent text-white shadow-[0_0_15px_#0ea5e9]' : 'bg-white text-black hover:scale-105'}`}
                        >
                            {playbackState === PlaybackState.PLAYING ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 ml-0.5" />}
                        </button>

                        <button onClick={() => handleStop()} className="text-gray-400 hover:text-red-400"><StopIcon className="w-6 h-6"/></button>
                        <button onClick={() => handleSkip(5)} className="text-gray-400 hover:text-white"><ForwardIcon className="w-5 h-5"/></button>
                        <button onClick={() => handleSkip(duration - currentTime)} className="text-gray-400 hover:text-white"><SkipEndIcon className="w-5 h-5"/></button>
                     </div>

                     <div></div> {/* Spacer */}
                </div>
            </div>
        </div>
      </div>

      {/* --- MODALS --- */}
      <PythonCodeModal isOpen={showCode} onClose={() => setShowCode(false)} />
      
      {/* EXPORT MODAL */}
      {showExport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="bg-dsp-panel border border-white/10 p-6 rounded-xl w-80 shadow-2xl">
                  <h3 className="text-lg font-bold text-white mb-4">Export Audio</h3>
                  <div className="flex flex-col gap-3 mb-6">
                      <p className="text-xs text-gray-400 mb-2">Select Bit Depth (WAV):</p>
                      {[16, 24, 32].map((bit) => (
                          <button 
                            key={bit}
                            onClick={() => setExportFormat(bit as BitDepth)}
                            className={`p-2 rounded text-sm font-mono border ${exportFormat === bit ? 'bg-dsp-accent/20 border-dsp-accent text-dsp-accent' : 'bg-black/20 border-white/5 text-gray-400'}`}
                          >
                              {bit}-bit {bit === 32 ? 'Float' : 'PCM'}
                          </button>
                      ))}
                  </div>
                  <div className="flex gap-2">
                      <button onClick={() => setShowExport(false)} className="flex-1 py-2 text-xs font-bold text-gray-400 hover:text-white">CANCEL</button>
                      <button 
                        onClick={handleExport}
                        disabled={playbackState === PlaybackState.EXPORTING}
                        className="flex-1 py-2 bg-dsp-accent text-white rounded font-bold text-xs hover:bg-dsp-accent/80 flex justify-center"
                      >
                          {playbackState === PlaybackState.EXPORTING ? 'RENDERING...' : 'DOWNLOAD WAV'}
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default App;
