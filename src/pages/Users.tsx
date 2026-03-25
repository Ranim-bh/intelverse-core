import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { users, MOCK_GUESTS } from "@/lib/mock-data";
import { analyzeGuest, getScoreBgColor } from "@/lib/scoring";
import { getOfferStatusBadgeClasses, getOfferStatusLabel } from "@/lib/offer-status";
import { Guest, GuestScore, GuestWithOffer, UserRole, UserSource } from "@/lib/types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Search, Sparkles, X, Mail, ChevronRight, Package, Brain, Layers, Instagram, Youtube, Linkedin } from "lucide-react";

const statusSteps = ['Créé', 'Lobby', 'KPIs collectés', 'Offre envoyée', 'Converti'] as const;

const getGuestStatusBadgeClasses = (status: string) => {
  if (status === 'Offre envoyée') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (status === 'Converti') return 'bg-green-100 text-green-700 border-green-200';
  if (status === 'Supprimée') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-yellow-100 text-yellow-700 border-yellow-200';
};

const getGuestStatusLabel = (status: string) => {
  if (status === 'Offre envoyée') return '🔵 Offre Envoyée';
  if (status === 'Converti') return '🟢 Offre Acceptée';
  if (status === 'Supprimée') return '🔴 Offre Supprimée';
  return '🟡 Offre Générée';
};

const confidenceColor = (score: number) => {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  return 'text-red-500';
};

const roleBadgeClasses: Record<UserRole, string> = {
  Guest: 'bg-slate-100 text-slate-700 border-slate-200',
  Client: 'bg-blue-100 text-blue-700 border-blue-200',
  Partner: 'bg-purple-100 text-purple-700 border-purple-200',
};

const sourceBadgeClasses: Record<UserSource, string> = {
  LinkedIn: 'bg-blue-100 text-blue-700 border-blue-200',
  Facebook: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Instagram: 'bg-pink-100 text-pink-700 border-pink-200',
  Twitter: 'bg-sky-100 text-sky-700 border-sky-200',
  YouTube: 'bg-red-100 text-red-700 border-red-200',
};

const sourceFilters: Array<'all' | UserSource> = ['all', 'LinkedIn', 'Facebook', 'Instagram', 'Twitter', 'YouTube'];

const getSourceIcon = (source: UserSource) => {
  if (source === 'LinkedIn') return <Linkedin className="h-3 w-3" />;
  if (source === 'Facebook') return <span className="text-[11px] font-bold leading-none">f</span>;
  if (source === 'Instagram') return <Instagram className="h-3 w-3" />;
  if (source === 'Twitter') return <span className="text-[11px] font-bold leading-none">X</span>;
  return <Youtube className="h-3 w-3" />;
};

type OfferActionState = 'generate' | 'view';

const getOfferActionState = (guest: Guest, guestWithOffer: GuestWithOffer | undefined): OfferActionState => {
  if (guest.status === 'Converti') return 'view';
  if (!guestWithOffer) return 'generate';
  
  const rawStatus = String(guestWithOffer.generatedOffer.status);

  if (rawStatus === 'accepted' || rawStatus === 'Offre Acceptée') {
    return 'view';
  }

  if (rawStatus === 'sent' || rawStatus === 'Offre Envoyée') {
    return 'view';
  }

  if (rawStatus === 'pending' || rawStatus === 'approved' || rawStatus === 'READY' || rawStatus === 'DRAFT' || rawStatus === 'PENDING' || rawStatus === 'Offre Générée' || rawStatus === 'rejected' || rawStatus === 'Offre Refusée') {
    return 'generate';
  }

  return 'generate';
};

const shouldHideOfferCta = (status: string) => {
  const rawStatus = String(status);
  return rawStatus === 'sent' ||
    rawStatus === 'accepted' ||
    rawStatus === 'rejected' ||
    rawStatus === 'Offre Envoyée' ||
    rawStatus === 'Offre Acceptée' ||
    rawStatus === 'Offre Refusée';
};

export default function Users() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<'all' | UserSource>('all');
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [offerModal, setOfferModal] = useState<{ guest: Guest; analysis: GuestScore; aiGuest: GuestWithOffer | undefined } | null>(null);

  const filtered = users.filter(g => {
    const matchSearch = g.name.toLowerCase().includes(search.toLowerCase()) || g.id.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'all' || g.role === filterRole;
    const matchSource = filterSource === 'all' || g.source === filterSource;
    return matchSearch && matchRole && matchSource;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">Unified list of guests, clients and partners.</p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search a user..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase pt-2">Role:</span>
            {['all', 'Guest', 'Client', 'Partner'].map(r => (
              <button
                key={r}
                onClick={() => setFilterRole(r)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  filterRole === r ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {r === 'all' ? 'All Roles' : r}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground uppercase pt-2">Source:</span>
            {sourceFilters.map((source) => (
              <button
                key={source}
                onClick={() => setFilterSource(source)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  filterSource === source ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {source === 'all' ? 'Tous' : source}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results counter */}
      <div className="text-sm text-muted-foreground">
        Showing {filtered.length} user{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">ID</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Nom</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Role</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Source</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Type</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Session</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Domaine</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Score IA</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Statut</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    No users found matching your filters.
                  </td>
                </tr>
              ) : (
              filtered.map((guest, i) => {
                const analysis = analyzeGuest(guest);
                const aiGuest = MOCK_GUESTS.find(g => g.id === guest.id);
                const offerActionState = getOfferActionState(guest, aiGuest);
                return (
                  <tr
                    key={guest.id}
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors animate-slide-up"
                    style={{ animationDelay: `${i * 50}ms` }}
                    onClick={() => navigate(`/guests/${guest.id}`)}
                  >
                    <td className="p-4 font-mono text-xs text-muted-foreground">{guest.id}</td>
                    <td className="p-4 font-medium text-foreground">{guest.name}</td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${roleBadgeClasses[guest.role]}`}>
                        {guest.role}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${sourceBadgeClasses[guest.source]}`}>
                        {getSourceIcon(guest.source)}
                        {guest.source}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{guest.type_client}</span>
                    </td>
                    <td className="p-4 font-mono text-xs">{guest.session_duration} min</td>
                    <td className="p-4 text-xs">{guest.domain}</td>
                    <td className="p-4">
                      <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${getScoreBgColor(analysis.level)}`}>
                        {analysis.score}
                      </span>
                    </td>
                    <td className="p-4">
                      {aiGuest ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getOfferStatusBadgeClasses(aiGuest.generatedOffer.status)}`}>
                          {getOfferStatusLabel(aiGuest.generatedOffer.status)}
                        </span>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getGuestStatusBadgeClasses(guest.status)}`}>
                          {getGuestStatusLabel(guest.status)}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {offerActionState === 'generate' && (
                        <button
                          onClick={e => { e.stopPropagation(); setOfferModal({ guest, analysis, aiGuest }); }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"
                        >
                          <Sparkles className="h-3 w-3" />
                          Generate Offer
                        </button>
                      )}
                      {offerActionState === 'view' && (
                        <button
                          onClick={e => { e.stopPropagation(); setOfferModal({ guest, analysis, aiGuest }); }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors"
                        >
                          👁️ View Offre
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Guest Detail Panel */}
      {selectedGuest && (
        <div className="glass-card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Détail — {selectedGuest.name}</h3>
            <button onClick={() => setSelectedGuest(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
            {statusSteps.map((step, i) => {
              const stepIndex = statusSteps.indexOf(selectedGuest.status);
              const isComplete = i <= stepIndex;
              const isCurrent = i === stepIndex;
              return (
                <div key={step} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                    isCurrent ? 'bg-primary text-primary-foreground' :
                    isComplete ? 'bg-success/20 text-success' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {step}
                  </div>
                  {i < statusSteps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground mx-1 shrink-0" />}
                </div>
              );
            })}
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Session (min)', value: selectedGuest.session_duration },
                { name: 'Interactions', value: selectedGuest.interaction_count },
                { name: 'Voice (min)', value: selectedGuest.voice_interaction_time },
                { name: 'Idle (min)', value: selectedGuest.idle_time },
              ]}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(0 0% 100%)', border: '1px solid hsl(195 22% 84%)', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* AI Offer Modal */}
      {offerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setOfferModal(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>

            {/* Header gradient */}
            <div className="bg-gradient-to-r from-primary to-warning p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Pack IA Généré</h3>
                    <p className="text-red-100 text-xs">Offre personnalisée pour ce client</p>
                  </div>
                </div>
                <button onClick={() => setOfferModal(null)} className="text-white/70 hover:text-white transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {offerModal.aiGuest ? (
              <div className="p-6 space-y-5">

                {/* Client info */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-bold mb-0.5">Client</p>
                    <p className="font-semibold text-slate-800">{offerModal.aiGuest.fullName}</p>
                    <p className="text-xs text-slate-500">{offerModal.aiGuest.company}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${getOfferStatusBadgeClasses(offerModal.aiGuest.generatedOffer.status)}`}>
                    {getOfferStatusLabel(offerModal.aiGuest.generatedOffer.status)}
                  </span>
                </div>

                {/* Pack title */}
                <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="h-4 w-4 text-red-600" />
                    <p className="text-[10px] font-bold text-red-500 uppercase">Nom du Pack</p>
                  </div>
                  <p className="text-lg font-black text-red-900">{offerModal.aiGuest.generatedOffer.title}</p>
                </div>

                {/* Sessions + Rooms */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Sessions incluses</p>
                    <p className="text-2xl font-black text-slate-900">{offerModal.aiGuest.generatedOffer.sessionsIncluded}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Rooms incluses</p>
                    <div className="flex flex-wrap gap-1.5">
                      {offerModal.aiGuest.generatedOffer.roomsIncluded.map((room, idx) => (
                        <span key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">
                          <Layers className="h-2.5 w-2.5" />
                          {room}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* AI Reason */}
                <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-4 w-4 text-red-600" />
                    <p className="text-[10px] font-bold text-red-500 uppercase">Raisonnement IA</p>
                  </div>
                  <p className="text-xs text-red-800 italic leading-relaxed">"{offerModal.aiGuest.generatedOffer.reason}"</p>
                </div>

                {/* Confidence score */}
                <div className="flex items-center justify-between px-1">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Score de confiance</p>
                    <p className={`text-2xl font-black ${confidenceColor(offerModal.aiGuest.generatedOffer.confidenceScore)}`}>
                      {offerModal.aiGuest.generatedOffer.confidenceScore}%
                    </p>
                  </div>
                  <div className="w-32 bg-slate-100 rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-primary to-warning"
                      style={{ width: `${offerModal.aiGuest.generatedOffer.confidenceScore}%` }}
                    />
                  </div>
                </div>

                {/* CTA */}
                {!shouldHideOfferCta(String(offerModal.aiGuest.generatedOffer.status)) && (
                  <button className="w-full flex items-center justify-center gap-2 bg-primary hover:opacity-90 text-primary-foreground rounded-xl py-3 text-sm font-bold transition-colors shadow-sm">
                    <Mail className="h-4 w-4" />
                    Envoyer via Email
                  </button>
                )}
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">Guest :</span>
                  <span className="font-medium text-slate-800">{offerModal.guest.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">Score :</span>
                  <span className={`font-mono font-bold px-2 py-0.5 rounded ${getScoreBgColor(offerModal.analysis.level)}`}>
                    {offerModal.analysis.score}/100
                  </span>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                  <p className="text-sm text-slate-700 leading-relaxed">{offerModal.analysis.offer}</p>
                </div>
                <button className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-bold hover:opacity-90 transition-colors">
                  <Mail className="h-4 w-4" />
                  Envoyer via Email
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
