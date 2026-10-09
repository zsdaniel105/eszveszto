# PR #4 – tényleges böngészőképek

A sikeres, valódi többklienses Chromium-tesztek képei. Nem mockupok és nem fizikai telefonfelvételek. A tesztkörnyezet érintést emulál; iOS/Android készülékes ellenőrzés még szükséges.

| Kép                                              | Nézet és bizonyított UI-állapot                                                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Kérdés](question-390.png)                       | 390 × 740 px, tényleges felkínált szabotázs után; négy kanonikus válasz, idő és Hang/Néma.                                                                                                                   |
| [Asztali kérdés](question-desktop.png)           | 1280 × 740 px, változatlan kérdés/opciók kétoszlopos elrendezésben.                                                                                                                                          |
| [Hét ellenfél](targets-320-short.png)            | 320 × 420 px, nyolc külön böngésző résztvevője; a belső panel az utolsó (hetedik) célpontra görgetve. A felső sorok emiatt nem mind látszanak egyszerre; valamennyi elérhetőségét külön ellenőrizte a teszt. |
| [Nyolcfős új parti](rematch-eight-320-short.png) | 320 × 420 px, a valódi hatkérdéses parti vége; a nyolc rangsor és saját eredmény alatt az újparti-gomb belső görgetéssel elérhető.                                                                           |

A dokumentum eltolt pozíciója minden játékellenőrzéskor nulla. A 320/375/390/430 px és desktop kérdésképek a Playwright futás további artifactjai; ezekből a reprezentatív 390 px és desktop került ide. Rövid/fekvő képernyőn és nagyobb szövegnél szándékos belső görgetés van. Normál előszoba/főoldal/űrlap és terminális hiba esetén a dokumentum ismét görgethető.


# PR #5 – tényleges maszktörlés

A valódi kétklienses Playwright-játék törlési forgatókönyvének képei: részleges érintéses söprés és frissítés után, visszaállított normalizált nyomvonallal. A második folt egy korábbi kliens már befejezett törlési rekordját őrzi; ezt külön teszt ellenőrzi. A szerveres kérdés és a 4,5 mp-es hatás határideje nem változott.

| Kép | Ellenőrzött nézet |
| --- | --- |
| [320 px](pr5-slime-320.png) | Négy elérhető válasz, részlegesen letörölt takony, látható idő, vízszintes túlcsordulás és dokumentumgörgetés nélkül. |
| [390 px](pr5-slime-390.png) | Érintésre szánt választerület, áttetsző maszk és megőrzött részleges nyom. |
| [Asztali nézet](pr5-slime-desktop.png) | 1280 px, kétoszlopos válaszrács, egérrel törölhető maszk az opciókon. |

A futás 375/430 px méretet, DPR 2 vásznat, megszakított söprést, átméretezést, billentyűzetes jégtörést és automatikus lejáratot is ellenőriz. A képek Chromium-emulációból származnak; fizikai telefonos tesztet nem állítunk. A képernyő mérete CSS-pixelben értendő, a DPR 2 felvétel képfájlja kétszer akkora.

# PR #6 – közös kijelző és telefonos vezérlők

A sikeres TV Party Playwright-forgatókönyvek valódi, független Chromium-klienseinek megnézett képei. A kijelző hitelesített külön szerep, a telefonok tényleges játékosok; a pontok és rangok valódi szervereredmények. A localhost meghívó a teszt valódi `/join/<kód>` URL-je, a renderelt QR dekódolását a böngészőteszt ellenőrzi. Fizikai TV/iPhone/Android és távoli QR-beolvasás nem volt tesztelve.

| Kép | Nézet / állapot |
| --- | --- |
| [Módválasztás](pr6-mode-selection.png) | 1366 px, teljes létrehozási oldal, kijelző választva; nincs saját név/karakter. |
| [Kijelző előszoba](pr6-display-lobby.png) | 1280×720, külön kijelző és nyolc külön telefon, nyolc valódi karakter/kész állapot, QR/kód/beállítás/indítás. |
| [TV kérdés](pr6-display-question-1920.png) | 1920×1080, közös kérdés és idő, személyes válasz- vagy hatásvezérlő nélkül. |
| [4:3 kérdés](pr6-display-question-1024.png) | 1024×768, ugyanaz a szerveres kérdés/deadline, olvasható teljes nézet. |
| [Közös ranglista](pr6-display-leaderboard.png) | 1280×720, nyolc valódi eredmény, holtversenyek és helyváltozás; belső görgetés nélkül. |
| [Végeredmény](pr6-display-final-results.png) | 1366×768, hat valódi kérdés után, hibás döntőtipp levonásával; kijelző házigazdai Új parti. |
| [Telefon 320 px](pr6-controller-320.png) | 320×740, négy nagy válasz, nincs kérdésszöveg alapból; saját idő/hatás/pont és kérdésmutatás. |
| [Telefon 390 px](pr6-controller-390.png) | 390×740, ugyanaz a személyes controller elrendezés; a közös prompt ténylegesen nem renderelődik. |
| [Telefonos szabotázs](pr6-controller-sabotage.png) | 375×740, három saját ajánlat, közös tízmásodperces idő és kihagyás; célpont csak választás után jelenik meg. |

A futás további 1366×768/1280×720 kijelző-kérdésképei, valamennyi kijelzőméret nyolcfős előszobája és 375/430 px controller-képei a teszt artifactjaiban szerepelnek. A képernyő mérete CSS-pixelben értendő. Fázisok alatt rögzített dokumentum, szükség esetén hozzáférhető belső panel. A telefonos fallback és egyéni kérdésmutatás valódi Display-kapcsolatvesztési/reconnect forgatókönyvben is ellenőrzött.
