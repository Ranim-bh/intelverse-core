export type RoomName = 'Training Center' | 'Showcase Room' | 'Opportunity Room' | 'Pitch Room';
export type ClientType = 'Entreprise' | 'Institution';
export type GuestStatus = 'Créé' | 'Lobby' | 'KPIs collectés' | 'Offre envoyée' | 'Converti';
export type PartnerLevel = 'Partenaire' | 'Partenaire Fiable';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ChurnSignal = 'G1' | 'G2' | 'G3' | 'G4' | 'P1' | 'P2' | 'P3' | 'P4' | 'F1' | 'F2' | 'F3' | 'F4';

export interface Guest {
  id: string;
  name: string;
  type_client: ClientType;
  domain: string;
  session_duration: number;
  room_observation_time: Record<string, number>;
  room_click_rate: Record<string, number>;
  navigation_path: string[];
  rooms_viewed: string[];
  interaction_count: number;
  most_viewed_room: string;
  voice_interaction_time: number;
  customization_time: number;
  idle_time: number;
  status: GuestStatus;
  created_at: string;
}

export interface Partner {
  id: string;
  name: string;
  type_client: ClientType;
  level: PartnerLevel;
  subscribed_rooms: RoomName[];
  engagement_score: number;
  kpis: {
    room: RoomName;
    sessions: number;
    participants?: number;
    avg_time?: number;
    certifications?: number;
    projets_presentes?: number;
    visites?: number;
    interactions?: number;
    avg_rating: number;
    invitations?: number;
    entretiens?: number;
    recrutements?: number;
    pitchs?: number;
    entreprises?: number;
    discussion_duration?: number;
  }[];
  upsell_done: boolean;
  created_at: string;
}

export interface BusinessMetric {
  month: string;
  mrr: number;
  cac: number;
  ltv: number;
  conversion_rate: number;
  churn_rate: number;
}

export interface ChurnProfile {
  id: string;
  name: string;
  profile_type: 'Guest' | 'Partenaire' | 'Partenaire Fiable';
  signals: ChurnSignal[];
  risk_level: RiskLevel;
  days_since_signal: number;
  last_action?: string;
  recovered: boolean;
}

export interface GuestScore {
  score: number;
  level: 'hot' | 'warm' | 'cold';
  recommended_room: RoomName;       // room principale (compatibilité)
  recommended_rooms: RoomName[];    // toutes les rooms recommandées
  offer: string;
}

export type OfferStatus = 'pending' | 'approved' | 'sent' | 'accepted' | 'rejected';

export interface AIOffer {
  id: string;
  title: string;
  sessionsIncluded: number;
  roomsIncluded: string[];
  reason: string;
  confidenceScore: number;
  status: OfferStatus;
}

export interface GuestWithOffer extends Guest {
  fullName: string;
  company: string;
  generatedOffer: AIOffer;
}
