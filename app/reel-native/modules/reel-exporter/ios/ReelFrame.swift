import AVFoundation
import CoreImage
import UIKit

/// Tek bir videoyu karesini çizer. Geçiş matematiği JS tarafındaki
/// `src/engine.ts` ile birebir aynı tutulur — biri değişirse diğeri de değişmeli.
struct ReelFrame {
  let spec: ExportSpec
  let images: [String: CGImage]
  let size: CGSize

  // MARK: Yardımcılar

  private func easeOutCubic(_ t: Double) -> Double { 1 - pow(1 - t, 3) }
  private func easeInOutCubic(_ t: Double) -> Double {
    t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
  }
  private func clamp(_ v: Double, _ a: Double, _ b: Double) -> Double { min(max(v, a), b) }

  private var templateParams: (tr: Double, kb: Double, pulse: Double) {
    switch spec.template {
    case "flash":  return (0.13, 0.06, 1.4)
    case "whip":   return (0.20, 0.09, 0.8)
    case "slide":  return (0.28, 0.08, 0.6)
    case "fade":   return (0.42, 0.14, 0.3)
    case "glitch": return (0.20, 0.07, 1.1)
    case "flip":   return (0.26, 0.09, 0.7)
    case "film":   return (0.30, 0.07, 0.5)
    default:       return (0.16, 0.10, 1.0) // punch
    }
  }

  // MARK: Ana çizim

  func draw(in ctx: CGContext, at t: Double) {
    let W = size.width, H = size.height
    ctx.setFillColor(UIColor.black.cgColor)
    ctx.fill(CGRect(origin: .zero, size: size))

    let clips = spec.clips
    guard !clips.isEmpty else { return }

    let total = spec.duration
    let tt = total > 0 ? fmod(fmod(t, total) + total, total) : 0

    var idx = 0
    for (i, c) in clips.enumerated() where tt >= c.start - 1e-6 { idx = i }
    let cur = clips[idx]
    let local = tt - cur.start
    let params = templateParams
    let trDur = min(params.tr, cur.duration * 0.45)
    let q = trDur > 0 ? clamp(local / trDur, 0, 1) : 1
    let pCur = clamp(local / cur.duration, 0, 1)
    let prevIdx = idx > 0 ? idx - 1 : (clips.count > 1 ? clips.count - 1 : -1)
    let prev: ClipSpec? = prevIdx >= 0 ? clips[prevIdx] : nil
    let pPrev = prev != nil ? clamp((prev!.duration + local) / prev!.duration, 0, 1.3) : 1

    let spb = 60.0 / max(1, spec.bpm)
    let pulse = pow(1 - fmod(tt, spb) / spb, 4)
    let ps = 1 + 0.032 * pulse * params.pulse

    var box = CGRect(origin: .zero, size: size)
    if spec.template == "film" {
      let m = (W * 0.055).rounded()
      let bottom = (W * 0.16).rounded()
      ctx.setFillColor(UIColor(red: 0.957, green: 0.945, blue: 0.914, alpha: 1).cgColor)
      let card = CGRect(x: m * 0.55, y: m * 0.55, width: W - m * 1.1, height: H - m * 1.1)
      ctx.addPath(CGPath(roundedRect: card, cornerWidth: W * 0.03, cornerHeight: W * 0.03, transform: nil))
      ctx.fillPath()
      box = CGRect(x: m, y: m, width: W - m * 2, height: H - m - bottom)
    }

    let kbCur = 1 + params.kb * easeInOutCubic(pCur)
    let kbPrev = 1 + params.kb * easeInOutCubic(min(1, pPrev))
    let e = easeOutCubic(q)
    let showPrev = prev != nil && q < 1

    switch spec.template {
    case "fade":
      if showPrev { paint(ctx, box, prev!, kb: kbPrev, sx: ps, sy: ps) }
      paint(ctx, box, cur, kb: kbCur, sx: ps, sy: ps, alpha: e)

    case "flash":
      paint(ctx, box, cur, kb: kbCur, sx: ps, sy: ps)
      if q < 1 {
        ctx.saveGState()
        ctx.setFillColor(UIColor(white: 1, alpha: CGFloat((1 - q) * 0.8)).cgColor)
        ctx.fill(box)
        ctx.restoreGState()
      }

    case "slide":
      if showPrev { paint(ctx, box, prev!, kb: kbPrev, dx: -e * Double(box.width) * 0.45, sx: ps, sy: ps) }
      paint(ctx, box, cur, kb: kbCur, dx: (1 - e) * Double(box.width), sx: ps, sy: ps)

    case "whip":
      if showPrev { paint(ctx, box, prev!, kb: kbPrev, dx: -e * Double(box.width) * 1.15, sx: ps, sy: ps) }
      let off = (1 - e) * Double(box.width) * 1.15
      for k in stride(from: 4, through: 1, by: -1) {
        paint(ctx, box, cur, kb: kbCur, dx: off + Double(k) * Double(box.width) * 0.05 * (1 - e), alpha: 0.16)
      }
      paint(ctx, box, cur, kb: kbCur, dx: off, sx: ps, sy: ps)

    case "glitch":
      if showPrev { paint(ctx, box, prev!, kb: kbPrev, sx: ps, sy: ps) }
      paint(ctx, box, cur, kb: kbCur, sx: ps, sy: ps, alpha: clamp(e * 2, 0, 1))
      if q < 1 {
        let amp = (1 - q) * Double(box.width) * 0.06
        ctx.saveGState()
        ctx.setBlendMode(.lighten)
        paint(ctx, box, cur, kb: kbCur, dx: amp, alpha: 0.5)
        paint(ctx, box, cur, kb: kbCur, dx: -amp, alpha: 0.5)
        ctx.restoreGState()
        for b in 0..<5 {
          let seed = sin(Double(idx + 1) * 12.9898 + Double(b) * 78.233) * 43758.5453
          let rnd = seed - floor(seed)
          let by = box.minY + CGFloat(Double(b) / 5.0) * box.height
          let band = CGRect(x: box.minX, y: by, width: box.width, height: box.height / 5)
          ctx.saveGState()
          ctx.clip(to: band)
          paint(ctx, box, cur, kb: kbCur, dx: (rnd - 0.5) * amp * 3)
          ctx.restoreGState()
        }
      }

    case "flip":
      if q < 0.5 {
        let k = easeOutCubic(q * 2)
        if showPrev { paint(ctx, box, prev!, kb: kbPrev, sx: max(0.02, 1 - k), sy: ps) }
        else { paint(ctx, box, cur, kb: kbCur, sx: ps, sy: ps) }
      } else {
        let k = easeOutCubic((q - 0.5) * 2)
        paint(ctx, box, cur, kb: kbCur, sx: max(0.02, k) * ps, sy: ps)
      }

    case "film":
      if showPrev { paint(ctx, box, prev!, kb: kbPrev) }
      let s = 0.86 + 0.14 * e
      paint(ctx, box, cur, kb: kbCur, sx: s * ps, sy: s * ps, alpha: e, rot: (1 - e) * 0.045)

    default: // punch
      if showPrev { paint(ctx, box, prev!, kb: kbPrev * (1 + 0.22 * e), sx: ps, sy: ps) }
      let z = 1 + 0.55 * (1 - e)
      paint(ctx, box, cur, kb: kbCur, sx: ps * z, sy: ps * z, alpha: clamp(e * 1.7, 0, 1))
    }

    if spec.vignette && spec.template != "film" { drawVignette(ctx) }
    for text in spec.texts { drawText(ctx, text, at: tt) }
    drawHandle(ctx)
  }

  // MARK: Kare çizimi

  private func paint(_ ctx: CGContext, _ box: CGRect, _ clip: ClipSpec,
                     kb: Double = 1, dx: Double = 0, dy: Double = 0,
                     sx: Double = 1, sy: Double = 1, alpha: Double = 1, rot: Double = 0) {
    guard let image = images[clip.uri] else { return }
    let rotDeg = ((clip.rot % 360) + 360) % 360
    let swap = rotDeg == 90 || rotDeg == 270
    let iw = CGFloat(swap ? image.height : image.width)
    let ih = CGFloat(swap ? image.width : image.height)

    let scale = max(box.width / iw, box.height / ih) * CGFloat(kb * clip.zoom)
    let rw = iw * scale, rh = ih * scale
    let panX = CGFloat(clip.ox) * max(0, (rw - box.width) / 2)
    let panY = CGFloat(clip.oy) * max(0, (rh - box.height) / 2)

    ctx.saveGState()
    ctx.clip(to: box)
    ctx.setAlpha(CGFloat(clamp(alpha, 0, 1)))
    ctx.translateBy(x: box.midX + CGFloat(dx), y: box.midY + CGFloat(dy))
    if rot != 0 { ctx.rotate(by: CGFloat(rot)) }
    ctx.scaleBy(x: CGFloat(sx), y: CGFloat(sy))
    ctx.translateBy(x: panX, y: panY)
    if rotDeg != 0 { ctx.rotate(by: CGFloat(Double(rotDeg) * .pi / 180)) }

    // Görseli üst-sol koordinat sisteminde doğru yönde çizmek için ekseni geri çevir
    let dw = swap ? rh : rw
    let dh = swap ? rw : rh
    ctx.scaleBy(x: 1, y: -1)
    ctx.draw(image, in: CGRect(x: -dw / 2, y: -dh / 2, width: dw, height: dh))
    ctx.restoreGState()
  }

  private func drawVignette(_ ctx: CGContext) {
    let colors = [UIColor(white: 0, alpha: 0).cgColor, UIColor(white: 0, alpha: 0.42).cgColor] as CFArray
    guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                    colors: colors, locations: [0, 1]) else { return }
    let center = CGPoint(x: size.width / 2, y: size.height * 0.48)
    ctx.saveGState()
    ctx.drawRadialGradient(gradient,
                           startCenter: center, startRadius: min(size.width, size.height) * 0.28,
                           endCenter: center, endRadius: max(size.width, size.height) * 0.72,
                           options: .drawsAfterEndLocation)
    ctx.restoreGState()
  }

  // MARK: Yazılar

  private func drawText(_ ctx: CGContext, _ layer: TextSpec, at tt: Double) {
    let raw = layer.text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty else { return }

    let spb = 60.0 / max(1, spec.bpm)
    let introLen = spb * 4
    var vis = 1.0
    if layer.introOnly {
      if tt > introLen { return }
      vis = easeOutCubic(clamp((introLen - tt) / 0.3, 0, 1))
    }
    guard vis > 0.01 else { return }
    let inE = easeOutCubic(clamp(tt / 0.34, 0, 1))
    let pop = 0.94 + 0.06 * inE

    let unit = size.width / 100
    let scale = CGFloat(layer.size / 100)
    let x = size.width * CGFloat(layer.xf)
    let y = size.height * CGFloat(layer.yf) + CGFloat(1 - inE) * size.height * 0.018

    ctx.saveGState()
    ctx.setAlpha(CGFloat(vis))
    ctx.translateBy(x: x, y: y)
    ctx.scaleBy(x: CGFloat(pop), y: CGFloat(pop))
    ctx.translateBy(x: -x, y: -y)

    UIGraphicsPushContext(ctx)
    switch layer.style {
    case "tape":
      let fontSize = unit * 7 * scale
      let font = UIFont.systemFont(ofSize: fontSize, weight: .bold)
      let lines = wrap(raw.uppercased(), font: font, maxWidth: size.width * 0.74)
      let lh = fontSize * 1.9, h = fontSize * 1.55
      var ly = y - CGFloat(lines.count - 1) * lh / 2
      for line in lines {
        let w = (line as NSString).size(withAttributes: [.font: font]).width + unit * 7
        let rect = CGRect(x: x - w / 2, y: ly - h / 2, width: w, height: h)
        ctx.saveGState()
        ctx.addPath(CGPath(roundedRect: rect, cornerWidth: h * 0.26, cornerHeight: h * 0.26, transform: nil))
        ctx.clip()
        let colors = [UIColor(red: 1, green: 0.24, blue: 0.45, alpha: 1).cgColor,
                      UIColor(red: 1, green: 0.60, blue: 0.24, alpha: 1).cgColor] as CFArray
        if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
          ctx.drawLinearGradient(g, start: CGPoint(x: rect.minX, y: rect.midY),
                                 end: CGPoint(x: rect.maxX, y: rect.midY), options: [])
        }
        ctx.restoreGState()
        draw(line, font: font, color: UIColor(red: 0.1, green: 0.02, blue: 0.04, alpha: 1),
             centeredAt: CGPoint(x: x, y: ly), shadow: false)
        ly += lh
      }

    case "caption":
      let fontSize = unit * 5.4 * scale
      let font = UIFont.systemFont(ofSize: fontSize, weight: .medium)
      let lines = wrap(raw, font: font, maxWidth: size.width * 0.8)
      let lh = fontSize * 1.5
      var ly = y - CGFloat(lines.count - 1) * lh / 2
      for line in lines {
        let w = (line as NSString).size(withAttributes: [.font: font]).width + unit * 5
        let rect = CGRect(x: x - w / 2, y: ly - lh * 0.46, width: w, height: lh * 0.92)
        ctx.setFillColor(UIColor(red: 0.02, green: 0.02, blue: 0.04, alpha: 0.62).cgColor)
        ctx.addPath(CGPath(roundedRect: rect, cornerWidth: lh * 0.3, cornerHeight: lh * 0.3, transform: nil))
        ctx.fillPath()
        draw(line, font: font, color: .white, centeredAt: CGPoint(x: x, y: ly), shadow: false)
        ly += lh
      }

    case "ticker":
      let fontSize = unit * 4.4 * scale
      let font = UIFont.monospacedSystemFont(ofSize: fontSize, weight: .medium)
      let line = String(raw.uppercased().prefix(34))
      let barH = fontSize * 2.6
      ctx.setFillColor(UIColor(red: 0.02, green: 0.02, blue: 0.04, alpha: 0.55).cgColor)
      ctx.fill(CGRect(x: -size.width * 0.1, y: y - barH / 2, width: size.width * 1.2, height: barH))
      ctx.setFillColor(UIColor(red: 1, green: 0.60, blue: 0.24, alpha: 1).cgColor)
      ctx.fill(CGRect(x: -size.width * 0.1, y: y - barH / 2, width: size.width * 1.2, height: unit * 0.35))
      draw(line, font: font, color: .white, centeredAt: CGPoint(x: x, y: y), shadow: false, tracking: fontSize * 0.22)

    default: // bold
      let fontSize = unit * 9.5 * scale
      let font = UIFont.systemFont(ofSize: fontSize, weight: .heavy)
      let lines = wrap(raw.uppercased(), font: font, maxWidth: size.width * 0.84)
      let lh = fontSize * 1.02
      var ly = y - CGFloat(lines.count - 1) * lh / 2
      for line in lines {
        draw(line, font: font, color: .white, centeredAt: CGPoint(x: x, y: ly), shadow: true)
        ly += lh
      }
    }
    UIGraphicsPopContext()
    ctx.restoreGState()
  }

  private func drawHandle(_ ctx: CGContext) {
    let raw = spec.handle.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty else { return }
    let text = raw.hasPrefix("@") ? raw : "@" + raw
    let unit = size.width / 100
    let font = UIFont.monospacedSystemFont(ofSize: unit * 3.4, weight: .medium)
    ctx.saveGState()
    ctx.setAlpha(0.82)
    UIGraphicsPushContext(ctx)
    let attrs: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: UIColor.white,
      .shadow: {
        let s = NSShadow()
        s.shadowColor = UIColor(white: 0, alpha: 0.6)
        s.shadowBlurRadius = unit * 1.6
        return s
      }(),
    ]
    let h = (text as NSString).size(withAttributes: attrs).height
    (text as NSString).draw(at: CGPoint(x: unit * 5, y: size.height - unit * 5 - h), withAttributes: attrs)
    UIGraphicsPopContext()
    ctx.restoreGState()
  }

  private func draw(_ text: String, font: UIFont, color: UIColor, centeredAt p: CGPoint,
                    shadow: Bool, tracking: CGFloat = 0) {
    var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
    if tracking != 0 { attrs[.kern] = tracking }
    if shadow {
      let s = NSShadow()
      s.shadowColor = UIColor(white: 0, alpha: 0.55)
      s.shadowBlurRadius = size.width / 100 * 2.4
      s.shadowOffset = CGSize(width: 0, height: size.width / 100 * 0.5)
      attrs[.shadow] = s
    }
    let ns = text as NSString
    let s = ns.size(withAttributes: attrs)
    ns.draw(at: CGPoint(x: p.x - s.width / 2, y: p.y - s.height / 2), withAttributes: attrs)
  }

  private func wrap(_ text: String, font: UIFont, maxWidth: CGFloat) -> [String] {
    let words = text.split(separator: " ").map(String.init)
    var lines: [String] = []
    var cur = ""
    for w in words {
      let test = cur.isEmpty ? w : cur + " " + w
      let width = (test as NSString).size(withAttributes: [.font: font]).width
      if width > maxWidth && !cur.isEmpty { lines.append(cur); cur = w } else { cur = test }
    }
    if !cur.isEmpty { lines.append(cur) }
    return Array(lines.prefix(3))
  }

  // MARK: Renk filtresi (yükleme sırasında bir kez uygulanır)

  static func applyFilter(_ image: CGImage, name: String) -> CGImage {
    guard name != "none" && !name.isEmpty else { return image }
    let ci = CIImage(cgImage: image)
    var out = ci

    func colorControls(_ img: CIImage, saturation: Double, contrast: Double, brightness: Double) -> CIImage {
      img.applyingFilter("CIColorControls", parameters: [
        kCIInputSaturationKey: saturation,
        kCIInputContrastKey: contrast,
        kCIInputBrightnessKey: brightness,
      ])
    }

    switch name {
    case "vivid": out = colorControls(ci, saturation: 1.45, contrast: 1.10, brightness: 0)
    case "warm":
      out = colorControls(ci, saturation: 1.22, contrast: 1.05, brightness: 0.03)
      out = out.applyingFilter("CISepiaTone", parameters: [kCIInputIntensityKey: 0.26])
    case "cool":
      out = colorControls(ci, saturation: 1.10, contrast: 1.07, brightness: 0.02)
      out = out.applyingFilter("CIHueAdjust", parameters: [kCIInputAngleKey: -0.21])
    case "mono": out = colorControls(ci, saturation: 0, contrast: 1.16, brightness: 0)
    case "film":
      out = colorControls(ci, saturation: 1.16, contrast: 0.93, brightness: 0.06)
      out = out.applyingFilter("CISepiaTone", parameters: [kCIInputIntensityKey: 0.16])
    case "vhs":
      out = colorControls(ci, saturation: 1.6, contrast: 1.2, brightness: 0)
      out = out.applyingFilter("CIHueAdjust", parameters: [kCIInputAngleKey: 0.10])
    default: return image
    }

    let context = CIContext(options: [.useSoftwareRenderer: false])
    return context.createCGImage(out, from: ci.extent) ?? image
  }
}
