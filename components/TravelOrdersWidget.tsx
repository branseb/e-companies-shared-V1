import { useState } from 'react'
import {
    Box, Button, Chip, CircularProgress, Collapse, IconButton,
    Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material'
import { Add, Delete, Edit, KeyboardArrowDown, KeyboardArrowUp, PictureAsPdf } from '@mui/icons-material'
import type { TravelOrder, TravelOrderInput, TravelOrdersWidgetProps } from '../types'
import { DEFAULT_STRAVNE_RATES, STATUS_MAP } from '../constants'
import {
    calcFuelCost, calcAmortization, calcDailyStravne,
    getRatesForDate,
    fmtDate, fmtAmt, transportShort,
    emptyForm,
} from '../helpers'
import OrderDialog from './OrderDialog'
import EmployeesDialog from './EmployeesDialog'
import RatesDialog from './RatesDialog'
import { TravelOrderDetailPanel } from './TravelOrderDetailPanel'

export const TravelOrdersWidget = ({
    orders, loading, onAdd, onUpdate, onDelete, onGeneratePdf, readOnly = false,
    ratesHistory: ratesProp, onRatesChange,
    employees = [], onEmployeeCreate, onEmployeeUpdate, onEmployeeDelete,
}: TravelOrdersWidgetProps) => {
    const [dialog, setDialog] = useState<{ isNew: boolean; form: TravelOrderInput; id?: TravelOrder['id'] } | null>(null)
    const [expandedRows, setExpandedRows] = useState<Set<TravelOrder['id']>>(new Set())
    const toggleRow = (id: TravelOrder['id']) => setExpandedRows(prev => {
        const s = new Set(prev)
        if (s.has(id)) s.delete(id); else s.add(id)
        return s
    })
    const [ratesOpen, setRatesOpen] = useState(false)
    const [empOpen, setEmpOpen] = useState(false)
    const effectiveRates = ratesProp ?? DEFAULT_STRAVNE_RATES

    const openNew  = () => setDialog({ isNew: true, form: emptyForm() })
    const openEdit = (row: TravelOrder) => {
        const { id: _id, createdAt: _c, ...rest } = row
        const form: TravelOrderInput = {
            ...rest as TravelOrderInput,
            advances: rest.advances ?? (rest.advanceAmount ? [{ amount: rest.advanceAmount, currency: rest.currency || 'EUR' }] : null),
        }
        setDialog({ isNew: false, form, id: row.id })
    }

    const handleSave = async (data: TravelOrderInput) => {
        if (dialog!.isNew) await onAdd(data)
        else               await onUpdate(dialog!.id!, data)
        setDialog(null)
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <CircularProgress />
            </Box>
        )
    }

    const count = orders.length
    const countLabel = count === 1 ? 'príkaz' : count < 5 ? 'príkazy' : 'príkazov'

    return (
        <Box>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Cestovné príkazy</Typography>
                <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {count} {countLabel}
                    </Typography>
                    {onEmployeeCreate && (
                        <Button size="small" variant="outlined" onClick={() => setEmpOpen(true)}>
                            Zamestnanci
                        </Button>
                    )}
                    {onRatesChange && (
                        <Button size="small" onClick={() => setRatesOpen(true)}>
                            Sadzby
                        </Button>
                    )}
                    {!readOnly && (
                        <Button variant="contained" startIcon={<Add />} size="small" onClick={openNew}>
                            Nový príkaz
                        </Button>
                    )}
                </Stack>
            </Stack>

            {orders.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center' }}>
                    <Typography sx={{ color: 'text.secondary' }}>Zatiaľ žiadne cestovné príkazy.</Typography>
                </Paper>
            ) : (
                <Paper sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Zamestnanec</TableCell>
                                <TableCell>Destinácia</TableCell>
                                <TableCell>Odchod</TableCell>
                                <TableCell>Návrat</TableCell>
                                <TableCell>Doprava</TableCell>
                                <TableCell align="right">Záloha</TableCell>
                                <TableCell align="right">Spolu</TableCell>
                                <TableCell>Stav</TableCell>
                                <TableCell align="right">Akcie</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {orders.map(r => {
                                const s = STATUS_MAP[r.status] ?? { label: r.status, color: 'default' as const }
                                const rowCarKm = (() => {
                                    const t = (r.trips ?? []).flatMap(t => t.segments).filter(s => s.transport === 'car').reduce((s, seg) => s + (seg.km ?? 0), 0)
                                    return t > 0 ? t : (r.distanceKm ?? 0)
                                })()
                                const fuelCost    = rowCarKm && r.fuelConsumption && r.fuelPricePerLiter
                                    ? calcFuelCost(rowCarKm, r.fuelConsumption, r.fuelPricePerLiter) : 0
                                const amort       = rowCarKm ? calcAmortization(rowCarKm, 'car', getRatesForDate(effectiveRates, r.departureDate).amortizationRate) : 0
                                const depStr      = [r.departureDate ? fmtDate(r.departureDate) : null, r.departureTime].filter(Boolean).join(' ')
                                const retDate     = r.trips?.length ? r.trips[r.trips.length - 1].returnDate : r.returnDate
                                const retStr      = retDate ? fmtDate(retDate) : '—'
                                const destination = r.trips?.length
                                    ? r.trips.map(t => t.destination).join(' / ')
                                    : r.destination
                                const stravneMap: Record<string, number> = {}
                                for (const t of r.trips ?? []) {
                                    for (const ds of calcDailyStravne(t.segments, effectiveRates)) {
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
                                const totalParts = Object.entries(totalsMap)
                                    .filter(([, amt]) => amt > 0)
                                    .map(([c, amt]) => `${amt.toFixed(2)} ${c}`)
                                const isExpanded = expandedRows.has(r.id)
                                const colCount = 9
                                return (
                                    <>
                                        <TableRow key={r.id} hover sx={{ cursor: 'pointer', '& > *': { borderBottom: isExpanded ? 'unset' : undefined } }} onClick={() => toggleRow(r.id)}>
                                            <TableCell sx={{ fontWeight: 500 }}>{r.employee}</TableCell>
                                            <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {destination}
                                            </TableCell>
                                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{depStr || '—'}</TableCell>
                                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{retStr}</TableCell>
                                            <TableCell>
                                                {transportShort(r.transportType)}
                                                {r.distanceKm != null && ` ${r.distanceKm} km`}
                                            </TableCell>
                                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                                {r.advances?.length
                                                    ? r.advances.map(a => fmtAmt(a.amount, a.currency)).join(' + ')
                                                    : fmtAmt(r.advanceAmount, r.currency)}
                                            </TableCell>
                                            <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                                                {totalParts.length ? totalParts.join(' + ') : '—'}
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={s.label} color={s.color} size="small" />
                                            </TableCell>
                                            <TableCell align="right" onClick={e => e.stopPropagation()}>
                                                <Stack direction="row" sx={{ justifyContent: 'flex-end', gap: 0.5 }}>
                                                    <IconButton size="small" onClick={e => { e.stopPropagation(); toggleRow(r.id) }}>
                                                        {isExpanded ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                                                    </IconButton>
                                                    {onGeneratePdf && (
                                                        <Tooltip title="Generovať PDF">
                                                            <IconButton size="small" color="primary" onClick={() => onGeneratePdf(r)}>
                                                                <PictureAsPdf fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    {!readOnly && (
                                                        <>
                                                            <Tooltip title="Upraviť">
                                                                <IconButton size="small" onClick={() => openEdit(r)}>
                                                                    <Edit fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Vymazať">
                                                                <IconButton size="small" color="error" onClick={() => onDelete(r.id)}>
                                                                    <Delete fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </>
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow key={`${r.id}-detail`}>
                                            <TableCell colSpan={colCount} sx={{ p: 0, border: isExpanded ? undefined : 'none' }}>
                                                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                    <TravelOrderDetailPanel order={r} ratesHistory={effectiveRates} />
                                                </Collapse>
                                            </TableCell>
                                        </TableRow>
                                    </>
                                )
                            })}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            {dialog && (
                <OrderDialog
                    initial={dialog.form}
                    isNew={dialog.isNew}
                    ratesHistory={effectiveRates}
                    employees={employees}
                    onSave={handleSave}
                    onClose={() => setDialog(null)}
                />
            )}
            {empOpen && onEmployeeCreate && onEmployeeUpdate && onEmployeeDelete && (
                <EmployeesDialog
                    employees={employees}
                    onCreate={onEmployeeCreate}
                    onUpdate={onEmployeeUpdate}
                    onDelete={onEmployeeDelete}
                    onClose={() => setEmpOpen(false)}
                />
            )}
            {ratesOpen && (
                <RatesDialog
                    history={effectiveRates}
                    onSave={r => { onRatesChange?.(r); setRatesOpen(false) }}
                    onClose={() => setRatesOpen(false)}
                />
            )}
        </Box>
    )
}

export default TravelOrdersWidget
