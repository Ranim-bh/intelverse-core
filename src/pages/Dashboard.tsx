import { DollarSign, Target, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { businessMetrics, guests, partners, churnProfiles } from "@/lib/mock-data";
import { analyzeGuest, getRiskBadgeColor } from "@/lib/scoring";

const latestMetric = businessMetrics[businessMetrics.length - 1];
const prevMetric = businessMetrics[businessMetrics.length - 2];

const mrrTrend = Math.round(((latestMetric.mrr - prevMetric.mrr) / prevMetric.mrr) * 100);
const cacTrend = Math.round(((latestMetric.cac - prevMetric.cac) / prevMetric.cac) * 100);
const ltvTrend = Math.round(((latestMetric.ltv - prevMetric.ltv) / prevMetric.ltv) * 100);

const totalGuests = guests.length;
const convertedGuests = guests.filter(g => g.status === 'Converti').length;
const totalPartners = partners.length;
const fiablePartners = partners.filter(p => p.level === 'Partenaire Fiable').length;
const atRiskProfiles = churnProfiles.filter(c => !c.recovered && (c.risk_level === 'high' || c.risk_level === 'critical'));

export default function Dashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Vue globale de la performance TalentVerse</p>
      </div>

      {/* Alert Bar */}
      {atRiskProfiles.length > 0 && (
        <div className="glass-card border-destructive/40 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-medium text-destructive">
              {atRiskProfiles.length} profil(s) à risque churn nécessitent une action
            </span>
          </div>
          <div className="flex gap-2">
            {atRiskProfiles.map(p => (
              <span key={p.id} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getRiskBadgeColor(p.risk_level)}`}>
                {p.name.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard title="MRR" value={latestMetric.mrr} prefix="€" icon={DollarSign} trend={mrrTrend} />
        <KpiCard title="CAC" value={latestMetric.cac} prefix="€" icon={Target} trend={-cacTrend} />
        <KpiCard title="LTV" value={latestMetric.ltv} prefix="€" icon={TrendingUp} trend={ltvTrend} />
        <KpiCard title="Churn Rate" value={latestMetric.churn_rate} suffix="%" icon={AlertTriangle} alert={latestMetric.churn_rate > 10} decimals={1} />
        <KpiCard title="Conversion" value={latestMetric.conversion_rate} suffix="%" icon={BarChart3} trend={Math.round(((latestMetric.conversion_rate - prevMetric.conversion_rate) / prevMetric.conversion_rate) * 100)} />
      </div>

      {/* Funnel + MRR Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-6">Funnel de Conversion</h3>
          <div className="space-y-4">
            {[
              { label: 'Guests', count: totalGuests, pct: 100, color: 'bg-primary' },
              { label: 'Partenaires', count: totalPartners, pct: Math.round((totalPartners / totalGuests) * 100), color: 'bg-success' },
              { label: 'Partenaires Fiables', count: fiablePartners, pct: Math.round((fiablePartners / totalGuests) * 100), color: 'bg-room-showcase' },
            ].map((step, i) => (
              <div key={step.label} className="animate-slide-up" style={{ animationDelay: `${i * 150}ms` }}>
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs font-medium text-foreground">{step.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{step.count} ({step.pct}%)</span>
                </div>
                <div className="h-8 bg-muted rounded-lg overflow-hidden">
                  <div
                    className={`h-full ${step.color} rounded-lg transition-all duration-1000 ease-out flex items-center justify-end pr-2`}
                    style={{ width: `${step.pct}%` }}
                  >
                    <span className="text-[10px] font-bold text-white">{step.pct}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* MRR Chart */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">MRR — Évolution 6 mois</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={businessMetrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(195 22% 84%)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(195 22% 38%)' }} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(195 22% 38%)' }} axisLine={false} tickFormatter={v => `€${v / 1000}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(0 0% 100%)', border: '1px solid hsl(195 22% 84%)', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: 'hsl(195 60% 11%)' }}
                itemStyle={{ color: '#06B6D4' }}
                formatter={(value: number) => [`€${value.toLocaleString()}`, 'MRR']}
              />
              <Line type="monotone" dataKey="mrr" stroke="#06B6D4" strokeWidth={2.5} dot={{ fill: '#06B6D4', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Activité Récente</h3>
        <div className="space-y-3">
          {[
            { text: `${guests[0].name} — Score IA: ${analyzeGuest(guests[0]).score}/100 → ${analyzeGuest(guests[0]).recommended_room}`, time: 'Il y a 2h', type: 'offer' },
            { text: `Signal churn détecté: ${churnProfiles[3].name} (${churnProfiles[3].signals.join(', ')})`, time: 'Il y a 4h', type: 'churn' },
            { text: `${partners[2].name} — engagement score: ${partners[2].engagement_score}%`, time: 'Il y a 6h', type: 'partner' },
            { text: `Nouveau guest: ${guests[4].name} — session ${guests[4].session_duration}min`, time: 'Il y a 8h', type: 'guest' },
          ].map((activity, i) => (
            <div key={i} className="flex items-center gap-3 text-sm py-2 border-b border-border last:border-0">
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                activity.type === 'churn' ? 'bg-destructive' :
                activity.type === 'offer' ? 'bg-primary' :
                activity.type === 'partner' ? 'bg-success' : 'bg-warning'
              }`} />
              <span className="text-foreground flex-1">{activity.text}</span>
              <span className="text-xs text-muted-foreground shrink-0">{activity.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
