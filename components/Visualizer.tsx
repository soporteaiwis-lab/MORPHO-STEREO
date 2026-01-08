import React, { useRef, useEffect } from 'react';
import { audioEngine } from '../services/audioEngine';

interface VisualizerProps {
  isPlaying: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive canvas
    const resizeCanvas = () => {
        const parent = canvas.parentElement;
        if(parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const bufferLength = 1024; // Half of fftSize
    const dataArrayL = new Uint8Array(bufferLength);
    const dataArrayR = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isPlaying) {
         // Clear or dim effect when stopped
         ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
         ctx.fillRect(0, 0, canvas.width, canvas.height);
         
         // Draw idle line
         ctx.beginPath();
         ctx.strokeStyle = '#1e293b';
         ctx.moveTo(0, canvas.height / 2);
         ctx.lineTo(canvas.width, canvas.height / 2);
         ctx.stroke();

         animationRef.current = requestAnimationFrame(draw);
         return;
      }

      audioEngine.getAnalysisData(dataArrayL, dataArrayR);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      const height = canvas.height;
      const centerY = height / 2;

      for (let i = 0; i < bufferLength; i++) {
        // Logarithmic scaling for x-axis looks better for audio but linear is easier for simple bars
        // Using simple linear here for prototype
        
        // Left Channel (Top, Cyan)
        const vL = dataArrayL[i] / 255.0;
        const hL = vL * (height / 2) * 1.5; // Gain visual boost

        // Right Channel (Bottom, Magenta/Secondary)
        const vR = dataArrayR[i] / 255.0;
        const hR = vR * (height / 2) * 1.5;

        // Mirror Left up
        ctx.fillStyle = `rgba(14, 165, 233, ${vL + 0.1})`; // Cyan
        ctx.fillRect(x, centerY - 1 - hL, barWidth, hL);

        // Mirror Right down
        ctx.fillStyle = `rgba(99, 102, 241, ${vR + 0.1})`; // Indigo/Purple
        ctx.fillRect(x, centerY + 1, barWidth, hR);

        x += barWidth + 1;
      }
      
      // Draw center line
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(canvas.width, centerY);
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying]);

  return (
    <div className="w-full h-full relative bg-dsp-dark rounded-xl overflow-hidden shadow-inner border border-white/5">
        <canvas ref={canvasRef} className="block w-full h-full" />
        <div className="absolute top-2 left-3 text-[10px] font-mono text-cyan-400 opacity-50">LEFT CHANNEL (CYAN)</div>
        <div className="absolute bottom-2 left-3 text-[10px] font-mono text-indigo-400 opacity-50">RIGHT CHANNEL (INDIGO)</div>
    </div>
  );
};

export default Visualizer;