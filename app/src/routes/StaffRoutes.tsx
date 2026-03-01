import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from '../components/auth/RequireAuth'

// ─── Lazy page imports ────────────────────────────────────────────────────────
// Each lazy() call becomes a separate chunk. The browser fetches only the
// chunk for the route the user actually visits.

const DashboardPage          = lazy(() => import('../pages/DashboardPage'))
const PatientsPage           = lazy(() => import('../pages/PatientsPage'))
const CadastroPage           = lazy(() => import('../pages/CadastroPage'))
const PatientDetailPage      = lazy(() => import('../pages/PatientDetailPage'))
const AppointmentsPage       = lazy(() => import('../pages/AppointmentsPage'))
const ProfessionalsPage      = lazy(() => import('../pages/ProfessionalsPage'))
const SettingsPage           = lazy(() => import('../pages/SettingsPage'))
const FinanceiroPage         = lazy(() => import('../pages/FinanceiroPage'))
const RelatoriosPage         = lazy(() => import('../pages/RelatoriosPage'))
const WhatsAppInboxPage      = lazy(() => import('../pages/WhatsAppInboxPage'))
const MinhaDisponibilidadePage = lazy(() => import('../pages/MinhaDisponibilidadePage'))
const PatientAnamnesisPage    = lazy(() => import('../pages/PatientAnamnesisPage'))
const MinhaContaPage         = lazy(() => import('../pages/MinhaContaPage'))
const AccessDeniedPage       = lazy(() => import('../pages/AccessDeniedPage'))

// ─── Staff routes (rendered inside <AppLayout>) ───────────────────────────────
// Suspense boundary lives in App.tsx so the sidebar stays visible during
// per-page navigation transitions.
export default function StaffRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage />} />

      {/* Pacientes */}
      <Route path="/pacientes" element={
        <RequireAuth permission="canViewPatients"><PatientsPage /></RequireAuth>
      } />
      <Route path="/pacientes/novo" element={
        <RequireAuth permission="canManagePatients"><CadastroPage /></RequireAuth>
      } />
      <Route path="/pacientes/:id" element={
        <RequireAuth permission="canViewPatients"><PatientDetailPage /></RequireAuth>
      } />
      <Route path="/pacientes/:id/editar" element={
        <RequireAuth permission="canManagePatients"><CadastroPage /></RequireAuth>
      } />
      <Route path="/pacientes/:id/anamnese" element={
        <RequireAuth permission="canViewPatients"><PatientAnamnesisPage /></RequireAuth>
      } />

      {/* Agenda */}
      <Route path="/agenda"              element={<AppointmentsPage />} />
      <Route path="/minha-agenda"        element={<AppointmentsPage myOnly />} />
      <Route path="/minha-disponibilidade" element={<MinhaDisponibilidadePage />} />

      {/* Financeiro */}
      <Route path="/financeiro" element={
        <RequireAuth permission="canViewFinancial"><FinanceiroPage /></RequireAuth>
      } />
      <Route path="/relatorios" element={
        <RequireAuth permission="canViewFinancial"><RelatoriosPage /></RequireAuth>
      } />

      {/* Profissionais / Config / WhatsApp */}
      <Route path="/profissionais" element={
        <RequireAuth permission="canManageProfessionals"><ProfessionalsPage /></RequireAuth>
      } />
      <Route path="/configuracoes" element={
        <RequireAuth permission="canManageSettings"><SettingsPage /></RequireAuth>
      } />
      <Route path="/whatsapp" element={
        <RequireAuth permission="canViewWhatsApp"><WhatsAppInboxPage /></RequireAuth>
      } />

      <Route path="/acesso-negado" element={<AccessDeniedPage />} />
      <Route path="/minha-conta"   element={<MinhaContaPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
