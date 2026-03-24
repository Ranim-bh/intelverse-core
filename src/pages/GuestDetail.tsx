import { useParams, useNavigate } from "react-router-dom";
import { guests } from "@/lib/mock-data";
import { analyzeGuest, getScoreBgColor, getRoomColor, generateGuestOffer, ROOM_HEX_COLORS } from "@/lib/scoring";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowLeft, ChevronRight, Sparkles, Edit, Brain, StickyNote, Zap } from "lucide-react";

const statusSteps = ['Créé', 'Lobby', 'KPIs collectés', 'Offre envoyée', 'Converti'] as const;

export default function GuestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const guest = guests.find(g => g.id === id);
  if (!guest) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Guest introuvable</p>
        <button onClick={() => navigate('/guests')} className="text-primary text-sm hover:underline">← Retour aux guests</button>
      </div>
    );
  }

  const analysis = analyzeGuest(guest);

  // Generated offer mock data derived from analysis
  const generatedOffer = {
    status: analysis.level === 'hot' ? 'READY' : analysis.level === 'warm' ? 'DRAFT' : 'PENDING',
    title: `Pack ${analysis.recommended_room}`,
    sessionsIncluded: analysis.score > 70 ? 12 : analysis.score >= 40 ? 6 : 3,
    roomsIncluded: analysis.score > 70
      ? ['Training Center', 'Showcase Room', analysis.recommended_room]
      : [analysis.recommended_room],
    reason: analysis.offer,
    confidenceScore: Math.min(99, analysis.score + 10),
  };

  const kpiCards = [
    { label: 'Score IA', value: `${analysis.score}/100`, color: analysis.level === 'hot' ? 'text-success' : analysis.level === 'warm' ? 'text-warning' : 'text-destructive' },
    { label: 'Session', value: `${guest.session_duration} min`, color: 'text-primary' },
    { label: 'Interactions', value: String(guest.interaction_count), color: 'text-room-showcase' },
    { label: 'Voice', value: `${guest.voice_interaction_time} min`, color: 'text-success' },
    { label: 'Idle', value: `${guest.idle_time} min`, color: 'text-destructive' },
    { label: 'Rooms Vues', value: String(guest.rooms_viewed.length), color: 'text-room-training' },
  ];

  const chartData = [
    { name: 'Session (min)', value: guest.session_duration, fill: '#06B6D4' },
    { name: 'Interactions', value: guest.interaction_count, fill: '#8B5CF6' },
    { name: 'Voice (min)', value: guest.voice_interaction_time, fill: '#10B981' },
    { name: 'Idle (min)', value: guest.idle_time, fill: '#EF4444' },
  ];

  const roomChartData = Object.entries(guest.room_observation_time).map(([room, time]) => ({
    name: room.replace(' Room', '').replace(' Center', ''),
    time,
    clicks: guest.room_click_rate[room] || 0,
    fill: ROOM_HEX_COLORS[room] || '#64748B',
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/guests')}
          className="p-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{guest.name}</h1>
          <p className="text-sm text-muted-foreground">{guest.id} · {guest.type_client} · Créé le {guest.created_at}</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full font-medium ${guest.status === 'Converti' ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
          {guest.status}
        </span>
      </div>

      {/* Status Timeline */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {statusSteps.map((step, i) => {
            const stepIndex = statusSteps.indexOf(guest.status);
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
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map(kpi => (
          <div key={kpi.label} className="glass-card p-4 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{kpi.label}</p>
            <p className={`font-mono text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Behavior Chart */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Comportement</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(217 33% 17%)', border: '1px solid hsl(215 25% 27%)', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Room Engagement Chart */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Engagement par Room</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roomChartData}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(217 33% 17%)', border: '1px solid hsl(215 25% 27%)', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="time" name="Temps (min)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="clicks" name="Clics" radius={[6, 6, 0, 0]} fill="#8B5CF6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Offer Card — PackageManagement style */}
      <div className="glass-card overflow-hidden">
        {/* Top section */}
        <div className="bg-muted/30 border-b border-border p-5 flex items-start justify-between">
          <div>
            <span className="inline-block text-[10px] uppercase tracking-widest font-semibold text-foreground border border-foreground/20 rounded px-2 py-0.5 mb-3">
              {generatedOffer.status}
            </span>
            <h3 className="text-xl font-bold text-foreground">{generatedOffer.title}</h3>
            <p className="text-xs text-muted-foreground mt-1">For: {guest.name} ({guest.type_client})</p>
          </div>
          <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <Edit className="h-4 w-4" />
          </button>
        </div>

        {/* Middle section */}
        <div className="p-6 space-y-4 flex-1">
          {/* Sessions row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Sessions</span>
            <span className="font-mono font-bold text-foreground">{generatedOffer.sessionsIncluded}</span>
          </div>

          {/* Included Rooms */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Included Rooms</p>
            <div className="flex flex-wrap gap-2">
              {generatedOffer.roomsIncluded.map(room => (
                <span key={room} className={`text-xs px-2.5 py-1 rounded-full font-medium ${getRoomColor(room)}`}>
                  {room}
                </span>
              ))}
            </div>
          </div>

          {/* AI Reason */}
          <div className="bg-primary/5 border border-primary/10 rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-wider text-primary mb-2">AI Reason</p>
            <p className="text-sm text-muted-foreground italic leading-relaxed">"{generatedOffer.reason}"</p>
          </div>
        </div>

        {/* Bottom section */}
        <div className="bg-muted/30 border-t border-border px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</p>
            <p className="font-mono text-lg font-black text-foreground">{generatedOffer.confidenceScore}%</p>
          </div>
          <button className="px-4 py-2 bg-card border border-border rounded-lg text-xs font-bold text-foreground hover:bg-muted transition-colors">
            Review Offer
          </button>
        </div>
      </div>

      {/* Bottom Row: AI Insights, Notes, Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* AI Insights */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">AI Insights</h3>
          </div>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              Room la plus visitée : <span className="text-foreground font-medium">{guest.most_viewed_room}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-success shrink-0" />
              Score de conversion : <span className={`font-mono font-bold ${analysis.level === 'hot' ? 'text-success' : analysis.level === 'warm' ? 'text-warning' : 'text-destructive'}`}>{analysis.level.toUpperCase()}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-room-showcase shrink-0" />
              Taux de personnalisation : <span className="text-foreground font-medium">{guest.customization_time} min</span>
            </li>
          </ul>
        </div>

        {/* Admin Notes */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <StickyNote className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold text-foreground">Notes Admin</h3>
          </div>
          <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground italic">
            Aucune note pour le moment. Cliquez pour ajouter une observation.
          </div>
        </div>

        {/* Recommended Actions */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-room-pitch" />
            <h3 className="text-sm font-semibold text-foreground">Actions Recommandées</h3>
          </div>
          <div className="space-y-2">
            <button className="w-full flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors">
              <Sparkles className="h-3 w-3" />
              Envoyer offre via Chatbot
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 bg-success/10 text-success rounded-lg text-xs font-medium hover:bg-success/20 transition-colors">
              <Zap className="h-3 w-3" />
              Planifier démo {analysis.recommended_room}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
