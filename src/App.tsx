import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

// Redirect root based on user role
const RoleBasedRedirect = () => {
  const { role } = useAuth();
  if (role === 'sales') return <Navigate to="/pipeline" replace />;
  return <Navigate to="/dashboard" replace />;
};

// Pages
import Auth from "./pages/Employe/Auth";
import Dashboard from "./pages/Dashboard";
import Inquiries from "./pages/Inquirie/Inquiries";
import NewInquiry from "./pages/Inquirie/NewInquiry";
import Employees from "./pages/Employe/Employees";
import Catalogs from "./pages/Catalogs/Catalogs";
import Selections from "./pages/Selection/Selection";
import NewSelection from "./pages/Selection/NewSelection";
import SelectionDetails from "./pages/Selection/SelectionDetails";

// Quotation Pages [NEW]
import QuotationList from "./pages/Quotation/QuotationList";
import QuotationPreview from "./pages/Quotation/QuotationPreview";

import NotFound from "./pages/NotFound";

// Measurement Pages
import MeasurementEditor from "./pages/Measurements/MeasurementEditor";
import MeasurementsList from "./pages/Measurements/MeasurementsList";
import IndependentMeasurementForm from "./pages/Measurements/newMeasurement";

// Calculation Pages
import CalculationList from "./pages/Caculation/CalculationList";
import CalculationEditor from "./pages/Caculation/CalculationEditor";
import DeepCalculation from "./pages/Caculation/DeepCalculation";
import LocalCalculation from "./pages/Caculation/LocalCalculation";
import ForestCalculation from "./pages/Caculation/ForestCalculation";
import SomfyCalculation from "./pages/Caculation/SomfyCalculation";
import RomanCalculation from "./pages/Caculation/RomanCalculation";
import BlindsCalculation from "./pages/Caculation/BlindsCalculation";
import QuotationEdit from "./pages/Quotation/QuotationEdit";
import ActivityLogs from './pages/activityLogs/ActivityLogs.tsx'; // Add import
import GpwCalculation from "./pages/Caculation/GpwCalculation";

// Architecture 
import Architecture from "./pages/Architects/Architects";

import Pipeline from "./pages/piplines/Pipeline";

import Attendance from "./pages/Attendance/Attendance";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ProtectedRoute><RoleBasedRedirect /></ProtectedRoute>} />
            <Route path="/auth" element={<Auth />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            {/* Inquiries */}
            <Route
              path="/inquiries"
              element={
                <ProtectedRoute>
                  <Inquiries />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inquiries/new"
              element={
                <ProtectedRoute>
                  <NewInquiry />
                </ProtectedRoute>
              }
            />

            {/* Selections */}
            <Route
              path="/selections"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <Selections />
                </ProtectedRoute>
              }
            />
            <Route
              path="/selections/new"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <NewSelection />
                </ProtectedRoute>
              }
            />
            <Route
              path="/selections/:id"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <SelectionDetails />
                </ProtectedRoute>
              }
            />

            {/* Measurements */}
            <Route
              path="/measurements"
              element={
                <ProtectedRoute>
                  <MeasurementsList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/measurements/new/:inquiryId"
              element={
                <ProtectedRoute>
                  <IndependentMeasurementForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/measurements/:inquiryId"
              element={
                <ProtectedRoute>
                  <MeasurementEditor />
                </ProtectedRoute>
              }
            />

            {/* Calculations - Main Routes */}
            <Route
              path="/calculations"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <CalculationList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calculations/edit/:selectionId"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <CalculationEditor />
                </ProtectedRoute>
              }
            />

            {/* Calculations - Deep Calculation (Legacy/General) */}
            <Route
              path="/calculations/deep/:selectionId"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <DeepCalculation />
                </ProtectedRoute>
              }
            />

            {/* Calculations - Specific Type Routes */}
            <Route
              path="/calculations/local/:selectionId"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <LocalCalculation />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calculations/forest/:selectionId"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <ForestCalculation />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calculations/somfy/:selectionId"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <SomfyCalculation />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calculations/roman/:selectionId"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <RomanCalculation />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calculations/blinds/:selectionId"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <BlindsCalculation />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calculations/gpw/:selectionId"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <GpwCalculation />
                </ProtectedRoute>
              }
            />

            {/* Employees */}
            <Route
              path="/employees"
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'admin_hr']}>
                  <Employees />
                </ProtectedRoute>
              }
            />

            {/* Attendance */}
            <Route
              path="/attendance"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <Attendance />
                </ProtectedRoute>
              }
            />
            {/* Catalogs */}
            <Route
              path="/catalogs"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <Catalogs />
                </ProtectedRoute>
              }
            />

            <Route
              path="/logs"
              element={
                <ProtectedRoute allowedRoles={['super_admin']}>
                  <ActivityLogs />
                </ProtectedRoute>
              }
            />

            {/* Architecture */}
            <Route
              path="/architects"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <Architecture />
                </ProtectedRoute>
              }
            />

            {/* Pipeline */}
            <Route
              path="/pipeline"
              element={
                <ProtectedRoute>
                  <Pipeline />
                </ProtectedRoute>
              }
            />

            {/* Quotation Routes - UPDATED */}
            <Route
              path="/quotations"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <QuotationList />
                </ProtectedRoute>
              }
            />


            <Route path="/quotations/preview/:id" element={<ProtectedRoute deniedRoles={['sales']}><QuotationPreview /></ProtectedRoute>} />

            <Route
              path="/quotations/edit/:id"
              element={
                <ProtectedRoute deniedRoles={['sales']}>
                  <QuotationEdit />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;