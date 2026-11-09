import { useEffect } from "react";
import { GameScreen } from "./screens/GameScreen";
import { useGameStore } from "./store/gameStore";
import { createGame } from "./engine/gameReducer";
import internationalTheme from "./themes/international.json";

export default function App() {
  const game = useGameStore((store) => store.state);
  const startGame = useGameStore((store) => store.startGame);

  useEffect(() => {
    if (!game) {
      startGame(
        createGame(
          internationalTheme,
          [
            { id: "player-1", name: "Alex" },
            { id: "player-2", name: "Jordan" },
            { id: "player-3", name: "Sam" },
          ],
          { seed: 20261109 },
        ),
      );
    }
  }, [game, startGame]);

  if (!game) return <main className="loading-screen">Preparing the board…</main>;
  return <GameScreen />;
}
