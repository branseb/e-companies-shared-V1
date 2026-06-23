import { createTheme, type Theme } from '@mui/material'

export const createAppTheme = (mode: 'light' | 'dark'): Theme =>
    createTheme({
        palette: {
            mode,
            primary:   { main: '#1c5fa3', light: '#4D8DC8', dark: '#0D3E6E' },
            secondary: { main: '#6366F1' },
            ...(mode === 'light'
                ? { background: { default: '#F1F5F9', paper: '#FFFFFF' } }
                : { background: { default: '#0F172A', paper: '#1E293B' } }
            ),
        },
        shape: { borderRadius: 10 },
        typography: {
            fontFamily: "'Inter', 'Segoe UI', 'Roboto', sans-serif",
            h5: { fontWeight: 600 },
            h6: { fontWeight: 600 },
            subtitle1: { fontWeight: 500 },
            button: { textTransform: 'none', fontWeight: 500 },
        },
        components: {
            MuiPaper: {
                defaultProps: { elevation: 0, variant: 'outlined' },
                styleOverrides: { root: { backgroundImage: 'none' } },
            },
            MuiButton: {
                defaultProps: { disableElevation: true },
                styleOverrides: { root: { borderRadius: 8 } },
            },
            MuiChip: {
                styleOverrides: { root: { borderRadius: 6 } },
            },
            MuiDialog: {
                styleOverrides: { paper: { borderRadius: 14 } },
            },
            MuiCard: {
                defaultProps: { elevation: 0, variant: 'outlined' },
                styleOverrides: { root: { borderRadius: 12 } },
            },
            MuiTableCell: {
                styleOverrides: { head: { fontWeight: 600 } },
            },
        },
    })
