import React, { useRef, useEffect, useState } from 'react';
import { AppState } from '../types';
import { Sparkles, Mic, Volume2, Loader2, Smile } from 'lucide-react';

interface CharacterViewProps {
  state: AppState;
  avatarImageUrl: string;
  avatarVideoUrl: string;
}

export const CharacterView: React.FC<CharacterViewProps> = ({ state, avatarImageUrl, avatarVideoUrl }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [imgSrc, setImgSrc] = useState(avatarImageUrl);
  
  const isTalking = state === AppState.PLAYING;

  // Sync prop changes to local state
  useEffect(() => {
    setImgSrc(avatarImageUrl);
  }, [avatarImageUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !avatarVideoUrl) return;

    if (isTalking) {
      video.play().catch(e => console.warn("Autoplay prevented", e));
      setIsPlaying(true);
    } else {
      video.pause();
      video.currentTime = 0;
      setIsPlaying(false);
    }
  }, [isTalking, avatarVideoUrl]);

  // Determine status label and icon
  let statusText = "";
  let StatusIcon = Smile;
  let statusColor = "bg-white/80 text-[var(--text-color)]";

  switch (state) {
    case AppState.IDLE:
      statusText = "随时待命";
      StatusIcon = Smile;
      break;
    case AppState.RECORDING:
      statusText = "我在听...";
      StatusIcon = Mic;
      statusColor = "bg-[var(--primary-btn)]/90 text-white";
      break;
    case AppState.PROCESSING:
      statusText = "思考中...";
      StatusIcon = Loader2;
      statusColor = "bg-[var(--accent-color)]/90 text-white";
      break;
    case AppState.PLAYING:
      statusText = "正在说...";
      StatusIcon = Volume2;
      statusColor = "bg-[var(--success-color)]/90 text-[var(--text-color)]";
      break;
    case AppState.ERROR:
      statusText = "出错了";
      statusColor = "bg-[var(--error-color)] text-[var(--error-border)]";
      break;
  }

  return (
    <div className="relative flex flex-col items-center group">
      {/* Container with Mask for blurred edges */}
      <div 
        className="relative w-48 h-64 sm:w-56 sm:h-72 transition-all duration-500"
        style={{
          // Use CSS Mask to create the "fade out edges" effect
          maskImage: 'radial-gradient(ellipse at center, black 60%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 60%, transparent 100%)'
        }}
      >
        {/* Background/Base */}
        <div className="absolute inset-0 bg-[var(--shadow-dark)] opacity-10 rounded-full blur-xl transform scale-90 translate-y-4" />

        {/* Audio Waveform Animation (Subtle Overlay) */}
        {isTalking && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
             {[...Array(3)].map((_, i) => (
               <div 
                 key={i} 
                 className="absolute border-[1.5px] border-white/40 rounded-full animate-ping"
                 style={{ 
                   width: '40%',
                   height: '30%',
                   animationDuration: '2s',
                   animationDelay: `${i * 0.6}s` 
                 }} 
               />
             ))}
          </div>
        )}

        {/* 1. Static Idle Image */}
        <div className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${isPlaying && avatarVideoUrl ? 'opacity-0' : 'opacity-100'} z-10`}>
          <img 
            src={imgSrc} 
            alt="Character Idle"
            className="w-full h-full object-cover rounded-[3rem]"
            onError={() => {
              // Fallback if the user provided link is not a valid image
              setImgSrc('https://images.unsplash.com/photo-1629747490241-624f07d7081c?q=80&w=800&auto=format&fit=crop');
            }}
          />
        </div>

        {/* 2. Talking Video Layer */}
        {avatarVideoUrl && (
          <video
            ref={videoRef}
            src={avatarVideoUrl}
            loop
            muted
            playsInline
            className={`absolute inset-0 w-full h-full object-cover rounded-[3rem] transition-opacity duration-700 ease-in-out ${isPlaying ? 'opacity-100' : 'opacity-0'} z-20`}
          />
        )}
      </div>

      {/* Floating Status Bubble - Positioned overlapping the bottom */}
      <div className={`
        absolute -bottom-3 z-40
        flex items-center gap-1.5 px-4 py-1.5 
        rounded-full shadow-lg backdrop-blur-md
        transition-all duration-300 transform
        ${statusColor}
        ${state === AppState.PROCESSING ? 'scale-105' : 'scale-100'}
      `}>
        <StatusIcon className={`w-3.5 h-3.5 ${state === AppState.PROCESSING ? 'animate-spin' : ''}`} />
        <span className="text-xs font-bold tracking-wide">{statusText}</span>
      </div>
    </div>
  );
};