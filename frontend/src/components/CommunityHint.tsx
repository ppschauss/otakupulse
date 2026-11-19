import { DISCORD_INVITE, REDDIT_URL, TELEGRAM_CHANNEL } from '@/lib/site'

const link = 'font-semibold text-accent underline-offset-2 hover:underline'

/**
 * Kontextueller Text-Link auf die Community-Kanäle. Jeder Kanal hat seitenweit einen Button
 * (Header) und einen Text-Link (Footer); dieser Hinweis ist der dritte — mit eigenem Linktext,
 * und pro Seitentyp nur die Kanäle, die dort passen.
 */
export function CommunityHint({ variant, title }: { variant: 'news' | 'anime'; title?: string }) {
  return (
    <p className="mt-4 text-sm text-zinc-400">
      {variant === 'news' ? (
        <>
          Was meinst du dazu? Diskutier die News mit anderen Fans in der{' '}
          <a href={REDDIT_URL} target="_blank" rel="noopener noreferrer" className={link}>Reddit-Community von OtakuPulse</a> oder auf
          unserem{' '}
          <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className={link}>Discord-Server</a>.
        </>
      ) : (
        <>
          Fragen zu {title ? `„${title}“` : 'diesem Anime'} oder zur deutschen Fassung? Stell sie im{' '}
          <a href={REDDIT_URL} target="_blank" rel="noopener noreferrer" className={link}>OtakuPulse-Subreddit</a>. Wann neue Folgen
          oder ein Dub erscheinen, erfährst du über den{' '}
          <a href={TELEGRAM_CHANNEL} target="_blank" rel="noopener noreferrer" className={link}>Telegram-Kanal mit Anime-News</a>.
        </>
      )}
    </p>
  )
}
