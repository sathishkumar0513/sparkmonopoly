import type { Theme } from "./themeSchema";

export function formatMoney(
  amount: number,
  currency: Theme["currency"],
  language = "en",
): string {
  const absolute = Math.abs(amount);
  const locale = language === "ta" ? "ta-IN" : "en-IN";
  let value: string;
  let suffix = "";

  if (currency.shortScale.crore && absolute >= 10_000_000) {
    value = compactNumber(absolute / 10_000_000, locale);
    suffix = currency.shortScale.crore;
  } else if (currency.shortScale.lakh && absolute >= 100_000) {
    value = compactNumber(absolute / 100_000, locale);
    suffix = currency.shortScale.lakh;
  } else if (absolute >= 1_000_000_000) {
    value = compactNumber(absolute / 1_000_000_000, locale);
    suffix = currency.shortScale.billion;
  } else if (absolute >= 1_000_000) {
    value = compactNumber(absolute / 1_000_000, locale);
    suffix = currency.shortScale.million;
  } else if (absolute >= 10_000) {
    value = compactNumber(absolute / 1_000, locale);
    suffix = currency.shortScale.thousand;
  } else {
    value = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(absolute);
  }

  const sign = amount < 0 ? "−" : "";
  const formatted = currency.format === "before"
    ? `${sign}${currency.symbol}${value}${suffix}`
    : `${sign}${value}${suffix}${currency.symbol}`;
  return formatted;
}

function compactNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}
