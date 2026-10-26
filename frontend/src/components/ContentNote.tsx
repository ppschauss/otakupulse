/**
 * Erklärkasten für Bereiche, die thematisch nah an Adult-Inhalten liegen, es aber
 * nicht sind (Ecchi, Nudity). Macht für Leser:innen UND für Prüfer transparent,
 * was hier gelistet wird — und was bewusst nicht.
 */
export function ContentNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-zinc-900/40 p-5">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  )
}
