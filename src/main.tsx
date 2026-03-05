import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import JigsawPuzzle from "./JigsawPuzzle";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <JigsawPuzzle
      imageUrl="https://picsum.photos/seed/puzzle/800/600"
      boardWidth={800}
      boardHeight={600}
      pieceCount={5}
      onComplete={() => console.log("Puzzle complete!")}
    />
  </StrictMode>,
);
