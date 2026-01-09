import React, { useRef, useEffect } from 'react';

interface VisualizerProps {
  buffer: AudioBuffer | null;
  currentTime: number;
  duration: number;
  zoomLevel: number; // 1 (Full) to 10 (Zoomed)
  onSeek: (time: number) => void;
}

const Visualizer: React.FC<VisualizerProps> = ({ buffer, currentTime, duration, zoomLevel, onSeek }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Responsive Canvas
    const resizeObserver = new ResizeObserver(() => {
        if(canvas.parentElement) {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
            draw();
        }
    });
    resizeObserver.observe(canvas.parentElement!);
    
    // Draw Function
    const draw = () => {
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const width = canvas.width;
        const height = canvas.height;
        const channelHeight = height / 2;

        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, width, height);

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        for(let i=0; i<width; i+=width/10) { ctx.moveTo(i,0); ctx.lineTo(i,height); }
        ctx.moveTo(0, channelHeight); ctx.lineTo(width, channelHeight);
        ctx.stroke();

        if (!buffer) {
            // Empty State
            ctx.fillStyle = '#1e293b';
            ctx.font = '12px monospace';
            ctx.fillText('NO AUDIO LOADED', width/2 - 50, height/2 + 4);
            return;
        }

        // --- WAVEFORM DRAWING ---
        const drawChannel = (channelIdx: number, yOffset: number, color: string) => {
            const data = buffer.getChannelData(channelIdx);
            
            // Viewport Calculation
            // We want 'currentTime' to be centered if zoomed in? 
            // OR standard behavior: Show 'windowDuration' seconds.
            const windowDuration = duration / Math.max(1, zoomLevel);
            const startTime = Math.max(0, currentTime - (windowDuration / 2));
            const endTime = Math.min(duration, startTime + windowDuration);
            
            // Re-adjust start if we hit end
            const actualStartTime = endTime === duration ? Math.max(0, duration - windowDuration) : startTime;

            const startSample = Math.floor(actualStartTime * buffer.sampleRate);
            const endSample = Math.floor((actualStartTime + windowDuration) * buffer.sampleRate);
            const totalSamples = endSample - startSample;
            const samplesPerPixel = Math.max(1, Math.floor(totalSamples / width));

            ctx.fillStyle = color;
            ctx.beginPath();
            
            for (let i = 0; i < width; i++) {
                const start = startSample + (i * samplesPerPixel);
                if (start >= buffer.length) break;
                
                // Find min/max in this chunk (RMS-ish)
                let min = 1.0;
                let max = -1.0;
                for (let j = 0; j < samplesPerPixel; j++) {
                    const val = data[start + j];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
                
                // Draw vertical bar for this pixel
                const yMin = yOffset + (channelHeight/2) - (max * channelHeight/2 * 0.9);
                const yMax = yOffset + (channelHeight/2) - (min * channelHeight/2 * 0.9);
                
                ctx.rect(i, yMin, 1, Math.max(1, yMax - yMin));
            }
            ctx.fill();
        };

        drawChannel(0, 0, '#06b6d4'); // Left (Cyan)
        drawChannel(1, channelHeight, '#818cf8'); // Right (Indigo)

        // --- PLAYHEAD ---
        // Playhead position relative to view
        const windowDuration = duration / Math.max(1, zoomLevel);
        const startTime = Math.max(0, currentTime - (windowDuration / 2));
        const endTime = Math.min(duration, startTime + windowDuration);
        const actualStartTime = endTime === duration ? Math.max(0, duration - windowDuration) : startTime;

        const playheadRatio = (currentTime - actualStartTime) / windowDuration;
        const playheadX = playheadRatio * width;
        
        if (playheadX >= 0 && playheadX <= width) {
            ctx.strokeStyle = '#fbbf24'; // Amber
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(playheadX, 0);
            ctx.lineTo(playheadX, height);
            ctx.stroke();

            // Head
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.moveTo(playheadX - 6, 0);
            ctx.lineTo(playheadX + 6, 0);
            ctx.lineTo(playheadX, 8);
            ctx.fill();
        }
    };

    draw();
    
    // Animation loop just to keep playhead smooth during play
    let frameId: number;
    const animate = () => {
        draw();
        frameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
        resizeObserver.disconnect();
        cancelAnimationFrame(frameId);
    };

  }, [buffer, currentTime, duration, zoomLevel]);

  // Click to seek
  const handleClick = (e: React.MouseEvent) => {
      if(!buffer || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      
      const windowDuration = duration / Math.max(1, zoomLevel);
      const startTime = Math.max(0, currentTime - (windowDuration / 2));
      const endTime = Math.min(duration, startTime + windowDuration);
      const actualStartTime = endTime === duration ? Math.max(0, duration - windowDuration) : startTime;
      
      const clickTime = actualStartTime + (x / width) * windowDuration;
      onSeek(Math.max(0, Math.min(duration, clickTime)));
  };

  return (
    <div className="w-full h-full relative bg-black rounded-lg overflow-hidden border border-white/10 shadow-inner group">
        <canvas 
            ref={canvasRef} 
            className="block w-full h-full cursor-crosshair"
            onMouseDown={handleClick}
        />
        {/* Labels Overlay */}
        <div className="absolute top-2 left-2 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity">
             <div className="text-[10px] font-bold text-cyan-400 bg-black/80 px-1 rounded mb-1">LEFT CHANNEL</div>
        </div>
        <div className="absolute bottom-2 left-2 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity">
             <div className="text-[10px] font-bold text-indigo-400 bg-black/80 px-1 rounded">RIGHT CHANNEL (PROCESSED)</div>
        </div>
    </div>
  );
};

export default Visualizer;