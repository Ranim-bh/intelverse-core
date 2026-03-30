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
        pack_code: string;
        pack_name: string;
        nb_rooms: number;
        services: string[];
        reason: string;
    };
}
export declare const getGuestScore: (guestId: string) => Promise<Omit<GuestScoreResult, "guest_id"> & {
    guest_id: string;
}>;
export declare const recommendForGuest: (guestId: string) => Promise<RecommendationResult>;
//# sourceMappingURL=recommendationEngine.d.ts.map