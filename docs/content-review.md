# PR #4 – tartalmi audit és ellenőrzési határok

## Tényleges méret és eredet

312 publikált, magyar, négyválaszos szöveges kérdés; 192 új a korábbi 120 mellé. Mind a 12 meglévő kategória 26 kérdést kapott. Nem készültek képes, igaz/hamis vagy új típusú kérdések. Nincs élő AI/API/adatbázis. A hozzávetőleg 450-es cél helyett kisebb készlet készült: az egyszerű közismert tények, olvasható szöveg és korlátozottan elérhető források fontosabbak voltak az újabb mennyiségi feltöltésnél.

Az új kérdések modell által fogalmazott vázlatokból, nyelvi/egyértelműségi szerkesztéssel készültek. A korábbi 120-at ugyanilyen modellalapú ellenőrzés vizsgálta. Ez **nem független emberi vagy teljes körű forrásaudit**. Az alap- és új készlet valamennyi négy válaszát átnéztük a szerkesztési passzban, de a tartalmi tévedés kockázata nem szűnt meg. A nehézség szerkesztői becslés; játékosokkal mért kalibráció nem történt.

| Kategória           | Összes | Könnyű | Közepes | Nehéz |
| ------------------- | -----: | -----: | ------: | ----: |
| Földrajz            |     26 |      8 |      10 |     8 |
| Történelem          |     26 |      8 |      10 |     8 |
| Filmek és sorozatok |     26 |      8 |      11 |     7 |
| Zene                |     26 |      8 |      12 |     6 |
| Tudomány            |     26 |      8 |      10 |     8 |
| Állatvilág          |     26 |      8 |      13 |     5 |
| Gasztronómia        |     26 |      8 |      10 |     8 |
| Sport               |     26 |     10 |      10 |     6 |
| Videójátékok        |     26 |      8 |      10 |     8 |
| Magyarország        |     26 |      8 |      10 |     8 |
| Popkultúra          |     26 |      8 |      10 |     8 |
| Vegyes érdekességek |     26 |      8 |      10 |     8 |

A témák változatosak a meglévő kategóriákon belül; nincs új kategória vagy szezonális ranglista/statisztika. A könnyű kérdések ismerős alapokat, a közepesek általános kulturális/tudományos tudást, a nehezek részletesebb felismerést kérnek. A besorolás továbbra is becslés.

## Mit jelent az ellenőrzési jelölés?

- **Automatikus struktúra:** mind a 312 ID/kategória/szint, négy normalizált különböző opció, érvényes kulcs, szöveg/magyarázat, eredet és HTTPS hivatkozás ellenőrzött. Kis/nagybetű, központozás és Unicode-kompatibilitás szerinti ismétlés elutasított.
- **`model-audited`:** modell szerkesztette/ellenőrizte a megfogalmazást, egységes magyar ékezeteket, egyértelműséget, helyes választ/distraktorokat és hozzávetőleges nehézséget. Ez a státusz nem bizonyítja a tényt. A kategória általános forrásmutatója további szerkesztés kiindulópontja, nem az adott kérdés forrásbizonyítéka.
- **`source-checked-answer`:** a megoldást egy ténylegesen letöltött, átolvasott forráspasszus támasztja alá. Pontosan **11** ilyen kérdés van. A rövid részlet és rögzített commitra mutató URL a szerveres `answer-checks.ts` nyilvántartásban szerepel. Nem állítjuk, hogy mindhárom distraktor vagy a szint függetlenül ellenőrzött.
- **Emberi ellenőrzés:** nem történt, nincs ilyen jelölés.

A `published` a játékba engedett tartalmat jelenti. A provenance, bizonyíték és megoldókulcs szerveroldalon marad, az aktuális kérdés nyilvános projekciójában sincs. A jelenlegi modulok explicit numerikus ID-kat használnak; átrendezés nem nevezi át őket.

## Ténylegesen olvasott bizonyítékok

A közvetlen Britannica/Wikipedia/NASA elérést a cloud proxy blokkolta. A GitHub API-n elérhető, hivatalos OpenStax és id Software forrásokat használtuk; nincs kitalált vagy pusztán cím alapján ellenőrzött hivatkozás. A tartalom saját magyar parafrázis, nem teljes forrásszöveg átvétele. A nyilvántartás rövid idézeteket tartalmaz, a letöltött teljes források nem kerülnek a projektbe.

| ID         | Ellenőrzött megoldás                                     | Tényleges forrás                                                             |
| ---------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| science-03 | A szív pumpálja a vért                                   | OpenStax Biology, m66650 – Overview of the Circulatory System                |
| science-07 | Az elektron negatív töltésű                              | OpenStax Biology, m66430 – Atoms, Isotopes, Ions, and Molecules              |
| science-16 | A jég kisebb sűrűségű a folyékony víznél                 | OpenStax Biology, m66434 – Water                                             |
| science-19 | Párolgás: folyadék felszínéről gázállapotba kerülés      | OpenStax Biology, m66434 – Water, glosszárium                                |
| science-20 | A proton pozitív töltésű                                 | OpenStax Biology, m66430                                                     |
| science-22 | A fehérjéket aminosavak építik fel                       | OpenStax Biology, m66442 – Proteins                                          |
| science-23 | DNS: dezoxiribonukleinsav                                | OpenStax Biology, m66443 – Nucleic Acids                                     |
| science-26 | Az atommag protonokat és általában neutronokat tartalmaz | OpenStax Biology, m66430                                                     |
| animals-02 | A kifejlett rovarnak három pár lába van                  | OpenStax Biology, m66399 – Superphylum Ecdysozoa: Arthropods                 |
| animals-22 | Kitin az ízeltlábú külső vázában                         | OpenStax Biology, m66399                                                     |
| games-10   | Az eredeti Doom az id Software munkája                   | Az eredeti doomdef.h fejléce: „Copyright (C) 1993-1996 by id Software, Inc.” |

Forrásverziók: [OpenStax hivatalos Biology forrás](https://github.com/openstax/osbooks-biology-bundle/tree/89c14e6d065606fdbe1e696ce2e8d9612a080147/modules), [id Software Doom forrás](https://github.com/id-Software/DOOM/blob/a77dfb96cb91780ca334d0d4cfd86957558007e0/linuxdoom-1.10/doomdef.h). Az egyes modulokra mutató pontos URL-k a [nyilvántartásban](../src/server/content/answer-checks.ts) olvashatók. Ezeket ebben a feladatban ténylegesen lekértük. Más kapcsolódó OpenStax fejezeteket is átnéztünk, de ahol a konkrét válasz nem szerepelt a látott részletben (például joghurt-baktérium), nem kapott forrásellenőrzött címkét.

## A korábbi 120 auditja és javításai

A korábbi 120 kérdés megoldókulcsa nem változott és egyik ID sem törlődött. A megoldókulcsok teljes körű, független forrásellenőrzése nem történt; a modellalapú átnézés nem talált javítandó kulcsot.

| ID                                 | Konkrét javítás                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| food-01                            | Az általános „bor” helyett hagyományos vörös- és fehérbort kérdez; a más gyümölcsből készülő borok miatti többértelműség csökken. Szőlő marad a megoldás. |
| culture-03                         | Természetes „Milyen színű…” megfogalmazás, a törpök jellegzetes bőrére, a választ eláruló „Hupikék” nélkül. Kék marad.                                    |
| film-08                            | A cím egységes magyar alakja: Chihiro Szellemországban. Rendező változatlan.                                                                              |
| mixed-03                           | Az iránytű északi végének égtáját kérdezi világosabban. Mágneses észak marad.                                                                             |
| animals-02                         | Kifejlett rovarra szűkítés; a lárvák különböző testfelépítése nem teszi kétértelművé. Hat marad.                                                          |
| geography-08                       | A Gibraltárra utaló név helyett Spanyolország és Marokkó közötti szorost kérdezi, nem árulja el a választ.                                                |
| sport-03                           | A labda tollas/műanyag szoknyájának leírásából kell felismerni a sportot; a „tollaslabda” szó nem szerepel a kérdésben.                                   |
| film-09                            | Johnny Depp/Jack Sparrow: nehéz → közepes.                                                                                                                |
| music-08, music-09                 | Vivaldi és a keringő ütemmutatója: nehéz → közepes.                                                                                                       |
| sport-07, sport-08                 | Tour de France helyszíne: közepes → könnyű; L alakban lépő huszár: nehéz → könnyű.                                                                        |
| sport-09                           | Teremröplabda létszám: nehéz → közepes.                                                                                                                   |
| animals-08, animals-09, animals-10 | Kolibri, tojásrakó emlős és császárpingvin élőhelye: nehéz → közepes.                                                                                     |

Az új vázlatoknál eltávolítottunk választ eláruló neveket, pontosítottuk a „pop királya” becenevet (nem művésznév), a bowling változatát és a jégkorong büntetőpadot. A waza-ari kérdésnél a karate nem maradt distraktor, mert ott is használják ezt a pontértéket. Ezek szerkesztési javítások, nem forrásauditként elszámolt esetek.

## Ismétlés és kompatibilitás

Az azonos megoldású, legalább 0,85 szóhalmaz-Jaccard-hasonlóságú kérdés párosként jelzett és a tartalomkapun elutasított. Ez csak mechanikus közelismétlés-szűrő: nem garantálja a szemantikailag azonos kérdés kizárását. Külön tényhez ugyanaz a válasz vagy azonos szerkezet más tényre nem önmagában hiba. A készlet átnézése a feltűnő ismétlésekre is kiterjedt.

Az eredeti 120 ID és helyes válaszszöveg a korábbi merge alapján rögzített digesttel tesztelt. A szerver régi aktív kérdése saját mentett opciósorrendjét és megoldóindexét használja, változatlan zárral és határidővel. A pontosított szöveg továbbra is ugyanarra a megoldásra vonatkozik. Nincs tartalom miatti szobareset, séma- vagy SQLite-migráció.

A partin belüli ID-ismétlés továbbra is tilos. Új partinál a meglévő `recentQuestionIds` legfeljebb 180 elemet őriz meg (korábban 60), az éppen játszott ID-k elöl. A még nem látott kérdés elsőbbsége, kategórián belüli nehézségi fallback és teljes kimerülés utáni működő újrafelhasználás megmarad. A meglévő 6/12/18 × Könnyed/Normál/Nehéz teljesparti-tesztek és az új history/rekonstrukció tesztek ellenőrzik ezt.

## Következő tartalmi lépés

Független magyar szerkesztővel tételes forrásellenőrzés, distraktorok és olvashatóság felülvizsgálata; csoportos próbák alapján szintkalibráció. Ezután a 450 körüli cél elérése újabb változatos, valóban ellenőrzött tényekkel. A mostani 312-es készlet nem kész emberileg auditált adatbázis.
