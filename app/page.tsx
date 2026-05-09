import Link from "next/link";
import { copy } from "@/lib/i18n";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg text-text">
      <section className="mx-auto flex min-h-[82vh] w-full max-w-6xl flex-col justify-center px-6 py-20">
        <p className="mb-4 text-sm uppercase tracking-[0.3em] text-accent-3">Recherche Opérationnelle</p>
        <h1 className="font-serif text-6xl font-semibold leading-none text-text md:text-8xl">
          {copy.appName}
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-text-2">{copy.tagline}</p>
        <Link
          href="/solver"
          className="mt-10 inline-flex w-fit items-center rounded-md border border-accent bg-accent px-5 py-3 text-sm font-medium text-bg transition hover:bg-transparent hover:text-accent"
        >
          {copy.launchSolver}
        </Link>
      </section>
      <section className="border-t border-border bg-surface/80">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-10 md:grid-cols-3">
          {copy.features.map((feature) => (
            <article key={feature.title} className="glass-panel rounded-lg border border-border-2 p-6">
              <h2 className="font-serif text-2xl text-text">{feature.title}</h2>
              <p className="mt-4 text-sm leading-6 text-text-2">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
