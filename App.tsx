
import React, { useState, useEffect } from 'react';
import { AppStep, PersonaProfile, AuditLog } from './types.ts';
import { CaptureSession } from './components/CaptureSession.tsx';
import { MeetingRoom } from './components/MeetingRoom.tsx';
import { PersonaCompanion } from './components/PersonaCompanion.tsx';
import { 
  Shield, 
  Settings, 
  Activity, 
  ChevronRight, 
  Lock, 
  Video, 
  Plus, 
  CheckCircle,
  Eye,
  Zap
} from 'lucide-react';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.WELCOME);
  const [profile, setProfile] = useState<PersonaProfile | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const addLog = (log: AuditLog) => setLogs(prev => [log, ...prev]);

  const handleCaptureComplete = (data: { 
    name: string; 
    photoUrl: string; 
    vocalSampleBase64: string;
    biometricSummary: string; 
    voiceProfile: string; 
    vocalFingerprint: string 
  }) => {
    const newProfile: PersonaProfile = {
      id: Math.random().toString(36).substr(2, 9),
      name: data.name,
      photoUrl: data.photoUrl,
      vocalSampleBase64: data.vocalSampleBase64,
      biometricSummary: data.biometricSummary,
      voiceProfile: data.voiceProfile,
      vocalFingerprint: data.vocalFingerprint,
      role: 'Identity Owner',
      company: 'Personal Vault',
      createdAt: Date.now(),
    };
    setProfile(newProfile);
    setStep(AppStep.DASHBOARD);
    addLog({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      action: 'Vocal DNA Bound',
      details: `Neural clone generated using target vocal sample. Mimicry active.`,
      status: 'authorized'
    });
  };

  const removeProfile = () => {
    if (confirm("Revoke all digital credentials and purge biometric model?")) {
      setProfile(null);
      setStep(AppStep.WELCOME);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#020617]">
      <nav className="glass sticky top-0 z-50 px-6 py-4 flex justify-between items-center border-b border-white/5 shadow-2xl">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setStep(AppStep.WELCOME)}>
          <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center font-black text-2xl shadow-sky-500/40 group-hover:scale-110 transition-transform italic">P</div>
          <span className="font-black text-2xl tracking-tighter">PersonaEngine <span className="text-sky-400">AI</span></span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
            <Lock className="w-3 h-3" /> Encrypted Node
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-auto">
        {step === AppStep.WELCOME && (
          <div className="max-w-6xl mx-auto px-6 py-24 flex flex-col items-center text-center">
            <h1 className="text-6xl md:text-8xl font-black mb-10 bg-gradient-to-b from-white via-slate-200 to-slate-500 bg-clip-text text-transparent leading-[0.9] tracking-tighter">
              Your Digital <br /> Neural Replica.
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mb-14 leading-relaxed font-medium">
              A professional digital stand-in that looks and sounds exactly like you, using true vocal DNA cloning.
            </p>
            <button 
              onClick={() => setStep(AppStep.CAPTURE)}
              className="px-10 py-5 bg-sky-600 hover:bg-sky-500 text-white rounded-[32px] font-black uppercase tracking-widest flex items-center gap-4 transition-all transform hover:scale-110 shadow-2xl shadow-sky-600/30"
            >
              Initialize Sync <Plus className="w-6 h-6" />
            </button>
          </div>
        )}

        {step === AppStep.CAPTURE && <div className="py-20"><CaptureSession onComplete={handleCaptureComplete} /></div>}

        {step === AppStep.DASHBOARD && profile && (
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="flex flex-col lg:flex-row gap-12">
              <div className="lg:w-1/3 space-y-8">
                <div className="glass rounded-[48px] overflow-hidden shadow-2xl border-white/5 p-10 space-y-6">
                  <div className="relative aspect-square rounded-[32px] overflow-hidden border border-white/10">
                    <img src={profile.photoUrl} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black tracking-tighter mb-1">{profile.name}</h2>
                    <p className="text-sky-400 text-xs font-black uppercase tracking-widest">Neural Mimicry Active</p>
                  </div>
                  <div className="bg-white/5 p-6 rounded-3xl border border-white/5 text-sm text-slate-400 italic">
                    "{profile.biometricSummary}"
                  </div>
                  <button onClick={() => setStep(AppStep.COMPANION)} className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-[#020617] rounded-3xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all">
                    <Zap className="w-5 h-5" /> Activate Replica
                  </button>
                  <button onClick={() => setStep(AppStep.MEETING)} className="w-full py-5 glass border-sky-500/20 text-sky-400 rounded-3xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-sky-500/10 transition-all">
                    <Video className="w-5 h-5" /> Meeting Proxy
                  </button>
                </div>
              </div>
              <div className="lg:w-2/3 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass p-8 rounded-[40px] border-white/5">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Visual Warp</p>
                    <p className="text-3xl font-black text-emerald-400">Dynamic</p>
                  </div>
                  <div className="glass p-8 rounded-[40px] border-white/5">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Vocal DNA</p>
                    <p className="text-3xl font-black text-sky-400">Matched</p>
                  </div>
                  <div className="glass p-8 rounded-[40px] border-white/5">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Identity Sync</p>
                    <p className="text-3xl font-black text-amber-400">99.1%</p>
                  </div>
                </div>
                <div className="glass rounded-[48px] border-white/5 p-10 h-[400px] overflow-y-auto">
                   <h3 className="text-xl font-black mb-6">Audit Trail</h3>
                   {logs.map(log => (
                     <div key={log.id} className="flex gap-4 p-4 mb-4 bg-white/5 rounded-2xl border border-white/5">
                        <Shield className="w-5 h-5 text-emerald-400" />
                        <div>
                          <p className="font-bold text-sm">{log.action}</p>
                          <p className="text-xs text-slate-500">{log.details}</p>
                        </div>
                     </div>
                   ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === AppStep.MEETING && profile && (
          <MeetingRoom profile={profile} onLeave={() => setStep(AppStep.DASHBOARD)} onLog={addLog} />
        )}

        {step === AppStep.COMPANION && profile && (
          <PersonaCompanion profile={profile} onClose={() => setStep(AppStep.DASHBOARD)} onLog={addLog} />
        )}
      </main>
    </div>
  );
};

export default App;
