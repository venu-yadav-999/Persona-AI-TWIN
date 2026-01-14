
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
import { Mic, MicOff, PhoneOff, Settings, Shield, Activity, ListChecks } from 'lucide-react';
import { PersonaProfile, AuditLog } from '../types.ts';
import { decode, encode, decodeAudioData } from '../utils/audioUtils.ts';
import { PersonaAvatar } from './PersonaAvatar.tsx';

interface MeetingRoomProps {
  profile: PersonaProfile;
  onLeave: () => void;
  onLog: (log: AuditLog) => void;
}

const Loader2 = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export const MeetingRoom: React.FC<MeetingRoomProps> = ({ profile, onLeave, onLog }) => {
  const [isActive, setIsActive] = useState(false);
  const [isPersonaSpeaking, setIsPersonaSpeaking] = useState(false);
  const [intensity, setIntensity] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'idle' | 'active'>('idle');
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  
  const nextStartTimeRef = useRef(0);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

  const cleanupSession = useCallback(() => {
    sessionRef.current = null;
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    setStatus('idle');
    setIsActive(false);
    setIntensity(0);
    setAnalyser(null);
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

  const togglePersona = async () => {
    if (isActive) {
      cleanupSession();
      return;
    }
    setStatus('connecting');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      // Create Spectral Analyser
      const spectralAnalyser = outputCtx.createAnalyser();
      spectralAnalyser.fftSize = 256;
      setAnalyser(spectralAnalyser);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const outputNode = outputCtx.createGain();
      
      // Connect pipeline: Audio Chunk -> Output Node -> Analyser -> Speakers
      outputNode.connect(spectralAnalyser);
      spectralAnalyser.connect(outputCtx.destination);

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('active');
            setIsActive(true);
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
              setIsPersonaSpeaking(false);
              setIntensity(0);
              return;
            }

            const audioBase64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioBase64) {
              const audioBytes = decode(audioBase64);
              const inst = calculateIntensity(audioBytes);
              setIntensity(inst);
              setIsPersonaSpeaking(true);
              
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const buffer = await decodeAudioData(audioBytes, outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputNode);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) {
                  setIsPersonaSpeaking(false);
                  setIntensity(0);
                }
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
            if (msg.serverContent?.outputTranscription) {
              setTranscripts(prev => [...prev.slice(-4), `Dummy: ${msg.serverContent?.outputTranscription?.text}`]);
            }
          },
          onerror: (e) => cleanupSession(),
          onclose: () => cleanupSession()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: profile.voiceProfile } } },
          systemInstruction: `You are the digital dummy twin of ${profile.name}. 
          Instruction Profile: ${profile.biometricSummary}.
          Vocal Tone Analysis (Primer): ${profile.vocalFingerprint}.
          Respond as this person would. Use first-person pronouns. 
          You are currently in a Meeting Session. Only speak when directly addressed.`
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error(err);
      setStatus('idle');
    }
  };

  useEffect(() => () => cleanupSession(), [cleanupSession]);

  return (
    <div className="h-full flex flex-col bg-[#020617]">
      <div className="p-4 glass flex justify-between items-center z-10 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Shield className="text-sky-400 w-6 h-6" />
          <h3 className="font-bold">Neural Sync Session</h3>
        </div>
        <button onClick={onLeave} className="px-6 py-2 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white rounded-full font-bold transition-all border border-red-500/20">
          <PhoneOff className="w-4 h-4 inline mr-2" /> Exit Meeting
        </button>
      </div>

      <div className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-4 gap-8 overflow-hidden">
        <div className="lg:col-span-3 glass rounded-[40px] overflow-hidden relative">
          <PersonaAvatar 
            photoUrl={profile.photoUrl} 
            isActive={isActive} 
            isSpeaking={isPersonaSpeaking} 
            intensity={intensity}
            analyser={analyser} // Pass spectral analyser node
            className="w-full h-full"
          />
          <div className="absolute bottom-10 left-10">
            <h2 className="text-4xl font-black">{profile.name} <span className="text-sky-400 opacity-50">(Dummy)</span></h2>
            <p className="text-emerald-400 font-bold uppercase tracking-widest text-xs">Vocal Profile: {profile.voiceProfile}</p>
          </div>
        </div>

        <div className="glass rounded-[40px] flex flex-col overflow-hidden border-white/5">
          <div className="p-6 border-b border-white/5 font-black uppercase tracking-[0.2em] text-[10px] text-slate-500">Live Logic Feed</div>
          <div className="flex-1 p-6 overflow-y-auto space-y-4 font-mono text-[10px]">
            {transcripts.map((t, i) => (
              <div key={i} className="p-3 bg-white/5 rounded-xl border border-white/5 leading-relaxed">
                <span className="text-sky-500">&gt;</span> {t}
              </div>
            ))}
          </div>
          <div className="p-6 bg-black/40 border-t border-white/5">
             <button 
                onClick={togglePersona}
                className={`w-full py-4 rounded-2xl font-black text-white uppercase tracking-widest transition-all ${
                  isActive ? 'bg-red-600' : 'bg-sky-600'
                }`}
              >
                {status === 'connecting' ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : isActive ? 'Terminate' : 'Activate Dummy'}
              </button>
          </div>
        </div>
      </div>
    </div>
  );
};
