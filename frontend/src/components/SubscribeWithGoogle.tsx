'use client'

import Script from 'next/script'

// Google „Subscribe with Google" / Reader Revenue Manager (Open Access).
// Publication-ID aus dem Google Publisher Center. Gehört NUR auf Artikelseiten
// (type: NewsArticle). CSP muss news.google.com erlauben (script-src + frame-src).
export function SubscribeWithGoogle() {
  return (
    <>
      <Script
        id="swg-basic"
        src="https://news.google.com/swg/js/v1/swg-basic.js"
        strategy="afterInteractive"
      />
      <Script id="swg-basic-init" strategy="afterInteractive">
        {`(self.SWG_BASIC = self.SWG_BASIC || []).push( basicSubscriptions => {
  basicSubscriptions.init({
    type: "NewsArticle",
    isPartOfType: ["Product"],
    isPartOfProductId: "CAow_dDLDA:openaccess",
    clientOptions: { theme: "light", lang: "de" },
  });
});`}
      </Script>
    </>
  )
}
