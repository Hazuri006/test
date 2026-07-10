'use client';

import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent } from './dialog';
import { Button } from './button';
import { Textarea } from './input';
import { useT } from '@/lib/i18n';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Demande un motif obligatoire (actions administratives). */
  withReason?: boolean;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: (reason?: string) => void | Promise<void>;
  children?: ReactNode;
}

/** Confirmation avant action destructrice, avec motif optionnel. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  withReason,
  destructive,
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  const t = useT();
  const [reason, setReason] = useState('');
  const canConfirm = !withReason || reason.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        {withReason && (
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`${t.common.reason} (${t.common.required})`}
            aria-label={t.common.reason}
            className="mb-4"
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'default'}
            disabled={!canConfirm}
            loading={loading}
            onClick={async () => {
              await onConfirm(withReason ? reason.trim() : undefined);
              setReason('');
            }}
          >
            {t.common.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
