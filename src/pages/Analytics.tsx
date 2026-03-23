import { businessMetrics, partners } from "@/lib/mock-data";
import { ROOM_HEX_COLORS } from "@/lib/scoring";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, ResponsiveContainer, Cell, Legend,
} from "recharts";

// Radar data: aggregate room stats
const radarData = [
  { metric: 'Sessions', Training: 20, Showcase: 20, Opportunity: 15, Pitch: 16 },
  { metric: 'Participants', Training: 58, Showcase: 0, Opportunity: 0, Pitch: 100 },
  { metric: 'Rating', Training: 80, Showcase: 82, Opportunity: 85, Pitch: 94 },
  { metric: 'Engagement', Training: 70, Showcase: 78, Opportunity: 80, Pitch: 92 },
];

// Scatter data: LTV vs CAC
const scatterData = businessMetrics.map((m, i) => ({
  cac: m.cac,
  ltv: m.ltv,
  month: m.month,
  type: i % 2 === 0 ? 'Entreprise' : 'Institution',
}));

// Cohort heatmap data
const cohortMonths = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun'];
const cohortData = [
  [100, 85, 72, 65, 60, 55],
  [100, 88, 78, 70, 64, 0],
  [100, 90, 82, 75, 0, 0],
  [100, 92, 85, 0, 0, 0],
  [100, 94, 0, 0, 0, 0],
  [100, 0, 0, 0, 0, 0],
];

function getHeatColor(value: number): string {
  if (value === 0) return 'transparent';
  if (value >= 90) return '#06B6D4';
  if (value >= 75) return '#0891B2';
  if (value >= 60) return '#0E7490';
  if (value >= 45) return '#155E75';
  return '#164E63';
}

export default function Analytics() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytiques</h1>
        <p className="text-sm text-muted-foreground">Analyse comparative et tendances</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Comparaison des 4 Rooms</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(215 25% 22%)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} />
              <PolarRadiusAxis tick={{ fontSize: 9, fill: 'hsl(215 20% 65%)' }} />
              <Radar name="Training" dataKey="Training" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.15} strokeWidth={2} />
              <Radar name="Showcase" dataKey="Showcase" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.15} strokeWidth={2} />
              <Radar name="Opportunity" dataKey="Opportunity" stroke="#10B981" fill="#10B981" fillOpacity={0.15} strokeWidth={2} />
              <Radar name="Pitch" dataKey="Pitch" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.15} strokeWidth={2} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Scatter Plot: LTV vs CAC */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">LTV vs CAC</h3>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 25% 22%)" />
              <XAxis dataKey="cac" name="CAC" unit="€" tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
              <YAxis dataKey="ltv" name="LTV" unit="€" tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(217 33% 17%)', border: '1px solid hsl(215 25% 27%)', borderRadius: '8px', fontSize: '11px' }}
                formatter={(value: number, name: string) => [`€${value}`, name]}
              />
              <Scatter data={scatterData.filter(d => d.type === 'Entreprise')} name="Entreprise" fill="#06B6D4">
                {scatterData.filter(d => d.type === 'Entreprise').map((_, i) => (
                  <Cell key={i} fill="#06B6D4" />
                ))}
              </Scatter>
              <Scatter data={scatterData.filter(d => d.type === 'Institution')} name="Institution" fill="#8B5CF6">
                {scatterData.filter(d => d.type === 'Institution').map((_, i) => (
                  <Cell key={i} fill="#8B5CF6" />
                ))}
              </Scatter>
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart: Conversions */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Conversions par Mois</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={businessMetrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 25% 22%)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} unit="%" />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(217 33% 17%)', border: '1px solid hsl(215 25% 27%)', borderRadius: '8px', fontSize: '11px' }} />
              <Bar dataKey="conversion_rate" name="Taux de conversion" radius={[6, 6, 0, 0]}>
                {businessMetrics.map((_, i) => (
                  <Cell key={i} fill={`hsl(187, 72%, ${35 + i * 5}%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cohort Retention Heatmap */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Rétention par Cohorte</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-[10px] text-muted-foreground p-2 text-left">Cohorte</th>
                  {cohortMonths.map(m => (
                    <th key={m} className="text-[10px] text-muted-foreground p-2 text-center">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohortData.map((row, ri) => (
                  <tr key={ri}>
                    <td className="text-[10px] font-medium text-foreground p-2">{cohortMonths[ri]}</td>
                    {row.map((val, ci) => (
                      <td key={ci} className="p-1">
                        {val > 0 ? (
                          <div
                            className="rounded text-center py-2 text-[10px] font-mono font-medium text-white"
                            style={{ backgroundColor: getHeatColor(val) }}
                          >
                            {val}%
                          </div>
                        ) : (
                          <div className="rounded py-2 text-center text-[10px] text-muted-foreground/30">—</div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
