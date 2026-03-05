/**
 * JigsawPuzzle.tsx
 * Production-ready React jigsaw puzzle component.
 *
 * Stack: React 18+, TypeScript, Tailwind CSS, Pointer Events API
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Piece {
  id: string;
  correctX: number; // absolute viewport X when correctly placed (element top-left)
  correctY: number; // absolute viewport Y when correctly placed (element top-left)
  currentX: number; // current absolute viewport X
  currentY: number; // current absolute viewport Y
  row: number;
  col: number;
  path: string; // SVG clip-path string (local padded coordinates)
  isLocked: boolean;
}

export interface JigsawPuzzleProps {
  imageUrl: string;
  boardWidth: number;
  boardHeight: number;
  /** Approximate number of pieces; actual count = rows × cols ≥ 4 */
  pieceCount: number;
  onComplete?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SNAP_DISTANCE = 20; // px – snap tolerance
const Z_DRAGGING = 1000;
const Z_LOCKED = 1;
const Z_IDLE = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Audio (Web Audio API synthesised – no CORS dependencies)
// ─────────────────────────────────────────────────────────────────────────────

function getAudioContext(): AudioContext | null {
  try {
    return new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
  } catch {
    return null;
  }
}

function playSnap(ctx: AudioContext): void {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(900, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(350, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.13);
  } catch {
    /* silent */
  }
}

function playVictory(ctx: AudioContext): void {
  // Ascending C-major arpeggio: C5 E5 G5 C6
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.55);
    } catch {
      /* silent */
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Nick & time helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateNickname(): string {
  const consonants = "bcdfghjklmnpqrstvwxyz";
  const vowels = "aeiouy";
  let name = "";
  for (let i = 0; i < 3; i++) {
    name += consonants[Math.floor(Math.random() * consonants.length)];
    name += vowels[Math.floor(Math.random() * vowels.length)];
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid helpers
// ─────────────────────────────────────────────────────────────────────────────

function calcGrid(
  pieceCount: number,
  boardWidth: number,
  boardHeight: number,
): { rows: number; cols: number } {
  const aspect = boardWidth / boardHeight;
  let cols = Math.max(2, Math.round(Math.sqrt(pieceCount * aspect)));
  let rows = Math.max(2, Math.round(cols / aspect));
  // clamp so we don't create a single row/col
  if (cols < 2) cols = 2;
  if (rows < 2) rows = 2;
  return { rows, cols };
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG path generation – cubic Bézier jigsaw connectors
// ─────────────────────────────────────────────────────────────────────────────
//
// Convention for hEdges[r][c] and vEdges[r][c]:
//   hEdges[r][c] = +1 | -1  – the tab direction on the BOTTOM of piece (r,c)
//     +1 → tab sticks OUT (downward) from piece (r,c)
//     -1 → blank (indent from neighbour's tab)
//   vEdges[r][c] = +1 | -1  – the tab direction on the RIGHT of piece (r,c)
//
// Consistency rules derived:
//   topTab  of (r,c) = r===0      ? 0 : -hEdges[r-1][c]
//   bottomTab of (r,c) = r===rows-1 ? 0 :  hEdges[r][c]
//   leftTab  of (r,c) = c===0      ? 0 : -vEdges[r][c-1]
//   rightTab of (r,c) = c===cols-1 ? 0 :  vEdges[r][c]

// Zaokrouhlení pro čistší SVG string
const f = (n: number) => Math.round(n * 10) / 10;

/**
 * Vygeneruje SVG path segment pro jednu jigsaw hranu.
 *
 * Funguje ve 2D transformovaném prostoru:
 *  - ux,uy = jednotkový vektor PODÉL hrany (start → end)
 *  - vx,vy = jednotkový vektor KOLMO ven (= ux rotovaný 90° CW × dir)
 *    → dir=+1 vždy znamená "výstupek ven" (outward), dir=-1 = záhlubek
 *
 * Tvar (viz referenční foto):
 *   ───── plynulý náběh ─── úzký krček ─── kulová hlavička ─── plynulý odběh ─────
 *
 * Geometrie (vše odvozeno od tabSize T):
 *   T   = celková výška výstupku (= pad)
 *   br  = poloměr kuličky = T × 0.44  (kulička zaujímá 88 % výšky, pas je viditelný)
 *   nw  = polovina šíře krčku = T × 0.22  (krček je užší než kulička: nw < br ✓)
 *   bch = výška středu kuličky od hrany = T - br
 *   k   = Bézierova kappa = br × 0.5523  (přesná aproximace kružnice)
 *
 * Náběh (shoulder): plynulá kubická křivka z přímky do krčku bez rohů.
 */
function makeEdgeSegment(
  x1: number,
  y1: number, // startovní bod hrany
  x2: number,
  y2: number, // koncový bod hrany
  dir: number, // +1 = výstupek ven, -1 = záhlubek, 0 = rovná hrana
  tabSize: number,
): string {
  if (dir === 0) return `L ${f(x2)} ${f(y2)}`;

  const dx = x2 - x1,
    dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len,
    uy = dy / len; // jednotkový vektor podél hrany
  // Kolmý vektor VEN: rotace 90° CW = (uy, -ux), pak × dir
  const vx = uy * dir,
    vy = -ux * dir;

  // Bod v lokálních souřadnicích (t = px podél hrany, h = px ven)
  const p = (t: number, h: number) =>
    `${f(x1 + ux * t + vx * h)} ${f(y1 + uy * t + vy * h)}`;

  const T = tabSize;
  const br = T * 0.44; // poloměr kuličky
  const nw = T * 0.22; // polovina šíře krčku (nw < br → viditelný pas ✓)
  const bch = T - br; // výška středu kuličky od hrany
  const k = br * 0.5523; // kappa pro přesnou kružnici

  const cx = len * 0.5; // střed hrany
  const sh = len * 0.33; // kde začíná náběh (shoulder)

  // Výška kde krček dosahuje plné šíře před kuličkou
  const neckH = bch * 0.35;

  // Tension pro hladké napojení krček → kulička
  const td = (bch - neckH) * 0.45;

  return [
    // 1. Přímka → začátek náběhu
    `L ${p(sh, 0)}`,
    // 2. Plynulý náběh: ze základny do plné výšky krčku (bez rohu!)
    //    Začátek: tečna vodorovná (podél hrany)
    //    Konec:   tečna kolmá (ven z hrany)
    `C ${p(sh + T * 0.22, 0)} ${p(cx - nw, neckH * 0.5)} ${p(cx - nw, neckH)}`,
    // 3. Krček stoupá ke kuličce (obě tečny kolmé = hladká S-křivka)
    `C ${p(cx - nw, neckH + td)} ${p(cx - br, bch - td)} ${p(cx - br, bch)}`,
    // 4. Levá čtvrt kružnice: ball-left → ball-top
    `C ${p(cx - br, bch + k)} ${p(cx - k, T)} ${p(cx, T)}`,
    // 5. Pravá čtvrt kružnice: ball-top → ball-right
    `C ${p(cx + k, T)} ${p(cx + br, bch + k)} ${p(cx + br, bch)}`,
    // 6. Krček sestupuje od kuličky (zrcadlo kroku 3)
    `C ${p(cx + br, bch - td)} ${p(cx + nw, neckH + td)} ${p(cx + nw, neckH)}`,
    // 7. Plynulý odběh: z krčku zpět do základny (zrcadlo kroku 2)
    `C ${p(cx + nw, neckH * 0.5)} ${p(len - sh - T * 0.22, 0)} ${p(len - sh, 0)}`,
    // 8. Přímka ke konci hrany
    `L ${p(len, 0)}`,
  ].join(" ");
}

/**
 * Sestaví úplný SVG clip-path string pro dílek v jeho paddovaném lokálním prostoru.
 *
 * Velikost elementu: (PW + 2×PAD) × (PH + 2×PAD)
 * Tělo dílku: [PAD, PAD+PW] × [PAD, PAD+PH]
 */
function buildPiecePath(
  pw: number,
  ph: number,
  pad: number,
  topTab: number,
  rightTab: number,
  bottomTab: number,
  leftTab: number,
): string {
  const ts = pad; // tabSize = pad (výstupek přesně vyplní padding)
  const x0 = pad,
    y0 = pad;
  const x1 = pad + pw,
    y1 = pad + ph;

  return [
    `M ${x0} ${y0}`,
    makeEdgeSegment(x0, y0, x1, y0, topTab, ts), // top:    L→R, ven = nahoru
    makeEdgeSegment(x1, y0, x1, y1, rightTab, ts), // right:  T→B, ven = doprava
    makeEdgeSegment(x1, y1, x0, y1, bottomTab, ts), // bottom: R→L, ven = dolů
    makeEdgeSegment(x0, y1, x0, y0, leftTab, ts), // left:   B→T, ven = doleva
    "Z",
  ].join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeded PRNG – deterministic piece shapes from a seed
// ─────────────────────────────────────────────────────────────────────────────

function prng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Piece generation
// ─────────────────────────────────────────────────────────────────────────────

interface GeneratedPiece {
  id: string;
  row: number;
  col: number;
  path: string;
  correctX: number;
  correctY: number;
  currentX: number;
  currentY: number;
  isLocked: boolean;
}

function generatePieces(
  rows: number,
  cols: number,
  pw: number,
  ph: number,
  pad: number,
  boardOffsetX: number,
  boardOffsetY: number,
): GeneratedPiece[] {
  const rand = prng(42);

  // Build edge tables
  const hEdges: number[][] = Array.from({ length: rows - 1 }, () =>
    Array.from({ length: cols }, () => (rand() > 0.5 ? 1 : -1)),
  );
  const vEdges: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols - 1 }, () => (rand() > 0.5 ? 1 : -1)),
  );

  const pieces: GeneratedPiece[] = [];

  // Scatter pieces in a tray area outside the board.
  // We place them in a virtual grid around the board with slight randomness.
  const totalW = window.innerWidth;
  const totalH = window.innerHeight;

  const trayPieces: Array<{ tx: number; ty: number }> = [];
  const scatterRand = prng(99);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Random position avoiding the board area
      let tx: number;
      let ty: number;
      let attempts = 0;
      do {
        tx = scatterRand() * Math.max(50, totalW - pw - 2 * pad);
        ty = scatterRand() * Math.max(50, totalH - ph - 2 * pad);
        attempts++;
      } while (
        attempts < 30 &&
        tx > boardOffsetX - pad - 20 &&
        tx < boardOffsetX + cols * pw + pad + 20 &&
        ty > boardOffsetY - pad - 20 &&
        ty < boardOffsetY + rows * ph + pad + 20
      );
      trayPieces.push({ tx, ty });
    }
  }

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const topTab = r === 0 ? 0 : -hEdges[r - 1][c];
      const bottomTab = r === rows - 1 ? 0 : hEdges[r][c];
      const leftTab = c === 0 ? 0 : -vEdges[r][c - 1];
      const rightTab = c === cols - 1 ? 0 : vEdges[r][c];

      const path = buildPiecePath(
        pw,
        ph,
        pad,
        topTab,
        rightTab,
        bottomTab,
        leftTab,
      );

      // correctX/Y = top-left of the padded element when piece is in correct board position
      const correctX = boardOffsetX + c * pw - pad;
      const correctY = boardOffsetY + r * ph - pad;

      pieces.push({
        id: `${r}-${c}`,
        row: r,
        col: c,
        path,
        correctX,
        correctY,
        currentX: trayPieces[idx].tx,
        currentY: trayPieces[idx].ty,
        isLocked: false,
      });
      idx++;
    }
  }

  return pieces;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface ActivePointer {
  pieceId: string;
  offsetX: number; // pointer clientX – element left at drag start
  offsetY: number;
  rafId: number | null;
  lastClientX: number;
  lastClientY: number;
}

const JigsawPuzzle: React.FC<JigsawPuzzleProps> = ({
  imageUrl,
  boardWidth,
  boardHeight,
  pieceCount,
  onComplete,
}) => {
  // ── Board offset (centred in viewport) ────────────────────────────────────
  const [boardOffset] = useState(() => ({
    x: Math.max(0, Math.round((window.innerWidth - boardWidth) / 2)),
    y: Math.max(0, Math.round((window.innerHeight - boardHeight) / 2)),
  }));

  // ── Grid geometry ─────────────────────────────────────────────────────────
  const { rows, cols } = useMemo(
    () => calcGrid(pieceCount, boardWidth, boardHeight),
    [pieceCount, boardWidth, boardHeight],
  );
  const pw = boardWidth / cols; // piece width
  const ph = boardHeight / rows; // piece height
  const pad = Math.round(Math.min(pw, ph) * 0.38); // padding for tab overflow

  // ── Pieces state ──────────────────────────────────────────────────────────
  const [pieces, setPieces] = useState<Piece[]>(() =>
    generatePieces(rows, cols, pw, ph, pad, boardOffset.x, boardOffset.y),
  );

  // ── Piece DOM refs (for direct style mutation while dragging) ─────────────
  const pieceRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ── Active pointer tracking (multi-touch) ─────────────────────────────────
  const activePointers = useRef<Map<number, ActivePointer>>(new Map());

  // ── Audio context singleton ───────────────────────────────────────────────
  const audioCtx = useRef<AudioContext | null>(null);
  const ensureAudio = useCallback(() => {
    if (!audioCtx.current) {
      audioCtx.current = getAudioContext();
    }
    return audioCtx.current;
  }, []);

  // ── Completion tracking ───────────────────────────────────────────────────
  const completedRef = useRef(false);
  const lockedCount = pieces.filter((p) => p.isLocked).length;
  const totalPieces = rows * cols;

  // ── Timer & scores state ─────────────────────────────────────────────────
  const SCORES_KEY = "puzzle_scores";
  const [nickname, setNickname] = useState<string>(() => generateNickname());
  const [started, setStarted] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [scores, setScores] = useState<
    Array<{ time: number; date: string; nickname: string }>
  >([]);
  const timerRef = useRef<number | null>(null);

  // Timer tick
  useEffect(() => {
    if (started && startTime && !finished) {
      timerRef.current = window.setInterval(() => {
        setElapsed(Date.now() - (startTime ?? Date.now()));
      }, 100);
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [started, startTime, finished]);

  // Load scores from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCORES_KEY) || "[]";
      setScores(JSON.parse(raw).slice(0, 20));
    } catch {}
  }, []);

  // Completion: play audio, save score, show leaderboard
  useEffect(() => {
    if (!completedRef.current && lockedCount === totalPieces) {
      completedRef.current = true;
      const ctx = ensureAudio();
      if (ctx) playVictory(ctx);
      onComplete?.();
      setFinished(true);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const total = startTime ? Date.now() - startTime : elapsed;
      setElapsed(total);
      try {
        const raw = localStorage.getItem(SCORES_KEY) || "[]";
        const list: Array<{ time: number; date: string; nickname: string }> =
          JSON.parse(raw);
        list.push({
          time: total,
          date: new Date().toISOString(),
          nickname,
        });
        list.sort((a, b) => a.time - b.time);
        const top = list.slice(0, 20);
        localStorage.setItem(SCORES_KEY, JSON.stringify(top));
        setScores(top);
      } catch {}
    }
  }, [lockedCount, totalPieces, onComplete, ensureAudio, startTime, elapsed, nickname]);

  // ── Pointer down ──────────────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, pieceId: string) => {
      e.preventDefault();
      e.stopPropagation();

      const piece = pieces.find((p) => p.id === pieceId);
      if (!piece || piece.isLocked) return;

      ensureAudio(); // unlock AudioContext on first interaction

      // Start timer on first picked-up piece
      if (!started) {
        setStarted(true);
        setStartTime(Date.now());
      }

      const el = pieceRefs.current.get(pieceId);
      if (!el) return;

      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      // Bring piece to front while dragging
      el.style.zIndex = String(Z_DRAGGING);

      activePointers.current.set(e.pointerId, {
        pieceId,
        offsetX: e.clientX - piece.currentX,
        offsetY: e.clientY - piece.currentY,
        rafId: null,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      });
    },
    [pieces, ensureAudio],
  );

  // ── Pointer move ──────────────────────────────────────────────────────────
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = activePointers.current.get(e.pointerId);
      if (!state) return;

      state.lastClientX = e.clientX;
      state.lastClientY = e.clientY;

      if (state.rafId !== null) return; // rAF already queued

      state.rafId = requestAnimationFrame(() => {
        state.rafId = null;
        const s = activePointers.current.get(e.pointerId);
        if (!s) return;

        const el = pieceRefs.current.get(s.pieceId);
        if (!el) return;

        const elW = pw + 2 * pad;
        const elH = ph + 2 * pad;
        const raw = {
          x: s.lastClientX - s.offsetX,
          y: s.lastClientY - s.offsetY,
        };
        const clamped = {
          x: Math.min(Math.max(0, raw.x), window.innerWidth - elW),
          y: Math.min(Math.max(0, raw.y), window.innerHeight - elH),
        };

        el.style.left = `${clamped.x}px`;
        el.style.top = `${clamped.y}px`;

        // Update the live currentX/Y without triggering React re-render
        const piece = pieces.find((p) => p.id === s.pieceId);
        if (piece) {
          piece.currentX = clamped.x;
          piece.currentY = clamped.y;
        }
      });
    },
    [pw, ph, pad, pieces],
  );

  // ── Pointer up / snap logic ───────────────────────────────────────────────
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const state = activePointers.current.get(e.pointerId);
      if (!state) return;

      if (state.rafId !== null) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }

      activePointers.current.delete(e.pointerId);

      const el = pieceRefs.current.get(state.pieceId);
      if (!el) return;

      setPieces((prev) => {
        const idx = prev.findIndex((p) => p.id === state.pieceId);
        if (idx === -1) return prev;

        const piece = prev[idx];
        const dist = Math.hypot(
          piece.currentX - piece.correctX,
          piece.currentY - piece.correctY,
        );

        if (dist <= SNAP_DISTANCE) {
          // Snap
          const snapped: Piece = {
            ...piece,
            currentX: piece.correctX,
            currentY: piece.correctY,
            isLocked: true,
          };
          el.style.left = `${piece.correctX}px`;
          el.style.top = `${piece.correctY}px`;
          el.style.zIndex = String(Z_LOCKED);

          const ctx = audioCtx.current;
          if (ctx) playSnap(ctx);

          const next = [...prev];
          next[idx] = snapped;
          return next;
        }

        el.style.zIndex = String(Z_IDLE);
        return prev;
      });
    },
    [],
  );

  // ── Memoised piece elements ───────────────────────────────────────────────
  const pieceElements = useMemo(
    () =>
      pieces.map((piece) => {
        const elW = pw + 2 * pad;
        const elH = ph + 2 * pad;

        // Background image positioning:
        // We want the image region (col*pw, row*ph) to appear
        // at local offset (pad, pad) inside the element.
        const bgX = pad - piece.col * pw;
        const bgY = pad - piece.row * ph;

        return (
          // Wrapper – BEZ clip-path, drží pozici a event handlery
          <div
            key={piece.id}
            ref={(node) => {
              if (node) pieceRefs.current.set(piece.id, node);
              else pieceRefs.current.delete(piece.id);
            }}
            onPointerDown={(e) => handlePointerDown(e, piece.id)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              position: "absolute",
              left: piece.currentX,
              top: piece.currentY,
              width: elW,
              height: elH,
              zIndex: piece.isLocked ? Z_LOCKED : Z_IDLE,
              cursor: piece.isLocked ? "default" : "grab",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              willChange: piece.isLocked ? "auto" : "left, top",
            }}
            className="select-none"
          >
            {/* Obrázek – ořezaný na tvar dílku */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                clipPath: `path('${piece.path}')`,
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: `${boardWidth}px ${boardHeight}px`,
                backgroundPosition: `${bgX}px ${bgY}px`,
                backgroundRepeat: "no-repeat",
                filter: piece.isLocked
                  ? "none"
                  : "drop-shadow(0 8px 18px rgba(0,0,0,0.7))",
              }}
            />
            {/* Border SVG – MIMO clip div, stroke je stejně silný ze všech stran */}
            <svg
              style={{
                position: "absolute",
                inset: 0,
                width: elW,
                height: elH,
                overflow: "visible",
                pointerEvents: "none",
              }}
            >
              <path
                d={piece.path}
                fill="none"
                stroke={
                  piece.isLocked
                    ? "rgba(255,255,255,0.18)"
                    : "rgba(255,255,255,0.70)"
                }
                strokeWidth={3}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      pieces,
      pw,
      ph,
      pad,
      boardWidth,
      boardHeight,
      imageUrl,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
    ],
  );

  // ── Ghost dílky na herní ploše (tvarované, zašedlá fotka) ───────────────
  const boardGhostCells = useMemo(
    () =>
      pieces.map((piece) => {
        const elW = pw + 2 * pad;
        const elH = ph + 2 * pad;
        const bgX = pad - piece.col * pw;
        const bgY = pad - piece.row * ph;
        return (
          <div
            key={`ghost-${piece.id}`}
            style={{
              position: "absolute",
              left: piece.correctX,
              top: piece.correctY,
              width: elW,
              height: elH,
              pointerEvents: "none",
            }}
          >
            {/* Zašedlá fotka oříznutá na tvar dílku */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                clipPath: `path('${piece.path}')`,
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: `${boardWidth}px ${boardHeight}px`,
                backgroundPosition: `${bgX}px ${bgY}px`,
                backgroundRepeat: "no-repeat",
                opacity: 0.1,
                // filter: "grayscale(100%)",
              }}
            />
            {/* Obrys tvaru */}
            <svg
              style={{
                position: "absolute",
                inset: 0,
                width: elW,
                height: elH,
                overflow: "visible",
                pointerEvents: "none",
              }}
            >
              <path
                d={piece.path}
                fill="none"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </div>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pieces, pw, ph, pad, boardWidth, imageUrl],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const isComplete = lockedCount === totalPieces;

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-neutral-950 select-none"
      style={{ touchAction: "none" }}
    >
      {isComplete ? (
        /* ── Stav: hotovo – jen čistá fotka bez mřížky a dílků ─────────── */
        <div
          style={{
            position: "absolute",
            left: boardOffset.x,
            top: boardOffset.y,
            width: boardWidth,
            height: boardHeight,
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: `${boardWidth}px ${boardHeight}px`,
            backgroundPosition: "0 0",
            backgroundRepeat: "no-repeat",
            borderRadius: 4,
          }}
        />
      ) : (
        <>
          {/* ── Board ───────────────────────────────────────────────────── */}
          <div
            style={{
              position: "absolute",
              left: boardOffset.x,
              top: boardOffset.y,
              width: boardWidth,
              height: boardHeight,
              boxSizing: "border-box",
              // border: "2px dashed rgba(255,255,255,0.30)",
              borderRadius: 4,
              zIndex: 0,
              pointerEvents: "none",
            }}
          />

          {/* ── Ghost dílky ─────────────────────────────────────────────── */}
          {boardGhostCells}

          {/* ── Pieces ──────────────────────────────────────────────────── */}
          {pieceElements}

          {/* ── HUD: nick + timer + progress ───────────────────────────────── */}
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-[2000]">
            <div className="flex items-center gap-3 bg-neutral-900/90 border border-neutral-700 rounded-xl px-5 py-2 backdrop-blur-sm shadow-lg">
              <span className="text-indigo-400 font-bold font-mono text-sm tracking-wide">
                {nickname}
              </span>
              <div className="w-px h-4 bg-neutral-600" />
              <span className="text-white font-bold font-mono text-sm tabular-nums">
                {formatTime(elapsed)}
              </span>
            </div>
            <div className="text-neutral-400 text-xs font-mono tracking-widest">
              {lockedCount} / {totalPieces}
            </div>
            <div className="w-48 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${(lockedCount / totalPieces) * 100}%` }}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Completion banner – zobrazí se pod fotkou po dokončení ──────── */}
      {isComplete && (
        <div
          className="fixed z-[3000]"
          style={{
            top: boardOffset.y + boardHeight + 20,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <div className="bg-neutral-900/97 border border-neutral-700 rounded-2xl px-7 py-5 shadow-2xl backdrop-blur-sm min-w-[340px]">
            {/* Header */}
            <div className="flex items-center gap-4 mb-4">
              <span className="text-3xl">🧩</span>
              <div className="flex-1">
                <div className="text-white font-bold text-base leading-tight">
                  Puzzle complete!
                </div>
                <div className="text-neutral-400 text-xs">
                  {totalPieces} dílků · <span className="text-indigo-400 font-semibold">{nickname}</span>
                  {" "}· <span className="font-mono text-emerald-400">{formatTime(elapsed)}</span>
                </div>
              </div>
              <button
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold transition-colors text-sm shrink-0"
                onClick={() => {
                  completedRef.current = false;
                  setStarted(false);
                  setStartTime(null);
                  setElapsed(0);
                  setFinished(false);
                  setNickname(generateNickname());
                  setPieces(
                    generatePieces(
                      rows,
                      cols,
                      pw,
                      ph,
                      pad,
                      boardOffset.x,
                      boardOffset.y,
                    ),
                  );
                }}
              >
                Hrát znovu
              </button>
            </div>

            {/* Žebříček */}
            {scores.length > 0 && (
              <div className="space-y-1.5">
                {scores.slice(0, 5).map((s, idx) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  const isCurrentResult = s.time === elapsed && s.nickname === nickname;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                        isCurrentResult
                          ? "bg-emerald-900/60 border border-emerald-600 scale-[1.02]"
                          : idx === 0
                            ? "bg-yellow-900/30 border border-yellow-700/50"
                            : idx === 1
                              ? "bg-neutral-800/70 border border-neutral-600/50"
                              : idx === 2
                                ? "bg-orange-900/30 border border-orange-700/50"
                                : "bg-neutral-800/40 border border-neutral-700/40"
                      }`}
                    >
                      <span className="text-base w-6 text-center shrink-0">
                        {medals[idx] ?? `${idx + 1}.`}
                      </span>
                      <span className="text-indigo-300 font-semibold flex-1 truncate">
                        {s.nickname}
                      </span>
                      <span className="font-mono font-bold text-white tabular-nums">
                        {formatTime(s.time)}
                      </span>
                      <span className="text-neutral-500 text-xs shrink-0">
                        {new Date(s.date).toLocaleDateString("cs-CZ", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default JigsawPuzzle;
