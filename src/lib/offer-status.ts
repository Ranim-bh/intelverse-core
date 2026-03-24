import type { OfferStatus } from "./types";

type OfferStatusLike = OfferStatus | "READY" | "DRAFT" | "PENDING";

export function getOfferStatusLabel(status: OfferStatusLike | string): string {
  switch (status) {
    case "pending":
    case "approved":
    case "READY":
    case "DRAFT":
    case "PENDING":
      return "🟡 Offre Générée";
    case "sent":
      return "🔵 Offre Envoyée";
    case "accepted":
      return "🟢 Offre Acceptée";
    case "rejected":
      return "🔴 Offre Supprimée";
    default:
      return "🟡 Offre Générée";
  }
}

export function getOfferStatusBadgeClasses(status: OfferStatusLike | string): string {
  switch (status) {
    case "pending":
    case "approved":
    case "READY":
    case "DRAFT":
    case "PENDING":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "sent":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "accepted":
      return "bg-green-100 text-green-700 border-green-200";
    case "rejected":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
  }
}
