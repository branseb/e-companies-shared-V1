import { createTheme, type Theme } from '@mui/material'
export const createAppTheme = (mode: 'light' | 'dark'): Theme => {
    const thumb = mode === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)'
    const thumbHover = mode === 'dark' ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.34)'

    return createTheme({
        palette: {
            mode,

            primary: {
                main: '#8AB4F8',
                light: '#A8C7FA',
                dark: '#669DF6',
            },

            secondary: {
                main: '#6366F1',
            },

            ...(mode === 'light'
                ? {
                    background: {
                        default: '#F1F5F9',
                        paper: '#FFFFFF',
                    },
                }
                : {
                    background: {
                        default: '#0F1115',
                        paper: '#181B22',
                    },

                    text: {
                        primary: '#F3F4F6',
                        secondary: '#9CA3AF',
                    },

                    divider: '#2A3140',
                }),
        },

        shape: {
            borderRadius: 12,
        },

        typography: {
            fontFamily: "'Inter', 'Segoe UI', 'Roboto', sans-serif",

            h5: {
                fontWeight: 600,
            },

            h6: {
                fontWeight: 600,
            },

            subtitle1: {
                fontWeight: 500,
            },

            button: {
                textTransform: 'none',
                fontWeight: 500,
            },
        },

        components: {
            MuiCssBaseline: {
                styleOverrides: {
                    body: {
                        backgroundImage: 'none',
                    },

                    '*': {
                        scrollbarWidth: 'thin',
                        scrollbarColor: `${thumb} transparent`,
                    },

                    '*::-webkit-scrollbar': {
                        width: 6,
                        height: 6,
                    },

                    '*::-webkit-scrollbar-button': {
                        display: 'none',
                        height: 0,
                        width: 0,
                    },

                    '*::-webkit-scrollbar-track': {
                        background: 'transparent',
                    },

                    '*::-webkit-scrollbar-thumb': {
                        background: thumb,
                        borderRadius: 99,
                    },

                    '*::-webkit-scrollbar-thumb:hover': {
                        background: thumbHover,
                    },

                    'input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button':
                    {
                        display: 'none',
                    },

                    'input[type=number]': {
                        MozAppearance: 'textfield',
                    },

                    'input[type=time]::-webkit-calendar-picker-indicator, input[type=date]::-webkit-calendar-picker-indicator':
                    {
                        opacity: mode === 'dark' ? 0.6 : 0.7,
                        ...(mode === 'dark'
                            ? {
                                filter: 'invert(1)',
                            }
                            : {}),
                        cursor: 'pointer',
                    },
                },
            },

            MuiPaper: {
                defaultProps: {
                    elevation: 0,
                    variant: 'outlined',
                },

                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundImage: 'none',

                        ...(theme.palette.mode === 'dark' && {
                            borderColor: '#2A3140',
                        }),
                    }),
                },
            },

            MuiCard: {
                defaultProps: {
                    elevation: 0,
                    variant: 'outlined',
                },

                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 16,

                        ...(theme.palette.mode === 'dark' && {
                            backgroundColor: '#181B22',
                            borderColor: '#2A3140',
                        }),
                    }),
                },
            },

            MuiOutlinedInput: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        ...(theme.palette.mode === 'dark' && {
                            backgroundColor: '#20242D',

                            '& fieldset': {
                                borderColor: '#2A3140',
                            },

                            '&:hover fieldset': {
                                borderColor: '#3A4355',
                            },

                            '&.Mui-focused fieldset': {
                                borderColor: '#8AB4F8',
                                borderWidth: 2,
                            },
                        }),
                    }),
                },
            },

            MuiButton: {
                defaultProps: {
                    disableElevation: true,
                },

                styleOverrides: {
                    root: {
                        borderRadius: 10,
                    },
                },
            },

            MuiChip: {
                styleOverrides: {
                    root: {
                        borderRadius: 8,
                    },
                },
            },

            MuiDialog: {
                styleOverrides: {
                    paper: {
                        borderRadius: 18,
                    },
                },
            },

            MuiTableCell: {
                styleOverrides: {
                    head: {
                        fontWeight: 600,
                    },
                },
            },
        },
    })
}