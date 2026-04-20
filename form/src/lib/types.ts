export type RequestStatus = "pending" | "accepted" | "denied";

export type Request = {
  id: number;
  prenom: string;
  nom: string;
  email: string;
  telephone: string | null;
  domaine: string | null;
  typeOrganisation: string | null;
  pays: string | null;
  description: string | null;
  leadSource: string;
  sourceReferrer: string | null;
  landingUrl: string | null;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
};