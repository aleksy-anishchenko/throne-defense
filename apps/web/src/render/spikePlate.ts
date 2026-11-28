import type { Canvas2D } from './shapes'

/** В покое видны только гнёзда. При ударе из каждого поднимается трёхгранный кол. */
export function drawSpikePlate(ctx: Canvas2D, tier: number, height: number, aspect: string | null) {
  ctx.save()
  ctx.scale(0.007, 0.007)
  ctx.lineJoin = 'round'
  function face(points: number[], fill: string, outline = true) {
    ctx.beginPath()
    ctx.moveTo(points[0], points[1])
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1])
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    if (outline) {
      ctx.lineWidth = 2.4
      ctx.strokeStyle = '#272835'
      ctx.stroke()
    }
  }
  face([-52, -45, 52, -45, 63, -34, 63, 36, 52, 48, -52, 48, -63, 36, -63, -34], '#414653')
  face(
    [-52, -47, 52, -47, 63, -35, 63, 29, 52, 41, -52, 41, -63, 29, -63, -35],
    ['#81776d', '#798c99', '#9ba8ac'][tier],
  )
  face([-44, -37, 44, -37, 53, -28, 53, 21, 44, 31, -44, 31, -53, 21, -53, -28], '#495562')
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.scale(side, 1)
    for (const end of [-1, 1]) {
      ctx.save()
      ctx.scale(1, end)
      if (tier > 0)
        face([42, 34, 53, 34, 60, 26, 60, 16, 55, 17, 52, 26], tier === 2 ? '#deb260' : '#b0b9b8')
      ctx.fillStyle = '#34343a'
      ctx.fillRect(51, 27, 4, 4)
      ctx.restore()
    }
    ctx.restore()
  }
  const xs = tier === 0 ? [-21, 21] : [-31, 0, 31]
  const ys = tier === 2 ? [-23, -2, 20] : [-16, 15]
  for (const y of ys) {
    for (const x of xs) {
      ctx.fillStyle = '#202631'
      ctx.beginPath()
      ctx.ellipse(x, y, 10, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      if (height <= 0) continue
      const tip = y - height * (aspect === 'giant-stakes' ? 46 : 25 + tier * 6)
      const width = aspect === 'giant-stakes' ? 12 : 9
      face([x - width, y, x + 1, tip, x + width, y, x, y + 3], '#e5e5da')
      face([x + 1, tip + 1, x + width - 1, y, x, y + 2], '#8c9ea8', false)
    }
  }
  ctx.restore()
}
