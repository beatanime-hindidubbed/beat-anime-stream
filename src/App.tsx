import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SupabaseAuthProvider } from "@/hooks/useSupabaseAuth";
import { SiteSettingsProvider } from "@/hooks/useSiteSettings";
import CookieConsent from "@/components/CookieConsent";
import ChatWidget from "@/components/ChatWidget";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ScrollToTop from "@/components/ScrollToTop";
import ParticleCanvas from "@/components/ParticleCanvas";
import VerifyGate from "@/components/VerifyGate";
import Index from "./pages/Index";
import SearchPage from "./pages/SearchPage";
import AnimeDetail from "./pages/AnimeDetail";
import WatchPage from "./pages/WatchPage";
import CategoryPage from "./pages/CategoryPage";
import GenrePage from "./pages/GenrePage";
import SchedulePage from "./pages/SchedulePage";
import LoginPage from "./pages/LoginPage";
import WatchlistPage from "./pages/WatchlistPage";
import HindiPage from "./pages/HindiPage";
import HindiAnimePage from "./pages/HindiAnimePage";
import HindiWatchPage from "./pages/HindiWatchPage";
import RecentPage from "./pages/RecentPage";
import ExplorePage from "./pages/ExplorePage";
import ManhwaPage from "./pages/ManhwaPage";
import PolicyPage from "./pages/PolicyPage";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import VerifyPage from "./pages/VerifyPage";
import ReferralPage from "./pages/ReferralPage";
import SandboxRedirect from "./pages/SandboxRedirect";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5 * 60 * 1000 },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SupabaseAuthProvider>
      <SiteSettingsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ParticleCanvas />
            <ScrollToTop />
            <Routes>
              {/* Public routes */}
              <Route path="/verify" element={<VerifyPage />} />
              <Route path="/go" element={<SandboxRedirect />} />
              <Route path="/admin" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />

              {/* Protected routes */}
              <Route
                path="*"
                element={
                  <VerifyGate>
                    <>
                      <Navbar />
                      <main className="min-h-screen">
                        <Routes>
                          <Route path="/" element={<Index />} />
                          <Route path="/search" element={<SearchPage />} />
                          <Route path="/anime/:id" element={<AnimeDetail />} />
                          <Route path="/watch/:episodeId" element={<WatchPage />} />
                          <Route path="/category/:name" element={<CategoryPage />} />
                          <Route path="/genre/:name" element={<GenrePage />} />
                          <Route path="/schedule" element={<SchedulePage />} />
                          <Route path="/hindi" element={<HindiPage />} />
                          <Route path="/hindi/anime/:id" element={<HindiAnimePage />} />
                          <Route
                            path="/hindi/watch/:animeId/:episodeNumber"
                            element={<HindiWatchPage />}
                          />
                          <Route path="/recent" element={<RecentPage />} />
                          <Route path="/explore" element={<ExplorePage />} />
                          <Route path="/manhwa" element={<ManhwaPage />} />
                          <Route path="/policy/:type" element={<PolicyPage />} />
                          <Route path="/login" element={<LoginPage />} />
                          <Route path="/watchlist" element={<WatchlistPage />} />
                          <Route path="/referral" element={<ReferralPage />} />
                          <Route path="*" element={<Index />} />
                        </Routes>
                      </main>
                      <Footer />
                      <CookieConsent />
                      <ChatWidget />
                    </>
                  </VerifyGate>
                }
              />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </SiteSettingsProvider>
    </SupabaseAuthProvider>
  </QueryClientProvider>
);

export default App;
