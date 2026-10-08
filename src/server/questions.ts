import { CATEGORIES, type Difficulty, type Question } from "../shared/game";
export type PublishedQuestion = Question & {
  status: "published";
  provenance: { reference: string; review: "automated-structure-only" };
};
// Evergreen factual starter content. Correct option is placed first here; server
// shuffles all options per round. These references aid review, not a claim of
// independent human fact checking. This module is NEVER imported by the client.
type Row = [string, string, string, string, string, string?];
const rows: Record<string, Row[]> = {
  geography: [
    [
      "Melyik ország fővárosa Párizs?",
      "Franciaország",
      "Olaszország",
      "Spanyolország",
      "Belgium",
    ],
    [
      "Melyik kontinensen fekszik Egyiptom területének nagy része?",
      "Afrika",
      "Európa",
      "Dél-Amerika",
      "Ausztrália",
    ],
    [
      "Melyik óceán a legnagyobb?",
      "Csendes-óceán",
      "Atlanti-óceán",
      "Indiai-óceán",
      "Jeges-tenger",
    ],
    [
      "Melyik ország fővárosa Canberra?",
      "Ausztrália",
      "Új-Zéland",
      "Kanada",
      "Dél-Afrika",
    ],
    ["Melyik folyó szeli át Londont?", "Temze", "Szajna", "Rajna", "Tiberis"],
    [
      "Melyik hegységben található a Mount Everest?",
      "Himalája",
      "Andok",
      "Alpok",
      "Kaukázus",
    ],
    [
      "Melyik országban található Machu Picchu?",
      "Peru",
      "Mexikó",
      "Brazília",
      "Chile",
    ],
    [
      "Melyik szoros választja el Európát Afrikától Gibraltárnál?",
      "Gibraltári-szoros",
      "Bering-szoros",
      "Malaka-szoros",
      "Hormuzi-szoros",
    ],
    [
      "Melyik tó osztozik Peru és Bolívia területén?",
      "Titicaca",
      "Balaton",
      "Bajkál",
      "Viktória-tó",
    ],
    [
      "Melyik ország veszi teljesen körül Lesothót?",
      "Dél-Afrika",
      "Kenya",
      "Egyiptom",
      "Namíbia",
    ],
  ],
  history: [
    [
      "Melyik civilizáció építette a gízai piramisokat?",
      "Ókori egyiptomi",
      "Ókori görög",
      "Római",
      "Viking",
    ],
    [
      "Melyik évben ért véget a második világháború?",
      "1945",
      "1939",
      "1918",
      "1956",
    ],
    [
      "Ki volt az első ember a Holdon?",
      "Neil Armstrong",
      "Jurij Gagarin",
      "Buzz Aldrin",
      "John Glenn",
    ],
    [
      "Melyik évben kezdődött a francia forradalom?",
      "1789",
      "1848",
      "1776",
      "1815",
    ],
    [
      "Melyik várost temette be a Vezúv i. sz. 79-ben?",
      "Pompeji",
      "Athén",
      "Karthágó",
      "Spárta",
    ],
    [
      "Melyik országban írták alá a Magna Cartát 1215-ben?",
      "Anglia",
      "Franciaország",
      "Spanyolország",
      "Svédország",
    ],
    [
      "Ki volt a mongol birodalom alapítója?",
      "Dzsingisz kán",
      "Nagy Sándor",
      "Attila",
      "I. Dareiosz",
    ],
    [
      "Melyik csatában szenvedett végső vereséget Napóleon 1815-ben?",
      "Waterloo",
      "Austerlitz",
      "Trafalgar",
      "Marathon",
    ],
    [
      "Melyik évben esett el Konstantinápoly az oszmánok előtt?",
      "1453",
      "1492",
      "1526",
      "1204",
    ],
    [
      "Ki vezette az első világ körüli hajóút hazatérő szakaszát?",
      "Juan Sebastián Elcano",
      "Kolumbusz Kristóf",
      "Vasco da Gama",
      "James Cook",
    ],
  ],
  film: [
    [
      "Mi a neve a Star Wars zöld, bölcs jedimesterének?",
      "Yoda",
      "Gandalf",
      "Spock",
      "Dobby",
    ],
    [
      "Melyik filmben szerepel Simba?",
      "Az oroszlánkirály",
      "Shrek",
      "Jégvarázs",
      "Aladdin",
    ],
    [
      "Mi a neve Harry Potter iskolájának magyarul?",
      "Roxfort",
      "Narnia",
      "Mordor",
      "Gotham",
    ],
    [
      "Ki rendezte az 1997-es Titanic című filmet?",
      "James Cameron",
      "Steven Spielberg",
      "George Lucas",
      "Christopher Nolan",
    ],
    [
      "Melyik városban játszódik főként a Jóbarátok?",
      "New York",
      "Los Angeles",
      "Chicago",
      "Seattle",
    ],
    [
      "Mi a neve A Gyűrűk Ura hobbitjának, aki a gyűrűt viszi?",
      "Frodó",
      "Bilbó",
      "Aragorn",
      "Legolas",
    ],
    [
      "Melyik filmben szerepel a DeLorean időgép?",
      "Vissza a jövőbe",
      "Jurassic Park",
      "Mátrix",
      "Terminátor",
    ],
    [
      "Ki rendezte a Spirited Away – Chihiro Szellemországban című filmet?",
      "Mijazaki Hajao",
      "Kuroszava Akira",
      "Satoshi Kon",
      "Isao Takahata",
    ],
    [
      "Melyik színész alakítja Jack Sparrow-t A Karib-tenger kalózaiban?",
      "Johnny Depp",
      "Orlando Bloom",
      "Brad Pitt",
      "Tom Hanks",
    ],
    [
      "Mi a neve az Alien filmek űrhajójának az első részben?",
      "Nostromo",
      "Enterprise",
      "Millennium Falcon",
      "Discovery",
    ],
  ],
  music: [
    [
      "Hány húrja van egy szokásos gitárnak?",
      "Hat",
      "Négy",
      "Nyolc",
      "Tizenkettő",
    ],
    [
      "Melyik zenekar tagja volt Freddie Mercury?",
      "Queen",
      "The Beatles",
      "ABBA",
      "Nirvana",
    ],
    [
      "Melyik hangszernek vannak fekete és fehér billentyűi?",
      "Zongora",
      "Hegedű",
      "Trombita",
      "Dob",
    ],
    [
      "Melyik városból indult a Beatles?",
      "Liverpool",
      "London",
      "Manchester",
      "Glasgow",
    ],
    [
      "Ki komponálta A varázsfuvolát?",
      "Wolfgang Amadeus Mozart",
      "Ludwig van Beethoven",
      "Johann Sebastian Bach",
      "Giuseppe Verdi",
    ],
    [
      "Melyik országból származik az ABBA?",
      "Svédország",
      "Norvégia",
      "Dánia",
      "Finnország",
    ],
    [
      "Melyik kulcsot használják leggyakrabban a hegedű szólamához?",
      "Violinkulcs",
      "Basszuskulcs",
      "Altkulcs",
      "Tenorkulcs",
    ],
    [
      "Ki komponálta a Négy évszak hegedűversenyeket?",
      "Antonio Vivaldi",
      "Frédéric Chopin",
      "Richard Wagner",
      "Claude Debussy",
    ],
    [
      "Melyik ütemmutató jellemző a klasszikus keringőre?",
      "3/4",
      "4/4",
      "2/4",
      "5/4",
    ],
    [
      "Hány félhangból áll egy tiszta oktáv?",
      "Tizenkettő",
      "Hét",
      "Nyolc",
      "Tíz",
    ],
  ],
  science: [
    ["Mi a víz kémiai képlete?", "H₂O", "CO₂", "O₂", "NaCl"],
    [
      "Melyik bolygót nevezik vörös bolygónak?",
      "Mars",
      "Vénusz",
      "Jupiter",
      "Merkúr",
    ],
    ["Melyik szerv pumpálja a vért?", "Szív", "Tüdő", "Máj", "Vese"],
    ["Mi a vas vegyjele?", "Fe", "Au", "Ag", "Cu"],
    [
      "Melyik bolygó a Naprendszer legnagyobb bolygója?",
      "Jupiter",
      "Szaturnusz",
      "Neptunusz",
      "Föld",
    ],
    [
      "Mi a növények fényenergiát hasznosító, cukrot előállító folyamatának neve?",
      "Fotoszintézis",
      "Párolgás",
      "Erjedés",
      "Lepárlás",
    ],
    [
      "Melyik részecske hordoz negatív elektromos töltést?",
      "Elektron",
      "Proton",
      "Neutron",
      "Foton",
    ],
    [
      "Mi az elektromos ellenállás SI-mértékegysége?",
      "Ohm",
      "Volt",
      "Amper",
      "Watt",
    ],
    [
      "Melyik szerv termeli az inzulint?",
      "Hasnyálmirigy",
      "Lép",
      "Epehólyag",
      "Pajzsmirigy",
    ],
    [
      "Melyik fizikai mennyiség SI-mértékegysége a pascal?",
      "Nyomás",
      "Energia",
      "Teljesítmény",
      "Elektromos töltés",
    ],
  ],
  animals: [
    [
      "Melyik állat fekete-fehér csíkos?",
      "Zebra",
      "Zsiráf",
      "Oroszlán",
      "Víziló",
    ],
    ["Hány lába van egy rovarnak?", "Hat", "Négy", "Nyolc", "Tíz"],
    [
      "Melyik állat készít mézet?",
      "Mézelő méh",
      "Hangya",
      "Pillangó",
      "Szitakötő",
    ],
    [
      "Melyik csoportba tartoznak a delfinek?",
      "Emlősök",
      "Halak",
      "Hüllők",
      "Kétéltűek",
    ],
    [
      "Melyik a legnagyobb ma élő állatfaj?",
      "Kék bálna",
      "Afrikai elefánt",
      "Zsiráf",
      "Óriáskalmár",
    ],
    [
      "Melyik emlős képes aktív repülésre?",
      "Denevér",
      "Repülőmókus",
      "Koala",
      "Lajhár",
    ],
    ["Hány szíve van egy polipnak?", "Három", "Egy", "Kettő", "Négy"],
    [
      "Melyik madár tud hátrafelé is repülni?",
      "Kolibri",
      "Strucc",
      "Pingvin",
      "Albatrosz",
    ],
    ["Melyik emlős rak tojást?", "Kacsacsőrű emlős", "Delfin", "Vidra", "Hód"],
    [
      "Melyik élőhelyen él természetesen a császárpingvin?",
      "Antarktisz",
      "Szahara",
      "Amazonas-medence",
      "Himalája",
    ],
  ],
  food: [
    [
      "Melyik gyümölcsből készül hagyományosan a bor?",
      "Szőlő",
      "Banán",
      "Ananász",
      "Körte",
    ],
    [
      "Melyik ország konyhájához kötődik a pizza?",
      "Olaszország",
      "Japán",
      "India",
      "Svédország",
    ],
    [
      "Melyik összetevő adja a csokoládé jellegzetes alapját?",
      "Kakaó",
      "Kávé",
      "Vanília",
      "Fahéj",
    ],
    [
      "Miből készül a hagyományos tofu?",
      "Szójababból",
      "Burgonyából",
      "Tejből",
      "Rizsből",
    ],
    [
      "Melyik gabonából készül a kuszkusz hagyományosan?",
      "Durumbúzából",
      "Rozsból",
      "Rizsből",
      "Zabból",
    ],
    [
      "Melyik étel fő összetevője a csicseriborsó?",
      "Hummusz",
      "Pesto",
      "Guacamole",
      "Tzatziki",
    ],
    [
      "Miből készül az őrölt fűszerpaprika?",
      "Szárított paprikatermésből",
      "Szárított hagymalevélből",
      "Őrölt kávébabból",
      "Reszelt gyömbérgyökérből",
    ],
    [
      "Melyik virág bibéjéből készül a sáfrány?",
      "Sáfránykrókusz",
      "Rózsa",
      "Napraforgó",
      "Tulipán",
    ],
    [
      "Melyik olasz desszert neve jelent szó szerint „főtt tejszínt”?",
      "Panna cotta",
      "Tiramisù",
      "Cannoli",
      "Gelato",
    ],
    [
      "Melyik francia kék sajtot érlelik hagyományosan a Combalou-hegy barlangjaiban?",
      "Roquefort",
      "Cheddar",
      "Mozzarella",
      "Gouda",
    ],
  ],
  sport: [
    [
      "Hány játékos van egy labdarúgócsapatban a pályán a mérkőzés kezdetén?",
      "Tizenegy",
      "Kilenc",
      "Hét",
      "Tizenhárom",
    ],
    [
      "Melyik sporthoz tartozik a kosárra dobás?",
      "Kosárlabda",
      "Kézilabda",
      "Rögbi",
      "Röplabda",
    ],
    [
      "Melyik sportban használnak ütőt és tollaslabdát?",
      "Tollaslabda",
      "Tenisz",
      "Squash",
      "Asztalitenisz",
    ],
    [
      "Milyen hosszú a maratoni futóverseny hivatalos távja?",
      "42,195 km",
      "40 km",
      "21,0975 km",
      "50 km",
    ],
    ["Hány karika szerepel az olimpiai jelképen?", "Öt", "Négy", "Hat", "Hét"],
    [
      "Melyik Grand Slam tenisztornát játsszák füvön?",
      "Wimbledon",
      "Roland Garros",
      "US Open",
      "Australian Open",
    ],
    [
      "Melyik országban rendezik a Tour de France nagy részét?",
      "Franciaország",
      "Spanyolország",
      "Olaszország",
      "Belgium",
    ],
    ["Melyik sakkfigura lép L alakban?", "Huszár", "Futó", "Bástya", "Vezér"],
    [
      "Hány játékos van egy röplabdacsapatban egyszerre a pályán a szabályos teremröplabdában?",
      "Hat",
      "Öt",
      "Hét",
      "Nyolc",
    ],
    [
      "Melyik úszásnemben kötelező a vízből egyszerre előrevinni mindkét kart?",
      "Pillangóúszás",
      "Gyorsúszás",
      "Hátúszás",
      "Mellúszás",
    ],
  ],
  games: [
    [
      "Melyik játék főhőse egy bajuszos, piros sapkás vízvezeték-szerelő?",
      "Super Mario",
      "Sonic",
      "Pac-Man",
      "Kirby",
    ],
    [
      "Melyik játékban építhetsz blokkokból egy procedurális világban?",
      "Minecraft",
      "Tetris",
      "FIFA",
      "Street Fighter",
    ],
    [
      "Melyik játékban kell leeső alakzatokból sorokat kirakni?",
      "Tetris",
      "Doom",
      "Portal",
      "Civilization",
    ],
    [
      "Ki a The Legend of Zelda játékok legtöbb részének játszható hőse?",
      "Link",
      "Zelda",
      "Ganondorf",
      "Epona",
    ],
    [
      "Melyik cég alkotta meg a Pokémon első videojátékait?",
      "Game Freak",
      "Valve",
      "Bungie",
      "id Software",
    ],
    [
      "Melyik játékban van GLaDOS nevű mesterséges intelligencia?",
      "Portal",
      "Half-Life",
      "Halo",
      "BioShock",
    ],
    [
      "Melyik sorozatban szerepel a Master Chief?",
      "Halo",
      "Mass Effect",
      "Fallout",
      "Metal Gear",
    ],
    [
      "Ki fejlesztette eredetileg egyedül a Stardew Valley játékot?",
      "ConcernedApe",
      "Shigeru Miyamoto",
      "Hideo Kojima",
      "Gabe Newell",
    ],
    [
      "Mi a Hades című 2020-as játék főhősének neve?",
      "Zagreusz",
      "Kratosz",
      "Atreusz",
      "Hermész",
    ],
    [
      "Melyik cég készítette az eredeti 1993-as Doom játékot?",
      "id Software",
      "Valve",
      "Blizzard",
      "Rare",
    ],
  ],
  hungary: [
    [
      "Melyik város Magyarország fővárosa?",
      "Budapest",
      "Debrecen",
      "Szeged",
      "Pécs",
    ],
    [
      "Melyik Magyarország legnagyobb tava?",
      "Balaton",
      "Velencei-tó",
      "Fertő tó",
      "Tisza-tó",
    ],
    [
      "Milyen színek szerepelnek a magyar zászlón felülről lefelé?",
      "Piros, fehér, zöld",
      "Zöld, fehér, piros",
      "Piros, zöld, fehér",
      "Fehér, piros, zöld",
    ],
    [
      "Ki írta a Himnusz szövegét?",
      "Kölcsey Ferenc",
      "Petőfi Sándor",
      "Arany János",
      "Vörösmarty Mihály",
    ],
    [
      "Melyik Magyarország legmagasabb csúcsa?",
      "Kékes",
      "Dobogó-kő",
      "Írott-kő",
      "Galyatető",
    ],
    [
      "Ki szerezte a Himnusz zenéjét?",
      "Erkel Ferenc",
      "Liszt Ferenc",
      "Bartók Béla",
      "Kodály Zoltán",
    ],
    [
      "Melyik városhoz kötődik a Zsolnay Porcelánmanufaktúra?",
      "Pécs",
      "Győr",
      "Eger",
      "Sopron",
    ],
    [
      "Melyik évben egyesült Pest, Buda és Óbuda Budapestté?",
      "1873",
      "1848",
      "1896",
      "1920",
    ],
    [
      "Melyik folyó torkollik a Tiszába Szegednél?",
      "Maros",
      "Dráva",
      "Rába",
      "Ipoly",
    ],
    [
      "Ki kapott 1937-ben orvosi-élettani Nobel-díjat?",
      "Szent-Györgyi Albert",
      "Békésy György",
      "Semmelweis Ignác",
      "Richter Gedeon",
    ],
  ],
  culture: [
    [
      "Mi a neve a Disney híres rajzolt egérfigurájának?",
      "Mickey egér",
      "Donald kacsa",
      "Goofy",
      "Pluto",
    ],
    [
      "Melyik képregényhős civil neve Bruce Wayne?",
      "Batman",
      "Superman",
      "Pókember",
      "Vasember",
    ],
    [
      "Melyik színű a legtöbb változatban Hupikék törpikék bőre?",
      "Kék",
      "Zöld",
      "Lila",
      "Sárga",
    ],
    [
      "Ki írta A hobbit című regényt?",
      "J. R. R. Tolkien",
      "C. S. Lewis",
      "J. K. Rowling",
      "George Orwell",
    ],
    ["Mi Sherlock Holmes londoni címének házszáma?", "221B", "42", "10", "13A"],
    [
      "Melyik képregényhős használja a Mjölnir nevű kalapácsot?",
      "Thor",
      "Hulk",
      "Flash",
      "Aquaman",
    ],
    [
      "Melyik országból származik a LEGO?",
      "Dánia",
      "Svédország",
      "Németország",
      "Hollandia",
    ],
    [
      "Ki írta a Galaxis útikalauz stopposoknak című regényt?",
      "Douglas Adams",
      "Isaac Asimov",
      "Arthur C. Clarke",
      "Ray Bradbury",
    ],
    [
      "Melyik festő alkotta meg A csillagos éj című képet?",
      "Vincent van Gogh",
      "Claude Monet",
      "Pablo Picasso",
      "Salvador Dalí",
    ],
    [
      "Melyik regényben szerepel Winston Smith?",
      "1984",
      "Szép új világ",
      "Fahrenheit 451",
      "Állatfarm",
    ],
  ],
  mixed: [
    ["Hány oldala van egy háromszögnek?", "Három", "Négy", "Öt", "Hat"],
    ["Hány perc van egy órában?", "Hatvan", "Harminc", "Kilencven", "Száz"],
    [
      "Melyik irányba mutat az iránytű északi vége?",
      "Mágneses észak felé",
      "Mindig kelet felé",
      "Mindig dél felé",
      "Mindig nyugat felé",
    ],
    ["Melyik római szám jelöli az ötvenet?", "L", "X", "C", "D"],
    [
      "Hány mezőből áll egy szabályos sakktábla?",
      "Hatvannégy",
      "Ötvenhat",
      "Hetvenkettő",
      "Nyolcvanegy",
    ],
    [
      "Milyen írásrendszerben használják a Braille-pontokat?",
      "Tapintással olvasható írás",
      "Gyorsírás",
      "Morzekód",
      "Hieroglif írás",
    ],
    [
      "Melyik geometriai alakzatnak nincs sarka?",
      "Kör",
      "Négyzet",
      "Háromszög",
      "Trapéz",
    ],
    [
      "Melyik SI-előtag jelent egymilliomod részt?",
      "Mikro",
      "Milli",
      "Nano",
      "Kilo",
    ],
    ["Hány fok a hatszög belső szögeinek összege?", "720", "540", "360", "900"],
    [
      "Melyik SI-előtag jelent 10¹²-szeres szorzót?",
      "Tera",
      "Giga",
      "Mega",
      "Peta",
    ],
  ],
};
const references: Record<string, string> = {
  geography: "https://www.britannica.com/science/geography",
  history: "https://www.britannica.com/topic/history",
  film: "https://www.bfi.org.uk/",
  music: "https://www.britannica.com/art/music",
  science: "https://www.britannica.com/science/science",
  animals: "https://animaldiversity.org/",
  food: "https://www.britannica.com/topic/food",
  sport: "https://olympics.com/",
  games: "https://www.britannica.com/topic/electronic-game",
  hungary: "https://www.britannica.com/place/Hungary",
  culture: "https://www.britannica.com/art/literature",
  mixed: "https://www.bipm.org/en/measurement-units",
};
export const QUESTIONS: PublishedQuestion[] = CATEGORIES.flatMap((category) =>
  rows[category.id].map((row, index) => ({
    id: `${category.id}-${String(index + 1).padStart(2, "0")}`,
    categoryId: category.id,
    difficulty: (index < 3
      ? "easy"
      : index < 7
        ? "normal"
        : "hard") as Difficulty,
    type: "text" as const,
    prompt: row[0],
    options: row.slice(1, 5) as string[],
    correctIndex: 0,
    explanation: row[5] ?? `A helyes válasz: ${row[1]}.`,
    status: "published" as const,
    provenance: {
      reference: references[category.id],
      review: "automated-structure-only" as const,
    },
  })),
);
export function validateBank(questions: PublishedQuestion[]): void {
  const ids = new Set<string>(),
    prompts = new Set<string>();
  for (const q of questions) {
    if (
      ids.has(q.id) ||
      prompts.has(q.prompt) ||
      !CATEGORIES.some((c) => c.id === q.categoryId) ||
      !["easy", "normal", "hard"].includes(q.difficulty) ||
      q.status !== "published" ||
      !q.provenance.reference.startsWith("https://")
    )
      throw new Error(`Invalid question metadata: ${q.id}`);
    if (
      q.type !== "text" ||
      q.options.length !== 4 ||
      new Set(q.options).size !== 4 ||
      q.options.some((o) => !o.trim()) ||
      !Number.isInteger(q.correctIndex) ||
      q.correctIndex < 0 ||
      q.correctIndex >= q.options.length ||
      !q.prompt.trim()
    )
      throw new Error(`Invalid question options: ${q.id}`);
    ids.add(q.id);
    prompts.add(q.prompt);
  }
}
validateBank(QUESTIONS);
export const questionById = (id: string) => {
  const q = QUESTIONS.find((q) => q.id === id);
  if (!q) throw new Error(`Missing published question ${id}`);
  return q;
};
