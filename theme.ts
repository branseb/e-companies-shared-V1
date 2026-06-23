import { createTheme, type Theme } from '@mui/material'

export const createAppTheme = (mode: 'light' | 'dark'): Theme => {
    const thumb      = mode === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)'
    const thumbHover = mode === 'dark' ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.34)'

    return createTheme({
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
            MuiCssBaseline: {
                styleOverrides: {
                    '*': { scrollbarWidth: 'thin', scrollbarColor: `${thumb} transparent` },
                    '*::-webkit-scrollbar': { width: 6, height: 6 },
                    '*::-webkit-scrollbar-button': { display: 'none', height: 0, width: 0 },
                    '*::-webkit-scrollbar-track': { background: 'transparent' },
                    '*::-webkit-scrollbar-thumb': { background: thumb, borderRadius: 99 },
                    '*::-webkit-scrollbar-thumb:hover': { background: thumbHover },
                    'input[type=number]': { MozAppearance: 'textfield' },
                    'input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none' },
                    'input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none' },
                },
            },
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
}
