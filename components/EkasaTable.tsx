import {
  Box, Divider, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, Typography,
} from '@mui/material'
import type { EkasaData } from '../utils/qr'

const META_LABELS: [string, string][] = [
  ['receiptId',        'ID bloku'],
  ['ico',              'IČO'],
  ['dic',              'DIČ'],
  ['organizationName', 'Predajca'],
  ['shopName',         'Prevádzka'],
  ['cashRegisterCode', 'Kód pokladnice'],
  ['receiptNumber',    'Číslo bloku'],
  ['createDate',       'Dátum a čas'],
  ['paidByCard',       'Platba kartou'],
  ['address',          'Adresa'],
]

const PRICE_KEYS = new Set(['totalPrice', 'vatAmount'])
const KNOWN_KEYS = new Set([...META_LABELS.map(([k]) => k), ...PRICE_KEYS, 'items'])

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const fmtPrice = (v: unknown): string => {
  if (v == null || isNaN(Number(v))) return '—'
  const n = Number(v)
  return Math.round(n * 1000) / 1000 !== Math.round(n * 100) / 100 ? n.toFixed(3) : n.toFixed(2)
}

export const Row = ({ label, value }: { label: string; value: string }) => (
  <Stack sx={{ flexDirection: 'row', gap: 1 }}>
    <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 155, flexShrink: 0 }}>{label}:</Typography>
    <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-all' }}>{value}</Typography>
  </Stack>
)

const MetaField = ({ label, value }: { label: string; value: string }) => (
  <Stack sx={{ flexDirection: 'row', gap: 0.5, overflow: 'hidden', alignItems: 'baseline' }}>
    <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>{label}:</Typography>
    <Typography variant="caption" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Typography>
  </Stack>
)

type Item = Record<string, unknown>

const ItemsTable = ({ items }: { items: Item[] }) => (
  <>
    <Divider sx={{ my: 1 }} />
    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, fontSize: 12 }}>Položky</Typography>
    <Table size="small" sx={{ '& .MuiTableCell-root': { px: 0.5, py: 0.25, fontSize: 12 } }}>
      <TableHead>
        <TableRow>
          <TableCell>Popis</TableCell>
          <TableCell align="right">Množ.</TableCell>
          <TableCell align="right">J. cena</TableCell>
          <TableCell align="right">Suma</TableCell>
          <TableCell align="right">DPH%</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((item, i) => {
          const qty       = item.quantity ?? item.qty
          const total     = item.price ?? item.totalPrice
          const unitPrice = item.unitPrice != null
            ? item.unitPrice
            : (qty != null && total != null && Number(qty) !== 0 ? Number(total) / Number(qty) : undefined)
          return (
            <TableRow key={i}>
              <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {String(item.name ?? item.itemName ?? '—')}
              </TableCell>
              <TableCell align="right">{fmtPrice(qty)}</TableCell>
              <TableCell align="right">{fmtPrice(unitPrice)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtPrice(total)}</TableCell>
              <TableCell align="right" sx={{ color: 'text.secondary' }}>
                {item.vatRate != null ? `${item.vatRate}%` : '—'}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  </>
)

export const EkasaTable = ({ data }: { data: EkasaData }) => {
  const extra    = Object.entries(data).filter(([k, v]) => !KNOWN_KEYS.has(k) && v !== null && v !== undefined && v !== '')
  const items    = Array.isArray(data.items) ? (data.items as Item[]) : null
  const hasTotal = data.totalPrice != null || data.vatAmount != null

  return (
    <Stack sx={{ gap: 1 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 2, rowGap: 0.25 }}>
        {META_LABELS.map(([key, label]) =>
          data[key] != null && data[key] !== '' && data[key] !== false
            ? <MetaField key={key} label={label} value={key === 'paidByCard' ? 'Áno' : fmt(data[key])} />
            : null
        )}
        {extra.map(([key, val]) => <MetaField key={key} label={key} value={fmt(val)} />)}
      </Box>

      {items && items.length > 0 && <ItemsTable items={items} />}

      {hasTotal && (
        <>
          <Divider />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 12px', justifyContent: 'flex-end', alignItems: 'baseline' }}>
            {data.vatAmount != null && <>
              <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'right' }}>DPH:</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>{fmtPrice(data.vatAmount)} €</Typography>
            </>}
            {data.totalPrice != null && <>
              <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'right' }}>Spolu:</Typography>
              <Typography variant="body1" sx={{ fontWeight: 700, textAlign: 'right' }}>{Number(data.totalPrice).toFixed(2)} €</Typography>
            </>}
          </Box>
        </>
      )}
    </Stack>
  )
}
