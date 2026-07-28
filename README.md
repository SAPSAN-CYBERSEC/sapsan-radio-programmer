# Programator krótkofalówek Baofeng

Ustawianie kanałów w radiu Baofeng prosto z przeglądarki. Bez instalowania Pythona, bez CHIRP-a,
bez płyty CD z 2011 roku.

**Stan: wczesna wersja robocza. Nie testowana jeszcze na fizycznym radiu.**

## Po co to

CHIRP jest znakomity i obsługuje setkę modeli, ale wymaga instalacji i wygląda jak arkusz
kalkulacyjny. Ktoś, kto właśnie kupił pierwszą krótkofalówkę, nie chce edytora pamięci — chce, żeby
radio po prostu miało w środku kanały, których będzie słuchał.

Trzy ekrany: podłącz radio, wybierz zestawy kanałów, zapisz.

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

**Zapisujemy tylko obszar kanałów i nazw**, nie całą pamięć. Ustawienia radia zostają nietknięte,
a obszar pomocniczy od 0x1EC0 (limity pasm, komunikat powitalny) nie jest nawet czytany.

Program nie ogranicza tego, co można wpisać do radia. Jedna informacja o zgodności z lokalnymi
przepisami stoi na stronie głównej — reszta to decyzja użytkownika.

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
src/ui/                     kreator, trzy ekrany
```

## Czego tu nie ma

Edytora tabeli kanałów (od tego jest CHIRP), wgrywania firmware'u, obsługi DMR, kont użytkownika.

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
