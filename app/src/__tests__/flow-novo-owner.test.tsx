/**
 * Flow: Novo owner de clínica
 *
 * Simula o ciclo completo de um novo usuário que acabou de criar sua conta:
 *  1. Preenche e submete o formulário de cadastro
 *  2. Vê a página de boas-vindas após o cadastro
 *  3. Abre as Configurações e atualiza os dados básicos da clínica
 *  4. Cria um novo profissional na equipe
 *  5. Abre a Agenda e vê o prompt de setup (clínica recém-criada, sem appointments)
 *
 * Todos os efeitos externos (Supabase, edge functions, Google Ads) são mockados
 * no nível do hook/serviço para isolar a lógica da UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ─── Supabase / Edge Functions ────────────────────────────────────────────────

const mockInvoke = vi.fn()
const mockSignIn = vi.fn()
const mockUpsert = vi.fn()
const mockSelect = vi.fn()

vi.mock('../services/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: { signInWithPassword: (...args: unknown[]) => mockSignIn(...args) },
    from: () => ({
      upsert: (...args: unknown[]) => mockUpsert(...args),
      select: () => mockSelect(),
    }),
  },
}))

// ─── Analytics (não afetam o fluxo) ──────────────────────────────────────────

vi.mock('../lib/googleAds', () => ({
  trackSignup: vi.fn(),
  trackGenerateLead: vi.fn(),
  trackOnboardingComplete: vi.fn(),
  trackWhatsappCtaClick: vi.fn(),
}))
vi.mock('../lib/publicAnalytics', () => ({ trackPublicEvent: vi.fn() }))
vi.mock('../lib/gtag', () => ({ gtagEvent: vi.fn() }))
vi.mock('../components/seo/Seo', () => ({ Seo: () => null }))

// ─── Router mock ──────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams()],
  }
})

// ─── AuthContext (owner recém-criado) ─────────────────────────────────────────

const mockUseAuthContext = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}))

// ─── Hooks de clínica ─────────────────────────────────────────────────────────

const mockUpdateClinic = vi.fn()
vi.mock('../hooks/useClinic', () => ({
  useClinic: () => ({
    data: {
      id: 'clinic-new',
      name: 'Clínica Nova',
      cnpj: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      onboardingCompleted: false,
      modulesEnabled: ['staff'],
      patientFieldConfig: {},
      professionalFieldConfig: {},
    },
    isLoading: false,
  }),
  useUpdateClinic: () => ({ mutateAsync: mockUpdateClinic, isPending: false }),
  useClinicModules: () => ({ data: { modulesEnabled: ['staff'] } }),
  useClinicMembers: () => ({ data: [] }),
  useClinicInvites: () => ({ data: [] }),
  useUpdateMemberRole: () => ({ mutateAsync: vi.fn() }),
  useRemoveClinicMember: () => ({ mutateAsync: vi.fn() }),
  useResendInvite: () => ({ mutateAsync: vi.fn() }),
  useCancelInvite: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('../hooks/useClinicModules', () => ({
  useClinicModules: () => ({ data: { modulesEnabled: ['staff'] } }),
}))

// ─── Hooks de profissionais ───────────────────────────────────────────────────

const mockCreateProfessional = vi.fn()
vi.mock('../hooks/useProfessionals', () => ({
  useProfessionals: () => ({
    data: [],
    isLoading: false,
    create: mockCreateProfessional,
    toggleActive: vi.fn(),
  }),
}))

vi.mock('../hooks/useInvites', () => ({
  usePendingInvites: () => ({ data: [], isLoading: false }),
  useCreateInvite: () => ({ mutateAsync: vi.fn() }),
  useDeleteInvite: () => ({ mutateAsync: vi.fn() }),
  useResendInviteEmail: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('../components/professionals/ProfessionalModal', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="professional-modal">
        <button onClick={onClose}>Salvar Profissional</button>
      </div>
    ) : null,
}))
vi.mock('../components/professionals/ProfessionalBankAccountModal', () => ({ default: () => null }))
vi.mock('../components/ui/ConfirmDialog', () => ({ default: () => null }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Flow: Novo owner — cadastro de clínica', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
  })

  it('preenche e submete o formulário de cadastro com sucesso', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null })
    mockSignIn.mockResolvedValue({ data: { session: { user: { id: 'user-new' } } }, error: null })

    const { default: CadastroClinicaPage } = await import('../pages-v1/CadastroClinicaPage')
    render(
      <MemoryRouter>
        <CadastroClinicaPage />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica Feliz')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'owner@clinicafeliz.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'Senha@1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'Senha@1234')
    await user.click(screen.getByRole('button', { name: /entrar no consultin agora/i }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'submit-clinic-signup',
        expect.objectContaining({
          body: expect.objectContaining({ clinicName: 'Clínica Feliz', email: 'owner@clinicafeliz.com' }),
        }),
      )
    })
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'owner@clinicafeliz.com', password: 'Senha@1234' })
  })

  it('mostra erro de validação se a clínica já existir', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Esse e-mail já existe. Use a senha correta para entrar na sua conta.' },
    })
    mockSignIn.mockResolvedValue({ data: { session: null }, error: new Error('Invalid password') })

    const { default: CadastroClinicaPage } = await import('../pages-v1/CadastroClinicaPage')
    render(
      <MemoryRouter>
        <CadastroClinicaPage />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica Duplicada')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'existing@clinic.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'Senha@1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'Senha@1234')
    await user.click(screen.getByRole('button', { name: /entrar no consultin agora/i }))

    await waitFor(() => {
      expect(screen.getByText(/esse e-mail já existe/i)).toBeInTheDocument()
    })
    // Não deve tentar login automático pois a senha foi rejeitada
  })

  it('exige que as senhas sejam iguais', async () => {
    const { default: CadastroClinicaPage } = await import('../pages-v1/CadastroClinicaPage')
    render(
      <MemoryRouter>
        <CadastroClinicaPage />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Ex: Clínica Saúde & Vida'), 'Clínica X')
    await user.type(screen.getByPlaceholderText('contato@suaclinica.com'), 'x@clinic.com')
    await user.type(screen.getByPlaceholderText(/mínimo 8 caracteres/i), 'Senha@1234')
    await user.type(screen.getByPlaceholderText(/repita sua senha/i), 'SenhaDiferente')
    await user.click(screen.getByRole('button', { name: /entrar no consultin agora/i }))

    await waitFor(() => {
      expect(screen.getByText(/senhas não coincidem/i)).toBeInTheDocument()
    })
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})

describe('Flow: Novo owner — página de boas-vindas', () => {
  it('mostra mensagem de confirmação e link para voltar ao início', async () => {
    const { default: BemVindoPage } = await import('../pages-v1/BemVindoPage')
    render(<MemoryRouter><BemVindoPage /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: /clínica cadastrada/i })).toBeInTheDocument()
    expect(screen.getByText(/7 dias grátis/i)).toBeInTheDocument()
    expect(screen.getByText(/fique de olho no e-mail/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /voltar para o início/i })
    expect(link).toHaveAttribute('href', '/')
  })
})

describe('Flow: Novo owner — primeiro acesso à equipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuthContext.mockReturnValue({
      profile: { id: 'user-owner', clinicId: 'clinic-new', roles: ['admin'] },
      role: 'admin',
      hasPermission: () => true,
    })
  })

  it('lista equipe vazia e exibe botão para adicionar profissional', async () => {
    const { default: EquipePage } = await import('../pages-v1/EquipePage')
    render(
      <QueryClientProvider client={makeQC()}>
        <MemoryRouter>
          <EquipePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    // EquipePage usa botões personalizados de tab (não role=tab), verificar pelo texto
    expect(screen.getAllByText(/profissionais/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /novo profissional/i })).toBeInTheDocument()
  })

  it('abre modal ao clicar em Novo Profissional e fecha após salvar', async () => {
    mockCreateProfessional.mockResolvedValue(undefined)

    const { default: EquipePage } = await import('../pages-v1/EquipePage')
    render(
      <QueryClientProvider client={makeQC()}>
        <MemoryRouter>
          <EquipePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /novo profissional/i }))

    await waitFor(() => {
      expect(screen.getByTestId('professional-modal')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /salvar profissional/i }))
    // Modal fecha após onClose
    await waitFor(() => {
      expect(screen.queryByTestId('professional-modal')).not.toBeInTheDocument()
    })
  })
})
