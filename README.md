# Észvesztő ✳

Magyar nyelvű, mobilra tervezett, böngészős kvízparti 2–8 barátnak. A második mérföldkő teljes, szerver által vezérelt játékot ad az élő előszobához: kategóriaszavazás, valódi kérdések, pontozás, ranglista, dupla pontos döntő és új parti.

## Játszható funkciók

- Privát szoba hétkarakteres kóddal vagy meghívóval, nyolc kozmetikai karakterrel.
- Szinkronizált karakterválasztás, készenlét és házigazdai beállítások: 6/12/18 kérdés, Könnyed/Normál/Nehéz. Az alapérték továbbra is 12 és Normál.
- Indításhoz 2–8 kapcsolódó, kész játékos szükséges, a házigazdával együtt. Beállításcsere mindenki, karaktercsere a saját készenlétet törli.
- Háromkérdéses blokkonként 8 másodperces szavazás három kategóriára; az idő lejártáig módosítható saját szavazat, többségi győztes, egyenletes véletlen döntetlen esetén.
- Közös, egyszer megkevert kérdés és négy nagy válaszgomb; 15 másodperces szerverhatáridő, egy lezárt válasz játékosonként. Minden jogosult válasza után korai eredmény.
- Helyes válasz 100 + 0–50 gyorsasági pont, hibás vagy hiányzó válasz 0. Az utolsó 2/3/4 kérdés a 6/12/18 kérdéses partiban dupla pontos döntő.
- Minden kérdés után 4 másodperc eredmény és 4 másodperc ranglista; összesített pontok, közös helyezés döntetlennél, saját pontosság és átlagos válaszidő a végén.
- Házigazda által engedélyezett új parti ugyanabban a szobában: identitások, karakterek és beállítások maradnak, pontok és válaszok törlődnek, ismét készen kell állni.

**Még nincs szabotázs:** a harmadik PR témája a képességválasztás, célzás és korlátozott összhatás. Ezekhez csak a fázistípusok vannak fenntartva. Fiók, bolt, globális ranglista és nyilvános párkeresés nincs. Részletes szabályok: [játéktervezési szerződés](docs/game-design.md).

## Kérdésbank és nehézség

A szerveroldali `src/server/questions.ts` **120 magyar szöveges kérdést** tartalmaz: 12 kategória, kategóriánként 10 (3 könnyű, 4 közepes, 3 nehéz). Kategóriák: Földrajz, Történelem, Filmek és sorozatok, Zene, Tudomány, Állatvilág, Gasztronómia, Sport, Videójátékok, Magyarország, Popkultúra, Vegyes érdekességek.

Importáláskor automatikus strukturális ellenőrzés szükséges: egyedi ID és kérdésszöveg, ismert kategória és nehézség, négy különböző válasz, érvényes kulcs, publikálási állapot és HTTPS forrásmutató. A kérdésbank és megoldókulcs nem kerül a böngészőcsomagba. Csak a jelenlegi kérdés nyilvános része érkezik, megoldás kizárólag lezárás után. Nincs külső kérdés-API, élő AI vagy távoli képkérés.

Ez **kezdő tartalomkészlet**, nem függetlenül, ember által auditált adatbázis. A forrásmutatók témaköri szerkesztői kiindulópontok, nem minden kérdéshez ellenőrzött idézetek. A nehézség előzetes besorolás, nem játékosokkal mért kalibráció. A szerkezet automatikusan ellenőrzött; szélesebb publikálás előtt tételes tartalmi és nehézségi ellenőrzés ajánlott. A jelenlegi állapot ezt kifejezetten `automated-structure-only` jelöléssel tárolja.

A célzott háromkérdéses minták:

| Beállítás              | Minta                   |
| ---------------------- | ----------------------- |
| Könnyed                | könnyű, könnyű, közepes |
| Normál, első félidő    | könnyű, közepes, nehéz  |
| Normál, második félidő | közepes, nehéz, nehéz   |
| Nehéz                  | közepes, nehéz, nehéz   |

A véletlen mintavétel a kiválasztott kategórián belül marad. Új parti esetén először a legfeljebb 60 megjegyzett korábbi kérdésen kívüli tartalom fogy; azon belül a kért nehézség. Ha nincs megfelelő szint, a dokumentált sorrend szerinti másik szint következik. Partin belül nincs ismétlődő kérdés-ID. Kategória csak legalább három felhasználatlan kérdéssel ajánlható fel; az új kategóriaajánlatok elsőbbséget kapnak, szükség esetén korábbi ajánlat ismétlődhet. Képes és igaz/hamis típusokra a modell és megjelenítés bővíthető, a jelenlegi publikált bank csak négyválaszos szöveges kérdéseket enged.

## Állapotgép és pontozás

`lobby → category-vote → question → results → leaderboard`. Minden harmadik lezárt kérdés után új szavazás, az első döntőkérdés előtt egyszeri 2 másodperces `finale`, az utolsó ranglista után `final-results`. A házigazda innen nyithat új előszobát. A kliens nem léptet fázist és nem küld pontszámot.

A szerver menti a fázisazonosítót, munkamenetet, kört, határidőt, kérdésazonosítókat, kevert válaszsorrendet, zárolt válaszokat, korábbi helyezést és pontokat. A Durable Object az állapotváltozásokat sorosítja. Az alarm a fázishatáridő, szobalejárat, kapcsolatfigyelés és visszatérési türelmi idő közül a legkorábbira áll. Későn érkező alarm az eredeti határidőktől halad tovább, ugyanazt a kérdést egyszer pontozva. Nyitott böngésző nélkül is befejeződik a parti. A kliens a szerveridő és ping/pong alapján becsült óraeltéréssel rajzolja a visszaszámlálást; a válasz elfogadásáról a szerver dönt.

A technikai alapértékek (8/15/4/4/2 másodperc, 2/3/4 döntőkérdés és gyorsasági képlet) e PR implementációs döntései. Helyes, időben beérkezett válasznál `e = floor((szerver_beérkezés − kérdéskezdés) / 1000)`, `bónusz = floor(50 × max(0, 14 − e) / 14)`, `pont = (100 + bónusz) × szorzó`. Így az első másodperc bónusza 50, az utolsóé 0; a szorzó a döntőben 2, egyébként 1. A teljes 15 másodperces határidőn vagy utána beérkező válasz már nem fogadható el. Nincs kliensidő-alapú vagy rejtett késleltetéskompenzáció; a hálózati út befolyásolja a fogadást, de másodperces pontozási sávok korlátozzák a finom időzítési különbségeket.

## Architektúra

React + TypeScript + Vite frontend, egyazon eredetű Cloudflare Worker API és assetkiszolgálás. Szobánként egy SQLite-alapú Durable Object, hibernálható WebSocketekkel és személyre vetített állapotüzenetekkel. Böngészőtár csak a visszatérési belépést tárolja.

- `src/client`: előszoba, fókuszált játékképernyők, stílusok, kapcsolat és óraeltérés.
- `src/shared/game.ts`: karakterek, beállítások, típusos protokoll és nyilvános játékadatok.
- `src/server/questions.ts`: publikált kérdések, forrásmutatók és strukturális validálás.
- `src/server/quiz.ts`: mintavétel, szavazás, határidők, pontozás, rangsorolás és új parti.
- `src/server/model.ts`: szobaszabályok, bemenetvalidálás, régi állapot kompatibilis bővítése.
- `src/server/room.ts`: tartós tárolás, WebSocket-hitelesítés és alarmok.
- `src/server/index.ts`: HTTP, eredetellenőrzés, kéréskorlátok és assetfejlécek.
- `tests`: szabálytesztek, valódi Workers futtatókörnyezet és kétböngészős teljes parti.

Az első PR csak olvasásra vizsgálta a [`zsdaniel105/Tavern-Table`](https://github.com/zsdaniel105/Tavern-Table) mintáit (README: Dicey Dummies; Worker: tavern-tales). Észvesztő önálló forrást és tartalmat használ; a referenciaprojekt nem módosult. [Referenciajegyzetek](docs/reference-notes.md).

## Újracsatlakozás és szobaéletciklus

A böngésző szobánként véletlen 256 bites belépési titkot készít; a szerver csak SHA-256 hashét tárolja. Első WebSocket-üzenetben vagy HTTPS-kérésben érkezik, URL-be és nyilvános állapotba nem kerül. A publikus játékos-ID nem ad jogosultságot. Másik ablak ugyanazzal a belépéssel átveszi a kapcsolatot; az előző ablak érthető üzenetet kap. Tiltott böngészőtár vagy törölt tár esetén az identitás helyreállítása nem garantálható.

Kapcsolatfigyelés: kliensping 20 másodpercenként, szerver-időtúllépés 65 másodperc, nem hitelesített kapcsolat 10 másodperc. Az előszobában 90 másodperces észlelt kapcsolatvesztés után felszabadul a hely és a régi identitás lejár. **Aktív partiban és a végeredménynél a rekord és a pontok maradnak**, a házigazda 90 másodperc után a legkorábban érkezett, elsősorban kapcsolódó, még türelmi időn belüli játékosra száll. Türelmi időn túli játékos nem tartja fel a korai kérdéslezárást, de visszatérhet ugyanazzal az identitással a parti/szoba végéig. A zárolt válasz frissítéskor is megmarad. A 15 másodperces határidő minden esetben továbbviszi a játékot.

Kifejezett kilépés elveszi a visszatérési jogosultságot, de az addigi eredmények a lezáró ranglistában maradnak. Új partinál a türelmi időn túl offline játékosok szobarecordjai törlődnek; visszatérők és kapcsolódók maradnak. Új készenlét, új munkamenet és fázisazonosító védi az új partit a korábbi beküldésektől. Azonos pontszámhoz azonos versenyhelyezés tartozik; megjelenítési sorrend pontszám, belépési idő, ID. Pontosság: helyes / összes kérdés, kihagyásokkal együtt. Átlagos válaszidő csak elfogadott válaszokra, helyes és hibás válaszokra egyaránt.

Üres szoba törlődik; lejárat 2 óra játék/előszoba-művelet nélküli tétlenség vagy 24 óra teljes kor. Ping önmagában nem hosszabbítja meg. Kód új anonim belépést enged, másik játékos irányítását nem. Új játékos csak előszobába léphet be. Alapvédelmek: azonos eredet, korlátos üzenetek, HTTP/kapcsolat sebességkorlát, runtime-validálás, CSP és szövegként renderelt becenevek. Ezek nem teljes nyilvános szolgáltatási visszaélésvédelem.

## Cloudflare és felhős munkafolyamat

GitHub → Codex Cloud → pull request → Cloudflare Workers Builds. A tulajdonosnak nincs szüksége helyi fejlesztőkörnyezetre. A meglévő Workers Builds kapcsolat továbbra is `main` ágról építhet:

1. Node.js 24 (`NODE_VERSION=24`), build: `npm ci && npm run build`, deploy: `npx wrangler deploy`. A Vite plugin Worker csomagot és deploy-konfigurációt ad; Wrangler követi a `.wrangler/deploy/config.json` fájlt.
2. A Worker neve, éles `ROOMS`, `ASSETS`, `ROOM_LIMITER` és a `v1` SQLite-migráció változatlan. Nincs új éles infrastruktúra, adatbázis, fizetős szolgáltatás vagy titokigény. Feature ágakon a Workers Builds `npx wrangler preview` parancsot használhat: a `previews` blokk külön deklarálja a helyi `Room` osztályra mutató `ROOMS` bindingot, így minden preview saját Durable Object névteret és tárolást kap. A preview `ROOM_LIMITER` névtere `1002`, az éles `1001` marad; a preview-k közös, éles forgalomtól elkülönített rate-limit névteret használnak. Assetek és migráció a felső szintről származnak. [Cloudflare preview-erőforrások és izoláció](https://developers.cloudflare.com/workers/previews/resources/#durable-objects).
3. Tárolási séma: az új mezők a meglévő `room` rekordhoz adódnak (`schemaVersion: 2`). Régi előszobák identitásai és beállításai megmaradnak. Az első PR régi, kérdés nélküli `session` képernyője egyszer visszatér az előszobába, új készenléttel és magyar tájékoztatóval. Nincs SQLite-osztályváltás vagy destruktív migráció.
4. Tartalomfrissítésnél a kérdés-ID-kat őrizni kell, mert aktív parti hivatkozhat rájuk. A 24 órás szobakor felső korlátot ad ennek az átmenetnek.
5. A kódolási munkamenet csak helyi buildet és Wrangler deploy dry runt ellenőriz; **nem végzett éles telepítést**. A PR automatikusan nem kerül beolvasztásra.

Workers/SQLite Durable Objects a Cloudflare Free csomagban a mindenkori kvóták mellett használhatók. Éles ellenőrzéshez két eszközön játsszatok végig egy rövid partit, frissítsetek már beküldött válasz után, ellenőrizzétek a dupla pontos döntőt és az új partit. Az eredet változtatása nem viszi át a böngészőben őrzött belépéseket.

## Ellenőrzés Codex Cloudban és CI-ben

A Node-verzió és a lockfile rögzített. Codex/CI:

```sh
npm ci
npm run check     # ESLint, TypeScript, Workers-tesztek, éles build
npm run test:e2e  # saját Wrangler szerver + független Chromium-környezetek
```

A böngészőteszt valódi, 8/15/4/4/2 másodperces termékidőkkel játssza végig a hatkérdéses partit; nincs éles kódba épített tesztóra vagy hamis pontozás. Mindkét kliens válaszol, az egyik frissít beküldés után, az ellenőrzés tényleges részpontokból számolja a végső sorrendet. Mobil szélességek 320–430 px és asztali nézet is ellenőrzött. A Workers-tesztek tárolt határidőt módosító, kizárólag tesztoldali rekonstrukcióval vizsgálják a késői alarmot és a kliens nélküli befejezést. A tesztek nem állítanak éles Cloudflare-validálást.

A böngészőrunner saját szervert indít/leállít; előtte ne fusson ugyanazon porton kézi szerver. CI Playwright Chromiumot telepít; előtelepített felhős Chromiumhoz `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` használható. Sandboxban az npm cache és Wrangler napló/konfiguráció írható helyre kerüljön: [felhős munkafolyamat](docs/cloud-workflow.md). `npm run dev` a UI-t és Workert együtt, `npm run start` az elkészült buildet futtatja. Ezek Codex/CI-parancsok.

Következő PR: valódi szabotázsválasztás és célzás, szerveroldali összevonási korlátok, olvasható és megválaszolható mobilhatások, erre célzott többjátékos tesztek. A kérdésbank tételes forrásellenőrzése és nehézségkalibrációja külön tartalmi feladat.
