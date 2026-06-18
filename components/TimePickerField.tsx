import { TextField, useMediaQuery } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { MobileTimePicker } from '@mui/x-date-pickers/MobileTimePicker'
import dayjs from 'dayjs'
import type { SxProps, Theme } from '@mui/material'

type Props = {
    label: string
    value: string
    onChange: (value: string) => void
    sx?: SxProps<Theme>
    size?: 'small' | 'medium'
}

const TimePickerField = ({ label, value, onChange, sx, size }: Props) => {
    const isMobile = useMediaQuery('(pointer: coarse)')

    if (!isMobile) {
        return (
            <TextField
                label={label}
                type="time"
                size={size ?? 'medium'}
                sx={sx}
                slotProps={{ inputLabel: { shrink: true } }}
                value={value}
                onChange={e => onChange(e.target.value)}
            />
        )
    }

    const parsed = value ? dayjs(`2000-01-01T${value}`) : null

    return (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
            <MobileTimePicker
                label={label}
                value={parsed}
                onChange={newVal => {
                    if (newVal?.isValid()) onChange(newVal.format('HH:mm'))
                    else onChange('')
                }}
                ampm={false}
                slotProps={{
                    textField: {
                        size: size ?? 'medium',
                        sx,
                        slotProps: { inputLabel: { shrink: true } },
                    },
                    dialog: {
                        fullScreen: true,
                        sx: { zIndex: 1600, '& .MuiDialog-paper': { paddingTop: '48px' } },
                    },
                }}
            />
        </LocalizationProvider>
    )
}

export default TimePickerField
