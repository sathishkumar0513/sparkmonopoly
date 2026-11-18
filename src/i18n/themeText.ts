export function localizedName(
  value: { name: string; name_ta?: string },
  language: string,
): string {
  return language.startsWith("ta") ? value.name_ta ?? value.name : value.name;
}

export function localizedFact(
  value: { businessFact: string; fact_ta?: string },
  language: string,
): string {
  return language.startsWith("ta") ? value.fact_ta ?? value.businessFact : value.businessFact;
}

export function localizedCardText(
  value: { text: string; text_ta?: string },
  language: string,
): string {
  return language.startsWith("ta") ? value.text_ta ?? value.text : value.text;
}
