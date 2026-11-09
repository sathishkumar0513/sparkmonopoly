import { lazy, Suspense, useState } from "react";
import { useGameStore } from "./store/gameStore";
import type { BotSpeed } from "./screens/GameScreen";

const GameScreen = lazy(() =>
  import("./screens/GameScreen").then((module) => ({ default: module.GameScreen })),
);
const DevSetup = lazy(() =>
  import("./screens/DevSetup").then((module) => ({ default: module.DevSetup })),
);

export default function App() {
  const game = useGameStore((store) => store.state);
  const startGame = useGameStore((store) => store.startGame);
  const [botSpeed, setBotSpeed] = useState<BotSpeed>("normal");

  return (
    <Suspense fallback={<main className="loading-screen">Preparing the business table…</main>}>
      {game
        ? <GameScreen botSpeed={botSpeed} />
        : <DevSetup onStart={(nextGame, speed) => {
            setBotSpeed(speed);
            startGame(nextGame);
          }} />}
    </Suspense>
  );
}
