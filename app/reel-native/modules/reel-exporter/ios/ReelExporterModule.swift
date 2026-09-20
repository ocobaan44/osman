import ExpoModulesCore
import AVFoundation
import UIKit

// MARK: - JS'ten gelen tanımlar

struct ClipSpec: Record {
  @Field var uri: String = ""
  @Field var start: Double = 0      // saniye
  @Field var duration: Double = 1   // saniye
  @Field var rot: Int = 0           // 0 / 90 / 180 / 270
  @Field var zoom: Double = 1
  @Field var ox: Double = 0         // -1..1
  @Field var oy: Double = 0         // -1..1
}

struct TextSpec: Record {
  @Field var text: String = ""
  @Field var style: String = "bold" // bold | tape | caption | ticker
  @Field var xf: Double = 0.5
  @Field var yf: Double = 0.8
  @Field var size: Double = 100     // yüzde
  @Field var introOnly: Bool = true
}

struct AudioSpec: Record {
  @Field var uri: String = ""
  @Field var startSec: Double = 0
  @Field var rate: Double = 1       // dahili ritimlerde tempo oranı
}

struct ExportSpec: Record {
  @Field var width: Int = 1080
  @Field var height: Int = 1920
  @Field var fps: Int = 30
  @Field var duration: Double = 0
  @Field var template: String = "punch"
  @Field var filter: String = "none"
  @Field var vignette: Bool = true
  @Field var grain: Bool = false
  @Field var bpm: Double = 110
  @Field var clips: [ClipSpec] = []
  @Field var texts: [TextSpec] = []
  @Field var handle: String = ""
  @Field var audio: AudioSpec? = nil
  @Field var fileName: String = "reel.mp4"
}

// MARK: - Modül

public class ReelExporterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReelExporter")

    Function("isAvailable") { () -> Bool in
      return true
    }

    AsyncFunction("exportReel") { (spec: ExportSpec, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let url = try ReelRenderer(spec: spec).render { progress in
            self.sendEvent("onExportProgress", ["progress": progress])
          }
          promise.resolve(["uri": url.absoluteString])
        } catch {
          promise.reject("ERR_EXPORT", error.localizedDescription)
        }
      }
    }

    Events("onExportProgress")
  }
}

enum ExportError: LocalizedError {
  case noClips
  case writerFailed(String)
  case imageMissing(String)

  var errorDescription: String? {
    switch self {
    case .noClips: return "Dışa aktarılacak kare yok."
    case .writerFailed(let m): return "Video yazılamadı: \(m)"
    case .imageMissing(let u): return "Fotoğraf okunamadı: \(u)"
    }
  }
}

// MARK: - Karelerin çizimi ve kodlanması

final class ReelRenderer {
  private let spec: ExportSpec
  private let size: CGSize
  private var images: [String: CGImage] = [:]

  init(spec: ExportSpec) {
    self.spec = spec
    self.size = CGSize(width: spec.width, height: spec.height)
  }

  func render(progress: @escaping (Double) -> Void) throws -> URL {
    guard !spec.clips.isEmpty, spec.duration > 0 else { throw ExportError.noClips }

    try preloadImages()

    let outURL = FileManager.default.temporaryDirectory
      .appendingPathComponent(spec.fileName.isEmpty ? "reel.mp4" : spec.fileName)
    try? FileManager.default.removeItem(at: outURL)

    let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: spec.width,
      AVVideoHeightKey: spec.height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: max(4_000_000, spec.width * spec.height * 4),
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ],
    ]
    let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    videoInput.expectsMediaDataInRealTime = false

    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: videoInput,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
        kCVPixelBufferWidthKey as String: spec.width,
        kCVPixelBufferHeightKey as String: spec.height,
        kCVPixelBufferCGImageCompatibilityKey as String: true,
      ]
    )
    guard writer.canAdd(videoInput) else { throw ExportError.writerFailed("video girişi eklenemedi") }
    writer.add(videoInput)

    // Ses: kaynak varsa döngüyle süreye tamamlanır
    var audioInput: AVAssetWriterInput?
    var audioReader: AVAssetReader?
    var audioOutput: AVAssetReaderTrackOutput?

    if let audio = spec.audio, !audio.uri.isEmpty,
       let composition = try? buildAudioComposition(audio: audio, duration: spec.duration),
       let track = composition.tracks(withMediaType: .audio).first {
      let reader = try AVAssetReader(asset: composition)
      let output = AVAssetReaderTrackOutput(
        track: track,
        outputSettings: [
          AVFormatIDKey: Int(kAudioFormatLinearPCM),
          AVLinearPCMIsBigEndianKey: false,
          AVLinearPCMIsFloatKey: false,
          AVLinearPCMBitDepthKey: 16,
          AVLinearPCMIsNonInterleaved: false,
        ]
      )
      if reader.canAdd(output) {
        reader.add(output)
        let input = AVAssetWriterInput(
          mediaType: .audio,
          outputSettings: [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVNumberOfChannelsKey: 2,
            AVSampleRateKey: 44100,
            AVEncoderBitRateKey: 128_000,
          ]
        )
        input.expectsMediaDataInRealTime = false
        if writer.canAdd(input) {
          writer.add(input)
          audioInput = input
          audioReader = reader
          audioOutput = output
        }
      }
    }

    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    // --- video kareleri ---
    let frameCount = max(1, Int((spec.duration * Double(spec.fps)).rounded()))
    let queue = DispatchQueue(label: "reel.video")
    let videoDone = DispatchSemaphore(value: 0)
    var renderError: Error?

    videoInput.requestMediaDataWhenReady(on: queue) {
      while videoInput.isReadyForMoreMediaData {
        let i = self.nextFrame
        if i >= frameCount {
          videoInput.markAsFinished()
          videoDone.signal()
          return
        }
        self.nextFrame += 1
        let t = Double(i) / Double(self.spec.fps)
        autoreleasepool {
          guard let pool = adaptor.pixelBufferPool,
                let buffer = self.makePixelBuffer(pool: pool, time: t) else {
            renderError = ExportError.writerFailed("kare üretilemedi")
            videoInput.markAsFinished()
            videoDone.signal()
            return
          }
          let pts = CMTime(value: CMTimeValue(i), timescale: CMTimeScale(self.spec.fps))
          if !adaptor.append(buffer, withPresentationTime: pts) {
            renderError = ExportError.writerFailed(writer.error?.localizedDescription ?? "append")
            videoInput.markAsFinished()
            videoDone.signal()
            return
          }
        }
        if i % 5 == 0 { progress(Double(i) / Double(frameCount)) }
      }
    }
    videoDone.wait()
    if let e = renderError { writer.cancelWriting(); throw e }

    // --- ses ---
    if let input = audioInput, let reader = audioReader, let output = audioOutput {
      reader.startReading()
      let audioQueue = DispatchQueue(label: "reel.audio")
      let audioDone = DispatchSemaphore(value: 0)
      input.requestMediaDataWhenReady(on: audioQueue) {
        while input.isReadyForMoreMediaData {
          if let sample = output.copyNextSampleBuffer() {
            if !input.append(sample) {
              input.markAsFinished(); audioDone.signal(); return
            }
          } else {
            input.markAsFinished(); audioDone.signal(); return
          }
        }
      }
      audioDone.wait()
    }

    let finishSem = DispatchSemaphore(value: 0)
    writer.finishWriting { finishSem.signal() }
    finishSem.wait()

    if writer.status != .completed {
      throw ExportError.writerFailed(writer.error?.localizedDescription ?? "bilinmeyen hata")
    }
    progress(1)
    return outURL
  }

  private var nextFrame = 0

  // MARK: Görsellerin hazırlanması

  private func preloadImages() throws {
    let maxDim = CGFloat(max(spec.width, spec.height)) * 1.6
    for clip in spec.clips where images[clip.uri] == nil {
      guard let url = URL(string: clip.uri) ?? URL(fileURLWithPath: clip.uri) as URL?,
            let data = try? Data(contentsOf: url),
            let image = UIImage(data: data) else {
        throw ExportError.imageMissing(clip.uri)
      }
      let scaled = ReelRenderer.downscale(image, maxDim: maxDim)
      guard let cg = scaled.cgImage else { throw ExportError.imageMissing(clip.uri) }
      // Renk filtresi global olduğu için kare kare değil, bir kez uygulanır
      images[clip.uri] = ReelFrame.applyFilter(cg, name: spec.filter)
    }
  }

  private static func downscale(_ image: UIImage, maxDim: CGFloat) -> UIImage {
    let w = image.size.width * image.scale
    let h = image.size.height * image.scale
    let m = max(w, h)
    // EXIF yönünü düzleştirmek için her durumda yeniden çizeriz
    let scale = m > maxDim ? maxDim / m : 1
    let target = CGSize(width: (w * scale).rounded(), height: (h * scale).rounded())
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: target, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: target))
    }
  }

  // MARK: Tek kare

  private func makePixelBuffer(pool: CVPixelBufferPool, time t: Double) -> CVPixelBuffer? {
    var pb: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb) == kCVReturnSuccess,
          let buffer = pb else { return nil }

    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    guard let base = CVPixelBufferGetBaseAddress(buffer),
          let ctx = CGContext(
            data: base,
            width: spec.width,
            height: spec.height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
          ) else { return nil }

    // Core Graphics kökeni sol-alt; üst-sol koordinatlarla çalışmak için çeviriyoruz
    ctx.translateBy(x: 0, y: CGFloat(spec.height))
    ctx.scaleBy(x: 1, y: -1)

    ReelFrame(spec: spec, images: images, size: size).draw(in: ctx, at: t)
    return buffer
  }

  // MARK: Ses zaman çizgisi

  private func buildAudioComposition(audio: AudioSpec, duration: Double) throws -> AVMutableComposition {
    let composition = AVMutableComposition()
    guard let url = URL(string: audio.uri) ?? URL(fileURLWithPath: audio.uri) as URL? else {
      return composition
    }
    let asset = AVURLAsset(url: url)
    guard let sourceTrack = asset.tracks(withMediaType: .audio).first,
          let target = composition.addMutableTrack(withMediaType: .audio,
                                                   preferredTrackID: kCMPersistentTrackID_Invalid)
    else { return composition }

    let assetDuration = CMTimeGetSeconds(asset.duration)
    guard assetDuration > 0.05 else { return composition }

    let start = max(0, min(audio.startSec, max(0, assetDuration - 0.1)))
    var filled: Double = 0
    var cursor = CMTime.zero
    var guardCount = 0

    while filled < duration && guardCount < 512 {
      guardCount += 1
      let available = assetDuration - (filled == 0 ? start : 0)
      let take = min(available, duration - filled)
      if take <= 0.01 { break }
      let from = CMTime(seconds: filled == 0 ? start : 0, preferredTimescale: 600)
      let range = CMTimeRange(start: from, duration: CMTime(seconds: take, preferredTimescale: 600))
      try target.insertTimeRange(range, of: sourceTrack, at: cursor)
      cursor = CMTimeAdd(cursor, range.duration)
      filled += take
    }

    // Dahili ritimlerde tempoyu hedefe çekmek için zaman ölçekleme
    if audio.rate > 0 && abs(audio.rate - 1) > 0.001 {
      let full = CMTimeRange(start: .zero, duration: cursor)
      let scaled = CMTime(seconds: CMTimeGetSeconds(cursor) / audio.rate, preferredTimescale: 600)
      target.scaleTimeRange(full, toDuration: scaled)
    }
    return composition
  }
}
