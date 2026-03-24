import { useMemo, useState } from "react";
import { Bell, User } from "lucide-react";
import { toast } from "@/components/ui/sonner";

type SettingsSection = "profile" | "notifications";

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
  autoSendMediumRisk: boolean;
  autoSendHighRisk: boolean;
  requireAdminApprovalCritical: boolean;
  sendFollowUpJ2: boolean;
  chatbotApiKey: string;
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
    autoSendMediumRisk: true,
    autoSendHighRisk: true,
    requireAdminApprovalCritical: true,
    sendFollowUpJ2: false,
    chatbotApiKey: "",
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

  const profileNavItems: Array<{ id: SettingsSection; label: string; icon: typeof User }> = [
    { id: "profile", label: "Admin Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
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

        <section className="flex-1 bg-white p-8">
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

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-6 text-base font-bold text-slate-900">Chatbot Alerts</h3>

                <div className="space-y-4">
                  {[
                    {
                      key: "autoSendMediumRisk",
                      label: "Auto-send chatbot message on Medium risk",
                    },
                    {
                      key: "autoSendHighRisk",
                      label: "Auto-send chatbot message on High risk",
                    },
                    {
                      key: "requireAdminApprovalCritical",
                      label: "Require admin approval for Critical actions",
                    },
                    {
                      key: "sendFollowUpJ2",
                      label: "Send chatbot follow-up after J+2 no response",
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

                <div className="mt-6">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Chatbot API Key</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="password"
                      placeholder="sk-••••••••"
                      value={notifications.chatbotApiKey}
                      onChange={(event) =>
                        setNotifications((prev) => ({
                          ...prev,
                          chatbotApiKey: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="button" className="shrink-0 text-xs font-medium text-indigo-600">
                      Test Connection
                    </button>
                  </div>
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
