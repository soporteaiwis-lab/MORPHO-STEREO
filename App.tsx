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
  const [zoomLevel, setZoomLevel] = useState(1);
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
      setAudioBuffer(audioEngine.getBuffer()); // Update buffer for visualizer
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

  const handleSkip = (val: number) => {
      const newTime = Math.max(0, Math.min(currentTime + val, duration));
      handleSeek(newTime);
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

  const fmtTime = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  return (
    <div className="min-h-screen bg-dsp-dark text-white font-sans flex flex-col">
      
      {/* HEADER (Sticky) */}
      <header className="sticky top-0 z-50 h-14 bg-dsp-dark/95 backdrop-blur border-b border-white/5 flex justify-between items-center px-4 lg:px-6 shadow-lg">
        <div className="flex items-center gap-3">
            <h1 className="text-xl lg:text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-dsp-accent to-dsp-secondary">
            MorphoStereo
            </h1>
            <div className="h-4 w-px bg-white/20 hidden sm:block"></div>
            <span className="text-xs font-mono text-gray-400 hidden sm:block">PROTOTYPE v2.1</span>
        </div>
        <div className="flex items-center gap-2">
             <button 
                onClick={() => setShowExport(!showExport)}
                disabled={!fileName}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-300 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-all disabled:opacity-50"
            >
                <DownloadIcon className="w-4 h-4" />
                <span className="hidden sm:inline">EXPORT</span>
            </button>
            <button 
                onClick={() => setShowCode(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-dsp-accent bg-dsp-accent/10 hover:bg-dsp-accent/20 rounded border border-dsp-accent/20 transition-all"
            >
                <CodeIcon className="w-4 h-4" />
                <span className="hidden sm:inline">AI KERNEL</span>
            </button>
        </div>
      </header>

      {/* MAIN CONTENT WRAPPER */}
      {/* Mobile: Column (Scrolls). Desktop: Row (Fixed Height) */}
      <div className="flex-1 flex flex-col lg:flex-row lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden">
        
        {/* RIGHT AREA (Desktop) / TOP AREA (Mobile) -> VISUALIZER & TRANSPORT */}
        <div className="flex-shrink-0 lg:flex-1 flex flex-col bg-black lg:order-2 border-b lg:border-b-0 lg:border-l border-white/5">
            
            {/* Visualizer Container */}
            {/* On mobile: Fixed height. On Desktop: Flexible */}
            <div className="relative h-[300px] lg:flex-1 w-full bg-[#020617] p-4">
                <Visualizer 
                    buffer={audioBuffer} 
                    currentTime={currentTime} 
                    duration={duration} 
                    zoomLevel={zoomLevel} 
                    onSeek={handleSeek}
                />
                
                {/* HUD Controls */}
                <div className="absolute top-6 right-6 flex flex-col gap-2">
                     <div className="bg-black/80 backdrop-blur border border-white/10 rounded-lg p-2 flex flex-col gap-2 shadow-xl">
                         <div className="flex gap-2">
                             <button onClick={() => setZoomLevel(Math.min(10, zoomLevel + 1))} className="p-1 hover:bg-white/10 rounded text-gray-300" title="Zoom In"><ZoomInIcon className="w-4 h-4"/></button>
                             <button onClick={() => setZoomLevel(Math.max(1, zoomLevel - 1))} className="p-1 hover:bg-white/10 rounded text-gray-300" title="Zoom Out"><ZoomOutIcon className="w-4 h-4"/></button>
                         </div>
                     </div>
                </div>

                <div className="absolute bottom-6 right-6 pointer-events-none">
                    <PhaseMeter correlation={correlation} isCritical={autoCorrecting} />
                </div>
            </div>

            {/* Transport Bar */}
            <div className="bg-dsp-panel border-t border-white/5 p-4 z-20 shadow-xl">
                {/* Scrubber Time */}
                <div className="flex justify-between text-[10px] font-mono text-gray-400 mb-1 px-1">
                    <span>{fmtTime(currentTime)}</span>
                    <span>{fmtTime(duration)}</span>
                </div>
                
                {/* Progress Bar (Visual Only, scrub handled by visualizer now, but kept for clarity) */}
                <div className="h-1 bg-black/50 rounded-full w-full mb-4 overflow-hidden relative">
                    <div className="absolute top-0 bottom-0 left-0 bg-dsp-accent" style={{width: `${(currentTime / (duration || 1)) * 100}%`}}></div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between max-w-2xl mx-auto">
                     <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFileUpload} />
                     
                     <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-white group">
                        <div className="p-2 rounded-full bg-white/5 group-hover:bg-white/10"><UploadIcon className="w-4 h-4" /></div>
                        <span>LOAD</span>
                     </button>

                     <div className="flex items-center gap-4">
                        <button onClick={() => handleSkip(-5)} className="text-gray-400 hover:text-white active:scale-95"><BackwardIcon className="w-6 h-6"/></button>
                        
                        <button 
                            onClick={togglePlay}
                            disabled={!fileName}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${playbackState === PlaybackState.PLAYING ? 'bg-dsp-accent text-white shadow-[0_0_20px_rgba(14,165,233,0.5)]' : 'bg-white text-black hover:scale-105'}`}
                        >
                            {playbackState === PlaybackState.PLAYING ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6 ml-0.5" />}
                        </button>

                        <button onClick={() => handleStop()} className="text-gray-400 hover:text-red-400 active:scale-95"><StopIcon className="w-7 h-7"/></button>
                        <button onClick={() => handleSkip(5)} className="text-gray-400 hover:text-white active:scale-95"><ForwardIcon className="w-6 h-6"/></button>
                     </div>

                     <div className="w-8"></div> {/* Spacer balance */}
                </div>
            </div>
        </div>

        {/* LEFT AREA (Desktop) / BOTTOM AREA (Mobile) -> CONTROLS */}
        <aside className="w-full lg:w-96 bg-dsp-panel lg:order-1 lg:overflow-y-auto border-r border-white/5">
            <div className="p-6 pb-20 lg:pb-6">
                
                {/* Global Section */}
                <div className="mb-8">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">Master Section</h2>
                    
                    <div className="grid grid-cols-2 gap-3 mb-6">
                         <button 
                            onClick={() => setMonoSafeMode(!monoSafeMode)}
                            className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all text-center gap-2 ${monoSafeMode ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-black/20 border-white/5'}`}
                        >
                            <ShieldCheckIcon className={`w-5 h-5 ${monoSafeMode ? 'text-emerald-400' : 'text-gray-500'}`} />
                            <span className={`text-[10px] font-bold ${monoSafeMode ? 'text-emerald-400' : 'text-gray-400'}`}>SAFE MODE</span>
                        </button>
                        <button 
                            onClick={() => { setBypass(!bypass); audioEngine.setBypass(!bypass); }}
                            className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all text-center gap-2 ${bypass ? 'bg-orange-900/20 border-orange-500/50' : 'bg-black/20 border-white/5'}`}
                        >
                            <CompareIcon className={`w-5 h-5 ${bypass ? 'text-orange-400' : 'text-gray-500'}`} />
                            <span className={`text-[10px] font-bold ${bypass ? 'text-orange-400' : 'text-gray-400'}`}>BYPASS</span>
                        </button>
                    </div>
                    
                    <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                        <div className="flex justify-between text-xs font-bold text-gray-300 mb-2">
                            <span>Stereo Width</span>
                            <span className="text-dsp-accent bg-dsp-accent/10 px-2 rounded">{Math.round(masterWidth * 100)}%</span>
                        </div>
                        <input 
                            type="range" min="0" max="1" step="0.01" value={masterWidth}
                            onChange={(e) => {setMasterWidth(parseFloat(e.target.value)); audioEngine.setGlobalWidth(parseFloat(e.target.value));}}
                            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:bg-dsp-accent [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:shadow-lg"
                        />
                        <div className="flex justify-between text-[9px] text-gray-500 mt-2 uppercase font-mono">
                            <span>Mono</span>
                            <span>Wide</span>
                        </div>
                    </div>
                </div>

                {/* Bands Section */}
                <div>
                     <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Spectral Mixer</h2>
                        <button 
                            onClick={() => { setHaasEnabled(!haasEnabled); audioEngine.setHaasState(!haasEnabled); }} 
                            className={`text-[10px] px-2 py-1 rounded font-bold transition-all ${haasEnabled ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-gray-800 text-gray-400'}`}
                        >
                            HAAS: {haasEnabled ? 'ON' : 'OFF'}
                        </button>
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

            </div>
        </aside>

      </div>

      {/* --- MODALS --- */}
      <PythonCodeModal isOpen={showCode} onClose={() => setShowCode(false)} />
      
      {/* EXPORT MODAL */}
      {showExport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-dsp-panel border border-white/10 p-6 rounded-xl w-full max-w-sm shadow-2xl">
                  <h3 className="text-lg font-bold text-white mb-4">Export Stereo Mix</h3>
                  <div className="flex flex-col gap-3 mb-6">
                      <p className="text-xs text-gray-400 mb-2">Select Resolution:</p>
                      {[16, 24, 32].map((bit) => (
                          <button 
                            key={bit}
                            onClick={() => setExportFormat(bit as BitDepth)}
                            className={`p-3 rounded text-sm font-mono border text-left flex justify-between ${exportFormat === bit ? 'bg-dsp-accent/20 border-dsp-accent text-dsp-accent' : 'bg-black/20 border-white/5 text-gray-400'}`}
                          >
                              <span>{bit}-bit {bit === 32 ? 'Float' : 'PCM'} WAV</span>
                              {exportFormat === bit && <span className="font-bold">✓</span>}
                          </button>
                      ))}
                  </div>
                  <div className="flex gap-3">
                      <button onClick={() => setShowExport(false)} className="flex-1 py-3 text-xs font-bold text-gray-400 hover:text-white border border-transparent hover:border-white/10 rounded">CANCEL</button>
                      <button 
                        onClick={handleExport}
                        disabled={playbackState === PlaybackState.EXPORTING}
                        className="flex-1 py-3 bg-dsp-accent text-white rounded font-bold text-xs hover:bg-dsp-accent/80 flex justify-center items-center shadow-lg shadow-dsp-accent/20"
                      >
                          {playbackState === PlaybackState.EXPORTING ? 'RENDERING...' : 'DOWNLOAD FILE'}
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default App;