/**
 * Converts Float32Array PCM data to WAV file format (Blob)
 */
export const encodeWAV = (samples: Float32Array, sampleRate: number): Blob => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + samples.length * 2, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count (mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sampleRate * blockAlign)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, samples.length * 2, true);

  // Write the PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
};

/**
 * Helper to convert Blob to Base64
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Depending on how blob is read, it might contain the data URL prefix
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Audio Context Manager
 */
let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

export const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000, // Suggest 24k for compatibility
    });
  }
  return audioContext;
};

export const stopCurrentAudio = () => {
  if (currentSource) {
    try {
      currentSource.stop();
      currentSource.disconnect();
    } catch (e) {
      // ignore errors if already stopped
    }
    currentSource = null;
  }
};

export const playAudio = async (base64Data: string, onEnded: () => void) => {
  try {
    const ctx = getAudioContext();

    // CRITICAL: Resume context if suspended (common in browsers before user interaction)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Stop any currently playing audio to prevent overlap
    stopCurrentAudio();

    // Clean Base64 string (remove data URI scheme if present)
    const cleanBase64 = base64Data.split(',').pop() || base64Data;
    
    // Decode Base64 to ArrayBuffer
    const binaryString = atob(cleanBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decode Audio Data
    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

    // Create Source
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    source.onended = () => {
      currentSource = null;
      onEnded();
    };

    currentSource = source;
    source.start(0);

  } catch (error) {
    console.error("Audio Playback Failed:", error);
    // Ensure onEnded is called so the queue continues/clears
    onEnded();
  }
};