import { Autocomplete, Box, TextField } from '@mui/material'
import type { SxProps } from '@mui/material'
import type { CountryOption } from '../types'

type Props = {
    value: string
    allCountries: CountryOption[]
    onChange: (code: string) => void
    sx?: SxProps
    size?: 'small' | 'medium'
}

const getLabel = (o: CountryOption | string) =>
    typeof o === 'string' ? o : (o.currency !== 'EUR' ? `${o.label} (${o.currency})` : o.label)

const CountryAutocomplete = ({ value, allCountries, onChange, sx, size = 'small' }: Props) => {
    const selected = allCountries.find(c => c.code === value) ?? value

    return (
        <Autocomplete
            freeSolo
            disableClearable
            size={size}
            sx={sx}
            options={allCountries}
            value={selected}
            getOptionLabel={getLabel}
            filterOptions={(opts, { inputValue: q }) => {
                if (!q.trim()) return opts
                const ql = q.toLowerCase()
                return opts.filter(o =>
                    o.label.toLowerCase().includes(ql) ||
                    o.code.toLowerCase().includes(ql) ||
                    o.currency.toLowerCase().includes(ql)
                )
            }}
            isOptionEqualToValue={(opt, val) =>
                typeof val === 'string' ? opt.code === val : opt.code === val.code
            }
            noOptionsText="Krajina nie je v zozname — zadajte kód ručne (napr. JP)"
            renderOption={(props, opt) => (
                <Box component="li" {...props} key={opt.code} sx={{ fontSize: 13, gap: 1, display: 'flex', alignItems: 'center' }}>
                    <Box component="span" sx={{ color: 'text.disabled', fontSize: 11, minWidth: 32, flexShrink: 0 }}>
                        {opt.code}
                    </Box>
                    <Box component="span" sx={{ flex: 1 }}>{opt.label}</Box>
                    {opt.currency !== 'EUR' && (
                        <Box component="span" sx={{ color: 'text.secondary', fontSize: 11, ml: 1 }}>
                            {opt.currency}
                        </Box>
                    )}
                </Box>
            )}
            onChange={(_, newVal) => {
                if (!newVal) return
                if (typeof newVal === 'string') {
                    const code = newVal.trim().toUpperCase().slice(0, 10)
                    if (code) onChange(code)
                } else {
                    onChange(newVal.code)
                }
            }}
            onInputChange={(_, _val, reason) => {
                if (reason === 'clear') onChange('SK')
            }}
            renderInput={params => (
                <TextField
                    {...params}
                    label="Krajina"
                    size={size}
                    slotProps={{ inputLabel: { shrink: true } }}
                />
            )}
        />
    )
}

export default CountryAutocomplete
