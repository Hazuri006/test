import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mentions légales' };

export default function TermsPage() {
  return (
    <main className="ambient-bg min-h-dvh px-4 py-16">
      <article className="glass mx-auto max-w-2xl space-y-4 rounded-3xl p-8 text-sm leading-relaxed text-slate-300">
        <h1 className="text-2xl font-bold text-white">Mentions légales</h1>
        <p>
          Ce panel communautaire est édité par l&apos;équipe du serveur (« Yurei Project », nom
          provisoire). Il s&apos;agit d&apos;un projet communautaire sans but lucratif, indépendant
          de Discord Inc.
        </p>
        <h2 className="text-lg font-semibold text-white">Hébergement</h2>
        <p>Les informations d&apos;hébergement sont à compléter par l&apos;exploitant du panel.</p>
        <h2 className="text-lg font-semibold text-white">Comptes et modération</h2>
        <p>
          L&apos;accès au panel nécessite un compte Discord. L&apos;équipe de modération peut
          suspendre ou bannir un compte en cas de non-respect des règles de la communauté. Les
          décisions de modération sont journalisées.
        </p>
        <h2 className="text-lg font-semibold text-white">Contact</h2>
        <p>Pour toute question, ouvrez un ticket depuis le panel.</p>
        <p>
          <Link href="/login" className="text-spirit-400 hover:underline">
            ← Retour à la connexion
          </Link>
        </p>
      </article>
    </main>
  );
}
