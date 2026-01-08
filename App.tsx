import React, { useState, useRef, useEffect } from 'react';
import { audioEngine } from './services/audioEngine';
import BandControl from './components/BandControl';
import Visualizer from './components/Visualizer';
import PythonCodeModal from './components/PythonCodeModal';
import PhaseMeter from './components/PhaseMeter';
import { BandConfig, PlaybackState } from './types';
import { PlayIcon, PauseIcon, StopIcon, UploadIcon, CodeIcon, ShieldCheckIcon, CompareIcon } from './icons';

const INITIAL_BANDS: BandConfig[] = [
  { id: 'low', name: 'Low / Bass', frequencyRange: '< 250 Hz', pan: 0, color: '#ef4444', gain: 1 },
  { id: 'mid-low', name: 'Low Mids', frequencyRange: '250 Hz - 2 kHz', pan: -0.3, color: '#eab308', gain: 1 },
  { id: 'mid-high', name: 'High Mids', frequencyRange: '2 kHz - 8 kHz', pan: 0.3, color: '#10b981', gain: 1 },
  { id: 'high', name: 'High / Air', frequencyRange: '> 8 kHz', pan: 0.1, color: '#0ea5e9', gain: 1 },
];

const App = () => {
  // State
  const [bands, setBands] = useState<BandConfig[]>(INITIAL_BANDS);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.IDLE);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  
  // Dashboard Controls
  const [haasEnabled, setHaasEnabled] = useState(false);
  const [monoSafeMode, setMonoSafeMode] = useState(true);
  const [bypass, setBypass] = useState(false);
  const [masterWidth, setMasterWidth] = useState(1.0); // 0 to 1

  // Monitoring
  const [correlation, setCorrelation] = useState(1);
  const [autoCorrecting, setAutoCorrecting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Monitoring Loop
  useEffect(() => {
    let animationId: number;
    let correctionCooldown = 0;

    const loop = () => {
        if (playbackState === PlaybackState.PLAYING) {
            const currCorr = audioEngine.getPhaseCorrelation();
            setCorrelation(prev => prev * 0.9 + currCorr * 0.1); // Smooth

            // MONO SAFE MODE LOGIC
            if (monoSafeMode && !bypass && currCorr < 0 && correctionCooldown <= 0) {
                // Emergency Correction
                console.warn("Mono Safe Mode: Correcting Phase.");
                
                // 1. Disable Haas if active
                if (haasEnabled) {
                    setHaasEnabled(false);
                    audioEngine.setHaasState(false);
                }

                // 2. Reduce Width slightly (by 5%)
                if (masterWidth > 0.5) {
                    const newWidth = Math.max(0.5, masterWidth * 0.95);
                    setMasterWidth(newWidth);
                    audioEngine.setGlobalWidth(newWidth);
                }

                setAutoCorrecting(true);
                correctionCooldown = 60; // 1 sec cooldown
                setTimeout(() => setAutoCorrecting(false), 1000);
            }

            if (correctionCooldown > 0) correctionCooldown--;
        }
        animationId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationId);
  }, [playbackState, haasEnabled, monoSafeMode, bypass, masterWidth]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setPlaybackState(PlaybackState.LOADING);
      setFileName(file.name);
      try {
        await audioEngine.loadAudio(file);
        setPlaybackState(PlaybackState.IDLE);
      } catch (error) {
        setFileName("Error loading file");
        setPlaybackState(PlaybackState.IDLE);
      }
    }
  };

  const togglePlay = () => {
    if (playbackState === PlaybackState.PLAYING) {
      audioEngine.pause();
      setPlaybackState(PlaybackState.PAUSED);
    } else if (playbackState === PlaybackState.IDLE || playbackState === PlaybackState.PAUSED) {
      // Sync State
      audioEngine.setHaasState(haasEnabled);
      audioEngine.setBypass(bypass);
      audioEngine.setGlobalWidth(masterWidth);

      if (playbackState === PlaybackState.IDLE) {
          audioEngine.play(bands, () => setPlaybackState(PlaybackState.IDLE));
      } else {
          audioEngine.resume();
      }
      setPlaybackState(PlaybackState.PLAYING);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    setPlaybackState(PlaybackState.IDLE);
    setCorrelation(1);
  };

  const handlePanChange = (id: string, newPan: number) => {
    setBands(prev => prev.map(b => b.id === id ? { ...b, pan: newPan } : b));
    audioEngine.updateBandPan(id, newPan);
  };

  const handleWidthChange = (val: number) => {
      setMasterWidth(val);
      audioEngine.setGlobalWidth(val);
  };

  const toggleBypass = () => {
      const newState = !bypass;
      setBypass(newState);
      audioEngine.setBypass(newState);
  };

  return (
    <div className="min-h-screen bg-dsp-dark text-white font-sans flex flex-col items-center py-8 px-4">
      {/* Header */}
      <header className="max-w-6xl w-full flex justify-between items-end mb-6 border-b border-white/10 pb-4">
        <div>
            <h1 className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-dsp-accent to-dsp-secondary mb-2">
            MorphoStereo
            </h1>
            <p className="text-dsp-muted text-sm font-mono flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${playbackState === PlaybackState.PLAYING ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></span>
                DASHBOARD CONTROL v1.0
            </p>
        </div>
        <button 
            onClick={() => setShowCode(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-dsp-accent bg-dsp-accent/10 hover:bg-dsp-accent/20 rounded border border-dsp-accent/20 transition-all"
        >
            <CodeIcon className="w-5 h-5" />
            VIEW PYTHON KERNEL
        </button>
      </header>

      <main className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT: File & Player (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
             {/* Upload Card */}
             <div className="bg-dsp-panel rounded-xl p-6 border border-white/5 shadow-lg">
                <h2 className="text-xs font-bold text-gray-500 uppercase mb-4 tracking-widest">1. Audio Source</h2>
                <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleFileUpload} />
                
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-24 rounded-lg bg-dsp-dark border-2 border-dashed border-white/10 hover:border-dsp-accent/50 group transition-all flex flex-col items-center justify-center gap-2 mb-4"
                >
                    <UploadIcon className="w-8 h-8 text-gray-400 group-hover:text-dsp-accent" />
                    <span className="text-xs font-medium text-gray-400 group-hover:text-white">
                        {fileName ? fileName : "Click to Upload Mono File"}
                    </span>
                </button>

                {/* Player Controls */}
                <div className="flex items-center justify-center gap-6 mt-2">
                    <button 
                         onClick={handleStop}
                         disabled={!fileName}
                         className="p-3 rounded-full bg-dsp-dark border border-white/10 text-gray-400 hover:text-red-400 transition-colors"
                    >
                        <StopIcon className="w-6 h-6" />
                    </button>
                    <button 
                        onClick={togglePlay}
                        disabled={!fileName || playbackState === PlaybackState.LOADING}
                        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl ${
                            !fileName ? 'bg-gray-700 text-gray-500' : 'bg-dsp-accent text-white hover:scale-105'
                        }`}
                    >
                        {playbackState === PlaybackState.PLAYING ? <PauseIcon className="w-8 h-8" /> : <PlayIcon className="w-8 h-8 ml-1" />}
                    </button>
                </div>
             </div>

             {/* Global Dashboard Controls */}
             <div className="bg-dsp-panel rounded-xl p-6 border border-white/5 shadow-lg flex-1">
                <h2 className="text-xs font-bold text-gray-500 uppercase mb-6 tracking-widest">2. Global Controls</h2>
                
                {/* Master Width Slider */}
                <div className="mb-8">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-gray-200">Stereo Width</span>
                        <span className="text-xs font-mono text-dsp-accent">{Math.round(masterWidth * 100)}%</span>
                    </div>
                    <input 
                        type="range" min="0" max="1" step="0.01"
                        value={masterWidth}
                        onChange={(e) => handleWidthChange(parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:bg-dsp-accent"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500 mt-1 uppercase">
                        <span>Mono</span>
                        <span>Wide</span>
                    </div>
                </div>

                {/* Toggles */}
                <div className="flex flex-col gap-3">
                    {/* Mono Safe Mode */}
                    <button 
                        onClick={() => setMonoSafeMode(!monoSafeMode)}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-all ${monoSafeMode ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-dsp-dark border-white/10'}`}
                    >
                        <div className="flex items-center gap-3">
                            <ShieldCheckIcon className={`w-5 h-5 ${monoSafeMode ? 'text-emerald-400' : 'text-gray-500'}`} />
                            <div className="text-left">
                                <div className={`text-sm font-bold ${monoSafeMode ? 'text-emerald-400' : 'text-gray-400'}`}>Mono Safe Mode</div>
                                <div className="text-[10px] text-gray-500">Auto-corrects phase issues</div>
                            </div>
                        </div>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${monoSafeMode ? 'bg-emerald-500' : 'bg-gray-600'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${monoSafeMode ? 'left-4.5' : 'left-0.5'}`} style={{left: monoSafeMode ? '1.1rem' : '0.15rem'}}></div>
                        </div>
                    </button>

                    {/* Compare / Bypass */}
                    <button 
                        onClick={toggleBypass}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-all ${bypass ? 'bg-orange-900/20 border-orange-500/50' : 'bg-dsp-dark border-white/10'}`}
                    >
                        <div className="flex items-center gap-3">
                            <CompareIcon className={`w-5 h-5 ${bypass ? 'text-orange-400' : 'text-gray-500'}`} />
                            <div className="text-left">
                                <div className={`text-sm font-bold ${bypass ? 'text-orange-400' : 'text-gray-400'}`}>Bypass (Compare)</div>
                                <div className="text-[10px] text-gray-500">Input Mono vs Output Stereo</div>
                            </div>
                        </div>
                        <div className={`px-2 py-1 rounded text-[10px] font-bold ${bypass ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400'}`}>
                            {bypass ? 'DRY' : 'WET'}
                        </div>
                    </button>
                </div>
             </div>
        </div>

        {/* MIDDLE: Visualizer (5 cols) */}
        <div className="lg:col-span-5 flex flex-col h-full">
            <div className="bg-black/40 rounded-2xl p-2 border border-white/5 relative flex-1 min-h-[400px]">
                <Visualizer isPlaying={playbackState === PlaybackState.PLAYING} />
                
                {/* Overlays */}
                <div className="absolute top-4 right-4 flex flex-col gap-2">
                    {bypass && (
                        <div className="px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded shadow-lg animate-pulse">
                            BYPASS ACTIVE
                        </div>
                    )}
                    {autoCorrecting && (
                        <div className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded shadow-lg animate-bounce">
                            CORRECTING PHASE
                        </div>
                    )}
                </div>

                <div className="absolute bottom-4 left-4 right-4 bg-black/60 p-3 rounded-lg backdrop-blur-md border border-white/10">
                    <PhaseMeter correlation={correlation} isCritical={autoCorrecting} />
                </div>
            </div>
        </div>

        {/* RIGHT: Band Faders (3 cols) */}
        <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-dsp-panel rounded-xl p-4 border border-white/5 h-full overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">3. Spectral Faders</h2>
                    <button 
                        onClick={() => {
                            setHaasEnabled(!haasEnabled);
                            audioEngine.setHaasState(!haasEnabled);
                        }}
                        className={`text-[10px] px-2 py-1 rounded font-bold transition-colors ${haasEnabled ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-400'}`}
                    >
                        HAAS: {haasEnabled ? 'ON' : 'OFF'}
                    </button>
                </div>

                <div className="flex flex-col gap-3">
                    {bands.map(band => (
                        <BandControl 
                            key={band.id} 
                            band={band} 
                            onChangePan={handlePanChange} 
                        />
                    ))}
                </div>

                <div className="mt-6 p-4 rounded bg-white/5 border border-white/5 text-xs text-gray-400">
                    <p>Adjust individual frequency bands to sculpt the stereo image. Use the <strong>Master Width</strong> slider to scale the overall effect.</p>
                </div>
            </div>
        </div>

      </main>

      <PythonCodeModal isOpen={showCode} onClose={() => setShowCode(false)} />
    </div>
  );
};

export default App;