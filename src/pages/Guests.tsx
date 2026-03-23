import { useState } from "react";
import { guests } from "@/lib/mock-data";
import { analyzeGuest, getScoreBgColor, getRoomColor, generateGuestOffer } from "@/lib/scoring";
import { Guest, GuestScore } from "@/lib/types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Search, Filter, Sparkles, X, Send, ChevronRight } from "lucide-react";

const statusSteps = ['Créé', 'Lobby', 'KPIs collectés', 'Offre envoyée', 'Converti'] as const;

export default function Guests() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [offerModal, setOfferModal] = useState<{ guest: Guest; analysis: GuestScore } | null>(null);

  const filtered = guests.filter(g => {
    const matchSearch = g.name.toLowerCase().includes(search.toLowerCase()) || g.id.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || g.type_client === filterType;
    return matchSearch && matchType;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gestion Guests</h1>
        <p className="text-sm text-muted-foreground">Analyse IA et conversion des prospects</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher un guest..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'Entreprise', 'Institution'].map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filterType === t ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}
            >
              {t === 'all' ? 'Tous' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">ID</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Nom</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Type</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Session</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Room Vue</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Score IA</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Room Recommandée</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Statut</th>
                <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest, i) => {
                const analysis = analyzeGuest(guest);
                return (
                  <tr
                    key={guest.id}
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors animate-slide-up"
                    style={{ animationDelay: `${i * 50}ms` }}
                    onClick={() => setSelectedGuest(selectedGuest?.id === guest.id ? null : guest)}
                  >
                    <td className="p-4 font-mono text-xs text-muted-foreground">{guest.id}</td>
                    <td className="p-4 font-medium text-foreground">{guest.name}</td>
                    <td className="p-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{guest.type_client}</span>
                    </td>
                    <td className="p-4 font-mono text-xs">{guest.session_duration} min</td>
                    <td className="p-4 text-xs">{guest.most_viewed_room}</td>
                    <td className="p-4">
                      <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${getScoreBgColor(analysis.level)}`}>
                        {analysis.score}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoomColor(analysis.recommended_room)}`}>
                        {analysis.recommended_room}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${guest.status === 'Converti' ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {guest.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={e => { e.stopPropagation(); setOfferModal({ guest, analysis }); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"
                      >
                        <Sparkles className="h-3 w-3" />
                        Offre IA
                      </button>
                    </td>
                  </tr>
                );
              })}
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

          {/* Timeline */}
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

          {/* KPI Bars */}
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Session (min)', value: selectedGuest.session_duration, fill: '#06B6D4' },
                { name: 'Interactions', value: selectedGuest.interaction_count, fill: '#8B5CF6' },
                { name: 'Voice (min)', value: selectedGuest.voice_interaction_time, fill: '#10B981' },
                { name: 'Idle (min)', value: selectedGuest.idle_time, fill: '#EF4444' },
              ]}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(217 33% 17%)', border: '1px solid hsl(215 25% 27%)', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Offer Modal */}
      {offerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setOfferModal(null)}>
          <div className="glass-card max-w-lg w-full p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Offre Personnalisée IA</h3>
              </div>
              <button onClick={() => setOfferModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Guest:</span>
                <span className="font-medium text-foreground">{offerModal.guest.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Score:</span>
                <span className={`font-mono font-bold px-2 py-0.5 rounded ${getScoreBgColor(offerModal.analysis.level)}`}>
                  {offerModal.analysis.score}/100
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Room:</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoomColor(offerModal.analysis.recommended_room)}`}>
                  {offerModal.analysis.recommended_room}
                </span>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <p className="text-sm text-foreground leading-relaxed">{offerModal.analysis.offer}</p>
              </div>

              <button className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors">
                <Send className="h-4 w-4" />
                Envoyer via Chatbot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
