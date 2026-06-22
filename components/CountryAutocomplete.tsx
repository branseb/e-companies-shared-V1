import { Autocomplete, Box, TextField } from '@mui/material'
import type { SxProps } from '@mui/material'
import type { CountryOption } from '../types'

const NEARBY_CODES = ['SK', 'CZ', 'AT', 'HU', 'PL', 'DE', 'UA']

type Props = {
    value: string
    allCountries: CountryOption[]
    onChange: (code: string) => void
    sx?: SxProps
}

const CountryAutocomplete = ({ value, allCountries, onChange, sx }: Props) => {
    const options = allCountries
    const selected = options.find(c => c.code === value) ?? null

    return (
        <Autocomplete
            size="small"
            sx={sx}
            options={options}
            value={selected}
            filterOptions={(opts, { inputValue: q }) => {
                if (!q.trim()) {
                    const nearby = NEARBY_CODES.map(code => opts.find(o => o.code === code)).filter((o): o is CountryOption => !!o)
                    const rest = opts.filter(o => !NEARBY_CODES.includes(o.code))
                    return [...nearby, ...rest]
                }
                const ql = q.toLowerCase()
                return opts.filter(o =>
                    o.label.toLowerCase().includes(ql) || o.code.toLowerCase().includes(ql)
                )
            }}
            getOptionLabel={opt => opt.label}
            isOptionEqualToValue={(opt, val) => opt.code === val.code}
            renderOption={(props, opt) => (
                <Box component="li" {...props} key={opt.code} sx={{ fontSize: 13, gap: 1 }}>
                    <Box component="span" sx={{ color: 'text.disabled', fontSize: 11, minWidth: 32 }}>
                        {opt.code}
                    </Box>
                    {opt.label}
                </Box>
            )}
            onChange={(_, newVal) => { if (newVal) onChange(newVal.code) }}
            renderInput={params => (
                <TextField
                    {...params}
                    label="Krajina"
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                />
            )}
        />
    )
}

export default CountryAutocomplete
