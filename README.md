# Programator krótkofalówek Baofeng

Ustawianie kanałów w radiu Baofeng prosto z przeglądarki. Bez instalowania Pythona, bez CHIRP-a,
bez płyty CD z 2011 roku.

**Stan: wczesna wersja robocza. Nie testowana jeszcze na fizycznym radiu.**

## Po co to

CHIRP jest znakomity i obsługuje setkę modeli, ale wymaga instalacji i wygląda jak arkusz
kalkulacyjny. Ktoś, kto właśnie kupił pierwszą krótkofalówkę, nie chce edytora pamięci — chce, żeby
radio po prostu miało w środku kanały, których będzie słuchał.

Cztery ekrany: podłącz radio, wybierz zestawy kanałów, **sprawdź i popraw arkusz**, zapisz.

Arkusz jest po to, żeby narzędzie było użyteczne, a nie tylko wygodne: wybrane zestawy są punktem
wyjścia, nie ostatnim słowem. Można dopisać własną częstotliwość, zmienić nazwę, ustawić ton CTCSS
dla przemiennika, wyrzucić niepotrzebne kanały albo wyczyścić wszystko i zbudować listę od zera.

Częstotliwość spoza pasma radia dostaje ostrzeżenie, ale **nie blokuje zapisu** — to decyzja
użytkownika, nie nasza.

## Jak to działa

Web Serial API. Przeglądarka otwiera port szeregowy (9600 8N1), wysyła sekwencję powitalną, czyta
pamięć radia blokami po 64 bajty, my podmieniamy obszar kanałów i zapisujemy blokami po 16 bajtów.

**Zero backendu.** Wszystko liczy się lokalnie, ustawienia radia nigdzie nie wychodzą.

### Wymagania

- Przeglądarka na silniku Chromium: Chrome, Edge, Opera, Brave. Firefox i Safari nie obsługują Web Serial.
- Kabel programujący do gniazda Kenwood (dwa wtyki jack).
- **Sterownik przejściówki USB zainstalowany w systemie.** Web Serial widzi tylko porty, które
  system już wystawił — tego nie da się obejść. CH340 działa na Windows 10/11 i macOS bez zabaw.
  Podrabiane układy Prolific PL2303 są blokowane przez Windows 11 i tego nie naprawimy.

## Sprawdzone na sprzęcie

**2026-07-28, Baofeng UV-82, kabel z układem CH340 (`/dev/cu.wchusbserial1410`), macOS.**
Przeszedł pełny cykl: odczyt → zapis PMR446 → odczyt kontrolny → przywrócenie kopii → odczyt
kontrolny. Obraz po przywróceniu zgadza się z kopią bajt w bajt.

Zmierzone czasy: odczyt 6144 bajtów ~8 s, zapis ~13 s.

Cztery rzeczy ustalone na sprzęcie, wszystkie już w kodzie:

- **Radio nie odpowiada na powitanie wysłane natychmiast po otwarciu portu.** Potrzebna jest
  pauza, zanim pójdą bajty magiczne (`PORT_SETTLE_MS`).
- **DTR i RTS muszą być aktywne jednocześnie.** Przy każdej innej kombinacji radio milczy.
  Web Serial ustawia je domyślnie, więc w przeglądarce działa to samo z siebie.
- **Radio, które dostanie nie swoją sekwencję powitalną, milknie na kilkanaście sekund.** Ani
  czekanie, ani ponowne otwarcie portu po sekundzie go nie odblokowuje. Dlatego **model wybiera
  użytkownik**, a nie zgadujemy go po kolei — wysyłamy jedną sekwencję i koniec.
- **Po zapisie radio kończy sesję i nie odpowiada na odczyt od razu.** Weryfikacja wymaga
  zamknięcia portu na ~4 s (`RECONNECT_PAUSE_MS`); przy sekundzie radio jeszcze milczy.

Narzędzia do powtórzenia prób poza przeglądarką, wszystkie na tym samym kodzie protokołu:

```bash
node --experimental-strip-types tools/hw-test.ts            # sam odczyt
node --experimental-strip-types tools/hw-test.ts --write     # pełny cykl z zapisem
node --experimental-strip-types tools/hw-restore.ts plik.img # przywrócenie kopii
python3 tools/radio_probe.py                                 # próba bez Node, tylko odczyt
```

## Obsługiwane radia

Faza 1 to jedna rodzina protokołu, która pokrywa:

`UV-5R` · `UV-5RA` · `UV-5RB` · `UV-5RC` · `UV-82` · `BF-F8` · `GT-3` · `UV-6R` · `P15UV`

Rozpoznanie modelu następuje po sekwencji powitalnej — jeśli radio nie odpowie żadną ze znanych,
program się zatrzyma zamiast zgadywać.

## Kraje i języki

Interfejs startuje **po angielsku**, do wyboru są też polski, niemiecki i czeski.

Zestawy częstotliwości filtrują się po wybranym kraju, żeby lista nie była śmietnikiem:

| Kraj | Zestawy |
|---|---|
| 🇺🇸 USA | FRS/GMRS (22), MURS (5), 2 m i 70 cm wg ARRL |
| 🇵🇱 Polska | PMR446, LPD433, PMR-154, 2 m i 70 cm wg IARU R1, **służby** |
| 🇩🇪 Niemcy | PMR446, LPD433, Freenet (6), 2 m i 70 cm wg IARU R1 |
| 🇨🇿 Czechy | PMR446, LPD433, 2 m i 70 cm wg IARU R1 |

### Polskie służby

Po wybraniu Polski pojawia się trzeci selektor — **miejscowość**. Kanały policji, straży pożarnej,
pogotowia i straży miejskiej są przypisane do konkretnych miast, więc bez wskazania miejsca lista
byłaby bezużyteczna.

Dane obejmują **416 miejscowości i województw**. Niezależnie od miejsca dostępne są zestawy
ogólnokrajowe: numerowane kanały straży pożarnej (53), pasmo morskie VHF (90), PKP (37), straż
graniczna (41), sieć zarządzania kryzysowego (56), Lasy Państwowe (13), ratownictwo górskie i
wodne (30).

Dane nie są przepisywane ręcznie — wyciąga je `tools/parse_sluzby.py` i `tools/build_sluzby.py`
do `src/data/services-pl.json`. Skrypty obchodzą dwie pułapki źródła: atrybut `num=` w HTML nie
odpowiada wyświetlanej wartości (śmieć po eksporcie z Excela), a wiersze nagłówkowe zawierają
granice pasm udające kanały.

Nie weszły strony `Inne miasta Polski` i `PSP BF171` — mają sklejone komórki, z których nie da się
odtworzyć, która częstotliwość należy do którego miasta. Zgadywanie tutaj daje radio, które milczy.

## Bezpieczeństwo

**Kopia zapasowa jest obowiązkowa.** Przycisk zapisu jest nieaktywny, dopóki nie zostanie pobrany
plik z aktualną zawartością pamięci radia.

**Przywracanie działa w obie strony.** Sekcja „przywróć z kopii" jest widoczna od chwili
połączenia, nie na końcu kreatora — kto po nią sięga, zwykle już ma problem. Plik jest sprawdzany
przed wysłaniem: zły rozmiar albo zawartość niepasująca do formatu UV-5R zatrzymuje operację.

**Zapis jest weryfikowany odczytem.** Radio potwierdza każdy blok bajtem ACK, ale to znaczy tylko
„odebrałem", nie „zapisałem poprawnie". Po zapisie czytamy zapisane obszary i porównujemy bajt po
bajcie. Nieudany odczyt jest komunikowany inaczej niż niezgodność — to dwie różne sytuacje.

**Zamknięcie karty w trakcie zapisu jest blokowane** ostrzeżeniem przeglądarki.

**Zapisujemy tylko obszar kanałów i nazw**, nie całą pamięć. Ustawienia radia zostają nietknięte,
a obszar pomocniczy od 0x1EC0 (limity pasm, komunikat powitalny) nie jest nawet czytany.

Program nie ogranicza tego, co można wpisać do radia. Jedna informacja o zgodności z lokalnymi
przepisami stoi na stronie głównej — reszta to decyzja użytkownika.

## Pułapka przy pisaniu kodu

Testy chodzą na `node --experimental-strip-types`, który **nie parsuje skróconych właściwości
konstruktora** (`constructor(private readonly x: T) {}`). Napotkanie takiego zapisu wywala cały plik
testowy z `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, i to zanim wykona się choć jeden test. Pola
deklarujemy jawnie.

## Uruchomienie

```bash
npm install
npm run dev      # serwer deweloperski
npm test         # testy kodowania pamięci
npm run build    # wersja produkcyjna
```

## Struktura

```
src/radio/uv5r-memory.ts    mapa pamięci, kodowanie kanałów i nazw
src/radio/uv5r-protocol.ts  protokół szeregowy: powitanie, odczyt, zapis
src/radio/web-serial.ts     transport Web Serial
src/data/bands.ts           zestawy częstotliwości pogrupowane po krajach
src/data/build-channels.ts  składanie wybranych zestawów w listę kanałów
src/data/services.ts        polskie służby, zestawy lokalne i krajowe
src/data/services-pl.json   dane wygenerowane przez tools/ (nie edytować ręcznie)
src/i18n/                   tłumaczenia EN / PL / DE / CS
tools/                      skrypty wyciągające dane ze źródła
src/ui/sheet.ts             arkusz kanałów: edycja, walidacja wpisów
src/ui/                     kreator, cztery ekrany
```

## Czego tu nie ma

Ustawień radia (squelch, VOX, podświetlenie, timeout i kilkadziesiąt innych pól — tam CHIRP ma
piętnaście lat przewagi), wgrywania firmware'u, obsługi DMR, kont użytkownika.

Brakuje **przemienników amatorskich per miasto** oraz służb w Niemczech, Czechach i USA — te dane
wejdą, gdy znajdzie się dla nich źródło tej samej jakości co polskie.

## Źródła danych

PMR446, LPD433, PMR-154 oraz wszystkie polskie służby — [`czestotliwosci.pl.tl`](https://czestotliwosci.pl.tl).
Freenet — BNetzA. FRS/GMRS i MURS — FCC via RadioReference. Pasma amatorskie — bandplan
IARU Region 1 (Europa) i ARRL (USA).

## Podziękowania i licencja

Format pamięci i protokół szeregowy ustalone na podstawie sterownika
[CHIRP](https://chirpmyradio.com) `chirp/drivers/uv5r.py` — bez tej pracy ten projekt nie mógłby
powstać.

Kod na licencji **GPL-3.0**, tak jak CHIRP.
