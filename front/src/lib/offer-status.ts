import type { OfferStatus } from "./types";

export function getOfferStatusLabel(status: OfferStatus | string): string {
  switch (status) {
    case "en_attente":
      return "⚪ En attente";
    case "generée":
      return "🟡 Offre Générée";
    case "envoyée":
      return "🔵 Offre Envoyée";
    case "acceptée":
      return "🟢 Offre Acceptée";
    case "refusée":
      return "🔴 Offre Refusée";
    default:
      return "🟡 Offre Générée";
  }
}

export function getOfferStatusBadgeClasses(status: OfferStatus | string): string {
  switch (status) {
    case "en_attente":
      return "bg-slate-100 text-slate-600 border-slate-200";
    case "generée":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "envoyée":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "acceptée":
      return "bg-green-100 text-green-700 border-green-200";
    case "refusée":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
  }
}
