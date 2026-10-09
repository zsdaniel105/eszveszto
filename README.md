# Észvesztő ✳

Magyar nyelvű, böngészős kvízparti 2–8 barátnak. A hatodik mérföldkő két játszható módot ad: a megszokott **Normál kvízt**, valamint a **TV Party** közös kijelzőjét és személyes telefonos vezérlőit. Kategóriaszavazás, hat valódi szabotázs, pontozás, többtippes dupla pontos döntő és új parti mindkét módban ugyanazon szervervezérelt játékot használja.

## Játszható funkciók

- Privát szoba hétkarakteres kóddal vagy meghívóval, nyolc kozmetikai karakterrel.
- Szinkronizált karakterválasztás, készenlét és házigazdai beállítások: 6/12/18 kérdés, Könnyed/Normál/Nehéz. Az alapérték továbbra is 12 és Normál.
- Indításhoz 2–8 kapcsolódó, kész játékos szükséges. Normál kvízben a házigazda is játékos; TV Partyban a külön kijelző nem foglal helyet és nem jelzi a készenlétét. Beállításcsere mindenki, karaktercsere a saját készenlétet törli.
- Háromkérdéses blokkonként 8 másodperces szavazás három kategóriára; az idő lejártáig módosítható saját szavazat, többségi győztes, egyenletes véletlen döntetlen esetén.
- Közös, egyszer megkevert kérdés és négy nagy válaszgomb; 15 másodperces szerverhatáridő. Normál körben egy lezárt válasz; a döntőben a hibás válasz kiesik, és tovább lehet próbálkozni. Korai eredmény csak minden jogosult befejezése után.
- Normál körben a helyes válasz 100 + 0–50 gyorsasági pont, hibás vagy hiányzó válasz 0. Az utolsó 2/3/4 kérdés a 6/12/18 kérdéses partiban többtippes döntő: `(100 − 30 × hibás tippek + gyorsaság) × 2`, csak helyes megoldásra.
- Minden kérdés után 4 másodperc eredmény és 4 másodperc ranglista; összesített pontok, közös helyezés döntetlennél, saját pontosság és átlagos válaszidő a végén.
- Házigazda által engedélyezett új parti ugyanabban a szobában: identitások, karakterek és beállítások maradnak, pontok és válaszok törlődnek, ismét készen kell állni.

## Normál kvíz vagy TV Party

A „Játék létrehozása” két szerepkártyát mutat. **Játékosként / Normál kvíz** az alapértelmezés: a létrehozó becenevet és karaktert választ, házigazdaként játszik, mindenki saját eszközén látja a kérdést és a válaszokat. Régi szobák és elmentett belépések automatikusan ezt használják.

**Kijelzőként / TV Party**: a TV/laptop böngészője becenév és karakter nélkül hoz létre először üres szobát. A nagy kijelző hétkarakteres kódot, valódi QR-kódot és a jelenlegi eredet `/join/<kód>` meghívóját mutatja. A QR helyben készül a kis `qrcode-generator` könyvtárral; nincs külső QR-szolgáltatás vagy belépési titok a meghívóban. A telefonok a meglévő belépési űrlapon választanak nevet/karaktert, majd készen állnak. A kijelző nyolc **valódi** játékos mellett is külön kapcsolat marad.

A kijelző házigazdaként beállítja a kérdésszámot/nehézséget, indít és új partit nyit; nem szavaz, támad, tör jeget, válaszol vagy kap pontot. Nagy képernyős előszoba, kategóriák és szavazási haladás, szabotázs-várakozás, lezárt támadásbemutató, domináns kérdés/idő, helyes megoldás/magyarázat, teljes ranglista és végső győztesek követik az élő WebSocket-állapotot. Opcionális, valódi Fullscreen API vezérlő egérrel/billentyűzettel működik; nem szükséges teljes képernyőre váltani.

TV Party kérdés alatt a telefon alapból a négy nagy válaszgombot, időt, saját pontot és szabotázst mutatja. A kérdésszöveg helyett nem marad üres terület. A „Kérdés mutatása” egyéni, helyben mentett megjelenítési választás; nem változtat szabályt/pontot. A takony söprése, jég koppintásai, helycserék, fejre állítás, tinta és rulett a telefonon működnek. Döntőben csak a saját rossz tipp esik ki, ugyanazzal a levonásos pontozással. A telefon ranglistája személyes összesítés, a kijelző a közös eredménytábla.

**Kapcsolatvesztés:** amint a szerver offline kijelzőt jelez, a telefon automatikusan megmutatja a kérdést. Visszatéréskor ismét válaszokra fókuszál, kivéve, ha a játékos külön kérte a kérdés mutatását. A szerver 90 mp észlelt kapcsolatvesztésig fenntartja a kijelző házigazdai szerepét, utána a legkorábban belépett, kapcsolódó, jogosult játékos kapja meg. A visszatérő kijelző ekkor néző, nem veszi vissza a vezérlést. Kifejezett „Kijelző bezárása” azonnal visszavonja a kijelző belépését és átadja a szerepet. Idők, pontok és parti közben is továbbhaladó alarmok változatlanok. Aktív kijelző megtartja a játékos nélküli előszobát, de 2 óra tétlenség / 24 óra szobakor továbbra is lejárat.

Mód, kapcsolati szerep és házigazdai jogosultság külön mező. A kijelző saját 256 bites titkához csak hash tárolódik; szerepkötött hitelesítés és minden művelet szerveres jogosultságvizsgálata védi. A kijelző állapotából kimaradnak a saját játékosadatok, privát ajánlatok/célzások/hatások/tippek és a lezárás előtti megoldás. A közös hangokat a kijelző játssza, telefonon személyes visszajelzés marad; mindkettő némítható és felhasználói gesztushoz kötött. Magyar kérdésfelolvasás későbbi lehetőség, ebben a PR-ban nincs TTS. [Részletes mód- és szerepszerződés](docs/game-design.md#pr-6-két-játékmód-kijelző-és-telefonos-vezérlők).

## Működő szabotázs

Minden kérdés előtt a szerver játékosonként három különböző, tartósan mentett képességet kínál fel. Egy ingyenes támadás indítható: képességkártya → ellenfél karaktere/beceneve → szerver-visszaigazolás és várakozás. A célpontok csak képességválasztás után jelennek meg; visszalépéssel másik képesség választható. Öncélzás nincs. A két lépésre összesen 10 mp jut; a „Most nem támadok” gomb vagy az idő lejárta kihagyás. Minden jogosult döntése után korai lezárás, majd 1,5 mp támadásbemutató és a szokásos 15 mp kérdés következik.

| Képesség       | Tényleges hatás és alapkorlát                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Takonybomba    | 2 törölhető vászonfolt, valódi ujj-/egérhúzással; foltonként több söprés, legfeljebb 3 folt. Billentyűzettel 4 törlési lépés.    |
| Fagyasztás     | Szerveres jégzár, 3/4/5 koppintással előbb feltörhető; 1/2/3/4+ támadás legfeljebb 1,2/1,6/1,8/2 mp.                             |
| Káosz          | Kérdésmegjelenés után helycsere 0,65 mp-nél; 2+ támadásnál még egy 1,25 mp-nél. A rendeződés 0,85/1,45 mp-ig tiltja a beküldést. |
| Feje tetejére! | Csak a válaszszöveg fordul el, 3 mp-re; további támadásonként +0,5 mp, maximum 4 mp.                                             |
| Tintapaca      | 2 sötét, csillagos tintafolt; rövid söprés vagy foltonként két koppintás/kattintás/Enter szétoszlatja; legfeljebb 3 folt.        |
| Válaszrulett   | 2 mp rendezett körforgás, 4 helycserével; 2+ támadásnál legfeljebb 5. Utána stabil, normál válaszadás.                           |

Minden elfogadott támadás megmarad a nyilvántartásban, akár heten célozzák ugyanazt a játékost. A fagyasztás és a helycserék közös, párhuzamos beküldési zára **maximum 2 mp**. Rulett és Káosz együtt a rulett ütemezését használja; a Káosz a végső sorrendhez járul hozzá, új mozgást/időzárat nem ad. Ezután következik az esetleges fejre állítás, majd a törölhető foltok; az utóbbiak 4,5 mp után maguktól is eltűnnek. A takony és tinta együtt legfeljebb 6 kis folt, névleges befoglaló területük az érintett felület 20,4%-a, a mobil érintési minimumokkal is 25% alatt. További támadások az összesítésben számítanak, a korlátokat nem lépik át.

A helycserék kizárólag a megjelenítést módosítják: minden gomb ugyanazt a kanonikus válaszindexet küldi. A szabotázs nem változtatja meg a megoldást, a pontozást vagy a határidőt. Teljes támadáslista az eredmény részleteiben, kis összesítés a kérdésnél. A konkrét ütemezés, kilépési szabályok, ellenőrzések és korlátok: [játéktervezési szerződés](docs/game-design.md). Fiók, bolt, globális ranglista és nyilvános párkeresés nincs.

## Kérdésbank és nehézség

A szerveroldali `src/server/content/` **312 magyar szöveges kérdést** tartalmaz: 12 meglévő kategória, kategóriánként 26, mindhárom nehézségben legalább 5. Az eredeti 120 ID és helyes válasz megmaradt; 192 új kérdés készült. Kategóriák: Földrajz, Történelem, Filmek és sorozatok, Zene, Tudomány, Állatvilág, Gasztronómia, Sport, Videójátékok, Magyarország, Popkultúra, Vegyes érdekességek.

Importáláskor automatikus strukturális ellenőrzés szükséges: stabil, egyedi ID; normalizált egyedi kérdés és négy különböző válasz; kategória, nehézség, kulcs, magyarázat és eredetjelölés. Az azonos megoldású, erősen hasonló megfogalmazásokat szóhalmaz-alapú ellenőrzés jelzi. Ez nem szemantikai vagy tényellenőrzés. A bank és megoldókulcs nem kerül a böngészőcsomagba. Csak az aktuális kérdés nyilvános része érkezik, megoldás kizárólag lezárás után. Nincs külső kérdés-API, élő AI vagy távoli képkérés.

A korábbi bank nyelvi, egyértelműségi és nehézségi auditja, illetve az új kérdések szerkesztése modell által történt. **11 kérdés helyes válaszát ténylegesen lekért forrásszöveggel vetettük össze** (`source-checked-answer`); a többi `model-audited`. A `published` játékba engedett tartalmat jelent, nem emberi tanúsítást. Nem volt független emberi ellenőrzés vagy játékosokkal mért nehézségkalibráció. A hozzávetőleg 450-es célnál kisebb készletet választottunk a korlátozott forráselérés és a tartalmi minőség miatt. A pontos javítások, eloszlás és ellenőrzött források: [tartalmi audit](docs/content-review.md).

A célzott háromkérdéses minták:

| Beállítás              | Minta                   |
| ---------------------- | ----------------------- |
| Könnyed                | könnyű, könnyű, közepes |
| Normál, első félidő    | könnyű, közepes, nehéz  |
| Normál, második félidő | közepes, nehéz, nehéz   |
| Nehéz                  | közepes, nehéz, nehéz   |

A véletlen mintavétel a kiválasztott kategórián belül marad. Új parti esetén először a legfeljebb 180 megjegyzett korábbi kérdésen kívüli tartalom fogy; azon belül a kért nehézség. Ha nincs megfelelő szint, a dokumentált sorrend szerinti másik szint következik. Partin belül nincs ismétlődő kérdés-ID. Kategória csak legalább három felhasználatlan kérdéssel ajánlható fel; az új kategóriaajánlatok elsőbbséget kapnak, szükség esetén korábbi ajánlat ismétlődhet. Képes és igaz/hamis típusokra a modell és megjelenítés bővíthető, a jelenlegi publikált bank csak négyválaszos szöveges kérdéseket enged.

## Állapotgép és pontozás

`lobby → category-vote → sabotage-selection → sabotage-reveal → question → results → leaderboard`. A célzás a választási fázis helyi második lépése, nem újabb tíz másodperces fázis. Minden harmadik lezárt kérdés után új szavazás, az első döntőkérdés előtt egyszeri 2 másodperces `finale`, az utolsó ranglista után `final-results`. A házigazda innen nyithat új előszobát. A kliens nem léptet fázist és nem küld pontszámot.

A szerver menti a fázisazonosítót, munkamenetet, kört, határidőt, kérdésazonosítókat, kevert válaszsorrendet, zárolt válaszokat, korábbi helyezést és pontokat. A Durable Object az állapotváltozásokat sorosítja. Az alarm a fázishatáridő, szobalejárat, kapcsolatfigyelés és visszatérési türelmi idő közül a legkorábbira áll. Későn érkező alarm az eredeti határidőktől halad tovább, ugyanazt a kérdést egyszer pontozva. Nyitott böngésző nélkül is befejeződik a parti. A kliens a szerveridő és ping/pong alapján becsült óraeltéréssel rajzolja a visszaszámlálást; a válasz elfogadásáról a szerver dönt.

A technikai alapértékek (szavazás 8, szabotázsválasztás 10, bemutató 1,5, kérdés 15, eredmény/ranglista 4/4, döntőbejelentés 2 másodperc, 2/3/4 döntőkérdés és gyorsasági képlet) e PR implementációs döntései. Helyes, időben beérkezett válasznál `e = floor((szerver_beérkezés − kérdéskezdés) / 1000)`, `bónusz = floor(50 × max(0, 14 − e) / 14)`, `normál pont = 100 + bónusz; döntőpont = (100 − 30 × hibás tippek + bónusz) × 2`. Így az első másodperc bónusza 50, az utolsóé 0. A döntőben az első helyes tipp szerverideje adja a gyorsaságot, a korábbi hibás tipp nem. A teljes 15 másodperces határidőn vagy utána beérkező válasz már nem fogadható el. Nincs kliensidő-alapú vagy rejtett késleltetéskompenzáció; a hálózati út befolyásolja a fogadást, de másodperces pontozási sávok korlátozzák a finom időzítési különbségeket.

## Mobil játékterület, karakterek és hang

Játék közben a dokumentum nem görgethető; a `100dvh` (régi böngészőn `100vh`) magasságú nézetben a kérdés/fázis panelje tud belül görgetni. Rövid képernyőn, fekvő helyzetben vagy megnövelt szövegnél így mind a négy válasz, mindhárom képesség, hét célpont, kihagyás, eredmény, ranglista és új parti elérhető. Az állapot és kilépés a panelen kívül marad. A fókuszálható panel billentyűzettel is görgethető. Az előszoba, főoldal, űrlap és terminális kapcsolati hiba normál dokumentumgörgetést kap; a nézet elhagyása visszaállítja a korábbi jelölőket. Nincs általános érintéstiltás, a zoom és a tinta söprése megmarad.

A nyolc kozmetikai karakter egységes `CharacterPortrait` felületet használ: saját könnyű vektorkeret, szín és részletjel az eddigi emoji mellett. Ez nem kész prémium illusztrációcsomag; később a komponens lecserélhető jóváhagyott saját képekre, ID-változtatás nélkül. Rövid fázis-, rögzített válasz-, valódi pont/helyezés- és győzelmi animációk, csökkentett mozgásnál kikapcsolva. Nem módosítják az időzítést vagy a játékszabályt.

A fejléc Hang/Néma gombja a főoldaltól az új partiig elérhető. Egy központi Web Audio vezérlő szerény, saját szinuszhang-motívumokat szólaltat meg választásnál és tényleges szerveres készenlét/szavazás/fázis/eredmény/helyezés/döntő/győzelem esetén. Csak valódi felhasználói gesztus hozhat létre vagy indíthat újra hangkörnyezetet. A némítás ugyanazon eredet helyi tárában megmarad; tiltott tárnál csak az oldal életére. Rejtett lap felfüggeszti a hangot, visszatéréskor új gesztus kell. Ismételt állapot vagy frissítés nem ismétli a visszajelzést, nincs utólagos hangtorlódás, háttérzene vagy szükséges hanginformáció. Nem támogatott/tiltott lejátszás mellett a játék csendben működik tovább.

## Architektúra

React + TypeScript + Vite frontend, egyazon eredetű Cloudflare Worker API és assetkiszolgálás. Szobánként egy SQLite-alapú Durable Object, hibernálható, szerepkötött WebSocketekkel és játékos/kijelző szerint vetített állapotüzenetekkel. Böngészőtár a visszatérési belépést, egyéni kérdésmutatást és a saját folttörlés vizuális előrehaladását tárolja. A játék szabályait és határidejét a szerver tárolja.

- `src/client`: előszoba, fókuszált játékképernyők, stílusok, kapcsolat és óraeltérés.
- `src/client/DisplayView.tsx`, `JoinQr.tsx`, `FullscreenControl.tsx`: közös kijelző, helyi QR-meghívó és valódi teljes képernyő; `SettingsControls.tsx` mindkét előszoba meglévő beállításait használja.
- `src/shared/sabotage.ts`: hat képesség központi leírása, korlátok és stabil válasz-megjelenítési projekció.
- `src/server/sabotage.ts`: ajánlatok, célpontellenőrzés, támadásnyilvántartás, összevonás és saját nyilvános állapot.
- `src/client/SabotageView.tsx`, `QuestionEffects.tsx`: mobil választás/célzás és valódi interaktív hatások.
- `src/shared/game.ts`: karakterek, beállítások, típusos protokoll és nyilvános játékadatok.
- `src/server/questions.ts`, `content/`: kategóriánkénti stabil ID-s kérdések, eredetjelölés és validálás.
- `src/server/quiz.ts`: mintavétel, szavazás, határidők, pontozás, rangsorolás és új parti.
- `src/server/model.ts`: szobaszabályok, bemenetvalidálás, régi állapot kompatibilis bővítése.
- `src/server/room.ts`: tartós tárolás, WebSocket-hitelesítés és alarmok.
- `src/server/index.ts`: HTTP, eredetellenőrzés, kéréskorlátok és assetfejlécek.
- `tests`: szabálytesztek, valódi Workers futtatókörnyezet, hang/tartalom ellenőrzése és két-/nyolcböngészős teljes parti.

Az első PR csak olvasásra vizsgálta a [`zsdaniel105/Tavern-Table`](https://github.com/zsdaniel105/Tavern-Table) mintáit (README: Dicey Dummies; Worker: tavern-tales). Észvesztő önálló forrást és tartalmat használ; a referenciaprojekt nem módosult. [Referenciajegyzetek](docs/reference-notes.md).

## Újracsatlakozás és szobaéletciklus

A böngésző szobánként véletlen 256 bites belépési titkot készít; a szerver csak SHA-256 hashét tárolja. Első WebSocket-üzenetben vagy HTTPS-kérésben érkezik, URL-be és nyilvános állapotba nem kerül. A publikus játékos-ID nem ad jogosultságot. Másik ablak ugyanazzal a belépéssel átveszi a kapcsolatot; az előző ablak érthető üzenetet kap. Tiltott böngészőtár vagy törölt tár esetén az identitás helyreállítása nem garantálható.

Kapcsolatfigyelés: kliensping 20 másodpercenként, szerver-időtúllépés 65 másodperc, nem hitelesített kapcsolat 10 másodperc. Az előszobában 90 másodperces észlelt kapcsolatvesztés után felszabadul a hely és a régi identitás lejár. **Aktív partiban és a végeredménynél a rekord és a pontok maradnak**, a házigazda 90 másodperc után a legkorábban érkezett, elsősorban kapcsolódó, még türelmi időn belüli játékosra száll. Türelmi időn túli játékos nem tartja fel a korai kérdéslezárást, de visszatérhet ugyanazzal az identitással a parti/szoba végéig. A zárolt válasz frissítéskor is megmarad. A szabotázsajánlat és a rögzített támadás sem változik: frissítéssel nincs újradobás vagy új támadás. Az abszolút határidejű hatások a hátralévő ideig tartanak; a folttörlés ugyanabban a böngészőben megmarad. A támadó későbbi kapcsolatvesztése/kilépése nem vonja vissza a támadást. Rövid ideig offline célpont támadható, türelmi időn túl újonnan már nem; rögzített támadás nem kerül másik játékosra. A feloldás előtt kifejezetten kilépő célpont támadása „target-left” eredménnyel megmarad, új hatást nem kap. A 15 másodperces határidő minden esetben továbbviszi a játékot.

Kifejezett kilépés elveszi a visszatérési jogosultságot, de az addigi eredmények a lezáró ranglistában maradnak. Új partinál a türelmi időn túl offline játékosok szobarecordjai törlődnek; visszatérők és kapcsolódók maradnak. Új készenlét, új munkamenet és fázisazonosító védi az új partit a korábbi beküldésektől. Azonos pontszámhoz azonos versenyhelyezés tartozik; megjelenítési sorrend pontszám, belépési idő, ID. Pontosság: helyes / összes kérdés, kihagyásokkal együtt. Átlagos válaszidő csak elfogadott válaszokra, helyes és hibás válaszokra egyaránt.

Üres szoba törlődik; lejárat 2 óra játék/előszoba-művelet nélküli tétlenség vagy 24 óra teljes kor. Ping önmagában nem hosszabbítja meg. Kód új anonim belépést enged, másik játékos irányítását nem. Új játékos csak előszobába léphet be. Alapvédelmek: azonos eredet, korlátos üzenetek, HTTP/kapcsolat sebességkorlát, runtime-validálás, CSP és szövegként renderelt becenevek. Ezek nem teljes nyilvános szolgáltatási visszaélésvédelem.

## Cloudflare és felhős munkafolyamat

GitHub → Codex Cloud → pull request → Cloudflare Workers Builds. A tulajdonosnak nincs szüksége helyi fejlesztőkörnyezetre. A meglévő Workers Builds kapcsolat továbbra is `main` ágról építhet:

1. Node.js 24 (`NODE_VERSION=24`), build: `npm ci && npm run build`, deploy: `npx wrangler deploy`. A Vite plugin Worker csomagot és deploy-konfigurációt ad; Wrangler követi a `.wrangler/deploy/config.json` fájlt.
2. A Worker neve, éles `ROOMS`, `ASSETS`, `ROOM_LIMITER` és a `v1` SQLite-migráció változatlan. Nincs új éles infrastruktúra, adatbázis, fizetős szolgáltatás vagy titokigény. Feature ágakon a Workers Builds `npx wrangler preview` parancsot használhat: a `previews` blokk külön deklarálja a helyi `Room` osztályra mutató `ROOMS` bindingot, így minden preview saját Durable Object névteret és tárolást kap. A preview `ROOM_LIMITER` névtere `1002`, az éles `1001` marad; a preview-k közös, éles forgalomtól elkülönített rate-limit névteret használnak. Assetek és migráció a felső szintről származnak. [Cloudflare preview-erőforrások és izoláció](https://developers.cloudflare.com/workers/previews/resources/#durable-objects).
3. Tárolási séma: additív `schemaVersion: 5`. A 2-es/3-as/4-es szoba Normál kvízre alapértelmeződik (`mode: normal`, `hostRole: player`, `display: null`). Identitás, karakter, beállítás, pont, kérdés/opció, válasz/tipptörténet, jéghaladás, szabotázs, kör/fázisazonosító és abszolút határidő marad. A korábbi additív válaszpolitika-/jégmezők továbbra is pótolhatók; előkészített régi egyválaszos kérdést nem írunk át. Régi játékos-session és hibernált, csak `playerId`-s kapcsolati attachment is érvényes. Az első PR kérdés nélküli sessionje továbbra is egyszer tér vissza előszobába. Nincs SQLite-osztályváltás vagy destruktív migráció.
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

A böngészőteszt valódi, 8/10/1,5/15/4/4/2 másodperces termékidőkkel játssza végig a hatkérdéses partit; nincs éles kódba épített tesztóra vagy hamis pontozás. A Playwright külön, tesztoldali Worker-belépési pontot használ: kizárólag az első kör ajánlatait rögzíti Fagyasztásra/Takonybombára, így ezek minden futásban ténylegesen ellenőrzöttek. A valódi választás, támadás, koppintás, tipp és pontozás a termékkódban fut; a fixture végpont nem kerül az éles csomagba. Mindkét kliens képességet és ellenfelet választ, a ténylegesen felkínált hatásokat kipróbálja és válaszol. Frissítés ajánlat, támadás, folttörlés és válasz közben, csökkentett mozgás és érintés/billentyűzet is ellenőrzött; az ellenőrzés tényleges részpontokból számolja a végső sorrendet. Mobil szélességek 320–430 px és asztali nézet is ellenőrzött. A Workers-tesztek tárolt határidőt módosító, kizárólag tesztoldali rekonstrukcióval vizsgálják a késői alarmot és a kliens nélküli befejezést. A tesztek nem állítanak éles Cloudflare-validálást.

A böngészőrunner saját szervert indít/leállít; előtte ne fusson ugyanazon porton kézi szerver. CI Playwright Chromiumot telepít; előtelepített felhős Chromiumhoz `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` használható. Sandboxban az npm cache és Wrangler napló/konfiguráció írható helyre kerüljön: [felhős munkafolyamat](docs/cloud-workflow.md). `npm run dev` a UI-t és Workert együtt, `npm run start` az elkészült buildet futtatja. Ezek Codex/CI-parancsok.

PR #3 ellenőrzése: **85 sikeres szabály- és Workers-teszt**, köztük valódi nyolcklienses forgatókönyv hét támadással ugyanarra a játékosra, újraküldéssel, rekonstruált Durable Objecttel és szerveroldali fagyasztással. **3 sikeres Chromium-böngészőteszt**, közte két független kliens hatkérdéses partija, szabotázs, helyes pontozás, döntő és új parti. ESLint, TypeScript, build és Wrangler deploy dry run ellenőrzendő minden kiadásnál; aktuális PR-ban ezek eredménye a PR leírásában is szerepel.

Korlátok: a böngészős vizuális akadályok kliensoldali módosítással megkerülhetők; a szerver időzárát, válaszrögzítését és pontozását ez nem kerüli meg. Folttörlés a böngészőtár engedélyétől függ, távoli eszközre nem szinkronizált; az eredeti eltűnési idő minden esetben megmarad. Nagyon rövid kijelzőn, hosszú kérdésnél vagy hét célpontnál belső panelgörgetés szükséges lehet; a tartalmat nem vágjuk le. A csökkentett mozgás kikapcsolja az erős animációt, de megtartja az azonos helycseréket, időzárakat és törlési interakciót. A véletlen ajánlatú böngészőteszt a ténylegesen kiosztott képességeket vizsgálja; minden képesség és maximális vegyes összhatás külön determinisztikus tesztet is kap.

## PR #4 kompatibilitás és ellenőrzés

A tárolási séma továbbra is 3; új szerveres mező vagy migráció nincs. Futó régi kérdés ID-ja, mentett válaszsorrendje, megoldóindexe, válaszzárja és határideje megmarad. A hét pontosított régi kérdésszöveg ugyanarra a helyes válaszra vonatkozik. A korábbi kérdés-ID-történet mezője a következő új partinál legfeljebb 180 elemre bővül; normál fallback továbbra is működik. Worker/bindings/SQLite/preview izoláció változatlan; éles telepítést a PR nem indít.

PR #4: 96 sikeres szabály-/Workers-teszt, 5 sikeres Chromium-teszt (két- és nyolcklienses teljes parti, hang), ESLint, TypeScript, build és Wrangler deploy dry run. [Tényleges képek](docs/screenshots/README.md); részletes eredmények a PR leírásában. A böngészőtesztek Chromium érintésemulációt használnak, nem fizikai iOS/Android készülékeket. A dinamikus böngészőcímsor, valódi iOS gumigörgetés és mobil hangpolitika készülékes ellenőrzése még szükséges. Következő ajánlott mérföldkő: független magyar tartalmi audit és további forrásellenőrzés, valós telefonos játékpróba/nehézségkalibráció, majd jóváhagyott saját karakter- és hangassetek.

## PR #5: törlés, jégtörés és többtippes döntő

A takony `destination-out` vászonmaszkján a söprés valódi átlátszó nyomot hagy. Foltonként legalább két érdemi söprés, összesen 1,25 normalizált úthossz és legalább 45% letörölt terület kell; egyszerű koppintás semmit nem töröl. Tipikusan két folt négy söpréssel takarítható le. Tab + négyszer Enter/Space foltonként az akadálymentes alternatíva. Korlátos, normalizált nyomvonal mentett ugyanazon böngészőben; frissítés/nagyítás/átméretezés nem indít új hatást. Eredeti 4,5 mp lejárat és legfeljebb három folt marad.

A jéghez 1/2/3+ támadásnál 3/4/5 szerver által elfogadott koppintás kell. A szerver legalább 80 ms fogadási távolságot kér; a kliens 100 ms-os távolságot és legfeljebb öt függő kérést enged. A repedés gyors helyi visszajelzés, a válaszadás csak szerver által rögzített feltörés után nyílik. A mozgászár ettől független: Rulett esetén továbbra is 2 mp. A fagy eredeti 1,2–2 mp-es felolvadása megmarad; újracsatlakozás megtartja az elfogadott haladást.

Döntőben legfeljebb négy különböző kanonikus tipp fogadható el. Hibás opció helyén stabil, letiltott helyőrző marad, helyes tipp végleg lezár. Nincs automatikus utolsó válasz. Saját tipp/eredmény látható, más játékos tippje és a teljes megoldókulcs lezárás előtt nem. 0/1/2/3 hibával a maximális körpont 300/240/180/120. Például két hiba és 20 gyorsasági pont esetén `(100 − 60 + 20) × 2 = 120`; az aktuális egész másodperces gyorsasági sávok változatlanok. Helyes tipp nélkül 0 pont. Kérdésenként egyszer frissül a pontosság és a válaszolt kérdésszám; siker esetén a helyes tipp ideje, sikertelen, de próbált döntőnél az utolsó hibás tipp ideje adja az átlag egyetlen adatpontját.

A hangok a meglévő némítható vezérlőt használják: takonyérkezés, korlátozott söpréshang, tisztítás, szerveres jégrepedés/feltörés, helyes/hibás döntőtipp és tényleges döntőpont. Fázisidők és a további négy szabotázs szabályai maradnak. A normál kör pontozása/egyválaszos zárja változatlan.

PR #5 ellenőrzése: **127 sikeres szabály-/Workers-teszt és 6 sikeres Chromium-teszt**; ESLint, TypeScript, éles build és Wrangler deploy dry run sikeres. Két-/nyolcklienses teljes parti, jégtörés, valódi maszktörlés, döntőtipp utáni reconnect és pontos levonásos pontozás ellenőrzött. [Tényleges képek](docs/screenshots/README.md#pr-5--tényleges-maszktörlés). Éles telepítés és fizikai telefonos teszt nem történt.

Részletes megvalósítás, migráció, tesztek és korlátok: [PR #5 szabályok](docs/game-design.md#pr-5-interaktív-hatások-és-döntő). Következő ajánlott PR: valódi iOS/Android és társas teszt, a törlési/jégtörési nehézség hangolása, külön tartalmi audit.

## PR #6 ellenőrzése és következő lépés

**167 sikeres szabály-/Workers-teszt és 9 sikeres Chromium-böngészőteszt**; `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` és Wrangler deploy dry run sikeres. A teljes böngészőfutás 5,6 perc, valódi fázisidőkkel. A korábbi Normál kvíz tesztjei megmaradtak, két- és nyolcklienses teljes partival. Az új tesztek hitelesített kijelzőt és két telefon teljes hatkérdéses partiját, QR-dekódolást, privát adatokat, takony/jégtörést, döntőlevonást, refresh/fallbackot, rematchet, továbbá nyolc telefont és hét valódi támadást egy célpontra ellenőriznek. Role-forgery, host-átadás, régi attachment/séma, üres szoba és idle/abszolút lejárat a Workers-runtime-ban is tesztelt.

[Tényleges TV- és mobilképek](docs/screenshots/README.md#pr-6--közös-kijelző-és-telefonos-vezérlők). 1920×1080, 1366×768, 1280×720, 1024×768 és 320/375/390/430 px telefonnézet ellenőrzött. **Fizikai TV/iOS/Android teszt és kézi éles telepítés nem történt.** A teljes képernyő és autoplay böngészőfüggő, a QR távolsági olvashatóságához készülékpróba kell. Különösen rövid kijelző vagy nagyított szöveg belső panelgörgetést használhat; a vezérlők hozzáférhetők maradnak. Következő ajánlott mérföldkő: valódi TV + telefon társas játékpróba, akadálymentességi/kapcsolatvesztési vizsgálat és balanszhangolás; utána külön, időzítési termékdöntéssel magyar kijelzőoldali kérdésfelolvasás. Tartalmi audit külön munka marad.

Utólagos PR #6 javítás: a TV telefon válaszgombjának ✓/✕ jelzése a gomb sarkában, az elrendezési folyamon kívül jelenik meg. Így hosszabb válasznál sem nő a döntőben a megjelölt sor, és nem tolódnak el a többi válasz érintési céljai. A regresszióteszt a leghosszabb elérhető hibás opciót választja, és megtartja a pontos geometriai összehasonlítást hibás és helyes tipp után is; a szándékos rövid visszajelző animáció végét megvárja. Normál kvíz, szerveres szabályok, séma és időzítés változatlan.
