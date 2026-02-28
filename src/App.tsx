import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SupabaseAuthProvider } from "@/hooks/useSupabaseAuth";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Index from "./pages/Index";
import SearchPage from "./pages/SearchPage";
import AnimeDetail from "./pages/AnimeDetail";
import WatchPage from "./pages/WatchPage";
import CategoryPage from "./pages/CategoryPage";
import GenrePage from "./pages/GenrePage";
import SchedulePage from "./pages/SchedulePage";
import LoginPage from "./pages/LoginPage";
import WatchlistPage from "./pages/WatchlistPage";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SupabaseAuthProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Admin routes - no navbar/footer */}
              <Route path="/admin" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />

              {/* Main site routes */}
              <Route path="*" element={
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
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/watchlist" element={<WatchlistPage />} />
                      <Route path="*" element={<Index />} />
                    </Routes>
                  </main>
                  <Footer />
                </>
              } />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </SupabaseAuthProvider>
  </QueryClientProvider>
);

export default App;
