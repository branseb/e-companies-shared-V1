import { useRef, useState } from 'react'
import jsQR from 'jsqr'

const SCAN_W = 640
const SCAN_H = 480

type Props = {
  onQrDetected: (text: string) => void
}

export const useCameraQr = ({ onQrDetected }: Props) => {
  const videoRef      = useRef<HTMLVideoElement>(null)
  const displayRef    = useRef<HTMLCanvasElement>(null)
  const scanCanvas    = useRef<HTMLCanvasElement>(null)
  const overlayRef    = useRef<HTMLCanvasElement>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const rafRef        = useRef<number | null>(null)
  const firedRef      = useRef(false)
  const onDetectedRef = useRef(onQrDetected)
  onDetectedRef.current = onQrDetected

  const [camReady, setCamReady] = useState(false)
  const [camError, setCamError] = useState('')

  const stopLoop = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    const ov = overlayRef.current
    if (ov) ov.getContext('2d')?.clearRect(0, 0, ov.width, ov.height)
  }

  const stop = () => {
    stopLoop()
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    firedRef.current = false
    setCamReady(false)
  }

  const captureFrame = (): Promise<Blob | null> =>
    new Promise(resolve => {
      const vid = videoRef.current
      if (!vid) { resolve(null); return }
      const vw = vid.videoWidth, vh = vid.videoHeight
      const landscape = vw > vh
      const cap = document.createElement('canvas')
      if (landscape) {
        cap.width = vh; cap.height = vw
        const ctx = cap.getContext('2d')!
        ctx.translate(vh / 2, vw / 2)
        ctx.rotate(Math.PI / 2)
        ctx.drawImage(vid, -vw / 2, -vh / 2)
      } else {
        cap.width = vw; cap.height = vh
        cap.getContext('2d')!.drawImage(vid, 0, 0)
      }
      cap.toBlob(blob => resolve(blob), 'image/jpeg', 0.92)
    })

  const startLoop = () => {
    firedRef.current = false
    const tick = () => {
      const vid  = videoRef.current
      const disp = displayRef.current
      const sc   = scanCanvas.current
      const ov   = overlayRef.current
      if (!vid || !disp || !sc || !ov || vid.readyState < vid.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick); return
      }

      const vw = vid.videoWidth, vh = vid.videoHeight
      const landscape = vw > vh

      if (landscape) {
        disp.width = vh; disp.height = vw
        const dCtx = disp.getContext('2d')!
        dCtx.save()
        dCtx.translate(vh / 2, vw / 2)
        dCtx.rotate(Math.PI / 2)
        dCtx.drawImage(vid, -vw / 2, -vh / 2)
        dCtx.restore()
      } else {
        disp.width = vw; disp.height = vh
        disp.getContext('2d')!.drawImage(vid, 0, 0)
      }

      if (firedRef.current) { rafRef.current = requestAnimationFrame(tick); return }

      sc.width = SCAN_W; sc.height = SCAN_H
      const ctx = sc.getContext('2d')!
      ctx.drawImage(vid, 0, 0, SCAN_W, SCAN_H)
      const code = jsQR(ctx.getImageData(0, 0, SCAN_W, SCAN_H).data, SCAN_W, SCAN_H, { inversionAttempts: 'dontInvert' })

      ov.width = disp.clientWidth; ov.height = disp.clientHeight
      const ovCtx = ov.getContext('2d')!
      ovCtx.clearRect(0, 0, ov.width, ov.height)

      if (code) {
        firedRef.current = true
        onDetectedRef.current(code.data)
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const cx = ov.width / 2, cy = ov.height / 2
      const sz = Math.min(ov.width, ov.height) * 0.55
      const x = cx - sz / 2, y = cy - sz / 2
      ovCtx.strokeStyle = 'rgba(255,255,255,0.6)'; ovCtx.lineWidth = 2
      const arm = 28
      ;[
        [x, y, arm, 0], [x, y, 0, arm],
        [x + sz, y, -arm, 0], [x + sz, y, 0, arm],
        [x, y + sz, arm, 0], [x, y + sz, 0, -arm],
        [x + sz, y + sz, -arm, 0], [x + sz, y + sz, 0, -arm],
      ].forEach(([ox, oy, dx, dy]) => {
        ovCtx.beginPath(); ovCtx.moveTo(ox as number, oy as number)
        ovCtx.lineTo((ox as number) + (dx as number), (oy as number) + (dy as number)); ovCtx.stroke()
      })

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const start = async () => {
    setCamError(''); setCamReady(false); firedRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
      streamRef.current = stream
      const vid = videoRef.current!
      vid.srcObject = stream
      await vid.play()
      setCamReady(true)
      startLoop()
    } catch {
      setCamError('Kamera nie je dostupná. Použite nahranie zo súborov.')
    }
  }

  return { videoRef, displayRef, overlayRef, scanCanvasRef: scanCanvas, camReady, camError, start, stop, stopLoop, captureFrame }
}
