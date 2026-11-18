export interface SetupSeat {
  name: string;
  kind: "human" | "bot";
  token: string;
  color: string;
}

export function validateSetupSeats(seats: readonly SetupSeat[]): string[] {
  const errors: string[] = [];
  if (seats.length < 2 || seats.length > 6) errors.push("count");
  if (!seats.some((seat) => seat.kind === "human")) errors.push("human");
  if (seats.some((seat) => !seat.name.trim())) errors.push("nameRequired");
  const names = seats.map((seat) => seat.name.trim().toLocaleLowerCase());
  if (new Set(names).size !== names.length) errors.push("nameUnique");
  if (new Set(seats.map((seat) => seat.token)).size !== seats.length) errors.push("tokenUnique");
  if (new Set(seats.map((seat) => seat.color)).size !== seats.length) errors.push("colorUnique");
  return errors;
}
