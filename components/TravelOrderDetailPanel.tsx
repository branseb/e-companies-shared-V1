import { Box, Chip, Stack, Typography } from '@mui/material'
import type { TravelOrderDetailPanelProps } from '../types'
import { calcFuelCost, calcAmortization, calcDailyStravne, getRatesForDate } from '../helpers'
import { fmtDate, fmtAmt, transportShort, transportLabel } from '../helpers'

export const TravelOrderDetailPanel = ({ order: r, ratesHistory }: TravelOrderDetailPanelProps) => {
    const rowCarKm = (() => {
        const t = (r.trips ?? []).flatMap(t => t.segments).filter(s => s.transport === 'car').reduce((s, seg) => s + (seg.km ?? 0), 0)
        return t > 0 ? t : (r.distanceKm ?? 0)
    })()
    const fuelCost = rowCarKm && r.fuelConsumption && r.fuelPricePerLiter
        ? calcFuelCost(rowCarKm, r.fuelConsumption, r.fuelPricePerLiter) : 0
    const amort = rowCarKm ? calcAmortization(rowCarKm, 'car', getRatesForDate(ratesHistory, r.departureDate).amortizationRate) : 0

    const stravneMap: Record<string, number> = {}
    for (const t of r.trips ?? []) {
        for (const ds of calcDailyStravne(t.segments, ratesHistory)) {
            stravneMap[ds.currency] = (stravneMap[ds.currency] ?? 0) + ds.stravne
        }
    }
    const hasSegs = Object.keys(stravneMap).length > 0
    const totalsMap: Record<string, number> = { ...stravneMap }
    totalsMap['EUR'] = (totalsMap['EUR'] ?? 0) + fuelCost + amort
    const mainCur = r.currency || 'EUR'
    totalsMap[mainCur] = (totalsMap[mainCur] ?? 0) + (r.actualExpenses ?? 0)
    if (!hasSegs) totalsMap[mainCur] = (totalsMap[mainCur] ?? 0) + (r.stravneAmount ?? 0)
    for (const t of r.trips ?? []) {
        for (const seg of t.segments) {
            for (const exp of seg.expenses ?? []) {
                const c = exp.currency || 'EUR'
                totalsMap[c] = (totalsMap[c] ?? 0) + (exp.amount ?? 0)
            }
        }
    }
    const totalParts = Object.entries(totalsMap).filter(([, amt]) => amt > 0).map(([c, amt]) => `${amt.toFixed(2)} ${c}`)

    return (
        <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
            <Stack sx={{ gap: 1 }}>
                {r.purpose && (
                    <Typography variant="body2">
                        <strong>Účel:</strong> {r.purpose}
                    </Typography>
                )}

                {(r.trips ?? []).map((trip, ti) => (
                    <Box key={ti}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {trip.destination}{trip.purpose ? ` — ${trip.purpose}` : ''}
                        </Typography>
                        <Stack sx={{ gap: 0.5, mt: 0.5 }}>
                            {trip.segments.map((seg, si) => (
                                <Box key={si} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', py: 0.25 }}>
                                    <Chip size="small" label={fmtDate(seg.date)} sx={{ fontWeight: 600, fontSize: 11, height: 20, borderRadius: 1 }} />
                                    <Typography variant="body2" sx={{ fontSize: 12 }}>
                                        <strong>{seg.fromPlace}</strong>
                                        {seg.fromTime && <span style={{ color: '#888' }}> {seg.fromTime}</span>}
                                        {' → '}
                                        <strong>{seg.toPlace}</strong>
                                        {seg.toTime && <span style={{ color: '#888' }}> {seg.toTime}</span>}
                                    </Typography>
                                    <Chip size="small" variant="outlined" label={transportShort(seg.transport)} sx={{ fontSize: 11, height: 20, borderRadius: 1 }} />
                                    {seg.km != null && seg.km > 0 && <Chip size="small" variant="outlined" label={`${seg.km} km`} sx={{ fontSize: 11, height: 20, borderRadius: 1 }} />}
                                    {seg.stravne != null && seg.stravne > 0 && <Chip size="small" color="info" variant="outlined" label={`stravné ${seg.stravne.toFixed(2)} ${seg.currency ?? 'EUR'}`} sx={{ fontSize: 11, height: 20, borderRadius: 1 }} />}
                                </Box>
                            ))}
                        </Stack>
                    </Box>
                ))}

                <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
                    {r.transportType && (
                        <Typography variant="body2">
                            <strong>Doprava:</strong> {transportLabel(r.transportType)}
                            {r.ecv ? `  EČV: ${r.ecv}` : ''}
                        </Typography>
                    )}
                    {r.fuelConsumption != null && (
                        <Typography variant="body2">
                            <strong>Spotreba:</strong> {r.fuelConsumption} l/100km
                            {r.fuelPricePerLiter ? `  @ ${r.fuelPricePerLiter} €/l` : ''}
                        </Typography>
                    )}
                </Stack>

                {(fuelCost > 0 || amort > 0) && (
                    <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
                        {fuelCost > 0 && (
                            <Typography variant="body2">
                                <strong>PHM:</strong> {fuelCost.toFixed(2)} EUR
                            </Typography>
                        )}
                        {amort > 0 && (
                            <Typography variant="body2">
                                <strong>Amortizácia:</strong> {amort.toFixed(2)} EUR
                            </Typography>
                        )}
                    </Stack>
                )}

                {totalParts.length > 0 && (
                    <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
                        <Typography variant="body2">
                            <strong>Celkom:</strong> {totalParts.join(' + ')}
                        </Typography>
                        {(r.advances?.length || r.advanceAmount) && (
                            <Typography variant="body2">
                                <strong>Záloha:</strong> {r.advances?.length
                                    ? r.advances.map(a => fmtAmt(a.amount, a.currency)).join(' + ')
                                    : fmtAmt(r.advanceAmount, r.currency)}
                            </Typography>
                        )}
                    </Stack>
                )}

                {r.notes && (
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                        {r.notes}
                    </Typography>
                )}
            </Stack>
        </Box>
    )
}

export default TravelOrderDetailPanel
