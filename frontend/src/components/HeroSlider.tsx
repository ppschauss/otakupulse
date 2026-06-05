'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export type HeroSlide = { imageUrl?: string | null; title: string; href: string }

export function HeroSlider({
  slides,
  heading,
  subheading,
}: {
  slides: HeroSlide[]
  heading: string
  subheading: string
}) {
  const [i, setI] = useState(0)
  const count = slides.length

  useEffect(() => {
    if (count <= 1) return
    const t = setInterval(() => setI((p) => (p + 1) % count), 5500)
    return () => clearInterval(t)
  }, [count])

  const current = slides[i]

  return (
    <section className="relative h-[22rem] w-full overflow-hidden rounded-2xl ring-1 ring-white/10 sm:h-[26rem]">
      {/* Hintergrundbilder (Crossfade) */}
      {slides.map((s, idx) => (
        <div
          key={idx}
          className={`absolute inset-0 transition-opacity duration-1000 ${idx === i ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden={idx !== i}
        >
          {s.imageUrl ? (
            <Image
              src={s.imageUrl}
              alt=""
              fill
              priority={idx === 0}
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-accent/30 to-accent-2/30" />
          )}
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-zinc-950/30" />
      <div className="absolute -top-24 left-1/4 h-72 w-[40rem] rounded-full bg-gradient-to-r from-accent/20 to-accent-2/20 blur-3xl" />

      {/* Inhalt */}
      <div className="relative flex h-full flex-col justify-end p-6 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">OtakuPulse</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-extrabold leading-tight text-white sm:text-5xl">{heading}</h1>
        <p className="mt-3 max-w-xl text-base text-zinc-300 sm:text-lg">{subheading}</p>

        {current ? (
          <Link
            href={current.href}
            className="mt-5 inline-flex w-fit items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20"
          >
            <span className="text-accent">▶</span> Jetzt im Fokus: <span className="font-bold">{current.title}</span>
          </Link>
        ) : null}

        {/* Dots */}
        {count > 1 ? (
          <div className="mt-5 flex gap-2">
            {slides.map((_, idx) => (
              <button
                key={idx}
                aria-label={`Slide ${idx + 1}`}
                onClick={() => setI(idx)}
                className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-7 bg-accent' : 'w-3 bg-white/30 hover:bg-white/50'}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
