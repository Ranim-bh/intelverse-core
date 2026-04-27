import { useState, useEffect } from "react";
import type { Request } from "@/lib/types";
import { Search, AlertTriangle, Loader2, CheckCircle, XCircle } from "lucide-react";

// Format date as DD/MM/YYYY
const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateString;
  }
};

// Get unique lead sources for filter
const getUniqueSources = (requests: Request[]): string[] => {
  const sources = new Set(requests.map(r => r.leadSource));
  return Array.from(sources).sort();
};

export default function Requests() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterLeadSource, setFilterLeadSource] = useState<string>("all");

  // Fetch requests from API
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("http://localhost:5000/api/requests");
        
        if (!response.ok) {
          throw new Error(`Failed to fetch requests: ${response.statusText}`);
        }
        
        const data = await response.json();
        setRequests(Array.isArray(data) ? data : []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error occurred";
        setError(message);
        setRequests([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, []);

  // Handle accept request
  const handleAccept = async (id: number) => {
    try {
      const response = await fetch(`http://localhost:5000/api/requests/${id}/accept`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to accept request: ${response.statusText}`);
      }

      const updatedRequest = await response.json();
      
      // Update local state
      setRequests(prev => prev.map(req => 
        req.id === id ? updatedRequest : req
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to accept request";
      setError(message);
    }
  };

  // Handle deny request
  const handleDeny = async (id: number) => {
    try {
      const response = await fetch(`http://localhost:5000/api/requests/${id}/deny`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to deny request: ${response.statusText}`);
      }

      const updatedRequest = await response.json();
      
      // Update local state
      setRequests(prev => prev.map(req => 
        req.id === id ? updatedRequest : req
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to deny request";
      setError(message);
    }
  };

  // Filter requests
  const filtered = requests.filter(req => {
    const fullName = `${req.prenom} ${req.nom}`.toLowerCase();
    const matchSearch = 
      fullName.includes(search.toLowerCase()) || 
      req.email.toLowerCase().includes(search.toLowerCase());
    const matchLeadSource = filterLeadSource === "all" || req.leadSource === filterLeadSource;
    return matchSearch && matchLeadSource;
  });

  const uniqueLeadSources = getUniqueSources(requests);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Requests</h1>
        <p className="text-sm text-muted-foreground">
          View and manage all incoming requests from the backend API.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="glass-card border-destructive/40 p-4 flex items-center gap-3 bg-destructive/5">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <span className="text-sm font-medium text-destructive">{error}</span>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Lead Source Filter */}
        {uniqueLeadSources.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground uppercase pt-2">
                Lead Source:
              </span>
              <button
                onClick={() => setFilterLeadSource("all")}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  filterLeadSource === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {uniqueLeadSources.map(source => (
                <button
                  key={source}
                  onClick={() => setFilterLeadSource(source)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    filterLeadSource === source
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {source}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results Count */}
      {!loading && (
        <div className="text-sm text-muted-foreground">
          Showing {filtered.length} request{filtered.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[
                  "Full Name",
                  "Email",
                  "Telephone",
                  "Domaine",
                  "Organisation Type",
                  "Pays",
                  "Lead Source",
                  "Description",
                  "Created Date",
                  "Status",
                  "Actions",
                ].map(header => (
                  <th
                    key={header}
                    className="text-left p-4 text-xs font-medium text-muted-foreground uppercase"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading requests...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-muted-foreground">
                    No requests found.
                  </td>
                </tr>
              ) : (
                filtered.map((request, index) => (
                  <tr
                    key={request.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors animate-slide-up"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <td className="p-4 text-foreground font-medium">
                      {request.prenom} {request.nom}
                    </td>
                    <td className="p-4 text-foreground">{request.email}</td>
                    <td className="p-4 text-foreground">{request.telephone}</td>
                    <td className="p-4 text-foreground">{request.domaine}</td>
                    <td className="p-4 text-foreground">{request.typeOrganisation}</td>
                    <td className="p-4 text-foreground">
                      {request.pays || "-"}
                    </td>
                    <td className="p-4">
                      <span className="inline-block px-2 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200 text-xs font-medium">
                        {request.leadSource}
                      </span>
                    </td>
                    <td className="p-4 text-foreground max-w-xs truncate">
                      {request.description}
                    </td>
                    <td className="p-4 text-foreground whitespace-nowrap">
                      {formatDate(request.createdAt)}
                    </td>
                    <td className="p-4">
                      {request.status === "accepted" && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 text-xs font-medium">
                          <CheckCircle className="h-3 w-3" />
                          Accepted
                        </span>
                      )}
                      {request.status === "denied" && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 text-xs font-medium">
                          <XCircle className="h-3 w-3" />
                          Denied
                        </span>
                      )}
                      {request.status === "pending" && (
                        <span className="inline-block px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200 text-xs font-medium">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {request.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAccept(request.id)}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition-colors"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDeny(request.id)}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md transition-colors"
                          >
                            Deny
                          </button>
                        </div>
                      )}
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
