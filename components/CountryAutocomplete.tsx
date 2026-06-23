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

const CountryAutocomplete = ({ value, allCountries, onChange, sx, size = 'small' }: Props) => {
    const selected = allCountries.find(c => c.code === value) ?? null

    return (
        <Autocomplete
            size={size}
            sx={sx}
            options={allCountries}
            value={selected}
            filterOptions={(opts, { inputValue: q }) => {
                if (!q.trim()) return opts
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
                    size={size}
                    slotProps={{ inputLabel: { shrink: true } }}
                />
            )}
        />
    )
}

export default CountryAutocomplete
