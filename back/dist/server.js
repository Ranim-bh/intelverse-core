import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { loadDataset as loadTable, loadDatasets as loadTables } from "./services/datasetLoader.js";
import { getGuestScore, recommendForGuest } from "./services/recommendationEngine.js";
dotenv.config();
const app = express();
const PORT = Number(process.env.PORT) || 5000;
app.use(cors());
app.use(express.json());
const GROQ_API_KEY = (process.env.GROQ_API_KEY ?? "").trim();
const SERVICES_TABLE_KEY = (process.env.SERVICES_TABLE_KEY ?? "services").trim().toLowerCase();
const groq = new Groq({ apiKey: GROQ_API_KEY });
const ensureTables = async () => {
    return loadTables(true);
};
const extractJsonObject = (raw) => {
    const fenced = raw.replace(/```json|```/g, "").trim();
    try {
        return JSON.parse(fenced);
    }
    catch {
        const start = fenced.indexOf("{");
        const end = fenced.lastIndexOf("}");
        if (start >= 0 && end > start) {
            const sliced = fenced.slice(start, end + 1);
            return JSON.parse(sliced);
        }
        throw new Error("Groq response is not valid JSON");
    }
};
const normalizeKey = (value) => String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const toNumber = (value, fallback = 0) => {
    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toRows = (value) => {
    if (!Array.isArray(value))
        return [];
    return value.filter((row) => typeof row === "object" && row !== null);
};
const pickFromRow = (row, candidates) => {
    const entries = Object.entries(row);
    for (const candidate of candidates) {
        const target = normalizeKey(candidate);
        const found = entries.find(([key]) => {
            const normalized = normalizeKey(key);
            return normalized === target || normalized.includes(target);
        });
        if (found && found[1] !== "" && found[1] !== undefined && found[1] !== null) {
            return found[1];
        }
    }
    return undefined;
};
const inferNumericKpis = (row) => {
    const reserved = new Set([
        "id", "guestid", "partnerid", "profileid", "serviceid", "service", "domain",
        "type", "typeclient", "company", "name", "status", "statut", "role", "source",
        "createdat", "month", "risklevel", "churn", "targetconverted", "targetchurn", "targetupsell",
    ]);
    const kpis = {};
    for (const [key, rawValue] of Object.entries(row)) {
        const normalized = normalizeKey(key);
        if (!normalized || reserved.has(normalized))
            continue;
        const value = toNumber(rawValue, Number.NaN);
        if (!Number.isNaN(value)) {
            kpis[key] = value;
        }
    }
    return kpis;
};
const parseServicesTable = (value) => {
    return toRows(value)
        .map((row) => {
        const id = String(pickFromRow(row, ["service_id", "id"]) ?? "").trim();
        const name = String(pickFromRow(row, ["service", "service_name", "name"]) ?? "").trim();
        const price = toNumber(pickFromRow(row, ["price", "cost", "amount"]), 0);
        if (!id || !name)
            return null;
        return { id, name, price };
    })
        .filter((service) => service !== null);
};
const pickTableByPattern = (tables, patterns) => {
    for (const [key, value] of Object.entries(tables)) {
        if (patterns.some((pattern) => pattern.test(key))) {
            return value;
        }
    }
    return undefined;
};
const buildUserProfile = (userId, tables) => {
    const globalRows = toRows(tables.global_dataset
        ?? pickTableByPattern(tables, [/^global_dataset/i, /^users?$/i, /^guests?$/i]));
    const guestRows = toRows(tables.guest_kpis
        ?? pickTableByPattern(tables, [/^guest_kpis/i]));
    const partnerRows = toRows(tables.partner_kpis
        ?? pickTableByPattern(tables, [/^partner_kpis/i]));
    const churnRows = toRows(tables.churn_kpis
        ?? pickTableByPattern(tables, [/^churn_kpis/i]));
    const userRow = [...globalRows, ...guestRows, ...partnerRows, ...churnRows].find((row) => {
        const id = String(pickFromRow(row, ["id", "guest_id", "partner_id", "profile_id"]) ?? "").trim();
        return id.toLowerCase() === userId.toLowerCase();
    });
    if (!userRow) {
        return { error: "User not found", status: 404 };
    }
    const domain = String(pickFromRow(userRow, ["domain", "type_client", "type", "industry"]) ?? "").trim();
    const experience = String(pickFromRow(userRow, ["experience", "seniority", "years_experience"]) ?? "N/A").trim() || "N/A";
    const skillsRaw = pickFromRow(userRow, ["skills", "competencies", "stack"]);
    const skills = Array.isArray(skillsRaw)
        ? skillsRaw.map((item) => String(item))
        : String(skillsRaw ?? "").split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
    const location = String(pickFromRow(userRow, ["location", "country", "city"]) ?? "N/A").trim() || "N/A";
    const relatedRows = [...globalRows, ...guestRows, ...partnerRows, ...churnRows].filter((row) => {
        const id = String(pickFromRow(row, ["id", "guest_id", "partner_id", "profile_id"]) ?? "").trim();
        return id.toLowerCase() === userId.toLowerCase();
    });
    const kpis = relatedRows.reduce((acc, row) => {
        const rowKpis = inferNumericKpis(row);
        for (const [key, value] of Object.entries(rowKpis)) {
            acc[key] = value;
        }
        return acc;
    }, {});
    const effectiveKpis = Object.keys(kpis).length
        ? kpis
        : {
            session_duration: toNumber(pickFromRow(userRow, ["session_duration", "duration", "session"]), 0),
            interaction_count: toNumber(pickFromRow(userRow, ["interaction_count", "interactions", "clicks"]), 0),
            voice_time: toNumber(pickFromRow(userRow, ["voice_time", "voice_interaction_time"]), 0),
            idle_time: toNumber(pickFromRow(userRow, ["idle_time", "idle"]), 0),
            engagement_score: toNumber(pickFromRow(userRow, ["engagement_score", "performance"]), 0),
            conversion_prob: toNumber(pickFromRow(userRow, ["conversion_prob", "conversion_probability"]), 0),
        };
    const effectiveDomain = domain || String(pickFromRow(userRow, ["domain", "type_client", "type"]) ?? "Unknown");
    return {
        user: {
            id: userId,
            domain: effectiveDomain,
            experience,
            skills,
            location,
            kpis: {
                ...effectiveKpis,
                performance: effectiveKpis.performance ?? effectiveKpis.engagement_score ?? 0,
            },
        },
    };
};
const parsePackResponse = (raw) => {
    const parsed = extractJsonObject(raw);
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Failed to parse AI response");
    }
    const hasNewSchema = Array.isArray(parsed.recommended_pack);
    const hasPackSchema = Boolean(parsed.pack && Array.isArray(parsed.pack.services));
    if (!hasNewSchema && !hasPackSchema) {
        throw new Error("Failed to parse AI response");
    }
    return parsed;
};
const sanitizeMatchScore = (raw, fallback) => {
    const value = String(raw ?? "").trim();
    if (/^\d{1,3}%$/.test(value))
        return value;
    return `${fallback}%`;
};
const priorityToMatchScore = (priority, fallback) => {
    const p = String(priority ?? "").toUpperCase();
    if (p === "HIGH")
        return "92%";
    if (p === "MEDIUM")
        return "80%";
    if (p === "LOW")
        return "68%";
    return `${fallback}%`;
};
app.get("/api/health", (_req, res) => {
    res.json({
        ok: true,
        service: "intelverse-backend",
        timestamp: new Date().toISOString(),
    });
});
app.get("/api/tables", async (_req, res) => {
    try {
        const tables = await ensureTables();
        return res.json(tables);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load tables";
        return res.status(500).json({ error: message });
    }
});
app.get("/api/tables/:key", async (req, res) => {
    try {
        const tables = await ensureTables();
        const { key } = req.params;
        const value = tables[key];
        if (value === undefined) {
            return res.status(404).json({ error: `Table '${key}' not found` });
        }
        return res.json(value);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load tables";
        return res.status(500).json({ error: message });
    }
});
app.get("/api/datasets", async (_req, res) => {
    try {
        const tables = await ensureTables();
        return res.json(tables);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load data";
        return res.status(500).json({ error: message });
    }
});
app.get("/api/datasets/:key", async (req, res) => {
    try {
        const tables = await ensureTables();
        const { key } = req.params;
        const value = tables[key];
        if (value === undefined) {
            return res.status(404).json({ error: `Table '${key}' not found` });
        }
        return res.json(value);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load data";
        return res.status(500).json({ error: message });
    }
});
app.get("/api/recommend/:guest_id/score", async (req, res) => {
    try {
        const guestId = String(req.params.guest_id ?? "").trim();
        if (!guestId) {
            return res.status(400).json({ error: "Missing guest_id" });
        }
        const result = await getGuestScore(guestId);
        return res.json(result);
    }
    catch (error) {
        const status = typeof error?.status === "number"
            ? Number(error.status)
            : 500;
        const message = error instanceof Error ? error.message : "Failed to compute score";
        return res.status(status).json({ error: message });
    }
});
app.post("/api/recommend/:guest_id", async (req, res) => {
    try {
        const guestId = String(req.params.guest_id ?? "").trim();
        if (!guestId) {
            return res.status(400).json({ error: "Missing guest_id" });
        }
        const result = await recommendForGuest(guestId);
        return res.json(result);
    }
    catch (error) {
        const typed = error;
        const status = typeof typed.status === "number" ? typed.status : 500;
        const message = error instanceof Error ? error.message : "Recommendation failed";
        return res.status(status).json({ error: message });
    }
});
app.post("/api/generate-offer/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const tables = await ensureTables();
        if (!userId) {
            return res.status(400).json({ error: "Missing userId" });
        }
        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: "Missing GROQ_API_KEY in backend environment" });
        }
        const servicesRaw = await loadTable(SERVICES_TABLE_KEY, true);
        const services = parseServicesTable(servicesRaw);
        if (!services.length) {
            return res.status(404).json({ error: "No services match your profile yet" });
        }
        const profileResult = buildUserProfile(userId, tables);
        if ("error" in profileResult && typeof profileResult.error === "string") {
            const status = typeof profileResult.status === "number" ? profileResult.status : 400;
            return res.status(status).json({ error: profileResult.error });
        }
        const { user } = profileResult;
        const prompt = `
You have access to 3 SQL table groups:
- Guest KPIs table(s)    -> user behavior KPIs during their trial period
- Users table(s)         -> converted (paying) users
- Partner KPIs table(s)  -> performance metrics per service

Available services:
  - TRAINING_CENTER   — Training & upskilling
  - OPPORTUNITY_ROOM  — Recruitment & hiring
  - PITCH_ROOM        — Startup pitching & investor connection
  - SHOWCASE_ROOM     — Project presentation & visibility

TASK:
Generate a personalized OFFER PACK for a user based on their behavior profile provided below.

You are an AI business assistant specialized in generating personalized service offers for a virtual platform called TalentVerse.

Context:
We have 3 SQL table groups:
1. Guest KPIs tables: contains user behavior KPIs during their trial
2. Users tables: contains converted users
3. Partner KPIs tables: contains services performance

Available services:
${JSON.stringify(services)}

USER PROFILE:
- Domain              : ${user.domain}
- Type                : ${user.domain}
- Session Duration    : ${user.kpis.session_duration ?? 0}
- Interaction Count   : ${user.kpis.interaction_count ?? 0}
- Voice Interaction Time : ${user.kpis.voice_time ?? user.kpis.voice_interaction_time ?? 0}
- Rooms Viewed        : ${user.kpis.rooms_viewed ?? []}
- Most Viewed Room    : ${user.kpis.most_viewed_room ?? "N/A"}
- Navigation Path     : ${user.kpis.navigation_path ?? "N/A"}
- Customization Time  : ${user.kpis.customization_time ?? 0}
- Idle Time           : ${user.kpis.idle_time ?? 0}
- Engagement Score    : ${user.kpis.engagement_score ?? 0}
- Engagement Level    : ${String(user.kpis.engagement_level ?? "").toUpperCase() || "UNKNOWN"}
- Conversion Probability : ${user.kpis.conversion_prob ?? user.kpis.conversion_probability ?? 0}

INSTRUCTIONS:
Step 1 — Identify MAIN INTEREST from KPIs
Use the following rules:
  - High time in TRAINING_CENTER   -> training / upskilling need
  - High time in PITCH_ROOM        -> business development / funding need
  - High time in OPPORTUNITY_ROOM  -> recruitment / talent need
  - High time in SHOWCASE_ROOM     -> visibility / branding need
  - Spread across multiple rooms   -> exploratory profile (offer discovery pack)

Step 2 — Adapt the offer using:
  - Engagement Level:
      HOT  -> premium, high-value offer with urgency framing
      WARM -> balanced offer with clear value proposition
      COLD -> lightweight, low-commitment introductory offer
  - Domain:
      Entreprise  -> focus on ROI, talent, growth, competitive advantage
      Institution -> focus on impact, skill development, partnerships
  - Behavior:
      Focused user (1-2 rooms, high time) -> targeted single-service offer
      Explorer (3-4 rooms, spread time)   -> multi-service discovery pack

Step 3 — Build the PACK
  - Include between 1 and 3 services MAXIMUM
  - Every service MUST come from the available services list above
  - For each service, provide a clear, user-specific justification

Step 4 — Tone
  - Professional, persuasive, and concise
  - Address the user's business reality directly
  - Avoid generic statements — make it feel tailored

OUTPUT FORMAT
Return ONLY a valid JSON object. No explanation outside the JSON.
No markdown code fences. No extra keys.

{
  "main_interest": "<one of: TRAINING | RECRUITMENT | PITCHING | VISIBILITY | EXPLORATION>",
  "recommended_pack": [
    {
      "service": "<SERVICE_NAME_FROM_LIST>",
      "reason": "<1-2 sentence justification tailored to this user>"
    }
  ],
  "offer_message": "<2-3 sentence personalized pitch addressed to the user>",
  "priority": "LOW | MEDIUM | HIGH"
}

PRIORITY MAPPING (for reference)
  Conversion Probability >= 0.75  AND  Engagement Level = HOT   -> HIGH
  Conversion Probability 0.40-0.74  OR  Engagement Level = WARM -> MEDIUM
  Conversion Probability < 0.40  AND  Engagement Level = COLD   -> LOW
`;
        const messages = [
            {
                role: "system",
                content: `You are a TALENTVERSE business assistant.
You ONLY select services from the provided list.
You ALWAYS return valid JSON only.
You NEVER invent services not in the provided list.
You must return exactly these keys: main_interest, recommended_pack, offer_message, priority.
No other keys are allowed.`,
            },
            {
                role: "user",
                content: prompt,
            },
        ];
        const callGroq = async () => {
            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages,
                max_tokens: 2000,
                temperature: 0.6,
                response_format: { type: "json_object" },
            });
            const content = String(response.choices?.[0]?.message?.content ?? "");
            return parsePackResponse(content);
        };
        let generated;
        try {
            generated = await callGroq();
        }
        catch {
            // Auto retry once when JSON parsing fails.
            generated = await callGroq();
        }
        const serviceById = new Map(services.map((service) => [normalizeKey(service.id), service]));
        const serviceByName = new Map(services.map((service) => [normalizeKey(service.name), service]));
        const generatedServices = Array.isArray(generated.recommended_pack)
            ? generated.recommended_pack.map((item) => ({
                id: String(item.service ?? ""),
                name: String(item.service ?? ""),
                reason: String(item.reason ?? "").trim(),
            }))
            : (generated.pack?.services ?? []).map((item) => ({
                id: String(item.id ?? ""),
                name: String(item.name ?? ""),
                reason: String(item.reason ?? "").trim(),
            }));
        const normalizedServices = generatedServices
            .map((item) => {
            const selected = serviceById.get(normalizeKey(item.id)) || serviceByName.get(normalizeKey(item.name));
            if (!selected)
                return null;
            return {
                id: selected.id,
                name: selected.name,
                price: selected.price,
                reason: String(item.reason ?? "").trim() || "Selected for KPI and domain alignment.",
            };
        })
            .filter((item) => item !== null)
            .slice(0, 3);
        if (!normalizedServices.length) {
            return res.status(404).json({ error: "No services match your profile yet" });
        }
        const priority = String(generated.priority ?? "MEDIUM").toUpperCase();
        const mainInterest = String(generated.main_interest ?? "General optimization").trim();
        const offerMessage = String(generated.offer_message ?? "").trim()
            || `A personalized TalentVerse offer for ${user.domain}.`;
        const strictResponse = {
            main_interest: mainInterest,
            recommended_pack: normalizedServices.map((service) => ({
                service: service.id,
                reason: service.reason,
            })),
            offer_message: offerMessage,
            priority: (priority === "HIGH" || priority === "MEDIUM" || priority === "LOW")
                ? priority
                : "MEDIUM",
        };
        return res.json(strictResponse);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown backend error";
        if (message.includes("parse")) {
            return res.status(500).json({ error: "Failed to parse AI response" });
        }
        console.error("Groq endpoint error", message);
        return res.status(500).json({ error: message });
    }
});
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
loadTables().then((tables) => {
    const keys = Object.keys(tables);
    console.log(`PostgreSQL tables loaded at startup: ${keys.length ? keys.join(", ") : "none"}`);
}).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Database preload failed: ${message}`);
});
//# sourceMappingURL=server.js.map