import { useEffect, useRef, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Stack, Typography,
} from '@mui/material'
import { CameraAlt, CheckCircle, Collections, QrCode, Replay, UploadFile } from '@mui/icons-material'
import { useCameraQr } from '../hooks/useCameraQr'
import { EkasaTable, Row } from './EkasaTable'
import {
  detectKind, parsePaymentQr, fetchEkasaReceipt, decodeQrFromFile, buildReceiptFileName,
  type QrKind, type PaymentFields, type EkasaData,
} from '../utils/qr'

export type { EkasaData }

type Props = {
  open: boolean
  onClose: () => void
  cameraEnabled?: boolean
  onSave?: (file: File, ekasaId: string | null, ekasaData: EkasaData | null) => Promise<void>
}

type Phase = 'scan' | 'photo' | 'result'
type Mode  = 'camera' | 'file'

export const QrScanDialog = ({ open, onClose, cameraEnabled = true, onSave }: Props) => {
  const initialMode: Mode = cameraEnabled ? 'camera' : 'file'
  const [mode, setMode]                 = useState<Mode>(initialMode)
  const [phase, setPhase]               = useState<Phase>('scan')
  const [qrText, setQrText]             = useState<string | null>(null)
  const [kind, setKind]                 = useState<QrKind | null>(null)
  const [ekasa, setEkasa]               = useState<EkasaData | null>(null)
  const [payment, setPayment]           = useState<PaymentFields | null>(null)
  const [ekasaLoading, setEkasaLoading] = useState(false)
  const [ekasaError, setEkasaError]     = useState('')
  const [filePreview, setFilePreview]   = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [saveError, setSaveError]       = useState('')
  const capturedRef  = useRef<Blob | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const cam = useCameraQr({
    onQrDetected: (text) => {
      setPhase('photo')
      fetchEkasaData(text)
    },
  })

  const fetchEkasaData = async (text: string) => {
    setQrText(text)
    const k = detectKind(text)
    setKind(k)
    if (k === 'payment') {
      setPayment(parsePaymentQr(text))
    } else if (k === 'ekasa') {
      setEkasaLoading(true); setEkasaError('')
      try {
        setEkasa(await fetchEkasaReceipt(text.trim()))
      } catch (e: any) {
        setEkasaError(`Nepodarilo sa načítať z Finančnej správy: ${e?.message ?? 'sieťová chyba'}`)
      } finally {
        setEkasaLoading(false)
      }
    }
  }

  const handleCapture = async () => {
    const blob = await cam.captureFrame()
    cam.stop()
    if (!blob) { setPhase('result'); return }
    capturedRef.current = blob
    setFilePreview(URL.createObjectURL(blob))
    setPhase('result')
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setFilePreview(URL.createObjectURL(file))
    capturedRef.current = file
    setQrText(null); setEkasa(null); setPayment(null); setEkasaError('')
    const text = await decodeQrFromFile(file)
    if (!text) { setEkasaError('QR kód sa nepodarilo rozpoznať.'); return }
    await fetchEkasaData(text)
    setPhase('result')
  }

  const handleSave = async () => {
    if (!capturedRef.current || !qrText || !onSave) return
    setSaving(true); setSaveError('')
    try {
      const blob = capturedRef.current
      const fallbackName = blob instanceof File ? blob.name : `blok-${Date.now()}.jpg`
      const fileName = buildReceiptFileName(ekasa, fallbackName, qrText ?? undefined)
      const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' })
      await onSave(file, qrText.trim(), ekasa)
      setSaved(true)
    } catch (e: any) {
      if (e?.message === 'DUPLICATE') {
        setSaveError('Tento blok už bol nahraný.')
      } else {
        setSaveError(`Uloženie zlyhalo: ${e?.message ?? ''}`)
      }
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (open && mode === 'camera' && cameraEnabled) cam.start()
    return () => cam.stop()
  }, [open, mode])

  const reset = () => {
    setPhase('scan'); setQrText(null); setKind(null); setEkasa(null); setPayment(null)
    setEkasaError(''); setEkasaLoading(false); setFilePreview(null)
    capturedRef.current = null; setSaved(false); setSaveError('')
  }

  const handleClose  = () => { cam.stop(); reset(); onClose() }
  const handleRetry  = () => { reset(); if (mode === 'camera') cam.start() }
  const switchToFile = () => { cam.stop(); setMode('file'); reset() }

  const showCamera = cameraEnabled && mode === 'camera' && (phase === 'scan' || phase === 'photo')
  const canSave    = !!onSave && phase === 'result' && !!qrText && !ekasaLoading && !saving && !saved

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5 }}>
        <QrCode fontSize="small" />
        Skenovať QR kód z bloku
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>

        {/* kamera */}
        {showCamera && (
          <CameraView
            videoRef={cam.videoRef}
            displayRef={cam.displayRef}
            overlayRef={cam.overlayRef}
            scanCanvasRef={cam.scanCanvasRef}
            camReady={cam.camReady}
            camError={cam.camError}
            phase={phase}
          />
        )}

        {/* výber súboru */}
        {(mode === 'file' || !cameraEnabled) && phase === 'scan' && (
          <FileDropZone onFileClick={() => fileInputRef.current?.click()} />
        )}
        <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleFileSelect} />

        {/* náhľad fotky vo výsledku */}
        {phase === 'result' && filePreview && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Box component="img" src={filePreview} alt="blok"
              sx={{ maxWidth: '100%', maxHeight: 240, borderRadius: 1, objectFit: 'contain', display: 'block', mx: 'auto' }}
            />
          </Box>
        )}

        {/* správy a dáta */}
        <Box sx={{ p: 2 }}>
          {cam.camError && <Alert severity="warning" sx={{ mb: 1 }}>{cam.camError}</Alert>}
          {ekasaLoading && (
            <Stack sx={{ flexDirection: 'row', alignItems: 'center', gap: 1, mb: 1 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Načítavam dáta z Finančnej správy…</Typography>
            </Stack>
          )}
          {ekasaError  && <Alert severity="warning" sx={{ mb: 1 }}>{ekasaError}</Alert>}
          {saveError   && <Alert severity="error"   sx={{ mb: 1 }}>{saveError}</Alert>}
          {saved       && <Alert severity="success" icon={<CheckCircle />}>Blok bol uložený.</Alert>}

          {phase === 'result' && kind === 'ekasa' && ekasa && !ekasaLoading && (
            <>
              <Divider sx={{ mb: 1.5 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Pokladničný blok (eKasa)</Typography>
              <EkasaTable data={ekasa} />
            </>
          )}

          {phase === 'result' && kind === 'payment' && payment && (
            <>
              <Divider sx={{ mb: 1.5 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Platobný QR kód</Typography>
              <Stack sx={{ gap: 0.5 }}>
                {payment.IBAN   && <Row label="IBAN"              value={payment.IBAN} />}
                {payment.BIC    && <Row label="BIC / SWIFT"       value={payment.BIC} />}
                {payment.AMOUNT && <Row label="Suma"              value={`${payment.AMOUNT} ${payment.CURRENCY ?? 'EUR'}`} />}
                {payment.VS     && <Row label="Variabilný symbol" value={payment.VS} />}
              </Stack>
            </>
          )}

          {phase === 'result' && kind === 'unknown' && qrText && (
            <>
              <Divider sx={{ mb: 1.5 }} />
              <Box component="pre" sx={{ m: 0, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {qrText}
              </Box>
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {cameraEnabled && phase === 'scan' && mode === 'camera' && (
          <Button size="small" startIcon={<Collections />} onClick={switchToFile}>Z galérie / súborov</Button>
        )}
        {cameraEnabled && phase === 'scan' && mode === 'file' && (
          <Button size="small" startIcon={<CameraAlt />} onClick={() => { setMode('camera'); reset() }}>Odfotiť</Button>
        )}

        <Box sx={{ flex: 1 }} />
        <Button onClick={handleClose}>{saved ? 'Zavrieť' : 'Zrušiť'}</Button>

        {(phase === 'photo' || phase === 'result') && !saved && (
          <Button size="small" startIcon={<Replay />} onClick={handleRetry} disabled={saving}>
            Skenovať znova
          </Button>
        )}

        {phase === 'photo' && cameraEnabled && (
          <Button variant="contained" startIcon={<CameraAlt />} onClick={handleCapture}>
            Odfotiť blok
          </Button>
        )}

        {canSave && (
          <Button
            variant="contained"
            onClick={handleSave}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <UploadFile />}
            disabled={saving}
          >
            {saving ? 'Ukladám…' : 'Uložiť blok'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

// ── CameraView ────────────────────────────────────────────────────────────

type CameraViewProps = {
  videoRef:      React.RefObject<HTMLVideoElement | null>
  displayRef:    React.RefObject<HTMLCanvasElement | null>
  overlayRef:    React.RefObject<HTMLCanvasElement | null>
  scanCanvasRef: React.RefObject<HTMLCanvasElement | null>
  camReady: boolean
  camError: string
  phase:    Phase
}

const CameraView = ({ videoRef, displayRef, overlayRef, scanCanvasRef, camReady, camError, phase }: CameraViewProps) => (
  <Box sx={{ position: 'relative', bgcolor: '#000', lineHeight: 0 }}>
    <video ref={videoRef} muted playsInline style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }} />
    <canvas ref={displayRef}
      style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: camError ? 'none' : 'block' }}
    />
    <canvas ref={overlayRef}    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
    <canvas ref={scanCanvasRef} style={{ display: 'none' }} />

    {!camReady && !camError && (
      <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <CircularProgress sx={{ color: 'white' }} size={32} />
        <Typography variant="caption" sx={{ color: 'white' }}>Spúšťam kameru…</Typography>
      </Stack>
    )}

    {camReady && phase === 'scan' && (
      <Box sx={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', bgcolor: 'rgba(0,0,0,0.4)', px: 1.5, py: 0.5, borderRadius: 2 }}>
          Nasmerujte kameru na QR kód
        </Typography>
      </Box>
    )}

    {phase === 'photo' && (
      <Box sx={{ position: 'absolute', top: 8, left: 0, right: 0, textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: '#00e676', bgcolor: 'rgba(0,0,0,0.65)', px: 1.5, py: 0.5, borderRadius: 2, fontWeight: 600 }}>
          ✓ QR kód rozpoznaný — odfotte celý blok
        </Typography>
      </Box>
    )}
  </Box>
)

// ── FileDropZone ──────────────────────────────────────────────────────────

const FileDropZone = ({ onFileClick }: { onFileClick: () => void }) => (
  <Box onClick={onFileClick} sx={{
    m: 2, border: '2px dashed', borderColor: 'divider', borderRadius: 2, p: 4,
    textAlign: 'center', cursor: 'pointer', '&:hover': { borderColor: 'primary.main' },
  }}>
    <UploadFile sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      Kliknite alebo pretiahnite fotografiu bloku
    </Typography>
  </Box>
)
