import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Politique de confidentialité' };

export default function PrivacyPage() {
  return (
    <main className="ambient-bg min-h-dvh px-4 py-16">
      <article className="glass mx-auto max-w-2xl space-y-4 rounded-3xl p-8 text-sm leading-relaxed text-slate-300">
        <h1 className="text-2xl font-bold text-white">Politique de confidentialité</h1>
        <h2 className="text-lg font-semibold text-white">Données collectées</h2>
        <p>
          Lors de la connexion via Discord, nous enregistrons uniquement : votre identifiant
          Discord, votre nom d&apos;utilisateur, votre nom d&apos;affichage, votre avatar et votre
          bannière. L&apos;adresse e-mail n&apos;est demandée que si l&apos;exploitant l&apos;a
          explicitement activée.
        </p>
        <h2 className="text-lg font-semibold text-white">Utilisation</h2>
        <p>
          Ces données servent exclusivement au fonctionnement du panel : profil, amis, messagerie
          interne, tickets et notifications. Nous ne lisons ni vos messages privés Discord, ni
          votre liste d&apos;amis Discord, ni votre statut Discord.
        </p>
        <h2 className="text-lg font-semibold text-white">Cookies</h2>
        <p>
          Un cookie de session strictement nécessaire (HTTP-only) maintient votre connexion. Un
          cookie de préférence enregistre votre langue. Aucun cookie publicitaire ou de pistage.
        </p>
        <h2 className="text-lg font-semibold text-white">Vos droits</h2>
        <p>
          Vous pouvez demander la suppression de votre compte et de vos données en ouvrant un
          ticket. Les journaux de modération peuvent être conservés à des fins de sécurité.
        </p>
        <p>
          <Link href="/login" className="text-spirit-400 hover:underline">
            ← Retour à la connexion
          </Link>
        </p>
      </article>
    </main>
  );
}
