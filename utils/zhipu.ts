import { blobToBase64 } from './audio';
import { Message } from '../types';

// Default key for fallback
export const DEFAULT_KEY = "966cec8673c747d9af68fd11ae5226f9.DufxR7EdpFZQmihL";

/**
 * Generates a JWT token for ZhipuAI authentication.
 */
export const generateToken = async (apiKey: string): Promise<string> => {
  const [id, secret] = apiKey.split('.');
  if (!id || !secret) throw new Error('Invalid API Key format');

  const now = Date.now();
  const header = { alg: 'HS256', sign_type: 'SIGN' };
  const payload = {
    api_key: id,
    exp: now + 3600 * 1000, 
    timestamp: now,
  };

  const encode = (obj: any) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const encodedHeader = encode(header);
  const encodedPayload = encode(payload);
  const data = `${encodedHeader}.${encodedPayload}`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, msgData);
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${encodedSignature}`;
};

/**
 * Sends audio to GLM-4-Voice.
 */
export const sendVoiceMessage = async (
  apiKey: string,
  audioBlob: Blob, 
  history: Message[],
  systemPrompt: string | undefined,
  onChunk: (text: string, audio?: string, audioId?: string) => void
) => {
  // Use provided key or fallback
  const token = await generateToken(apiKey || DEFAULT_KEY);
  const base64Audio = await blobToBase64(audioBlob);

  const messages = [];

  // 1. Add System Prompt if exists
  if (systemPrompt) {
      messages.push({
          role: "system",
          content: systemPrompt
      });
  }

  // 2. Add history
  // CRITICAL FIX: Zhipu GLM-4-Voice requires 'assistant' messages in history to have an 'audio.id' 
  // if they were part of a voice session. Text-only assistant messages can cause 1214 error in some contexts.
  // We only include assistant messages if we have the ID to be safe, or if it's purely text (though we avoid risking it).
  for (const msg of history) {
    if (msg.role === 'user') {
      if (msg.content && msg.content !== "..." && msg.content !== "语音消息") {
         messages.push({
           role: 'user',
           content: msg.content
         });
      }
    } else if (msg.role === 'assistant') {
      if (msg.audioId) {
        messages.push({
          role: 'assistant',
          audio: {
            id: msg.audioId
          }
        });
      } else {
        // If we don't have an audio ID for the assistant, skipping it is safer than sending text
        // which might trigger "audio.id cannot be empty" if the model expects voice context.
        // However, if we have explicit text content and want to risk it, we could. 
        // For stability: SKIP.
      }
    }
  }

  // 3. Add current audio input
  messages.push({
    role: 'user',
    content: [
      {
        type: "input_audio",
        input_audio: {
          data: base64Audio,
          format: "wav"
        }
      }
    ]
  });

  try {
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'glm-4-voice',
        messages: messages,
        stream: false 
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ZhipuAI API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (choice) {
      const text = choice.message?.content || "";
      // The API returns audio data in message.audio.data
      const audioData = choice.message?.audio?.data;
      // Capture the ID for future context
      const audioId = choice.message?.audio?.id || choice.id; 

      onChunk(text, audioData, audioId);
    }

  } catch (error) {
    console.error("ZhipuAI Request Failed:", error);
    throw error;
  }
};