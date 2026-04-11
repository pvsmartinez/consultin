import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from '../components/auth/RequireAuth'
import RequireModule from '../components/auth/RequireModule'

// ─── v2 pages ────────────────────────────────────────────────────────────────
const AgendaPage          = lazy(() => import('../pages/AgendaPage'))
const PacientesPage       = lazy(() => import('../pages/PacientesPage'))
const SalasPage           = lazy(() => import('../pages/SalasPage'))
const ConfiguracoesPage   = lazy(() => import('../pages/ConfiguracoesPage'))

// ─── v2 pages (migrated from v1) ─────────────────────────────────────────────
const PatientDetailPage        = lazy(() => import('../pages/PatientDetailPage'))
const EquipePage               = lazy(() => import('../pages/EquipePage'))
const FinanceiroPage           = lazy(() => import('../pages/FinanceiroPage'))
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
      <Route path="/" element={<Navigate to="/agenda" replace />} />
      <Route path="/hoje" element={<Navigate to="/agenda" replace />} />
      <Route path="/dashboard" element={<Navigate to="/agenda" replace />} />

      {/* Agenda */}
      <Route path="/agenda" element={<AgendaPage />} />
      <Route path="/minha-agenda" element={<AgendaPage myOnly />} />
      <Route path="/minha-disponibilidade" element={<MinhaDisponibilidadePage />} />

      {/* Pacientes */}
      <Route path="/pacientes" element={
        <RequireAuth permission="canViewPatients"><PacientesPage /></RequireAuth>
      } />
      <Route path="/pacientes/novo" element={
        <RequireAuth permission="canManagePatients"><PacientesPage /></RequireAuth>
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

      {/* Salas (módulo rooms) */}
      <Route path="/salas" element={
        <RequireModule module="rooms"><SalasPage /></RequireModule>
      } />

      {/* Equipe (módulo staff) */}
      <Route path="/equipe" element={
        <RequireAuth permission="canManageProfessionals"><EquipePage /></RequireAuth>
      } />
      <Route path="/profissionais" element={<Navigate to="/equipe" replace />} />

      {/* WhatsApp (módulo whatsapp) */}
      <Route path="/whatsapp" element={
        <RequireModule module="whatsapp">
          <RequireAuth permission="canViewWhatsApp"><WhatsAppInboxPage /></RequireAuth>
        </RequireModule>
      } />

      {/* Financeiro (módulo financial) */}
      <Route path="/financeiro" element={
        <RequireModule module="financial">
          <RequireAuth permission="canViewFinancial"><FinanceiroPage /></RequireAuth>
        </RequireModule>
      } />
      <Route path="/relatorios" element={<Navigate to="/financeiro" replace />} />

      {/* Configurações */}
      <Route path="/configuracoes" element={
        <RequireAuth permission="canManageSettings"><ConfiguracoesPage /></RequireAuth>
      } />

      {/* Account */}
      <Route path="/assinatura" element={<AssinaturaPage />} />
      <Route path="/minha-conta" element={<MinhaContaPage />} />
      <Route path="/acesso-negado" element={<AccessDeniedPage />} />
      <Route path="*" element={<Navigate to="/agenda" replace />} />
    </Routes>
  )
}
