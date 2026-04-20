import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { randomUUID, randomBytes } from "crypto";
import Groq from "groq-sdk";
import nodemailer from "nodemailer";
import crypto from "crypto";
import {
  loadDataset as loadTable,
  loadDatasets as loadTables,
  type DatasetsMap,
} from "./services/datasetLoader.js";
import {
  getGuestScore,
  recommendForGuest,
  saveRecommendationForGuest,
  listRecommendedOffers,
  updateRecommendedOfferStatus,
  getLeadScoringWeights,
  saveLeadScoringWeights,
  getAvailableRecommendedOfferKpis,
  type OfferStatus,
  type LeadScoringWeightRow,
} from "./services/recommendationEngine.js";
import { getDbPool, queryDb } from "./services/db.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

const GROQ_API_KEY = (process.env.GROQ_API_KEY ?? "").trim();
const SERVICES_TABLE_KEY = (process.env.SERVICES_TABLE_KEY ?? "services").trim().toLowerCase();
const SMTP_HOST = (process.env.EMAIL_HOST ?? "").trim();
const SMTP_PORT = Number(process.env.EMAIL_PORT ?? 587);
const SMTP_SECURE = (process.env.EMAIL_SECURE ?? "false").toLowerCase() === "true";
const SMTP_USER = (process.env.EMAIL_USER ?? "").trim();
const SMTP_PASS = (process.env.EMAIL_PASS ?? "").trim();
const EMAIL_FROM = (process.env.EMAIL_FROM ?? SMTP_USER).trim();
const groq = new Groq({ apiKey: GROQ_API_KEY });

type TableRow = Record<string, unknown>;

type ServiceOption = {
  id: string;
  name: string;
  price: number;
};

type PackService = {
  id: string;
  name: string;
  price: number;
  reason: string;
};

type AccessRole = {
  id: string;
  name: string;
  isDefault: boolean;
};

type AccessService = {
  id: string;
  name: string;
};

type AccessMatrix = Record<string, Record<string, boolean>>;

type LeadRequestStatus = "pending" | "accepted" | "denied";

type LeadRequestRecord = {
  id: number;
  prenom: string;
  nom: string;
  email: string;
  telephone: string | null;
  domaine: string | null;
  typeOrganisation: string | null;
  pays: string | null;
  description: string | null;
  leadSource: string;
  sourceReferrer: string | null;
  landingUrl: string | null;
  status: LeadRequestStatus;
  createdAt: string;
  updatedAt: string;
};

type GuestLeadSubmission = {
  prenom: string;
  nom: string;
  email: string;
  telephone: string | null;
  domaine: string | null;
  typeOrganisation: string | null;
  pays: string | null;
  description: string | null;
  leadSource: string;
  sourceReferrer: string | null;
  landingUrl: string | null;
};

type GuestInstructionStep = {
  step: number;
  title: string;
  description: string;
};

type GuestInstructionRule = {
  position: number;
  rule: string;
};

type GuestInstructionPayload = {
  presentation: string;
  available_days: string[];
  start_date?: string;
  end_date?: string;
  start_time: string;
  end_time: string;
  calendar_link: string;
  download_link?: string;
  epic_account_link?: string;
  steps: GuestInstructionStep[];
  rules: GuestInstructionRule[];
  services: string[];
  support_email: string;
  chatbot_link: string;
};

const DEFAULT_ACCESS_ROLES: AccessRole[] = [
  { id: "guest", name: "Guest", isDefault: true },
  { id: "client", name: "Client", isDefault: true },
  { id: "partenaire", name: "Partenaire", isDefault: true },
];

const DEFAULT_ACCESS_SERVICES: AccessService[] = [
  { id: "TRAINING_CENTER", name: "Training Center" },
  { id: "PITCH_ROOM", name: "Pitch Room" },
  { id: "SHOWCASE_ROOM", name: "Showcase Room" },
  { id: "OPPORTUNITY_ROOM", name: "Opportunity Room" },
];

const DEFAULT_ACCESS_GRANTS: Record<string, string[]> = {
  guest: ["SHOWCASE_ROOM"],
  client: ["TRAINING_CENTER", "SHOWCASE_ROOM", "OPPORTUNITY_ROOM"],
  partenaire: ["TRAINING_CENTER", "PITCH_ROOM", "SHOWCASE_ROOM", "OPPORTUNITY_ROOM"],
};

const DEFAULT_LEAD_SOURCE = "unknown";
const slugifyId = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const createEntityId = (name: string): string => {
  const base = slugifyId(name) || "item";
  return `${base}_${Date.now()}`;
};

const toSafeIdentifier = (name: string): string => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsupported identifier '${name}'`);
  }
  return `"${name.replace(/"/g, '""')}"`;
};

const SOURCE_PATTERNS: Array<{ pattern: RegExp; source: string }> = [
  { pattern: /(^|\.)l\.facebook\.com$/i, source: "facebook" },
  { pattern: /(^|\.)m\.facebook\.com$/i, source: "facebook" },
  { pattern: /(^|\.)facebook\.com$/i, source: "facebook" },
  { pattern: /(^|\.)instagram\.com$/i, source: "instagram" },
  { pattern: /(^|\.)linkedin\.com$/i, source: "linkedin" },
  { pattern: /(^|\.)tiktok\.com$/i, source: "tiktok" },
  { pattern: /(^|\.)google\./i, source: "google" },
];

const canonicalLeadSourceFromHost = (hostOrUrl: unknown): string | null => {
  const raw = String(hostOrUrl ?? "").trim();
  if (!raw) return null;

  const hostname = (() => {
    try {
      return new URL(raw).hostname;
    } catch {
      return raw;
    }
  })().replace(/^www\./i, "").toLowerCase();

  for (const item of SOURCE_PATTERNS) {
    if (item.pattern.test(hostname)) return item.source;
  }

  return hostname || null;
};

const normalizeLeadSource = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return DEFAULT_LEAD_SOURCE;

  const canonical = canonicalLeadSourceFromHost(raw);
  return canonical || raw;
};

const inferLeadSource = (input: {
  payloadLeadSource?: unknown;
  payloadReferrer?: unknown;
  querySource?: unknown;
  queryUtmSource?: unknown;
  queryRef?: unknown;
  queryFbclid?: unknown;
  requestReferer?: unknown;
}): string => {
  const explicitCandidates = [
    input.payloadLeadSource,
    input.querySource,
    input.queryUtmSource,
    input.queryRef,
  ];

  for (const candidate of explicitCandidates) {
    const raw = String(candidate ?? "").trim();
    if (!raw) continue;
    if (raw.toLowerCase() === "direct") continue;
    return normalizeLeadSource(raw);
  }

  if (String(input.queryFbclid ?? "").trim()) {
    return "facebook";
  }

  const referrerCandidates = [input.payloadReferrer, input.requestReferer];
  for (const candidate of referrerCandidates) {
    const source = canonicalLeadSourceFromHost(candidate);
    if (source) return source;
  }

  for (const candidate of explicitCandidates) {
    const raw = String(candidate ?? "").trim();
    if (!raw) continue;
    return normalizeLeadSource(raw);
  }

  return DEFAULT_LEAD_SOURCE;
};

const normalizeLeadRequestStatus = (value: unknown): LeadRequestStatus => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "accepted" || raw === "denied") return raw;
  return "pending";
};

const escapeHtml = (value: unknown): string => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const toDateLabel = (date: string): string => {
  if (!date) return "--/--/----";
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const buildInstructionEmail = (settings: GuestInstructionPayload, token?: string): string => {
  const days = Array.isArray(settings.available_days)
    ? settings.available_days.map(escapeHtml).join(", ")
    : "N/A";

  const availability = `${escapeHtml(settings.start_time)} - ${escapeHtml(settings.end_time)}`;
  const downloadUrl = token
    ? `http://localhost:8080/download?token=${encodeURIComponent(token)}`
    : "";

  const stepsHtml = Array.isArray(settings.steps) && settings.steps.length
    ? `<ol style="margin:0; padding:0; counter-reset:step; list-style:none;">${settings.steps.map((step) => `
      <li style="margin-bottom:20px; padding:16px; background:#f9fafb; border-radius:8px; display:flex; gap:14px; align-items:flex-start;">
        <div style="flex-shrink:0; width:32px; height:32px; background:#dc2626; color:#ffffff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px;">${escapeHtml(String(step.step))}</div>
        <div>
          <h4 style="margin:0 0 6px; font-size:15px; font-weight:700; color:#e53935;">${escapeHtml(step.title)}</h4>
          <p style="margin:0; font-size:13px; color:#374151; line-height:1.6;">${escapeHtml(step.description)}</p>
        </div>
      </li>`).join("")}</ol>`
    : `<p style="color:#6b7280; font-size:13px;">Aucune étape définie.</p>`;

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Accédez à TalentVerse</title>
  </head>
  <body style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin:0; padding:0; background:#f3f4f6; color:#1f2937;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f3f4f6;">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table width="100%" maxwidth="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 10px 40px rgba(0,0,0,0.08);">
            <!-- Red Header -->
            <tr>
              <td style="background:linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding:40px 32px; text-align:center;">
                <h1 style="margin:0; font-size:32px; font-weight:700; color:#ffffff;">Bienvenue sur TalentVerse</h1>
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:40px 32px;">
                <!-- Introduction -->
                <div style="margin-bottom:32px;">
                  <p style="margin:0; font-size:15px; line-height:1.8; color:#374151;">${escapeHtml(settings.presentation)}</p>
                </div>

                <!-- Session Duration Section -->
                ${settings.start_date && settings.end_date ? `
                <div style="margin-bottom:32px; padding:20px; background:#f9fafb; border-left:4px solid #dc2626; border-radius:8px;">
                  <h3 style="margin:0 0 12px; font-size:14px; font-weight:700; color:#1f2937;">📅 Session Duration</h3>
                  <p style="margin:0 0 6px; font-size:14px; color:#374151;">Start: ${toDateLabel(settings.start_date)} at ${escapeHtml(settings.start_time)}</p>
                  <p style="margin:0; font-size:14px; color:#374151;">End: ${toDateLabel(settings.end_date)} at ${escapeHtml(settings.end_time)}</p>
                </div>
                ` : ""}

                <!-- Availability Section -->
                <div style="margin-bottom:32px; padding:20px; background:#f9fafb; border-left:4px solid #dc2626; border-radius:8px;">
                  <h3 style="margin:0 0 12px; font-size:14px; font-weight:700; color:#1f2937; text-transform:uppercase; letter-spacing:0.5px;">Disponibilités</h3>
                  <div style="margin-bottom:8px;">
                    <span style="font-weight:600; color:#1f2937;">Jours :</span>
                    <span style="color:#374151;"> ${days}</span>
                  </div>
                  <div>
                    <span style="font-weight:600; color:#1f2937;">Heures :</span>
                    <span style="color:#374151;"> ${availability}</span>
                  </div>
                  ${settings.calendar_link ? `<div style="margin-top:12px;"><strong>Calendrier :</strong> <a href="${escapeHtml(settings.calendar_link)}" style="color:#dc2626; text-decoration:none;">${escapeHtml(settings.calendar_link)}</a></div>` : ""}
                </div>

                <!-- Steps Section -->
                <div style="margin-bottom:32px;">
                  <h3 style="margin:0 0 16px; font-size:14px; font-weight:700; color:#dc2626; text-transform:uppercase; letter-spacing:0.5px;">Étapes pour accéder à TalentVerse</h3>
                  ${stepsHtml}
                </div>

                <!-- Secure Download Link -->
                ${downloadUrl ? `
                <div style="margin-bottom:32px; padding:20px; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px;">
                  <p style="margin:0 0 8px; font-size:13px; color:#6b7280;">Use the secure download link below after accepting the rules in the platform:</p>
                  <p style="margin:0; font-size:13px; line-height:1.6; word-break:break-all; color:#dc2626;">${escapeHtml(downloadUrl)}</p>
                </div>
                ` : ""}

                <!-- Support Section -->
                <div style="padding:20px; background:#f0fdf4; border:1px solid #dcfce7; border-radius:8px;">
                  <h3 style="margin:0 0 12px; font-size:14px; font-weight:700; color:#166534; text-transform:uppercase; letter-spacing:0.5px;">Contact & Support</h3>
                  <div style="font-size:14px; color:#374151;">
                    ${settings.support_email ? `<div style="margin-bottom:8px;"><strong>Email :</strong> ${escapeHtml(settings.support_email)}</div>` : ""}
                    ${settings.chatbot_link ? `<div><strong>Chat :</strong> ${escapeHtml(settings.chatbot_link)}</div>` : ""}
                  </div>
                </div>

                <!-- Closing Message -->
                <div style="margin-top:32px; padding-top:32px; border-top:1px solid #e5e7eb; text-align:center;">
                  <p style="margin:0; font-size:13px; color:#6b7280; line-height:1.6;">Connectez-vous à la plateforme pour accepter les règles et accéder à TalentVerse.</p>
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px; background:#f9fafb; border-top:1px solid #e5e7eb; text-align:center;">
                <p style="margin:0; font-size:12px; color:#9ca3af;">© 2026 TalentVerse. Tous droits réservés.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const buildInstructionText = (settings: GuestInstructionPayload, token?: string): string => {
  const days = Array.isArray(settings.available_days) ? settings.available_days.join(", ") : "N/A";
  const rulesText = Array.isArray(settings.rules) && settings.rules.length
    ? settings.rules.map((rule) => `- ${rule.rule}`).join("\n")
    : "Aucune règle définie.";

  const stepsText = Array.isArray(settings.steps) && settings.steps.length
    ? settings.steps.map((step) => `${step.step}. ${step.title} - ${step.description}`).join("\n")
    : "Aucune étape définie.";

  const downloadUrl = token
    ? `http://localhost:8080/download?token=${encodeURIComponent(token)}`
    : "";

  return [
    settings.presentation,
    "",
    `Disponibilités : ${days}`,
    `Heures : ${settings.start_time} - ${settings.end_time}`,
    "",
    `Calendrier : ${settings.calendar_link}`,
    downloadUrl ? `Lien sécurisé : ${downloadUrl}` : "",
    settings.epic_account_link ? `Compte Epic Games : ${settings.epic_account_link}` : "",
    "",
    "Étapes :",
    stepsText,
    "",
    "Règles :",
    rulesText,
    "",
    `Support email : ${settings.support_email}`,
    `Chatbot : ${settings.chatbot_link}`,
  ]
    .filter(Boolean)
    .join("\n");
};

const getEmailTransporter = () => {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
    throw new Error("Missing SMTP email configuration");
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

const sendInstructionEmail = async (userEmail: string): Promise<void> => {
  const trimmedEmail = String(userEmail ?? "").trim();
  if (!trimmedEmail) {
    throw new Error("Missing recipient email address");
  }

  const settings = await buildGuestInstructionPayload();
  if (!settings) {
    throw new Error("Unable to load instruction settings for email");
  }

const token = crypto.randomBytes(20).toString("hex");

await queryDb(
  "UPDATE users SET download_token = $1 WHERE email = $2",
  [token, trimmedEmail]
);

const BASE_URL = process.env.FRONT_URL;
const downloadUrl = `${BASE_URL}/download?token=${token}`;
const servicesResult = await queryDb(`
  SELECT service_name
  FROM service
  WHERE service_id IN (
    SELECT UNNEST(selected_services)
    FROM guest_instruction_settings
    WHERE id = 1
  )
`);

const serviceList = servicesResult.rows?.map((s: any) => s.service_name) || [];

const servicesHtml = serviceList.length > 0 ? `
  <h3 style="color:#e53935;">Services auxquels vous avez accès</h3>
  <ul style="padding-left:20px;color:#444;">
    ${serviceList.map(service => `<li>${service}</li>`).join("")}
  </ul>
` : "";
console.log("START DATE:", settings.start_date);
console.log("END DATE:", settings.end_date);
console.log("START TIME:", settings.start_time);
console.log("END TIME:", settings.end_time);
const sessionHtml = (settings.start_date && settings.end_date) ? `
  <div style="margin-top:20px;">
    <h3 style="color:#e53935;">📅 Durée de la session</h3>

    <p style="color:#444; margin:4px 0;">
      <strong>Début Session :</strong> ${toDateLabel(settings.start_date)}
    </p>

    <p style="color:#444; margin:4px 0;">
      <strong>Fin Session :</strong> ${toDateLabel(settings.end_date)}
    </p>

    <p style="color:#444; margin-top:8px;">
      <strong>Horaires de la session :</strong> de ${settings.start_time} à ${settings.end_time}
    </p>
  </div>
` : "";
  const html = `
    <div style="font-family:Arial;padding:20px;">
      <h2 style="color:#e53935;">Bienvenue sur TalentVerse</h2>

      <p>${settings.presentation}</p>
      ${sessionHtml}
      ${servicesHtml}
    <h3 style="color:#e53935;">Étapes pour accéder à TalentVerse</h3>
    <ol>
    ${settings.steps
    .map((s: any) => `
      <li style="margin-bottom:10px;">
        <strong>${s.title}</strong><br/>
        <span style="color:#555;">${s.description}</span>
      </li>
    `)
    .join("")}
    </ol>

      <br/>

      <a href="${downloadUrl}"
         style="display:inline-block;padding:12px 20px;background:#e53935;color:white;border-radius:8px;text-decoration:none;">
         Télécharger TalentVerse
      </a>
    <div style="margin-top:30px;padding-top:15px;border-top:1px solid #eee;">
      
      <h3 style="color:#e53935;">💬 Support</h3>

      <p style="color:#555;font-size:14px;">
        Besoin d’aide ? Notre équipe est disponible pour vous accompagner.
      </p>

      <p style="margin:5px 0;">
        📧 <strong>Email :</strong> ${settings.support_email}
      </p>

      <p style="margin:5px 0;">
        🤖 <strong>Chat :</strong>
        <a href="${settings.chatbot_link}" style="color:#e53935;text-decoration:none;">
          Accéder au support
        </a>
      </p>

    </div>
    </div>
  `;

  const transporter = getEmailTransporter();

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: trimmedEmail,
    subject: "Vos instructions TalentVerse",
  
    html,
  });
  console.log("EMAIL REAL FUNCTION 🔥");
};

const ensureLeadRequestsTable = async (): Promise<void> => {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS lead_requests (
      id SERIAL PRIMARY KEY,
      prenom TEXT NOT NULL,
      nom TEXT NOT NULL,
      email TEXT NOT NULL,
      telephone TEXT,
      domaine TEXT,
      type_organisation TEXT,
      pays TEXT,
      description TEXT,
      lead_source TEXT NOT NULL DEFAULT 'unknown',
      source_referrer TEXT,
      landing_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
};

const saveGuestLeadToUsersTable = async (submission: GuestLeadSubmission): Promise<void> => {
  const tableExists = await queryDb<{ exists: boolean }>(
    `
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='users'
    ) AS exists
  `
  );

  if (!tableExists.rows[0]?.exists) {
    return;
  }

  const columns = await getTableColumns("users");

  if (columns.has("email")) {
    const existingByEmail = await queryDb<{ id?: string }>(
      `
      SELECT 1 AS id
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [submission.email]
    );

    if (existingByEmail.rows.length) {
      return;
    }
  }

  const insertColumns: string[] = [];
  const placeholders: string[] = [];
  const values: unknown[] = [];

  const addColumn = (columnNames: string[], value: unknown): boolean => {
    for (const columnName of columnNames) {
      if (!columns.has(columnName)) continue;
      insertColumns.push(columnName);
      values.push(value);
      placeholders.push(`$${values.length}`);
      return true;
    }
    return false;
  };

  const fullName = `${submission.prenom} ${submission.nom}`.trim();

  addColumn(["user_id"], randomUUID());
  addColumn(["prenom", "first_name", "firstname", "given_name"], submission.prenom);
  addColumn(["nom", "last_name", "lastname", "family_name"], submission.nom);
  addColumn(["name", "full_name", "username"], fullName);
  addColumn(["email"], submission.email);
  addColumn(["telephone", "phone", "phone_number", "mobile"], submission.telephone);
  addColumn(["domaine", "domain", "industry"], submission.domaine);
  addColumn(["type_organisation", "type_organization", "organization_type", "typeclient", "company_type"], submission.typeOrganisation);
  addColumn(["pays", "country"], submission.pays);
  addColumn(["description", "message", "need"], submission.description);
  addColumn(["lead_source", "source", "utm_source"], submission.leadSource);
  addColumn(["source_referrer", "referrer", "referrer_url", "source_origin"], submission.sourceReferrer);
  addColumn(["landing_url", "landing_page", "landing"], submission.landingUrl);
  addColumn(["role"], "Guest");

  if (!insertColumns.length) {
    return;
  }

  const safeColumns = insertColumns.map((column) => toSafeIdentifier(column)).join(", ");
  const sql = `INSERT INTO users (${safeColumns}) VALUES (${placeholders.join(", ")})`;

  await queryDb(sql, values);
};

const mapLeadRequestRow = (row: {
  id: number;
  prenom: string;
  nom: string;
  email: string;
  telephone: string | null;
  domaine: string | null;
  type_organisation: string | null;
  pays: string | null;
  description: string | null;
  lead_source: string;
  source_referrer: string | null;
  landing_url: string | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
}): LeadRequestRecord => ({
  id: row.id,
  prenom: row.prenom,
  nom: row.nom,
  email: row.email,
  telephone: row.telephone,
  domaine: row.domaine,
  typeOrganisation: row.type_organisation,
  pays: row.pays,
  description: row.description,
  leadSource: row.lead_source,
  sourceReferrer: row.source_referrer,
  landingUrl: row.landing_url,
  status: normalizeLeadRequestStatus(row.status),
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

const getTableColumns = async (tableName: string): Promise<Set<string>> => {
  const result = await queryDb<{ column_name: string }>(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
  `,
    [tableName]
  );
  return new Set(result.rows.map((row) => String(row.column_name).toLowerCase()));
};

const ensureUsersDownloadColumns = async (): Promise<void> => {
  const tableExists = await queryDb<{ exists: boolean }>(
    `
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='users'
    ) AS exists
  `
  );

  if (!tableExists.rows[0]?.exists) {
    return;
  }

  const columns = await getTableColumns("users");
  if (!columns.has("download_token")) {
    await queryDb(`ALTER TABLE users ADD COLUMN download_token TEXT`);
  }
  if (!columns.has("rules_accepted")) {
    await queryDb(`ALTER TABLE users ADD COLUMN rules_accepted BOOLEAN DEFAULT false`);
  }
};

const generateDownloadToken = (length = 32): string => randomBytes(length).toString("hex");

const updateUserDownloadToken = async (email: string, token: string): Promise<void> => {
  await ensureUsersDownloadColumns();

  await queryDb(
    `UPDATE users SET download_token = $1, rules_accepted = false WHERE LOWER(email) = LOWER($2)`,
    [token, email]
  );
};

const getUserByToken = async (token: string) => {
  const result = await queryDb<{ id: string; email: string; rules_accepted: boolean | null; }>(
    `SELECT id, email, COALESCE(rules_accepted, false) AS rules_accepted FROM users WHERE download_token = $1 LIMIT 1`,
    [token]
  );
  return result.rows[0] ?? null;
};

const setRulesAcceptedForToken = async (token: string): Promise<void> => {
  await ensureUsersDownloadColumns();
  await queryDb(`UPDATE users SET rules_accepted = true WHERE download_token = $1`, [token]);
};

const ensureGuestInstructionTables = async (): Promise<void> => {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS guest_instruction_settings (
      id SERIAL PRIMARY KEY,
      presentation TEXT,
      available_days TEXT[],
      start_date DATE,
      end_date DATE,
      start_time TIME,
      end_time TIME,
      calendar_link TEXT,
      download_link TEXT,
      epic_account_link TEXT,
      steps JSONB,
      support_email TEXT,
      chatbot_link TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await queryDb(`
    CREATE TABLE IF NOT EXISTS guest_instruction_rules (
      id SERIAL PRIMARY KEY,
      setting_id INTEGER NOT NULL REFERENCES guest_instruction_settings(id) ON DELETE CASCADE,
      rule TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    )
  `);

  const columns = await getTableColumns("guest_instruction_settings");
  if (!columns.has("download_link")) {
    await queryDb(`ALTER TABLE guest_instruction_settings ADD COLUMN download_link TEXT`);
  }
  if (!columns.has("epic_account_link")) {
    await queryDb(`ALTER TABLE guest_instruction_settings ADD COLUMN epic_account_link TEXT`);
  }
  if (!columns.has("start_date")) {
    await queryDb(`ALTER TABLE guest_instruction_settings ADD COLUMN start_date DATE`);
  }
  if (!columns.has("end_date")) {
    await queryDb(`ALTER TABLE guest_instruction_settings ADD COLUMN end_date DATE`);
  }
  if (!columns.has("updated_at")) {
    await queryDb(`ALTER TABLE guest_instruction_settings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()`);
  }
};

const ensureAccessMatrixTables = async (): Promise<void> => {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    )
  `);

  await queryDb(`
    CREATE TABLE IF NOT EXISTS service (
      service_id TEXT PRIMARY KEY,
      service_name TEXT
    )
  `);

  await queryDb(`
    CREATE TABLE IF NOT EXISTS admin_access_matrix (
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL REFERENCES service(service_id) ON DELETE CASCADE,
      has_access BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (role_id, service_id)
    )
  `);

  const roleCount = await queryDb<{ count: string }>("SELECT COUNT(*)::text AS count FROM roles");
  const serviceCount = await queryDb<{ count: string }>("SELECT COUNT(*)::text AS count FROM service");

  if (Number(roleCount.rows[0]?.count ?? 0) === 0) {
    for (const role of DEFAULT_ACCESS_ROLES) {
      await queryDb(
        `INSERT INTO roles (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [role.id, role.name]
      );
    }
  }

  if (Number(serviceCount.rows[0]?.count ?? 0) === 0) {
    for (const service of DEFAULT_ACCESS_SERVICES) {
      await queryDb(
        `INSERT INTO service (service_id, service_name) VALUES ($1, $2) ON CONFLICT (service_id) DO NOTHING`,
        [service.id, service.name]
      );
    }
  }

  const matrixCount = await queryDb<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_access_matrix");
  if (Number(matrixCount.rows[0]?.count ?? 0) === 0) {
    const roles = await queryDb<AccessRole>("SELECT id, name FROM roles");
    const services = await queryDb<AccessService>("SELECT service_id AS id, COALESCE(NULLIF(service_name, ''), service_id) AS name FROM service");

    for (const role of roles.rows) {
      const normalizedAllowed = new Set(
        (DEFAULT_ACCESS_GRANTS[role.id] ?? []).map((value) => String(value).trim().toLowerCase())
      );

      for (const service of services.rows) {
        const granted = normalizedAllowed.has(String(service.id).trim().toLowerCase());
        await queryDb(
          `
          INSERT INTO admin_access_matrix (role_id, service_id, has_access)
          VALUES ($1, $2, $3)
          ON CONFLICT (role_id, service_id) DO NOTHING
        `,
          [role.id, service.id, granted]
        );
      }
    }
  }
};

const resolveServiceCoreColumns = async (): Promise<{
  idColumn: string;
  nameColumn: string;
}> => {
  const columns = await getTableColumns("service");
  const idColumn = columns.has("service_id")
    ? "service_id"
    : columns.has("id")
      ? "id"
      : "service_id";
  const nameColumn = columns.has("service_name")
    ? "service_name"
    : columns.has("service")
      ? "service"
      : columns.has("name")
        ? "name"
        : "service_name";

  return { idColumn, nameColumn };
};

const upsertServiceInCoreTable = async (service: AccessService): Promise<void> => {
  const { idColumn, nameColumn } = await resolveServiceCoreColumns();
  const safeIdColumn = toSafeIdentifier(idColumn);
  const safeNameColumn = toSafeIdentifier(nameColumn);

  const normalizedId = String(service.id ?? "").trim();
  const normalizedName = String(service.name ?? "").trim();
  if (!normalizedId || !normalizedName) return;

  const updateResult = await queryDb(
    `
    UPDATE service
    SET ${safeNameColumn} = $2
    WHERE ${safeIdColumn}::text = $1::text
       OR LOWER(${safeNameColumn}) = LOWER($2)
    `,
    [normalizedId, normalizedName]
  );

  if ((updateResult.rowCount ?? 0) > 0) return;

  await queryDb(
    `INSERT INTO service (${safeIdColumn}, ${safeNameColumn}) VALUES ($1, $2)`,
    [normalizedId, normalizedName]
  );
};

const deleteServiceFromCoreTable = async (identifier: string): Promise<AccessService | null> => {
  const { idColumn, nameColumn } = await resolveServiceCoreColumns();
  const safeIdColumn = toSafeIdentifier(idColumn);
  const safeNameColumn = toSafeIdentifier(nameColumn);

  const found = await queryDb<AccessService>(
    `
    SELECT ${safeIdColumn}::text AS id, ${safeNameColumn}::text AS name
    FROM service
    WHERE ${safeIdColumn}::text = $1::text
       OR LOWER(${safeNameColumn}) = LOWER($1)
    LIMIT 1
    `,
    [identifier]
  );

  const row = found.rows[0];
  if (!row) return null;

  await queryDb(
    `DELETE FROM service WHERE ${safeIdColumn}::text = $1::text`,
    [row.id]
  );

  return row;
};

const syncUsersRoleConstraint = async (): Promise<void> => {
  const tableExists = await queryDb<{ exists: boolean }>(
    `
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='users'
    ) AS exists
  `
  );

  if (!tableExists.rows[0]?.exists) return;

  const columns = await getTableColumns("users");
  if (!columns.has("role")) return;

  const roles = await queryDb<{ name: string }>("SELECT name FROM roles ORDER BY name ASC");
  const existing = await queryDb<{ role: string | null }>("SELECT DISTINCT role FROM users WHERE role IS NOT NULL");

  const all = new Set<string>();
  for (const row of roles.rows) all.add(String(row.name).trim());
  for (const row of existing.rows) all.add(String(row.role ?? "").trim());

  const allowed = Array.from(all).filter(Boolean);
  if (!allowed.length) return;

  const constraints = await queryDb<{ conname: string; def: string }>(
    `
    SELECT conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.conrelid = 'users'::regclass
      AND c.contype = 'c'
  `
  );

  for (const row of constraints.rows) {
    const def = String(row.def ?? "").toLowerCase();
    if (def.includes("role")) {
      await queryDb(`ALTER TABLE users DROP CONSTRAINT IF EXISTS ${toSafeIdentifier(row.conname)}`);
    }
  }

  const allowedSql = allowed.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
  await queryDb(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${allowedSql}))`);
};

const getAdminAccessMatrixPayload = async (): Promise<{
  roles: AccessRole[];
  services: AccessService[];
  matrix: AccessMatrix;
}> => {
  await ensureAccessMatrixTables();

  const { idColumn, nameColumn } = await resolveServiceCoreColumns();
  const safeIdColumn = toSafeIdentifier(idColumn);
  const safeNameColumn = toSafeIdentifier(nameColumn);

  const roleRows = await queryDb<{ id: string; name: string }>(
    `SELECT id, name FROM roles ORDER BY name ASC`
  );
  const serviceRows = await queryDb<AccessService>(
    `SELECT ${safeIdColumn}::text AS id, COALESCE(NULLIF(${safeNameColumn}, ''), ${safeIdColumn}::text) AS name FROM service ORDER BY ${safeNameColumn} ASC`
  );
  const cells = await queryDb<{ role_id: string; service_id: string; has_access: boolean }>(
    `SELECT role_id, service_id, has_access FROM admin_access_matrix`
  );

  const defaultIds = new Set(DEFAULT_ACCESS_ROLES.map((role) => role.id));
  const roles: AccessRole[] = roleRows.rows.map((role) => ({
    id: role.id,
    name: role.name,
    isDefault: defaultIds.has(role.id),
  }));
  const services = serviceRows.rows;

  const matrix: AccessMatrix = {};
  for (const role of roles) {
    matrix[role.id] = {};
    for (const service of services) {
      const row = matrix[role.id];
      if (row) {
        row[service.id] = false;
      }
    }
  }
  for (const cell of cells.rows) {
    const row = matrix[cell.role_id];
    if (row) {
      row[cell.service_id] = Boolean(cell.has_access);
    }
  }

  return { roles, services, matrix };
};

type GeneratedPackResponse = {
  main_interest?: string;
  recommended_pack?: Array<{
    service: string;
    reason: string;
  }>;
  offer_message?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  pack?: {
    name: string;
    description: string;
    services: PackService[];
    total_price: number;
    kpis_addressed: string[];
    match_score: string;
    summary: string;
  };
};

const ensureTables = async () => {
  return loadTables(true);
};

app.get("/api/datasets", async (_req, res) => {
  try {
    const datasets = await loadTables();
    return res.json(datasets);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load datasets";
    console.error("/api/datasets error:", message);
    return res.status(500).json({ error: message });
  }
});

const extractJsonObject = (raw: string) => {
  const fenced = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = fenced.slice(start, end + 1);
      return JSON.parse(sliced);
    }
    throw new Error("Groq response is not valid JSON");
  }
};

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toRows = (value: unknown): TableRow[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is TableRow => typeof row === "object" && row !== null);
};

const pickFromRow = (row: TableRow, candidates: string[]): unknown => {
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

const inferNumericKpis = (row: TableRow): Record<string, number> => {
  const reserved = new Set([
    "id", "guestid", "partnerid", "profileid", "serviceid", "service", "domain",
    "type", "typeclient", "company", "name", "status", "statut", "role", "source",
    "createdat", "month", "risklevel", "churn", "targetconverted", "targetchurn", "targetupsell",
  ]);

  const kpis: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(row)) {
    const normalized = normalizeKey(key);
    if (!normalized || reserved.has(normalized)) continue;
    const value = toNumber(rawValue, Number.NaN);
    if (!Number.isNaN(value)) {
      kpis[key] = value;
    }
  }
  return kpis;
};

const parseServicesTable = (value: unknown): ServiceOption[] => {
  return toRows(value)
    .map((row) => {
      const id = String(pickFromRow(row, ["service_id", "id"]) ?? "").trim();
      const name = String(pickFromRow(row, ["service", "service_name", "name"]) ?? "").trim();
      const price = toNumber(pickFromRow(row, ["price", "cost", "amount"]), 0);
      if (!id || !name) return null;
      return { id, name, price };
    })
    .filter((service): service is ServiceOption => service !== null);
};

const pickTableByPattern = (tables: Record<string, unknown>, patterns: RegExp[]): unknown => {
  for (const [key, value] of Object.entries(tables)) {
    if (patterns.some((pattern) => pattern.test(key))) {
      return value;
    }
  }
  return undefined;
};

const buildUserProfile = (userId: string, tables: Record<string, unknown>) => {
  const globalRows = toRows(
    tables.global_dataset
      ?? pickTableByPattern(tables, [/^global_dataset/i, /^users?$/i, /^guests?$/i])
  );
  const guestRows = toRows(
    tables.guest_kpis
      ?? pickTableByPattern(tables, [/^guest_kpis/i])
  );
  const partnerRows = toRows(
    tables.partner_kpis
      ?? pickTableByPattern(tables, [/^partner_kpis/i])
  );
  const churnRows = toRows(
    tables.churn_kpis
      ?? pickTableByPattern(tables, [/^churn_kpis/i])
  );

  const userRow = [...globalRows, ...guestRows, ...partnerRows, ...churnRows].find((row) => {
    const id = String(pickFromRow(row, ["id", "guest_id", "partner_id", "profile_id"]) ?? "").trim();
    return id.toLowerCase() === userId.toLowerCase();
  });

  if (!userRow) {
    return { error: "User not found", status: 404 as const };
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

  const kpis = relatedRows.reduce<Record<string, number>>((acc, row) => {
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
      } as Record<string, number | string>,
    },
  };
};

const parsePackResponse = (raw: string): GeneratedPackResponse => {
  const parsed = extractJsonObject(raw) as GeneratedPackResponse;
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

const toHHMM = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  const hours = String(match[1] ?? "").padStart(2, "0");
  const minutes = String(match[2] ?? "00");
  return `${hours}:${minutes}`;
};

const normalizeInstructionSteps = (value: unknown): GuestInstructionStep[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const step = Number(row.step ?? index + 1);
      const title = String(row.title ?? "").trim();
      const description = String(row.description ?? "").trim();
      if (!title) return null;
      return {
        step: Number.isFinite(step) && step > 0 ? step : index + 1,
        title,
        description,
      };
    })
    .filter((item): item is GuestInstructionStep => item !== null)
    .sort((a, b) => a.step - b.step);
};

const buildGuestInstructionPayload = async (settingId?: number): Promise<GuestInstructionPayload | null> => {
  await ensureGuestInstructionTables();

  const settingsResult = settingId
    ? await queryDb<{
        id: number;
        presentation: string | null;
        available_days: string[] | null;
        start_date: string | null; // 🔥 AJOUT
        end_date: string | null;
        start_time: string | null;
        end_time: string | null;
        calendar_link: string | null;
        download_link: string | null;
        epic_account_link: string | null;
        steps: unknown;
        support_email: string | null;
        chatbot_link: string | null;
      }>(
        `
        SELECT
          id,
          presentation,
          available_days,
          start_date::text AS start_date,
          end_date::text AS end_date,
          start_time::text AS start_time,
          end_time::text AS end_time,
          calendar_link,
          steps,
          support_email,
          chatbot_link
        FROM guest_instruction_settings
        WHERE id = $1
        LIMIT 1
        `,
        [settingId]
      )
    : await queryDb<{
        id: number;
        presentation: string | null;
        available_days: string[] | null;
        start_date: string | null;
        end_date: string | null;
        start_time: string | null;
        end_time: string | null;
        calendar_link: string | null;
        download_link: string | null;
        epic_account_link: string | null;
        steps: unknown;
        support_email: string | null;
        chatbot_link: string | null;
      }>(`
        SELECT
          id,
          presentation,
          available_days,
          start_date::text AS start_date,
          end_date::text AS end_date,
          start_time::text AS start_time,
          end_time::text AS end_time,
          calendar_link,
          steps,
          support_email,
          chatbot_link
        FROM guest_instruction_settings
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      `);

  const setting = settingsResult.rows[0];
  if (!setting) return null;

  const rulesResult = await queryDb<{ position: number | null; rule: string | null }>(
    `
      SELECT position, rule
      FROM guest_instruction_rules
      WHERE setting_id = $1
      ORDER BY position ASC, id ASC
    `,
    [setting.id]
  );

  const servicesResult = await queryDb<{ service_name: string | null }>(
    `
      SELECT s.service_name
      FROM admin_access_matrix aam
      JOIN service s ON s.service_id = aam.service_id
      WHERE aam.role_id = 'guest' AND aam.has_access = true
      ORDER BY s.service_name ASC
    `
  );

  return {
    presentation: String(setting.presentation ?? "").trim(),
    available_days: Array.isArray(setting.available_days) ? setting.available_days.map((day) => String(day)) : [],
    start_date: setting.start_date ?? "",
end_date: setting.end_date ?? "",
    start_time: toHHMM(setting.start_time),
    end_time: toHHMM(setting.end_time),
    calendar_link: String(setting.calendar_link ?? "").trim(),
    download_link: String(setting.download_link ?? "").trim(),
    epic_account_link: String(setting.epic_account_link ?? "").trim(),
    steps: normalizeInstructionSteps(setting.steps),
    rules: rulesResult.rows.map((row, index) => ({
      position: Number(row.position ?? index + 1),
      rule: String(row.rule ?? "").trim(),
    })).filter((row) => row.rule.length > 0),
    services: servicesResult.rows
      .map((row) => String(row.service_name ?? "").trim())
      .filter(Boolean),
    support_email: String(setting.support_email ?? "").trim(),
    chatbot_link: String(setting.chatbot_link ?? "").trim(),
  };
};

const sanitizeMatchScore = (raw: unknown, fallback: number): string => {
  const value = String(raw ?? "").trim();
  if (/^\d{1,3}%$/.test(value)) return value;
  return `${fallback}%`;
};

const priorityToMatchScore = (priority: string | undefined, fallback: number): string => {
  const p = String(priority ?? "").toUpperCase();
  if (p === "HIGH") return "92%";
  if (p === "MEDIUM") return "80%";
  if (p === "LOW") return "68%";
  return `${fallback}%`;
};

app.get("/api/requests", async (_req, res) => {
  try {
    await ensureLeadRequestsTable();
    const result = await queryDb<{
      id: number;
      prenom: string;
      nom: string;
      email: string;
      telephone: string | null;
      domaine: string | null;
      type_organisation: string | null;
      pays: string | null;
      description: string | null;
      lead_source: string;
      source_referrer: string | null;
      landing_url: string | null;
      status: string;
      created_at: string | Date;
      updated_at: string | Date;
    }>(
      `
      SELECT
        id,
        prenom,
        nom,
        email,
        telephone,
        domaine,
        type_organisation,
        pays,
        description,
        lead_source,
        source_referrer,
        landing_url,
        status,
        created_at,
        updated_at
      FROM lead_requests
      ORDER BY created_at DESC, id DESC
    `
    );

    return res.json(result.rows.map(mapLeadRequestRow));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load requests";
    return res.status(500).json({ error: message });
  }
});

app.post("/api/requests", async (req, res) => {
  try {
    await ensureLeadRequestsTable();

    const payload = req.body as Partial<{
      prenom: string;
      nom: string;
      email: string;
      telephone: string;
      domaine: string;
      typeOrganisation: string;
      pays: string;
      description: string;
      leadSource: string;
      sourceReferrer: string;
      landingUrl: string;
      status: string;
    }>;

    const prenom = String(payload.prenom ?? "").trim();
    const nom = String(payload.nom ?? "").trim();
    const email = String(payload.email ?? "").trim();

    if (!prenom || !nom || !email) {
      return res.status(400).json({ error: "prenom, nom and email are required" });
    }

    const leadSource = inferLeadSource({
      payloadLeadSource: payload.leadSource,
      payloadReferrer: payload.sourceReferrer,
      querySource: req.query.source,
      queryUtmSource: req.query.utm_source,
      queryRef: req.query.ref,
      queryFbclid: req.query.fbclid,
      requestReferer: req.get("referer"),
    });
    const sourceReferrer = String(payload.sourceReferrer ?? req.get("referer") ?? "").trim() || null;
    const fallbackLandingUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const landingUrl = String(payload.landingUrl ?? fallbackLandingUrl).trim() || null;
    const status = normalizeLeadRequestStatus(payload.status);

    const existing = await queryDb<{
      id: number;
      prenom: string;
      nom: string;
      email: string;
      telephone: string | null;
      domaine: string | null;
      type_organisation: string | null;
      pays: string | null;
      description: string | null;
      lead_source: string;
      source_referrer: string | null;
      landing_url: string | null;
      status: string;
      created_at: string | Date;
      updated_at: string | Date;
    }>(
      `
      SELECT
        id,
        prenom,
        nom,
        email,
        telephone,
        domaine,
        type_organisation,
        pays,
        description,
        lead_source,
        source_referrer,
        landing_url,
        status,
        created_at,
        updated_at
      FROM lead_requests
      WHERE LOWER(email) = LOWER($1)
      ORDER BY id DESC
      LIMIT 1
      `,
      [email]
    );

    if (existing.rows[0]) {
      const updatedResult = await queryDb<{
        id: number;
        prenom: string;
        nom: string;
        email: string;
        telephone: string | null;
        domaine: string | null;
        type_organisation: string | null;
        pays: string | null;
        description: string | null;
        lead_source: string;
        source_referrer: string | null;
        landing_url: string | null;
        status: string;
        created_at: string | Date;
        updated_at: string | Date;
      }>(
        `
        UPDATE lead_requests
        SET
          prenom = $2,
          nom = $3,
          telephone = $4,
          domaine = $5,
          type_organisation = $6,
          pays = $7,
          description = $8,
          lead_source = $9,
          source_referrer = $10,
          landing_url = $11,
          status = CASE WHEN status = 'pending' THEN $12 ELSE status END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          prenom,
          nom,
          email,
          telephone,
          domaine,
          type_organisation,
          pays,
          description,
          lead_source,
          source_referrer,
          landing_url,
          status,
          created_at,
          updated_at
        `,
        [
          existing.rows[0].id,
          prenom,
          nom,
          String(payload.telephone ?? "").trim() || null,
          String(payload.domaine ?? "").trim() || null,
          String(payload.typeOrganisation ?? "").trim() || null,
          String(payload.pays ?? "").trim() || null,
          String(payload.description ?? "").trim() || null,
          leadSource,
          sourceReferrer,
          landingUrl,
          status,
        ]
      );

      const updated = updatedResult.rows[0];
      if (!updated) {
        return res.status(500).json({ error: "Failed to update existing request" });
      }

      return res.status(200).json(mapLeadRequestRow(updated));
    }

    const result = await queryDb<{
      id: number;
      prenom: string;
      nom: string;
      email: string;
      telephone: string | null;
      domaine: string | null;
      type_organisation: string | null;
      pays: string | null;
      description: string | null;
      lead_source: string;
      source_referrer: string | null;
      landing_url: string | null;
      status: string;
      created_at: string | Date;
      updated_at: string | Date;
    }>(
      `
      INSERT INTO lead_requests (
        prenom,
        nom,
        email,
        telephone,
        domaine,
        type_organisation,
        pays,
        description,
        lead_source,
        source_referrer,
        landing_url,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING
        id,
        prenom,
        nom,
        email,
        telephone,
        domaine,
        type_organisation,
        pays,
        description,
        lead_source,
        source_referrer,
        landing_url,
        status,
        created_at,
        updated_at
    `,
      [
        prenom,
        nom,
        email,
        String(payload.telephone ?? "").trim() || null,
        String(payload.domaine ?? "").trim() || null,
        String(payload.typeOrganisation ?? "").trim() || null,
        String(payload.pays ?? "").trim() || null,
        String(payload.description ?? "").trim() || null,
        leadSource,
        sourceReferrer,
        landingUrl,
        status,
      ]
    );

    const inserted = result.rows[0];
    if (!inserted) {
      return res.status(500).json({ error: "Failed to save request" });
    }

    return res.status(201).json(mapLeadRequestRow(inserted));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save request";
    return res.status(500).json({ error: message });
  }
});

app.patch("/api/requests/:id/:status", async (req, res) => {
  try {
    await ensureLeadRequestsTable();

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid request id" });
    }
    const statusParam = String(req.params.status ?? "").toLowerCase();
    const status = statusParam === "accept" ? "accepted" : statusParam === "deny" ? "denied" : null;
    if (!status) {
      return res.status(400).json({ error: "Unsupported request status update" });
    }

    const previous = await queryDb<{
      id: number;
      status: string;
      prenom: string;
      nom: string;
      email: string;
      telephone: string | null;
      domaine: string | null;
      type_organisation: string | null;
      pays: string | null;
      description: string | null;
      lead_source: string;
      source_referrer: string | null;
      landing_url: string | null;
    }>(
      `
      SELECT
        id,
        status,
        prenom,
        nom,
        email,
        telephone,
        domaine,
        type_organisation,
        pays,
        description,
        lead_source,
        source_referrer,
        landing_url
      FROM lead_requests
      WHERE id = $1
      `,
      [id]
    );

    const previousRow = previous.rows[0];
    if (!previousRow) {
      return res.status(404).json({ error: "Request not found" });
    }

    const result = await queryDb<{
      id: number;
      prenom: string;
      nom: string;
      email: string;
      telephone: string | null;
      domaine: string | null;
      type_organisation: string | null;
      pays: string | null;
      description: string | null;
      lead_source: string;
      source_referrer: string | null;
      landing_url: string | null;
      status: string;
      created_at: string | Date;
      updated_at: string | Date;
    }>(
      `
      UPDATE lead_requests
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        prenom,
        nom,
        email,
        telephone,
        domaine,
        type_organisation,
        pays,
        description,
        lead_source,
        source_referrer,
        landing_url,
        status,
        created_at,
        updated_at
    `,
      [id, status]
    );

    const updated = result.rows[0];
    if (!updated) {
      return res.status(404).json({ error: "Request not found" });
    }

    const shouldCreateUser = status === "accepted" && previousRow.status !== "accepted";
    if (shouldCreateUser) {
      await saveGuestLeadToUsersTable({
        prenom: updated.prenom,
        nom: updated.nom,
        email: updated.email,
        telephone: updated.telephone,
        domaine: updated.domaine,
        typeOrganisation: updated.type_organisation,
        pays: updated.pays,
        description: updated.description,
        leadSource: updated.lead_source,
        sourceReferrer: updated.source_referrer,
        landingUrl: updated.landing_url,
      });

      try {
        await sendInstructionEmail(updated.email);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to send instruction email:", message);
      }
    }

    return res.json(mapLeadRequestRow(updated));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update request";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/instruction-services", async (_req, res) => {
  try {
    const result = await queryDb(`
      SELECT rule
      FROM guest_instruction_rules
      WHERE setting_id = 1
      ORDER BY position
    `);

    res.json(result.rows);

  } catch (error) {
    console.error("GET ERROR:", error);
    res.status(500).json({ error: "Failed to load services" });
  }
});

app.get("/api/instruction-settings", async (req, res) => {
  try {
    const result = await queryDb(`
      SELECT presentation
      FROM guest_instruction_settings
      LIMIT 1
    `);

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load presentation" });
  }
});

app.put("/api/instruction-services", async (req, res) => {
  try {
    const { services } = req.body;

    console.log("SERVICES REÇUS:", services);

    // supprimer anciennes instructions
    await queryDb(`
      DELETE FROM guest_instruction_rules
      WHERE setting_id = 1
    `);

    // créer nouvelles instructions
    for (let i = 0; i < services.length; i++) {
      await queryDb(`
        INSERT INTO guest_instruction_rules (setting_id, rule, position)
        VALUES ($1, $2, $3)
      `, [
        1,
        `${services[i]}`,
        i + 1
      ]);
    }

    res.json({ success: true });

  } catch (error) {
    console.error("ERROR BACKEND:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.get("/api/validate-download", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const result = await queryDb(
      "SELECT * FROM users WHERE download_token = $1",
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invalid token" });
    }

    return res.json({ valid: true });
  } catch (error) {
    console.error("Validate download error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/accept-rules", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    // 🔥 mettre à jour acceptation
    await queryDb(
      "UPDATE users SET rules_accepted = true WHERE download_token = $1",
      [token]
    );

    //récupérer lien de téléchargement
    const settings = await queryDb(`
      SELECT download_link FROM guest_instruction_settings LIMIT 1
    `);

    const downloadLink = settings.rows[0]?.download_link;
    console.log("DOWNLOAD LINK:", downloadLink);

    return res.json({
      success: true,
      downloadLink
    });

  } catch (error) {
    console.error("Accept rules error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/lead-scoring/weights", async (_req, res) => {
  try {
    const rows = await getLeadScoringWeights();
    return res.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load lead scoring weights";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/lead-scoring/kpis", async (_req, res) => {
  try {
    const rows = await getAvailableRecommendedOfferKpis();
    return res.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load KPI list";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/guest-instruction", async (_req, res) => {
  try {
    const payload = await buildGuestInstructionPayload();
    if (!payload) {
      return res.status(404).json({ error: "No guest instruction setting found" });
    }
    return res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load guest instruction";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/instruction", async (_req, res) => {
  try {
    await ensureGuestInstructionTables();
    const payload = await buildGuestInstructionPayload();
    if (!payload) {
      return res.status(404).json({ error: "No guest instruction setting found" });
    }
    return res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load instruction settings";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/validate-download", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const result = await queryDb(
      "SELECT * FROM users WHERE download_token = $1",
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invalid token" });
    }

    return res.json({ valid: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/accept-rules", async (req, res) => {
  try {
    const token = String(req.body?.token ?? "").trim();
    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const user = await getUserByToken(token);
    if (!user) {
      return res.status(404).json({ error: "Invalid download token" });
    }

    await setRulesAcceptedForToken(token);
    await ensureGuestInstructionTables();
    const settings = await buildGuestInstructionPayload();
    if (!settings) {
      return res.status(500).json({ error: "Unable to load instruction settings" });
    }

    return res.json({ success: true, downloadLink: settings.download_link ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to accept rules";
    return res.status(500).json({ error: message });
  }
});

app.post("/api/instruction", async (req, res) => {
  const payload = req.body as Partial<GuestInstructionPayload>;
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await ensureGuestInstructionTables();

    const presentation = String(payload.presentation ?? "").trim();
    const availableDays = Array.isArray(payload.available_days)
      ? payload.available_days.map((day) => String(day).trim()).filter(Boolean)
      : [];
    const startDate = String(payload.start_date ?? "").trim();
    const endDate = String(payload.end_date ?? "").trim();
    const startTime = toHHMM(payload.start_time);
    const endTime = toHHMM(payload.end_time);
    const calendarLink = String(payload.calendar_link ?? "").trim();
    const downloadLink = String(payload.download_link ?? "").trim();
    const epicAccountLink = String(payload.epic_account_link ?? "").trim();
    const steps = normalizeInstructionSteps(payload.steps);
    const rules = Array.isArray(payload.rules)
      ? payload.rules
          .map((row, index) => ({
            position: Number(row?.position ?? index + 1),
            rule: String(row?.rule ?? "").trim(),
          }))
          .filter((row) => row.rule.length > 0)
      : [];
    const supportEmail = String(payload.support_email ?? "").trim();
    const chatbotLink = String(payload.chatbot_link ?? "").trim();

    await client.query("BEGIN");

    const current = await client.query<{ id: number }>(
      `SELECT id FROM guest_instruction_settings ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1 FOR UPDATE`
    );

    let settingId: number;
    if (current.rows[0]?.id) {
      settingId = current.rows[0].id;
      await client.query(
        `
          UPDATE guest_instruction_settings
          SET
            presentation = $2,
            available_days = $3::text[],
            start_date = NULLIF($4, '')::date,
            end_date = NULLIF($5, '')::date,
            start_time = NULLIF($6, '')::time,
            end_time = NULLIF($7, '')::time,
            calendar_link = $8,
            download_link = $9,
            epic_account_link = $10,
            steps = $11::jsonb,
            support_email = $12,
            chatbot_link = $13,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          settingId,
          presentation,
          availableDays,
          startDate,
          endDate,
          startTime,
          endTime,
          calendarLink,
          downloadLink,
          epicAccountLink,
          JSON.stringify(steps),
          supportEmail,
          chatbotLink,
        ]
      );
    } else {
      const inserted = await client.query<{ id: number }>(
        `
          INSERT INTO guest_instruction_settings (
            presentation,
            available_days,
            start_date,
            end_date,
            start_time,
            end_time,
            calendar_link,
            download_link,
            epic_account_link,
            steps,
            support_email,
            chatbot_link,
            updated_at
          ) VALUES (
            $1,
            $2::text[],
            NULLIF($3, '')::date,
            NULLIF($4, '')::date,
            NULLIF($5, '')::time,
            NULLIF($6, '')::time,
            $7,
            $8,
            $9,
            $10::jsonb,
            $11,
            $12,
            NOW()
          )
          RETURNING id
        `,
        [
          presentation,
          availableDays,
          startDate,
          endDate,
          startTime,
          endTime,
          calendarLink,
          downloadLink,
          epicAccountLink,
          JSON.stringify(steps),
          supportEmail,
          chatbotLink,
        ]
      );
      settingId = inserted.rows[0]!.id;
    }

    await client.query(`DELETE FROM guest_instruction_rules WHERE setting_id = $1`, [settingId]);
    for (const row of rules.sort((a, b) => a.position - b.position)) {
      await client.query(
        `INSERT INTO guest_instruction_rules (setting_id, rule, position) VALUES ($1, $2, $3)`,
        [settingId, row.rule, row.position]
      );
    }

    await client.query("COMMIT");

    const output = await buildGuestInstructionPayload(settingId);
    return res.json(output);
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to save instruction settings";
    return res.status(500).json({ error: message });
  } finally {
    client.release();
  }
});

app.put("/api/guest-instruction", async (req, res) => {
  const payload = req.body as Partial<GuestInstructionPayload>;
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    const presentation = String(payload.presentation ?? "").trim();
    const availableDays = Array.isArray(payload.available_days)
      ? payload.available_days.map((day) => String(day).trim()).filter(Boolean)
      : [];
    const startDate = String(payload.start_date ?? "").trim();
    const endDate = String(payload.end_date ?? "").trim();
    const startTime = toHHMM(payload.start_time);
    const endTime = toHHMM(payload.end_time);
    const calendarLink = String(payload.calendar_link ?? "").trim();
    const steps = normalizeInstructionSteps(payload.steps);
    const rules = Array.isArray(payload.rules)
      ? payload.rules
          .map((row, index) => ({
            position: Number(row?.position ?? index + 1),
            rule: String(row?.rule ?? "").trim(),
          }))
          .filter((row) => row.rule.length > 0)
      : [];
    const supportEmail = String(payload.support_email ?? "").trim();
    const chatbotLink = String(payload.chatbot_link ?? "").trim();

    await client.query("BEGIN");

    const current = await client.query<{ id: number }>(
      `SELECT id FROM guest_instruction_settings ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1 FOR UPDATE`
    );

    let settingId: number;
    if (current.rows[0]?.id) {
      settingId = current.rows[0].id;
      await client.query(
        `
          UPDATE guest_instruction_settings
          SET
            presentation = $2,
            available_days = $3::text[],
            start_date = NULLIF($4, '')::date,
            end_date = NULLIF($5, '')::date,
            start_time = NULLIF($6, '')::time,
            end_time = NULLIF($7, '')::time,
            calendar_link = $8,
            steps = $9::jsonb,
            support_email = $10,
            chatbot_link = $11,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          settingId,
          presentation,
          availableDays,
          startDate,
          endDate,
          startTime,
          endTime,
          calendarLink,
          JSON.stringify(steps),
          supportEmail,
          chatbotLink,
        ]
      );
    } else {
      const inserted = await client.query<{ id: number }>(
        `
          INSERT INTO guest_instruction_settings (
            presentation,
            available_days,
            start_date,
            end_date,
            start_time,
            end_time,
            calendar_link,
            steps,
            support_email,
            chatbot_link,
            updated_at
          ) VALUES (
            $1,
            $2::text[],
            NULLIF($3, '')::date,
            NULLIF($4, '')::date,
            NULLIF($5, '')::time,
            NULLIF($6, '')::time,
            $7,
            $8::jsonb,
            $9,
            $10,
            NOW()
          )
          RETURNING id
        `,
        [
          presentation,
          availableDays,
          startDate,
          endDate,
          startTime,
          endTime,
          calendarLink,
          JSON.stringify(steps),
          supportEmail,
          chatbotLink,
        ]
      );
      settingId = inserted.rows[0]!.id;
    }

    await client.query(`DELETE FROM guest_instruction_rules WHERE setting_id = $1`, [settingId]);
    for (const row of rules.sort((a, b) => a.position - b.position)) {
      await client.query(
        `INSERT INTO guest_instruction_rules (setting_id, rule, position) VALUES ($1, $2, $3)`,
        [settingId, row.rule, row.position]
      );
    }

    await client.query("COMMIT");

    const output = await buildGuestInstructionPayload(settingId);
    return res.json(output);
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to save guest instruction";
    return res.status(500).json({ error: message });
  } finally {
    client.release();
  }
});
app.get("/test-email", async (req, res) => {
  try {
    await sendInstructionEmail("islemrjab02@gmail.com");
    res.send("Email envoyé !");
  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur envoi email");
  }
});
app.put("/api/lead-scoring/weights", async (req, res) => {
  try {
    const payload = req.body as unknown;
    if (!Array.isArray(payload)) {
      return res.status(400).json({ error: "Expected an array of lead scoring rows" });
    }

    const rows = payload as Array<Pick<LeadScoringWeightRow, "kpi_key" | "label" | "category" | "weight" | "is_default">>;
    const saved = await saveLeadScoringWeights(rows);
    return res.json(saved);
  } catch (error) {
    const typed = error as Error & { status?: number };
    const status = typeof typed.status === "number" ? typed.status : 500;
    const message = error instanceof Error ? error.message : "Failed to save lead scoring weights";
    return res.status(status).json({ error: message });
  }
});

app.get("/api/admin/access-matrix", async (_req, res) => {
  try {
    const payload = await getAdminAccessMatrixPayload();
    return res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load access matrix";
    return res.status(500).json({ error: message });
  }
});

app.patch("/api/admin/access-matrix", async (req, res) => {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const payload = req.body as {
      roles?: AccessRole[];
      services?: AccessService[];
      matrix?: AccessMatrix;
    };

    if (!payload || !Array.isArray(payload.roles) || !Array.isArray(payload.services) || !payload.matrix) {
      return res.status(400).json({ error: "Invalid payload. Expected { roles, services, matrix }" });
    }

    await ensureAccessMatrixTables();
    await client.query("BEGIN");

    await client.query("DELETE FROM admin_access_matrix");

    for (const role of payload.roles) {
      await client.query(
        `
        INSERT INTO roles (id, name)
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
        `,
        [role.id, role.name]
      );
    }

    for (const service of payload.services) {
      await upsertServiceInCoreTable(service);
    }

    for (const role of payload.roles) {
      for (const service of payload.services) {
        const hasAccess = Boolean(payload.matrix?.[role.id]?.[service.id]);
        await client.query(
          `INSERT INTO admin_access_matrix (role_id, service_id, has_access) VALUES ($1, $2, $3)`,
          [role.id, service.id, hasAccess]
        );
      }
    }

    await client.query("COMMIT");

    try {
      await syncUsersRoleConstraint();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Users role constraint sync skipped: ${message}`);
    }

    const out = await getAdminAccessMatrixPayload();
    return res.json(out);
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to save access matrix";
    return res.status(500).json({ error: message });
  } finally {
    client.release();
  }
});

app.post("/api/admin/roles", async (req, res) => {
  try {
    await ensureAccessMatrixTables();
    const name = String((req.body as { name?: string })?.name ?? "").trim();
    if (!name) {
      return res.status(400).json({ error: "Missing role name" });
    }

    const role: AccessRole = {
      id: createEntityId(name),
      name,
      isDefault: false,
    };

    await queryDb(`INSERT INTO roles (id, name) VALUES ($1, $2)`, [role.id, role.name]);

    const { idColumn, nameColumn } = await resolveServiceCoreColumns();
    const safeIdColumn = toSafeIdentifier(idColumn);
    const safeNameColumn = toSafeIdentifier(nameColumn);
    const services = await queryDb<AccessService>(
      `SELECT ${safeIdColumn}::text AS id, COALESCE(NULLIF(${safeNameColumn}, ''), ${safeIdColumn}::text) AS name FROM service`
    );
    for (const service of services.rows) {
      await queryDb(
        `INSERT INTO admin_access_matrix (role_id, service_id, has_access) VALUES ($1, $2, false)`,
        [role.id, service.id]
      );
    }

    try {
      await syncUsersRoleConstraint();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Users role constraint sync skipped: ${message}`);
    }
    return res.status(201).json(role);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create role";
    return res.status(500).json({ error: message });
  }
});

app.delete("/api/admin/roles/:id", async (req, res) => {
  try {
    await ensureAccessMatrixTables();
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      return res.status(400).json({ error: "Missing role id" });
    }

    const roleRes = await queryDb<Pick<AccessRole, "id" | "name">>(`SELECT id, name FROM roles WHERE id=$1`, [id]);
    const role = roleRes.rows[0];
    if (!role) return res.status(404).json({ error: "Role not found" });
    const isDefault = DEFAULT_ACCESS_ROLES.some((item) => item.id === role.id);
    if (isDefault) return res.status(400).json({ error: "Default roles cannot be deleted" });

    await queryDb(`DELETE FROM roles WHERE id=$1`, [id]);
    try {
      await syncUsersRoleConstraint();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Users role constraint sync skipped: ${message}`);
    }
    return res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete role";
    return res.status(500).json({ error: message });
  }
});

app.post("/api/admin/services", async (req, res) => {
  try {
    await ensureAccessMatrixTables();
    const name = String((req.body as { name?: string })?.name ?? "").trim();
    if (!name) {
      return res.status(400).json({ error: "Missing service name" });
    }

    const service: AccessService = {
      id: (slugifyId(name) || createEntityId(name)).toUpperCase(),
      name,
    };

    await upsertServiceInCoreTable(service);

    const roles = await queryDb<AccessRole>("SELECT id, name FROM roles");
    for (const role of roles.rows) {
      await queryDb(
        `INSERT INTO admin_access_matrix (role_id, service_id, has_access) VALUES ($1, $2, false)`,
        [role.id, service.id]
      );
    }

    return res.status(201).json(service);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create service";
    return res.status(500).json({ error: message });
  }
});

app.delete("/api/admin/services/:id", async (req, res) => {
  try {
    await ensureAccessMatrixTables();
    const rawIdentifier = String(req.params.id ?? "").trim();
    if (!rawIdentifier) {
      return res.status(400).json({ error: "Missing service id" });
    }

    const service = await deleteServiceFromCoreTable(rawIdentifier);
    if (!service) return res.status(404).json({ error: "Service not found" });

    return res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete service";
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
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number"
      ? Number((error as { status?: number }).status)
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
  } catch (error) {
    const typed = error as Error & { status?: number };
    const status = typeof typed.status === "number" ? typed.status : 500;
    const message = error instanceof Error ? error.message : "Recommendation failed";
    return res.status(status).json({ error: message });
  }
});

app.post("/api/recommend/:guest_id/save", async (req, res) => {
  try {
    const guestId = String(req.params.guest_id ?? "").trim();
    if (!guestId) {
      return res.status(400).json({ error: "Missing guest_id" });
    }

    const payload = req.body as unknown;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Missing recommendation payload" });
    }

    const recommendation = payload as Parameters<typeof saveRecommendationForGuest>[1];
    const saved = await saveRecommendationForGuest(guestId, recommendation);
    return res.json({
      message: "Recommendation saved",
      ...saved,
    });
  } catch (error) {
    const typed = error as Error & { status?: number };
    const status = typeof typed.status === "number" ? typed.status : 500;
    const message = error instanceof Error ? error.message : "Failed to save recommendation";
    return res.status(status).json({ error: message });
  }
});

app.get("/api/recommend/offers", async (_req, res) => {
  try {
    const offers = await listRecommendedOffers();
    return res.json(offers);
  } catch (error) {
    const typed = error as Error & { status?: number };
    const status = typeof typed.status === "number" ? typed.status : 500;
    const message = error instanceof Error ? error.message : "Failed to list offers";
    return res.status(status).json({ error: message });
  }
});

app.patch("/api/recommend/:guest_id/status", async (req, res) => {
  try {
    const guestId = String(req.params.guest_id ?? "").trim();
    if (!guestId) {
      return res.status(400).json({ error: "Missing guest_id" });
    }

    const rawStatus = String((req.body as { status?: string })?.status ?? "").trim();
    const normalizedStatus = rawStatus
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z_]/g, "");

    const statusMap: Record<string, OfferStatus> = {
      en_attente: "en_attente",
      pending: "en_attente",
      generee: "generée",
      generated: "generée",
      envoyee: "envoyée",
      envoyae: "envoyée",
      sent: "envoyée",
      acceptee: "acceptée",
      acceptae: "acceptée",
      accepted: "acceptée",
      refusee: "refusée",
      refusae: "refusée",
      rejected: "refusée",
    };

    const statusInput = statusMap[normalizedStatus];
    if (!statusInput) {
      return res.status(400).json({ error: "Invalid status. Use en_attente | generée | envoyée | acceptée | refusée" });
    }

    const updated = await updateRecommendedOfferStatus(guestId, statusInput);
    return res.json({ message: "Offer status updated", ...updated });
  } catch (error) {
    const typed = error as Error & { status?: number };
    const status = typeof typed.status === "number" ? typed.status : 500;
    const message = error instanceof Error ? error.message : "Failed to update offer status";
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
        role: "system" as const,
        content: `You are a TALENTVERSE business assistant.
You ONLY select services from the provided list.
You ALWAYS return valid JSON only.
You NEVER invent services not in the provided list.
You must return exactly these keys: main_interest, recommended_pack, offer_message, priority.
No other keys are allowed.`,
      },
      {
        role: "user" as const,
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

    let generated: GeneratedPackResponse;
    try {
      generated = await callGroq();
    } catch {
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
        if (!selected) return null;
        return {
          id: selected.id,
          name: selected.name,
          price: selected.price,
          reason: String(item.reason ?? "").trim() || "Selected for KPI and domain alignment.",
        };
      })
      .filter((item): item is PackService => item !== null)
      .slice(0, 3);

    if (!normalizedServices.length) {
      return res.status(404).json({ error: "No services match your profile yet" });
    }

    const priority = String(generated.priority ?? "MEDIUM").toUpperCase();
    const mainInterest = String(generated.main_interest ?? "General optimization").trim();
    const offerMessage = String(generated.offer_message ?? "").trim()
      || `A personalized TalentVerse offer for ${user.domain}.`;

    const strictResponse: Pick<GeneratedPackResponse, "main_interest" | "recommended_pack" | "offer_message" | "priority"> = {
      main_interest: mainInterest,
      recommended_pack: normalizedServices.map((service) => ({
        service: service.id,
        reason: service.reason,
      })),
      offer_message: offerMessage,
      priority: (priority === "HIGH" || priority === "MEDIUM" || priority === "LOW")
        ? priority as "HIGH" | "MEDIUM" | "LOW"
        : "MEDIUM",
    };

    return res.json(strictResponse);
  } catch (error) {
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
  console.log(
    `PostgreSQL tables loaded at startup: ${
      keys.length ? keys.join(", ") : "none"
    }`
  );
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Database preload failed: ${message}`);
});

export default app;
