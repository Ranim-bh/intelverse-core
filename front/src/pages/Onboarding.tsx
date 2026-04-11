import { useState, useEffect } from "react";
import { AlertCircle, Download } from "lucide-react";
import { toast } from "@/components/ui/sonner";

type InstructionSettings = {
  presentation: string;
  available_days: string[];
  start_time: string;
  end_time: string;
  calendar_link: string;
  download_link?: string;
  epic_account_link?: string;
  steps: Array<{ step: number; title: string; description: string }>;
  rules: Array<{ position: number; rule: string }>;
  services: string[];
  support_email: string;
  chatbot_link: string;
};

export default function Onboarding() {
  const [settings, setSettings] = useState<InstructionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rulesAccepted, setRulesAccepted] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const res = await fetch("http://localhost:5000/api/instruction");
        if (!res.ok) {
          throw new Error("Unable to load instruction settings");
        }
        const data = (await res.json()) as InstructionSettings;
        setSettings(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "An error occurred";
        setError(message);
        toast.error(message, { duration: 3000, position: "bottom-right" });
      } finally {
        setLoading(false);
      }
    };

    void fetchSettings();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-red-200 border-r-red-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8 max-w-md w-full text-center">
          <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">{error || "Unable to load settings"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Card Container */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          {/* Red Header */}
          <div className="bg-red-600 px-8 py-12 text-center">
            <h1 className="text-3xl font-bold text-white">Welcome to TalentVerse</h1>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Rules List */}
            <div className="mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-6">Rules</h2>
              {Array.isArray(settings.rules) && settings.rules.length > 0 ? (
                <ul className="space-y-3">
                  {settings.rules.map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="text-red-600 font-bold text-lg leading-none mt-0.5">•</span>
                      <span className="text-gray-700">{rule.rule}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-600">No rules defined.</p>
              )}
            </div>

            {/* Checkbox */}
            <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rulesAccepted}
                  onChange={(e) => setRulesAccepted(e.target.checked)}
                  className="w-5 h-5 text-red-600 bg-white border-gray-300 rounded cursor-pointer accent-red-600"
                />
                <span className="text-gray-900 font-medium text-sm">I accept the rules</span>
              </label>
            </div>

            {/* Download Section - Only visible when accepted */}
            {rulesAccepted && settings.download_link && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <a
                  href={settings.download_link}
                  download
                  className="block w-full text-center py-3 px-6 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download TalentVerse
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
