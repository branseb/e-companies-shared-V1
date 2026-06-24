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

const getLabel = (o: CountryOption) =>
    o.currency !== 'EUR' ? `${o.label} (${o.currency})` : o.label

const CountryAutocomplete = ({ value, allCountries, onChange, sx, size = 'small' }: Props) => {
    const found = allCountries.find(c => c.code === value)
    const synth: CountryOption | undefined = !found && value
        ? { code: value, label: value, currency: 'EUR', borderPrefix: '' }
        : undefined
    const options = synth ? [synth, ...allCountries] : allCountries
    const selected = found ?? synth ?? undefined

    return (
        <Autocomplete
            disableClearable
            size={size}
            sx={sx}
            options={options}
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
            isOptionEqualToValue={(opt, val) => opt.code === val.code}
            noOptionsText="Krajina nie je v zozname"
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
                if (newVal) onChange(newVal.code)
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
