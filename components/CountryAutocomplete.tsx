import { useEffect, useState } from 'react'
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
    const found = allCountries.find(c => c.code === value) ?? null
    const [inputValue, setInputValue] = useState(found?.label ?? value ?? '')

    useEffect(() => {
        const f = allCountries.find(c => c.code === value)
        setInputValue(f?.label ?? value ?? '')
    }, [value, allCountries])

    const commit = (raw: string) => {
        if (!raw) return
        const match = allCountries.find(c =>
            c.label.toLowerCase() === raw.toLowerCase() ||
            c.code.toLowerCase() === raw.toLowerCase()
        )
        const next = match ? match.code : raw
        if (next !== value) onChange(next)
    }

    return (
        <Autocomplete
            freeSolo
            size="small"
            sx={sx}
            options={allCountries}
            value={found ?? value ?? null}
            inputValue={inputValue}
            onInputChange={(_, v) => setInputValue(v)}
            filterOptions={(options, { inputValue: q }) => {
                const visible = options.filter(o => o.code !== 'OTHER')
                if (!q.trim()) {
                    const nearby = NEARBY_CODES.map(code => visible.find(o => o.code === code)).filter((o): o is CountryOption => !!o)
                    const rest = visible.filter(o => !NEARBY_CODES.includes(o.code))
                    return [...nearby, ...rest]
                }
                const ql = q.toLowerCase()
                return visible.filter(o =>
                    o.label.toLowerCase().includes(ql) || o.code.toLowerCase().includes(ql)
                )
            }}
            getOptionLabel={opt => typeof opt === 'string' ? opt : opt.label}
            isOptionEqualToValue={(opt, val) =>
                typeof val === 'string' ? opt.code === val || opt.label === val : opt.code === val.code
            }
            renderOption={(props, opt) => (
                <Box component="li" {...props} key={opt.code} sx={{ fontSize: 13, gap: 1 }}>
                    <Box component="span" sx={{ color: 'text.disabled', fontSize: 11, minWidth: 32 }}>
                        {opt.code}
                    </Box>
                    {opt.label}
                </Box>
            )}
            onChange={(_, newVal) => {
                if (!newVal) return
                if (typeof newVal === 'string') commit(newVal)
                else onChange(newVal.code)
            }}
            renderInput={params => (
                <TextField
                    {...params}
                    label="Krajina"
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                    onBlur={() => commit(inputValue)}
                />
            )}
        />
    )
}

export default CountryAutocomplete
