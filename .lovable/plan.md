

# IntelVerse — Full Platform Plan

## Design System
- Dark theme: background `#0F172A`, cards `#1E293B`, borders `#334155`
- Accent cyan `#06B6D4`, success `#10B981`, warning `#F59E0B`, danger `#EF4444`
- Room colors: Training `#3B82F6`, Showcase `#8B5CF6`, Opportunity `#10B981`, Pitch `#F59E0B`
- Fonts: Inter for UI, JetBrains Mono for numbers
- Cards with border-radius 12px, subtle backdrop-blur, count-up animations on KPIs

## Supabase Database (PostgreSQL)
Tables: `guests`, `partners`, `business_metrics`, `churn_signals`, `churn_actions`
- Seeded with the real data from the spec (G001-G003, P001-P003, Jan-Mar metrics)

## Sidebar Navigation
- Logo "IntelVerse" + nav links: Dashboard, Guests, Partners, Anti-Churn, Analytics
- Active state highlighting, collapsible on mobile

## Page 1 — `/dashboard` (Vue Globale)
- 5 KPI cards with count-up animations: MRR, CAC, LTV, Churn Rate (red badge if >10%), Conversion Rate
- Animated funnel visualization: Guests → Partenaires → Partenaires Fiables with percentages
- MRR line chart (6 months, Jan-Mar real + projection) using Recharts
- Alert bar showing at-risk churn profiles with red badges
- Recent activity feed: latest generated offers, detected signals

## Page 2 — `/guests` (Gestion Guests)
- Filterable/sortable table: guest_id, type_client, session duration, most viewed room, AI score (color-coded gauge), recommended room (badge), status
- Score calculated client-side using the exact formula: `(session×3) + (interactions×1.5) + (voice×8) + (rooms_viewed×5) + (clicks×4) - (idle×6)`
- "Generate Offer" modal: shows personalized offer based on IA rules, with send button
- Status timeline: Created → Lobby → KPIs Collected → Offer Sent → Converted
- Detail view with bar charts per guest (session, interactions, voice, idle)

## Page 3 — `/partners` (Gestion Partenaires)
- Partner cards showing: subscribed rooms, engagement score, upsell opportunity
- Mini bar charts per partner showing room-specific KPIs
- "Partenaire Fiable" badge when all rooms subscribed
- "Generate Upselling Offer" button applying the business rules from the spec

## Page 4 — `/anti-churn` (Module Anti-Churn)
- Kanban board with 4 columns: Low / Medium / High / Critical
- Cards showing: name, type (Guest/Partner/Fiable), active signals (G1-F4 badges), days since signal
- Quick actions: Send Chatbot / Alert Admin / Archive CRM
- Recovery rate metric (profiles retained after action)
- Signal threshold config with sliders

## Page 5 — `/analytics` (Analytiques)
- Radar chart: comparison of 4 rooms (sessions, participants, rating, engagement)
- Scatter plot: LTV vs CAC colored by client type
- Bar chart: conversions per month
- Cohort retention heatmap

## Business Logic (TypeScript)
- Guest scoring engine with the exact formula
- Room recommendation engine using the IF/ELSE rules
- Upselling recommendation engine
- Churn signal detection with risk levels (low/medium/high/critical)
- Anti-churn action triggers

