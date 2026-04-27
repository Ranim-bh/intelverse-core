import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Loader2, Search, XCircle } from "lucide-react";

type LeadRequestStatus = "pending" | "accepted" | "denied";

type RequestItem = {
  id: number;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  domaine: string;
  typeOrganisation: string;
  pays: string | null;
  leadSource: string;
  description: string;
  status: LeadRequestStatus;
  createdAt?: string;
  created_at?: string;
};

const formatDate = (dateString?: string): string => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const statusBadge = (status: LeadRequestStatus) => {
  if (status === "accepted") return "bg-emerald-100 text-emerald-700 border border-emerald-200";
  if (status === "denied") return "bg-red-100 text-red-700 border border-red-200";
  return "bg-amber-100 text-amber-700 border border-amber-200";
};

export default function Requests() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterLeadSource, setFilterLeadSource] = useState<string>("all");

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/requests");
      if (!response.ok) {
        throw new Error(`Failed to fetch requests (${response.status})`);
      }
      const data = (await response.json()) as RequestItem[];
      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch requests";
      setError(message);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRequests();
  }, []);

  const handleAction = async (id: number, action: "accept" | "deny") => {
    try {
      const response = await fetch(`/api/requests/${id}/${action}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Failed to ${action} request`);
      }
      const updatedRequest = (await response.json()) as RequestItem;
      setRequests((prev) => prev.map((item) => (item.id === id ? updatedRequest : item)));
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to ${action} request`;
      setError(message);
    }
  };

  const uniqueLeadSources = useMemo(() => {
    const sources = new Set(requests.map((item) => item.leadSource).filter(Boolean));
    return Array.from(sources).sort();
  }, [requests]);

  const filtered = useMemo(() => {
    return requests.filter((req) => {
      const fullName = `${req.prenom} ${req.nom}`.toLowerCase();
      const q = search.toLowerCase();
      const matchesSearch = fullName.includes(q) || req.email.toLowerCase().includes(q);
      const matchesSource = filterLeadSource === "all" || req.leadSource === filterLeadSource;
      return matchesSearch && matchesSource;
    });
  }, [requests, search, filterLeadSource]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Requests</h1>
        <p className="text-sm text-muted-foreground">View and manage all incoming lead requests.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email..."
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none ring-0 focus:border-primary"
          />
        </div>

        {uniqueLeadSources.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterLeadSource("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                filterLeadSource === "all"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground"
              }`}
            >
              All
            </button>
            {uniqueLeadSources.map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => setFilterLeadSource(source)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  filterLeadSource === source
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground"
                }`}
              >
                {source}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {filtered.length} request{filtered.length !== 1 ? "s" : ""}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Source</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Created</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="p-6" colSpan={6}>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading requests...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={6}>
                    No requests found.
                  </td>
                </tr>
              ) : (
                filtered.map((req) => (
                  <tr key={req.id} className="border-b border-border/60">
                    <td className="p-3">{req.prenom} {req.nom}</td>
                    <td className="p-3">{req.email}</td>
                    <td className="p-3">{req.leadSource || "-"}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadge(req.status)}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="p-3">{formatDate(req.createdAt ?? req.created_at)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleAction(req.id, "accept")}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAction(req.id, "deny")}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
