import { Box, Chip, Divider, Stack, Typography } from '@mui/material'
import type { TravelOrderDetailPanelProps } from '../types'
import { calcFuelCost, calcAmortization, calcDailyStravne, getRatesForDate } from '../helpers'
import { fmtDate, fmtAmt, transportShort, transportLabel } from '../helpers'

const FinRow = ({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 2, py: 0.2 }}>
        <Typography variant="body2" sx={{ color: bold ? 'text.primary' : 'text.secondary', fontSize: 12 }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: bold ? 700 : 400, fontSize: 12, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value}</Typography>
    </Box>
)

export const TravelOrderDetailPanel = ({ order: r, ratesHistory }: TravelOrderDetailPanelProps) => {
    const rowCarKm = (() => {
        const t = (r.trips ?? []).flatMap(t => t.segments).filter(s => s.transport === 'car').reduce((s, seg) => s + (seg.km ?? 0), 0)
        return t > 0 ? t : (r.distanceKm ?? 0)
    })()
    const fuelCost = rowCarKm && r.fuelConsumption && r.fuelPricePerLiter
        ? calcFuelCost(rowCarKm, r.fuelConsumption, r.fuelPricePerLiter) : 0
    const amort = rowCarKm ? calcAmortization(rowCarKm, 'car', getRatesForDate(ratesHistory, r.departureDate).amortizationRate) : 0

    const stravneMap: Record<string, number> = {}
    for (const t of r.trips ?? [])
        for (const ds of calcDailyStravne(t.segments, ratesHistory))
            stravneMap[ds.currency] = (stravneMap[ds.currency] ?? 0) + ds.stravne

    const hasSegs = Object.keys(stravneMap).length > 0
    const totalsMap: Record<string, number> = { ...stravneMap }
    totalsMap['EUR'] = (totalsMap['EUR'] ?? 0) + fuelCost + amort
    const mainCur = r.currency || 'EUR'
    totalsMap[mainCur] = (totalsMap[mainCur] ?? 0) + (r.actualExpenses ?? 0)
    if (!hasSegs) totalsMap[mainCur] = (totalsMap[mainCur] ?? 0) + (r.stravneAmount ?? 0)
    for (const t of r.trips ?? [])
        for (const seg of t.segments)
            for (const exp of seg.expenses ?? []) {
                const c = exp.currency || 'EUR'
                totalsMap[c] = (totalsMap[c] ?? 0) + (exp.amount ?? 0)
            }

    const advanceMap: Record<string, number> = {}
    if (r.advances?.length) {
        for (const a of r.advances) advanceMap[a.currency || 'EUR'] = (advanceMap[a.currency || 'EUR'] ?? 0) + (a.amount ?? 0)
    } else if (r.advanceAmount) {
        advanceMap[r.currency || 'EUR'] = r.advanceAmount
    }
    const netMap: Record<string, number> = {}
    for (const c of new Set([...Object.keys(totalsMap), ...Object.keys(advanceMap)])) {
        const net = (totalsMap[c] ?? 0) - (advanceMap[c] ?? 0)
        if (Math.abs(net) > 0.001) netMap[c] = net
    }
    const netParts = Object.entries(netMap).map(([c, amt]) => ({ c, amt }))
    const hasAdvance = !!(r.advances?.length || r.advanceAmount)
    const hasFinancials = Object.values(totalsMap).some(v => v > 0) || fuelCost > 0 || amort > 0

    return (
        <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
            <Stack sx={{ gap: 1.5 }}>

                {r.purpose && (
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                        {r.purpose}
                    </Typography>
                )}

                {(r.trips ?? []).map((trip, ti) => {
                    const tripStravne = calcDailyStravne(trip.segments, ratesHistory)
                    return (
                        <Box key={ti}>
                            {(r.trips?.length ?? 0) > 1 && (
                                <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.75 }}>
                                    {trip.destination}{trip.purpose ? ` — ${trip.purpose}` : ''}
                                </Typography>
                            )}
                            <Stack sx={{ gap: 0.75 }}>
                                {trip.segments.map((seg, si) => {
                                    const isLastOfDate = trip.segments[si + 1]?.date !== seg.date
                                    const dayStravne = isLastOfDate ? tripStravne.filter(ds => ds.date === seg.date) : []
                                    return (
                                        <Box key={si} sx={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '2px 8px', alignItems: 'start' }}>
                                            <Chip size="small" label={fmtDate(seg.date)}
                                                sx={{ fontWeight: 600, fontSize: 11, height: 20, borderRadius: 1, mt: '2px' }} />
                                            <Box>
                                                <Typography variant="body2" sx={{ fontSize: 12, lineHeight: 1.5 }}>
                                                    <strong>{seg.fromPlace}</strong>
                                                    {seg.fromTime && <span style={{ color: '#888' }}> {seg.fromTime}</span>}
                                                    {' → '}
                                                    <strong>{seg.toPlace}</strong>
                                                    {seg.toTime && <span style={{ color: '#888' }}> {seg.toTime}</span>}
                                                </Typography>
                                                <Stack direction="row" sx={{ gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
                                                    <Chip size="small" variant="outlined" label={transportShort(seg.transport)} sx={{ fontSize: 11, height: 20, borderRadius: 1 }} />
                                                    {seg.km != null && seg.km > 0 && (
                                                        <Chip size="small" variant="outlined" label={`${seg.km} km`} sx={{ fontSize: 11, height: 20, borderRadius: 1 }} />
                                                    )}
                                                    {dayStravne.map((ds, i) => (
                                                        <Chip key={i} size="small" color="info" variant="outlined"
                                                            label={`stravné ${ds.stravne.toFixed(2)} ${ds.currency} (${ds.hours} h)`}
                                                            sx={{ fontSize: 11, height: 20, borderRadius: 1 }} />
                                                    ))}
                                                </Stack>
                                            </Box>
                                        </Box>
                                    )
                                })}
                            </Stack>
                        </Box>
                    )
                })}

                {(r.transportType || r.fuelConsumption != null) && (
                    <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
                        {r.transportType && (
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12 }}>
                                {transportLabel(r.transportType)}{r.ecv ? ` · EČV: ${r.ecv}` : ''}
                            </Typography>
                        )}
                        {r.fuelConsumption != null && (
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12 }}>
                                {r.fuelConsumption} {r.isElectric ? 'kWh/100km' : 'l/100km'}
                                {r.fuelPricePerLiter ? ` @ ${r.fuelPricePerLiter} ${r.isElectric ? '€/kWh' : '€/l'}` : ''}
                            </Typography>
                        )}
                    </Stack>
                )}

                {hasFinancials && (
                        <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1 }}>
                            {Object.entries(stravneMap).map(([c, amt]) => (
                                <FinRow key={c} label={`Stravné${c !== 'EUR' ? ` (${c})` : ''}`} value={`${amt.toFixed(2)} ${c}`} />
                            ))}
                            {fuelCost > 0 && <FinRow label={r.isElectric ? 'El. energia' : 'PHM'} value={`${fuelCost.toFixed(2)} EUR`} />}
                            {amort > 0 && <FinRow label="Amortizácia" value={`${amort.toFixed(2)} EUR`} />}

                            <Divider sx={{ my: 0.75 }} />

                            {Object.entries(totalsMap).filter(([, v]) => v > 0).map(([c, amt], i) => (
                                <FinRow key={c} label={i === 0 ? 'Celkom' : ''} value={`${amt.toFixed(2)} ${c}`} bold />
                            ))}

                            {hasAdvance && (
                                <FinRow
                                    label="Záloha"
                                    value={r.advances?.length
                                        ? r.advances.map(a => fmtAmt(a.amount, a.currency)).join(' + ')
                                        : fmtAmt(r.advanceAmount, r.currency) ?? ''}
                                />
                            )}

                            {hasAdvance && netParts.length > 0 && (
                                <>
                                    <Divider sx={{ my: 0.75 }} />
                                    {netParts.map(({ c, amt }) => (
                                        <Box key={c} sx={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            mt: 0.5, px: 1, py: 0.6, borderRadius: 1,
                                            bgcolor: amt > 0 ? 'success.light' : 'warning.light',
                                        }}>
                                            <Typography sx={{ fontSize: 12, fontWeight: 700, color: amt > 0 ? 'success.dark' : 'warning.dark' }}>
                                                {amt > 0 ? 'Doplatok' : 'Preplatok'}
                                            </Typography>
                                            <Typography sx={{ fontSize: 12, fontWeight: 700, color: amt > 0 ? 'success.dark' : 'warning.dark', fontVariantNumeric: 'tabular-nums' }}>
                                                {amt > 0 ? '+' : ''}{amt.toFixed(2)} {c}
                                            </Typography>
                                        </Box>
                                    ))}
                                </>
                            )}
                    </Box>
                )}

                {r.notes && (
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', fontSize: 12 }}>
                        {r.notes}
                    </Typography>
                )}

            </Stack>
        </Box>
    )
}

export default TravelOrderDetailPanel
