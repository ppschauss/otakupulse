// Reines Präsentations-Overlay (client-safe, keine Server-Imports): legt einen
// Blur + ein FSK-18-Siegel über das darunterliegende Bild. Wird über
// <AdultGuard> (Server) oder direkt (z.B. im HeroSlider, Client) eingebunden.
// Muss in einem `relative` Container mit `overflow-hidden` liegen.

export function Fsk18Overlay({
  size = 'md',
  rounded = 'rounded-xl',
}: {
  size?: 'sm' | 'md'
  rounded?: string
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30 backdrop-blur-xl ${rounded}`}
    >
      {size === 'sm' ? (
        <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-red-600 text-[11px] font-black leading-none text-white shadow">
          18
        </span>
      ) : (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border-2 border-white/90 bg-black/40 px-3 py-2.5 shadow-lg">
          <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-white bg-red-600 text-base font-black leading-none text-white">
            18
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">FSK 18</span>
        </div>
      )}
    </div>
  )
}
