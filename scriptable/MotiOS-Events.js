// Standalone Scriptable script. Save this file as "MotiOS Events". No dependency on MotiOS or iv-calculator.
// Lists every Pokemon GO event currently active, based on the iPhone's local date and time.

const EVENTS_URL = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.min.json";
const EVENTS_CACHE_FILE = "motios-events.json";
// GitHub caches this feed for 5 minutes server-side; polling more often is pointless.
const EVENTS_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

const COPY = {
    fr: {
        title: "Evenements en cours",
        none: "Aucun bonus en cours.",
        shinyBoosted: "SHINY chances augmentees",
        shinyRaid: "SHINY en raid",
        shinyResearch: "SHINY en percee de recherche",
        error: "Erreur"
    },
    en: {
        title: "Active events",
        none: "No active bonus.",
        shinyBoosted: "SHINY boosted odds",
        shinyRaid: "SHINY in raids",
        shinyResearch: "SHINY from research breakthrough",
        error: "Error"
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

// The feed exposes bonuses only through spotlight hours and community days; plain events
// carry no bonus field, so nothing can be listed for them.
function collectHighlights(events, copy) {
    const highlights = [];

    for (const event of events) {
        const extra = event.extraData || {};

        if (extra.spotlight) {
            if (extra.spotlight.bonus) highlights.push(extra.spotlight.bonus);
            if (extra.spotlight.canBeShiny) highlights.push(`${extra.spotlight.name} ${copy.shinyBoosted}`);
        }

        if (extra.breakthrough?.canBeShiny) {
            highlights.push(`${extra.breakthrough.name} ${copy.shinyResearch}`);
        }

        for (const bonus of extra.communityday?.bonuses || []) {
            if (bonus.text) highlights.push(bonus.text);
        }
        for (const shiny of extra.communityday?.shinies || []) {
            highlights.push(`${shiny.name} ${copy.shinyBoosted}`);
        }
        for (const shiny of extra.raidbattles?.shinies || []) {
            highlights.push(`${shiny.name} ${copy.shinyRaid}`);
        }
    }

    return [...new Set(highlights)];
}

async function buildResult() {
    const copy = getCopy(getInputLocale());
    const events = await getEvents();
    const now = new Date();
    const activeEvents = events.filter((event) => isEventActive(event, now));
    const highlights = collectHighlights(activeEvents, copy);

    return {
        title: copy.title,
        body: highlights.length === 0 ? copy.none : highlights.join("\n")
    };
}

try {
    const result = await buildResult();
    Script.setShortcutOutput(result);
    console.log(`${result.title}\n${result.body}`);
} catch (error) {
    const result = { title: `\u26A0\uFE0F ${getCopy(getInputLocale()).error}`, body: error.message || String(error) };
    Script.setShortcutOutput(result);
    console.log(`${result.title}\n${result.body}`);
}

Script.complete();
