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

## Bezpieczeństwo i prawo

Dwie rzeczy wbudowane w kod, nie w regulamin:

**1. Kopia zapasowa jest obowiązkowa.** Przycisk zapisu jest nieaktywny, dopóki nie zostanie pobrany
plik z aktualną zawartością pamięci radia.

**2. Kanały bez prawa nadawania trafiają do radia z zablokowanym nadajnikiem.** Zapisujemy wtedy
`0xFFFFFFFF` w polu częstotliwości nadawania, co radio egzekwuje sprzętowo.

Dotyczy to w szczególności:

| Zakres | Limit mocy | Baofeng | Wniosek |
|---|---|---|---|
| PMR446 | 0,5 W, antena nieodłączalna | min. 1 W, antena na SMA | tylko odbiór |
| LPD433 | 10 mW | min. 1 W | tylko odbiór |
| Pasma amatorskie | — | — | nadawanie po potwierdzeniu pozwolenia |
| PMR-154 | 1 W | — | wymaga zezwolenia UKE |

Zestawów oznaczonych jako `receive-only` nie da się odblokować żadną opcją w interfejsie. To celowe.

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
src/data/bands.ts           zestawy częstotliwości z notatkami prawnymi
src/data/build-channels.ts  jedyne miejsce, gdzie zapada decyzja o prawie do nadawania
src/ui/                     kreator, trzy ekrany
```

## Czego tu nie ma

Edytora tabeli kanałów (od tego jest CHIRP), wgrywania firmware'u, obsługi DMR, kont użytkownika.

Brakuje też **zestawów służb i przemienników amatorskich per miasto**. To dane, których nie wolno
zgadywać: kanał obok właściwego oznacza radio milczące, a użytkownik uzna, że narzędzie nie działa.
Wejdą dopiero ze zweryfikowanego źródła.

## Podziękowania i licencja

Format pamięci i protokół szeregowy ustalone na podstawie sterownika
[CHIRP](https://chirpmyradio.com) `chirp/drivers/uv5r.py` — bez tej pracy ten projekt nie mógłby
powstać.

Kod na licencji **GPL-3.0**, tak jak CHIRP.
