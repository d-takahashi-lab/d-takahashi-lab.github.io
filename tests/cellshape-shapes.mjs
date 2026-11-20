// Test shapes for the Cell Shape tool, drawn on a 260 × 220 label image (labels 1–5).
// The same image was measured with ImageJ (Analyze Particles) for the reference values in cellshape.test.mjs.
export const W = 260, H = 220;

export function shapes(){
  const labels = new Int32Array(W * H);
  const fill = (L, inside) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x + 0.5, y + 0.5)) labels[y * W + x] = L;
  };
  // 1: rectangle 30 × 12
  fill(1, (x, y) => x > 10 && x < 40 && y > 10 && y < 22);
  // 2: ellipse with semi-axes 40 and 15, rotated 30° counter-clockwise (y up)
  const t = 30 * Math.PI / 180;
  fill(2, (x, y) => {
    const dx = x - 120, dy = -(y - 60), u = dx * Math.cos(t) + dy * Math.sin(t), v = -dx * Math.sin(t) + dy * Math.cos(t);
    return (u / 40) ** 2 + (v / 15) ** 2 <= 1;
  });
  // 3: disc of radius 25
  fill(3, (x, y) => (x - 60) ** 2 + (y - 150) ** 2 <= 625);
  // 4: five-pointed star (concave)
  const star = [];
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 16 : 40; star.push([180 + r * Math.cos(a), 160 + r * Math.sin(a)]); }
  fill(4, (x, y) => {
    let inside = false;
    for (let i = 0, j = star.length - 1; i < star.length; j = i++) {
      const [ax, ay] = star[j], [bx, by] = star[i];
      if ((ay <= y) !== (by <= y) && x < ax + (y - ay) / (by - ay) * (bx - ax)) inside = !inside;
    }
    return inside;
  });
  // 5: L shape
  fill(5, (x, y) => (x > 210 && x < 250 && y > 10 && y < 20) || (x > 210 && x < 222 && y > 10 && y < 70));
  // Remove pixels touching their shape only at a corner, so 4- and 8-connected tracing agree.
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const i = y * W + x, a = labels[i], b = labels[i + 1], c = labels[i + W], d = labels[i + W + 1];
      if (a && d && a === d && !b && !c) { labels[i + 1] = a; changed = true; }
      if (b && c && b === c && !a && !d) { labels[i] = b; changed = true; }
    }
  }
  return labels;
}
