import { useState } from "react";
import { useAppData } from "@/lib/db-client";
import { getUpsellRecommendation, getRoomColor, ROOM_HEX_COLORS } from "@/lib/scoring";
import { Partner, RoomName } from "@/lib/types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Award, TrendingUp, Sparkles, X, Send, Star } from "lucide-react";

const allRooms: RoomName[] = ['Training Center', 'Showcase Room', 'Opportunity Room', 'Pitch Room'];

export default function Partners() {
  const { data } = useAppData();
  const partners = data.partners;
  const [upsellModal, setUpsellModal] = useState<{ partner: Partner; room: RoomName; reason: string } | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gestion Partenaires</h1>
        <p className="text-sm text-muted-foreground">Suivi d'engagement et upselling par room</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {partners.map((partner, i) => {
          const upsell = getUpsellRecommendation(partner);
          return (
            <div key={partner.id} className="glass-card p-6 animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{partner.name}</h3>
                    {partner.level === 'Partenaire Fiable' && (
                      <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-success/20 text-success font-medium border border-success/30">
                        <Award className="h-3 w-3" />
                        Fiable
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{partner.type_client} • {partner.id}</span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xl font-bold text-foreground">{partner.engagement_score}%</div>
                  <span className="text-[10px] text-muted-foreground">Engagement</span>
                </div>
              </div>

              {/* Subscribed Rooms */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {allRooms.map(room => {
                  const subscribed = partner.subscribed_rooms.includes(room);
                  return (
                    <span
                      key={room}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${subscribed ? getRoomColor(room) : 'bg-muted/50 text-muted-foreground/50 line-through'}`}
                    >
                      {room.replace(' Room', '').replace(' Center', '')}
                    </span>
                  );
                })}
              </div>

              {/* KPI Mini Chart */}
              <div className="h-36 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={partner.kpis.map(k => ({
                    room: k.room.split(' ')[0],
                    sessions: k.sessions,
                    rating: k.avg_rating,
                    fill: ROOM_HEX_COLORS[k.room],
                  }))}>
                    <XAxis dataKey="room" tick={{ fontSize: 9, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(217 33% 17%)', border: '1px solid hsl(215 25% 27%)', borderRadius: '8px', fontSize: '11px' }} />
                    <Bar dataKey="sessions" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Rating */}
              <div className="flex items-center gap-4 mb-4">
                {partner.kpis.map(k => (
                  <div key={k.room} className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-warning fill-warning" />
                    <span className="font-mono text-xs text-foreground">{k.avg_rating}</span>
                    <span className="text-[9px] text-muted-foreground">{k.room.split(' ')[0]}</span>
                  </div>
                ))}
              </div>

              {/* Upsell Button */}
              {upsell && !partner.upsell_done && (
                <button
                  onClick={() => setUpsellModal({ partner, room: upsell.room, reason: upsell.reason })}
                  className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary rounded-lg py-2 text-xs font-medium hover:bg-primary/20 transition-colors"
                >
                  <TrendingUp className="h-3 w-3" />
                  Générer offre upselling → {upsell.room}
                </button>
              )}
              {partner.upsell_done && (
                <div className="text-center text-[10px] text-success font-medium py-2">
                  ✓ Upselling complété — toutes les rooms souscrites
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Upsell Modal */}
      {upsellModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setUpsellModal(null)}>
          <div className="glass-card max-w-lg w-full p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Offre Upselling</h3>
              </div>
              <button onClick={() => setUpsellModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Partenaire: <span className="text-foreground font-medium">{upsellModal.partner.name}</span></p>
              <p className="text-sm text-muted-foreground">Room proposée: <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRoomColor(upsellModal.room)}`}>{upsellModal.room}</span></p>
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <p className="text-sm text-foreground">{upsellModal.reason}</p>
              </div>
              <button className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors">
                <Send className="h-4 w-4" />
                Envoyer proposition
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
