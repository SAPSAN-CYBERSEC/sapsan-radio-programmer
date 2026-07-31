/**
 * Sterowanie kreatorem. Trzy ekrany, jedna decyzja na ekran.
 *
 * Zestawy filtrujemy po wybranym kraju, ale niczego nie blokujemy - informacja
 * o zgodnosci z lokalnymi przepisami stoi raz, na gorze strony.
 */

import { setsForCountry, countChannels, COUNTRIES, type Country, type FrequencySet } from '../data/bands.ts';
import { buildChannels } from '../data/build-channels.ts';
import { writeChannelsIntoImage, CHANNEL_COUNT } from '../radio/uv5r-memory.ts';
import {
  identify,
  readMainMemory,
  writeChannels,
  verifyChannels,
  looksLikeUv5rImage,
  MODELS,
  RadioError,
  type RadioFamily,
} from '../radio/uv5r-protocol.ts';
import { WebSerialTransport, isWebSerialSupported } from '../radio/web-serial.ts';
import { runDiagnostics } from './diagnostics.ts';
import { localServiceSets, nationalServiceSets, placeGroups } from '../data/services.ts';
import { t, DEFAULT_LANG, LANGS, formatFreq, type Lang } from '../i18n/index.ts';
import { ChannelSheet } from './sheet.ts';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Brak elementu #${id} w dokumencie`);
  return el as T;
};

let lang: Lang = DEFAULT_LANG;
let country: Country = 'US';
/** Miejscowosc dla polskich sluzb. Poza Polska nieuzywana. */
let place: string | null = null;
let transport: WebSerialTransport | null = null;
/** Obraz pamieci odczytany z radia. Modyfikujemy kopie, oryginal zostaje na kopie zapasowa. */
let radioImage: Uint8Array | null = null;
let backupDone = false;
/** Trwa zapis do radia - przerwanie go zostawia radio z polowa kanalow. */
let writing = false;
/** Model wskazany przez uzytkownika - wysylamy jedna sekwencje powitalna zamiast zgadywac. */
let family: RadioFamily = 'uv5r';
const selected = new Set<string>();
/** Arkusz z lista kanalow - to on, a nie wybor zestawow, decyduje co idzie do radia. */
let sheet: ChannelSheet;

const tr = () => t(lang);

/**
 * Zamienia kod bledu na komunikat w biezacym jezyku strony. Warstwa radiowa
 * rzuca same kody - tlumaczenie w chwili wyswietlenia sprawia, ze zmiana
 * jezyka nie zostawia bledow w poprzednim.
 */
function radioErrorText(err: RadioError): string {
  const d = tr();
  switch (err.code) {
    case 'browserWarning':
      return d.browserWarning;
    case 'errNoDevice':
      return d.errNoDevice;
    case 'errPortClosed':
      return d.errPortClosed;
    case 'errNoResponse':
      return d.errNoResponse;
    case 'errNoConfirm':
      return d.errNoConfirm;
    case 'errIdentSilent':
      return d.errIdentSilent;
    case 'errIdentFailed':
      return d.errIdentFailed;
    case 'errReadRefused':
      return d.errReadRefused(String(err.params.addr));
    case 'errReadGarbled':
      return d.errReadGarbled(String(err.params.addr));
    case 'errWriteRejected':
      return d.errWriteRejected(String(err.params.addr));
    case 'errBadImage':
      return d.errBadImage(Number(err.params.got), Number(err.params.want));
    case 'restoreBadFile':
      return d.restoreBadFile;
  }
}

function showError(err: unknown): void {
  const box = $('error');
  box.textContent = err instanceof RadioError ? radioErrorText(err) : tr().errGeneric;
  box.hidden = false;
}

function show(stepId: string): void {
  for (const id of ['step-connect', 'step-choose', 'step-sheet', 'step-write', 'step-done']) {
    $(id).hidden = id !== stepId;
  }
  // Przywracanie zostaje na ekranie od chwili polaczenia - to droga ratunkowa,
  // a nie kolejny krok kreatora.
  $('restore').hidden = stepId === 'step-connect';
}

/**
 * Lista modeli do wyboru. Oznaczenia handlowe zostaja jak sa, tlumaczy sie tylko
 * dopisek odrozniajacy starszy UV-5R od nowszego - dlatego lista musi wracac tutaj
 * przy kazdej zmianie jezyka, a nie byc skladana raz przy starcie.
 */
function renderModelOptions(): void {
  const d = tr();
  const sel = $<HTMLSelectElement>('model');
  const chosen = sel.value;
  sel.innerHTML = MODELS.map((m) => {
    const label = m.note ? `${m.label} (${d[m.note]})` : m.label;
    return `<option value="${m.id}">${label}</option>`;
  }).join('');
  if (chosen) sel.value = chosen;
}

/** Przepisuje wszystkie napisy na aktualny jezyk. */
function applyTexts(): void {
  const d = tr();
  document.documentElement.lang = lang;
  document.title = d.title;
  renderModelOptions();

  const map: Record<string, string> = {
    't-title': d.title,
    't-subtitle': d.subtitle,
    't-legal': d.legal,
    't-language': d.language,
    't-country': d.country,
    't-step1': d.step1,
    't-hint1': d.connectHint1,
    't-hint2': d.connectHint2,
    't-hint3': d.connectHint3,
    'btn-connect': d.connect,
    'browser-warning': d.browserWarning,
    't-step2': d.step2,
    't-choose-lead': d.chooseLead,
    'btn-next': d.next,
    't-step3': d.step3,
    't-backup-lead': d.backupLead,
    'btn-backup': d.makeBackup,
    'btn-write': d.write,
    't-dont-unplug': d.dontUnplug,
    't-done-title': d.doneTitle,
    't-model': d.model,
    't-help-title': d.helpTitle,
    't-sheet-title': d.sheetTitle,
    't-sheet-lead': d.sheetLead,
    'btn-add-row': d.addRow,
    'btn-clear': d.clearAll,
    'btn-to-write': d.toWrite,
    't-restore-title': d.restoreTitle,
    't-restore-lead': d.restoreLead,
    'btn-restore': d.restoreDo,
    'btn-restart': d.again,
    't-footer': d.footerPrivacy,
  };
  for (const [id, text] of Object.entries(map)) $(id).textContent = text;

  // Kto za tym stoi. Odnosnik otwiera sie w nowej karcie, bo uzytkownik bywa
  // w polowie programowania radia i nie ma go po co z tego wyrzucac.
  $('t-footer-by').innerHTML = d.footerMadeBy(
    '<a href="https://sapsan-sklep.pl/" target="_blank" rel="noopener">SAPSAN CYBERSEC</a>',
  );

  // Pomoc sklada sie z akapitow, w ktorych **pogrubienie** niesie tresc - stad
  // minimalna zamiana zamiast wciagania biblioteki do markdownu.
  $('help-body').innerHTML = [
    d.helpNoPort,
    d.helpNoAnswer,
    d.helpDrivers,
    d.helpDriversWin,
    d.helpDriversMac,
    d.helpDriversLinux,
    d.helpProlific,
  ]
    .map((p) => `<p>${p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`)
    .join('');

  const countrySel = $<HTMLSelectElement>('country');
  countrySel.innerHTML = COUNTRIES.map(
    (c) => `<option value="${c.code}">${c.flag} ${d.countries[c.code]}</option>`,
  ).join('');
  countrySel.value = country;

  $('t-place').textContent = d.place;
  const placeSel = $<HTMLSelectElement>('place');
  // Wojewodztwa maja nazwy w czterech jezykach, miejscowosci to nazwy wlasne
  // i zostaja jak sa. Grupy sa po to, zeby przy angielskim interfejsie bylo
  // widac, ze gora listy to regiony, a nie miasta o dziwnej pisowni.
  const groups = placeGroups();
  const opt = (value: string, label: string) => `<option value="${value}">${label}</option>`;
  const optgroup = (label: string, items: string) =>
    items ? `<optgroup label="${label}">${items}</optgroup>` : '';
  const regionOpts = groups.regions
    .map((r) => ({ key: r.key, name: r.region.names[lang] }))
    .sort((a, b) => a.name.localeCompare(b.name, lang))
    .map((r) => opt(r.key, r.name))
    .join('');
  placeSel.innerHTML =
    opt('', d.placeNone) +
    optgroup(d.groupRegions, regionOpts) +
    optgroup(d.groupCities, groups.cities.map((c) => opt(c, c)).join('')) +
    optgroup(d.groupOther, groups.other.map((o) => opt(o, o)).join(''));
  placeSel.value = place ?? '';
  $('place-wrap').hidden = country !== 'PL';

  renderSets();
}

/** Rysuje kafelki zestawow dostepnych w wybranym kraju. */
function renderSets(): void {
  const d = tr();
  const box = $('sets');
  const available = availableSets();

  // Wybor, ktory nie istnieje w nowym kraju, przestaje obowiazywac.
  for (const id of [...selected]) {
    if (!available.some((s) => s.id === id)) selected.delete(id);
  }

  box.innerHTML = '';
  for (const set of available) {
    const text = d.sets[set.i18nKey];
    const card = document.createElement('div');
    card.className = 'set';

    // Czesc klikalna i szczegoly sa rozdzielone celowo: gdyby lista siedziala
    // w <label>, rozwiniecie jej przelaczaloby zaznaczenie zestawu.
    const rows = set.channels
      .map(
        (c) =>
          `<li><span class="freq-name">${c.name}</span>` +
          `<span class="freq-value">${formatFreq(c.rx, lang)}</span></li>`,
      )
      .join('');

    card.innerHTML = `
      <label class="set-main">
        <input type="checkbox" value="${set.id}" ${selected.has(set.id) ? 'checked' : ''} />
        <span>
          <span class="set-label">${text?.label ?? set.id}</span>
          <p class="set-desc">${text?.desc ?? ''}</p>
          <span class="count">${set.channels.length}</span>
        </span>
      </label>
      <details class="set-details">
        <summary>${d.showFreqs(set.channels.length)}</summary>
        <ul class="freq-list">${rows}</ul>
      </details>`;

    const input = card.querySelector('input')!;
    input.addEventListener('change', () => {
      if (input.checked) selected.add(set.id);
      else selected.delete(set.id);
      updateCounter();
    });
    box.appendChild(card);
  }

  // W Polsce kanaly sluzb zaleza od miejscowosci - bez jej wyboru lista jest niepelna.
  if (country === 'PL' && !place) {
    const hint = document.createElement('p');
    hint.className = 'note';
    hint.textContent = d.placeHint;
    box.appendChild(hint);
  }
  updateCounter();
}

/** Wszystkie zestawy widoczne przy obecnym kraju i miejscowosci. */
function availableSets(): FrequencySet[] {
  const base = setsForCountry(country);
  if (country !== 'PL') return base;
  return [...base, ...localServiceSets(place), ...nationalServiceSets()];
}

function chosenSets(): FrequencySet[] {
  return availableSets().filter((s) => selected.has(s.id));
}

/** Licznik miejsc. Radio ma ich 128 i uzytkownik musi o tym wiedziec przed zapisem. */
function updateCounter(): void {
  const d = tr();
  const total = countChannels(chosenSets());
  const next = $<HTMLButtonElement>('btn-next');

  next.disabled = total === 0;
  $('counter').textContent =
    total === 0
      ? d.nothingSelected
      : total > CHANNEL_COUNT
        ? d.tooMany(total, CHANNEL_COUNT)
        : d.selectedOf(total, CHANNEL_COUNT);
}

function setProgress(done: number, total: number): void {
  $('progress').hidden = false;
  $('bar').style.width = `${Math.round((done / total) * 100)}%`;
}

async function connect(): Promise<void> {
  $('error').hidden = true;
  const btn = $<HTMLButtonElement>('btn-connect');
  btn.disabled = true;
  btn.textContent = tr().connecting;
  try {
    transport = await WebSerialTransport.request();
    await identify(transport, family);
    radioImage = await readMainMemory(transport, setProgress);
    show('step-choose');
  } catch (err) {
    showError(err);
    await transport?.close().catch(() => {});
    transport = null;
  } finally {
    btn.disabled = false;
    btn.textContent = tr().connect;
  }
}

/**
 * Zapisuje na dysk to, co bylo w radiu przed nasza ingerencja.
 * Bez tego kroku nie odblokowujemy zapisu - to jedyna droga powrotu.
 */
function downloadBackup(): void {
  if (!radioImage) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  // slice() daje wlasny bufor, wiec plik nie zmieni sie, gdy pozniej ruszymy obraz.
  const blob = new Blob([radioImage.slice().buffer as ArrayBuffer], {
    type: 'application/octet-stream',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `radio-backup-${stamp}.img`;
  a.click();
  URL.revokeObjectURL(a.href);

  backupDone = true;
  const status = $('backup-status');
  status.textContent = tr().backupDone;
  status.hidden = false;
  $<HTMLButtonElement>('btn-write').disabled = false;
}

async function writeToRadio(): Promise<void> {
  if (!transport || !radioImage || !backupDone) return;
  $('error').hidden = true;
  const btn = $<HTMLButtonElement>('btn-write');
  btn.disabled = true;
  btn.textContent = tr().writing;

  try {
    // Zrodlem prawdy jest arkusz, nie zaznaczone kafelki - uzytkownik mogl tam
    // wszystko pozmieniac, dopisac wlasne kanaly albo skasowac polowe.
    const channels = sheet.getChannels();

    // Pracujemy na kopii, zeby obraz z radia zostal nietkniety na wypadek ponowienia.
    const image = radioImage.slice();
    writeChannelsIntoImage(image, channels);

    writing = true;
    await writeChannels(transport, image, setProgress);

    const d = tr();
    const parts = [d.doneText(channels.length)];

    // Radio potwierdza kazdy blok, ale potwierdzenie znaczy "odebralem",
    // nie "zapisalem poprawnie". Sprawdzamy odczytem.
    btn.textContent = d.verifying;
    parts.push(await verifyWritten(image));

    parts.push(d.doneRestart);
    $('done-text').textContent = parts.join(' ');
    show('step-done');
  } catch (err) {
    showError(err);
  } finally {
    writing = false;
    btn.disabled = false;
    btn.textContent = tr().write;
  }
}

/**
 * Sprawdza odczytem, czy w radiu jest to, co wyslalismy, i zwraca zdanie do podsumowania.
 *
 * Nieudany odczyt to co innego niz niezgodnosc: zapis mogl sie powiesc, a radio
 * po prostu zakonczylo sesje. Nie strasz uzytkownika bledem, ktorego nie bylo.
 */
async function verifyWritten(image: Uint8Array): Promise<string> {
  const d = tr();
  if (!transport) return d.verifySkipped;
  try {
    const result = await verifyChannels(transport, image, setProgress, family);
    return result.ok ? d.verifyOk : d.verifyFail;
  } catch {
    return d.verifySkipped;
  }
}

/** Wgrywa do radia obraz z pliku kopii zapasowej. */
async function restoreFromFile(file: File): Promise<void> {
  if (!transport) return;
  $('error').hidden = true;
  const d = tr();
  const btn = $<HTMLButtonElement>('btn-restore');
  const status = $('restore-status');

  const data = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeUv5rImage(data)) {
    // Wgranie obrazu z innego modelu zamienia radio w cegle, a uzytkownik
    // siegajacy po kopie zwykle juz ma klopot i drugi blad by go dobil.
    showError(new RadioError('restoreBadFile'));
    return;
  }

  btn.disabled = true;
  btn.textContent = d.restoring;
  status.hidden = true;
  try {
    writing = true;
    await writeChannels(transport, data, setProgress);
    status.textContent = `${d.restoreDone} ${await verifyWritten(data)}`;
    status.hidden = false;
    // Po przywroceniu obraz w pamieci programu ma odpowiadac stanowi radia.
    radioImage = data;
  } catch (err) {
    showError(err);
  } finally {
    writing = false;
    btn.disabled = false;
    btn.textContent = d.restoreDo;
  }
}

function updateSheetCounter(): void {
  $('sheet-counter').textContent = sheet.summary();
  $<HTMLButtonElement>('btn-to-write').disabled = sheet.getChannels().length === 0;
}

function init(): void {
  sheet = new ChannelSheet($('sheet'), { onChange: () => updateSheetCounter() });

  const modelSel = $<HTMLSelectElement>('model');
  renderModelOptions();
  modelSel.addEventListener('change', () => {
    family = MODELS.find((m) => m.id === modelSel.value)?.family ?? 'uv5r';
  });

  const langSel = $<HTMLSelectElement>('lang');
  langSel.innerHTML = LANGS.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');
  langSel.value = lang;
  langSel.addEventListener('change', () => {
    lang = langSel.value as Lang;
    sheet.setLang(lang);
    applyTexts();
    updateSheetCounter();
  });

  $<HTMLSelectElement>('country').addEventListener('change', (e) => {
    country = (e.target as HTMLSelectElement).value as Country;
    // Miejscowosc dotyczy tylko Polski - przy zmianie kraju traci sens.
    if (country !== 'PL') place = null;
    applyTexts();
  });

  $<HTMLSelectElement>('place').addEventListener('change', (e) => {
    place = (e.target as HTMLSelectElement).value || null;
    renderSets();
  });

  sheet.setLang(lang);
  applyTexts();

  if (!isWebSerialSupported()) {
    $('browser-warning').hidden = false;
    $<HTMLButtonElement>('btn-connect').disabled = true;
    return;
  }

  $('btn-connect').addEventListener('click', connect);
  $('btn-next').addEventListener('click', () => {
    // Wybrane zestawy sa punktem wyjscia dla arkusza, nie ostatnim slowem.
    sheet.setChannels(buildChannels(chosenSets()).channels);
    updateSheetCounter();
    show('step-sheet');
  });
  $('btn-to-write').addEventListener('click', () => show('step-write'));
  $('btn-add-row').addEventListener('click', () => {
    sheet.addBlank();
    updateSheetCounter();
  });
  $('btn-clear').addEventListener('click', () => {
    sheet.clear();
    updateSheetCounter();
  });
  $('btn-backup').addEventListener('click', downloadBackup);
  $('btn-write').addEventListener('click', writeToRadio);
  $('btn-restart').addEventListener('click', () => show('step-choose'));

  const fileInput = $<HTMLInputElement>('restore-file');
  fileInput.addEventListener('change', () => {
    $<HTMLButtonElement>('btn-restore').disabled = !fileInput.files?.length;
  });
  $('btn-restore').addEventListener('click', () => {
    const file = fileInput.files?.[0];
    if (file) void restoreFromFile(file);
  });

  // Narzedzie serwisowe pod ?diag - nie zaslania kreatora, gdy nikt go nie wolal.
  if (new URLSearchParams(location.search).has('diag')) {
    const panel = $('step-diag');
    const out = $('diag-out');
    panel.hidden = false;
    $('btn-diag').addEventListener('click', async () => {
      const btn = $<HTMLButtonElement>('btn-diag');
      btn.disabled = true;
      out.hidden = false;
      out.textContent = '';
      try {
        await runDiagnostics(family, (line) => {
          out.textContent += `${line}\n`;
        });
      } catch (e) {
        out.textContent += `unexpected: ${(e as Error).message}\n`;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Zamkniecie karty w polowie zapisu zostawia radio z polowa kanalow.
  window.addEventListener('beforeunload', (e) => {
    if (!writing) return;
    e.preventDefault();
    e.returnValue = tr().leaveWarning;
  });
}

init();
