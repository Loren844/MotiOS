// Scriptable script. Save this file as "MotiOS" and iv-calculator.js as "iv-calculator".

const {
  calculatePotentialIvs,
  summarizePotentialIvs,
  getEncounterConstraints
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

const REGIONAL_FORMS = [
  { pattern: /alola/i, suffix: "alolan" },
  { pattern: /galar/i, suffix: "galarian" },
  { pattern: /hisui/i, suffix: "hisuian" },
  { pattern: /paldea/i, suffix: "paldean" }
];

const COPY = {
  fr: {
    title: "MotiOS",
    name: "Nom",
    cp: "PC",
    calculate: "Calculer",
    invalidInput: "Nom ou PC invalide.",
    noResult: "Aucune combinaison IV trouvee pour {name} a {cp} PC.",
    notFound: "Pokemon introuvable : {name}. Verifie le texte lu par l'OCR.",
    combinations: "combinaisons possibles",
    range: "IV possibles",
    median: "IV median",
    great: "Chance IV >= 80 %",
    excellent: "Chance IV >= 90 %",
    perfect: "Chance de 100 %",
    best: "Meilleur cas",
    worst: "Pire cas",
    level: "Niveau",
    boosted: "Meteo boostee",
    verdictKeep: "A garder",
    verdictMaybe: "A verifier apres capture",
    verdictSkip: "Peu interessant",
    close: "OK"
  },
  en: {
    title: "MotiOS",
    name: "Name",
    cp: "CP",
    calculate: "Calculate",
    invalidInput: "Invalid name or CP.",
    noResult: "No IV combination found for {name} at {cp} CP.",
    notFound: "Pokemon not found: {name}. Check the OCR text.",
    combinations: "possible combinations",
    range: "Possible IVs",
    median: "Median IV",
    great: "Chance IV >= 80%",
    excellent: "Chance IV >= 90%",
    perfect: "Chance of 100%",
    best: "Best case",
    worst: "Worst case",
    level: "Level",
    boosted: "Weather boosted",
    verdictKeep: "Worth keeping",
    verdictMaybe: "Check after catching",
    verdictSkip: "Low value",
    close: "OK"
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
  const match = String(value || "").match(/(?:PC|CP)\s*[:.]?\s*(\d{1,5})/i);
  return match ? Number.parseInt(match[1], 10) : Number.parseInt(String(value || "").replace(/\D/g, ""), 10);
}

function findPokemonInOcr(gameMaster, nameCatalog, text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/(?:PC|CP)\s*[:.]?\s*\d{1,5}/gi, "").trim())
    .filter(Boolean);

  for (const line of lines) {
    const pokemon = findPokemon(gameMaster, nameCatalog, line);
    if (pokemon) return { pokemon, name: line };
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
  return /meteo|weather|boost/i.test(ocrText);
}

function getVerdict(summary, copy) {
  if (summary.greatChance >= 50) return copy.verdictKeep;
  if (summary.greatChance >= 10) return copy.verdictMaybe;
  return copy.verdictSkip;
}

function formatPercent(value) {
  return value.toFixed(1).replace(".", ",");
}

async function showResult(input) {
  const copy = getCopy(input.locale);
  const name = String(input.name || "").trim();
  const ocrText = String(input.text || input.ocr || input.ocrText || "");
  const cp = parseCp(input.cp) || parseCp(ocrText);
  if (!Number.isInteger(cp) || cp < 10) {
    throw new Error(copy.invalidInput);
  }

  const [gameMaster, nameCatalog] = await Promise.all([getGameMaster(), getNameCatalog()]);
  const ocrMatch = name ? null : findPokemonInOcr(gameMaster, nameCatalog, ocrText);
  const pokemon = name ? findPokemon(gameMaster, nameCatalog, name) : ocrMatch?.pokemon;
  const displayName = pokemon?.speciesName || name || ocrMatch?.name || "OCR";
  if (!pokemon?.baseStats) {
    throw new Error(formatMessage(copy.notFound, { name: name || ocrText.split(/\r?\n/)[0] || "OCR" }));
  }

  const weatherBoost = isWeatherBoosted(input, ocrText);
  const trainerLevel = getTrainerLevel(input);
  const source = String(input.source || "wild").toLowerCase();
  const constraints = getEncounterConstraints(source, trainerLevel, weatherBoost);
  const summary = summarizePotentialIvs(calculatePotentialIvs(pokemon.baseStats, cp, constraints));
  if (!summary) {
    throw new Error(formatMessage(copy.noResult, { name: displayName, cp }));
  }

  const best = summary.best;
  const worst = summary.worst;
  const levelRange = summary.minLevel === summary.maxLevel
    ? `${summary.minLevel}`
    : `${summary.minLevel} - ${summary.maxLevel}`;
  const alert = new Alert();
  alert.title = `${displayName} - ${cp} ${copy.cp}`;
  alert.message = [
    getVerdict(summary, copy),
    `${copy.great}: ${formatPercent(summary.greatChance)} %`,
    `${copy.excellent}: ${formatPercent(summary.excellentChance)} %`,
    `${copy.perfect}: ${formatPercent(summary.perfectChance)} %`,
    `${copy.median}: ${formatPercent(summary.medianPercent)} %`,
    `${copy.range}: ${formatPercent(summary.minPercent)} a ${formatPercent(summary.maxPercent)} %`,
    `${copy.best}: ${best.attack}/${best.defense}/${best.stamina}`,
    `${copy.worst}: ${worst.attack}/${worst.defense}/${worst.stamina}`,
    `${copy.level}: ${levelRange}`,
    `${summary.count} ${copy.combinations}${weatherBoost ? ` - ${copy.boosted}` : ""}`
  ].join("\n");
  alert.addAction(copy.close);
  await alert.presentAlert();
}

try {
  const input = parseInput();
  await showResult(input || await askForInput(getCopy("fr")));
} catch (error) {
  const alert = new Alert();
  alert.title = "MotiOS";
  alert.message = error.message || String(error);
  alert.addAction("OK");
  await alert.presentAlert();
}
