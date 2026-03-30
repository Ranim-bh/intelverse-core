import { useEffect, useState } from "react";
import { useAppData } from "@/lib/db-client";
import { getRiskColor, getRiskBadgeColor, signalDescriptions } from "@/lib/scoring";
import { RiskLevel, ChurnProfile } from "@/lib/types";
import { ShieldAlert, MessageSquare, Bell, Archive, Settings2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const riskColumns: { level: RiskLevel; label: string; icon: typeof ShieldAlert }[] = [
  { level: 'low', label: 'Low', icon: ShieldAlert },
  { level: 'medium', label: 'Medium', icon: ShieldAlert },
  { level: 'high', label: 'High', icon: ShieldAlert },
  { level: 'critical', label: 'Critical', icon: ShieldAlert },
];

export default function AntiChurn() {
  const { data, loading, error } = useAppData();
  const [profiles, setProfiles] = useState<ChurnProfile[]>([]);
  const [showConfig, setShowConfig] = useState(false);

  const churnProfiles = data.churnProfiles;

  useEffect(() => {
    setProfiles(churnProfiles);
  }, [churnProfiles]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Chargement des donnees...</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive">Erreur donnees: {error}</div>;
  }

  const recovered = profiles.filter(p => p.recovered).length;
  const total = profiles.length;
  const recoveryRate = total > 0 ? Math.round((recovered / total) * 100) : 0;

  const handleAction = (profileId: string, action: string) => {
    setProfiles(prev => prev.map(p =>
      p.id === profileId ? { ...p, last_action: action } : p
    ));
    toast.success(`Action "${action}" exécutée avec succès`);
  };

  const getProfilesByRisk = (level: RiskLevel) => profiles.filter(p => p.risk_level === level && !p.recovered);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Module Anti-Churn</h1>
          <p className="text-sm text-muted-foreground">Détection et prévention du churn en temps réel</p>
        </div>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings2 className="h-4 w-4" />
          Config
        </button>
      </div>

      {/* Recovery Rate */}
      <div className="glass-card p-5 flex items-center gap-4">
        <div className="p-3 rounded-xl bg-success/10">
          <TrendingUp className="h-5 w-5 text-success" />
        </div>
        <div className="flex-1">
          <div className="text-xs text-muted-foreground mb-1">Taux de récupération global</div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl font-bold text-foreground">{recoveryRate}%</span>
            <div className="flex-1 h-2 bg-muted rounded-full">
              <div className="h-full bg-success rounded-full transition-all" style={{ width: `${recoveryRate}%` }} />
            </div>
            <span className="font-mono text-xs text-muted-foreground">{recovered}/{total}</span>
          </div>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="glass-card p-6 animate-slide-up">
          <h3 className="text-sm font-semibold text-foreground mb-4">Configuration des seuils</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Session min (Guest)', value: 5, unit: 'min' },
              { label: 'Idle max (Guest)', value: 2, unit: 'min' },
              { label: 'Inactivité rooms (Partner)', value: 7, unit: 'jours' },
              { label: 'Engagement min (Fiable)', value: 60, unit: '%' },
            ].map(config => (
              <div key={config.label} className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{config.label}</span>
                  <span className="font-mono text-foreground">{config.value} {config.unit}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={config.unit === '%' ? 100 : 30}
                  defaultValue={config.value}
                  className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {riskColumns.map(col => {
          const colProfiles = getProfilesByRisk(col.level);
          return (
            <div key={col.level} className="space-y-3">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${getRiskColor(col.level)}`}>
                <span className={`w-2 h-2 rounded-full ${getRiskBadgeColor(col.level)}`} />
                <span className="text-xs font-semibold uppercase">{col.label}</span>
                <span className="ml-auto font-mono text-xs">{colProfiles.length}</span>
              </div>

              <div className="space-y-3">
                {colProfiles.map((profile, i) => (
                  <ChurnCard
                    key={profile.id}
                    profile={profile}
                    onAction={handleAction}
                    delay={i * 80}
                  />
                ))}
                {colProfiles.length === 0 && (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    Aucun profil
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChurnCard({ profile, onAction, delay }: { profile: ChurnProfile; onAction: (id: string, action: string) => void; delay: number }) {
  return (
    <div className="glass-card p-4 animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="text-sm font-medium text-foreground">{profile.name}</h4>
          <span className="text-[10px] text-muted-foreground">{profile.profile_type} • {profile.id}</span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">{profile.days_since_signal}j</span>
      </div>

      {/* Signal badges */}
      <div className="flex flex-wrap gap-1 mb-3">
        {profile.signals.map(signal => (
          <span
            key={signal}
            className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
            title={signalDescriptions[signal]}
          >
            {signal}
          </span>
        ))}
      </div>

      {profile.last_action && (
        <div className="text-[10px] text-muted-foreground mb-2 italic">
          Dernière action: {profile.last_action}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1.5">
        <button
          onClick={() => onAction(profile.id, 'Relance chatbot envoyée')}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-primary/10 text-primary rounded text-[10px] font-medium hover:bg-primary/20 transition-colors"
          title="Envoyer chatbot"
        >
          <MessageSquare className="h-3 w-3" />
          Chatbot
        </button>
        <button
          onClick={() => onAction(profile.id, 'Alerte admin envoyée')}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-warning/10 text-warning rounded text-[10px] font-medium hover:bg-warning/20 transition-colors"
          title="Alerter admin"
        >
          <Bell className="h-3 w-3" />
          Admin
        </button>
        <button
          onClick={() => onAction(profile.id, 'Archivé CRM')}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-muted text-muted-foreground rounded text-[10px] font-medium hover:bg-muted/80 transition-colors"
          title="Archiver CRM"
        >
          <Archive className="h-3 w-3" />
          CRM
        </button>
      </div>
    </div>
  );
}
