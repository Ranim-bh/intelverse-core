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
export type OfferStatus = "pending" | "accepted" | "rejected" | "sent";
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