import { Guest, Partner, GuestScore, RoomName, RiskLevel, ChurnSignal } from './types';

// ─── Guest Scoring (0-100) ───
export function calculateGuestScore(guest: Guest): number {
  const raw =
    guest.session_duration * 3 +
    guest.interaction_count * 1.5 +
    guest.voice_interaction_time * 8 +
    guest.rooms_viewed.length * 5 +
    Object.values(guest.room_click_rate).reduce((a, b) => a + b, 0) * 4 -
    guest.idle_time * 6;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

export function getScoreLevel(score: number): 'hot' | 'warm' | 'cold' {
  if (score > 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

export function getScoreColor(level: 'hot' | 'warm' | 'cold'): string {
  switch (level) {
    case 'hot': return 'text-success';
    case 'warm': return 'text-warning';
    case 'cold': return 'text-destructive';
  }
}

export function getScoreBgColor(level: 'hot' | 'warm' | 'cold'): string {
  switch (level) {
    case 'hot': return 'bg-success/20 text-success';
    case 'warm': return 'bg-warning/20 text-warning';
    case 'cold': return 'bg-destructive/20 text-destructive';
  }
}

// ─── Room Recommendation ───
export function recommendRoom(guest: Guest): RoomName {
  if (guest.voice_interaction_time > 2 && guest.interaction_count > 20) {
    return 'Pitch Room';
  }
  if (guest.rooms_viewed.length >= 3 && guest.session_duration > 15) {
    return 'Showcase Room';
  }
  const mostViewed = guest.most_viewed_room.toLowerCase();
  if ((mostViewed.includes('opportunity') || mostViewed.includes('pro')) &&
      (guest.room_observation_time[guest.most_viewed_room] || 0) > 5) {
    return 'Opportunity Room';
  }
  if (guest.session_duration < 5 && guest.idle_time > 2) {
    return 'Training Center'; // onboarding guidé
  }
  return guest.session_duration > 10 && guest.interaction_count < 15
    ? 'Showcase Room'
    : 'Training Center';
}

// ─── Generate Guest Offer ───
export function generateGuestOffer(guest: Guest, room: RoomName): string {
  const offers: Record<RoomName, string> = {
    'Pitch Room': `Bonjour ${guest.name}, votre engagement vocal exceptionnel et vos interactions montrent un fort potentiel de networking. Nous vous recommandons notre Pitch Room pour connecter avec des investisseurs et présenter vos projets dans un environnement immersif.`,
    'Showcase Room': `Bonjour ${guest.name}, votre exploration approfondie de nos rooms indique un intérêt pour la présentation de projets. Notre Showcase Room vous permettra de mettre en valeur vos réalisations devant un public qualifié.`,
    'Opportunity Room': `Bonjour ${guest.name}, votre intérêt pour les opportunités professionnelles est évident. Notre Opportunity Room vous donne accès à un réseau de recrutement innovant avec des entretiens immersifs.`,
    'Training Center': `Bonjour ${guest.name}, commencez votre parcours avec notre Training Center. Des formations certifiantes en environnement XR vous attendent pour développer vos compétences.`,
  };
  return offers[room];
}

// ─── Full Guest Analysis ───
export function analyzeGuest(guest: Guest): GuestScore {
  const score = calculateGuestScore(guest);
  const level = getScoreLevel(score);
  const recommended_room = recommendRoom(guest);
  const offer = generateGuestOffer(guest, recommended_room);
  return { score, level, recommended_room, offer };
}

// ─── Upselling Recommendation ───
export function getUpsellRecommendation(partner: Partner): { room: RoomName; reason: string } | null {
  const showcaseKpi = partner.kpis.find(k => k.room === 'Showcase Room');
  const trainingKpi = partner.kpis.find(k => k.room === 'Training Center');
  const pitchKpi = partner.kpis.find(k => k.room === 'Pitch Room');

  if (showcaseKpi && showcaseKpi.avg_rating < 3.5) {
    return { room: 'Training Center', reason: 'Rating Showcase faible — formation recommandée' };
  }
  if (showcaseKpi && showcaseKpi.avg_rating >= 4.0 && (showcaseKpi.visites || 0) > 50) {
    return { room: 'Opportunity Room', reason: 'Excellent rating Showcase + trafic élevé → recrutement' };
  }
  if (showcaseKpi && showcaseKpi.avg_rating >= 4.0 && (showcaseKpi.interactions || 0) > 30) {
    return { room: 'Pitch Room', reason: 'Showcase performant + interactions élevées → pitching' };
  }
  if (trainingKpi && (trainingKpi.certifications || 0) > 5) {
    return { room: 'Showcase Room', reason: 'Certifications obtenues → showcase des compétences' };
  }
  if (pitchKpi && (pitchKpi.discussion_duration || 0) > 100) {
    return { room: 'Showcase Room', reason: 'Discussions pitch longues → mise en valeur projets' };
  }
  return null;
}

// ─── Churn Signal Descriptions ───
export const signalDescriptions: Record<ChurnSignal, string> = {
  G1: 'Jamais connecté',
  G2: 'Session courte + idle élevé',
  G3: 'Pas de réponse chatbot >5j',
  G4: 'Offre ignorée ×3',
  P1: 'Rooms non utilisées >7j',
  P2: 'KPIs en chute',
  P3: 'Upsell ignoré ×3',
  P4: 'Engagement score en baisse',
  F1: 'Fréquence utilisation baisse',
  F2: 'Engagement < seuil',
  F3: 'Absence >X jours',
  F4: 'Chute KPIs clés',
};

// ─── Risk Level Colors ───
export function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low': return 'bg-risk-low/20 text-risk-low border-risk-low/30';
    case 'medium': return 'bg-risk-medium/20 text-risk-medium border-risk-medium/30';
    case 'high': return 'bg-risk-high/20 text-risk-high border-risk-high/30';
    case 'critical': return 'bg-risk-critical/20 text-risk-critical border-risk-critical/30';
  }
}

export function getRiskBadgeColor(level: RiskLevel): string {
  switch (level) {
    case 'low': return 'bg-risk-low text-white';
    case 'medium': return 'bg-risk-medium text-black';
    case 'high': return 'bg-risk-high text-white';
    case 'critical': return 'bg-risk-critical text-white';
  }
}

// ─── Room Colors ───
export function getRoomColor(room: string): string {
  if (room.includes('Training')) return 'bg-room-training/20 text-room-training';
  if (room.includes('Showcase')) return 'bg-room-showcase/20 text-room-showcase';
  if (room.includes('Opportunity')) return 'bg-room-opportunity/20 text-room-opportunity';
  if (room.includes('Pitch')) return 'bg-room-pitch/20 text-room-pitch';
  return 'bg-muted text-muted-foreground';
}

export const ROOM_HEX_COLORS: Record<string, string> = {
  'Training Center': '#3B82F6',
  'Showcase Room': '#8B5CF6',
  'Opportunity Room': '#10B981',
  'Pitch Room': '#F59E0B',
};
