import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Download as DownloadIcon } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DownloadSettings = {
  rules: Array<{ position: number; rule: string }>;
};

export default function Download() {
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState<DownloadSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [isTermsOpen, setTermsOpen] = useState(false);
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = String(searchParams.get("token") ?? "").trim();
    if (!token) {
      setError("Missing download token.");
      setLoading(false);
      setTokenValid(false);
      return;
    }

    const validate = async () => {
      try {
        setLoading(true);
        setDownloadToken(token);

        const response = await fetch(`http://localhost:5000/api/validate-download?token=${encodeURIComponent(token)}`);
        const data = await response.json();

        if (!response.ok || !data.valid) {
          throw new Error(data.error || "Invalid download token.");
        }

        setTokenValid(true);

        const instructionResponse = await fetch("http://localhost:5000/api/instruction");
        if (!instructionResponse.ok) {
          throw new Error("Unable to load rules.");
        }

        const instructionData = await instructionResponse.json();
        setSettings(instructionData);
      } catch (err) {
        const message = err instanceof Error ? err.message : "An error occurred.";
        setError(message);
        setTokenValid(false);
        toast.error(message, { duration: 3000, position: "bottom-right" });
      } finally {
        setLoading(false);
      }
    };

    void validate();
  }, [searchParams]);

  const handleStartDownload = async () => {
    if (!downloadToken) {
      toast.error("Missing download token.", { duration: 2000, position: "bottom-right" });
      return;
    }
    if (!rulesAccepted) {
      toast.error("Please accept the rules first.", { duration: 2000, position: "bottom-right" });
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch("http://localhost:5000/api/accept-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: downloadToken }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to accept rules.");
      }

      if (!data.downloadLink) {
        throw new Error("Download link not available.");
      }

      window.location.href = data.downloadLink;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to start download.";
      toast.error(message, { duration: 3000, position: "bottom-right" });
    } finally {
      setSubmitting(false);
    }
  };

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

  if (error || tokenValid === false) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-8 max-w-md w-full text-center">
          <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Download link invalid</h1>
          <p className="text-gray-600">{error || "This download token is not valid."}</p>
        </div>
      </div>
    );
  }

  const rulesArray = Array.isArray(settings?.rules) ? settings.rules : [];

  return (
    <div className="min-h-screen bg-white p-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div className="bg-red-600 px-8 py-12 text-center">
            <h1 className="text-3xl font-bold text-white">Download TalentVerse</h1>
          </div>

          <div className="p-8">
            <div className="mb-8">
              <h2 className="text-lg font-bold text-gray-900 mb-3">Terms & Conditions</h2>
              <p className="text-gray-600 text-sm">
                Please review the 
                <button
                  type="button"
                  onClick={() => setTermsOpen(true)}
                  className="font-semibold text-red-600 hover:underline focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                >
                  Terms & Conditions
                </button>
                .
              </p>
            </div>

            <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rulesAccepted}
                  onChange={(e) => setRulesAccepted(e.target.checked)}
                  className="w-5 h-5 text-red-600 bg-white border-gray-300 rounded cursor-pointer accent-red-600 mt-0.5"
                />
                <span className="text-gray-900 font-medium text-sm">
                  I accept the{' '}
                  <button
                    type="button"
                    onClick={() => setTermsOpen(true)}
                    className="text-red-600 hover:underline focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                  >
                    Terms & Conditions
                  </button>
                </span>
              </label>
            </div>

            <button
              onClick={handleStartDownload}
              disabled={!rulesAccepted || submitting}
              className={`w-full py-3 px-6 rounded-lg font-bold transition-colors duration-200 flex items-center justify-center gap-2 ${
                rulesAccepted && !submitting
                  ? "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                  : "bg-gray-300 text-gray-600 cursor-not-allowed"
              }`}
            >
              <DownloadIcon className="w-5 h-5" />
              {submitting ? "Starting download..." : "Start Download"}
            </button>
          </div>

          <Dialog open={isTermsOpen} onOpenChange={setTermsOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Terms & Conditions</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-gray-600">
                  Please read the rules before proceeding with the download.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 overflow-y-auto max-h-72 rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700">
                {rulesArray.length > 0 ? (
                  <ol className="list-decimal list-inside space-y-2">
                    {rulesArray.map((rule) => (
                      <li key={rule.position}>{rule.rule}</li>
                    ))}
                  </ol>
                ) : (
                  <p>No rules defined.</p>
                )}
              </div>

              <DialogFooter className="mt-4">
                <DialogClose asChild>
                  <button className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 sm:w-auto sm:px-5">
                    Close
                  </button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
