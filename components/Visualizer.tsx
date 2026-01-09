import React, { useRef, useEffect, useState } from 'react';

interface VisualizerProps {
  buffer: AudioBuffer | null;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

const Visualizer: React.FC<VisualizerProps> = ({ buffer, currentTime, duration, onSeek }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // View State
  const [zoom, setZoom] = useState(1); // 1 = Fit, >1 = Zoomed in
  const [scrollOffset, setScrollOffset] = useState(0); // 0 to 1 (percentage of scroll)
  const [isDragging, setIsDragging] = useState(false);
  const [lastX, setLastX] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    
    // Resize Logic
    const resizeObserver = new ResizeObserver(() => {
        if(containerRef.current) {
            canvas.width = containerRef.current.clientWidth;
            canvas.height = containerRef.current.clientHeight;
            draw();
        }
    });
    resizeObserver.observe(containerRef.current);
    
    const draw = () => {
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const width = canvas.width;
        const height = canvas.height;
        const channelHeight = height / 2;
        
        // Background
        ctx.fillStyle = '#0f172a'; // Deep dark blue/slate
        ctx.fillRect(0, 0, width, height);

        // Grid Lines
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Middle divider
        ctx.moveTo(0, channelHeight);
        ctx.lineTo(width, channelHeight);
        // Vertical grid
        const gridSize = width / 10;
        for(let i=0; i<width; i+=gridSize) {
            ctx.moveTo(i, 0); ctx.lineTo(i, height);
        }
        ctx.stroke();

        // Labels
        ctx.font = '10px monospace';
        ctx.fillStyle = '#06b6d4'; // Cyan Text
        ctx.fillText("L - ORIGINAL", 10, 20);
        ctx.fillStyle = '#d946ef'; // Magenta Text
        ctx.fillText("R - PROCESSED", 10, channelHeight + 20);

        if (!buffer) {
            ctx.fillStyle = '#475569';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('DROP AUDIO FILE HERE OR LOAD TO START', width/2, height/2);
            ctx.textAlign = 'left';
            return;
        }

        // --- WAVEFORM LOGIC ---
        // Visible Window Calculation
        const visibleDuration = duration / zoom;
        // The scrollOffset determines the start time based on what's hidden
        const maxStartTime = duration - visibleDuration;
        const startTime = maxStartTime * scrollOffset; 
        const endTime = startTime + visibleDuration;

        const drawChannel = (channelIdx: number, yOffset: number, color: string) => {
            const data = buffer.getChannelData(channelIdx);
            const sampleRate = buffer.sampleRate;
            
            const startSample = Math.floor(startTime * sampleRate);
            const endSample = Math.floor(endTime * sampleRate);
            const totalVisibleSamples = endSample - startSample;
            const samplesPerPixel = Math.max(1, Math.floor(totalVisibleSamples / width));

            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;

            // Optimization: Draw Min/Max per pixel (RMS style)
            for (let x = 0; x < width; x++) {
                const chunkStart = startSample + (x * samplesPerPixel);
                if (chunkStart >= data.length) break;

                let min = 1.0; 
                let max = -1.0;
                
                // Analyze chunk
                for (let j = 0; j < samplesPerPixel; j+=Math.max(1, Math.floor(samplesPerPixel/10))) { 
                    // slight skip for performance on huge zooms
                    const val = data[chunkStart + j];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
                
                // Sanity check
                if (min > max) min = max; 

                // Scale to height
                const h = channelHeight * 0.9; // 90% height padding
                const yTop = yOffset + (channelHeight/2) - (max * h/2);
                const yBottom = yOffset + (channelHeight/2) - (min * h/2);

                ctx.moveTo(x, yTop);
                ctx.lineTo(x, yBottom);
            }
            ctx.stroke();
        };

        // Draw Left (Cyan)
        drawChannel(0, 0, '#22d3ee'); 
        // Draw Right (Magenta)
        drawChannel(1, channelHeight, '#f0abfc');

        // --- PLAYHEAD ---
        if (currentTime >= startTime && currentTime <= endTime) {
            const ratio = (currentTime - startTime) / visibleDuration;
            const x = ratio * width;
            
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            
            // Triangle Head
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(x - 5, 0);
            ctx.lineTo(x + 5, 0);
            ctx.lineTo(x, 10);
            ctx.fill();
        }

        // --- SCROLLBAR (Mini Map) ---
        if (zoom > 1) {
            const barHeight = 6;
            const barY = height - barHeight;
            // Background
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(0, barY, width, barHeight);
            // Thumb
            const thumbWidth = width / zoom;
            const thumbX = scrollOffset * (width - thumbWidth);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(thumbX, barY, thumbWidth, barHeight);
        }
    };

    draw();

    // Animation Loop
    let frameId: number;
    const animate = () => {
        draw();
        frameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
        resizeObserver.disconnect();
        cancelAnimationFrame(frameId);
    }
  }, [buffer, currentTime, duration, zoom, scrollOffset]);

  // --- INTERACTION ---

  const handleWheel = (e: React.WheelEvent) => {
      // Zoom with wheel
      const delta = -e.deltaY * 0.001;
      setZoom(prev => Math.max(1, Math.min(20, prev + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      setIsDragging(true);
      setLastX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - lastX;
      setLastX(e.clientX);
      
      if (zoom > 1) {
          // Pan Logic
          const sensitivity = 0.002;
          setScrollOffset(prev => Math.max(0, Math.min(1, prev - (deltaX * sensitivity))));
      }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
      setIsDragging(false);
      
      // seek logic if it wasn't a drag
      if (Math.abs(e.clientX - lastX) < 5 && canvasRef.current) {
         const rect = canvasRef.current.getBoundingClientRect();
         const x = e.clientX - rect.left;
         const width = rect.width;
         
         const visibleDuration = duration / zoom;
         const maxStartTime = duration - visibleDuration;
         const startTime = maxStartTime * scrollOffset;
         
         const clickTime = startTime + (x / width) * visibleDuration;
         onSeek(Math.max(0, Math.min(duration, clickTime)));
      }
  };

  return (
    <div 
        ref={containerRef} 
        className="w-full h-full bg-slate-900 relative cursor-crosshair select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setIsDragging(false)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      <div className="absolute top-2 right-2 flex gap-2">
          <div className="bg-black/50 text-white text-[10px] px-2 py-1 rounded border border-white/10">
              ZOOM: {zoom.toFixed(1)}x
          </div>
      </div>
    </div>
  );
};

export default Visualizer;