import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from '../components/auth/RequireAuth'

// ─── v2 pages ────────────────────────────────────────────────────────────────
const AgendaPage          = lazy(() => import('../pages/AgendaPage'))
const PacientesPage       = lazy(() => import('../pages/PacientesPage'))
const SalasPage           = lazy(() => import('../pages/SalasPage'))
const ConfiguracoesPage   = lazy(() => import('../pages/ConfiguracoesPage'))

// ─── v1 pages reused as-is ───────────────────────────────────────────────────
const PatientDetailPage       = lazy(() => import('../pages-v1/PatientDetailPage'))
const PatientAnamnesisPage    = lazy(() => import('../pages-v1/PatientAnamnesisPage'))
const EquipePage              = lazy(() => import('../pages-v1/EquipePage'))
const FinanceiroPage          = lazy(() => import('../pages-v1/FinanceiroPage'))
const WhatsAppInboxPage       = lazy(() => import('../pages-v1/WhatsAppInboxPage'))
const MinhaDisponibilidadePage = lazy(() => import('../pages-v1/MinhaDisponibilidadePage'))
const MinhaContaPage          = lazy(() => import('../pages-v1/MinhaContaPage'))
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
      <Route path="/salas" element={<SalasPage />} />

      {/* Equipe (módulo staff) */}
      <Route path="/equipe" element={
        <RequireAuth permission="canManageProfessionals"><EquipePage /></RequireAuth>
      } />
      <Route path="/profissionais" element={<Navigate to="/equipe" replace />} />

      {/* WhatsApp (módulo whatsapp) */}
      <Route path="/whatsapp" element={
        <RequireAuth permission="canViewWhatsApp"><WhatsAppInboxPage /></RequireAuth>
      } />

      {/* Financeiro (módulo financial) */}
      <Route path="/financeiro" element={
        <RequireAuth permission="canViewFinancial"><FinanceiroPage /></RequireAuth>
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
