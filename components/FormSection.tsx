import { Box, Divider, Typography } from '@mui/material'

const FormSection = ({ title }: { title: string }) => (
    <Box>
        <Divider sx={{ mb: 1 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {title}
        </Typography>
    </Box>
)

export default FormSection
