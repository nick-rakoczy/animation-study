export interface Rational {
  readonly numerator: string;
  readonly denominator: string;
}

export function parseRational(value: string, field: string): Rational {
  const match = /^(-?\d+)\/(\d+)$/.exec(value);
  if (!match || match[2] === "0") {
    throw new Error(`Invalid rational ${field}: ${value}`);
  }
  return normalizeRational(BigInt(match[1]!), BigInt(match[2]!));
}

export function rationalFromTicks(ticks: bigint, timeBase: Rational): Rational {
  return normalizeRational(ticks * BigInt(timeBase.numerator), BigInt(timeBase.denominator));
}

export function subtractRationals(left: Rational, right: Rational): Rational {
  const leftNumerator = BigInt(left.numerator);
  const leftDenominator = BigInt(left.denominator);
  const rightNumerator = BigInt(right.numerator);
  const rightDenominator = BigInt(right.denominator);
  return normalizeRational(
    leftNumerator * rightDenominator - rightNumerator * leftDenominator,
    leftDenominator * rightDenominator,
  );
}

export function compareRationals(left: Rational, right: Rational): number {
  const difference =
    BigInt(left.numerator) * BigInt(right.denominator) -
    BigInt(right.numerator) * BigInt(left.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function invertRational(value: Rational): Rational {
  const numerator = BigInt(value.numerator);
  if (numerator <= 0n) {
    throw new Error("Cannot invert a non-positive rational");
  }
  return normalizeRational(BigInt(value.denominator), numerator);
}

export function rationalToSeconds(value: Rational): number {
  return Number(value.numerator) / Number(value.denominator);
}

function normalizeRational(numerator: bigint, denominator: bigint): Rational {
  if (denominator === 0n) throw new Error("A rational denominator cannot be zero");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: (numerator / divisor).toString(),
    denominator: (denominator / divisor).toString(),
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  left = left < 0n ? -left : left;
  while (right !== 0n) {
    [left, right] = [right, left % right];
  }
  return left === 0n ? 1n : left;
}
