import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import Dashboard from "./pages/Dashboard";
import Guests from "./pages/Guests";
import Partners from "./pages/Partners";
import AntiChurn from "./pages/AntiChurn";
import Analytics from "./pages/Analytics";
import GuestDetail from "./pages/GuestDetail";
import NotFound from "./pages/NotFound";
import AIOffers from "./pages/AIOffers";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/guests" element={<Guests />} />
            <Route path="/guests/:id" element={<GuestDetail />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/anti-churn" element={<AntiChurn />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/ai-offers" element={<AIOffers />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
