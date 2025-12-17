import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Message, AppState, AppSettings, DEFAULT_SETTINGS } from './types';
import { encodeWAV, playAudio, getAudioContext, stopCurrentAudio } from './utils/audio';
import { sendVoiceMessage } from './utils/zhipu';
import { loadSettings, saveSettings, getActiveApiKey, applyTheme } from './utils/settings';
import { CharacterView } from './components/CharacterView';
import { SettingsPanel } from './components/SettingsPanel';
import { Mic, Loader2, Info, Settings2, Trash2, AlertCircle, ChevronUp, Send, X } from 'lucide-react';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [error, setError] = useState<string | null>(null);
  
  // Settings State
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Audio Refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // --- New Elastic Interaction Refs & State ---
  const isRecordingRef = useRef(false);
  const startYRef = useRef<number>(0);
  const startXRef = useRef<number>(0);
  
  // Physics State
  const [dragY, setDragY] = useState(0); // Vertical drag distance
  const [dragX, setDragX] = useState(0); // Horizontal drag distance (for cancel)
  const [isLaunched, setIsLaunched] = useState(false); // The "Throw" animation
  const [currentVolume, setCurrentVolume] = useState(0); // For pulsing effect

  // Thresholds
  const THROW_THRESHOLD = -80; // Pixels up to trigger send
  const CANCEL_THRESHOLD = 60; // Pixels sideways to trigger cancel

  // Load Settings on Mount
  useEffect(() => {
    const saved = loadSettings();
    setSettings(saved);
    applyTheme(saved.theme, saved.customCss);
  }, []);

  // Cleanup on Unmount
  useEffect(() => {
    return () => {
      stopRecordingLogic();
      stopCurrentAudio();
    };
  }, []);

  // Auto-scroll to bottom
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, appState]);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    applyTheme(newSettings.theme, newSettings.customCss);
  };

  const handleClearHistory = () => {
    stopCurrentAudio();
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setMessages([]);
    setAppState(AppState.IDLE);
  };

  // --- Core Recording Logic ---

  const startRecording = async () => {
    if (appState === AppState.PROCESSING) return;

    // Reset physics
    setDragY(0);
    setDragX(0);
    setIsLaunched(false);
    isRecordingRef.current = true;
    setCurrentVolume(0);

    // Haptic Start
    if (navigator.vibrate) navigator.vibrate(20);

    try {
      setError(null);
      stopCurrentAudio();
      audioQueueRef.current = [];
      isPlayingRef.current = false;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      const ctx = getAudioContext();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const bufferSize = 4096;
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      
      chunksRef.current = [];
      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(inputData));
        
        // Simple volume calculation for visual pulse
        let sum = 0;
        for (let i = 0; i < inputData.length; i += 100) { // Sample sparsely for perf
            sum += Math.abs(inputData[i]);
        }
        const avg = sum / (inputData.length / 100);
        setCurrentVolume(Math.min(avg * 5, 1)); // Normalize somewhat
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      
      processorRef.current = processor;
      setAppState(AppState.RECORDING);

    } catch (err: any) {
      setError("请允许麦克风权限以开始对话。");
      console.error(err);
      resetInteraction();
    }
  };

  const resetInteraction = () => {
    isRecordingRef.current = false;
    setAppState(AppState.IDLE);
    setDragY(0);
    setDragX(0);
    setIsLaunched(false);
    setCurrentVolume(0);
  };

  const stopRecordingLogic = () => {
    isRecordingRef.current = false;
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const stopRecordingAndSend = async () => {
    if (!isRecordingRef.current) return;
    
    stopRecordingLogic();
    setAppState(AppState.PROCESSING);

    const allChunks = chunksRef.current;
    
    if (allChunks.length < 3) {
        console.log("Audio too short.");
        setAppState(AppState.IDLE);
        return;
    }

    // Merge Audio
    const totalLength = allChunks.reduce((acc, curr) => acc + curr.length, 0);
    const mergedSamples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of allChunks) {
      mergedSamples.set(chunk, offset);
      offset += chunk.length;
    }

    const sampleRate = audioContextRef.current?.sampleRate || 24000;
    const wavBlob = encodeWAV(mergedSamples, sampleRate);

    // Optimistic UI
    const userMsg: Message = { role: 'user', isAudio: true, content: "..." };
    setMessages(prev => [...prev, userMsg]);

    try {
        let assistantContent = "";
        let assistantAudioId = "";
        const apiKey = getActiveApiKey(settings);
        
        let combinedSystemPrompt = settings.systemPrompt || "";
        if (settings.knowledgeBase?.trim()) {
          combinedSystemPrompt += `\n\n### 知识库/上下文信息 ###\n${settings.knowledgeBase}`;
        }
        
        const apiHistory = messages.slice(-6);

        await sendVoiceMessage(
            apiKey,
            wavBlob, 
            apiHistory, 
            combinedSystemPrompt,
            (textChunk, audioChunk, audioId) => {
                if (textChunk) assistantContent = textChunk;
                if (audioId) assistantAudioId = audioId;
                if (audioChunk) queueAudio(audioChunk);
            }
        );

        setMessages(prev => {
           const newHistory = [...prev];
           const lastIdx = newHistory.length - 1;
           if (lastIdx >= 0 && newHistory[lastIdx].role === 'user' && newHistory[lastIdx].content === "...") {
               newHistory[lastIdx].content = "语音消息";
           }
           newHistory.push({
               role: 'assistant',
               content: assistantContent || "Listening...",
               isAudio: true,
               audioId: assistantAudioId 
           });
           return newHistory;
        });

    } catch (err: any) {
        console.error(err);
        setError("连接错误: " + err.message);
        setAppState(AppState.ERROR);
    } finally {
        setIsLaunched(false); 
        setDragY(0);
        if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
             setAppState(AppState.IDLE);
        }
    }
  };

  const queueAudio = (base64Data: string) => {
    audioQueueRef.current.push(base64Data);
    if (!isPlayingRef.current) {
        playNextInQueue();
    }
  };

  const playNextInQueue = async () => {
    if (audioQueueRef.current.length === 0) {
        isPlayingRef.current = false;
        if (!isRecordingRef.current) {
            setAppState(AppState.IDLE);
        }
        return;
    }

    isPlayingRef.current = true;
    setAppState(AppState.PLAYING);
    
    const nextChunk = audioQueueRef.current.shift();
    if (nextChunk) {
        await playAudio(nextChunk, () => {
            playNextInQueue();
        });
    }
  };

  // --- Physics & Gestures ---

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || appState === AppState.PROCESSING) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    startYRef.current = e.clientY;
    startXRef.current = e.clientX;
    startRecording();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (appState !== AppState.RECORDING) return;
    
    const currentY = e.clientY;
    const currentX = e.clientX;
    
    // Add "resistance" to feel like rubber
    const diffY = (currentY - startYRef.current) * 0.8; 
    const diffX = (currentX - startXRef.current) * 0.6;
    
    // Allow dragging up (negative Y) freely, but dampen dragging down
    setDragY(diffY < 0 ? diffY : diffY * 0.3);
    setDragX(diffX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (appState !== AppState.RECORDING) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    const isCancel = Math.abs(dragX) > CANCEL_THRESHOLD;
    const isThrow = dragY < THROW_THRESHOLD;

    if (isCancel) {
        // Horizontal Swipe -> Cancel
        console.log("Canceled by horizontal swipe");
        resetInteraction();
        stopRecordingLogic();
        setMessages(prev => [...prev]); 
    } else if (isThrow) {
        // Vertical Swipe -> Send (Launch)
        setIsLaunched(true);
        if (navigator.vibrate) navigator.vibrate([30, 50]); // Double tap haptic
        setTimeout(() => stopRecordingAndSend(), 200); // Wait for animation start
    } else {
        // Released in place -> Cancel (Safe mode)
        console.log("Canceled: Released without throw");
        resetInteraction();
        stopRecordingLogic();
    }
  };

  // --- Visual Calculations ---
  
  // Calculate elastic transformation
  // 1. Translation: Follows finger
  // 2. Scale Y: Stretches when pulled up (1 + abs(dragY) / 500)
  // 3. Scale X: Thins when pulled up (1 - abs(dragY) / 1000)
  // 4. Volume Pulse: Adds to scale
  const stretchFactor = Math.max(0, -dragY) / 400;
  const volumeScale = 1 + (currentVolume * 0.3);
  
  const transformStyle = isLaunched 
    ? {} // Handled by CSS animation class
    : {
        transform: `
            translate(${dragX}px, ${dragY}px) 
            scale(${volumeScale - stretchFactor * 0.2}, ${volumeScale + stretchFactor})
        `
      };

  const isCanceling = Math.abs(dragX) > CANCEL_THRESHOLD;
  const isReadyToThrow = dragY < THROW_THRESHOLD;

  // Dynamic color for the blob
  let blobColorClass = 'bg-[var(--secondary-btn)]'; // Idle
  if (appState === AppState.RECORDING) {
      if (isCanceling) blobColorClass = 'bg-gray-400';
      else if (isReadyToThrow) blobColorClass = 'bg-[var(--primary-btn)] shadow-[0_0_30px_rgba(243,112,112,0.6)]';
      else blobColorClass = 'bg-[var(--primary-btn)]';
  }

  return (
    <div className="w-full h-[100dvh] bg-[var(--bg-color)] flex justify-center selection:bg-[var(--primary-btn)] selection:text-white transition-colors duration-300 overflow-hidden touch-none">
      
      <div className="w-full max-w-[640px] flex flex-col h-full relative shadow-2xl">
        
        {/* Background Decor */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-50">
            <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-200/40 rounded-[40%_60%_70%_30%/40%_50%_60%_50%] blur-3xl animate-[spin_20s_linear_infinite]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-orange-200/40 rounded-[60%_40%_30%_70%/60%_30%_70%_40%] blur-3xl animate-[spin_15s_linear_infinite_reverse]" />
        </div>

        {/* Header */}
        <header className="z-20 w-full flex justify-between items-center p-4 shrink-0 bg-transparent">
          <div className="flex items-center gap-2 clay-card px-3 py-1.5 rounded-full bg-[var(--bg-color)]/80 backdrop-blur-sm">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[var(--primary-btn)] to-[#E55050] flex items-center justify-center shadow-inner text-white font-bold text-xs">
                  G
              </div>
              <h1 className="text-base font-bold font-[inherit] text-[var(--text-color)]">东里二丫</h1>
          </div>
          
          <button 
              onClick={handleClearHistory}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-color)]/50 backdrop-blur-sm hover:bg-black/5 text-[var(--text-color)] opacity-60 transition-colors"
              title="清空对话"
          >
              <Trash2 className="w-4 h-4" />
          </button>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col items-center w-full z-10 overflow-hidden relative">
          
          {/* Character View */}
          <div className="w-full shrink-0 flex justify-center pt-2 pb-6 z-20">
             <CharacterView 
                state={appState} 
                avatarImageUrl={settings.avatarImageUrl} 
                avatarVideoUrl={settings.avatarVideoUrl}
             />
          </div>

          {/* Chat List */}
          <div className="w-full flex-1 relative overflow-hidden">
             {/* Top Fade Mask */}
             <div className="absolute top-0 left-0 w-full h-12 bg-gradient-to-b from-[var(--bg-color)] to-transparent z-10 pointer-events-none" />

             <div 
                ref={scrollRef}
                className="w-full h-full overflow-y-auto px-4 pb-32 pt-4 scrollbar-hide flex flex-col items-center gap-4"
             >
                {messages.length === 0 && (
                    <div className="text-center text-[var(--text-color)] opacity-40 text-sm mt-4 select-none flex flex-col items-center gap-2 animate-slide-up">
                        <p>我是二丫，村里有啥新鲜事？</p>
                        <div className="flex items-center gap-2 text-xs opacity-70 mt-2 bg-white/30 px-3 py-1 rounded-full backdrop-blur-sm">
                            <span className="font-bold">按住我</span>
                            <span>→</span>
                            <span className="font-bold">向上扔</span>
                        </div>
                    </div>
                )}
                
                {messages.map((msg, idx) => (
                    <div 
                        key={idx} 
                        className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
                    >
                        <div className={`
                            max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm
                            ${msg.role === 'user' 
                                ? 'bg-[var(--primary-btn)] text-white rounded-tr-none' 
                                : 'bg-[var(--bg-color)] clay-card rounded-tl-none border border-white/50'
                            }
                        `}>
                            {msg.content}
                        </div>
                    </div>
                ))}

                {error && (
                    <div className="clay-card bg-[var(--error-color)] border-l-4 border-[var(--error-border)] p-3 flex items-start gap-2 w-full animate-bounce-in mt-2">
                        <AlertCircle className="w-5 h-5 text-[var(--error-border)] shrink-0" />
                        <p className="text-xs opacity-80 text-[var(--text-color)]">{error}</p>
                    </div>
                )}
             </div>
          </div>
        </main>

        {/* Footer Interaction Zone */}
        <footer className="absolute bottom-0 left-0 w-full z-30 p-0 flex flex-col items-center justify-end pointer-events-none">
          
          {/* Action Hints (Dynamic based on drag) */}
          <div className={`absolute bottom-32 w-full flex justify-center transition-all duration-300 pointer-events-none ${appState === AppState.RECORDING ? 'opacity-100' : 'opacity-0 translate-y-10'}`}>
              
              {/* Cancel Hint (Left/Right) */}
              <div className={`absolute transition-all duration-300 flex items-center gap-2
                  ${isCanceling ? 'scale-110 opacity-100 text-gray-500' : 'scale-90 opacity-40 text-gray-400'}`}
                  style={{ transform: `translateX(${dragX * 0.5}px)` }}
              >
                  <X className="w-6 h-6" />
                  <span className="text-sm font-bold">松手取消</span>
              </div>

              {/* Send Hint (Up) */}
              {!isCanceling && (
                  <div className={`absolute -top-10 transition-all duration-300 flex flex-col items-center gap-1
                      ${isReadyToThrow ? 'scale-110 opacity-100 text-[var(--primary-btn)]' : 'scale-90 opacity-40 text-[var(--text-color)]'}`}
                  >
                      <ChevronUp className="w-8 h-8 animate-bounce" />
                      <span className="text-sm font-bold tracking-widest">松手发送</span>
                  </div>
              )}
          </div>

          <div className="pointer-events-auto w-full h-32 relative flex justify-center items-center bg-gradient-to-t from-[var(--bg-color)] via-[var(--bg-color)]/95 to-transparent">
            
            {/* Settings Button */}
            <button 
                onClick={() => setIsSettingsOpen(true)}
                className={`absolute left-6 bottom-8 clay-btn w-10 h-10 bg-[var(--bg-color)] text-[var(--text-color)] transition-all duration-300
                    ${appState === AppState.RECORDING ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}
            >
                <Settings2 className="w-5 h-5 opacity-70" />
            </button>

            {/* THE ELASTIC BUTTON / BLOB */}
            <button
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onContextMenu={(e) => e.preventDefault()}
                disabled={appState === AppState.PROCESSING}
                style={transformStyle}
                className={`
                    relative w-20 h-20 rounded-full flex items-center justify-center 
                    transition-[background-color,box-shadow,border-radius] duration-200 
                    will-change-transform cursor-grab active:cursor-grabbing z-50
                    ${blobColorClass}
                    ${appState === AppState.RECORDING ? 'shadow-2xl animate-liquid' : 'clay-btn bg-[var(--secondary-btn)] hover:bg-white hover:scale-105 active:scale-95'}
                    ${isLaunched ? 'animate-launch' : ''}
                    ${appState === AppState.PROCESSING ? 'opacity-50 cursor-wait' : ''}
                `}
            >
                {/* Internal Icon & Visuals */}
                <div className="relative z-10 pointer-events-none transition-all duration-200">
                    {appState === AppState.RECORDING ? (
                        isReadyToThrow ? (
                            <Send className="w-8 h-8 text-white rotate-[-45deg] animate-pulse" />
                        ) : isCanceling ? (
                            <X className="w-8 h-8 text-white" />
                        ) : (
                           /* Visualizer Bars */
                           <div className="flex gap-1 items-end h-6">
                              {[1,2,3].map(i => (
                                  <div key={i} 
                                       className="w-1.5 bg-white/80 rounded-full transition-all duration-75" 
                                       style={{ height: `${4 + currentVolume * 20 * (i % 2 === 0 ? 1 : 0.7)}px`}} 
                                  />
                              ))}
                           </div>
                        )
                    ) : appState === AppState.PROCESSING ? (
                        <Loader2 className="w-8 h-8 text-[var(--accent-color)] animate-spin" />
                    ) : (
                        <Mic className={`w-8 h-8 ${appState === AppState.PLAYING ? 'text-[var(--success-color)]' : 'text-[var(--primary-btn)]'}`} />
                    )}
                </div>

                {/* Ripple Ring on Press */}
                {appState === AppState.RECORDING && !isLaunched && (
                    <div className="absolute inset-0 border-4 border-white/30 rounded-full animate-ripple pointer-events-none" />
                )}
            </button>

            {/* Info Icon */}
            <div className={`absolute right-6 bottom-8 pointer-events-none opacity-50 hidden sm:block transition-opacity
                 ${appState === AppState.RECORDING ? 'opacity-0' : 'opacity-50'}`}>
                 <Info className="w-5 h-5 text-[var(--text-color)]" />
            </div>

          </div>
          
          <div className="absolute bottom-2 text-[10px] text-[var(--text-color)] opacity-30 font-semibold select-none pb-2">
             数字小村官 - 二丫
          </div>
        </footer>

        <SettingsPanel 
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSave={handleSaveSettings}
        />
      </div>
    </div>
  );
}