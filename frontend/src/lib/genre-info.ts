// Kurze deutsche Beschreibungen für die Standard-AniList-Genres.
// Dient als Fallback, solange `descriptionDe` im CMS nicht gepflegt ist
// (für „Genre des Tages" und Intro-Texte auf Genre-Seiten).

export const GENRE_INFO: Record<string, string> = {
  action:
    'Schnelle Kämpfe, hohe Einsätze und spektakuläre Animationen — Action-Anime leben von Tempo, Power-ups und epischen Showdowns.',
  adventure:
    'Große Reisen, unbekannte Welten und der Ruf des Abenteuers: Hier zählt die Reise genauso viel wie das Ziel.',
  comedy: 'Gag-Timing, schräge Charaktere und absurde Situationen — Comedy-Anime sorgen für Lachflashs zwischendurch.',
  drama: 'Emotionale Tiefe, schwierige Entscheidungen und Charakterentwicklung, die unter die Haut geht.',
  ecchi: 'Frech, fanservice-lastig und augenzwinkernd — Ecchi spielt gezielt mit Anspielungen, ohne explizit zu werden.',
  fantasy: 'Magie, Schwerter und fremde Reiche: Fantasy-Anime entführen in Welten, in denen alles möglich ist.',
  horror: 'Beklemmung, Grusel und das Unheimliche — Horror-Anime kriechen langsam unter die Haut.',
  mecha: 'Riesige Roboter, Pilot:innen und Mensch-Maschine-Konflikte — das Herzstück vieler Sci-Fi-Klassiker.',
  music: 'Bands, Idols und der Traum von der großen Bühne — Musik-Anime treffen den richtigen Ton.',
  mystery: 'Rätsel, Hinweise und überraschende Wendungen: Mystery-Anime fordern zum Mitraten heraus.',
  psychological:
    'Mindgames, moralische Grauzonen und Spannung im Kopf — psychologische Anime spielen mit der Wahrnehmung.',
  romance: 'Schmetterlinge im Bauch, Missverständnisse und große Gefühle — Romance-Anime über jede Form der Liebe.',
  'sci-fi': 'Zukunftsvisionen, Technologie und das große Was-wäre-wenn — Sci-Fi denkt das Mögliche weiter.',
  'slice-of-life': 'Der Charme des Alltags: ruhige Momente, Freundschaften und das Schöne im Gewöhnlichen.',
  sports: 'Schweiß, Teamgeist und der Wille zu gewinnen — Sport-Anime über Leidenschaft und Durchhaltevermögen.',
  supernatural: 'Geister, Kräfte und das Übernatürliche treffen auf den Alltag — die Grenze zur anderen Welt ist dünn.',
  thriller: 'Nervenkitzel, Verfolgung und ständige Anspannung — Thriller-Anime halten den Puls oben.',
  'mahou-shoujo': 'Verwandlungen, Magie und Freundschaft — magische Mädchen kämpfen mit Herz für das Gute.',
  hentai: 'Explizite Erwachsenen-Inhalte.',
}

export function genreBlurb(slug?: string | null, name?: string | null): string {
  if (slug && GENRE_INFO[slug]) return GENRE_INFO[slug]
  return `Entdecke die besten ${name || 'Anime'}-Titel — sortiert nach Beliebtheit, mit allen Infos zu Studios, Charakteren und Episoden.`
}
