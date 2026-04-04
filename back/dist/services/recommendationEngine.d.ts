export type LeadScoringKpiKey = "session_duration" | "rooms_visited" | "voice_time" | "interactions" | "idle_time" | "guest_score" | "room_score" | "engagement_score" | "score";
export interface LeadScoringWeightRow {
    kpi_key: LeadScoringKpiKey | string;
    label: string;
    category: string;
    weight: number;
    is_default: boolean;
    created_at: string;
    updated_at: string;
}
export interface LeadScoringKpiOption {
    kpi_key: string;
    label: string;
    category: string;
}
export type ScoreTier = "Solo" | "Duo" | "Trio" | "All-Access";
export interface ScoreBreakdown {
    guest_score: number;
    room_score: number;
    top_room: string;
    top_room_by_interactions: string;
}
export interface GuestScoreResult {
    guest_id: string;
    engagement_score: number;
    tier: ScoreTier;
    score_breakdown: ScoreBreakdown;
}
export interface RecommendationResult {
    guest_id: string;
    engagement_score: number;
    tier: ScoreTier;
    score_breakdown: ScoreBreakdown;
    recommended_pack: {
        pack_id?: string;
        pack_code: string;
        pack_name: string;
        nb_rooms: number;
        services: string[];
        reason: string;
    };
}
export type OfferStatus = "en_attente" | "generée" | "envoyée" | "acceptée" | "refusée";
export interface StoredOfferRecord {
    offer_id: string;
    user_id: string;
    pack_id: string | null;
    tier: string | null;
    score: number | null;
    offer_payload: RecommendationResult;
    status: OfferStatus;
    created_at: string;
    updated_at: string;
}
export declare const getLeadScoringWeights: () => Promise<LeadScoringWeightRow[]>;
export declare const saveLeadScoringWeights: (rows: Array<Pick<LeadScoringWeightRow, "kpi_key" | "label" | "category" | "weight" | "is_default">>) => Promise<LeadScoringWeightRow[]>;
export declare const getAvailableRecommendedOfferKpis: () => Promise<LeadScoringKpiOption[]>;
export declare const getGuestScore: (guestId: string) => Promise<Omit<GuestScoreResult, "guest_id"> & {
    guest_id: string;
}>;
export declare const recommendForGuest: (guestId: string) => Promise<RecommendationResult>;
export declare const saveRecommendationForGuest: (guestId: string, recommendation: RecommendationResult) => Promise<{
    offer_id: string;
    updated_at: string;
}>;
export declare const listRecommendedOffers: () => Promise<StoredOfferRecord[]>;
export declare const updateRecommendedOfferStatus: (guestId: string, status: OfferStatus) => Promise<{
    offer_id: string;
    status: OfferStatus;
    updated_at: string;
}>;
//# sourceMappingURL=recommendationEngine.d.ts.map