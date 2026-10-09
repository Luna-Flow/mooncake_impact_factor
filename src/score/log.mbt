// Natural logarithm built only from IEEE 754 basic operations and bit
// manipulation, so that it returns the same value on every backend.
//
// `@math.ln` forwards to the platform's `Math.log` on the js backend and to a
// MoonBit port on the others, so the two may differ in the last bit (core
// audit, finding A1). Scores are compared and ranked, and a one-ulp
// difference can swap two packages, so the score uses this port of the
// FreeBSD msun `e_log.c` (fdlibm, Sun Microsystems, 1993) instead.

///|
const LN2_HI : Double = 6.93147180369123816490e-01

///|
const LN2_LO : Double = 1.90821492927058770002e-10

///|
const TWO54 : Double = 1.80143985094819840000e+16

///|
const LG1 : Double = 6.666666666666735130e-01

///|
const LG2 : Double = 3.999999999940941908e-01

///|
const LG3 : Double = 2.857142874366239149e-01

///|
const LG4 : Double = 2.222219843214978396e-01

///|
const LG5 : Double = 1.818357216161805012e-01

///|
const LG6 : Double = 1.531383769920937332e-01

///|
const LG7 : Double = 1.479819860511658591e-01

///|
fn high_word(x : Double) -> Int {
  (x.reinterpret_as_uint64() >> 32).to_int()
}

///|
fn low_word(x : Double) -> UInt {
  x.reinterpret_as_uint64().to_uint()
}

///|
fn with_high_word(x : Double, high : Int) -> Double {
  let low = x.reinterpret_as_uint64() & 0xFFFFFFFFUL
  ((high.to_uint64() << 32) | low).reinterpret_as_double()
}

///|
/// Returns the natural logarithm of `x`, with the special values of IEEE 754:
/// `ln(±0) = -inf`, `ln(x) = NaN` for `x < 0` and `ln(+inf) = +inf`.
/// The result is the same on every backend; the error is below 1 ulp.
pub fn ln(x : Double) -> Double {
  let mut x = x
  let mut hx = high_word(x)
  let lx = low_word(x)
  let mut k = 0
  if hx < 0x00100000 {
    if ((hx & 0x7fffffff).reinterpret_as_uint() | lx) == 0 {
      return @double.neg_infinity
    }
    if hx < 0 {
      return @double.not_a_number
    }
    // Subnormal: scale up.
    k = k - 54
    x = x * TWO54
    hx = high_word(x)
  }
  if hx >= 0x7ff00000 {
    return x + x
  }
  k = k + ((hx >> 20) - 1023)
  hx = hx & 0x000fffff
  let i0 = (hx + 0x95f64) & 0x100000
  // Normalise x or x/2 into [sqrt(2)/2, sqrt(2)).
  x = with_high_word(x, hx | (i0 ^ 0x3ff00000))
  k = k + (i0 >> 20)
  let f = x - 1.0
  let dk = k.to_double()
  if (0x000fffff & (2 + hx)) < 3 {
    // |f| < 2^-20
    if f == 0.0 {
      return if k == 0 { 0.0 } else { dk * LN2_HI + dk * LN2_LO }
    }
    let r = f * f * (0.5 - 0.33333333333333333 * f)
    return if k == 0 { f - r } else { dk * LN2_HI - (r - dk * LN2_LO - f) }
  }
  let s = f / (2.0 + f)
  let z = s * s
  let w = z * z
  let i = (hx - 0x6147a) | (0x6b851 - hx)
  let t1 = w * (LG2 + w * (LG4 + w * LG6))
  let t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)))
  let r = t2 + t1
  if i > 0 {
    let hfsq = 0.5 * f * f
    if k == 0 {
      f - (hfsq - s * (hfsq + r))
    } else {
      dk * LN2_HI - (hfsq - (s * (hfsq + r) + dk * LN2_LO) - f)
    }
  } else if k == 0 {
    f - s * (f - r)
  } else {
    dk * LN2_HI - (s * (f - r) - dk * LN2_LO - f)
  }
}
