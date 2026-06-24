import { IconButton, InputAdornment, Stack, TextField } from '@mui/material'
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material'
import type { SxProps, Theme } from '@mui/material'

type Props = {
    label?: string
    value: number | null
    onChange: (value: number | null) => void
    min?: number
    step?: number
    sx?: SxProps<Theme>
    size?: 'small' | 'medium'
    fullWidth?: boolean
}

const NumberField = ({ label, value, onChange, min = 0, step = 1, sx, size, fullWidth }: Props) => {
    const increment = () => onChange((value ?? 0) + step)
    const decrement = () => {
        const next = (value ?? 0) - step
        if (next < min) return
        onChange(next)
    }

    return (
        <TextField
            label={label}
            size={size}
            sx={sx}
            fullWidth={fullWidth}
            type="number"
            value={value ?? ''}
            slotProps={{
                inputLabel: { shrink: true },
                input: {
                    endAdornment: (
                        <InputAdornment position="end" sx={{ mr: -1.5 }}>
                            <Stack direction="column">
                                <IconButton size="small" tabIndex={-1} onClick={increment}
                                    sx={{ p: 0.25, borderRadius: 1 }}>
                                    <KeyboardArrowUp sx={{ fontSize: 18 }} />
                                </IconButton>
                                <IconButton size="small" tabIndex={-1} onClick={decrement}
                                    sx={{ p: 0.25, borderRadius: 1 }}>
                                    <KeyboardArrowDown sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Stack>
                        </InputAdornment>
                    ),
                    sx: {
                        'input::-webkit-inner-spin-button, input::-webkit-outer-spin-button': { display: 'none' },
                        'input[type=number]': { MozAppearance: 'textfield' },
                    },
                },
            }}
            onChange={e => {
                if (e.target.value === '') { onChange(null); return }
                const n = Number(e.target.value)
                onChange(n < min ? min : n)
            }}
        />
    )
}

export default NumberField
