import React, { useEffect, useRef } from 'react';
import { AppState } from '../types';

interface OrbProps {
  state: AppState;
  volume: number; // 0 to 1
}

export const Orb: React.FC<OrbProps> = ({ state, volume }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      timeRef.current += 0.05;
      
      const { width, height } = canvas.getBoundingClientRect();
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);

      // Claymorphism Pastel Palette
      let baseR = 167, baseG = 217, baseB = 243; // Baby Blue (Idle)
      let activeVolume = 0.1; 
      let speed = 1;

      if (state === AppState.RECORDING) {
        // Glaze Red #F37070
        baseR = 243; baseG = 112; baseB = 112; 
        activeVolume = Math.max(0.2, volume * 3);
        speed = 2;
      } else if (state === AppState.PROCESSING) {
        // Lavender #DBA7F3
        baseR = 219; baseG = 167; baseB = 243;
        activeVolume = 0.3 + Math.sin(timeRef.current) * 0.1;
        speed = 3;
      } else if (state === AppState.PLAYING) {
        // Mint #A7F3D0
        baseR = 167; baseG = 243; baseB = 208;
        activeVolume = Math.max(0.3, volume * 1.5);
        speed = 1.5;
      }

      const centerX = width / 2;
      const centerY = height / 2;
      const maxRadius = Math.min(width, height) * 0.35;
      
      // Draw Soft Clay-like Blobs
      for (let i = 0; i < 3; i++) {
        const layerOffset = i * 2;
        const radius = maxRadius * (0.8 + activeVolume * 0.2) - (i * 12);
        
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.1) {
          const noise = Math.sin(a * 4 + timeRef.current * speed + layerOffset) * (15 * activeVolume);
          const r = radius + noise;
          const x = centerX + Math.cos(a) * r;
          const y = centerY + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        // Soft matte fill
        const opacity = 0.8 - (i * 0.2);
        ctx.fillStyle = `rgba(${baseR}, ${baseG}, ${baseB}, ${opacity})`;
        ctx.fill();
        
        // Soft Shadow for depth
        if (i === 0) {
            ctx.shadowColor = `rgba(${baseR-50}, ${baseG-50}, ${baseB-50}, 0.3)`;
            ctx.shadowBlur = 20 + (activeVolume * 10);
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 4;
        } else {
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        }
        
        // Highlight (Simulate Glaze/Clay surface light)
        if (i === 1) {
             const grad = ctx.createRadialGradient(centerX - radius*0.3, centerY - radius*0.3, 5, centerX, centerY, radius);
             grad.addColorStop(0, `rgba(255, 255, 255, 0.4)`);
             grad.addColorStop(1, `rgba(255, 255, 255, 0)`);
             ctx.fillStyle = grad;
             ctx.fill();
        }
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, [state, volume]);

  return <canvas ref={canvasRef} className="w-64 h-64 md:w-80 md:h-80" />;
};