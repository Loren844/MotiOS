"use strict";

const assert = require("node:assert/strict");
const { calculateCp, calculatePotentialIvs, summarizePotentialIvs } = require("../src/iv-calculator");

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
console.log(`OK: ${candidates.length} combinations found for Pikachu at ${cp} CP.`);
