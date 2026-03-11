import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from '../components/auth/RequireAuth'

// ─── Lazy page imports ────────────────────────────────────────────────────────
// Each lazy() call becomes a separate chunk. The browser fetches only the
// chunk for the route the user actually visits.

const DashboardPage          = lazy(() => import('../pages/DashboardPage'))
const PatientsPage           = lazy(() => import('../pages/PatientsPage'))
const PatientDetailPage      = lazy(() => import('../pages/PatientDetailPage'))
const AppointmentsPage       = lazy(() => import('../pages/AppointmentsPage'))
const EquipePage             = lazy(() => import('../pages/EquipePage'))
const SettingsPage           = lazy(() => import('../pages/SettingsPage'))
const FinanceiroPage         = lazy(() => import('../pages/FinanceiroPage'))
const WhatsAppInboxPage      = lazy(() => import('../pages/WhatsAppInboxPage'))
const MinhaDisponibilidadePage = lazy(() => import('../pages/MinhaDisponibilidadePage'))
const PatientAnamnesisPage    = lazy(() => import('../pages/PatientAnamnesisPage'))
const MinhaContaPage         = lazy(() => import('../pages/MinhaContaPage'))
const AccessDeniedPage       = lazy(() => import('../pages/AccessDeniedPage'))
const AssinaturaPage         = lazy(() => import('../pages/AssinaturaPage'))

// ─── Staff routes (rendered inside <AppLayout>) ───────────────────────────────
// Suspense boundary lives in App.tsx so the sidebar stays visible during
// per-page navigation transitions.
export default function StaffRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/hoje" replace />} />
      {/* /hoje is the primary landing page (daily overview) */}
      <Route path="/hoje" element={<DashboardPage />} />
      {/* keep old /dashboard URL working */}
      <Route path="/dashboard" element={<Navigate to="/hoje" replace />} />

      {/* Pacientes */}
      <Route path="/pacientes" element={
        <RequireAuth permission="canViewPatients"><PatientsPage /></RequireAuth>
      } />
      <Route path="/pacientes/novo" element={
        <RequireAuth permission="canManagePatients"><PatientsPage /></RequireAuth>
      } />
      <Route path="/pacientes/:id" element={
        <RequireAuth permission="canViewPatients"><PatientDetailPage /></RequireAuth>
      } />
      <Route path="/pacientes/:id/editar" element={
        <RequireAuth permission="canManagePatients"><PatientDetailPage /></RequireAuth>
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
      <Route path="/relatorios" element={<Navigate to="/financeiro" replace />} />

      {/* Equipe (Profissionais + Usuários) */}
      <Route path="/equipe" element={
        <RequireAuth permission="canManageProfessionals"><EquipePage /></RequireAuth>
      } />
      {/* keep old URL working */}
      <Route path="/profissionais" element={<Navigate to="/equipe" replace />} />

      {/* Config / WhatsApp / Assinatura */}
      <Route path="/configuracoes" element={
        <RequireAuth permission="canManageSettings"><SettingsPage /></RequireAuth>
      } />
      <Route path="/whatsapp" element={
        <RequireAuth permission="canViewWhatsApp"><WhatsAppInboxPage /></RequireAuth>
      } />
      <Route path="/assinatura" element={<AssinaturaPage />} />

      <Route path="/acesso-negado" element={<AccessDeniedPage />} />
      <Route path="/minha-conta"   element={<MinhaContaPage />} />
      <Route path="*" element={<Navigate to="/hoje" replace />} />
    </Routes>
  )
}
