import { Button, Stack, Tooltip } from '@mui/material';
import { useState } from 'react';
import { useDataProvider, useNotify, useRecordContext, useRefresh } from 'react-admin';
import type { LibraryDataProvider } from '../dataProvider';
import { euros, useIsAdmin } from './common';

type Action = 'returnLoan' | 'renewLoan' | 'markLoanLost' | 'settleFine' | 'waiveFine';

const LABELS: Record<Action, string> = {
  returnLoan: 'Return',
  renewLoan: 'Renew',
  markLoanLost: 'Mark lost',
  settleFine: 'Fine paid',
  waiveFine: 'Waive fine',
};

/**
 * Status-transition buttons for one loan. Buttons only appear when the
 * transition is possible, and Renew is disabled with the API's own reason
 * (renewBlockReason) when the rules forbid it.
 */
export const LoanActions = ({ compact = false }: { compact?: boolean }) => {
  const loan = useRecordContext<any>();
  const dp = useDataProvider<LibraryDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const isAdmin = useIsAdmin();
  const [busy, setBusy] = useState<Action | null>(null);
  if (!loan) return null;

  const act = async (action: Action, e: React.MouseEvent) => {
    e.stopPropagation();
    if (action === 'markLoanLost' && !window.confirm('Mark this copy as lost? The member is charged the replacement cost.')) return;
    setBusy(action);
    try {
      const updated: any = await dp.loanAction(action, loan.id);
      const extra = action === 'returnLoan' && updated.fineCents > 0 ? ` — late fee ${euros(updated.fineCents)}` : '';
      notify(`Loan #${loan.id}: ${LABELS[action].toLowerCase()} done${extra}`, { type: 'success' });
      refresh();
    } catch (err: any) {
      notify(err.message, { type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const size = 'small' as const;
  const hasOpenFine = loan.fineCents > 0 && !loan.finePaid;
  return (
    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()} flexWrap="wrap">
      {loan.status === 'ACTIVE' && (
        <>
          <Button size={size} variant="contained" disabled={!!busy} onClick={(e) => act('returnLoan', e)}>
            {LABELS.returnLoan}
          </Button>
          <Tooltip title={loan.renewBlockReason ?? 'Extend the due date by 14 days'}>
            <span>
              <Button size={size} variant="outlined" disabled={!!busy || !!loan.renewBlockReason} onClick={(e) => act('renewLoan', e)}>
                {LABELS.renewLoan}
              </Button>
            </span>
          </Tooltip>
          {!compact && (
            <Button size={size} color="warning" disabled={!!busy} onClick={(e) => act('markLoanLost', e)}>
              {LABELS.markLoanLost}
            </Button>
          )}
        </>
      )}
      {hasOpenFine && (
        <Button size={size} color="success" disabled={!!busy} onClick={(e) => act('settleFine', e)}>
          {LABELS.settleFine}
        </Button>
      )}
      {hasOpenFine && isAdmin && !compact && (
        <Button size={size} color="secondary" disabled={!!busy} onClick={(e) => act('waiveFine', e)}>
          {LABELS.waiveFine}
        </Button>
      )}
    </Stack>
  );
};
