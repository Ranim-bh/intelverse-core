import { useEffect, useState } from "react";
import { businessMetrics, churnProfiles, partners, users } from "@/lib/mock-data";
import type { BusinessMetric, ChurnProfile, Guest, Partner } from "@/lib/types";

export type AppData = {
  users: Guest[];
  guests: Guest[];
  partners: Partner[];
  businessMetrics: BusinessMetric[];
  churnProfiles: ChurnProfile[];
};

const mockAppData: AppData = {
  users,
  guests: users,
  partners,
  businessMetrics,
  churnProfiles,
};

export const fetchAppData = async (): Promise<AppData> => {
  return mockAppData;
};

export const useAppData = () => {
  const [data, setData] = useState<AppData>(mockAppData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    fetchAppData()
      .then((payload) => {
        if (!mounted) return;
        setData(payload);
      })
      .catch((err) => {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "Failed to load app data";
        setError(message);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading, error };
};
