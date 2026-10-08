# Észvesztő – játéktervezési szerződés

## Jóváhagyott döntések

- Magyar nyelvű, böngészős kvízparti 2–8 játékosnak, privát szobakóddal.
- 6, 12 vagy 18 közös kérdés; alapérték 12. Nehézség: Könnyed, Normál (alapérték), Nehéz.
- Kategóriák alapból bekapcsolva. Három kategória közül közös szavazás, körülbelül minden harmadik kérdés előtt.
- Minden kérdés után ranglista. Az utolsó kérdések dupla pontos finálét alkotnak.
- Minden játékos kérdésenként egy ingyenes szabotázst indíthat. Nincs bolt vagy fizetőeszköz.
- Három véletlenszerűen felkínált képességből választás, majd másik játékos célzása; öncélzás tilos.
- Többen célozhatják ugyanazt a játékost. Minden támadás beleszámít az összhatásba, de a hátrány korlátozott: a kérdés megválaszolható marad. Támadás nem tűnhet el csendben.
- Nyolc kizárólag kozmetikai karakter: Maffiamacska, Rövidzárlat, Professzor Káosz, Züm, Krumplibáró, Paca, Galambkirály, Csonti. Azonos karaktert többen is választhatnak.
- Előzetesen jóváhagyott kérdésbank. AI-segítség csak a játékidőn kívüli tartalom-előkészítéshez; publikálás előtt minőségellenőrzés. Nincs élő AI API-hívás.

## Javasolt alapértékek – későbbi véglegesítés szükséges

- Helyes válasz: 100 pont; gyorsasági bónusz: legfeljebb 50 pont.
- Hibás válasz vagy nincs válasz: 0 pont. A finálé megduplázza a szerezhető pontokat.
- A gyorsasági képlet, hálózati késleltetés kezelése, pontos fázisidők és fináléhossz még felülvizsgálandó.
- Szabotázsötletek: fagyasztás, nyálkabomba, válaszkeverés, fejjel lefelé válaszok, tintapaca, válaszrulett. A konkrét hatásokat és kombinációs korlátot később kell véglegesíteni.

## Jelenlegi megvalósítás

Élő előszoba, karakter- és készenlétválasztás, házigazdai beállítások, újracsatlakozás, házigazdaátadás és közös `session` fázis. Ez még nem játszható kvíz; nincs kérdés, szabotázshatás vagy pontozás.

## Következő fejlesztések

A megosztott fázistípusok: `lobby` → `session` → `category-vote` → `sabotage-selection` → `target-selection` → `question` → `results` → `leaderboard` → `finale`. Ezek jelenleg bővítési szerződések, nem kész funkciók. A pontos ciklust a következő mérföldkőben kell szerveroldali átmenetekkel kitölteni.

A kérdésmodell UI-független; támogatni fog szöveges, képes és igaz/hamis kérdéseket. Helyes válasz és pontozás soha nem kerülhet a kérdés közbeni nyilvános állapotba. Időzítés, válaszelfogadás és pontozás a szerver feladata. Ne indíts teljes kérdésbankot vagy AI szolgáltatást az előszoba mérföldkövében.
