import { Fragment, useState } from 'react'
import {
    Box, Button, Chip, CircularProgress, Collapse, Divider, IconButton,
    InputAdornment, Menu, MenuItem, Paper, Stack, Table, TableBody, TableCell,
    TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
    useMediaQuery, useTheme,
} from '@mui/material'
import { Add, ContentCopy, Delete, Edit, PictureAsPdf, Search } from '@mui/icons-material'
import type { TravelOrder, TravelOrderAttachment, TravelOrderInput, TravelOrdersWidgetProps, TravelPreferences } from '../types'
import { DEFAULT_TRAVEL_PREFERENCES } from '../types'
import { DEFAULT_STRAVNE_RATES, STATUS_MAP, STATUS_OPTIONS } from '../constants'
import {
    computeOrderFinancials, getRatesForDate,
    fmtDate, fmtAmt, transportShort,
    emptyForm,
} from '../helpers'
import OrderDialog from './OrderDialog'
import EmployeesDialog from './EmployeesDialog'
import RatesDialog from './RatesDialog'
import { TravelOrderDetailPanel } from './TravelOrderDetailPanel'

export const TravelOrdersWidget = ({
    orders, loading, onAdd, onUpdate, onDelete, onGeneratePdf, readOnly = false,
    ratesHistory: ratesProp,
    companyRates, onCompanyRatesChange,
    employees = [], onEmployeeCreate, onEmployeeUpdate, onEmployeeDelete,
    preferences: prefsProp, onPreferencesChange,
    onGetAttachments, onAddAttachment, onAddAttachmentFromPath, onOpenAttachment, onDeleteAttachment, onMigrateAttachments,
    onReadAttachment, onFetchExchangeRates, onFetchFuelPrice,
}: TravelOrdersWidgetProps) => {
    const [dialog, setDialog] = useState<{ isNew: boolean; form: TravelOrderInput; id?: TravelOrder['id'] } | null>(null)
    const [expandedRows, setExpandedRows] = useState<Set<TravelOrder['id']>>(new Set())
    const [attachmentsMap, setAttachmentsMap] = useState<Record<string | number, TravelOrderAttachment[]>>({})
    const toggleRow = (id: TravelOrder['id']) => setExpandedRows(prev => {
        const s = new Set(prev)
        if (s.has(id)) {
            s.delete(id)
        } else {
            s.add(id)
            if (onGetAttachments && !(id in attachmentsMap)) {
                onGetAttachments(id).then(atts => setAttachmentsMap(m => ({ ...m, [id]: atts })))
            }
        }
        return s
    })
    const [ratesOpen, setRatesOpen] = useState(false)
    const [empOpen, setEmpOpen] = useState(false)
    const effectivePrefs: TravelPreferences = prefsProp ?? DEFAULT_TRAVEL_PREFERENCES
    const [filterStatus, setFilterStatus] = useState('all')
    const [search, setSearch] = useState('')
    const [statusMenu, setStatusMenu] = useState<{ anchor: HTMLElement; order: TravelOrder } | null>(null)
    const effectiveRates = ratesProp ?? DEFAULT_STRAVNE_RATES
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))

    const toInput = (row: TravelOrder): TravelOrderInput => {
        const { id: _id, createdAt: _c, ...rest } = row
        return {
            ...rest as TravelOrderInput,
            advances: rest.advances ?? (rest.advanceAmount ? [{ amount: rest.advanceAmount, currency: rest.currency || 'EUR' }] : null),
        }
    }

    const openNew = () => setDialog({ isNew: true, form: emptyForm() })
    const openEdit = (row: TravelOrder) => setDialog({ isNew: false, form: toInput(row), id: row.id })
    const openDuplicate = (row: TravelOrder) => {
        const form = toInput(row)
        form.departureDate = new Date().toISOString().split('T')[0]
        form.status = 'draft'
        setDialog({ isNew: true, form })
    }

    const handleSave = async (data: TravelOrderInput, attachmentTempId: string) => {
        if (dialog!.isNew) {
            const newId = await onAdd(data)
            if (newId != null && onMigrateAttachments) {
                await onMigrateAttachments(attachmentTempId, newId).catch(() => {/* non-fatal */})
            }
        } else {
            await onUpdate(dialog!.id!, data)
        }
        setDialog(null)
    }

    const handleStatusChange = async (newStatus: string) => {
        if (!statusMenu || !onUpdate) return
        await onUpdate(statusMenu.order.id, { ...toInput(statusMenu.order), status: newStatus })
        setStatusMenu(null)
    }

    const computeRow = (r: TravelOrder) => {
        const { rowCarKm, totalsMap } = computeOrderFinancials(r, effectiveRates)
        const depStr = r.departureDate ? fmtDate(r.departureDate) : '—'
        const retDate = r.trips?.length ? r.trips[r.trips.length - 1].returnDate : r.returnDate
        const retStr = retDate ? fmtDate(retDate) : '—'
        const destination = r.trips?.length
            ? r.trips.map(t => [t.destination, ...(t.waypoints ?? []).map(w => w.place)].filter(Boolean).join(', ')).join(' / ')
            : r.destination
        const totalParts = Object.entries(totalsMap).filter(([, amt]) => amt > 0).map(([c, amt]) => `${amt.toFixed(2)} ${c}`)
        const advanceStr = r.advances?.length
            ? r.advances.map(a => fmtAmt(a.amount, a.currency)).join(' + ')
            : fmtAmt(r.advanceAmount, r.currency)
        return { rowCarKm, depStr, retStr, destination, totalParts, advanceStr }
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <CircularProgress />
            </Box>
        )
    }

    const filteredOrders = orders
        .filter(r => filterStatus === 'all' || r.status === filterStatus)
        .filter(r => {
            if (!search) return true
            const q = search.toLowerCase()
            return (
                r.employee?.toLowerCase().includes(q) ||
                r.destination?.toLowerCase().includes(q) ||
                r.trips?.some(t =>
                    t.destination?.toLowerCase().includes(q) ||
                    t.waypoints?.some(w => w.place?.toLowerCase().includes(q)))
            )
        })

    // ── Cost summary ──────────────────────────────────────────────────────────
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

    const sumOrdersEur = (rows: TravelOrder[]) =>
        rows.reduce((acc, r) => acc + (computeOrderFinancials(r, effectiveRates).totalsMap['EUR'] ?? 0), 0)

    const currentMonthTotal = sumOrdersEur(filteredOrders.filter(r =>
        (r.trips?.[0]?.departureDate ?? r.departureDate ?? '').slice(0, 7) === currentMonth))
    const prevMonthTotal = sumOrdersEur(filteredOrders.filter(r =>
        (r.trips?.[0]?.departureDate ?? r.departureDate ?? '').slice(0, 7) === prevMonth))

    const count = orders.length
    const countLabel = count === 1 ? 'príkaz' : count < 5 ? 'príkazy' : 'príkazov'

    const statusChipProps = (r: TravelOrder) => {
        const s = STATUS_MAP[r.status] ?? { label: r.status, color: 'default' as const }
        const canChange = !readOnly && !!onUpdate
        return {
            label: s.label,
            color: s.color,
            size: 'small' as const,
            onClick: canChange ? (e: React.MouseEvent<HTMLElement>) => { e.stopPropagation(); setStatusMenu({ anchor: e.currentTarget, order: r }) } : undefined,
            sx: { cursor: canChange ? 'pointer' : 'default' },
        }
    }

    const actionButtons = (r: TravelOrder) => (
        <>
            {onGeneratePdf && (
                <Tooltip title="Generovať PDF">
                    <IconButton size="small" color="primary" onClick={() => onGeneratePdf(r)}>
                        <PictureAsPdf fontSize="small" />
                    </IconButton>
                </Tooltip>
            )}
            {!readOnly && (
                <>
                    <Tooltip title="Duplikovať">
                        <IconButton size="small" onClick={() => openDuplicate(r)}>
                            <ContentCopy fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Upraviť">
                        <IconButton size="small" onClick={() => openEdit(r)}>
                            <Edit fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Vymazať">
                        <IconButton size="small" color="error" onClick={() => onDelete(r.id, (r as any).firebaseId)}>
                            <Delete fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </>
            )}
        </>
    )

    return (
        <Box>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Cestovné príkazy</Typography>
                <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {count} {countLabel}
                    </Typography>
                    {onEmployeeCreate && (
                        <Button size="small" variant="outlined" onClick={() => setEmpOpen(true)}>Zamestnanci</Button>
                    )}
                    {onCompanyRatesChange && (
                        <Button size="small" onClick={() => setRatesOpen(true)}>Nastavenia</Button>
                    )}
                    {!readOnly && (
                        <Button variant="contained" startIcon={<Add />} size="small" onClick={openNew}>
                            Nový príkaz
                        </Button>
                    )}
                </Stack>
            </Stack>

            {orders.length > 0 && (
                <Stack sx={{ mb: 2, gap: 1 }}>
                    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                        <TextField
                            size="small"
                            placeholder="Hľadať..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }}
                            sx={{ minWidth: 180 }}
                        />
                    </Stack>
                    <ToggleButtonGroup size="small" exclusive value={filterStatus} onChange={(_, v) => v && setFilterStatus(v)} sx={{ flexWrap: 'wrap' }}>
                        <ToggleButton value="all">Všetky</ToggleButton>
                        {STATUS_OPTIONS.map(o => (
                            <ToggleButton key={o.value} value={o.value}>{o.label}</ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                    {/* Cost summary */}
                    {(currentMonthTotal > 0 || prevMonthTotal > 0) && (
                        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                            {currentMonthTotal > 0 && (
                                <Chip size="small" color="primary" variant="outlined"
                                    label={`Tento mesiac: ${currentMonthTotal.toFixed(2)} EUR`} />
                            )}
                            {prevMonthTotal > 0 && (
                                <Chip size="small" color="default" variant="outlined"
                                    label={`Minulý mesiac: ${prevMonthTotal.toFixed(2)} EUR`} />
                            )}
                        </Stack>
                    )}
                </Stack>
            )}

            {orders.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center' }}>
                    <Typography sx={{ color: 'text.secondary' }}>Zatiaľ žiadne cestovné príkazy.</Typography>
                </Paper>
            ) : filteredOrders.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center' }}>
                    <Typography sx={{ color: 'text.secondary' }}>Žiadne výsledky pre zadané filtre.</Typography>
                </Paper>
            ) : isMobile ? (
                <Stack sx={{ gap: 1.5 }}>
                    {filteredOrders.map(r => {
                        const { rowCarKm, depStr, retStr, destination, totalParts, advanceStr } = computeRow(r)
                        const isExpanded = expandedRows.has(r.id)
                        return (
                            <Paper key={r.id} variant="outlined" sx={{ overflow: 'hidden' }}>
                                <Box sx={{ px: 2, pt: 1.5, pb: 1, cursor: 'pointer' }} onClick={() => toggleRow(r.id)}>
                                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                                        <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{r.employee}</Typography>
                                        <Chip {...statusChipProps(r)} sx={{ ...statusChipProps(r).sx, ml: 1, flexShrink: 0 }} />
                                    </Stack>
                                    {destination && (
                                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {destination}
                                        </Typography>
                                    )}
                                    <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', mb: 0.5 }}>
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                            {depStr} → {retStr}
                                        </Typography>
                                        {(r.transportType || rowCarKm > 0) && (
                                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                {transportShort(r.transportType)}{rowCarKm > 0 ? ` ${rowCarKm} km` : ''}
                                            </Typography>
                                        )}
                                    </Stack>
                                    <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
                                        {advanceStr && (
                                            <Typography variant="body2">
                                                <span style={{ color: theme.palette.text.secondary }}>Záloha: </span>
                                                {advanceStr}
                                            </Typography>
                                        )}
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            <span style={{ color: theme.palette.text.secondary, fontWeight: 400 }}>Spolu: </span>
                                            {totalParts.length ? totalParts.join(' + ') : '—'}
                                        </Typography>
                                    </Stack>
                                </Box>
                                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                    <TravelOrderDetailPanel
                                        order={r}
                                        ratesHistory={effectiveRates}
                                        attachments={onGetAttachments ? (attachmentsMap[r.id] ?? []) : undefined}
                                        onAddAttachment={onAddAttachment ? async () => {
                                            const att = await onAddAttachment(r.id)
                                            if (att) setAttachmentsMap(m => ({ ...m, [r.id]: [...(m[r.id] ?? []), att] }))
                                        } : undefined}
                                        onOpenAttachment={onOpenAttachment ? (id) => onOpenAttachment(r.id, id) : undefined}
                                        onDeleteAttachment={onDeleteAttachment ? async (id) => {
                                            await onDeleteAttachment(r.id, id)
                                            setAttachmentsMap(m => ({ ...m, [r.id]: (m[r.id] ?? []).filter(a => a.id !== id) }))
                                        } : undefined}
                                        onReadAttachment={onReadAttachment ? (id) => onReadAttachment(r.id, id) : undefined}
                                    />
                                </Collapse>
                                <Divider />
                                <Stack direction="row" sx={{ px: 1, py: 0.5, gap: 0.5, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                                    {actionButtons(r)}
                                </Stack>
                            </Paper>
                        )
                    })}
                </Stack>
            ) : (
                <Paper sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Zamestnanec</TableCell>
                                <TableCell>Destinácia</TableCell>
                                <TableCell>Odchod</TableCell>
                                <TableCell sx={{ display: { md: 'none', lg: 'table-cell' } }}>Návrat</TableCell>
                                <TableCell sx={{ display: { md: 'none', lg: 'table-cell' } }}>Doprava</TableCell>
                                <TableCell align="right" sx={{ display: { md: 'none', lg: 'table-cell' } }}>Záloha</TableCell>
                                <TableCell align="right">Spolu</TableCell>
                                <TableCell>Stav</TableCell>
                                <TableCell align="right">Akcie</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredOrders.map(r => {
                                const { rowCarKm, depStr, retStr, destination, totalParts } = computeRow(r)
                                const isExpanded = expandedRows.has(r.id)
                                return (
                                    <Fragment key={r.id}>
                                        <TableRow hover sx={{ cursor: 'pointer', '& > *': { borderBottom: isExpanded ? 'unset' : undefined } }} onClick={() => toggleRow(r.id)}>
                                            <TableCell sx={{ fontWeight: 500 }}>{r.employee}</TableCell>
                                            <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {destination}
                                            </TableCell>
                                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{depStr}</TableCell>
                                            <TableCell sx={{ whiteSpace: 'nowrap', display: { md: 'none', lg: 'table-cell' } }}>{retStr}</TableCell>
                                            <TableCell sx={{ display: { md: 'none', lg: 'table-cell' } }}>
                                                {transportShort(r.transportType)}
                                                {rowCarKm > 0 && ` ${rowCarKm} km`}
                                            </TableCell>
                                            <TableCell align="right" sx={{ whiteSpace: 'nowrap', display: { md: 'none', lg: 'table-cell' } }}>
                                                {r.advances?.length
                                                    ? r.advances.map(a => fmtAmt(a.amount, a.currency)).join(' + ')
                                                    : fmtAmt(r.advanceAmount, r.currency)}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                                                {totalParts.length
                                                    ? totalParts.map((p, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{p}</div>)
                                                    : '—'}
                                            </TableCell>
                                            <TableCell onClick={e => e.stopPropagation()}>
                                                <Chip {...statusChipProps(r)} />
                                            </TableCell>
                                            <TableCell align="right" onClick={e => e.stopPropagation()}>
                                                <Stack direction="row" sx={{ justifyContent: 'flex-end', gap: 0.5 }}>
                                                    {actionButtons(r)}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell colSpan={9} sx={{ p: 0, border: isExpanded ? undefined : 'none' }}>
                                                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                    <TravelOrderDetailPanel
                                        order={r}
                                        ratesHistory={effectiveRates}
                                        attachments={onGetAttachments ? (attachmentsMap[r.id] ?? []) : undefined}
                                        onAddAttachment={onAddAttachment ? async () => {
                                            const att = await onAddAttachment(r.id)
                                            if (att) setAttachmentsMap(m => ({ ...m, [r.id]: [...(m[r.id] ?? []), att] }))
                                        } : undefined}
                                        onOpenAttachment={onOpenAttachment ? (id) => onOpenAttachment(r.id, id) : undefined}
                                        onDeleteAttachment={onDeleteAttachment ? async (id) => {
                                            await onDeleteAttachment(r.id, id)
                                            setAttachmentsMap(m => ({ ...m, [r.id]: (m[r.id] ?? []).filter(a => a.id !== id) }))
                                        } : undefined}
                                        onReadAttachment={onReadAttachment ? (id) => onReadAttachment(r.id, id) : undefined}
                                    />
                                                </Collapse>
                                            </TableCell>
                                        </TableRow>
                                    </Fragment>
                                )
                            })}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            <Menu anchorEl={statusMenu?.anchor} open={!!statusMenu} onClose={() => setStatusMenu(null)}>
                {STATUS_OPTIONS.map(o => (
                    <MenuItem key={o.value} selected={statusMenu?.order.status === o.value} onClick={() => handleStatusChange(o.value)}>
                        {o.label}
                    </MenuItem>
                ))}
            </Menu>

            {dialog && (
                <OrderDialog
                    initial={dialog.form}
                    isNew={dialog.isNew}
                    orderId={dialog.id}
                    ratesHistory={effectiveRates}
                    employees={employees}
                    preferences={effectivePrefs}
                    approvalMode={companyRates?.approvalMode ?? 'direct'}
                    onSave={handleSave}
                    onClose={() => setDialog(null)}
                    onAddAttachment={onAddAttachment ? (tempId) => onAddAttachment(tempId) : undefined}
                    onAddAttachmentFromPath={onAddAttachmentFromPath ? (tempId, filePath) => onAddAttachmentFromPath(tempId, filePath) : undefined}
                    onDeleteAttachment={onDeleteAttachment ? (tempId, id) => onDeleteAttachment(tempId, id) : undefined}
                    onOpenAttachment={onOpenAttachment ? (tempId, id) => onOpenAttachment(tempId, id) : undefined}
                    onReadAttachment={onReadAttachment ? (tempId, id) => onReadAttachment(tempId, id) : undefined}
                    onFetchExchangeRates={onFetchExchangeRates}
                    onFetchFuelPrice={onFetchFuelPrice}
                />
            )}
            {empOpen && onEmployeeCreate && onEmployeeUpdate && onEmployeeDelete && (
                <EmployeesDialog
                    employees={employees}
                    foreignCountries={getRatesForDate(effectiveRates, new Date().toISOString().split('T')[0])?.foreign}
                    onCreate={onEmployeeCreate}
                    onUpdate={onEmployeeUpdate}
                    onDelete={onEmployeeDelete}
                    onClose={() => setEmpOpen(false)}
                />
            )}
            {ratesOpen && onCompanyRatesChange && (
                <RatesDialog
                    onClose={() => setRatesOpen(false)}
                    companyRates={companyRates}
                    onSave={r => { onCompanyRatesChange(r); setRatesOpen(false) }}
                    legalEntry={getRatesForDate(effectiveRates, new Date().toISOString().split('T')[0])}
                    ratesHistory={effectiveRates}
                    preferences={effectivePrefs}
                    onSavePreferences={onPreferencesChange ? p => { onPreferencesChange(p); setRatesOpen(false) } : undefined}
                />
            )}
        </Box>
    )
}

export default TravelOrdersWidget
