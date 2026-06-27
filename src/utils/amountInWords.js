// Indian-system "amount in words" (Rupees ... [and ... Paise] Only) — used by the
// Purchase Order document (the RDLC's numWord report parameter / AmtInWord).
// e.g. 88000  -> "RUPEES EIGHTY EIGHT THOUSAND ONLY"
//      1234.5 -> "RUPEES ONE THOUSAND TWO HUNDRED THIRTY FOUR AND FIFTY PAISE ONLY"

const ONES = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

// 0..999 -> words
const twoOrThree = (n) => {
  let out = "";
  if (n >= 100) {
    out += `${ONES[Math.floor(n / 100)]} HUNDRED`;
    n %= 100;
    if (n) out += " ";
  }
  if (n >= 20) {
    out += TENS[Math.floor(n / 10)];
    if (n % 10) out += ` ${ONES[n % 10]}`;
  } else if (n > 0) {
    out += ONES[n];
  }
  return out;
};

// Whole rupees -> words, grouped Indian-style (crore / lakh / thousand / hundred).
const wholeToWords = (num) => {
  if (num === 0) return "ZERO";
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const rest = num; // 0..999

  const parts = [];
  if (crore) parts.push(`${wholeToWords(crore)} CRORE`);
  if (lakh) parts.push(`${twoOrThree(lakh)} LAKH`);
  if (thousand) parts.push(`${twoOrThree(thousand)} THOUSAND`);
  if (rest) parts.push(twoOrThree(rest));
  return parts.join(" ").trim();
};

export const amountInWords = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const sign = n < 0 ? "MINUS " : "";
  const abs = Math.abs(n);
  const rupees = Math.floor(abs + 1e-9);
  const paise = Math.round((abs - rupees) * 100);
  let words = `RUPEES ${wholeToWords(rupees)}`;
  if (paise > 0) words += ` AND ${twoOrThree(paise)} PAISE`;
  return `${sign}${words} ONLY`;
};

export default amountInWords;
