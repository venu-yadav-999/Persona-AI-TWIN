
export enum AppStep {
  WELCOME = 'WELCOME',
  CAPTURE = 'CAPTURE',
  MODELING = 'MODELING',
  DASHBOARD = 'DASHBOARD',
  MEETING = 'MEETING',
  COMPANION = 'COMPANION'
}

export interface PersonaProfile {
  id: string;
  name: string;
  role: string;
  company: string;
  photoUrl: string;
  vocalSampleBase64: string; // The user's actual recorded voice data
  biometricSummary: string;
  voiceProfile: string; 
  vocalFingerprint: string; 
  createdAt: number;
}

export interface AuditLog {
  id: string;
  timestamp: number;
  action: string;
  details: string;
  status: 'authorized' | 'revoked' | 'warning';
}

export interface MeetingContext {
  id: string;
  title: string;
  attendees: string[];
  isPersonaActive: boolean;
}
