import { useEffect, useMemo, useState } from "react";
import { Bell, User, Lock, SlidersHorizontal, Plus, X } from "lucide-react";
import { toast } from "@/components/ui/sonner";

type SettingsSection = "profile" | "notifications" | "roles" | "lead-scoring";

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

type LeadCriterion = {
  kpi_key: string;
  label: string;
  category: string;
  weight: number;
  is_default: boolean;
};

type LeadScoringKpiOption = {
  kpi_key: string;
  label: string;
  category: string;
};

const DEFAULT_ROLES: AccessRole[] = [
  { id: "guest", name: "Guest", isDefault: true },
  { id: "client", name: "Client", isDefault: true },
  { id: "partenaire", name: "Partenaire", isDefault: true },
];

const DEFAULT_SERVICES: AccessService[] = [
  { id: "training_center", name: "Training Center" },
  { id: "pitch_room", name: "Pitch Room" },
  { id: "showcase_room", name: "Showcase Room" },
  { id: "opportunity_room", name: "Opportunity Room" },
];

const DEFAULT_MATRIX: AccessMatrix = {
  guest: {
    training_center: false,
    pitch_room: false,
    showcase_room: true,
    opportunity_room: false,
  },
  client: {
    training_center: true,
    pitch_room: false,
    showcase_room: true,
    opportunity_room: true,
  },
  partenaire: {
    training_center: true,
    pitch_room: true,
    showcase_room: true,
    opportunity_room: true,
  },
};

const defaultLeadCriteria: LeadCriterion[] = [
  { kpi_key: "session_duration", label: "Durée session", category: "Engagement", weight: 35, is_default: false },
  { kpi_key: "rooms_visited", label: "Rooms visitées", category: "Engagement", weight: 25, is_default: false },
  { kpi_key: "voice_time", label: "Temps vocal", category: "Engagement", weight: 20, is_default: false },
  { kpi_key: "interactions", label: "Interactions", category: "Engagement", weight: 15, is_default: false },
  { kpi_key: "idle_time", label: "Idle time", category: "Engagement", weight: 5, is_default: false },
];

type ProfileFormState = {
  fullName: string;
  jobTitle: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type NotificationState = {
  alertEmail: string;
  highChurnRiskDetected: boolean;
  newGuestConverted: boolean;
  criticalAntiChurnSignal: boolean;
  weeklyPerformanceReport: boolean;
  upsellingOpportunityDetected: boolean;
};

type RolePermission = {
  role: "Guest" | "Client" | "Partner";
  description: string;
  rooms: string[];
};

const rolePermissions: RolePermission[] = [
  {
    role: "Guest",
    description: "Basic exploration access for first-time users.",
    rooms: ["Lobby", "Showcase Room"],
  },
  {
    role: "Client",
    description: "Extended product and opportunity access for active clients.",
    rooms: ["Lobby", "Showcase Room", "Training Center", "Opportunity Room"],
  },
  {
    role: "Partner",
    description: "Full platform access for strategic collaboration and pitching.",
    rooms: ["Lobby", "Showcase Room", "Training Center", "Opportunity Room", "Pitch Room"],
  },
];

const roleCardStyles: Record<RolePermission["role"], string> = {
  Guest: "border-slate-200 bg-slate-50",
  Client: "border-blue-200 bg-blue-50",
  Partner: "border-purple-200 bg-purple-50",
};

function SettingsSwitch({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        checked ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-slate-200"
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function getPasswordStrength(password: string): number {
  if (!password) {
    return 0;
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  return Math.max(1, Math.min(4, score));
}

export default function Settings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [rolesData, setRolesData] = useState<AccessRole[]>(DEFAULT_ROLES);
  const [servicesData, setServicesData] = useState<AccessService[]>(DEFAULT_SERVICES);
  const [accessMatrix, setAccessMatrix] = useState<AccessMatrix>(DEFAULT_MATRIX);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newServiceName, setNewServiceName] = useState("");
  const [newRoleAccess, setNewRoleAccess] = useState<Record<string, boolean>>({});
  const [isSavingAccessMatrix, setIsSavingAccessMatrix] = useState(false);
  const [leadCriteria, setLeadCriteria] = useState<LeadCriterion[]>(defaultLeadCriteria);
  const [availableKpis, setAvailableKpis] = useState<LeadScoringKpiOption[]>([]);
  const [selectedKpiKey, setSelectedKpiKey] = useState<string>("");
  const [leadWarning, setLeadWarning] = useState<string>("");
  const [isSavingLeadScoring, setIsSavingLeadScoring] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    fullName: "Admin TalentVerse",
    jobTitle: "Platform Manager",
    email: "admin@talentverse.io",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [notifications, setNotifications] = useState<NotificationState>({
    alertEmail: "admin@talentverse.io",
    highChurnRiskDetected: true,
    newGuestConverted: true,
    criticalAntiChurnSignal: true,
    weeklyPerformanceReport: false,
    upsellingOpportunityDetected: false,
  });

  const initials = useMemo(() => {
    return profileForm.fullName
      .split(" ")
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [profileForm.fullName]);

  const passwordStrength = useMemo(() => getPasswordStrength(profileForm.newPassword), [profileForm.newPassword]);

  const saveChanges = () => {
    toast.success("Changes saved!", { duration: 2000, position: "bottom-right" });
  };

  const loadAccessMatrix = async () => {
    try {
      const res = await fetch("/api/admin/access-matrix");
      if (!res.ok) return;
      const payload = (await res.json()) as {
        roles: AccessRole[];
        services: AccessService[];
        matrix: AccessMatrix;
      };
      if (Array.isArray(payload.roles) && Array.isArray(payload.services) && payload.matrix) {
        setRolesData(payload.roles);
        setServicesData(payload.services);
        setAccessMatrix(payload.matrix);
      }
    } catch {
      // Keep local defaults when API is unavailable.
    }
  };

  const toggleServiceAccess = (roleId: string, serviceId: string) => {
    setAccessMatrix((prev) => ({
      ...prev,
      [roleId]: {
        ...(prev[roleId] ?? {}),
        [serviceId]: !Boolean(prev[roleId]?.[serviceId]),
      },
    }));
  };

  const saveAccessMatrix = async () => {
    try {
      setIsSavingAccessMatrix(true);
      const res = await fetch("/api/admin/access-matrix", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roles: rolesData,
          services: servicesData,
          matrix: accessMatrix,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Save API error ${res.status}`);
      }
      const payload = (await res.json()) as {
        roles: AccessRole[];
        services: AccessService[];
        matrix: AccessMatrix;
      };
      setRolesData(payload.roles);
      setServicesData(payload.services);
      setAccessMatrix(payload.matrix);
      toast.success("Access matrix updated", { duration: 2000, position: "bottom-right" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save access matrix";
      toast.error(message, { duration: 3000, position: "bottom-right" });
    } finally {
      setIsSavingAccessMatrix(false);
    }
  };

  const resetAccessDefaults = () => {
    setRolesData(DEFAULT_ROLES);
    setServicesData(DEFAULT_SERVICES);
    setAccessMatrix(DEFAULT_MATRIX);
    toast.success("Access reset to defaults", { duration: 2000, position: "bottom-right" });
  };

  const addService = async () => {
    const name = newServiceName.trim();
    if (!name) return;

    const localId = `${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
    const optimisticService: AccessService = { id: localId, name };

    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Create service error ${res.status}`);
      }

      const created = (await res.json()) as AccessService;
      const service = created?.id ? created : optimisticService;

      setServicesData((prev) => [...prev, service]);
      setAccessMatrix((prev) => {
        const next: AccessMatrix = { ...prev };
        for (const role of rolesData) {
          next[role.id] = { ...(next[role.id] ?? {}), [service.id]: false };
        }
        return next;
      });
      setNewServiceName("");
      setShowAddServiceModal(false);
      toast.success("Service added", { duration: 2000, position: "bottom-right" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add service";
      toast.error(message, { duration: 3000, position: "bottom-right" });
    }
  };

  const addRole = async () => {
    const name = newRoleName.trim();
    if (!name) return;

    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Create role error ${res.status}`);
      }

      const created = (await res.json()) as AccessRole;
      setRolesData((prev) => [...prev, created]);
      setAccessMatrix((prev) => ({
        ...prev,
        [created.id]: servicesData.reduce<Record<string, boolean>>((acc, service) => {
          acc[service.id] = Boolean(newRoleAccess[service.id]);
          return acc;
        }, {}),
      }));

      setNewRoleName("");
      setNewRoleAccess({});
      setShowAddRoleModal(false);
      toast.success("Role added", { duration: 2000, position: "bottom-right" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add role";
      toast.error(message, { duration: 3000, position: "bottom-right" });
    }
  };

  const removeRole = async (role: AccessRole) => {
    if (role.isDefault) return;
    try {
      const res = await fetch(`/api/admin/roles/${encodeURIComponent(role.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Delete role error ${res.status}`);
      }
      setRolesData((prev) => prev.filter((item) => item.id !== role.id));
      setAccessMatrix((prev) => {
        const next = { ...prev };
        delete next[role.id];
        return next;
      });
      toast.success("Role removed", { duration: 2000, position: "bottom-right" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove role";
      toast.error(message, { duration: 3000, position: "bottom-right" });
    }
  };

  const removeService = async (service: AccessService) => {
    try {
      const res = await fetch(`/api/admin/services/${encodeURIComponent(service.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Delete service error ${res.status}`);
      }
      setServicesData((prev) => prev.filter((item) => item.id !== service.id));
      setAccessMatrix((prev) => {
        const next: AccessMatrix = {};
        for (const [roleId, row] of Object.entries(prev)) {
          const { [service.id]: _removed, ...rest } = row;
          next[roleId] = rest;
        }
        return next;
      });
      toast.success("Service removed", { duration: 2000, position: "bottom-right" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove service";
      toast.error(message, { duration: 3000, position: "bottom-right" });
    }
  };

  const totalLeadWeight = useMemo(
    () => leadCriteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0),
    [leadCriteria]
  );

  const availableKpiChoices = useMemo(() => {
    const used = new Set(leadCriteria.map((criterion) => criterion.kpi_key));
    return availableKpis.filter((item) => !used.has(item.kpi_key));
  }, [availableKpis, leadCriteria]);

  const loadLeadScoringData = async () => {
    try {
      const [weightsRes, kpisRes] = await Promise.all([
        fetch("/api/lead-scoring/weights"),
        fetch("/api/lead-scoring/kpis"),
      ]);

      if (weightsRes.ok) {
        const rows = (await weightsRes.json()) as Array<LeadCriterion & { created_at?: string; updated_at?: string }>;
        if (Array.isArray(rows) && rows.length) {
          setLeadCriteria(
            rows.map((row) => ({
              kpi_key: row.kpi_key,
              label: row.label,
              category: row.category,
              weight: Number(row.weight ?? 0),
              is_default: Boolean(row.is_default),
            }))
          );
        }
      }

      if (kpisRes.ok) {
        const rows = (await kpisRes.json()) as LeadScoringKpiOption[];
        setAvailableKpis(Array.isArray(rows) ? rows : []);
      }
    } catch {
      // Keep local defaults if API is unavailable.
    }
  };

  useEffect(() => {
    if (activeSection === "lead-scoring") {
      void loadLeadScoringData();
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === "roles") {
      void loadAccessMatrix();
    }
  }, [activeSection]);

  const setLeadWeight = (kpiKey: string, value: number) => {
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    setLeadCriteria((prev) => {
      const current = prev.find((criterion) => criterion.kpi_key === kpiKey);
      if (!current) return prev;

      const projectedTotal = totalLeadWeight - Number(current.weight || 0) + safeValue;
      if (projectedTotal > 100) {
        setLeadWarning("Total weight cannot exceed 100%. Please reduce another criterion first.");
        return prev;
      }

      setLeadWarning("");
      return prev.map((criterion) =>
        criterion.kpi_key === kpiKey ? { ...criterion, weight: safeValue } : criterion
      );
    });
  };

  const addCriterion = () => {
    const selected = availableKpiChoices.find((item) => item.kpi_key === selectedKpiKey);
    if (!selected) return;

    setLeadCriteria((prev) => [
      ...prev,
      {
        kpi_key: selected.kpi_key,
        label: selected.label,
        category: selected.category,
        weight: 0,
        is_default: false,
      },
    ]);
    setLeadWarning("");
    setSelectedKpiKey("");
  };

  const removeCriterion = (kpiKey: string) => {
    setLeadCriteria((prev) => {
      if (prev.length <= 3) {
        setLeadWarning("At least 3 criteria are required.");
        return prev;
      }

      setLeadWarning("");
      return prev.filter((criterion) => criterion.kpi_key !== kpiKey);
    });
  };

  const resetLeadScoring = () => {
    setLeadCriteria(defaultLeadCriteria);
    setLeadWarning("");
    setSelectedKpiKey("");
    toast.success("Lead scoring reset to defaults", { duration: 2000, position: "bottom-right" });
  };

  const saveLeadScoring = async () => {
    if (totalLeadWeight !== 100) {
      toast.error("Total must equal 100% before saving", { duration: 2500, position: "bottom-right" });
      return;
    }

    try {
      setIsSavingLeadScoring(true);
      const res = await fetch("/api/lead-scoring/weights", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadCriteria),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Save API error ${res.status}`);
      }

      const rows = (await res.json()) as Array<LeadCriterion & { created_at?: string; updated_at?: string }>;
      setLeadCriteria(
        rows.map((row) => ({
          kpi_key: row.kpi_key,
          label: row.label,
          category: row.category,
          weight: Number(row.weight ?? 0),
          is_default: Boolean(row.is_default),
        }))
      );
      setLeadWarning("");
      toast.success("Lead scoring updated", { duration: 2000, position: "bottom-right" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save lead scoring";
      toast.error(message, { duration: 3000, position: "bottom-right" });
    } finally {
      setIsSavingLeadScoring(false);
    }
  };

  const profileNavItems: Array<{ id: SettingsSection; label: string; icon: typeof User | typeof Lock | typeof SlidersHorizontal }> = [
    { id: "profile", label: "Admin Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "lead-scoring", label: "Lead Scoring", icon: SlidersHorizontal },
    { id: "roles", label: "Roles & Access", icon: Lock },
  ];

  return (
    <div className="min-h-[calc(100vh-7.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex min-h-[calc(100vh-7.5rem)]">
        <aside className="h-full w-64 border-r border-slate-200 bg-slate-50">
          <h2 className="p-6 text-lg font-bold text-slate-900">Settings</h2>
          <nav className="space-y-2 px-3 pb-6">
            {profileNavItems.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeSection;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                    active
                      ? "border border-slate-200 bg-white font-medium text-slate-900 shadow-sm"
                      : "text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="flex-1 bg-white p-8 overflow-y-auto">
          {activeSection === "profile" ? (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900">Admin Profile</h1>
                <p className="text-sm text-slate-500">Manage your account information and security.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-6 text-base font-bold text-slate-900">Personal Information</h3>

                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white">
                    {initials || "AT"}
                  </div>
                  <button type="button" className="text-sm font-medium text-indigo-600">
                    Change Photo
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Full Name</label>
                    <input
                      value={profileForm.fullName}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          fullName: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Job Title</label>
                    <input
                      value={profileForm.jobTitle}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          jobTitle: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700">Email Address</label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          email: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={saveChanges}
                  className="mt-6 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Save
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-6 text-base font-bold text-slate-900">Change Password</h3>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Current Password</label>
                    <input
                      type="password"
                      value={profileForm.currentPassword}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          currentPassword: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">New Password</label>
                    <input
                      type="password"
                      value={profileForm.newPassword}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          newPassword: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />

                    <div className="mt-2 flex gap-1.5">
                      {[1, 2, 3, 4].map((segment) => {
                        let activeColor = "bg-slate-200";
                        if (passwordStrength >= segment) {
                          if (passwordStrength === 1) activeColor = "bg-red-500";
                          if (passwordStrength === 2) activeColor = "bg-orange-500";
                          if (passwordStrength === 3) activeColor = "bg-yellow-400";
                          if (passwordStrength >= 4) activeColor = "bg-green-500";
                        }

                        return <div key={segment} className={`h-1.5 flex-1 rounded-full ${activeColor}`} />;
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Confirm New Password</label>
                    <input
                      type="password"
                      value={profileForm.confirmPassword}
                      onChange={(event) =>
                        setProfileForm((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={saveChanges}
                  className="mt-6 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Update Password
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-2 text-base font-bold text-slate-900">Roles &amp; Permissions</h3>
                <p className="mb-6 text-sm text-slate-500">Default room access by role.</p>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {rolePermissions.map((item) => (
                    <div key={item.role} className={`rounded-xl border p-4 ${roleCardStyles[item.role]}`}>
                      <h4 className="text-sm font-bold text-slate-900">{item.role}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.description}</p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.rooms.map((room) => (
                          <span
                            key={`${item.role}-${room}`}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700"
                          >
                            {room}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : activeSection === "roles" ? (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900">Roles & Services Access</h1>
                <p className="text-sm text-slate-500">Configure which services each role can access.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-slate-900">Access Matrix</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddServiceModal(true);
                        setNewServiceName("");
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      + Add Service
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddRoleModal(true);
                        setNewRoleName("");
                        setNewRoleAccess(servicesData.reduce<Record<string, boolean>>((acc, service) => {
                          acc[service.id] = false;
                          return acc;
                        }, {}));
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      + Add Role
                    </button>
                    <button
                      type="button"
                      onClick={resetAccessDefaults}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Reset to Defaults
                    </button>
                    <button
                      type="button"
                      onClick={saveAccessMatrix}
                      disabled={isSavingAccessMatrix}
                      className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingAccessMatrix ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Role</th>
                        {servicesData.map((service) => (
                          <th key={service.id} className="group px-4 py-3 text-center font-semibold text-slate-700">
                            <div className="flex items-center justify-center gap-1">
                              <span>{service.name}</span>
                              <button
                                type="button"
                                onClick={() => void removeService(service)}
                                className="invisible inline-flex items-center justify-center rounded border border-slate-200 p-0.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 group-hover:visible"
                                title="Delete service"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rolesData.map((role) => (
                        <tr key={role.id} className="group border-b border-slate-100 hover:bg-slate-50 animate-slide-up">
                          <td className="px-4 py-4 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{role.name}</span>
                              <button
                                type="button"
                                disabled={role.isDefault}
                                onClick={() => void removeRole(role)}
                                className="invisible inline-flex items-center justify-center rounded border border-slate-200 p-0.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 group-hover:visible"
                                title={role.isDefault ? "Default roles cannot be deleted" : "Delete role"}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          {servicesData.map((service) => (
                            <td key={`${role.id}-${service.id}`} className="px-4 py-4 text-center">
                              <SettingsSwitch
                                checked={Boolean(accessMatrix[role.id]?.[service.id])}
                                onToggle={() => toggleServiceAccess(role.id, service.id)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {showAddServiceModal ? (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
                      <h4 className="text-base font-bold text-slate-900">Add Service</h4>
                      <input
                        value={newServiceName}
                        onChange={(event) => setNewServiceName(event.target.value)}
                        placeholder="Service name"
                        className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                      />
                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddServiceModal(false)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void addService()}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {showAddRoleModal ? (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
                      <h4 className="text-base font-bold text-slate-900">Add Role</h4>
                      <input
                        value={newRoleName}
                        onChange={(event) => setNewRoleName(event.target.value)}
                        placeholder="Role name"
                        className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                      />
                      <div className="mt-4 space-y-2">
                        {servicesData.map((service) => (
                          <div key={service.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                            <span className="text-sm text-slate-700">{service.name}</span>
                            <SettingsSwitch
                              checked={Boolean(newRoleAccess[service.id])}
                              onToggle={() =>
                                setNewRoleAccess((prev) => ({
                                  ...prev,
                                  [service.id]: !Boolean(prev[service.id]),
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddRoleModal(false)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void addRole()}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : activeSection === "lead-scoring" ? (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900">Lead Scoring</h1>
                <p className="text-sm text-slate-500">Adjust scoring weights used to prioritize leads.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <select
                    value={selectedKpiKey}
                    onChange={(event) => setSelectedKpiKey(event.target.value)}
                    className="min-w-[280px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select KPI to add</option>
                    {availableKpiChoices.map((option) => (
                      <option key={option.kpi_key} value={option.kpi_key}>
                        {option.label} - {option.category}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addCriterion}
                    disabled={!selectedKpiKey}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add Criteria
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Critere</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Categorie</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Poids</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadCriteria.map((item) => (
                        <tr key={item.kpi_key} className="animate-slide-up border-b border-slate-100 last:border-b-0">
                          <td className="px-4 py-4 font-medium text-slate-900">{item.label}</td>
                          <td className="px-4 py-4 text-slate-600">{item.category}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={item.weight}
                                onChange={(event) => setLeadWeight(item.kpi_key, Number(event.target.value))}
                                className="h-2 w-full cursor-pointer accent-indigo-600"
                              />
                              <div className="flex w-20 items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={item.weight}
                                  onChange={(event) => setLeadWeight(item.kpi_key, Number(event.target.value))}
                                  className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <span className="text-slate-500">%</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => removeCriterion(item.kpi_key)}
                              className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                              title="Remove criteria"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                    <span className="text-sm text-slate-600">Total des poids</span>
                    <span className={`text-sm font-bold ${totalLeadWeight > 100 ? "text-red-600" : "text-slate-900"}`}>
                      {totalLeadWeight}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full transition-all ${totalLeadWeight > 100 ? "bg-red-500" : "bg-blue-500"}`}
                      style={{ width: `${Math.min(totalLeadWeight, 100)}%` }}
                    />
                  </div>
                  {leadWarning ? <p className="mt-2 text-xs font-medium text-red-600">{leadWarning}</p> : null}
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={resetLeadScoring}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={saveLeadScoring}
                    disabled={totalLeadWeight !== 100 || isSavingLeadScoring}
                    className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingLeadScoring ? "Saving..." : "Save Weights"}
                  </button>
                </div>

                <div className="mt-2 text-xs text-slate-500">
                  Save is enabled only when total weight equals 100%.
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
                <p className="text-sm text-slate-500">Configure how and when you receive alerts.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-6 text-base font-bold text-slate-900">Email Notifications</h3>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Send alerts to</label>
                  <input
                    value={notifications.alertEmail}
                    onChange={(event) =>
                      setNotifications((prev) => ({
                        ...prev,
                        alertEmail: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="mt-4 space-y-4">
                  {[
                    {
                      key: "highChurnRiskDetected",
                      label: "High churn risk detected",
                    },
                    {
                      key: "newGuestConverted",
                      label: "New guest converted",
                    },
                    {
                      key: "criticalAntiChurnSignal",
                      label: "Critical Anti-Churn signal",
                    },
                    {
                      key: "weeklyPerformanceReport",
                      label: "Weekly performance report",
                    },
                    {
                      key: "upsellingOpportunityDetected",
                      label: "Upselling opportunity detected",
                    },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                      <span className="text-sm text-slate-700 leading-snug">{item.label}</span>
                      <SettingsSwitch
                        checked={notifications[item.key as keyof NotificationState] as boolean}
                        onToggle={() =>
                          setNotifications((prev) => ({
                            ...prev,
                            [item.key]: !prev[item.key as keyof NotificationState],
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={saveChanges}
                  className="mt-6 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Save Changes
                </button>
              </div>

            </div>
          )}
        </section>
      </div>
    </div>
  );
}
