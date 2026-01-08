
import React, { useRef, useEffect } from 'react';
import { audioEngine } from '../services/audioEngine';

interface VisualizerProps {
  isPlaying: boolean;
  zoomLevel: number; // 1 to 5
  amplitudeScale: number; // 0.5 to 3
}

const Visualizer: React.FC<VisualizerProps> = ({ isPlaying, zoomLevel, amplitudeScale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
        const parent = canvas.parentElement;
        if(parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const bufferLength = 2048; 
    const dataL = new Float32Array(bufferLength);
    const dataR = new Float32Array(bufferLength);

    const drawGrid = () => {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        
        // Vertical grid lines
        for(let i=0; i<canvas.width; i+=50) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
        }
        // Horizontal grid lines
        for(let i=0; i<canvas.height; i+=50) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
        }
        
        // Center separation line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height/2);
        ctx.lineTo(canvas.width, canvas.height/2);
        ctx.stroke();
    };

    const drawWave = (data: Float32Array, offsetY: number, height: number, color: string) => {
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        
        const step = Math.max(1, Math.ceil(bufferLength / canvas.width));
        // Apply Zoom to X axis by changing how much of buffer we draw
        const visibleSamples = Math.floor(bufferLength / zoomLevel);
        const samplesPerPixel = visibleSamples / canvas.width;
        
        for (let i = 0; i < canvas.width; i++) {
            const index = Math.floor(i * samplesPerPixel);
            if(index >= bufferLength) break;
            
            const v = data[index] * amplitudeScale; // Amplitude Zoom
            const y = offsetY + (height / 2) - (v * height / 2);
            
            if (i === 0) ctx.moveTo(i, y);
            else ctx.lineTo(i, y);
        }
        ctx.stroke();
    }

    const render = () => {
        audioEngine.getFloatTimeDomainData(dataL, dataR);
        
        ctx.fillStyle = '#020617'; // Very dark slate
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        drawGrid();

        const channelHeight = canvas.height / 2;

        // Draw Left (Top)
        drawWave(dataL, 0, channelHeight, '#06b6d4'); // Cyan

        // Draw Right (Bottom)
        drawWave(dataR, channelHeight, channelHeight, '#818cf8'); // Indigo

        if (isPlaying) {
            animationRef.current = requestAnimationFrame(render);
        }
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, zoomLevel, amplitudeScale]);

  return (
    <div className="w-full h-full relative bg-black rounded-lg overflow-hidden border border-white/10 shadow-2xl">
        <canvas ref={canvasRef} className="block w-full h-full" />
        
        {/* Labels */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 backdrop-blur rounded text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
            L (INPUT/PROCESSED)
        </div>
        <div className="absolute top-[52%] left-2 px-2 py-1 bg-black/50 backdrop-blur rounded text-[10px] font-bold text-indigo-400 border border-indigo-500/30">
            R (STEREO FIELD)
        </div>
    </div>
  );
};

export default Visualizer;
