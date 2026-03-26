import { useMemo, useState } from "react";
import { Bell, User, Lock, SlidersHorizontal } from "lucide-react";
import { toast } from "@/components/ui/sonner";

type SettingsSection = "profile" | "notifications" | "roles" | "lead-scoring";

type Service = "Training Center" | "Pitch Room" | "Showcase Room" | "Opportunity Room";
type Role = "Guest" | "Client" | "Partenaire";

type RoleServiceAccess = Record<Role, Record<Service, boolean>>;

type LeadScoringWeights = {
  sessionDuration: number;
  roomsVisited: number;
  voiceTime: number;
  interactions: number;
  idleTime: number;
};

const defaultRoleServiceAccess: RoleServiceAccess = {
  Guest: {
    "Showcase Room": true,
    "Training Center": false,
    "Pitch Room": false,
    "Opportunity Room": false,
  },
  Client: {
    "Showcase Room": true,
    "Training Center": true,
    "Pitch Room": false,
    "Opportunity Room": true,
  },
  Partenaire: {
    "Showcase Room": true,
    "Training Center": true,
    "Pitch Room": true,
    "Opportunity Room": true,
  },
};

const services: Service[] = ["Training Center", "Pitch Room", "Showcase Room", "Opportunity Room"];
const roles: Role[] = ["Guest", "Client", "Partenaire"];

const defaultLeadScoringWeights: LeadScoringWeights = {
  sessionDuration: 35,
  roomsVisited: 25,
  voiceTime: 20,
  interactions: 15,
  idleTime: 0,
};

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
  const [roleServiceAccess, setRoleServiceAccess] = useState<RoleServiceAccess>(defaultRoleServiceAccess);
  const [leadScoringWeights, setLeadScoringWeights] = useState<LeadScoringWeights>(defaultLeadScoringWeights);
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

  const toggleServiceAccess = (role: Role, service: Service) => {
    setRoleServiceAccess((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [service]: !prev[role][service],
      },
    }));
    toast.success("Access updated", { duration: 2000, position: "bottom-right" });
  };

  const resetAccessDefaults = () => {
    setRoleServiceAccess(defaultRoleServiceAccess);
    toast.success("Access reset to defaults", { duration: 2000, position: "bottom-right" });
  };

  const setLeadWeight = (key: keyof LeadScoringWeights, value: number) => {
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    setLeadScoringWeights((prev) => ({
      ...prev,
      [key]: safeValue,
    }));
  };

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
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Access Matrix</h3>
                  <button
                    type="button"
                    onClick={resetAccessDefaults}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Reset to Defaults
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Role</th>
                        {services.map((service) => (
                          <th key={service} className="px-4 py-3 text-center font-semibold text-slate-700">
                            {service}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {roles.map((role) => (
                        <tr key={role} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-4 font-medium text-slate-900">{role}</td>
                          {services.map((service) => (
                            <td key={`${role}-${service}`} className="px-4 py-4 text-center">
                              <SettingsSwitch
                                checked={roleServiceAccess[role][service]}
                                onToggle={() => toggleServiceAccess(role, service)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Critere</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Poids</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: "sessionDuration" as const, label: "Duree session" },
                        { key: "roomsVisited" as const, label: "Rooms visitees" },
                        { key: "voiceTime" as const, label: "Temps vocal" },
                        { key: "interactions" as const, label: "Interactions" },
                        { key: "idleTime" as const, label: "Idle time" },
                      ].map((item) => (
                        <tr key={item.key} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-4 py-4 font-medium text-slate-900">{item.label}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={leadScoringWeights[item.key]}
                                onChange={(event) => setLeadWeight(item.key, Number(event.target.value))}
                                className="h-2 w-full cursor-pointer accent-indigo-600"
                              />
                              <div className="flex w-20 items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={leadScoringWeights[item.key]}
                                  onChange={(event) => setLeadWeight(item.key, Number(event.target.value))}
                                  className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <span className="text-slate-500">%</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <span className="text-sm text-slate-600">Total des poids</span>
                  <span className="text-sm font-bold text-slate-900">
                    {leadScoringWeights.sessionDuration +
                      leadScoringWeights.roomsVisited +
                      leadScoringWeights.voiceTime +
                      leadScoringWeights.interactions +
                      leadScoringWeights.idleTime}
                    %
                  </span>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setLeadScoringWeights(defaultLeadScoringWeights)}
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
