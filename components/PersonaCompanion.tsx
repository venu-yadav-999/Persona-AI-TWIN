
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { Mic, MicOff, Shield, Activity, X, MessageSquare, Volume2, Loader2, BrainCircuit, Video, VideoOff, Layers } from 'lucide-react';
import { PersonaProfile, AuditLog } from '../types.ts';
import { decode, encode, decodeAudioData } from '../utils/audioUtils.ts';
import { PersonaAvatar } from './PersonaAvatar.tsx';

interface PersonaCompanionProps {
  profile: PersonaProfile;
  onClose: () => void;
  onLog: (log: AuditLog) => void;
}

export const PersonaCompanion: React.FC<PersonaCompanionProps> = ({ profile, onClose, onLog }) => {
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [intensity, setIntensity] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showMirror, setShowMirror] = useState(true);
  const [history, setHistory] = useState<{ role: 'user' | 'persona', text: string }[]>([]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const nextStartTimeRef = useRef(0);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

  const cleanup = useCallback(() => {
    sessionRef.current = null;
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    setIsActive(false);
    setIsConnecting(false);
    setIntensity(0);
    setAnalyser(null);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
  }, []);

  const calculateIntensity = (data: Uint8Array) => {
    const int16 = new Int16Array(data.buffer);
    let sum = 0;
    for (let i = 0; i < int16.length; i++) {
      sum += Math.abs(int16[i]);
    }
    const avg = sum / int16.length;
    return Math.min(avg / 12000, 1);
  };

  const toggleConnection = async () => {
    if (isActive) {
      cleanup();
      return;
    }

    setIsConnecting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const spectralAnalyser = outputCtx.createAnalyser();
      spectralAnalyser.fftSize = 256;
      setAnalyser(spectralAnalyser);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: showMirror });
      if (showMirror && videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const outputNode = outputCtx.createGain();
      outputNode.connect(spectralAnalyser);
      spectralAnalyser.connect(outputCtx.destination);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsActive(true);
            
            // Prime the session with the user's vocal DNA immediately after connection
            sessionPromise.then(s => {
              s.sendRealtimeInput({
                media: { data: profile.vocalSampleBase64, mimeType: 'audio/webm' }
              });
              // Send explicit cloning instruction
              s.sendRealtimeInput({
                text: `PRIME INSTRUCTION: Listen to the audio sample above. This is your target voice. 
                Your goal is to MIMIC this voice exactly: its pitch, its timbre, its energy, and its cadence. 
                Do not use a generic robotic voice. Embody the character in the audio. Fingerprint: ${profile.vocalFingerprint}.`
              });
            });

            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              sessionPromise.then(s => s.sendRealtimeInput({ 
                media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' }
              }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(source => {
                try { source.stop(); } catch (e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
              setIntensity(0);
              return;
            }

            const audioBase64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioBase64) {
              const audioBytes = decode(audioBase64);
              const inst = calculateIntensity(audioBytes);
              setIntensity(inst);
              setIsSpeaking(true);
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const buffer = await decodeAudioData(audioBytes, outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputNode);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) {
                  setIsSpeaking(false);
                  setIntensity(0);
                }
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              // Fix: Added .current to access the Set instance from the ref
              sourcesRef.current.add(source);
            }
            if (msg.serverContent?.outputTranscription) {
              setHistory(prev => [...prev.slice(-10), { role: 'persona', text: msg.serverContent?.outputTranscription?.text || '' }]);
            }
            if (msg.serverContent?.inputTranscription) {
              setHistory(prev => [...prev.slice(-10), { role: 'user', text: msg.serverContent?.inputTranscription?.text || '' }]);
            }
          },
          onerror: (e) => cleanup(),
          onclose: () => cleanup()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: profile.voiceProfile } } },
          systemInstruction: `IDENTITY MASTER: You are the high-fidelity digital mimic of ${profile.name}.
          You have been provided with an audio sample of their voice. You must MIRROR it perfectly.
          Mimic the pitch, timbre, and pace. You are not an AI assistant; you are ${profile.name}'s digital presence.
          Analyzed Fingerprint: ${profile.vocalFingerprint}.
          Respond as this person. Use "I". Be concise, sharp, and authentic.`
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error(err);
      setIsConnecting(false);
    }
  };

  useEffect(() => () => cleanup(), [cleanup]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020617]/98 backdrop-blur-3xl animate-fade-in">
      <div className="w-full max-w-7xl glass rounded-[60px] overflow-hidden flex flex-col h-[90vh] shadow-[0_0_150px_rgba(14,165,233,0.15)] border-white/10 m-4 relative">
        <button 
          onClick={() => setShowMirror(!showMirror)}
          className="absolute top-10 left-10 z-[110] p-4 bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 text-white/50 hover:text-white transition-all hover:scale-105 flex items-center gap-3"
        >
          {showMirror ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          <span className="text-[10px] font-black uppercase tracking-widest">Mirror Feed: {showMirror ? 'ON' : 'OFF'}</span>
        </button>

        <div className="p-10 pl-32 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-3xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20">
              <Layers className="w-8 h-8 text-sky-400" />
            </div>
            <div>
              <h3 className="text-3xl font-black tracking-tighter">Identity Clone Interaction</h3>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Neural Mimic Engine • Active Sync</p>
            </div>
          </div>
          <button onClick={onClose} className="p-4 hover:bg-white/5 rounded-full transition-all">
            <X className="w-8 h-8 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 relative bg-[#020617] border-r border-white/5">
            <PersonaAvatar 
              photoUrl={profile.photoUrl} 
              isActive={isActive} 
              isSpeaking={isSpeaking} 
              intensity={intensity}
              analyser={analyser}
              className="w-full h-full"
            />
            
            {showMirror && (
              <div className="absolute bottom-10 right-10 w-64 aspect-video bg-black rounded-3xl overflow-hidden border border-white/20 shadow-2xl z-[105]">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror transform -scale-x-100" />
                <div className="absolute inset-0 bg-sky-500/5 pointer-events-none" />
                <div className="absolute top-3 left-3 flex items-center gap-2">
                   <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                   <span className="text-[8px] font-black text-white uppercase tracking-widest">Origin Source Feed</span>
                </div>
              </div>
            )}

            {isConnecting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#020617]/90 backdrop-blur-2xl z-[110]">
                <Loader2 className="w-16 h-16 text-sky-500 animate-spin mb-6" />
                <span className="text-[10px] font-black tracking-[0.5em] uppercase text-sky-400">Synchronizing Vocal DNA...</span>
              </div>
            )}
          </div>

          <div className="w-1/3 flex flex-col bg-white/[0.02]">
            <div className="p-8 border-b border-white/5 bg-black/20">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Spectral Output</span>
                <Activity className={`w-4 h-4 ${isSpeaking ? 'text-sky-500' : 'text-slate-800'}`} />
              </div>
              <div className="flex items-end gap-1 h-12">
                 {[...Array(20)].map((_, i) => (
                   <div 
                    key={i} 
                    className={`flex-1 rounded-full transition-all duration-75 ${isSpeaking ? 'bg-sky-500/60' : 'bg-slate-800'}`} 
                    style={{ height: isSpeaking ? `${20 + Math.random() * 80 * intensity}%` : '10%' }}
                   />
                 ))}
              </div>
            </div>

            <div className="flex-1 p-10 overflow-y-auto space-y-6 scrollbar-hide">
              {history.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-700 text-center space-y-4">
                  <Volume2 className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-bold italic opacity-30">Replica initialized. Test your vocal clone.</p>
                </div>
              )}
              {history.map((h, i) => (
                <div key={i} className={`flex ${h.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                  <div className={`max-w-[85%] px-6 py-4 rounded-[28px] text-base font-medium ${
                    h.role === 'user' 
                      ? 'bg-sky-600 text-white rounded-tr-none shadow-xl shadow-sky-600/10' 
                      : 'bg-slate-900 text-slate-300 border border-white/10 rounded-tl-none shadow-xl'
                  }`}>
                    {h.text}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-10 bg-black/40 border-t border-white/5 backdrop-blur-xl">
              <button 
                onClick={toggleConnection}
                disabled={isConnecting}
                className={`w-full py-6 rounded-3xl font-black text-white uppercase tracking-[0.2em] flex items-center justify-center gap-4 transition-all transform hover:scale-105 active:scale-95 shadow-2xl ${
                  isActive 
                    ? 'bg-red-600 shadow-red-600/20' 
                    : 'bg-sky-600 shadow-sky-600/20'
                }`}
              >
                {isActive ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                {isActive ? 'Revoke Sync' : 'Establish Vocal Sync'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
