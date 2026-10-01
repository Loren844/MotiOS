// Scriptable script. Save this file as "MotiOS" and iv-calculator.js as "iv-calculator".

const {
  calculatePotentialIvs,
  summarizePotentialIvs,
  getEncounterConstraints,
  ENCOUNTER_SOURCES
} = importModule("iv-calculator");

const GAME_MASTER_URL = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json";
const SPECIES_NAMES_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
const GAME_MASTER_CACHE_FILE = "motios-gamemaster.json";
const NAME_CATALOG_CACHE_FILE = "motios-species-names.json";
const GAME_MASTER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NAME_CATALOG_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const TRAINER_LEVEL_KEY = "motios-trainer-level";
// Wild levels stop at 30, so this default is exact for any trainer at level 30 or above.
const DEFAULT_TRAINER_LEVEL = 30;

// Pokemon GO boost table: in-game weather category -> boosted types.
const WEATHER_BOOSTS = {
  clear: ["grass", "ground", "fire"],
  partlyCloudy: ["normal", "rock"],
  cloudy: ["fairy", "fighting", "poison"],
  rain: ["water", "electric", "bug"],
  snow: ["ice", "steel"],
  fog: ["dark", "ghost"],
  windy: ["dragon", "flying", "psychic"]
};

// WMO weather codes from Open-Meteo, grouped into Pokemon GO weather categories.
const WMO_WEATHER_CATEGORIES = {
  clear: [0, 1],
  partlyCloudy: [2],
  cloudy: [3],
  fog: [45, 48],
  rain: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99],
  snow: [71, 73, 75, 77, 85, 86]
};
const WINDY_SPEED_KMH = 24;

// Patterns swallow the connecting particle too, so "Rattata d'Alola" reduces to "Rattata".
const REGIONAL_FORMS = [
  { pattern: /\b(?:d['’]\s*|de\s+)?alola\w*\b/i, suffix: "alolan" },
  { pattern: /\b(?:de\s+)?galar\w*\b/i, suffix: "galarian" },
  { pattern: /\b(?:de\s+)?hisui\w*\b/i, suffix: "hisuian" },
  { pattern: /\b(?:de\s+)?paldea\w*\b/i, suffix: "paldean" }
];

// The encounter screen also shows a clock, a battery level and item counts.
const CP_LABEL_PATTERN = /\b(?:PC|CP|WP)\b\s*[:.]?\s*(\d{1,5})/i;
const CLOCK_PATTERN = /\b\d{1,2}\s*[:hH]\s*\d{2}\b/g;
const PERCENT_PATTERN = /\d+\s*%/g;

const COPY = {
  fr: {
    title: "MotiOS",
    name: "Nom",
    cp: "PC",
    calculate: "Calculer",
    invalidInput: "PC introuvable dans le texte lu. Verifie la capture.",
    noResult: "Aucune combinaison IV trouvee pour {name} a {cp} PC.",
    notFound: "Pokemon introuvable : {name}. Verifie le texte lu par l'OCR.",
    max: "max",
    boosted: "Meteo boostee",
    legend: "% = chance d'avoir au moins 80 % d'IV",
    verdictKeep: "A capturer",
    verdictMaybe: "A verifier",
    verdictSkip: "A ignorer",
    error: "Erreur"
  },
  en: {
    title: "MotiOS",
    name: "Name",
    cp: "CP",
    calculate: "Calculate",
    invalidInput: "No CP found in the scanned text. Check the screenshot.",
    noResult: "No IV combination found for {name} at {cp} CP.",
    notFound: "Pokemon not found: {name}. Check the OCR text.",
    max: "max",
    boosted: "Weather boosted",
    legend: "% = chance of at least 80% IV",
    verdictKeep: "Catch it",
    verdictMaybe: "Worth a check",
    verdictSkip: "Skip it",
    error: "Error"
  }
};

function normalizeName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s\-_'\.:!?,/]/g, "");
}

function getCopy(locale) {
  return COPY[String(locale || "fr").toLowerCase().startsWith("en") ? "en" : "fr"];
}

function formatMessage(template, replacements) {
  return Object.entries(replacements).reduce(
    (message, [key, value]) => message.replace(`{${key}}`, value),
    template
  );
}

function parseInput() {
  const parameter = args.shortcutParameter;
  if (parameter) {
    if (typeof parameter === "object") return parameter;
    try {
      return JSON.parse(parameter);
    } catch (_) {
      return { text: parameter };
    }
  }

  if (args.queryParameters.name && args.queryParameters.cp) {
    return { name: args.queryParameters.name, cp: args.queryParameters.cp };
  }
  if (args.queryParameters.text) {
    return { text: args.queryParameters.text };
  }
  return null;
}

async function askForInput(copy) {
  const alert = new Alert();
  alert.title = copy.title;
  alert.addTextField(copy.name, "");
  alert.addTextField(copy.cp, "");
  alert.addAction(copy.calculate);
  await alert.presentAlert();
  return { name: alert.textFieldValue(0), cp: alert.textFieldValue(1) };
}

function getCachePath(filename) {
  return FileManager.local().joinPath(FileManager.local().documentsDirectory(), filename);
}

function readFreshCache(filename, maxAgeMs) {
  const fileManager = FileManager.local();
  const cachePath = getCachePath(filename);
  const hasFreshCache = fileManager.fileExists(cachePath)
    && Date.now() - fileManager.modificationDate(cachePath).getTime() < maxAgeMs;

  return hasFreshCache ? JSON.parse(fileManager.readString(cachePath)) : null;
}

function readCache(filename) {
  const fileManager = FileManager.local();
  const cachePath = getCachePath(filename);
  return fileManager.fileExists(cachePath) ? JSON.parse(fileManager.readString(cachePath)) : null;
}

function writeCache(filename, value) {
  FileManager.local().writeString(getCachePath(filename), JSON.stringify(value));
}

async function getGameMaster() {
  const freshCache = readFreshCache(GAME_MASTER_CACHE_FILE, GAME_MASTER_CACHE_MAX_AGE_MS);
  if (freshCache) return freshCache;

  try {
    const gameMaster = await new Request(GAME_MASTER_URL).loadJSON();
    writeCache(GAME_MASTER_CACHE_FILE, gameMaster);
    return gameMaster;
  } catch (error) {
    const cache = readCache(GAME_MASTER_CACHE_FILE);
    if (cache) return cache;
    throw new Error("Impossible de telecharger les statistiques Pokemon GO. Verifie ta connexion Internet.");
  }
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function buildNameCatalog(csv) {
  const catalog = {};
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const [dex, , name] = parseCsvLine(line);
    if (name && Number.isInteger(Number.parseInt(dex, 10))) {
      catalog[normalizeName(name)] = Number.parseInt(dex, 10);
    }
  }
  return catalog;
}

async function getNameCatalog() {
  const freshCache = readFreshCache(NAME_CATALOG_CACHE_FILE, NAME_CATALOG_CACHE_MAX_AGE_MS);
  if (freshCache) return freshCache;

  try {
    const catalog = buildNameCatalog(await new Request(SPECIES_NAMES_URL).loadString());
    writeCache(NAME_CATALOG_CACHE_FILE, catalog);
    return catalog;
  } catch (error) {
    const cache = readCache(NAME_CATALOG_CACHE_FILE);
    if (cache) return cache;
    throw new Error("Impossible de telecharger le catalogue de noms Pokemon. Verifie ta connexion Internet.");
  }
}

function findPokemon(gameMaster, nameCatalog, pokemonName) {
  const rawName = String(pokemonName);
  const region = REGIONAL_FORMS.find((form) => form.pattern.test(rawName));
  const pokemon = gameMaster.pokemon || gameMaster;
  if (!Array.isArray(pokemon)) throw new Error("Format du Game Master inattendu.");

  const wantedName = normalizeName(rawName);
  const directMatch = pokemon.find((entry) => (
    normalizeName(entry.speciesName) === wantedName
    || normalizeName(entry.speciesId) === wantedName
  ));
  if (directMatch) return directMatch;

  const baseName = region ? normalizeName(rawName.replace(region.pattern, "")) : wantedName;
  const dex = nameCatalog[baseName];
  if (dex === undefined) return null;

  const sameDex = pokemon.filter((entry) => Number(entry.dex) === dex && !/shadow/i.test(entry.speciesId));
  if (region) {
    const regionalForm = sameDex.find((entry) => entry.speciesId.endsWith(`_${region.suffix}`));
    if (regionalForm) return regionalForm;
  }
  return sameDex.find((entry) => !entry.speciesName.includes("(")) ?? sameDex[0] ?? null;
}

function parseCp(value) {
  const text = String(value ?? "");
  const labelled = text.match(CP_LABEL_PATTERN);
  if (labelled) return Number.parseInt(labelled[1], 10);

  const digits = text.match(/\b\d{2,5}\b/g);
  const plausible = (digits || []).map(Number).filter((number) => number >= 10 && number <= 6000);
  return plausible.length === 1 ? plausible[0] : NaN;
}

// Without a "PC" label the Poke Ball counter and the clock look just like a CP value, so the
// number printed closest to the Pokemon name wins: on the encounter screen they sit together.
function parseCpFromOcr(text, nameLineIndex) {
  const labelled = String(text).match(CP_LABEL_PATTERN);
  if (labelled) return Number.parseInt(labelled[1], 10);

  const candidates = [];
  String(text).split(/\r?\n/).forEach((line, index) => {
    const cleaned = line.replace(CLOCK_PATTERN, " ").replace(PERCENT_PATTERN, " ");
    for (const digits of cleaned.match(/\b\d{2,5}\b/g) || []) {
      const value = Number(digits);
      if (value >= 10 && value <= 6000) candidates.push({ value, index });
    }
  });

  if (candidates.length === 0) return NaN;
  if (nameLineIndex < 0) return Math.max(...candidates.map((candidate) => candidate.value));

  candidates.sort((left, right) => (
    Math.abs(left.index - nameLineIndex) - Math.abs(right.index - nameLineIndex)
    || right.value - left.value
  ));
  return candidates[0].value;
}

function cleanOcrLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line
      .replace(CP_LABEL_PATTERN, " ")
      .replace(CLOCK_PATTERN, " ")
      .replace(PERCENT_PATTERN, " ")
      .replace(/\d+/g, " ")
      .trim());
}

function findPokemonInOcr(gameMaster, nameCatalog, text) {
  const lines = cleanOcrLines(text);

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].length < 3) continue;
    const pokemon = findPokemon(gameMaster, nameCatalog, lines[index]);
    if (pokemon) return { pokemon, name: lines[index], lineIndex: index };
  }

  // OCR often glues interface words onto the name, so retry word by word.
  for (let index = 0; index < lines.length; index += 1) {
    for (const word of lines[index].split(/\s+/)) {
      if (word.length < 3) continue;
      const pokemon = findPokemon(gameMaster, nameCatalog, word);
      if (pokemon) return { pokemon, name: word, lineIndex: index };
    }
  }
  return null;
}

function getTrainerLevel(input) {
  const provided = Number.parseInt(String(input.trainerLevel ?? ""), 10);
  if (Number.isInteger(provided) && provided >= 1 && provided <= 50) {
    Keychain.set(TRAINER_LEVEL_KEY, String(provided));
    return provided;
  }

  const stored = Keychain.contains(TRAINER_LEVEL_KEY)
    ? Number.parseInt(Keychain.get(TRAINER_LEVEL_KEY), 10)
    : NaN;
  return Number.isInteger(stored) && stored >= 1 && stored <= 50 ? stored : DEFAULT_TRAINER_LEVEL;
}

function isWeatherBoosted(input, ocrText) {
  if (typeof input.weatherBoost === "boolean") return input.weatherBoost;
  if (typeof input.weather === "boolean") return input.weather;
  if (/meteo|weather|boost/i.test(ocrText)) return true;
  return null;
}

function getWeatherCategory(weatherCode, windSpeedKmh) {
  if (windSpeedKmh >= WINDY_SPEED_KMH && (weatherCode === 0 || weatherCode === 1 || weatherCode === 2)) {
    return "windy";
  }
  return Object.keys(WMO_WEATHER_CATEGORIES).find(
    (category) => WMO_WEATHER_CATEGORIES[category].includes(weatherCode)
  ) ?? null;
}

async function detectWeatherBoost(pokemonTypes) {
  try {
    Location.setAccuracyToThreeKilometers();
    const { latitude, longitude } = await Location.current();
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
    const response = await new Request(weatherUrl).loadJSON();
    const category = getWeatherCategory(response.current_weather.weathercode, response.current_weather.windspeed);
    if (!category) return false;
    return pokemonTypes.some((type) => WEATHER_BOOSTS[category].includes(type));
  } catch (error) {
    return null;
  }
}

function getVerdict(greatChance, copy) {
  if (greatChance >= 50) return { emoji: "\u2705", text: copy.verdictKeep };
  if (greatChance >= 10) return { emoji: "\u2753", text: copy.verdictMaybe };
  return { emoji: "\u274C", text: copy.verdictSkip };
}

function formatPercent(value) {
  return value.toFixed(1).replace(".", ",");
}

function formatSourceLabel(source) {
  return source.replace(/([A-Z])/g, " $1").toUpperCase();
}

function getFormLabel(speciesName) {
  const match = String(speciesName).match(/\(([^)]+)\)/);
  return match ? match[1] : "Base";
}

function getSpeciesForms(gameMaster, dex) {
  const pokemon = gameMaster.pokemon || gameMaster;
  return pokemon.filter((entry) => (
    Number(entry.dex) === dex
    && entry.baseStats
    && !/_shadow|_mega|_purified/.test(entry.speciesId)
  ));
}

// Several encounter types share the same level and IV floor, so they are merged into one row.
// A row is kept only when the scanned CP is reachable there, which keeps the output specific.
function buildSourceRows(forms, cp, trainerLevel, weatherBoost) {
  const groups = new Map();

  for (const source of Object.keys(ENCOUNTER_SOURCES)) {
    const constraints = getEncounterConstraints(source, trainerLevel, weatherBoost);
    const key = `${constraints.levels.join(",")}|${constraints.minIv}`;
    if (!groups.has(key)) groups.set(key, { constraints, sources: [] });
    groups.get(key).sources.push(formatSourceLabel(source));
  }

  const rows = [];
  for (const group of groups.values()) {
    const parts = [];
    for (const form of forms) {
      const summary = summarizePotentialIvs(calculatePotentialIvs(form.baseStats, cp, group.constraints));
      if (summary) parts.push({ label: getFormLabel(form.speciesName), summary });
    }
    if (parts.length > 0) rows.push({ label: group.sources.join(" / "), parts });
  }

  return rows;
}

async function buildResult(input) {
  const copy = getCopy(input.locale);
  const name = String(input.name || "").trim();
  const ocrText = String(input.text || input.ocr || input.ocrText || "");

  const [gameMaster, nameCatalog] = await Promise.all([getGameMaster(), getNameCatalog()]);
  const ocrMatch = name ? null : findPokemonInOcr(gameMaster, nameCatalog, ocrText);
  const pokemon = name ? findPokemon(gameMaster, nameCatalog, name) : ocrMatch?.pokemon;
  if (!pokemon?.baseStats) {
    throw new Error(formatMessage(copy.notFound, { name: name || ocrText.split(/\r?\n/)[0] || "OCR" }));
  }

  const cp = parseCp(input.cp) || parseCpFromOcr(ocrText, ocrMatch ? ocrMatch.lineIndex : -1);
  if (!Number.isInteger(cp) || cp < 10) {
    throw new Error(copy.invalidInput);
  }

  const forms = getSpeciesForms(gameMaster, Number(pokemon.dex));
  const weatherBoost = isWeatherBoosted(input, ocrText) ?? await detectWeatherBoost(pokemon.types || []) ?? false;
  const trainerLevel = getTrainerLevel(input);
  const rows = buildSourceRows(forms, cp, trainerLevel, weatherBoost);
  const displayName = pokemon.speciesName.replace(/\s*\([^)]*\)/g, "");
  if (rows.length === 0) {
    throw new Error(formatMessage(copy.noResult, { name: displayName, cp }));
  }

  const allSummaries = rows.flatMap((row) => row.parts.map((part) => part.summary));
  const maxPercent = Math.max(...allSummaries.map((summary) => summary.maxPercent));
  const decisionRow = rows.find((row) => row.label.startsWith("WILD")) ?? rows[0];
  const decisionChance = Math.max(...decisionRow.parts.map((part) => part.summary.greatChance));
  const verdict = getVerdict(decisionChance, copy);

  const body = [
    `${displayName} - ${cp} ${copy.cp} - ${copy.max} ${formatPercent(maxPercent)} %`,
    ...rows.map((row) => `${row.label} ${row.parts
      .map((part) => `${part.label} ${formatPercent(part.summary.greatChance)} %`)
      .join(" - ")}`),
    weatherBoost ? copy.boosted : null,
    copy.legend
  ].filter(Boolean).join("\n");

  return { title: `${verdict.emoji} ${verdict.text}`, body };
}

try {
  const input = parseInput();
  const result = await buildResult(input || await askForInput(getCopy("fr")));
  Script.setShortcutOutput(result);
  console.log(`${result.title}\n${result.body}`);
} catch (error) {
  const copy = getCopy("fr");
  const result = { title: `\u26A0\uFE0F ${copy.error}`, body: error.message || String(error) };
  Script.setShortcutOutput(result);
  console.log(`${result.title}\n${result.body}`);
}

Script.complete();
