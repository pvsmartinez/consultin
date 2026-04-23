import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from '../components/auth/RequireAuth'
import RequireModule from '../components/auth/RequireModule'
import { APP_ROUTES } from '../lib/appRoutes'

// ─── v2 pages ────────────────────────────────────────────────────────────────
const AgendaPage          = lazy(() => import('../pages/AgendaPage'))
const PacientesPage       = lazy(() => import('../pages/PacientesPage'))
const SalasPage           = lazy(() => import('../pages/SalasPage'))
const ConfiguracoesPage   = lazy(() => import('../pages/ConfiguracoesPage'))

// ─── v2 pages (migrated from v1) ─────────────────────────────────────────────
const PatientDetailPage        = lazy(() => import('../pages/PatientDetailPage'))
const EquipePage               = lazy(() => import('../pages/EquipePage'))
const FinanceiroPage           = lazy(() => import('../pages/FinanceiroPage'))
const RelatoriosPage           = lazy(() => import('../pages/RelatoriosPage'))
const WhatsAppInboxPage        = lazy(() => import('../pages/WhatsAppInboxPage'))
const MinhaDisponibilidadePage = lazy(() => import('../pages/MinhaDisponibilidadePage'))
const MinhaContaPage           = lazy(() => import('../pages/MinhaContaPage'))

// ─── v1 pages still in use ───────────────────────────────────────────────────
const PatientAnamnesisPage    = lazy(() => import('../pages-v1/PatientAnamnesisPage'))
const AccessDeniedPage        = lazy(() => import('../pages-v1/AccessDeniedPage'))
const AssinaturaPage          = lazy(() => import('../pages-v1/AssinaturaPage'))

// ─── Staff routes (rendered inside <AppLayout>) ───────────────────────────────
// Suspense boundary lives in App.tsx so the sidebar stays visible during
// per-page navigation transitions.
// Suspense boundary lives in App.tsx so the sidebar stays visible during
// per-page navigation transitions.
export default function StaffRoutes() {
  return (
    <Routes>
      {/* v2: Agenda is the home */}
      <Route path="/" element={<Navigate to={APP_ROUTES.staff.home} replace />} />
      <Route path={APP_ROUTES.onboarding.wizard} element={<Navigate to={`${APP_ROUTES.staff.settings}?setup=1`} replace />} />
      <Route path={APP_ROUTES.staff.legacyToday} element={<Navigate to={APP_ROUTES.staff.home} replace />} />
      <Route path={APP_ROUTES.staff.legacyDashboard} element={<Navigate to={APP_ROUTES.staff.home} replace />} />

      {/* Agenda */}
      <Route path={APP_ROUTES.staff.home} element={<AgendaPage />} />
      <Route path={APP_ROUTES.staff.myAgenda} element={<AgendaPage myOnly />} />
      <Route path={APP_ROUTES.staff.myAvailability} element={<MinhaDisponibilidadePage />} />

      {/* Pacientes */}
      <Route path={APP_ROUTES.staff.patients} element={
        <RequireAuth permission="canViewPatients"><PacientesPage /></RequireAuth>
      } />
      <Route path={APP_ROUTES.staff.patientsNew} element={
        <RequireAuth permission="canManagePatients"><PacientesPage /></RequireAuth>
      } />
      <Route path={APP_ROUTES.staff.patientDetail} element={
        <RequireAuth permission="canViewPatients"><PatientDetailPage /></RequireAuth>
      } />
      <Route path={APP_ROUTES.staff.patientEdit} element={
        <RequireAuth permission="canManagePatients"><PatientDetailPage /></RequireAuth>
      } />
      <Route path={APP_ROUTES.staff.patientAnamnesis} element={
        <RequireAuth permission="canViewPatients"><PatientAnamnesisPage /></RequireAuth>
      } />

      {/* Salas (módulo rooms) */}
      <Route path={APP_ROUTES.staff.rooms} element={
        <RequireModule module="rooms"><SalasPage /></RequireModule>
      } />

      {/* Equipe (módulo staff) */}
      <Route path={APP_ROUTES.staff.team} element={
        <RequireAuth permission="canManageProfessionals"><EquipePage /></RequireAuth>
      } />
      <Route path={APP_ROUTES.staff.professionals} element={<Navigate to={APP_ROUTES.staff.team} replace />} />

      {/* WhatsApp (módulo whatsapp) */}
      <Route path={APP_ROUTES.staff.whatsapp} element={
        <RequireModule module="whatsapp">
          <RequireAuth permission="canViewWhatsApp"><WhatsAppInboxPage /></RequireAuth>
        </RequireModule>
      } />

      {/* Financeiro (módulo financial) */}
      <Route path={APP_ROUTES.staff.financial} element={
        <RequireModule module="financial">
          <RequireAuth permission="canViewFinancial"><FinanceiroPage /></RequireAuth>
        </RequireModule>
      } />
      <Route path={APP_ROUTES.staff.reports} element={
        <RequireModule module="financial">
          <RequireAuth permission="canViewFinancial"><RelatoriosPage /></RequireAuth>
        </RequireModule>
      } />

      {/* Configurações */}
      <Route path={APP_ROUTES.staff.settings} element={
        <RequireAuth permission="canManageSettings"><ConfiguracoesPage /></RequireAuth>
      } />

      {/* Account */}
      <Route path={APP_ROUTES.staff.subscription} element={<AssinaturaPage />} />
      <Route path={APP_ROUTES.staff.account} element={<MinhaContaPage />} />
      <Route path={APP_ROUTES.staff.accessDenied} element={<AccessDeniedPage />} />
      <Route path="*" element={<Navigate to={APP_ROUTES.staff.home} replace />} />
    </Routes>
  )
}
