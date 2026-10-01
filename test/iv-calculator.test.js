"use strict";

const assert = require("node:assert/strict");
const {
    calculateCp,
    calculatePotentialIvs,
    summarizePotentialIvs,
    getWildEncounterLevels,
    getWildIvFloor,
    getEncounterConstraints
} = require("../src/iv-calculator");

const pikachu = { atk: 112, def: 96, hp: 111 };
const expected = { level: 20, attack: 13, defense: 14, stamina: 15 };
const cp = calculateCp(pikachu, expected.level, expected.attack, expected.defense, expected.stamina);
const candidates = calculatePotentialIvs(pikachu, cp);

assert.ok(candidates.some((candidate) => (
    candidate.level === expected.level &&
    candidate.attack === expected.attack &&
    candidate.defense === expected.defense &&
    candidate.stamina === expected.stamina
)));

const summary = summarizePotentialIvs(candidates);
assert.ok(summary.count > 0);
assert.ok(summary.maxPercent >= 93);
assert.ok(summary.minPercent <= summary.medianPercent && summary.medianPercent <= summary.maxPercent);
assert.ok(summary.greatChance >= summary.excellentChance);
assert.ok(summary.excellentChance >= summary.perfectChance);
assert.ok(summary.greatChance >= 0 && summary.greatChance <= 100);

assert.deepEqual(getWildEncounterLevels(24, false).at(-1), 24);
assert.deepEqual(getWildEncounterLevels(40, false).at(-1), 30);
assert.deepEqual(getWildEncounterLevels(40, true), Array.from({ length: 30 }, (_, index) => index + 6));
assert.equal(getWildIvFloor(true), 4);
assert.equal(getWildIvFloor(false), 0);

const wildLevels = getWildEncounterLevels(40, false);
const wildCandidates = calculatePotentialIvs(pikachu, cp, { levels: wildLevels });
assert.ok(wildCandidates.length < candidates.length);
assert.ok(wildCandidates.every((candidate) => Number.isInteger(candidate.level) && candidate.level <= 30));

const boostedCandidates = calculatePotentialIvs(pikachu, cp, {
    levels: getWildEncounterLevels(40, true),
    minIv: getWildIvFloor(true)
});
assert.ok(boostedCandidates.every((candidate) => candidate.attack >= 4 && candidate.defense >= 4 && candidate.stamina >= 4));

assert.deepEqual(getEncounterConstraints("raid", 30, false), { levels: [20], minIv: 10 });
assert.deepEqual(getEncounterConstraints("raid", 30, true), { levels: [25], minIv: 10 });
assert.deepEqual(getEncounterConstraints("research", 30, false), { levels: [15], minIv: 10 });
assert.deepEqual(getEncounterConstraints("egg", 12, false), { levels: [12], minIv: 10 });
assert.deepEqual(getEncounterConstraints("egg", 40, false), { levels: [20], minIv: 10 });
assert.deepEqual(getEncounterConstraints("rocket", 30, true), { levels: [13], minIv: 4 });
assert.deepEqual(getEncounterConstraints("wild", 30, false).levels.at(-1), 30);
assert.throws(() => getEncounterConstraints("unknown", 30, false), RangeError);

const raidCp = calculateCp(pikachu, 20, 12, 13, 14);
const raidCandidates = calculatePotentialIvs(pikachu, raidCp, getEncounterConstraints("raid", 30, false));
assert.ok(raidCandidates.length < wildCandidates.length);
assert.ok(raidCandidates.every((candidate) => candidate.level === 20 && candidate.attack >= 10));

console.log(`OK: ${candidates.length} combinations unfiltered, ${wildCandidates.length} as a wild encounter at ${cp} CP, ${raidCandidates.length} as a raid at ${raidCp} CP.`);
