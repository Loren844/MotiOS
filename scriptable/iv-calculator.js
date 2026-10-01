"use strict";

const CP_MULTIPLIERS = [
    0.094, 0.135137432, 0.16639787, 0.192650919, 0.21573247, 0.236572661,
    0.25572005, 0.273530381, 0.29024988, 0.306057377, 0.3210876, 0.335445036,
    0.34921268, 0.362457751, 0.37523559, 0.387592406, 0.39956728, 0.411193551,
    0.42250001, 0.432926419, 0.44310755, 0.4530599578, 0.46279839, 0.472336083,
    0.48168495, 0.4908558, 0.49985844, 0.508701765, 0.51739395, 0.525942511,
    0.53435433, 0.542635767, 0.55079269, 0.558830576, 0.56675452, 0.574569153,
    0.58227891, 0.589887917, 0.59740001, 0.604818814, 0.61215729, 0.619404122,
    0.62656713, 0.633649143, 0.64065295, 0.647580966, 0.65443563, 0.661219252,
    0.667934, 0.674581896, 0.68116492, 0.687684904, 0.69414365, 0.70054287,
    0.70688421, 0.713169109, 0.71939909, 0.725575614, 0.7317, 0.734741009,
    0.73776948, 0.740785574, 0.74378943, 0.746781211, 0.74976104, 0.752729087,
    0.75568551, 0.758630378, 0.76156384, 0.764486065, 0.76739717, 0.770297266,
    0.7731865, 0.776064962, 0.77893275, 0.781790055, 0.78463697, 0.787473578,
    0.79030001, 0.79280395, 0.79530001, 0.79780001, 0.8003, 0.80279999,
    0.8053, 0.8078, 0.81029999, 0.81279999, 0.81529999, 0.81779999,
    0.82029999, 0.82279999, 0.82529999, 0.82779999, 0.83029999, 0.83279999,
    0.83529999, 0.83779999, 0.84029999, 0.84279999, 0.84529999
];

function validateBaseStats(baseStats) {
    for (const key of ["atk", "def", "hp"]) {
        if (!Number.isFinite(baseStats?.[key]) || baseStats[key] <= 0) {
            throw new TypeError(`baseStats.${key} must be a positive number`);
        }
    }
}

function calculateCp(baseStats, level, attackIv, defenseIv, staminaIv) {
    validateBaseStats(baseStats);
    const multiplier = CP_MULTIPLIERS[Math.round((level - 1) * 2)];
    if (!Number.isFinite(multiplier)) {
        throw new RangeError("level must be between 1 and 50 in 0.5 increments");
    }

    const attack = baseStats.atk + attackIv;
    const defense = baseStats.def + defenseIv;
    const stamina = baseStats.hp + staminaIv;
    return Math.max(10, Math.floor((attack * Math.sqrt(defense) * Math.sqrt(stamina) * multiplier ** 2) / 10));
}

// Wild encounters only roll whole levels, capped at 30 or at the trainer level below 30.
const WILD_MAX_LEVEL = 30;
const WEATHER_BOOST_LEVELS = 5;
const WEATHER_BOOST_IV_FLOOR = 4;

function getWildEncounterLevels(trainerLevel, weatherBoost) {
    const cap = Math.min(Number.isFinite(trainerLevel) ? Math.floor(trainerLevel) : WILD_MAX_LEVEL, WILD_MAX_LEVEL);
    if (cap < 1) {
        throw new RangeError("trainerLevel must be at least 1");
    }

    const boost = weatherBoost ? WEATHER_BOOST_LEVELS : 0;
    const levels = [];
    for (let level = 1 + boost; level <= cap + boost; level += 1) {
        levels.push(level);
    }
    return levels;
}

function getWildIvFloor(weatherBoost) {
    return weatherBoost ? WEATHER_BOOST_IV_FLOOR : 0;
}

// Non-wild encounters roll a fixed level, which is the strongest precision gain available.
const ENCOUNTER_SOURCES = {
    wild: { minIv: 0, boostedMinIv: WEATHER_BOOST_IV_FLOOR },
    raid: { level: 20, boostedLevel: 25, minIv: 10 },
    shadowRaid: { level: 20, boostedLevel: 25, minIv: 6 },
    research: { level: 15, minIv: 10 },
    rocket: { level: 8, boostedLevel: 13, minIv: 0, boostedMinIv: WEATHER_BOOST_IV_FLOOR },
    giovanni: { level: 8, boostedLevel: 13, minIv: 6 },
    gbl: { level: 20, minIv: 10 },
    max: { level: 20, minIv: 10 },
    egg: { trainerCappedLevel: 20, minIv: 10 }
};

function getEncounterConstraints(source, trainerLevel, weatherBoost) {
    const encounter = ENCOUNTER_SOURCES[source];
    if (!encounter) {
        throw new RangeError(`unknown encounter source: ${source}`);
    }

    if (source === "wild") {
        return {
            levels: getWildEncounterLevels(trainerLevel, weatherBoost),
            minIv: getWildIvFloor(weatherBoost)
        };
    }

    const minIv = weatherBoost && encounter.boostedMinIv !== undefined ? encounter.boostedMinIv : encounter.minIv;
    if (encounter.trainerCappedLevel !== undefined) {
        const cap = Math.min(Math.floor(trainerLevel), encounter.trainerCappedLevel);
        return { levels: [cap], minIv };
    }

    const level = weatherBoost && encounter.boostedLevel !== undefined ? encounter.boostedLevel : encounter.level;
    return { levels: [level], minIv };
}

function getAllLevels() {
    return CP_MULTIPLIERS.map((_, multiplierIndex) => 1 + multiplierIndex / 2);
}

function calculatePotentialIvs(baseStats, cp, options = {}) {
    validateBaseStats(baseStats);
    if (!Number.isInteger(cp) || cp < 10) {
        throw new TypeError("cp must be an integer greater than or equal to 10");
    }

    const levels = options.levels ?? getAllLevels();
    const minIv = options.minIv ?? 0;
    if (!Number.isInteger(minIv) || minIv < 0 || minIv > 15) {
        throw new TypeError("minIv must be an integer between 0 and 15");
    }

    const candidates = [];
    for (const level of levels) {
        const multiplier = CP_MULTIPLIERS[Math.round((level - 1) * 2)];
        if (!Number.isFinite(multiplier)) {
            throw new RangeError("level must be between 1 and 50 in 0.5 increments");
        }

        // Hoisted out of the inner loops: this runs across every source and form on each scan.
        const multiplierSquared = multiplier ** 2;
        for (let attack = minIv; attack <= 15; attack += 1) {
            const attackStat = baseStats.atk + attack;
            for (let defense = minIv; defense <= 15; defense += 1) {
                const defenseRoot = Math.sqrt(baseStats.def + defense);
                for (let stamina = minIv; stamina <= 15; stamina += 1) {
                    const staminaRoot = Math.sqrt(baseStats.hp + stamina);
                    const value = Math.max(10, Math.floor((attackStat * defenseRoot * staminaRoot * multiplierSquared) / 10));
                    if (value === cp) {
                        candidates.push({
                            level,
                            attack,
                            defense,
                            stamina,
                            percent: ((attack + defense + stamina) / 45) * 100
                        });
                    }
                }
            }
        }
    }

    candidates.sort((left, right) => right.percent - left.percent || right.level - left.level);
    return candidates;
}

function summarizePotentialIvs(candidates) {
    if (candidates.length === 0) {
        return null;
    }

    const percentages = candidates.map((candidate) => candidate.percent);
    const levels = candidates.map((candidate) => candidate.level);
    const sorted = [...percentages].sort((left, right) => left - right);
    // Every surviving level/IV combination is equally likely, so a share is a probability.
    const shareAtLeast = (threshold) => (
        (percentages.filter((percent) => percent >= threshold).length / percentages.length) * 100
    );

    return {
        count: candidates.length,
        minPercent: sorted[0],
        maxPercent: sorted[sorted.length - 1],
        medianPercent: sorted[Math.floor(sorted.length / 2)],
        greatChance: shareAtLeast(80),
        excellentChance: shareAtLeast(90),
        perfectChance: shareAtLeast(100),
        minLevel: Math.min(...levels),
        maxLevel: Math.max(...levels),
        best: candidates[0],
        worst: candidates[candidates.length - 1]
    };
}

module.exports = {
    CP_MULTIPLIERS,
    calculateCp,
    calculatePotentialIvs,
    summarizePotentialIvs,
    getWildEncounterLevels,
    getWildIvFloor,
    getEncounterConstraints,
    ENCOUNTER_SOURCES
};
