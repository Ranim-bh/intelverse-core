import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import Landing from "./pages/Landing";
import LeadForm from "./pages/LeadForm";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import Partners from "./pages/Partners";
import AntiChurn from "./pages/AntiChurn";
import GuestDetail from "./pages/GuestDetail";
import NotFound from "./pages/NotFound";
import AIOffers from "./pages/AIOffers";
import Settings from "./pages/Settings";
import Requests from "./pages/Requests";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/landing" element={<Landing />} />
          <Route path="/form" element={<LeadForm />} />

          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
          <Route path="/guests" element={<Layout><Users /></Layout>} />
          <Route path="/guests/:id" element={<Layout><GuestDetail /></Layout>} />
          <Route path="/partners" element={<Layout><Partners /></Layout>} />
          <Route path="/anti-churn" element={<Layout><AntiChurn /></Layout>} />
          <Route path="/ai-offers" element={<Layout><AIOffers /></Layout>} />
          <Route path="/requests" element={<Layout><Requests /></Layout>} />
          <Route path="/settings" element={<Layout><Settings /></Layout>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
