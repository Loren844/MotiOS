// Standalone Scriptable script. Save this file as "MotiOS Events". No dependency on MotiOS or iv-calculator.
// Lists every Pokemon GO event currently active, based on the iPhone's local date and time.

const EVENTS_URL = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.min.json";
const EVENTS_CACHE_FILE = "motios-events.json";
// GitHub caches this feed for 5 minutes server-side; polling more often is pointless.
const EVENTS_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

const COPY = {
  fr: {
    title: "Evenements en cours",
    none: "Aucun evenement en cours.",
    from: "Depuis le",
    until: "Jusqu'au",
    ongoing: "Pas de fin connue",
    bonus: "Bonus",
    breakthrough: "Recherche",
    spawns: "Spawns",
    bosses: "Boss de raid",
    close: "Fermer"
  },
  en: {
    title: "Active events",
    none: "No event is currently active.",
    from: "Since",
    until: "Until",
    ongoing: "No known end",
    bonus: "Bonus",
    breakthrough: "Research",
    spawns: "Spawns",
    bosses: "Raid bosses",
    close: "Close"
  }
};

function getCopy(locale) {
  return COPY[String(locale || "fr").toLowerCase().startsWith("en") ? "en" : "fr"];
}

function getInputLocale() {
  const parameter = args.shortcutParameter;
  if (parameter && typeof parameter === "object" && parameter.locale) return parameter.locale;
  if (typeof parameter === "string") {
    try {
      return JSON.parse(parameter).locale;
    } catch (_) {
      return undefined;
    }
  }
  return args.queryParameters?.locale;
}

function getCachePath() {
  return FileManager.local().joinPath(FileManager.local().documentsDirectory(), EVENTS_CACHE_FILE);
}

function readFreshCache() {
  const fileManager = FileManager.local();
  const cachePath = getCachePath();
  const hasFreshCache = fileManager.fileExists(cachePath)
    && Date.now() - fileManager.modificationDate(cachePath).getTime() < EVENTS_CACHE_MAX_AGE_MS;

  return hasFreshCache ? JSON.parse(fileManager.readString(cachePath)) : null;
}

function readCache() {
  const fileManager = FileManager.local();
  const cachePath = getCachePath();
  return fileManager.fileExists(cachePath) ? JSON.parse(fileManager.readString(cachePath)) : null;
}

function writeCache(value) {
  FileManager.local().writeString(getCachePath(), JSON.stringify(value));
}

async function getEvents() {
  const freshCache = readFreshCache();
  if (freshCache) return freshCache;

  try {
    const events = await new Request(EVENTS_URL).loadJSON();
    writeCache(events);
    return events;
  } catch (error) {
    const cache = readCache();
    if (cache) return cache;
    throw new Error("Impossible de telecharger les evenements Pokemon GO. Verifie ta connexion Internet.");
  }
}

// Event dates are ISO 8601; the Date object compares them against the phone's local clock.
// Some feed entries (recurring Raid Hours in particular) have both dates null: the feed
// gives no evidence they are happening right now, so they must not be treated as active.
function isEventActive(event, now) {
  if (!event.start && !event.end) return false;
  if (event.start && new Date(event.start) > now) return false;
  if (event.end && new Date(event.end) < now) return false;
  return true;
}

function formatDateTime(iso) {
  const formatter = new DateFormatter();
  formatter.useShortDateStyle();
  formatter.useShortTimeStyle();
  return formatter.string(new Date(iso));
}

function getDateRange(event, copy) {
  const start = event.start ? `${copy.from} ${formatDateTime(event.start)}` : null;
  const end = event.end ? `${copy.until} ${formatDateTime(event.end)}` : copy.ongoing;
  return [start, end].filter(Boolean).join(" - ");
}

function getEventDetails(event, copy) {
  const extra = event.extraData || {};

  if (extra.spotlight) {
    return `${copy.bonus}: ${extra.spotlight.name}${extra.spotlight.bonus ? ` (${extra.spotlight.bonus})` : ""}`;
  }
  if (extra.breakthrough) {
    return `${copy.breakthrough}: ${extra.breakthrough.name}`;
  }
  if (extra.communityday?.spawns?.length) {
    return `${copy.spawns}: ${extra.communityday.spawns.map((spawn) => spawn.name).join(", ")}`;
  }
  if (extra.raidbattles?.bosses?.length) {
    return `${copy.bosses}: ${extra.raidbattles.bosses.map((boss) => boss.name).join(", ")}`;
  }
  return null;
}

function formatEventBlock(event, copy) {
  return [
    `${event.name} (${event.heading || event.eventType})`,
    getDateRange(event, copy),
    getEventDetails(event, copy)
  ].filter(Boolean).join("\n");
}

function sortByEndDate(events) {
  return [...events].sort((left, right) => {
    const leftEnd = left.end ? new Date(left.end).getTime() : Infinity;
    const rightEnd = right.end ? new Date(right.end).getTime() : Infinity;
    return leftEnd - rightEnd;
  });
}

async function main() {
  const copy = getCopy(getInputLocale());
  const events = await getEvents();
  const now = new Date();
  const activeEvents = sortByEndDate(events.filter((event) => isEventActive(event, now)));

  const alert = new Alert();
  alert.title = copy.title;
  alert.message = activeEvents.length === 0
    ? copy.none
    : activeEvents.map((event) => formatEventBlock(event, copy)).join("\n\n");
  alert.addAction(copy.close);
  await alert.presentAlert();
}

try {
  await main();
} catch (error) {
  const alert = new Alert();
  alert.title = "MotiOS Events";
  alert.message = error.message || String(error);
  alert.addAction("OK");
  await alert.presentAlert();
}
