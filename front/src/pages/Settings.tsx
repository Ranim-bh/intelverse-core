import { useEffect, useMemo, useState } from "react";
import { Bell, User, Lock, SlidersHorizontal, Plus, Trash2, Edit } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadAccessControlState, saveAccessControlState } from "@/lib/access-control";

type SettingsSection = "profile" | "notifications" | "roles" | "lead-scoring";

type Service = string;
type Role = {
  id: string;
  name: string;
};

type RoleServiceAccess = Record<string, Record<Service, boolean>>;

type AdminAccessRole = {
  id: string;
  name: string;
  isDefault: boolean;
};

type AdminAccessService = {
  id: string;
  name: string;
};

type AdminAccessMatrixPayload = {
  roles: AdminAccessRole[];
  services: AdminAccessService[];
  matrix: Record<string, Record<string, boolean>>;
};

type LeadScoringWeights = {
  sessionDuration: number;
  roomsVisited: number;
  voiceTime: number;
  interactions: number;
  idleTime: number;
};

type Criterion = {
  id: string;
  name: string;
  weight: number;
};

const defaultRoleServiceAccess: RoleServiceAccess = {
  guest: {
    "Showcase Room": true,
    "Training Center": false,
    "Pitch Room": false,
    "Opportunity Room": false,
  },
  client: {
    "Showcase Room": true,
    "Training Center": true,
    "Pitch Room": false,
    "Opportunity Room": true,
  },
  partenaire: {
    "Showcase Room": true,
    "Training Center": true,
    "Pitch Room": true,
    "Opportunity Room": true,
  },
};

const defaultServices: Service[] = ["Training Center", "Pitch Room", "Showcase Room", "Opportunity Room"];
const defaultRoles: Role[] = [
  { id: "guest", name: "Guest" },
  { id: "client", name: "Client" },
  { id: "partenaire", name: "Partenaire" },
];

const defaultLeadScoringWeights: LeadScoringWeights = {
  sessionDuration: 35,
  roomsVisited: 25,
  voiceTime: 20,
  interactions: 15,
  idleTime: 0,
};

const initialAccessControl = loadAccessControlState();

const defaultCriteria: Criterion[] = [
  { id: "sessionDuration", name: "Duree session", weight: 35 },
  { id: "roomsVisited", name: "Rooms visitees", weight: 25 },
  { id: "voiceTime", name: "Temps vocal", weight: 20 },
  { id: "interactions", name: "Interactions", weight: 15 },
  { id: "idleTime", name: "Idle time", weight: 0 },
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

const serviceDescriptions: Record<string, string> = {
  "Training Center": "Hands-on learning and product training resources.",
  "Pitch Room": "Sales storytelling space for live demos and proposals.",
  "Showcase Room": "Public-facing area to discover products and features.",
  "Opportunity Room": "Pipeline collaboration and deal progression workspace.",
};

function SettingsSwitch({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-all focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
        checked ? "border-violet-600 bg-violet-600" : "border-slate-300 bg-slate-200"
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
  const [roleServiceAccess, setRoleServiceAccess] = useState<RoleServiceAccess>(initialAccessControl.roleServiceAccess);
  const [roles, setRoles] = useState<Role[]>(initialAccessControl.roles);
  const [services, setServices] = useState<Service[]>(initialAccessControl.services);
  const [serviceIdByName, setServiceIdByName] = useState<Record<string, string>>({});
  const [defaultRoleIds, setDefaultRoleIds] = useState<Set<string>>(new Set(["guest", "client", "partenaire"]));
  const [hasLoadedAccessFromApi, setHasLoadedAccessFromApi] = useState<boolean>(false);
  const [isHydratingAccessFromApi, setIsHydratingAccessFromApi] = useState<boolean>(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>(initialAccessControl.roles[0]?.id ?? "");
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [editingServiceValue, setEditingServiceValue] = useState<string>("");
  const [newServiceName, setNewServiceName] = useState<string>("");
  const [newRoleName, setNewRoleName] = useState<string>("");
  const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState<boolean>(false);
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState<boolean>(false);
  const [editingCriterionId, setEditingCriterionId] = useState<string | null>(null);
  const [editingCriterionName, setEditingCriterionName] = useState<string>("");
  const [criteria, setCriteria] = useState<Criterion[]>(defaultCriteria);
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

  const toFallbackServiceId = (serviceName: string) =>
    serviceName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const buildAdminAccessPayload = (): AdminAccessMatrixPayload => {
    const apiServices: AdminAccessService[] = services.map((serviceName) => ({
      id: serviceIdByName[serviceName] ?? (toFallbackServiceId(serviceName) || `service_${Date.now()}`),
      name: serviceName,
    }));

    const matrixByRoleAndServiceId: Record<string, Record<string, boolean>> = {};
    for (const role of roles) {
      matrixByRoleAndServiceId[role.id] = {};
      for (const service of apiServices) {
        matrixByRoleAndServiceId[role.id][service.id] = Boolean(roleServiceAccess[role.id]?.[service.name]);
      }
    }

    return {
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        isDefault: defaultRoleIds.has(role.id),
      })),
      services: apiServices,
      matrix: matrixByRoleAndServiceId,
    };
  };

  const persistAccessMatrixToApi = async () => {
    const payload = buildAdminAccessPayload();
    const res = await fetch("/api/admin/access-matrix", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Unable to sync access matrix (${res.status})`);
    }
  };

  const hydrateAccessFromApi = async () => {
    setIsHydratingAccessFromApi(true);
    try {
      const res = await fetch("/api/admin/access-matrix");
      if (!res.ok) return;

      const payload = (await res.json()) as AdminAccessMatrixPayload;
      if (!Array.isArray(payload.roles) || !Array.isArray(payload.services) || !payload.matrix) return;

      const nextRoles: Role[] = payload.roles.map((role) => ({ id: role.id, name: role.name }));
      const nextServices: Service[] = payload.services.map((service) => service.name);
      const nextServiceIdByName = payload.services.reduce<Record<string, string>>((acc, service) => {
        acc[service.name] = service.id;
        return acc;
      }, {});
      const nextRoleServiceAccess: RoleServiceAccess = {};

      for (const role of nextRoles) {
        nextRoleServiceAccess[role.id] = {};
        for (const service of payload.services) {
          nextRoleServiceAccess[role.id][service.name] = Boolean(payload.matrix[role.id]?.[service.id]);
        }
      }

      setRoles(nextRoles);
      setServices(nextServices);
      setServiceIdByName(nextServiceIdByName);
      setRoleServiceAccess(nextRoleServiceAccess);
      setDefaultRoleIds(new Set(payload.roles.filter((role) => role.isDefault).map((role) => role.id)));
      setSelectedRoleId((current) => (nextRoles.some((role) => role.id === current) ? current : nextRoles[0]?.id ?? ""));
    } catch {
      // Keep local state if backend is unavailable.
    } finally {
      setIsHydratingAccessFromApi(false);
      setHasLoadedAccessFromApi(true);
    }
  };

  useEffect(() => {
    saveAccessControlState({
      roles,
      services,
      roleServiceAccess,
    });
  }, [roles, services, roleServiceAccess]);

  useEffect(() => {
    void hydrateAccessFromApi();
  }, []);

  useEffect(() => {
    if (!hasLoadedAccessFromApi || isHydratingAccessFromApi) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void persistAccessMatrixToApi().catch(() => {
        // Do not block local UX if backend sync fails.
      });
    }, 250);

    return () => window.clearTimeout(timerId);
  }, [
    roles,
    services,
    roleServiceAccess,
    serviceIdByName,
    defaultRoleIds,
    hasLoadedAccessFromApi,
    isHydratingAccessFromApi,
  ]);

  useEffect(() => {
    if (!roles.some((role) => role.id === selectedRoleId)) {
      setSelectedRoleId(roles[0]?.id ?? "");
    }
  }, [roles, selectedRoleId]);

  const saveChanges = () => {
    toast.success("Changes saved!", { duration: 2000, position: "bottom-right" });
  };

  const toggleServiceAccess = (roleId: string, service: Service) => {
    setRoleServiceAccess((prev) => ({
      ...prev,
      [roleId]: {
        ...prev[roleId],
        [service]: !prev[roleId]?.[service],
      },
    }));
    toast.success("Access updated", { duration: 2000, position: "bottom-right" });
  };

  const addRole = async () => {
    const trimmed = newRoleName.trim();
    if (!trimmed) return;

    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        throw new Error("Unable to create role");
      }

      const createdRole = (await res.json()) as AdminAccessRole;
      setRoles((prev) => [...prev, { id: createdRole.id, name: createdRole.name }]);
      setRoleServiceAccess((prev) => ({
        ...prev,
        [createdRole.id]: Object.fromEntries(services.map((service) => [service, false])) as Record<Service, boolean>,
      }));
      setSelectedRoleId(createdRole.id);
      setNewRoleName("");
      setIsAddRoleModalOpen(false);
      toast.success("Role added", { duration: 2000, position: "bottom-right" });
    } catch {
      toast.error("Unable to add role", { duration: 3000, position: "bottom-right" });
    }
  };

  const updateRoleName = (roleId: string, name: string) => {
    setRoles((prev) => prev.map((role) => (role.id === roleId ? { ...role, name } : role)));
  };

  const deleteRole = async (roleId: string) => {
    if (defaultRoleIds.has(roleId)) {
      toast.error("Default roles cannot be deleted", { duration: 2500, position: "bottom-right" });
      return;
    }

    try {
      const res = await fetch(`/api/admin/roles/${encodeURIComponent(roleId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Unable to delete role");
      }

      setRoles((prev) => prev.filter((role) => role.id !== roleId));
      setRoleServiceAccess((prev) => {
        const copy = { ...prev };
        delete copy[roleId];
        return copy;
      });
      if (selectedRoleId === roleId) {
        const nextRole = roles.find((role) => role.id !== roleId);
        setSelectedRoleId(nextRole?.id ?? "");
      }
      toast.success("Role removed", { duration: 2000, position: "bottom-right" });
    } catch {
      toast.error("Unable to remove role", { duration: 3000, position: "bottom-right" });
    }
  };

  const addService = async () => {
    const trimmed = newServiceName.trim();
    if (!trimmed) return;

    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        throw new Error("Unable to create service");
      }

      const createdService = (await res.json()) as AdminAccessService;

      setServices((prev) => [...prev, createdService.name]);
      setServiceIdByName((prev) => ({ ...prev, [createdService.name]: createdService.id }));
      setRoleServiceAccess((prev) => {
        const updated = { ...prev };
        roles.forEach((role) => {
          if (!updated[role.id]) {
            updated[role.id] = {};
          }
          updated[role.id][createdService.name] = false;
        });
        return updated;
      });
      setNewServiceName("");
      setIsAddServiceModalOpen(false);
      toast.success("Service added", { duration: 2000, position: "bottom-right" });
    } catch {
      toast.error("Unable to add service", { duration: 3000, position: "bottom-right" });
    }
  };

  const updateService = (oldService: string, newService: string) => {
    if (newService.trim() && newService.trim() !== oldService) {
      setServices((prev) => prev.map((s) => (s === oldService ? newService.trim() : s)));
      setServiceIdByName((prev) => {
        const next = { ...prev };
        const currentId = next[oldService];
        delete next[oldService];
        if (currentId) {
          next[newService.trim()] = currentId;
        }
        return next;
      });
      // Update access mapping
      setRoleServiceAccess((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((roleId) => {
          if (updated[roleId][oldService] !== undefined) {
            updated[roleId][newService.trim()] = updated[roleId][oldService];
            delete updated[roleId][oldService];
          }
        });
        return updated;
      });
      setEditingService(null);
      setEditingServiceValue("");
      toast.success("Service updated", { duration: 2000, position: "bottom-right" });
    } else {
      setEditingService(null);
      setEditingServiceValue("");
    }
  };

  const deleteService = async (service: string) => {
    const serviceId = serviceIdByName[service] ?? toFallbackServiceId(service);
    try {
      const res = await fetch(`/api/admin/services/${encodeURIComponent(serviceId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Unable to delete service");
      }

      setServices((prev) => prev.filter((s) => s !== service));
      setServiceIdByName((prev) => {
        const next = { ...prev };
        delete next[service];
        return next;
      });
      setRoleServiceAccess((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((roleId) => {
          delete updated[roleId][service];
        });
        return updated;
      });
      toast.success("Service removed", { duration: 2000, position: "bottom-right" });
    } catch {
      toast.error("Unable to remove service", { duration: 3000, position: "bottom-right" });
    }
  };

  const updateCriterionWeight = (id: string, weight: number) => {
    const safeValue = Math.max(0, Math.min(100, weight));
    setCriteria((prev) => {
      const currentTotalExcludingThis = prev.reduce((sum, c) => c.id !== id ? sum + c.weight : sum, 0);
      const maxAllowed = 100 - currentTotalExcludingThis;
      const finalValue = Math.min(safeValue, maxAllowed);
      return prev.map((c) => (c.id === id ? { ...c, weight: finalValue } : c));
    });
  };

  const updateCriterionName = (id: string, name: string) => {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  };

  const addCriterion = () => {
    const newId = `criterion-${Date.now()}`;
    setCriteria((prev) => [...prev, { id: newId, name: "New Criterion", weight: 0 }]);
  };

  const deleteCriterion = (id: string) => {
    setCriteria((prev) => prev.filter((c) => c.id !== id));
  };

  const resetCriteria = () => {
    setCriteria(defaultCriteria);
  };

  const totalWeight = useMemo(() => criteria.reduce((sum, c) => sum + c.weight, 0), [criteria]);

  const saveLeadScoring = () => {
    toast.success("Lead scoring updated", { duration: 2000, position: "bottom-right" });
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
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-slate-900">Roles</h3>
                  <Dialog open={isAddRoleModalOpen} onOpenChange={(open) => {
                    setIsAddRoleModalOpen(open);
                    if (open) {
                      setNewRoleName("");
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Role
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Role</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <Input
                          placeholder="Role name"
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addRole();
                          }}
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setIsAddRoleModalOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={addRole} disabled={!newRoleName.trim()}>
                            Add Role
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-slate-700">Roles</h4>
                    <div className="space-y-2">
                      {roles.map((role) => {
                        const selected = role.id === selectedRoleId;
                        const isEditing = editingRole === role.id;
                        return (
                          <div
                            key={role.id}
                            className={`group flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
                              selected
                                ? "border-violet-400 bg-violet-50 text-violet-700"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            {isEditing ? (
                              <Input
                                value={role.name}
                                onChange={(e) => updateRoleName(role.id, e.target.value)}
                                onBlur={() => setEditingRole(null)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") setEditingRole(null);
                                  if (e.key === "Escape") setEditingRole(null);
                                }}
                                className="flex-1 h-8"
                                autoFocus
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setSelectedRoleId(role.id)}
                                className="flex-1 text-left"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{role.name}</span>
                                  {selected ? (
                                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                                      Selected
                                    </span>
                                  ) : null}
                                </div>
                              </button>
                            )}
                            <div className={`flex gap-1 transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                              <button
                                type="button"
                                onClick={() => setEditingRole(role.id)}
                                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRole(role.id)}
                                className="rounded p-1 text-red-600 hover:bg-red-100"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </aside>

                  <main className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-700">Services access for selected role</h4>
                      <Dialog open={isAddServiceModalOpen} onOpenChange={(open) => {
                        setIsAddServiceModalOpen(open);
                        if (open) {
                          setNewServiceName("");
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Service
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add New Service</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <Input
                              placeholder="Service name"
                              value={newServiceName}
                              onChange={(e) => setNewServiceName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") addService();
                              }}
                            />
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={() => setIsAddServiceModalOpen(false)}>
                                Cancel
                              </Button>
                              <Button onClick={addService} disabled={!newServiceName.trim()}>
                                Add Service
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      {services.map((service) => {
                        const isEditing = editingService === service;
                        const isEnabled = selectedRoleId ? roleServiceAccess[selectedRoleId]?.[service] ?? false : false;
                        return (
                          <div
                            key={service}
                            className={`group mb-2 flex items-center justify-between rounded-md border p-2 transition-colors ${
                              isEnabled ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-white"
                            }`}
                          >
                            {isEditing ? (
                              <Input
                                value={editingServiceValue}
                                onChange={(e) => setEditingServiceValue(e.target.value)}
                                onBlur={() => updateService(service, editingServiceValue)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") updateService(service, editingServiceValue);
                                  if (e.key === "Escape") {
                                    setEditingService(null);
                                    setEditingServiceValue("");
                                  }
                                }}
                                className="flex-1 mr-2"
                                autoFocus
                              />
                            ) : (
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800">{service}</p>
                                <p className="truncate text-xs text-slate-500">
                                  {serviceDescriptions[service] ?? "Access control for this service."}
                                </p>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              {!isEditing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingService(service);
                                    setEditingServiceValue(service);
                                  }}
                                  className="rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-100 group-hover:opacity-100"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => deleteService(service)}
                                className="rounded p-1 text-red-600 opacity-0 transition-opacity hover:bg-red-100 group-hover:opacity-100"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              <SettingsSwitch
                                checked={isEnabled}
                                onToggle={() => selectedRoleId && toggleServiceAccess(selectedRoleId, service)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </main>
                </div>
              </div>
            </div>
          ) : activeSection === "lead-scoring" ? (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900">Lead Scoring</h1>
                <p className="text-sm text-slate-500">Adjust scoring weights used to prioritize leads.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Scoring Criteria</h3>
                    <p className="text-sm text-slate-500">Configure the criteria used for lead scoring.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addCriterion}
                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add Criterion
                  </button>
                </div>

                <div className="space-y-4">
                  {criteria.map((criterion) => (
                    <div key={criterion.id} className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex-1">
                        {editingCriterionId === criterion.id ? (
                          <Input
                            value={editingCriterionName}
                            onChange={(e) => setEditingCriterionName(e.target.value)}
                            onBlur={() => {
                              const trimmed = editingCriterionName.trim();
                              if (trimmed) {
                                updateCriterionName(criterion.id, trimmed);
                              }
                              setEditingCriterionId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const trimmed = editingCriterionName.trim();
                                if (trimmed) {
                                  updateCriterionName(criterion.id, trimmed);
                                }
                                setEditingCriterionId(null);
                              }
                              if (e.key === "Escape") {
                                setEditingCriterionId(null);
                              }
                            }}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            autoFocus
                          />
                        ) : (
                          <span className="text-sm font-medium text-slate-900">{criterion.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 w-48">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={criterion.weight}
                          onChange={(e) => updateCriterionWeight(criterion.id, Number(e.target.value))}
                          className="h-2 flex-1 cursor-pointer accent-indigo-600"
                        />
                        <div className="flex w-16 items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={criterion.weight}
                            onChange={(e) => updateCriterionWeight(criterion.id, Number(e.target.value))}
                            className="w-12 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-slate-500">%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCriterionId(criterion.id);
                            setEditingCriterionName(criterion.name);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                          aria-label="Modifier le critere"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCriterion(criterion.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                          aria-label="Supprimer le critere"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={`mt-6 flex items-center justify-between rounded-lg px-4 py-3 ${
                  totalWeight === 100 ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"
                }`}>
                  <span className="text-sm font-medium text-slate-700">Total Weight</span>
                  <span className={`text-sm font-bold ${
                    totalWeight === 100 ? "text-green-700" : "text-orange-700"
                  }`}>
                    {totalWeight}%
                  </span>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={resetCriteria}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={saveLeadScoring}
                    className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Save Weights
                  </button>
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
