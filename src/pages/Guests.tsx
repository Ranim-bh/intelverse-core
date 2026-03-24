import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { guests, MOCK_GUESTS } from "@/lib/mock-data";
import { analyzeGuest, getScoreBgColor, getRoomColor } from "@/lib/scoring";
import { Guest, GuestScore, GuestWithOffer } from "@/lib/types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Search, Sparkles, X, Send, ChevronRight, Package, Brain, Layers } from "lucide-react";

const statusSteps = ['Créé', 'Lobby', 'KPIs collectés', 'Offre envoyée', 'Converti'] as const;

const statusColors: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-700 border-yellow-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  sent:     'bg-blue-100 text-blue-700 border-blue-200',
  accepted: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

const confidenceColor = (score: number) => {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  return 'text-red-500';
};

export default function Guests() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [offerModal, setOfferModal] = useState<{ guest: Guest; analysis: GuestScore; aiGuest: GuestWithOffer | undefined } | null>(null);

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
                const aiGuest = MOCK_GUESTS.find(g => g.id === guest.id);
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
                        onClick={e => { e.stopPropagation(); setOfferModal({ guest, analysis, aiGuest }); }}
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
                <Tooltip contentStyle={{ backgroundColor: 'hsl(217 33% 17%)', border: '1px solid hsl(215 25% 27%)', borderRadius: '8px', fontSize: '12px' }} />
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
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Pack IA Généré</h3>
                    <p className="text-indigo-200 text-xs">Offre personnalisée pour ce client</p>
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
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${statusColors[offerModal.aiGuest.generatedOffer.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {offerModal.aiGuest.generatedOffer.status}
                  </span>
                </div>

                {/* Pack title */}
                <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="h-4 w-4 text-indigo-500" />
                    <p className="text-[10px] font-bold text-indigo-400 uppercase">Nom du Pack</p>
                  </div>
                  <p className="text-lg font-black text-indigo-900">{offerModal.aiGuest.generatedOffer.title}</p>
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
                        <span key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-medium">
                          <Layers className="h-2.5 w-2.5" />
                          {room}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* AI Reason */}
                <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-4 w-4 text-violet-500" />
                    <p className="text-[10px] font-bold text-violet-400 uppercase">Raisonnement IA</p>
                  </div>
                  <p className="text-xs text-violet-800 italic leading-relaxed">"{offerModal.aiGuest.generatedOffer.reason}"</p>
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
                      className="h-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                      style={{ width: `${offerModal.aiGuest.generatedOffer.confidenceScore}%` }}
                    />
                  </div>
                </div>

                {/* CTA */}
                <button className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 text-sm font-bold transition-colors shadow-sm shadow-indigo-200">
                  <Send className="h-4 w-4" />
                  Envoyer l'offre via Chatbot
                </button>
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
                <button className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-indigo-700 transition-colors">
                  <Send className="h-4 w-4" />
                  Envoyer via Chatbot
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
