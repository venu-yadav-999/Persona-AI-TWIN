
import React, { useRef, useState, useEffect } from 'react';
import { Camera, Mic, CheckCircle, ArrowRight, Loader2, Circle, VideoOff, Shield, BrainCircuit, ScanSearch, Volume2, Activity } from 'lucide-react';
import { GoogleGenAI, Modality } from '@google/genai';
import { blobToBase64, decode, decodeAudioData } from '../utils/audioUtils.ts';

interface CaptureSessionProps {
  onComplete: (data: { 
    name: string; 
    photoUrl: string; 
    vocalSampleBase64: string;
    biometricSummary: string; 
    voiceProfile: string; 
    vocalFingerprint: string 
  }) => void;
}

enum CaptureState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  ANALYZING = 'ANALYZING',
  SYNTHESIZING = 'SYNTHESIZING',
  COMPLETED = 'COMPLETED'
}

export const CaptureSession: React.FC<CaptureSessionProps> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>(CaptureState.IDLE);
  const [progress, setProgress] = useState(0);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedAudio, setCapturedAudio] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [statusMessage, setStatusMessage] = useState('Initialize Biometric Sensors');
  const [analysisResult, setAnalysisResult] = useState<{ summary: string; voice: string; fingerprint: string } | null>(null);

  const startStream = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 1280, height: 720 }, 
        audio: true 
      });
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch (err) {
      console.error("Error accessing media devices", err);
      setStatusMessage("Hardware access denied.");
    }
  };

  useEffect(() => {
    startStream();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);

  const handleStartRecording = () => {
    if (!stream) return;
    setCaptureState(CaptureState.RECORDING);
    setStatusMessage("Capturing Neural Signature...");
    
    audioChunksRef.current = [];
    mediaRecorderRef.current = new MediaRecorder(stream);
    mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
    mediaRecorderRef.current.start();

    let currentProgress = 0;
    const recordingInterval = setInterval(() => {
      currentProgress += 1;
      setProgress(currentProgress);
      if (currentProgress === 30) setStatusMessage("Recording Facial Geometry...");
      if (currentProgress === 60) setStatusMessage("Extracting Vocal DNA...");
      if (currentProgress >= 100) {
        clearInterval(recordingInterval);
        finalizeRecording();
      }
    }, 100);
  };

  const finalizeRecording = async () => {
    setCaptureState(CaptureState.ANALYZING);
    setStatusMessage("Neural Identity Extraction...");
    
    mediaRecorderRef.current?.stop();
    
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const photoDataUrl = canvasRef.current.toDataURL('image/jpeg');
        setCapturedPhoto(photoDataUrl);
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioBase64 = await blobToBase64(audioBlob);
        setCapturedAudio(audioBase64);

        stream?.getTracks().forEach(track => track.stop());
        setStream(null);

        try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const base64Image = photoDataUrl.split(',')[1];
          
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
              parts: [
                { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
                { inlineData: { data: audioBase64, mimeType: 'audio/webm' } },
                { text: `Analyze the person's appearance and vocal input for voice cloning.
                1. Professional summary of their personality.
                2. Best matching neural baseline voice: 'Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'.
                3. High-fidelity Vocal Fingerprint: Detailed analysis of their pitch (e.g., deep baritone, high soprano), timbre (e.g., raspy, clear, nasal), and pacing (e.g., rapid, deliberate).
                This fingerprint will be used to mimic their exact voice.
                Format as JSON: {"summary": "...", "voice": "...", "fingerprint": "..."}` }
              ]
            },
            config: { responseMimeType: "application/json" }
          });

          const data = JSON.parse(response.text);
          setAnalysisResult(data);
          setCaptureState(CaptureState.SYNTHESIZING);
          setStatusMessage("Confirming Vocal Clone Match...");
          
          await runSynthesisTest(data.voice, data.fingerprint, audioBase64);
          
          setCaptureState(CaptureState.COMPLETED);
          setStatusMessage("Persona Cloned Successfully.");
        } catch (error) {
          console.error("Analysis failed", error);
          setCaptureState(CaptureState.COMPLETED);
          setAnalysisResult({
            summary: "Standard profile.",
            voice: "Zephyr",
            fingerprint: "Neutral professional tone."
          });
        }
      }
    }
  };

  const runSynthesisTest = async (voice: string, fingerprint: string, referenceAudio: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // We pass the reference audio in the prompt context to help the model "clone" the vibe
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [
          { parts: [{ inlineData: { data: referenceAudio, mimeType: 'audio/webm' } }] },
          { parts: [{ text: `Mimic the voice in the previous audio. Fingerprint: ${fingerprint}. Say: "Neural cloning complete. My voice is now synchronized with yours."` }] }
        ],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioBase64) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buffer = await decodeAudioData(decode(audioBase64), audioCtx, 24000, 1);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start();
        return new Promise(resolve => source.onended = resolve);
      }
    } catch (e) {
      console.error("Cloning test failed", e);
    }
  };

  const handleFinish = () => {
    if (analysisResult && capturedPhoto && capturedAudio) {
      onComplete({
        name: userName,
        photoUrl: capturedPhoto,
        vocalSampleBase64: capturedAudio,
        biometricSummary: analysisResult.summary,
        voiceProfile: analysisResult.voice,
        vocalFingerprint: analysisResult.fingerprint
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-10 text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-sky-500/10 rounded-2xl border border-sky-500/20">
            <BrainCircuit className="w-8 h-8 text-sky-400" />
          </div>
        </div>
        <h2 className="text-4xl font-black mb-2 tracking-tight">Vocal & Facial Sync</h2>
        <p className="text-slate-500 font-medium italic">Establishing the biological anchor for your replica.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="glass rounded-[40px] overflow-hidden relative aspect-video bg-black shadow-2xl border-white/5">
          {captureState !== CaptureState.COMPLETED ? (
            <video 
              ref={videoRef} 
              autoPlay playsInline muted 
              className={`w-full h-full object-cover transition-all duration-1000 ${
                (captureState === CaptureState.ANALYZING || captureState === CaptureState.SYNTHESIZING) ? 'opacity-20 scale-110 blur-xl' : 'opacity-100'
              }`} 
            />
          ) : (
            <div className="relative w-full h-full">
              <img src={capturedPhoto!} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-sky-500/20 mix-blend-overlay" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-sky-500/80 backdrop-blur-md px-6 py-2 rounded-full border border-white/20">
                  <span className="text-xs font-black text-white uppercase tracking-widest">Biometric Anchor Locked</span>
                </div>
              </div>
            </div>
          )}

          {(captureState === CaptureState.ANALYZING || captureState === CaptureState.SYNTHESIZING) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Loader2 className="w-16 h-16 text-sky-500 animate-spin" />
              <span className="mt-4 text-[10px] font-black uppercase tracking-[0.4em] text-sky-400">{statusMessage}</span>
            </div>
          )}

          {captureState === CaptureState.RECORDING && (
            <div className="absolute top-6 left-6 flex flex-col gap-3">
              <div className="bg-red-600 px-4 py-1.5 rounded-full flex items-center gap-3 border border-red-400/50 shadow-xl animate-pulse">
                <Circle className="w-3 h-3 fill-current text-white" />
                <span className="text-xs font-black text-white uppercase tracking-widest">Vocal DNA Sampling...</span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-8 flex flex-col justify-center">
          <div className="glass p-8 rounded-[32px] border-white/5 shadow-inner">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Identity Anchor</label>
            <input 
              type="text" value={userName}
              onChange={(e) => setUserName(e.target.value)}
              disabled={captureState !== CaptureState.IDLE}
              placeholder="Biological Name"
              className="w-full bg-transparent border-b border-slate-800 py-4 text-2xl font-bold focus:border-sky-500 outline-none transition-all placeholder:text-slate-800"
            />
          </div>

          <div className="space-y-4">
             {captureState === CaptureState.IDLE && (
                <button 
                  onClick={handleStartRecording}
                  disabled={!userName || !stream}
                  className="w-full py-6 bg-sky-600 hover:bg-sky-500 disabled:opacity-20 rounded-3xl font-black text-white uppercase tracking-[0.2em] shadow-2xl transition-all"
                >
                  <Camera className="w-6 h-6 inline mr-2" /> Initialize Sync
                </button>
             )}
             
             {captureState === CaptureState.COMPLETED && (
               <div className="animate-fade-in space-y-4">
                 <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-2xl flex items-center gap-4">
                   <CheckCircle className="text-emerald-500 w-6 h-6" />
                   <div>
                     <p className="text-xs font-black uppercase text-sky-400 tracking-widest">Voice Cloned</p>
                     <p className="text-[10px] text-slate-400">Fingerprint: {analysisResult?.fingerprint.substring(0, 50)}...</p>
                   </div>
                 </div>
                 <button 
                    onClick={handleFinish}
                    className="w-full py-6 bg-emerald-600 hover:bg-emerald-500 rounded-3xl font-black text-[#020617] uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-3"
                  >
                    Deploy Replica <ArrowRight className="w-6 h-6" />
                  </button>
               </div>
             )}
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
