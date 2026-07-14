import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'

type ConfirmDialogProps = {
    open: boolean
    title?: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    onConfirm: () => void
    onCancel: () => void
}

const ConfirmDialog = ({
    open, title, message, confirmLabel = 'Potvrdiť', cancelLabel = 'Zrušiť', danger, onConfirm, onCancel,
}: ConfirmDialogProps) => (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
        {title && <DialogTitle>{title}</DialogTitle>}
        <DialogContent>
            <Typography variant="body2">{message}</Typography>
        </DialogContent>
        <DialogActions>
            <Button onClick={onCancel}>{cancelLabel}</Button>
            <Button onClick={onConfirm} variant="contained" color={danger ? 'error' : 'primary'} autoFocus>
                {confirmLabel}
            </Button>
        </DialogActions>
    </Dialog>
)

export default ConfirmDialog
