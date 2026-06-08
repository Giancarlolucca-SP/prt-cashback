import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PARAMS = {
  cost: 16384,
  blockSize: 8,
  parallelization: 1,
  keyLength: 64,
};

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.cost,
    r: SCRYPT_PARAMS.blockSize,
    p: SCRYPT_PARAMS.parallelization,
  }).toString("hex");

  return `scrypt:${SCRYPT_PARAMS.cost}:${SCRYPT_PARAMS.blockSize}:${SCRYPT_PARAMS.parallelization}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, cost, blockSize, parallelization, salt, expectedHash] = storedHash.split(":");

  if (algorithm !== "scrypt" || !cost || !blockSize || !parallelization || !salt || !expectedHash) {
    return false;
  }

  const actual = scryptSync(password, salt, Buffer.from(expectedHash, "hex").length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
  });
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
