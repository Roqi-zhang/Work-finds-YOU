import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "./pages/Home.tsx";
import Workbench from "./pages/Workbench.tsx";
import Match from "./pages/Match.tsx";
import Compare from "./pages/Compare.tsx";
import Delivery from "./pages/Delivery.tsx";
import Snapshot from "./pages/Snapshot.tsx";

import Auth from "./pages/Auth.tsx";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "@/hooks/useAuth";

const queryClient = new QueryClient();

/** Legacy /profile and /jobprofile now live inside the workbench. */
const ToWorkbench = () => {
  const { search } = useLocation();
  return <Navigate to={"/workbench" + search} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Home />} />
            <Route path="/workbench" element={<Workbench />} />
            <Route path="/profile" element={<ToWorkbench />} />
            <Route path="/jobprofile" element={<ToWorkbench />} />
            <Route path="/match" element={<Match />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/delivery" element={<Delivery />} />
            <Route path="/snapshot" element={<Snapshot />} />

            <Route path="/auth" element={<Auth />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

