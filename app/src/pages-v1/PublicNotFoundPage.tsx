import { Link } from 'react-router-dom'
import { Seo } from '../components/seo/Seo'

export default function PublicNotFoundPage() {
  return (
    <>
      <Seo
        title="Página não encontrada | Consultin"
        description="A página que você tentou acessar não existe no site público do Consultin."
        canonicalPath="/404"
        noindex
      />

      <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center px-6">
        <div className="max-w-xl text-center space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">Erro 404</p>
          <h1 className="text-4xl font-semibold text-slate-950">Página não encontrada</h1>
          <p className="text-base leading-7 text-slate-600">
            Esse endereço não existe no site público do Consultin. Se você veio de um link antigo ou com barra extra,
            use os caminhos canônicos do site.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              to="/"
              className="inline-flex items-center rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-800"
            >
              Ir para a home
            </Link>
            <Link
              to="/cadastro-clinica"
              className="inline-flex items-center rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              Criar conta grátis
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}