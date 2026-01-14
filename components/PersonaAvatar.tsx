
import React, { useEffect, useRef, useState } from 'react';

interface PersonaAvatarProps {
  photoUrl: string;
  isSpeaking: boolean;
  isActive: boolean;
  intensity?: number;
  analyser?: AnalyserNode | null;
  className?: string;
}

export const PersonaAvatar: React.FC<PersonaAvatarProps> = ({ 
  photoUrl, 
  isSpeaking, 
  isActive, 
  intensity = 0,
  analyser = null,
  className = "" 
}) => {
  const requestRef = useRef<number>(0);
  const dataArray = useRef<Uint8Array>(new Uint8Array(0));
  
  // Spectral registers
  const smoothedBass = useRef(0);
  const smoothedMid = useRef(0);
  const smoothedHigh = useRef(0);
  
  // Animation states for CSS Variables
  const [warp, setWarp] = useState({ jaw: 0, mouthWidth: 1, mouthOpen: 0, browLift: 0 });

  useEffect(() => {
    if (analyser) {
      dataArray.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, [analyser]);

  const animate = () => {
    let bass = 0;
    let mid = 0;
    let high = 0;

    if (analyser && isSpeaking) {
      analyser.getByteFrequencyData(dataArray.current);
      const bins = dataArray.current;
      const binCount = bins.length;
      
      for(let i=0; i<binCount*0.1; i++) bass += bins[i];
      bass /= (binCount*0.1 * 255);

      for(let i=Math.floor(binCount*0.1); i<binCount*0.4; i++) mid += bins[i];
      mid /= (binCount*0.3 * 255);

      for(let i=Math.floor(binCount*0.4); i<binCount; i++) high += bins[i];
      high /= (binCount*0.6 * 255);
    } else {
      bass = intensity;
      mid = intensity * 0.5;
      high = intensity * 0.2;
    }

    // High-responsiveness smoothing
    smoothedBass.current += (bass - smoothedBass.current) * 0.4;
    smoothedMid.current += (mid - smoothedMid.current) * 0.3;
    smoothedHigh.current += (high - smoothedHigh.current) * 0.25;

    const b = smoothedBass.current;
    const m = smoothedMid.current;
    const h = smoothedHigh.current;

    setWarp({
      jaw: b * 15, // Degrees of jaw drop
      mouthWidth: 1 + (m * 0.25), // Horizontal stretch
      mouthOpen: b * 20, // Vertical gap
      browLift: b * 5 + h * 5
    });

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isSpeaking, isActive, intensity, analyser]);

  return (
    <div className={`relative overflow-hidden bg-[#020617] rounded-[inherit] shadow-inner flex items-center justify-center ${className}`}>
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-900/10 to-transparent pointer-events-none" />

      {/* Main Neural Mesh Layer (Image Deformation) */}
      <div 
        className="relative w-full h-full transition-all duration-75 ease-out flex items-center justify-center"
        style={{ 
          filter: isActive ? 'none' : 'grayscale(100%) blur(5px)',
          opacity: isActive ? 1 : 0.4,
          transform: `scale(${1 + intensity * 0.02})`
        }}
      >
        {/* The "Head" Container with Jaw Pivot */}
        <div className="relative w-[110%] h-[110%] flex items-center justify-center overflow-hidden">
          
          {/* Upper Face (Static-ish) */}
          <div 
            className="absolute inset-0 z-10"
            style={{ 
              clipPath: 'polygon(0% 0%, 100% 0%, 100% 70%, 0% 70%)',
              transform: `translateY(${-warp.browLift * 0.5}px)`
            }}
          >
            <img src={photoUrl} className="w-full h-full object-cover" />
          </div>

          {/* Lower Face / Jaw (Dynamic Warp) */}
          <div 
            className="absolute inset-0 z-20 transition-transform duration-75"
            style={{ 
              clipPath: 'polygon(0% 65%, 100% 65%, 100% 100%, 0% 100%)',
              transform: `translateY(${warp.jaw}px) scaleX(${warp.mouthWidth})`,
              transformOrigin: 'top center'
            }}
          >
            <img src={photoUrl} className="w-full h-full object-cover" />
          </div>

          {/* Mouth Opening Illusion (Shadow/Gap) */}
          {isSpeaking && (
            <div 
              className="absolute z-[15] bg-black/80 blur-md rounded-full"
              style={{
                width: '15%',
                height: `${warp.mouthOpen}px`,
                top: '71%',
                left: '50%',
                transform: 'translateX(-50%)',
                opacity: warp.mouthOpen / 20
              }}
            />
          )}
        </div>
      </div>

      {/* Neural Network Overlay (More subtle now, representing neural activity) */}
      <div className="absolute inset-0 pointer-events-none opacity-30 mix-blend-screen">
        <svg className="w-full h-full">
           {[...Array(20)].map((_, i) => (
             <circle 
               key={i} 
               cx={`${Math.random() * 100}%`} 
               cy={`${Math.random() * 100}%`} 
               r={isActive ? Math.random() * 2 : 0} 
               fill="#38bdf8"
               className={isSpeaking ? 'animate-pulse' : ''}
               style={{ animationDelay: `${Math.random() * 2}s` }}
             />
           ))}
        </svg>
      </div>

      {/* Scanning Lines */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="w-full h-1 bg-sky-500/50 absolute top-0 animate-[scan_4s_linear_infinite]" />
      </div>

      {/* Status HUD */}
      {isActive && (
        <div className="absolute bottom-10 left-10 flex flex-col gap-2 z-50">
          <div className="flex items-center gap-2 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-sky-500/30">
            <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-sky-500 animate-pulse' : 'bg-emerald-500'}`} />
            <span className="text-[9px] font-black uppercase tracking-widest text-white">Neural Morph Active</span>
          </div>
          {isSpeaking && (
            <div className="flex gap-0.5 items-center px-1">
              {[...Array(12)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-0.5 bg-sky-400/80 rounded-full transition-all" 
                  style={{ height: `${Math.random() * intensity * 40}px`, minHeight: '1px' }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan {
          0% { top: -5%; }
          100% { top: 105%; }
        }
      `}} />
    </div>
  );
};
