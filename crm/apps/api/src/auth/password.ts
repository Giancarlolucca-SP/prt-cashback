import { scryptSync, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";

const SCRYPT_PARAMS = {
  cost: 16384,
  blockSize: 8,
  parallelization: 1,
  keyLength: 64,
};

const ARGON2ID_PARAMS = {
  memoryCost: 19456,
  parallelism: 1,
  timeCost: 2,
};

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    memoryCost: ARGON2ID_PARAMS.memoryCost,
    parallelism: ARGON2ID_PARAMS.parallelism,
    timeCost: ARGON2ID_PARAMS.timeCost,
    type: argon2.argon2id,
  });
}

function verifyLegacyScryptPassword(password: string, storedHash: string) {
  const [algorithm, cost, blockSize, parallelization, legacySalt, expectedHash] = storedHash.split(":");

  if (algorithm !== "scrypt" || !cost || !blockSize || !parallelization || !legacySalt || !expectedHash) {
    return false;
  }

  const actual = scryptSync(password, legacySalt, Buffer.from(expectedHash, "hex").length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
  });
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function verifyPassword(password: string, storedHash: string) {
  if (storedHash.startsWith("$argon2id$")) {
    return argon2.verify(storedHash, password);
  }

  return verifyLegacyScryptPassword(password, storedHash);
}

export function passwordNeedsRehash(storedHash: string) {
  return !storedHash.startsWith("$argon2id$");
}
