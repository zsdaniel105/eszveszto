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
