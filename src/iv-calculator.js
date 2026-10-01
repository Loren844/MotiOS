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

function calculatePotentialIvs(baseStats, cp) {
    validateBaseStats(baseStats);
    if (!Number.isInteger(cp) || cp < 10) {
        throw new TypeError("cp must be an integer greater than or equal to 10");
    }

    const candidates = [];
    for (let multiplierIndex = 0; multiplierIndex < CP_MULTIPLIERS.length; multiplierIndex += 1) {
        const level = 1 + multiplierIndex / 2;
        for (let attack = 0; attack <= 15; attack += 1) {
            for (let defense = 0; defense <= 15; defense += 1) {
                for (let stamina = 0; stamina <= 15; stamina += 1) {
                    if (calculateCp(baseStats, level, attack, defense, stamina) === cp) {
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
    return {
        count: candidates.length,
        minPercent: Math.min(...percentages),
        maxPercent: Math.max(...percentages),
        best: candidates[0]
    };
}

module.exports = { CP_MULTIPLIERS, calculateCp, calculatePotentialIvs, summarizePotentialIvs };
