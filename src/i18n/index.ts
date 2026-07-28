/**
 * Tlumaczenia interfejsu. Domyslny jezyk to angielski - narzedzie jest miedzynarodowe,
 * a polski jest jednym z czterech, nie punktem wyjscia.
 */

export type Lang = 'en' | 'pl' | 'de' | 'cs';

export const LANGS: Array<{ code: Lang; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
  { code: 'de', label: 'Deutsch' },
  { code: 'cs', label: 'Čeština' },
];

/** Jeden zestaw czestotliwosci: nazwa i jedno zdanie opisu. */
type SetText = { label: string; desc: string };

interface Dict {
  title: string;
  subtitle: string;
  /** Jedna informacja o odpowiedzialnosci, na stronie glownej. */
  legal: string;
  country: string;
  language: string;
  place: string;
  placeNone: string;
  placeHint: string;
  showFreqs: (n: number) => string;

  restoreTitle: string;
  restoreLead: string;
  restoreDo: string;
  restoring: string;
  restoreDone: string;
  restoreBadFile: string;
  verifying: string;
  verifyOk: string;
  verifyFail: string;
  verifySkipped: string;
  leaveWarning: string;

  step1: string;
  connectHint1: string;
  connectHint2: string;
  connectHint3: string;
  connect: string;
  connecting: string;
  browserWarning: string;

  step2: string;
  chooseLead: string;
  nothingSelected: string;
  selectedOf: (n: number, max: number) => string;
  tooMany: (n: number, max: number) => string;
  next: string;

  step3: string;
  backupLead: string;
  makeBackup: string;
  backupDone: string;
  write: string;
  writing: string;
  dontUnplug: string;

  doneTitle: string;
  doneText: (n: number) => string;
  doneDropped: (n: number) => string;
  doneRestart: string;
  again: string;

  errGeneric: string;
  sets: Record<string, SetText>;
  countries: Record<string, string>;
}

const en: Dict = {
  title: 'Radio programmer',
  subtitle: 'Set up channels in your Baofeng straight from the browser. Nothing to install.',
  legal:
    'Use your radio in line with the rules that apply where you are. Power limits, allowed bands and licensing differ from country to country.',
  country: 'Country',
  language: 'Language',

  step1: 'Connect the radio',
  connectHint1: 'Push the cable plug into the radio until it clicks.',
  connectHint2: 'Turn the radio on and set the volume to about half.',
  connectHint3: 'Plug the other end into your computer.',
  connect: 'Connect radio',
  connecting: 'Connecting...',
  browserWarning:
    'This browser cannot talk to the radio. Open the page in Chrome, Edge, Opera or Brave.',

  step2: 'Pick what goes into the radio',
  chooseLead: 'Select as many sets as you like.',
  nothingSelected: 'Nothing selected yet.',
  selectedOf: (n, max) => `${n} of ${max} channel slots used.`,
  tooMany: (n, max) => `${n} channels selected but the radio holds ${max}. The rest will not fit.`,
  next: 'Next',

  step3: 'Write to the radio',
  backupLead:
    'First we save what is in the radio right now. If anything goes wrong, you can put it back.',
  makeBackup: 'Save a backup',
  backupDone: 'Backup saved to your Downloads folder. Keep that file.',
  write: 'Write channels to radio',
  writing: 'Writing...',
  dontUnplug: 'Do not unplug the cable or switch the radio off while writing.',

  doneTitle: 'Done',
  doneText: (n) => `${n} channels written.`,
  doneDropped: (n) => `${n} channels did not fit.`,
  doneRestart: 'Switch the radio off and on again to see the new channels.',
  again: 'Set up again',

  errGeneric: 'Something went wrong. Unplug the cable, restart the radio and start again.',

  sets: {
    pmr446: {
      label: 'PMR446',
      desc: 'European licence-free handheld channels, 16 channels around 446 MHz.',
    },
    lpd433: { label: 'LPD433', desc: 'Older European low-power channels, 69 channels at 433 MHz.' },
    pmr154: { label: 'PMR-154', desc: 'Polish VHF business allocation, four channels.' },
    freenet: { label: 'Freenet', desc: 'German VHF allocation, six channels around 149 MHz.' },
    frsGmrs: { label: 'FRS / GMRS', desc: 'US handheld channels, all 22 channels.' },
    murs: { label: 'MURS', desc: 'US VHF allocation, five channels including Blue and Green Dot.' },
    ham2mEu: { label: '2 m amateur (Europe)', desc: 'IARU R1 simplex, calling channel 145.500.' },
    ham70cmEu: { label: '70 cm amateur (Europe)', desc: 'IARU R1 simplex, calling channel 433.500.' },
    ham2mUs: { label: '2 m amateur (US)', desc: 'ARRL simplex, national calling channel 146.520.' },
    ham70cmUs: { label: '70 cm amateur (US)', desc: 'ARRL simplex, calling channel 446.000.' },
    svc_fire: { label: 'Fire brigade (local)', desc: 'Local fire service channels for the selected town.' },
    svc_police: { label: 'Police (local)', desc: 'Local police channels for the selected town.' },
    svc_ems: { label: 'Ambulance (local)', desc: 'Local emergency medical channels for the selected town.' },
    svc_municipal: { label: 'Municipal guard (local)', desc: 'Municipal guard channels for the selected town.' },
    svc_fireNat: { label: 'Fire brigade national channels', desc: 'Nationwide numbered fire service channels.' },
    svc_marine: { label: 'Marine VHF', desc: 'Polish marine VHF channels.' },
    svc_rail: { label: 'Railway (PKP)', desc: 'Polish railway operational channels.' },
    svc_border: { label: 'Border guard', desc: 'Polish border guard channels.' },
    svc_crisis: { label: 'Crisis management network', desc: 'Provincial crisis management network.' },
    svc_forest: { label: 'State Forests', desc: 'Polish State Forests channels.' },
    svc_rescue: { label: 'Mountain and water rescue', desc: 'GOPR, TOPR and WOPR channels.' },
  },
    place: 'Place',
  placeNone: '— pick a place —',
  placeHint: 'Polish emergency service channels depend on the place. Pick one to see them.',
  showFreqs: (n) => `Show all ${n} frequencies`,
  restoreTitle: 'Restore from a backup',
  restoreLead: 'Have a backup file from an earlier session? Pick it and the radio goes back to how it was.',
  restoreDo: 'Restore to radio',
  restoring: 'Restoring...',
  restoreDone: 'Radio restored from the backup. Switch it off and on again.',
  restoreBadFile: 'That file does not look like a backup of this radio family. Pick the .img file this tool saved for you.',
  verifying: 'Checking what landed in the radio...',
  verifyOk: 'Checked against the radio, everything matches.',
  verifyFail: 'What is in the radio does not match what was sent. Check the cable and plug, then write again.',
  verifySkipped: 'Could not read the radio back to check it. Switch the radio off and on and see whether the channels are there.',
  leaveWarning: 'Writing to the radio is still in progress.',
  countries: { US: 'United States', PL: 'Poland', DE: 'Germany', CZ: 'Czechia' },
};

const pl: Dict = {
  ...en,
  title: 'Programator krótkofalówek',
  subtitle: 'Ustaw kanały w radiu Baofeng prosto z przeglądarki. Nic nie instalujesz.',
  legal:
    'Używaj radia zgodnie z przepisami obowiązującymi tam, gdzie jesteś. Limity mocy, dozwolone pasma i wymagane pozwolenia różnią się między krajami.',
  country: 'Kraj',
  language: 'Język',

  step1: 'Podłącz radio',
  connectHint1: 'Włóż wtyk kabla do gniazda w radiu, aż wskoczy.',
  connectHint2: 'Włącz radio i ustaw głośność mniej więcej na połowę.',
  connectHint3: 'Podłącz drugi koniec kabla do komputera.',
  connect: 'Połącz z radiem',
  connecting: 'Łączę...',
  browserWarning:
    'Ta przeglądarka nie potrafi rozmawiać z radiem. Otwórz stronę w Chrome, Edge, Operze albo Brave.',

  step2: 'Wybierz, co ma być w radiu',
  chooseLead: 'Zaznacz tyle zestawów, ile chcesz.',
  nothingSelected: 'Nie wybrano jeszcze niczego.',
  selectedOf: (n, max) => `Zajęte ${n} z ${max} miejsc w radiu.`,
  tooMany: (n, max) => `Wybrano ${n} kanałów, a radio mieści ${max}. Reszta się nie zmieści.`,
  next: 'Dalej',

  step3: 'Zapisz do radia',
  backupLead:
    'Najpierw zapiszemy to, co masz teraz w radiu. Gdyby coś poszło nie tak, wrócisz do poprzednich ustawień.',
  makeBackup: 'Zrób kopię zapasową',
  backupDone: 'Kopia zapisana w folderze Pobrane. Nie kasuj tego pliku.',
  write: 'Zapisz kanały do radia',
  writing: 'Zapisuję...',
  dontUnplug: 'Podczas zapisu nie odłączaj kabla i nie wyłączaj radia.',

  doneTitle: 'Gotowe',
  doneText: (n) => `Zapisano ${n} kanałów.`,
  doneDropped: (n) => `${n} kanałów się nie zmieściło.`,
  doneRestart: 'Wyłącz radio i włącz je ponownie, żeby zobaczyć nowe kanały.',
  again: 'Ustaw jeszcze raz',

  errGeneric: 'Coś poszło nie tak. Odłącz kabel, włącz radio ponownie i spróbuj od początku.',

  sets: {
    pmr446: { label: 'PMR446', desc: 'Europejskie kanały bez pozwolenia, 16 kanałów w paśmie 446 MHz.' },
    lpd433: { label: 'LPD433', desc: 'Starsze europejskie kanały małej mocy, 69 kanałów na 433 MHz.' },
    pmr154: { label: 'PMR-154', desc: 'Polski przydział VHF, cztery kanały.' },
    freenet: { label: 'Freenet', desc: 'Niemiecki przydział VHF, sześć kanałów w paśmie 149 MHz.' },
    frsGmrs: { label: 'FRS / GMRS', desc: 'Amerykańskie kanały ręczne, wszystkie 22.' },
    murs: { label: 'MURS', desc: 'Amerykański przydział VHF, pięć kanałów.' },
    ham2mEu: { label: 'Pasmo 2 m (Europa)', desc: 'Simpleks IARU R1, kanał wywoławczy 145,500.' },
    ham70cmEu: { label: 'Pasmo 70 cm (Europa)', desc: 'Simpleks IARU R1, kanał wywoławczy 433,500.' },
    ham2mUs: { label: 'Pasmo 2 m (USA)', desc: 'Simpleks ARRL, kanał wywoławczy 146,520.' },
    ham70cmUs: { label: 'Pasmo 70 cm (USA)', desc: 'Simpleks ARRL, kanał wywoławczy 446,000.' },
    svc_fire: { label: 'Straż pożarna (lokalnie)', desc: 'Kanały straży pożarnej dla wybranej miejscowości.' },
    svc_police: { label: 'Policja (lokalnie)', desc: 'Kanały policji dla wybranej miejscowości.' },
    svc_ems: { label: 'Pogotowie (lokalnie)', desc: 'Kanały pogotowia ratunkowego dla wybranej miejscowości.' },
    svc_municipal: { label: 'Straż miejska (lokalnie)', desc: 'Kanały straży miejskiej dla wybranej miejscowości.' },
    svc_fireNat: { label: 'Straż pożarna - kanały krajowe', desc: 'Ogólnopolskie kanały numerowane straży pożarnej.' },
    svc_marine: { label: 'Pasmo morskie VHF', desc: 'Polskie kanały morskie VHF.' },
    svc_rail: { label: 'Kolej (PKP)', desc: 'Kanały łączności kolejowej.' },
    svc_border: { label: 'Straż graniczna', desc: 'Kanały straży granicznej.' },
    svc_crisis: { label: 'Sieć zarządzania kryzysowego', desc: 'Wojewódzka sieć zarządzania kryzysowego.' },
    svc_forest: { label: 'Lasy Państwowe', desc: 'Kanały Lasów Państwowych.' },
    svc_rescue: { label: 'Ratownictwo górskie i wodne', desc: 'Kanały GOPR, TOPR i WOPR.' },
  },
    place: 'Miejscowość',
  placeNone: '— wybierz miejscowość —',
  placeHint: 'Kanały polskich służb zależą od miejscowości. Wybierz ją, żeby je zobaczyć.',
  showFreqs: (n) => `Pokaż wszystkie ${n} częstotliwości`,
  restoreTitle: 'Przywróć z kopii zapasowej',
  restoreLead: 'Masz plik kopii z wcześniejszego ustawiania? Wskaż go, a radio wróci do poprzedniego stanu.',
  restoreDo: 'Przywróć do radia',
  restoring: 'Przywracam...',
  restoreDone: 'Radio przywrócone z kopii. Wyłącz je i włącz ponownie.',
  restoreBadFile: 'Ten plik nie wygląda na kopię radia z tej rodziny. Wskaż plik .img zapisany przez to narzędzie.',
  verifying: 'Sprawdzam, co trafiło do radia...',
  verifyOk: 'Sprawdzone z radiem, wszystko się zgadza.',
  verifyFail: 'To, co jest w radiu, nie zgadza się z tym, co zostało wysłane. Sprawdź kabel i wtyk, potem zapisz jeszcze raz.',
  verifySkipped: 'Nie udało się odczytać radia do sprawdzenia. Wyłącz radio i włącz ponownie, zobacz czy kanały są na miejscu.',
  leaveWarning: 'Zapis do radia jeszcze trwa.',
  countries: { US: 'Stany Zjednoczone', PL: 'Polska', DE: 'Niemcy', CZ: 'Czechy' },
};

const de: Dict = {
  ...en,
  title: 'Funkgerät-Programmierer',
  subtitle: 'Kanäle im Baofeng direkt im Browser einrichten. Nichts zu installieren.',
  legal:
    'Nutze das Funkgerät nach den Vorschriften, die an deinem Standort gelten. Leistungsgrenzen, zulässige Bänder und Lizenzpflichten unterscheiden sich je nach Land.',
  country: 'Land',
  language: 'Sprache',

  step1: 'Funkgerät anschließen',
  connectHint1: 'Stecker in die Buchse am Funkgerät schieben, bis er einrastet.',
  connectHint2: 'Funkgerät einschalten und die Lautstärke etwa auf die Hälfte stellen.',
  connectHint3: 'Das andere Ende in den Computer stecken.',
  connect: 'Funkgerät verbinden',
  connecting: 'Verbinde...',
  browserWarning:
    'Dieser Browser kann nicht mit dem Funkgerät sprechen. Öffne die Seite in Chrome, Edge, Opera oder Brave.',

  step2: 'Auswählen, was ins Funkgerät kommt',
  chooseLead: 'Wähle so viele Sätze, wie du möchtest.',
  nothingSelected: 'Noch nichts ausgewählt.',
  selectedOf: (n, max) => `${n} von ${max} Speicherplätzen belegt.`,
  tooMany: (n, max) => `${n} Kanäle gewählt, das Gerät fasst ${max}. Der Rest passt nicht.`,
  next: 'Weiter',

  step3: 'Ins Funkgerät schreiben',
  backupLead:
    'Zuerst sichern wir, was jetzt im Gerät steht. Falls etwas schiefgeht, kommst du zurück.',
  makeBackup: 'Sicherung speichern',
  backupDone: 'Sicherung liegt im Download-Ordner. Diese Datei bitte behalten.',
  write: 'Kanäle schreiben',
  writing: 'Schreibe...',
  dontUnplug: 'Während des Schreibens das Kabel nicht abziehen und das Gerät nicht ausschalten.',

  doneTitle: 'Fertig',
  doneText: (n) => `${n} Kanäle geschrieben.`,
  doneDropped: (n) => `${n} Kanäle haben nicht gepasst.`,
  doneRestart: 'Gerät aus- und wieder einschalten, um die neuen Kanäle zu sehen.',
  again: 'Nochmal einrichten',

  errGeneric: 'Etwas ist schiefgegangen. Kabel abziehen, Gerät neu starten und noch einmal beginnen.',

  sets: {
    pmr446: { label: 'PMR446', desc: 'Europäische anmeldefreie Kanäle, 16 Kanäle um 446 MHz.' },
    lpd433: { label: 'LPD433', desc: 'Ältere europäische Kleinleistungskanäle, 69 Kanäle auf 433 MHz.' },
    pmr154: { label: 'PMR-154', desc: 'Polnische VHF-Zuteilung, vier Kanäle.' },
    freenet: { label: 'Freenet', desc: 'Deutsche VHF-Zuteilung, sechs Kanäle um 149 MHz.' },
    frsGmrs: { label: 'FRS / GMRS', desc: 'US-Handfunkkanäle, alle 22 Kanäle.' },
    murs: { label: 'MURS', desc: 'US-VHF-Zuteilung, fünf Kanäle.' },
    ham2mEu: { label: '2-m-Band (Europa)', desc: 'IARU-R1-Simplex, Anrufkanal 145,500.' },
    ham70cmEu: { label: '70-cm-Band (Europa)', desc: 'IARU-R1-Simplex, Anrufkanal 433,500.' },
    ham2mUs: { label: '2-m-Band (USA)', desc: 'ARRL-Simplex, Anrufkanal 146,520.' },
    ham70cmUs: { label: '70-cm-Band (USA)', desc: 'ARRL-Simplex, Anrufkanal 446,000.' },
    svc_fire: { label: 'Feuerwehr (lokal)', desc: 'Feuerwehrkanäle für den gewählten Ort.' },
    svc_police: { label: 'Polizei (lokal)', desc: 'Polizeikanäle für den gewählten Ort.' },
    svc_ems: { label: 'Rettungsdienst (lokal)', desc: 'Rettungsdienstkanäle für den gewählten Ort.' },
    svc_municipal: { label: 'Stadtwache (lokal)', desc: 'Kanäle der Stadtwache für den gewählten Ort.' },
    svc_fireNat: { label: 'Feuerwehr, landesweite Kanäle', desc: 'Landesweit nummerierte Feuerwehrkanäle.' },
    svc_marine: { label: 'Seefunk VHF', desc: 'Polnische Seefunkkanäle.' },
    svc_rail: { label: 'Bahn (PKP)', desc: 'Kanäle des polnischen Bahnbetriebs.' },
    svc_border: { label: 'Grenzschutz', desc: 'Kanäle des polnischen Grenzschutzes.' },
    svc_crisis: { label: 'Krisenmanagement-Netz', desc: 'Woiwodschaftsnetz für Krisenmanagement.' },
    svc_forest: { label: 'Staatsforsten', desc: 'Kanäle der polnischen Staatsforsten.' },
    svc_rescue: { label: 'Berg- und Wasserrettung', desc: 'Kanäle von GOPR, TOPR und WOPR.' },
  },
    place: 'Ort',
  placeNone: '— Ort wählen —',
  placeHint: 'Kanäle polnischer Dienste hängen vom Ort ab. Wähle einen, um sie zu sehen.',
  showFreqs: (n) => `Alle ${n} Frequenzen anzeigen`,
  restoreTitle: 'Aus einer Sicherung wiederherstellen',
  restoreLead: 'Hast du eine Sicherungsdatei von früher? Wähle sie aus, dann kehrt das Gerät in den alten Zustand zurück.',
  restoreDo: 'Auf das Gerät zurückspielen',
  restoring: 'Stelle wieder her...',
  restoreDone: 'Gerät aus der Sicherung wiederhergestellt. Schalte es aus und wieder ein.',
  restoreBadFile: 'Diese Datei sieht nicht nach einer Sicherung dieser Gerätefamilie aus. Wähle die .img-Datei, die dieses Werkzeug gespeichert hat.',
  verifying: 'Prüfe, was im Gerät gelandet ist...',
  verifyOk: 'Mit dem Gerät abgeglichen, alles stimmt.',
  verifyFail: 'Der Inhalt des Geräts stimmt nicht mit dem Gesendeten überein. Prüfe Kabel und Stecker und schreibe erneut.',
  verifySkipped: 'Das Gerät ließ sich zur Prüfung nicht auslesen. Schalte es aus und wieder ein und sieh nach, ob die Kanäle da sind.',
  leaveWarning: 'Das Schreiben ins Gerät läuft noch.',
  countries: { US: 'Vereinigte Staaten', PL: 'Polen', DE: 'Deutschland', CZ: 'Tschechien' },
};

const cs: Dict = {
  ...en,
  title: 'Programátor vysílaček',
  subtitle: 'Nastav kanály v Baofengu přímo v prohlížeči. Nic se neinstaluje.',
  legal:
    'Používej vysílačku podle předpisů platných tam, kde jsi. Limity výkonu, povolená pásma i licenční povinnosti se v jednotlivých zemích liší.',
  country: 'Země',
  language: 'Jazyk',

  step1: 'Připoj vysílačku',
  connectHint1: 'Zasuň konektor do vysílačky, dokud nezacvakne.',
  connectHint2: 'Zapni vysílačku a nastav hlasitost zhruba na polovinu.',
  connectHint3: 'Druhý konec zapoj do počítače.',
  connect: 'Připojit vysílačku',
  connecting: 'Připojuji...',
  browserWarning:
    'Tento prohlížeč neumí komunikovat s vysílačkou. Otevři stránku v Chrome, Edge, Opeře nebo Brave.',

  step2: 'Vyber, co má být ve vysílačce',
  chooseLead: 'Označ tolik sad, kolik chceš.',
  nothingSelected: 'Zatím nic nevybráno.',
  selectedOf: (n, max) => `Obsazeno ${n} ze ${max} míst v paměti.`,
  tooMany: (n, max) => `Vybráno ${n} kanálů, vysílačka pojme ${max}. Zbytek se nevejde.`,
  next: 'Dál',

  step3: 'Zapsat do vysílačky',
  backupLead:
    'Nejdřív uložíme to, co je ve vysílačce teď. Kdyby se něco pokazilo, vrátíš se zpátky.',
  makeBackup: 'Uložit zálohu',
  backupDone: 'Záloha je ve složce Stažené. Ten soubor si nech.',
  write: 'Zapsat kanály',
  writing: 'Zapisuji...',
  dontUnplug: 'Během zápisu neodpojuj kabel ani nevypínej vysílačku.',

  doneTitle: 'Hotovo',
  doneText: (n) => `Zapsáno ${n} kanálů.`,
  doneDropped: (n) => `${n} kanálů se nevešlo.`,
  doneRestart: 'Vypni a znovu zapni vysílačku, aby se nové kanály projevily.',
  again: 'Nastavit znovu',

  errGeneric: 'Něco se pokazilo. Odpoj kabel, restartuj vysílačku a začni znovu.',

  sets: {
    pmr446: { label: 'PMR446', desc: 'Evropské kanály bez povolení, 16 kanálů v pásmu 446 MHz.' },
    lpd433: { label: 'LPD433', desc: 'Starší evropské kanály malého výkonu, 69 kanálů na 433 MHz.' },
    pmr154: { label: 'PMR-154', desc: 'Polský příděl VHF, čtyři kanály.' },
    freenet: { label: 'Freenet', desc: 'Německý příděl VHF, šest kanálů v pásmu 149 MHz.' },
    frsGmrs: { label: 'FRS / GMRS', desc: 'Americké ruční kanály, všech 22.' },
    murs: { label: 'MURS', desc: 'Americký příděl VHF, pět kanálů.' },
    ham2mEu: { label: 'Pásmo 2 m (Evropa)', desc: 'Simplex IARU R1, volací kanál 145,500.' },
    ham70cmEu: { label: 'Pásmo 70 cm (Evropa)', desc: 'Simplex IARU R1, volací kanál 433,500.' },
    ham2mUs: { label: 'Pásmo 2 m (USA)', desc: 'Simplex ARRL, volací kanál 146,520.' },
    ham70cmUs: { label: 'Pásmo 70 cm (USA)', desc: 'Simplex ARRL, volací kanál 446,000.' },
    svc_fire: { label: 'Hasiči (místní)', desc: 'Kanály hasičů pro vybrané město.' },
    svc_police: { label: 'Policie (místní)', desc: 'Kanály policie pro vybrané město.' },
    svc_ems: { label: 'Záchranka (místní)', desc: 'Kanály záchranné služby pro vybrané město.' },
    svc_municipal: { label: 'Městská policie (místní)', desc: 'Kanály městské policie pro vybrané město.' },
    svc_fireNat: { label: 'Hasiči, celostátní kanály', desc: 'Celostátně číslované kanály hasičů.' },
    svc_marine: { label: 'Námořní VHF', desc: 'Polské námořní kanály VHF.' },
    svc_rail: { label: 'Železnice (PKP)', desc: 'Kanály polské železnice.' },
    svc_border: { label: 'Pohraniční stráž', desc: 'Kanály polské pohraniční stráže.' },
    svc_crisis: { label: 'Síť krizového řízení', desc: 'Vojvodská síť krizového řízení.' },
    svc_forest: { label: 'Státní lesy', desc: 'Kanály polských státních lesů.' },
    svc_rescue: { label: 'Horská a vodní záchrana', desc: 'Kanály GOPR, TOPR a WOPR.' },
  },
    place: 'Místo',
  placeNone: '— vyber místo —',
  placeHint: 'Kanály polských složek závisí na místě. Vyber ho, aby se zobrazily.',
  showFreqs: (n) => `Zobrazit všech ${n} frekvencí`,
  restoreTitle: 'Obnovit ze zálohy',
  restoreLead: 'Máš soubor zálohy z dřívějška? Vyber ho a vysílačka se vrátí do původního stavu.',
  restoreDo: 'Obnovit do vysílačky',
  restoring: 'Obnovuji...',
  restoreDone: 'Vysílačka obnovena ze zálohy. Vypni ji a zase zapni.',
  restoreBadFile: 'Tento soubor nevypadá jako záloha vysílačky z této rodiny. Vyber soubor .img, který uložil tento nástroj.',
  verifying: 'Kontroluji, co se do vysílačky zapsalo...',
  verifyOk: 'Zkontrolováno proti vysílačce, vše sedí.',
  verifyFail: 'To, co je ve vysílačce, neodpovídá odeslanému. Zkontroluj kabel a konektor a zapiš znovu.',
  verifySkipped: 'Vysílačku se nepodařilo přečíst ke kontrole. Vypni ji a zapni a podívej se, jestli kanály jsou na místě.',
  leaveWarning: 'Zápis do vysílačky ještě probíhá.',
  countries: { US: 'Spojené státy', PL: 'Polsko', DE: 'Německo', CZ: 'Česko' },
};

const DICTS: Record<Lang, Dict> = { en, pl, de, cs };

/**
 * Jezyk startowy to ZAWSZE angielski, niezaleznie od ustawien przegladarki.
 * Narzedzie jest miedzynarodowe i tak ma sie prezentowac przy pierwszym wejsciu;
 * kto chce inny jezyk, przelaczy go jednym kliknieciem.
 */
export const DEFAULT_LANG: Lang = 'en';

/**
 * Czestotliwosc w formacie czytelnym dla danego jezyka.
 * Angielski uzywa kropki, pozostale trzy przecinka - w radiu i tak jest kropka,
 * ale na ekranie liczba ma wygladac tak, jak uzytkownik ja zapisuje.
 */
export function formatFreq(hz: number, lang: Lang): string {
  // Piec miejsc, bo raster 6,25 kHz tego wymaga: PMR446 kanal 1 to 446,00625 MHz
  // i zaokraglenie do czterech pokazaloby uzytkownikowi inna wartosc, niz trafia do radia.
  // Koncowe zera obcinamy, ale nigdy ponizej trzech miejsc - tak zapisuja to krotkofalowcy.
  const mhz = (hz / 1_000_000).toFixed(5).replace(/(\.\d{3}\d*?)0+$/, '$1');
  return `${lang === 'en' ? mhz : mhz.replace('.', ',')} MHz`;
}

export function t(lang: Lang): Dict {
  return DICTS[lang];
}
