// Scriptable script. Save this file as "MotiOS" and iv-calculator.js as "iv-calculator".

const { calculatePotentialIvs, summarizePotentialIvs } = importModule("iv-calculator");

const GAME_MASTER_URL = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json";
const SPECIES_NAMES_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
const GAME_MASTER_CACHE_FILE = "motios-gamemaster.json";
const NAME_CATALOG_CACHE_FILE = "motios-species-names.json";
const GAME_MASTER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NAME_CATALOG_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
    best: "Meilleur cas",
    level: "Niveau possible",
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
    best: "Best case",
    level: "Possible level",
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
      throw new Error("Le parametre du raccourci doit etre du JSON, par exemple {\"name\":\"Pikachu\",\"cp\":523}.");
    }
  }

  if (args.queryParameters.name && args.queryParameters.cp) {
    return { name: args.queryParameters.name, cp: args.queryParameters.cp };
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
  const wantedName = normalizeName(pokemonName);
  const pokemon = gameMaster.pokemon || gameMaster;
  if (!Array.isArray(pokemon)) throw new Error("Format du Game Master inattendu.");

  const directMatch = pokemon.find((entry) => (
    normalizeName(entry.speciesName) === wantedName
    || normalizeName(entry.speciesId) === wantedName
    || normalizeName(entry.name) === wantedName
  ));
  if (directMatch) return directMatch;

  const dex = nameCatalog[wantedName];
  return pokemon.find((entry) => Number(entry.dex) === dex);
}

function formatPercent(value) {
  return value.toFixed(1).replace(".", ",");
}

async function showResult(input) {
  const copy = getCopy(input.locale);
  const name = String(input.name || "").trim();
  const cp = Number.parseInt(String(input.cp || "").replace(/\D/g, ""), 10);
  if (!name || !Number.isInteger(cp) || cp < 10) {
    throw new Error(copy.invalidInput);
  }

  const [gameMaster, nameCatalog] = await Promise.all([getGameMaster(), getNameCatalog()]);
  const pokemon = findPokemon(gameMaster, nameCatalog, name);
  if (!pokemon?.baseStats) {
    throw new Error(formatMessage(copy.notFound, { name }));
  }

  const summary = summarizePotentialIvs(calculatePotentialIvs(pokemon.baseStats, cp));
  if (!summary) {
    throw new Error(formatMessage(copy.noResult, { name, cp }));
  }

  const best = summary.best;
  const alert = new Alert();
  alert.title = `${name} - ${cp} ${copy.cp}`;
  alert.message = [
    `${summary.count} ${copy.combinations}`,
    `${copy.range}: ${formatPercent(summary.minPercent)} a ${formatPercent(summary.maxPercent)} %`,
    `${copy.best}: ${best.attack}/${best.defense}/${best.stamina} (${formatPercent(best.percent)} %)`,
    `${copy.level}: ${best.level}`
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
