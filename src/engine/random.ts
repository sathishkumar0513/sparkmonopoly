export function nextRandom(state: number): { value: number; state: number } {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return { value: next / 0x1_0000_0000, state: next };
}

export function shuffle<T>(
  values: readonly T[],
  initialState: number,
): { values: T[]; state: number } {
  const shuffled = [...values];
  let state = initialState >>> 0;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = nextRandom(state);
    state = random.state;
    const swapIndex = Math.floor(random.value * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return { values: shuffled, state };
}
